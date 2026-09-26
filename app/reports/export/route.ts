import { dateInTimeZone } from "@/lib/current-context";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Authentication required", { status: 401 });

  const { data: employee } = await supabase.from("employees").select("id, organisation_id").eq("user_id", user.id).eq("employment_status", "active").maybeSingle();
  if (!employee) return new Response("Employee profile required", { status: 403 });

  const [{ data: memberships }, { data: organisation }] = await Promise.all([
    supabase.from("organisation_memberships").select("role").eq("organisation_id", employee.organisation_id).eq("user_id", user.id).eq("is_active", true),
    supabase.from("organisations").select("timezone").eq("id", employee.organisation_id).maybeSingle(),
  ]);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  const adminScope = roles.some((role) => ["org_admin", "hr_admin", "reporter", "auditor"].includes(role));
  const managerScope = roles.includes("manager") && !adminScope;
  const canViewLiability = roles.some((role) => ["org_admin", "hr_admin", "reporter"].includes(role));
  const shouldAuditOrganisationExport = roles.some((role) => ["org_admin", "hr_admin"].includes(role));

  const [{ data: allPeople }, { data: departments }, { data: annualType }, { data: currentConditions }] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, department_id, manager_employee_id").eq("organisation_id", employee.organisation_id).eq("employment_status", "active").order("first_name"),
    supabase.from("departments").select("id, name").eq("organisation_id", employee.organisation_id),
    supabase.from("leave_types").select("id").eq("organisation_id", employee.organisation_id).eq("code", "ANNUAL").maybeSingle(),
    supabase.from("employee_current_conditions").select("employee_id, department_id, manager_employee_id").eq("organisation_id", employee.organisation_id),
  ]);

  const conditionMap = new Map((currentConditions ?? []).map((row) => [row.employee_id, row]));
  const people = adminScope ? allPeople ?? [] : managerScope ? (allPeople ?? []).filter((person) => {
    if (person.id === employee.id) return true;
    const condition = conditionMap.get(person.id);
    return (condition?.manager_employee_id ?? person.manager_employee_id) === employee.id;
  }) : (allPeople ?? []).filter((person) => person.id === employee.id);

  const employeeIds = people.map((person) => person.id);
  const today = dateInTimeZone(new Date(), organisation?.timezone ?? "UTC");
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [{ data: balances }, { data: requests }, { data: toilBalances }, remunerationResult, liabilityRateResult] = employeeIds.length
    ? await Promise.all([
        supabase.from("leave_balances").select("employee_id, available_balance").in("employee_id", employeeIds).eq("leave_type_id", annualType?.id ?? "00000000-0000-0000-0000-000000000000"),
        supabase.from("leave_requests").select("id, employee_id, quantity, status, start_date").in("employee_id", employeeIds).gte("start_date", yearStart),
        supabase.from("toil_balances").select("employee_id, available_hours").in("employee_id", employeeIds),
        canViewLiability ? supabase.from("employee_remuneration_history").select("employee_id, gross_amount, pay_frequency, currency_code, effective_from, effective_to").in("employee_id", employeeIds).lte("effective_from", today).order("effective_from", { ascending: false }) : Promise.resolve({ data: [] }),
        canViewLiability ? supabase.from("employee_leave_liability_rates").select("employee_id, currency_code, base_daily_rate, variable_earnings_total, averaging_weeks, scheduled_days, variable_daily_rate, effective_daily_rate, liability_calculation_method").in("employee_id", employeeIds) : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const requestIds = (requests ?? []).map((request) => request.id);
  const { data: futureRequestDays } = requestIds.length && canViewLiability
    ? await supabase.from("leave_request_days").select("request_id, leave_date, chargeable_quantity").in("request_id", requestIds).gt("leave_date", today)
    : { data: [] };

  const departmentMap = new Map((departments ?? []).map((department) => [department.id, department.name]));
  const currentDepartmentMap = new Map((currentConditions ?? []).map((row) => [row.employee_id, row.department_id]));
  const balanceMap = new Map((balances ?? []).map((row) => [row.employee_id, Number(row.available_balance ?? 0)]));
  const toilMap = new Map((toilBalances ?? []).map((row) => [row.employee_id, Number(row.available_hours ?? 0)]));
  const requestMap = new Map((requests ?? []).map((request) => [request.id, request]));
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
  if (shouldAuditOrganisationExport) {
    const { error: auditError } = await supabase.rpc("record_organisation_data_export", { p_format: "csv" });
    if (auditError) return new Response("Unable to record export audit event", { status: 500 });
  }

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leavectrl-report-${today}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
