"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, CalendarDays, FileText, Gauge, Home, Search, Settings,
  Users, BarChart3, ChevronDown
} from "lucide-react";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/book-leave", label: "My Leave", icon: CalendarDays },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/requests", label: "Requests", icon: FileText },
  { href: "/team", label: "Team", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/setup", label: "Administration", icon: Settings },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "LC";
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="LeaveCtrl home"><span>Leave</span>Ctrl</Link>
        <nav className="nav-list">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            const badge = href === "/requests" && requestCount > 0 ? requestCount : null;
            return (
              <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}>
                <Icon size={20} strokeWidth={1.8} />
                <span>{label}</span>
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot"><Gauge size={17}/><span>South Africa</span></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="search-box"><Search size={18}/><span>Search for people, leave, or requests...</span></div>
          <div className="top-actions">
            <button className="icon-btn" aria-label="Notifications"><Bell size={20}/><span className="notice-dot"/></button>
            <div className="profile">
              <div className="avatar">{initials(displayName)}</div>
              <div><strong>{displayName}</strong><span>{role}</span></div>
              <ChevronDown size={15}/>
            </div>
          </div>
        </header>

        <main className="page-wrap">{children}</main>
      </div>
    </div>
  );
}
