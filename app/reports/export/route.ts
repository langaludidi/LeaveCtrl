import { createClient } from "@/lib/supabase/server";

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Authentication required", { status: 401 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, organisation_id")
    .eq("user_id", user.id)
    .eq("employment_status", "active")
    .maybeSingle();

  if (!employee) {
    return new Response("Employee profile required", { status: 403 });
  }

  const { data: memberships } = await supabase
    .from("organisation_memberships")
    .select("role")
    .eq("organisation_id", employee.organisation_id)
    .eq("user_id", user.id)
    .eq("is_active", true);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  const adminScope = roles.some((role) =>
    ["org_admin", "hr_admin", "reporter", "auditor"].includes(role)
  );
  const managerScope = roles.includes("manager") && !adminScope;

  let peopleQuery = supabase
    .from("employees")
    .select("id, first_name, last_name, department_id")
    .eq("organisation_id", employee.organisation_id)
    .eq("employment_status", "active")
    .order("first_name");

  if (managerScope) {
    peopleQuery = peopleQuery.or(
      `id.eq.${employee.id},manager_employee_id.eq.${employee.id}`
    );
  } else if (!adminScope) {
    peopleQuery = peopleQuery.eq("id", employee.id);
  }

  const [{ data: people }, { data: departments }, { data: annualType }] =
    await Promise.all([
      peopleQuery,
      supabase
        .from("departments")
        .select("id, name")
        .eq("organisation_id", employee.organisation_id),
      supabase
        .from("leave_types")
        .select("id")
        .eq("organisation_id", employee.organisation_id)
        .eq("code", "ANNUAL")
        .maybeSingle(),
    ]);

  const employeeIds = (people ?? []).map((person) => person.id);
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [{ data: balances }, { data: requests }] = employeeIds.length
    ? await Promise.all([
        supabase
          .from("leave_balances")
          .select("employee_id, available_balance")
          .in("employee_id", employeeIds)
          .eq("leave_type_id", annualType?.id ?? "00000000-0000-0000-0000-000000000000"),
        supabase
          .from("leave_requests")
          .select("employee_id, quantity, status")
          .in("employee_id", employeeIds)
          .gte("start_date", yearStart),
      ])
    : [{ data: [] }, { data: [] }];

  const departmentMap = new Map(
    (departments ?? []).map((department) => [department.id, department.name])
  );
  const balanceMap = new Map(
    (balances ?? []).map((row) => [
      row.employee_id,
      Number(row.available_balance ?? 0),
    ])
  );
  const approvedMap = new Map<string, number>();
  const pendingMap = new Map<string, number>();

  for (const request of requests ?? []) {
    if (["approved", "cancellation_requested"].includes(request.status)) {
      approvedMap.set(
        request.employee_id,
        (approvedMap.get(request.employee_id) ?? 0) + Number(request.quantity)
      );
    }
    if (request.status === "pending_approval") {
      pendingMap.set(
        request.employee_id,
        (pendingMap.get(request.employee_id) ?? 0) + Number(request.quantity)
      );
    }
  }

  const header = [
    "Employee",
    "Department",
    "Annual Leave Available",
    "Approved Leave This Year",
    "Pending Leave",
  ];

  const rows = (people ?? []).map((person) => [
    `${person.first_name} ${person.last_name}`,
    person.department_id ? departmentMap.get(person.department_id) ?? "" : "",
    balanceMap.get(person.id) ?? 0,
    approvedMap.get(person.id) ?? 0,
    pendingMap.get(person.id) ?? 0,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leavectrl-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
