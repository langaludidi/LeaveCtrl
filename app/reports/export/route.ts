import { dateInTimeZone, getCurrentContext } from "@/lib/current-context";
import { reportCsv, reportReference } from "@/lib/report-export";

export async function GET() {
  const { supabase, employee, accessState, roles: membershipRoles } = await getCurrentContext({ requireEmployee: false });
  const organisationId = accessState.organisation_id;
  const { data: organisation } = await supabase.from("organisations").select("name, timezone").eq("id", organisationId).maybeSingle();
  const roles = membershipRoles;
  const adminScope = roles.some((role) => ["org_admin", "hr_admin", "reporter", "auditor"].includes(role));
  const managerScope = roles.includes("manager") && !adminScope;
  const canViewLiability = roles.some((role) => ["org_admin", "hr_admin", "reporter"].includes(role));

  const [{ data: allPeople, error: peopleError }, { data: departments, error: departmentError }, { data: annualType, error: annualTypeError }, { data: currentConditions, error: conditionsError }] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, department_id, manager_employee_id").eq("organisation_id", organisationId).eq("employment_status", "active").order("first_name"),
    supabase.from("departments").select("id, name").eq("organisation_id", organisationId),
    supabase.from("leave_types").select("id").eq("organisation_id", organisationId).eq("code", "ANNUAL").maybeSingle(),
    supabase.from("employee_current_conditions").select("employee_id, department_id, manager_employee_id").eq("organisation_id", organisationId),
  ]);

  if (peopleError || departmentError || annualTypeError || conditionsError) return new Response("Report source data unavailable", { status: 500 });
  const conditionMap = new Map((currentConditions ?? []).map((row) => [row.employee_id, row]));
  const people = adminScope ? allPeople ?? [] : managerScope ? (allPeople ?? []).filter((person) => {
    if (person.id === employee?.id) return true;
    const condition = conditionMap.get(person.id);
    return (condition?.manager_employee_id ?? person.manager_employee_id) === employee?.id;
  }) : (allPeople ?? []).filter((person) => person.id === employee?.id);

  const employeeIds = people.map((person) => person.id);
  const today = dateInTimeZone(new Date(), organisation?.timezone ?? "UTC");
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [{ data: balances, error: balancesError }, { data: requests, error: requestsError }, { data: toilBalances, error: toilError }, remunerationResult, liabilityRateResult] = employeeIds.length
    ? await Promise.all([
        supabase.from("leave_balances").select("employee_id, available_balance").in("employee_id", employeeIds).eq("leave_type_id", annualType?.id ?? "00000000-0000-0000-0000-000000000000"),
        supabase.from("leave_requests").select("id, employee_id, quantity, status, start_date").in("employee_id", employeeIds).gte("start_date", yearStart).lte("start_date", today),
        supabase.from("toil_balances").select("employee_id, available_hours").in("employee_id", employeeIds),
        canViewLiability ? supabase.from("employee_remuneration_history").select("employee_id, gross_amount, pay_frequency, currency_code, effective_from, effective_to").in("employee_id", employeeIds).lte("effective_from", today).order("effective_from", { ascending: false }) : Promise.resolve({ data: [] }),
        canViewLiability ? supabase.from("employee_leave_liability_rates").select("employee_id, currency_code, base_daily_rate, variable_earnings_total, averaging_weeks, scheduled_days, variable_daily_rate, effective_daily_rate, liability_calculation_method").in("employee_id", employeeIds) : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  if (balancesError || requestsError || toilError || ("error" in remunerationResult && remunerationResult.error) || ("error" in liabilityRateResult && liabilityRateResult.error)) return new Response("Report source data unavailable", { status: 500 });
  // Liability requires approved leave scheduled after the reporting date, even
  // when its request starts in a future calendar period.
  const futureApprovedResult = canViewLiability && employeeIds.length
    ? await supabase.from("leave_requests")
        .select("id, employee_id, quantity, status, start_date")
        .in("employee_id", employeeIds)
        .gt("start_date", today)
        .in("status", ["approved", "cancellation_requested"])
    : { data: [] };
  if ("error" in futureApprovedResult && futureApprovedResult.error) return new Response("Future approved leave unavailable", { status: 500 });
  const liabilityRequests = [...(requests ?? []), ...(futureApprovedResult.data ?? [])];
  const requestIds = liabilityRequests.map((request) => request.id);
  const futureDaysResult = requestIds.length && canViewLiability
    ? await supabase.from("leave_request_days").select("request_id, leave_date, chargeable_quantity").in("request_id", requestIds).gt("leave_date", today)
    : { data: [] };

  const futureRequestDays = futureDaysResult.data;
  if ("error" in futureDaysResult && futureDaysResult.error) return new Response("Report source data unavailable", { status: 500 });
  const departmentMap = new Map((departments ?? []).map((department) => [department.id, department.name]));
  const currentDepartmentMap = new Map((currentConditions ?? []).map((row) => [row.employee_id, row.department_id]));
  const balanceMap = new Map((balances ?? []).map((row) => [row.employee_id, Number(row.available_balance ?? 0)]));
  const toilMap = new Map((toilBalances ?? []).map((row) => [row.employee_id, Number(row.available_hours ?? 0)]));
  const requestMap = new Map(liabilityRequests.map((request) => [request.id, request]));
  const approvedMap = new Map<string, number>();
  const pendingMap = new Map<string, number>();
  const futureApprovedMap = new Map<string, number>();

  for (const request of requests ?? []) {
    if (["approved", "cancellation_requested"].includes(request.status)) approvedMap.set(request.employee_id, (approvedMap.get(request.employee_id) ?? 0) + Number(request.quantity));
    if (request.status === "pending_approval") pendingMap.set(request.employee_id, (pendingMap.get(request.employee_id) ?? 0) + Number(request.quantity));
  }
  for (const day of futureRequestDays ?? []) {
    const request = requestMap.get(day.request_id);
    if (!request || !["approved", "cancellation_requested"].includes(request.status)) continue;
    futureApprovedMap.set(request.employee_id, (futureApprovedMap.get(request.employee_id) ?? 0) + Number(day.chargeable_quantity ?? 0));
  }

  const remunerationMap = new Map<string, NonNullable<typeof remunerationResult.data>[number]>();
  for (const row of remunerationResult.data ?? []) if (!remunerationMap.has(row.employee_id) && (!row.effective_to || row.effective_to >= today)) remunerationMap.set(row.employee_id, row);
  const liabilityRateMap = new Map((liabilityRateResult.data ?? []).map((row) => [row.employee_id, row]));

  const header = ["Employee", "Department", "Annual Leave Available", "Approved Leave This Year", "Pending Leave", "TOIL Available Hours", ...(canViewLiability ? ["Liability Days", "Remuneration Basis", "Base Daily Rate", "Variable Earnings in Averaging Window", "Variable Daily Rate", "Effective Daily Rate", "Estimated Leave Liability", "Liability Calculation"] : [])];
  const rows = people.map((person) => {
    const departmentId = currentDepartmentMap.get(person.id) ?? person.department_id;
    const balance = balanceMap.get(person.id) ?? 0;
    const pending = pendingMap.get(person.id) ?? 0;
    const liabilityDays = Math.max(0, balance + pending + (futureApprovedMap.get(person.id) ?? 0));
    const remuneration = remunerationMap.get(person.id);
    const rate = liabilityRateMap.get(person.id);
    const effectiveRate = rate ? Number(rate.effective_daily_rate ?? 0) : 0;
    const liability = rate ? liabilityDays * effectiveRate : 0;
    return [`${person.first_name} ${person.last_name}`, departmentId ? departmentMap.get(departmentId) ?? "" : "", balance, approvedMap.get(person.id) ?? 0, pending, toilMap.get(person.id) ?? 0, ...(canViewLiability ? [liabilityDays, remuneration ? `${remuneration.gross_amount} ${remuneration.currency_code} / ${remuneration.pay_frequency}` : "", rate ? Number(rate.base_daily_rate ?? 0) : 0, rate ? Number(rate.variable_earnings_total ?? 0) : 0, rate ? Number(rate.variable_daily_rate ?? 0) : 0, effectiveRate, liability, rate?.liability_calculation_method ?? ""] : [])];
  });

  // Organisation-wide exports are privileged disclosure events. Record them before
  // releasing the CSV so an audit failure cannot silently produce an unaudited file.
  const { error: auditError } = await supabase.rpc("record_organisation_data_export", { p_format: "csv" });
  if (auditError) return new Response("Unable to record export audit event", { status: 500 });

  const generatedAt = new Date().toISOString();
  const reference = reportReference(generatedAt, crypto.randomUUID());
  const csv = reportCsv({
    reportTitle: "Employee Leave Balance and Liability",
    organisationName: organisation?.name ?? "Organisation",
    periodStart: yearStart,
    periodEnd: today,
    generatedAt,
    reference,
    dataCutoff: today,
    classification: canViewLiability ? "Confidential" : "Internal",
    filters: { Scope: adminScope ? "Organisation" : managerScope ? "Team" : "Employee" },
  }, header, rows);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leavectrl-report-${today}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
