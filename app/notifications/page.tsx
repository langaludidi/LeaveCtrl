import { Bell } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NotificationList } from "@/components/NotificationList";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

export default async function NotificationsPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const { data: notifications } = await supabase
    .from("notifications")
    .select(
      "id, title, body, kind, entity_type, entity_id, read_at, created_at"
    )
    .eq("organisation_id", employee.organisation_id)
    .order("created_at", { ascending: false })
    .limit(80);

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head split">
        <div>
          <p className="eyebrow">COMMUNICATIONS</p>
          <h1>Notifications</h1>
          <p>
            Approval work and decisions generated from LeaveCtrl's governed request
            workflows.
          </p>
        </div>
        <span className="page-context-icon"><Bell size={20}/></span>
      </section>

      <NotificationList items={notifications ?? []}/>
    </AppShell>
  );
}
