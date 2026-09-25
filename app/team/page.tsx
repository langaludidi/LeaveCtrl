import { AppShell } from "@/components/AppShell";
import { AddEmployeeForm } from "@/components/AddEmployeeForm";
import { ManagerAssignment } from "@/components/ManagerAssignment";
import { WorkforceChangeControls } from "@/components/WorkforceChangeControls";
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
    { data: schedules },
    { data: locations },
    { data: currentConditions },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, user_id, first_name, last_name, email, department_id, manager_employee_id, employment_status")
      .eq("organisation_id", employee.organisation_id)
      .order("first_name"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("leave_types")
      .select("id, code")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true),
    supabase
      .from("leave_balances")
      .select("employee_id, leave_type_id, available_balance")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("work_schedules")
      .select("id, name, schedule_kind")
      .eq("organisation_id", employee.organisation_id)
      .order("name"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("employee_current_conditions")
      .select("employee_id, department_id, manager_employee_id, work_schedule_id, location_id, work_mode")
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

  const conditionMap = new Map(
    (currentConditions ?? []).map((condition) => [condition.employee_id, condition])
  );
  const departmentMap = new Map(
    (departments ?? []).map((department) => [department.id, department.name])
  );
  const scheduleMap = new Map(
    (schedules ?? []).map((schedule) => [schedule.id, schedule])
  );
  const locationMap = new Map(
    (locations ?? []).map((location) => [location.id, location.name])
  );
  const managerMap = new Map(
    (people ?? []).map((person) => [person.id, `${person.first_name} ${person.last_name}`])
  );
  const pendingAccess = new Set(
    activeInvitations
      .map((invitation) => invitation.employee_id)
      .filter((id): id is string => Boolean(id))
  );

  const assignmentPeople = (people ?? []).map((person) => {
    const condition = conditionMap.get(person.id);
    return {
      id: person.id,
      name: `${person.first_name} ${person.last_name}`,
      managerEmployeeId: condition?.manager_employee_id ?? person.manager_employee_id,
    };
  });

  const workforcePeople = (people ?? []).map((person) => ({
    id: person.id,
    name: `${person.first_name} ${person.last_name}`,
  }));

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head">
        <h1>Team</h1>
        <p>
          People, reporting lines and working conditions are effective-dated so transfers,
          roster changes and work arrangements remain historically explainable.
        </p>
      </section>

      {canAdminPeople ? (
        <>
          <section className="people-admin-grid">
            <AddEmployeeForm />
            <ManagerAssignment people={assignmentPeople} />
          </section>

          <WorkforceChangeControls
            people={workforcePeople}
            departments={departments ?? []}
            schedules={(schedules ?? []).map((schedule) => ({ id: schedule.id, name: schedule.name }))}
            locations={locations ?? []}
          />
        </>
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
                <th>Department</th>
                <th>Manager</th>
                <th>Work pattern</th>
                <th>Arrangement</th>
                <th>Location</th>
                <th>Annual leave</th>
                {canAdminPeople ? <th>Access</th> : null}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(people ?? []).map((person) => {
                const condition = conditionMap.get(person.id);
                const departmentId = condition?.department_id ?? person.department_id;
                const managerId = condition?.manager_employee_id ?? person.manager_employee_id;
                const schedule = condition?.work_schedule_id
                  ? scheduleMap.get(condition.work_schedule_id)
                  : undefined;
                const access = person.user_id
                  ? "Active"
                  : pendingAccess.has(person.id)
                    ? "Invitation ready"
                    : "Not invited";
                const annualBalance = annualBalanceMap.get(person.id);

                return (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.first_name} {person.last_name}</strong>
                      <span className="table-secondary">{person.email}</span>
                    </td>
                    <td>{departmentId ? departmentMap.get(departmentId) ?? "—" : "—"}</td>
                    <td>{managerId ? managerMap.get(managerId) ?? "—" : "Not assigned"}</td>
                    <td>
                      {schedule
                        ? <><strong>{schedule.name}</strong><span className="table-secondary">{schedule.schedule_kind === "rotating" ? "Rotating shift" : "Weekly schedule"}</span></>
                        : "—"}
                    </td>
                    <td className="capitalize-cell">{condition?.work_mode?.replaceAll("_", " ") ?? "Onsite"}</td>
                    <td>{condition?.location_id ? locationMap.get(condition.location_id) ?? "—" : "—"}</td>
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
                    <td><span className="neutral-pill">{person.employment_status}</span></td>
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
