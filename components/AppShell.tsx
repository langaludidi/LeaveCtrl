"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  FileText,
  Gauge,
  Home,
  LogOut,
  Menu,
  Settings,
  CreditCard,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { roleCapabilities, roleLabels, roleLanding } from "@/lib/role-access";
import { BillingBanner } from "@/components/BillingBanner";

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
  roles = ["employee"],
  requestCount = 0,
  hasEmployee = true,
}: {
  children: React.ReactNode;
  displayName?: string;
  roles?: readonly string[];
  requestCount?: number;
  hasEmployee?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function loadUnread() {
      const { data: claimsData } = await supabase.auth.getClaims();
      const userId = claimsData?.claims?.sub ?? null;
      if (!userId) {
        if (active) setUnreadNotifications(0);
        return;
      }

      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId)
        .is("read_at", null);

      if (active) setUnreadNotifications(count ?? 0);
    }

    const initialLoad = window.setTimeout(loadUnread, 350);
    window.addEventListener("leavectrl-notifications-changed", loadUnread);

    return () => {
      active = false;
      window.clearTimeout(initialLoad);
      window.removeEventListener("leavectrl-notifications-changed", loadUnread);
    };
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const access = roleCapabilities(roles, hasEmployee);
  const role = roleLabels(roles);
  const nav = [
    { href: "/access/roles", label: "My roles & access", icon: Users, visible: true },
    { href: "/", label: "Home", icon: Home, visible: access.home },
    { href: "/my-leave", label: "My Leave", icon: CalendarDays, visible: access.personal },
    { href: "/book-leave", label: "Book Leave", icon: CalendarPlus, visible: access.personal },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, visible: access.personal },
    { href: "/requests", label: roles.some((role) => ["org_admin", "hr_admin", "manager"].includes(role)) ? "Requests & approvals" : "Requests", icon: FileText, visible: access.personal },
    { href: "/team", label: "Team", icon: Users, visible: access.team },
    { href: "/reports", label: "Reports", icon: BarChart3, visible: access.reports },
    { href: "/audit", label: "Audit Log", icon: ClipboardList, visible: access.audit },
    { href: "/setup", label: "Administration", icon: Settings, visible: access.administration },
    { href: "/billing", label: "Billing & subscription", icon: CreditCard, visible: access.billing },
  ].filter((item) => item.visible);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
        <Link href={roleLanding(roles, hasEmployee).href} className="brand" aria-label="LeaveCtrl home">
          <BrandLogo className="shell-brand-logo" />
        </Link>

        <div className="mobile-header-actions">
          <Link
            href="/notifications"
            className="notification-button mobile-header-notifications"
            aria-label={unreadNotifications
              ? `${unreadNotifications} unread notifications`
              : "Notifications"}
            title="Notifications"
          >
            <Bell size={18} />
            {unreadNotifications ? (
              <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
            ) : null}
          </Link>
          <div className="avatar mobile-header-avatar" aria-label={displayName} title={displayName}>
            {initials(displayName)}
          </div>
        </div>

        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav id="primary-navigation" className="nav-list">
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
                aria-label={label}
                title={label}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{label}</span>
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </Link>
            );
          })}

          <div className="mobile-account-menu">
            <div>
              <div className="avatar">{initials(displayName)}</div>
              <div>
                <strong>{displayName}</strong>
                <Link href="/access/roles" className="profile-roles">{role || "View access"}</Link>
              </div>
            </div>
            <button type="button" onClick={signOut}>
              <LogOut size={17} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </nav>

        <div className="sidebar-foot">
          <Gauge size={17} />
          <span>South Africa</span>
        </div>
      </aside>

      {mobileNavOpen ? (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <strong>Leave & workforce availability</strong>
            <span>Policy-led, ledger-backed records</span>
          </div>

          <div className="top-actions">
            {hasEmployee && pathname !== "/book-leave" ? (
              <Link href="/book-leave" className="topbar-book-link">
                <CalendarPlus size={16} />
                Book leave
              </Link>
            ) : null}

            <Link
              href="/notifications"
              className="notification-button"
              aria-label={unreadNotifications
                ? `${unreadNotifications} unread notifications`
                : "Notifications"}
              title="Notifications"
            >
              <Bell size={18}/>
              {unreadNotifications ? (
                <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
              ) : null}
            </Link>

            <div className="profile profile-static">
              <div className="avatar">{initials(displayName)}</div>
              <div>
                <strong>{displayName}</strong>
                <Link href="/access/roles" className="profile-roles">{role || "View access"}</Link>
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

        <main className="page-wrap"><Link href="/access/roles" className="access-context"><span>Your roles</span><strong>{role || "View access"}</strong><span>View access →</span></Link><BillingBanner />{children}</main>
      </div>
    </div>
  );
}
