"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotificationsCount";
import Navbar from "@/components/Navbar";
import { AdminSidebar } from "@/components/admin-dashboard/AdminSidebar";
import { SeyalLogo } from "@/components/ui/SeyalLogo";
import { performClientLogout } from "@/lib/auth/clientLogout";
import { getPlatformAdminUrl, getTenantUrl } from "@/lib/tenant/hostUrls";
import { resolveCanonicalHostname } from "@/lib/tenant/hostnameResolver";
import { supabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils/cn";
import { PanelLeftOpen, Bell, ShieldAlert, LogOut, Globe } from "lucide-react";
import { SubscriptionExpiryBanner } from "@/components/admin/SubscriptionExpiryBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedSegment = useSelectedLayoutSegment();
  const { user, loading: userLoading } = useUser();
  const { flags } = useProfile();
  const {
    business,
    status,
    tenantError,
    userHomeBusiness,
    impersonationSession,
    refreshBusiness,
  } = useTenant();
  const { unreadCount } = useUnreadNotificationsCount();
  const [endingImpersonation, setEndingImpersonation] = useState(false);

  // Responsive initial state: on tablet/laptop (< 1280px), default to collapsed (64px icon rail)
  // On desktop (>= 1280px), default to open. Respects user manual preference.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("bftone_admin_sidebar_collapsed");
      } catch { }
      const saved = sessionStorage.getItem("bftone_admin_sidebar_collapsed");
      if (saved !== null) return saved === "true";
      // Auto-collapse on tablet / compact laptop (< 1280px)
      return window.innerWidth < 1280;
    }
    return false;
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("bftone_admin_sidebar_collapsed", String(next));
      } catch { }
      return next;
    });
  };

  // Synchronize sidebar state on window resize if no manual override is set
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      const saved = sessionStorage.getItem("bftone_admin_sidebar_collapsed");
      if (saved === null) {
        setIsSidebarCollapsed(window.innerWidth < 1280);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Mobile drawer state for small viewports (< md)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Auto-close mobile drawer on page navigation
  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [pathname]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const hostKind =
    mounted && typeof window !== "undefined"
      ? resolveCanonicalHostname(window.location.host)?.kind
      : null;

  // On client workspace hosts (<slug>.countercub.com or <slug>.localhost):
  // If user is unauthenticated and not already on /login, immediately push to /login.
  useEffect(() => {
    if (
      hostKind === "tenant_workspace" &&
      !userLoading &&
      !user &&
      pathname !== "/login" &&
      pathname !== "/set-password" &&
      pathname !== "/reset-password" &&
      pathname !== "/super-admin-login" &&
      pathname !== "/tenant-not-found"
    ) {
      window.location.href = "/login";
    }
  }, [hostKind, user, userLoading, pathname]);

  const isMarketingLanding =
    selectedSegment === "site" || hostKind === "marketing" || pathname === "/site";
  const isPublicAuthPage =
    pathname === "/login" ||
    pathname === "/set-password" ||
    pathname === "/reset-password" ||
    pathname === "/super-admin-login" ||
    pathname.startsWith("/super-admin/login") ||
    pathname === "/tenant-not-found" ||
    isMarketingLanding;
  const isSuperAdminView =
    hostKind === "platform_admin" ||
    pathname.startsWith("/super-admin");
  const showSidebar = !isSuperAdminView && !isPublicAuthPage;
  const isBillingPage =
    pathname === "/billing" || pathname.startsWith("/billing");

  // Prevent window-level bounce/scrolling on billing POS so right side remains completely sticky
  useEffect(() => {
    if (isBillingPage && typeof document !== "undefined") {
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const prevBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prevHtmlOverflow;
        document.body.style.overflow = prevBodyOverflow;
      };
    }
  }, [isBillingPage]);

  const handleExitImpersonation = async () => {
    if (!impersonationSession) return;
    setEndingImpersonation(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      await fetch(
        `/api/super-admin/impersonation?sessionId=${encodeURIComponent(
          impersonationSession.sessionId
        )}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
    } catch { }
    try {
      const { clearTenantClientState } = await import("@/lib/auth/clientLogout");
      await clearTenantClientState();
    } catch { }
    try {
      await supabaseClient.auth.signOut({ scope: "local" });
    } catch { }
    if (typeof window !== "undefined") {
      window.location.href = getPlatformAdminUrl("/");
    }
  };

  useEffect(() => {
    if (!impersonationSession?.expiresAt) return;
    const expiresAtMs = Date.parse(impersonationSession.expiresAt);
    if (!Number.isFinite(expiresAtMs)) return;

    let triggered = false;
    const checkAndExpire = () => {
      if (triggered) return;
      if (Date.now() >= expiresAtMs) {
        triggered = true;
        void handleExitImpersonation();
      }
    };

    const delayMs = Math.max(0, expiresAtMs - Date.now());
    const timer = window.setTimeout(checkAndExpire, delayMs);
    window.addEventListener("focus", checkAndExpire);
    document.addEventListener("visibilitychange", checkAndExpire);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkAndExpire);
      document.removeEventListener("visibilitychange", checkAndExpire);
    };
  }, [impersonationSession]);

  if (isPublicAuthPage) {
    return <>{children}</>;
  }

  // Neutral loader while tenant is resolving: never flash any store identity
  if (status === "resolving") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-3">
        <SeyalLogo size={36} showWordmark theme="light" />
        <div className="flex items-center gap-2 mt-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Loading workspace...
          </span>
        </div>
      </div>
    );
  }

  if (status === "error") {
    const errorTitle =
      tenantError === "TENANT_NOT_FOUND"
        ? "Workspace Not Found"
        : tenantError === "TENANT_RETIRED"
          ? "Workspace Subdomain Retired"
          : tenantError === "TENANT_SUSPENDED"
            ? "Workspace Suspended"
            : tenantError === "TENANT_HOSTNAME_MISMATCH"
              ? "Cross-Tenant Access Blocked"
              : tenantError === "IMPERSONATION_REQUIRED"
                ? "Support Impersonation Required"
                : "Workspace Unavailable";

    const errorDescription =
      tenantError === "TENANT_NOT_FOUND"
        ? "No active CounterCub shop workspace matches this subdomain."
        : tenantError === "TENANT_RETIRED"
          ? "This shop subdomain has been retired after a slug update and is permanently reserved."
          : tenantError === "TENANT_SUSPENDED"
            ? "This shop workspace is currently suspended. Please contact CounterCub platform support."
            : tenantError === "TENANT_HOSTNAME_MISMATCH"
              ? "Your account belongs to a different CounterCub shop workspace and is not authorized for this subdomain."
              : tenantError === "IMPERSONATION_REQUIRED"
                ? "Super Admin access to customer workspaces requires launching an audited, time-boxed support impersonation session from app.countercub.com."
                : "We could not connect to your assigned store workspace. Please retry or sign in with an authorized account.";

    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
          <div className="flex justify-center">
            <SeyalLogo size={36} showWordmark theme="light" />
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-base font-bold text-slate-900">{errorTitle}</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {errorDescription}
          </p>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {tenantError === "TENANT_HOSTNAME_MISMATCH" && userHomeBusiness?.slug ? (
              <a
                href={getTenantUrl(userHomeBusiness.slug, "/")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
              >
                Go to {userHomeBusiness.name} Workspace &rarr;
              </a>
            ) : (
              <button
                onClick={() => refreshBusiness()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Retry
              </button>
            )}
            <button
              onClick={async () => {
                await performClientLogout("/login");
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 cursor-pointer inline-flex items-center gap-1.5"
            >
              <LogOut size={13} />
              Switch Account
            </button>
            <a
              href="https://www.countercub.com"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Globe size={13} />
              CounterCub.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  const impersonationBanner = impersonationSession ? (
    <div className="bg-amber-500 text-slate-950 px-3 sm:px-5 py-2 text-xs font-bold flex flex-wrap items-center justify-between gap-2 border-b border-amber-600 z-50 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert size={15} className="shrink-0" />
        <span className="truncate">
          AUDITED SUPPORT SESSION:{" "}
          <strong className="underline">
            {impersonationSession.targetBusinessSlug || business?.slug}
          </strong>{" "}
          • Reason: &ldquo;{impersonationSession.reason}&rdquo; • Expires{" "}
          {new Date(impersonationSession.expiresAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <button
        onClick={handleExitImpersonation}
        disabled={endingImpersonation}
        className="px-2.5 py-1 rounded-lg bg-slate-950 text-amber-300 hover:bg-slate-900 text-[11px] font-extrabold uppercase tracking-wider transition cursor-pointer shrink-0"
      >
        {endingImpersonation ? "Ending..." : "Exit Support Session"}
      </button>
    </div>
  ) : null;

  if (showSidebar) {
    return (
      <div
        className={cn(
          "group min-h-screen flex bg-[#0B132B]",
          isBillingPage && "h-screen max-h-screen overflow-hidden"
        )}
        data-sidebar-collapsed={isSidebarCollapsed}
      >
        {/* Full-Height Left Sidebar on Desktop & Off-Canvas Drawer on Mobile */}
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          storeName={business?.name || "CounterCub Store"}
          isMobileOpen={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />

        {/* Right Main Column: Zero top navbar on desktop; minimal drawer trigger on mobile */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0 bg-[#F8FAFC]",
            isBillingPage
              ? "h-screen max-h-screen overflow-hidden"
              : "min-h-screen",
            isMobileDrawerOpen &&
            "transition-transform duration-250 ease-out will-change-transform md:transform-none transform scale-[0.97] origin-left rounded-2xl md:rounded-none overflow-hidden shadow-2xl"
          )}
        >
          {impersonationBanner}
          <SubscriptionExpiryBanner />
          {!isBillingPage && (
            <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-3 sm:px-4 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => setIsMobileDrawerOpen(true)}
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-90 text-[#0F172A] flex items-center justify-center transition-all border border-slate-200/80 shadow-2xs shrink-0 cursor-pointer group"
                  title="Open Navigation Menu"
                  aria-label="Open Navigation Menu"
                >
                  <PanelLeftOpen
                    size={18}
                    className="text-[#2563EB] group-hover:scale-110 group-active:scale-95 transition-transform"
                  />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <SeyalLogo size={26} showWordmark theme="light" />
                  {business?.name && (
                    <span className="hidden xs:inline-flex items-center gap-1 text-[10px] text-[#1E40AF] font-bold px-1.5 py-0.5 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] truncate max-w-[130px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse shrink-0" />
                      <span className="truncate">{business.name}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Mobile alerts icon trigger (hidden in B2B Supply mode) */}
              {!pathname?.startsWith("/b2b") &&
                !pathname?.startsWith("/baker") && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href="/notifications"
                      className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors relative"
                      title={
                        unreadCount > 0
                          ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"
                          }`
                          : "Alerts & Notifications"
                      }
                    >
                      <Bell
                        size={20}
                        className={
                          unreadCount > 0 ? "text-slate-800" : "text-slate-600"
                        }
                      />
                      {unreadCount > 0 ? (
                        <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white shadow-xs animate-pulse">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      ) : (
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-slate-300 rounded-full" />
                      )}
                    </Link>
                  </div>
                )}
            </header>
          )}
          <main
            className={cn(
              "flex-1 min-w-0 overflow-x-clip",
              isBillingPage
                ? "p-0 h-full overflow-hidden flex flex-col"
                : "px-2.5 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-5"
            )}
          >
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {impersonationBanner}
      {/* Top Navbar for super admin */}
      <Navbar />
      <main className="mx-auto w-full max-w-7xl 2xl:max-w-[1600px] px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 md:pb-6 flex-1">
        {children}
      </main>
    </div>
  );
}
