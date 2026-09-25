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

export function NotificationList({
  items,
}: {
  items: NotificationItem[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  async function markOne(id: string, open = false) {
    setWorking(id);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    setWorking("");
    if (updateError) {
      setError("The notification could not be marked as read.");
      return;
    }

    if (open) {
      router.push("/requests");
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
      .is("read_at", null);

    setWorking("");
    if (updateError) {
      setError("Notifications could not be marked as read.");
      return;
    }
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
          <button
            className="btn secondary"
            type="button"
            onClick={markAll}
            disabled={working === "all"}
          >
            <CheckCheck size={15}/>
            {working === "all" ? "Updating…" : "Mark all read"}
          </button>
        ) : null}
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <div className="notification-list">
        {items.map((item) => (
          <article
            className={`notification-row ${item.read_at ? "" : "unread"}`}
            key={item.id}
          >
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
                <button
                  className="request-text-action"
                  type="button"
                  disabled={working === item.id}
                  onClick={() => markOne(item.id)}
                >
                  Mark read
                </button>
              ) : null}
              {item.entity_type ? (
                <button
                  className="request-text-action"
                  type="button"
                  disabled={working === item.id}
                  onClick={() => markOne(item.id, true)}
                >
                  Open <ExternalLink size={12}/>
                </button>
              ) : null}
            </div>
          </article>
        ))}

        {!items.length ? (
          <div className="empty-work-state">
            <strong>No notifications yet</strong>
            <span>
              Leave and TOIL approval activity will appear here as it happens.
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
