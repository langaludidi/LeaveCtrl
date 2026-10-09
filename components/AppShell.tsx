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
  role = "Employee",
  requestCount = 0,
  hasEmployee = true,
}: {
  children: React.ReactNode;
  displayName?: string;
  role?: string;
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

  const canManagePeople = ["Organisation Admin", "HR Admin", "Manager"].includes(role);
  const canReport = ["Organisation Admin", "HR Admin", "Manager", "Reporter", "Auditor"].includes(role);
  const canAdmin = ["Organisation Admin", "HR Admin"].includes(role);
  const canAudit = ["Organisation Admin", "HR Admin", "Auditor"].includes(role);

  const nav = [
    { href: "/", label: "Home", icon: Home, visible: role !== "Employee" && hasEmployee },
    { href: "/my-leave", label: "My Leave", icon: CalendarDays, visible: hasEmployee },
    { href: "/book-leave", label: "Book Leave", icon: CalendarPlus, visible: hasEmployee },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, visible: hasEmployee },
    { href: "/requests", label: "Requests", icon: FileText, visible: hasEmployee },
    { href: "/team", label: "Team", icon: Users, visible: canManagePeople && hasEmployee },
    { href: "/reports", label: "Reports", icon: BarChart3, visible: canReport && hasEmployee },
    { href: "/audit", label: "Audit Log", icon: ClipboardList, visible: canAudit },
    { href: "/setup", label: "Administration", icon: Settings, visible: canAdmin },
    { href: "/billing", label: "Billing & subscription", icon: CreditCard, visible: role === "Organisation Admin" },
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
        <Link href={!hasEmployee ? "/setup" : role === "Employee" ? "/my-leave" : "/"} className="brand" aria-label="LeaveCtrl home">
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
                <span>{role}</span>
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
            {pathname !== "/book-leave" ? (
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

        <main className="page-wrap"><BillingBanner />{children}</main>
      </div>
    </div>
  );
}
