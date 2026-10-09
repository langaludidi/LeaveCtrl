import { getCurrentContext } from "@/lib/current-context";
import { reportCsv, reportReference } from "@/lib/report-export";

const PAGE_SIZE = 500;
const MAX_ROWS = 10000;

export async function GET(request: Request) {
  try {
    const { supabase, employee, accessState, roles, businessDate } = await getCurrentContext({ requireEmployee: false });
    const params = new URL(request.url).searchParams;
    const currentYear = Number(businessDate.slice(0, 4));
    const requestedYear = Number(params.get("year"));
    if (!Number.isInteger(requestedYear) || requestedYear < currentYear - 5 || requestedYear > currentYear) {
      return new Response("Invalid reporting year", { status: 400 });
    }
    const yearStart = `${requestedYear}-01-01`;
    const yearEnd = requestedYear === currentYear ? businessDate : `${requestedYear}-12-31`;
    const { data: organisation, error: organisationError } = await supabase.from("organisations").select("name").eq("id", accessState.organisation_id).single();
    if (organisationError) return new Response("Organisation unavailable", { status: 500 });
    const { data: employees, error: employeesError } = await supabase.from("employees")
      .select("id, first_name, last_name, manager_employee_id, employment_status")
      .eq("organisation_id", accessState.organisation_id);
    const { data: conditions, error: conditionsError } = await supabase.from("employee_current_conditions")
      .select("employee_id, manager_employee_id").eq("organisation_id", accessState.organisation_id);
    const { data: leaveTypes, error: typesError } = await supabase.from("leave_types")
      .select("id, name").eq("organisation_id", accessState.organisation_id);
    if (employeesError || conditionsError || typesError) return new Response("Report data unavailable", { status: 500 });
    const adminScope = roles.some((role) => ["org_admin", "hr_admin", "reporter", "auditor"].includes(role));
    const managerScope = roles.includes("manager") && !adminScope;
    const managerByEmployee = new Map((conditions ?? []).map((row) => [row.employee_id, row.manager_employee_id]));
    const scopedEmployees = (employees ?? []).filter((person) => adminScope ||
      (managerScope ? person.id === employee?.id || (person.employment_status === "active" && (managerByEmployee.get(person.id) ?? person.manager_employee_id) === employee?.id) : person.id === employee?.id));
    const employeeName = (params.get("employee") ?? "").trim().toLocaleLowerCase();
    if (employeeName.length > 120) return new Response("Employee filter too long", { status: 400 });
    const ids = scopedEmployees.filter((person) => !employeeName || `${person.first_name} ${person.last_name}`.toLocaleLowerCase().includes(employeeName)).map((person) => person.id);
    const employeeMap = new Map(scopedEmployees.map((person) => [person.id, `${person.first_name} ${person.last_name}`]));
    const typeMap = new Map((leaveTypes ?? []).map((type) => [type.id, type.name]));
    const status = params.get("status") ?? "";
    const allowedStatuses = ["submitted", "approved", "declined", "withdrawn", "draft", "pending_approval", "cancellation_requested", "cancelled"] as const;
    if (status && !allowedStatuses.some((value) => value === status)) return new Response("Invalid status", { status: 400 });
    const leaveType = params.get("leaveType") ?? "";
    if (leaveType && !(leaveTypes ?? []).some((type) => type.id === leaveType)) return new Response("Invalid leave type", { status: 400 });
    const from = params.get("from") || yearStart;
    const to = params.get("to") || yearEnd;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from < yearStart || to > yearEnd || from > to) {
      return new Response("Invalid date range", { status: 400 });
    }
    const rows: Array<{employee_id:string;leave_type_id:string;start_date:string;end_date:string;quantity:number;status:string}> = [];
    let expectedRows = 0;
    let lastSeenStartDate: string | null = null;
    if (ids.length) {
      for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
        let query = supabase.from("leave_requests")
          .select("employee_id, leave_type_id, start_date, end_date, quantity, status", { count: "exact" })
          .in("employee_id", ids).gte("start_date", from).lte("start_date", to)
          .order("start_date", { ascending: false }).order("id", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (status) query = query.eq("status", status as typeof allowedStatuses[number]);
        if (leaveType) query = query.eq("leave_type_id", leaveType);
        const { data, error, count } = await query;
        if (offset === 0) {
          if (count === null) return new Response("Unable to verify export completeness", { status: 500 });
          expectedRows = count;
          if (expectedRows > MAX_ROWS) return new Response("Report exceeds 10,000 rows; narrow the filters", { status: 413 });
        }
        if (error) return new Response("Unable to retrieve full report", { status: 500 });
        if (!data?.length) break;
        // Verify stable descending date order across pages; fail closed on anomalies.
        if (lastSeenStartDate !== null && data[0].start_date > lastSeenStartDate) return new Response("Export changed during retrieval; retry", { status: 503 });
        for (let i = 1; i < data.length; i++) {
          if (data[i].start_date > data[i - 1].start_date) return new Response("Export ordering inconsistent; retry", { status: 503 });
        }
        lastSeenStartDate = data[data.length - 1].start_date;
        rows.push(...data);
        if (rows.length > MAX_ROWS) return new Response("Report exceeds 10,000 rows; narrow the filters", { status: 413 });
        if (data.length < PAGE_SIZE) break;
      }
    }
    if (rows.length !== expectedRows) return new Response("Incomplete export data; retry or narrow the filters", { status: 503 });
    const output = rows.map((row) => [employeeMap.get(row.employee_id) ?? "Employee", typeMap.get(row.leave_type_id) ?? "Leave", row.start_date, row.end_date, Number(row.quantity ?? 0), row.status]);
    const { error: auditError } = await supabase.rpc("record_organisation_data_export", { p_format: "csv" });
    if (auditError) return new Response("Unable to record export audit event", { status: 500 });
    const generatedAt = new Date().toISOString();
    const csv = reportCsv({
      reportTitle: "Leave Request History", organisationName: organisation?.name ?? "Organisation",
      periodStart: from, periodEnd: to, generatedAt,
      reference: reportReference(generatedAt, crypto.randomUUID()), classification: "Confidential",
      dataCutoff: businessDate, filters: { Status: status || "All", "Leave type": leaveType || "All", Employee: employeeName || "All" },
    }, ["Employee", "Leave type", "Start", "End", "Days requested", "Status"], output);
    return new Response(csv, { status: 200, headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leavectrl-history-${requestedYear}.csv"`,
      "Cache-Control": "no-store",
    } });
  } catch {
    return new Response("Authentication required or report unavailable", { status: 401 });
  }
}
