import { AppShell } from "@/components/AppShell";
import { RoleAccessSummary } from "@/components/RoleAccessSummary";
import { getCurrentContext } from "@/lib/current-context";
import { roleCatalogue } from "@/lib/role-access";

export default async function RolesPage() {
  const { roles, employee, displayName, accessState } = await getCurrentContext({ requireEmployee: false, allowOrganisationOnboardingIncomplete: true, allowEmployeeWelcomeIncomplete: true });
  const ready = Boolean(accessState.organisation_onboarding_completed_at && (accessState.employee_welcome_completed_at || roles.includes("org_admin")));
  return <AppShell roles={roles} displayName={displayName} hasEmployee={Boolean(employee)}>
    <section className="page-head"><h1>My roles & access</h1><p>{accessState.organisation_name} · Access assigned by your organisation</p></section>
    <RoleAccessSummary roles={roles} showActions={ready} />
    {!ready ? <p>Complete your organisation setup or welcome to open your role actions.</p> : null}
    <section className="card role-access-summary"><h2>How the roles differ</h2><div className="role-access-grid">{roleCatalogue.map((item) => <article className="role-access-item" data-role={item.role} key={item.role}><h3>{item.label}</h3><p>{item.description}</p><small>{roles.includes(item.role) ? "Assigned to you" : "Not assigned to you"}</small></article>)}</div></section>
  </AppShell>;
}
