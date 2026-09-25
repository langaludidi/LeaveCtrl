import { AppShell } from "@/components/AppShell";
import { AddEmployeeForm } from "@/components/AddEmployeeForm";
import { ManagerAssignment } from "@/components/ManagerAssignment";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

export default async function TeamPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const canAdminPeople = roles.includes("org_admin") || roles.includes("hr_admin");

  const [
    { data: people },
    { data: departments },
    { data: leaveTypes },
    { data: balances },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, user_id, first_name, last_name, email, department_id, manager_employee_id, employment_status")
      .eq("organisation_id", employee.organisation_id)
      .order("first_name"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("leave_types")
      .select("id, code")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true),
    supabase
      .from("leave_balances")
      .select("employee_id, leave_type_id, available_balance")
      .eq("organisation_id", employee.organisation_id),
  ]);

  let activeInvitations: { employee_id: string | null }[] = [];
  if (canAdminPeople) {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("employee_invitations")
      .select("employee_id")
      .eq("organisation_id", employee.organisation_id)
      .is("accepted_at", null)
      .gt("expires_at", now);

    activeInvitations = data ?? [];
  }

  const annualType = (leaveTypes ?? []).find((type) => type.code === "ANNUAL");
  const annualBalanceMap = new Map(
    (balances ?? [])
      .filter((balance) => balance.leave_type_id === annualType?.id)
      .map((balance) => [balance.employee_id, Number(balance.available_balance ?? 0)])
  );

  const departmentMap = new Map(
    (departments ?? []).map((department) => [department.id, department.name])
  );
  const managerMap = new Map(
    (people ?? []).map((person) => [
      person.id,
      `${person.first_name} ${person.last_name}`,
    ])
  );
  const pendingAccess = new Set(
    activeInvitations
      .map((invitation) => invitation.employee_id)
      .filter((id): id is string => Boolean(id))
  );

  const assignmentPeople = (people ?? []).map((person) => ({
    id: person.id,
    name: `${person.first_name} ${person.last_name}`,
    managerEmployeeId: person.manager_employee_id,
  }));

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head">
        <h1>Team</h1>
        <p>
          People exist independently of login access. Leave positions are provisioned
          from policy, while reporting lines drive approvals.
        </p>
      </section>

      {canAdminPeople ? (
        <section className="people-admin-grid">
          <AddEmployeeForm />
          <ManagerAssignment people={assignmentPeople} />
        </section>
      ) : null}

      <section className="card data-card">
        <div className="card-title">
          <h2>People</h2>
          <span className="muted-count">{people?.length ?? 0} employees</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Email</th>
                <th>Department</th>
                <th>Manager</th>
                <th>Annual leave</th>
                {canAdminPeople ? <th>Access</th> : null}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(people ?? []).map((person) => {
                const access = person.user_id
                  ? "Active"
                  : pendingAccess.has(person.id)
                    ? "Invitation ready"
                    : "Not invited";
                const annualBalance = annualBalanceMap.get(person.id);

                return (
                  <tr key={person.id}>
                    <td>{person.first_name} {person.last_name}</td>
                    <td>{person.email}</td>
                    <td>
                      {person.department_id
                        ? departmentMap.get(person.department_id) ?? "—"
                        : "—"}
                    </td>
                    <td>
                      {person.manager_employee_id
                        ? managerMap.get(person.manager_employee_id) ?? "—"
                        : "Not assigned"}
                    </td>
                    <td>
                      {annualBalance === undefined
                        ? <span className="muted">Not configured</span>
                        : <strong>{annualBalance} days</strong>}
                    </td>
                    {canAdminPeople ? (
                      <td>
                        <span className={`access-pill ${person.user_id ? "active" : pendingAccess.has(person.id) ? "pending" : "neutral"}`}>
                          {access}
                        </span>
                      </td>
                    ) : null}
                    <td>
                      <span className="neutral-pill">{person.employment_status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
