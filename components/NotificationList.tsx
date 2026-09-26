"use client";

import { useState } from "react";
import { CheckCheck, Circle, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function notificationHref(item: NotificationItem) {
  if (!item.entity_id) return null;

  switch (item.entity_type) {
    case "leave_request":
    case "leave_requests":
      return `/requests/leave/${item.entity_id}`;
    case "toil_request":
    case "toil_requests":
      return `/requests/toil/${item.entity_id}`;
    default:
      return null;
  }
}

export function NotificationList({
  items,
  recipientUserId,
}: {
  items: NotificationItem[];
  recipientUserId: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  async function markOne(item: NotificationItem, open = false) {
    setWorking(item.id);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("recipient_user_id", recipientUserId);

    setWorking("");
    if (updateError) {
      setError("The notification could not be marked as read.");
      return;
    }

    window.dispatchEvent(new Event("leavectrl-notifications-changed"));

    if (open) {
      router.push(notificationHref(item) ?? "/requests");
    } else {
      router.refresh();
    }
  }

  async function markAll() {
    setWorking("all");
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", recipientUserId)
      .is("read_at", null);

    setWorking("");
    if (updateError) {
      setError("Notifications could not be marked as read.");
      return;
    }
    window.dispatchEvent(new Event("leavectrl-notifications-changed"));
    router.refresh();
  }

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <section className="card notifications-card">
      <div className="notifications-toolbar">
        <div>
          <h2>Notifications</h2>
          <span>{unread ? `${unread} unread` : "You're up to date"}</span>
        </div>
        {unread ? (
          <button className="btn secondary" type="button" onClick={markAll} disabled={working === "all"}>
            <CheckCheck size={15}/>
            {working === "all" ? "Updating…" : "Mark all read"}
          </button>
        ) : null}
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <div className="notification-list">
        {items.map((item) => {
          const href = notificationHref(item);
          return (
            <article className={`notification-row ${item.read_at ? "" : "unread"}`} key={item.id}>
              <div className="notification-state">
                <Circle size={9} fill={item.read_at ? "transparent" : "currentColor"}/>
              </div>
              <div className="notification-copy">
                <div className="notification-heading">
                  <strong>{item.title}</strong>
                  <span>{formatTimestamp(item.created_at)}</span>
                </div>
                <p>{item.body}</p>
              </div>
              <div className="notification-actions">
                {!item.read_at ? (
                  <button className="request-text-action" type="button" disabled={working === item.id} onClick={() => markOne(item)}>
                    Mark read
                  </button>
                ) : null}
                {item.entity_id ? (
                  <button className="request-text-action" type="button" disabled={working === item.id} onClick={() => markOne(item, true)} title={href ? "Open request details" : "Open requests"}>
                    Open <ExternalLink size={12}/>
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}

        {!items.length ? (
          <div className="empty-work-state">
            <strong>No notifications yet</strong>
            <span>Leave and TOIL approval activity will appear here as it happens.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
