import { redirect } from "next/navigation";
import { CalendarDays, Clock3, ShieldCheck, Users } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { WelcomeCompleteButton } from "@/components/WelcomeCompleteButton";
import { getCurrentContext } from "@/lib/current-context";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function compact(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export default async function WelcomePage() {
  const { supabase, employee, organisation, businessDate } =
    await getCurrentContext({ allowEmployeeWelcomeIncomplete: true });
  if (!employee || !organisation) return null;

  const [
    { data: welcomeState },
    { data: currentCondition },
    { data: directory },
    { data: leaveTypes },
    { data: balances },
    { data: policies },
    { data: toilBalance },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("welcome_completed_at")
      .eq("id", employee.id)
      .maybeSingle(),
    supabase
      .from("employee_current_conditions")
      .select("work_schedule_id, manager_employee_id")
      .eq("employee_id", employee.id)
      .maybeSingle(),
    supabase.rpc("get_workforce_directory"),
    supabase
      .from("leave_types")
      .select("id, name, unit")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .eq("employee_visible", true)
      .order("name"),
    supabase
      .from("leave_balances")
      .select("leave_type_id, available_balance")
      .eq("employee_id", employee.id),
    supabase
      .from("leave_policy_versions")
      .select("leave_type_id, entitlement_method, effective_from, effective_to, version")
      .eq("organisation_id", employee.organisation_id)
      .lte("effective_from", businessDate)
      .or(`effective_to.is.null,effective_to.gte.${businessDate}`)
      .order("effective_from", { ascending: false })
      .order("version", { ascending: false }),
    supabase
      .from("toil_balances")
      .select("available_hours")
      .eq("employee_id", employee.id)
      .maybeSingle(),
  ]);

  if (welcomeState?.welcome_completed_at) redirect("/my-leave");

  const scheduleId = currentCondition?.work_schedule_id ?? null;
  const managerId =
    currentCondition?.manager_employee_id ?? employee.manager_employee_id ?? null;

  const { data: schedule } = scheduleId
    ? await supabase
        .from("work_schedules")
        .select("name")
        .eq("id", scheduleId)
        .maybeSingle()
    : { data: null };

  const manager = managerId
    ? (directory ?? []).find((person) => person.employee_id === managerId)
    : null;
  const managerName = manager
    ? `${manager.first_name} ${manager.last_name}`
    : "Organisation approval route";

  const balanceMap = new Map(
    (balances ?? []).map((row) => [
      row.leave_type_id,
      Number(row.available_balance ?? 0),
    ])
  );
  const policyByType = new Map<string, string>();
  for (const policy of policies ?? []) {
    if (!policyByType.has(policy.leave_type_id)) {
      policyByType.set(policy.leave_type_id, policy.entitlement_method);
    }
  }

  const leaveRows = (leaveTypes ?? []).map((type) => {
    const method = policyByType.get(type.id) ?? "fixed_days";
    const balance = balanceMap.get(type.id) ?? 0;
    const unit = type.unit === "hours"
      ? balance === 1 ? "hour" : "hours"
      : balance === 1 ? "day" : "days";

    let value = `${compact(balance)} ${unit} available`;
    if (method === "no_balance") value = "Request as needed";
    if (method === "event_based") value = "Eligibility-based";
    if (method === "manual_allocation" && !balance) value = "Allocated when eligible";

    return { id: type.id, name: type.name, value };
  });

  const toilHours = Number(toilBalance?.available_hours ?? 0);
  leaveRows.push({
    id: "toil",
    name: "TOIL",
    value: `${compact(toilHours)} ${toilHours === 1 ? "hour" : "hours"} available`,
  });

  return (
    <main className="welcome-page">
      <section className="welcome-shell" aria-labelledby="welcome-heading">
        <div className="welcome-brand">
          <BrandLogo className="welcome-brand-logo" />
        </div>

        <div className="welcome-hero">
          <p className="eyebrow">YOUR LEAVECTRL ACCESS</p>
          <h1 id="welcome-heading">Welcome, {employee.first_name}</h1>
          <p>
            Here is the leave and availability context your organisation has set up for you.
            You will only see this welcome once.
          </p>
        </div>

        <div className="welcome-context-grid">
          <section className="welcome-context-card">
            <span className="welcome-context-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
            <div>
              <span>Organisation</span>
              <strong>{organisation.name}</strong>
            </div>
          </section>

          <section className="welcome-context-card">
            <span className="welcome-context-icon"><CalendarDays size={18} aria-hidden="true" /></span>
            <div>
              <span>Employment start date</span>
              <strong>{formatDate(employee.start_date)}</strong>
            </div>
          </section>

          <section className="welcome-context-card">
            <span className="welcome-context-icon"><Clock3 size={18} aria-hidden="true" /></span>
            <div>
              <span>Work schedule</span>
              <strong>{schedule?.name ?? "Schedule not assigned yet"}</strong>
            </div>
          </section>

          <section className="welcome-context-card">
            <span className="welcome-context-icon"><Users size={18} aria-hidden="true" /></span>
            <div>
              <span>Approval route</span>
              <strong>{managerName}</strong>
              <small>{manager ? "Your current manager" : "No direct manager is currently assigned"}</small>
            </div>
          </section>
        </div>

        <section className="welcome-leave-card" aria-labelledby="welcome-leave-heading">
          <div className="welcome-section-head">
            <div>
              <span>AVAILABLE LEAVE</span>
              <h2 id="welcome-leave-heading">Your current leave position</h2>
            </div>
            <small>Relevant employee-visible categories only</small>
          </div>

          <div className="welcome-leave-list">
            {leaveRows.slice(0, 6).map((item) => (
              <div key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="welcome-finish">
          <div>
            <strong>Simple on the surface. Governed underneath.</strong>
            <span>After this, returning visits open directly on My Leave.</span>
          </div>
          <WelcomeCompleteButton />
        </div>
      </section>
    </main>
  );
}
