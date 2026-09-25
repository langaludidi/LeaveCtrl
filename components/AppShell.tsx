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
  { href: "/requests", label: "Requests", icon: FileText, badge: "3" },
  { href: "/team", label: "Team", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/setup", label: "Administration", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="LeaveCtrl home"><span>Leave</span>Ctrl</Link>
        <nav className="nav-list">
          {nav.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}>
                <Icon size={20} strokeWidth={1.8} />
                <span>{label}</span>
                {badge && <span className="nav-badge">{badge}</span>}
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
              <div className="avatar">LL</div>
              <div><strong>Langa Ludidi</strong><span>Employee</span></div>
              <ChevronDown size={15}/>
            </div>
          </div>
        </header>
        <main className="page-wrap">{children}</main>
      </div>
    </div>
  );
}
