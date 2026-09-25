import { AppShell } from "@/components/AppShell";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

export default async function TeamPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const [{ data: people }, { data: departments }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, email, department_id, employment_status")
      .eq("organisation_id", employee.organisation_id)
      .order("first_name"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id),
  ]);

  const departmentMap = new Map((departments ?? []).map((department) => [department.id, department.name]));

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head">
        <h1>Team</h1>
        <p>People and organisational context used by leave routing and availability.</p>
      </section>

      <section className="card data-card">
        <div className="card-title"><h2>People</h2><span className="muted-count">{people?.length ?? 0} employees</span></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Employee</th><th>Email</th><th>Department</th><th>Status</th></tr></thead>
            <tbody>
              {(people ?? []).map((person) => (
                <tr key={person.id}>
                  <td>{person.first_name} {person.last_name}</td>
                  <td>{person.email}</td>
                  <td>{person.department_id ? departmentMap.get(person.department_id) ?? "—" : "—"}</td>
                  <td><span className="neutral-pill">{person.employment_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
