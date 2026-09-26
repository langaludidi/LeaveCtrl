import { redirect } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function humanEvent(value: string) {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function payloadSummary(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  return Object.entries(payload as Record<string, unknown>)
    .filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value)
    )
    .slice(0, 4)
    .map(([key, value]) => ({
      key: key.replaceAll("_", " "),
      value: String(value),
    }));
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const canAudit = roles.some((role) =>
    ["org_admin", "hr_admin", "auditor"].includes(role)
  );
  if (!canAudit) redirect("/");

  let query = supabase
    .from("audit_events")
    .select(
      "id, actor_user_id, entity_type, entity_id, event_type, payload, created_at"
    )
    .eq("organisation_id", employee.organisation_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.q?.trim()) {
    query = query.ilike("event_type", `%${params.q.trim()}%`);
  }
  if (params.entity?.trim()) {
    query = query.eq("entity_type", params.entity.trim());
  }

  const [{ data: events }, { data: people }] = await Promise.all([
    query,
    supabase
      .from("employees")
      .select("user_id, first_name, last_name")
      .eq("organisation_id", employee.organisation_id),
  ]);

  const actorMap = new Map(
    (people ?? [])
      .filter((person) => person.user_id)
      .map((person) => [
        person.user_id!,
        `${person.first_name} ${person.last_name}`,
      ])
  );

  const entityTypes = Array.from(
    new Set((events ?? []).map((event) => event.entity_type).filter(Boolean))
  ).sort();

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head split">
        <div>
          <p className="eyebrow">GOVERNANCE</p>
          <h1>Audit Log</h1>
          <p>
            Append-only operational history for leave, access, workforce, policy,
            remuneration and administrative actions.
          </p>
        </div>
        <span className="page-context-icon"><ClipboardList size={20}/></span>
      </section>

      <section className="card audit-card">
        <form className="audit-filters" method="get">
          <label className="audit-search">
            <Search size={16}/>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search event type, e.g. leave.request"
            />
          </label>
          <select name="entity" defaultValue={params.entity ?? ""}>
            <option value="">All entities</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>{entityType}</option>
            ))}
          </select>
          <button className="btn secondary" type="submit">Apply</button>
          {(params.q || params.entity) ? (
            <a href="/audit" className="btn ghost">Clear</a>
          ) : null}
        </form>

        <div className="audit-list">
          {(events ?? []).map((event) => {
            const summary = payloadSummary(event.payload);
            return (
              <article className="audit-row" key={event.id}>
                <div className="audit-time">
                  <strong>{formatTimestamp(event.created_at)}</strong>
                  <span>{actorMap.get(event.actor_user_id ?? "") ?? "System"}</span>
                </div>
                <div className="audit-event">
                  <strong>{humanEvent(event.event_type)}</strong>
                  <span>
                    {event.entity_type}
                    {event.entity_id ? ` · ${event.entity_id.slice(0, 8)}` : ""}
                  </span>
                </div>
                <div className="audit-payload">
                  {summary.map((item) => (
                    <span key={item.key}>
                      <small>{item.key}</small>
                      {item.value}
                    </span>
                  ))}
                  {!summary.length ? <em>No additional fields</em> : null}
                </div>
              </article>
            );
          })}

          {!events?.length ? (
            <div className="empty-work-state">
              <strong>No matching audit events</strong>
              <span>Adjust the filter or return to the full operational history.</span>
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
