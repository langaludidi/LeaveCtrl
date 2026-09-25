"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  FileText,
  Gauge,
  Home,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LC"
  );
}

export function AppShell({
  children,
  displayName = "LeaveCtrl User",
  role = "Employee",
  requestCount = 0,
}: {
  children: React.ReactNode;
  displayName?: string;
  role?: string;
  requestCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const canManagePeople = ["Organisation Admin", "HR Admin", "Manager"].includes(role);
  const canReport = ["Organisation Admin", "HR Admin", "Manager", "Reporter", "Auditor"].includes(role);
  const canAdmin = ["Organisation Admin", "HR Admin"].includes(role);

  const nav = [
    { href: "/", label: "Home", icon: Home, visible: true },
    { href: "/my-leave", label: "My Leave", icon: CalendarDays, visible: true },
    { href: "/book-leave", label: "Book Leave", icon: CalendarPlus, visible: true },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, visible: true },
    { href: "/requests", label: "Requests", icon: FileText, visible: true },
    { href: "/team", label: "Team", icon: Users, visible: canManagePeople },
    { href: "/reports", label: "Reports", icon: BarChart3, visible: canReport },
    { href: "/setup", label: "Administration", icon: Settings, visible: canAdmin },
  ].filter((item) => item.visible);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="LeaveCtrl home">
          <span>Leave</span>Ctrl
        </Link>

        <nav className="nav-list">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || (href !== "/" && pathname.startsWith(href));
            const badge =
              href === "/requests" && requestCount > 0 ? requestCount : null;

            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${active ? "active" : ""}`}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{label}</span>
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <Gauge size={17} />
          <span>South Africa</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <strong>Leave & workforce availability</strong>
            <span>Policy-led, ledger-backed records</span>
          </div>

          <div className="top-actions">
            {pathname !== "/book-leave" ? (
              <Link href="/book-leave" className="topbar-book-link">
                <CalendarPlus size={16} />
                Book leave
              </Link>
            ) : null}

            <div className="profile profile-static">
              <div className="avatar">{initials(displayName)}</div>
              <div>
                <strong>{displayName}</strong>
                <span>{role}</span>
              </div>
            </div>

            <button
              className="icon-btn signout-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={signOut}
              type="button"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="page-wrap">{children}</main>
      </div>
    </div>
  );
}
