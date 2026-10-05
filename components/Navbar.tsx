"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { cn } from "@/lib/utils/cn";
import {
  Home, CalendarCheck2, CalendarDays, Coffee, Shield,
  User, LogOut, ChevronDown, Bell, Wallet, TrendingUp, Globe, Sparkles, Store, LifeBuoy, Bug, FileText, Boxes, Banknote, PanelLeftOpen, Menu
} from "lucide-react";
import RaiseIssueModal from "@/components/support/RaiseIssueModal";

interface NavbarProps {
  isSidebarCollapsed?: boolean;
  onToggleMobileMenu?: () => void;
}

export default function Navbar({
  isSidebarCollapsed,
  onToggleMobileMenu,
}: NavbarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const { flags } = useProfile();
  const { business, isModuleEnabled } = useTenant();

  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Persistence & Auth Logic
  useEffect(() => {
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem('bftone_display_email') : null;
      if (cached) setUserEmail(cached);
    } catch { }
  }, []);

  function getSubdomainSlug(): string | null {
    if (typeof window === "undefined") return null;
    const hostname = window.location.hostname.toLowerCase();
    const roots = ["seyalpro.in", "seyalpro.com", "bft-one.vercel.app", "bftone.com", "localhost"];

    for (const root of roots) {
      if (hostname.endsWith("." + root)) {
        const sub = hostname.slice(0, -(root.length + 1));
        if (sub && sub !== "www" && sub !== "app") {
          return sub;
        }
      }
    }
    return null;
  }

  function getTargetLoginUrl(): string {
    if (typeof window === "undefined") return "/login";
    if (pathname.startsWith("/super-admin")) return "/super-admin/login";
    return "/login";
  }

  useEffect(() => {
    if (user) {
      setUserEmail(user.email);
      try { localStorage.setItem('bftone_display_email', user.email!); } catch { }
    } else if (!loading) {
      setUserEmail(undefined);
      try { localStorage.removeItem('bftone_display_email'); } catch { }
      const isPublicAuthPage = pathname === "/login" || pathname.startsWith("/super-admin/login");
      if (!isPublicAuthPage) {
        try { router.replace(getTargetLoginUrl()); } catch { }
      }
    }
  }, [user, loading, pathname, router]);

  // Click Outside Dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Hide on login pages
  if (pathname === "/login" || pathname === "/super-admin/login") return null;

  const displayName = userEmail ? userEmail.split("@")[0] : null;
  const initial = displayName ? displayName[0].toUpperCase() : "?";
  const isSuperAdminView = flags?.isSuperAdmin && pathname.startsWith("/super-admin");

  // Standard Desktop / Mobile Navigation Links
  const allLinks = isSuperAdminView
    ? [
      { href: "/super-admin", label: "Super Admin Hub", icon: Globe },
    ]
    : [
      { href: "/", label: "Dashboard", icon: Home },
      ...(flags?.isAdmin || flags?.isStockManager || isModuleEnabled("stock")
        ? [{ href: "/inventory", label: "Inventory", icon: Boxes }]
        : []),
      ...(flags?.isAdmin
        ? [
          ...(isModuleEnabled("invoices") ? [{ href: "/invoices", label: "Invoices", icon: FileText }] : []),
          { href: "/admin/fill-timesheet", label: "Fill Timesheet", icon: CalendarCheck2 }
        ]
        : []),
      ...(flags?.isAdmin || isModuleEnabled("sales")
        ? [{ href: "/daily-sales", label: "Daily Sales", icon: TrendingUp }]
        : []),
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      ...(flags?.isAdmin
        ? [{ href: "/admin", label: "Admin Panel", icon: Shield }]
        : isModuleEnabled("salary") ? [{ href: "/mysalary", label: "My Salary", icon: Wallet }] : []),
    ];

  // Focus Mode Links for fast-paced Cashier/Billing screen
  const focusLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/billing", label: "Billing / POS", icon: Coffee },
  ];

  const isFocusMode = pathname.startsWith("/billing") && isModuleEnabled("billing");
  const visibleLinks = isFocusMode ? focusLinks : allLinks;

  async function handleLogout() {
    try {
      await Promise.race([
        supabaseClient.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch (e) {
      console.error("Logout error/timeout", e);
    } finally {
      setMenuOpen(false);
      try { localStorage.removeItem('bftone_display_email'); } catch { }
      try { localStorage.removeItem('bftone_tenant_cache'); } catch { }
      try { localStorage.removeItem('bftone_flags'); } catch { }
      if (typeof document !== 'undefined') {
        document.cookie = "tenant_slug=; path=/; max-age=0; SameSite=Lax";
      }
      window.location.href = getTargetLoginUrl();
    }
  }

  return (
    <>
      {/* Top Desktop Navigation Bar */}
      <nav className={cn(
        "sticky top-0 z-50 transition-all duration-300 backdrop-blur-xl",
        isSuperAdminView
          ? "bg-slate-950/90 border-b border-slate-800/80 text-white shadow-lg shadow-black/20"
          : "bg-white/95 border-b border-slate-200/80 text-slate-900 shadow-xs"
      )}>
        <div className={cn("px-3 sm:px-6 lg:px-8", flags?.isAdmin && !isSuperAdminView ? "w-full" : "max-w-[1600px] mx-auto")}>
          <div className={cn("flex items-center h-[68px] sm:h-20", isFocusMode ? "justify-center" : "justify-between")}>

            {/* Left: Brand Identity & Connected Store Pill */}
            {!isFocusMode && (
              <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
                {flags?.isAdmin && !isSuperAdminView ? (
                  <>
                    {/* Mobile Admin Brand & Menu Trigger (< md) */}
                    <div className="flex md:hidden items-center gap-2.5 min-w-0">
                      <button
                        onClick={onToggleMobileMenu}
                        className="w-10 h-10 -ml-1 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-[#0F172A] flex items-center justify-center transition-all border border-slate-200/80 shadow-2xs shrink-0"
                        title="Open Admin Menu"
                        aria-label="Open Admin Menu"
                      >
                        <PanelLeftOpen size={18} className="text-[#2563EB]" />
                      </button>

                      <Link href="/" className="flex items-center gap-1.5 group shrink-0">
                        <span className="font-extrabold text-lg tracking-tight leading-none text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                          Seyal<span className="text-[#2563EB]">Pro</span>
                        </span>
                      </Link>
                    </div>

                    {/* Desktop Admin Brand (>= md): When collapsed, display SeyalPro.
                       Store name is prominently kept inside the sidenavbar. */}
                    {isSidebarCollapsed ? (
                      <div className="hidden md:flex items-center gap-2.5 sm:gap-3.5 min-w-0 animate-in fade-in duration-200">
                        <Link
                          href="/"
                          className="flex items-center gap-2 group shrink-0 transition-opacity duration-200"
                          title="SeyalPro Admin Dashboard"
                        >
                          <span className="font-extrabold text-lg sm:text-xl tracking-tight leading-none">
                            <span className="text-[#0F172A] group-hover:text-[#2563EB] transition-colors">Seyal</span>
                            <span className="text-[#2563EB]">Pro</span>
                          </span>
                        </Link>
                      </div>
                    ) : null}
                  </>
                ) : (
                  /* Staff & Super Admin: Standard Full Brand */
                  <Link
                    href={isSuperAdminView ? "/super-admin" : "/"}
                    className="flex items-center gap-2.5 sm:gap-3 group shrink-0"
                  >
                    {/* Brand Gem Icon */}
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shadow-xs group-hover:bg-[#1D4ED8] group-hover:scale-105 transition-all shrink-0">
                      <Sparkles size={18} className="text-white" />
                    </div>

                    <div className="flex flex-col justify-center min-w-0">
                      <span className="font-extrabold text-lg sm:text-xl tracking-tight leading-none">
                        {isSuperAdminView ? (
                          <span className="text-white group-hover:text-blue-400">Seyal<span className="text-[#2563EB]">Pro</span></span>
                        ) : (
                          <span>
                            <span className="text-[#0F172A]">Seyal</span>
                            <span className="text-[#2563EB]">Pro</span>
                          </span>
                        )}
                      </span>

                      {/* Mobile: Connected Store Pill Badge underneath SeyalPro */}
                      {isSuperAdminView ? (
                        <div className="sm:hidden mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800 shadow-2xs max-w-[190px] truncate">
                          <Globe size={11} className="text-blue-400 animate-spin-slow shrink-0" />
                          <span className="truncate">Super Admin Hub</span>
                        </div>
                      ) : business?.name ? (
                        <div className="sm:hidden mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] shadow-2xs max-w-[190px] xs:max-w-[240px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse shrink-0" />
                          <Store size={11} className="text-[#2563EB] shrink-0" />
                          <span className="truncate">{business.name}</span>
                        </div>
                      ) : null}
                    </div>
                  </Link>
                )}

                {/* Desktop: Connected Store Pill Badge (Next to Brand for super admin or staff) */}
                {(!flags?.isAdmin || isSuperAdminView) && (
                  isSuperAdminView ? (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-950 text-blue-200 border border-blue-800 shadow-xs">
                      <Globe size={13} className="text-blue-400 animate-spin-slow" />
                      <span>Super Admin Platform</span>
                    </span>
                  ) : business?.name ? (
                    <span
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] shadow-xs max-w-[260px] truncate"
                      title={business.name}
                    >
                      <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse shrink-0" />
                      <Store size={13} className="text-[#2563EB] shrink-0" />
                      <span className="truncate font-semibold">{business.name}</span>
                    </span>
                  ) : null
                )}
              </div>
            )}

            {/* Middle: Desktop Nav Tabs - Hidden for Admin because side navbar handles navigation */}
            {(!flags?.isAdmin || isSuperAdminView) && (
              <div className={cn("flex items-center space-x-1 sm:space-x-1.5", !isFocusMode && "hidden md:flex")}>
                {visibleLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all duration-150",
                        isSuperAdminView
                          ? isActive
                            ? "bg-[#2563EB] text-white shadow-xs"
                            : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                          : isActive
                            ? "bg-[#2563EB] text-white shadow-xs"
                            : "text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]"
                      )}
                    >
                      <link.icon size={16} className={isActive ? "text-white" : "text-[#64748B]"} />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Right: Actions, Notifications & User Profile */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {!isFocusMode && (
                <>
                  {/* Notification Bell */}
                  <Link
                    href="/notifications"
                    className={cn(
                      "relative p-2 rounded-lg border transition-all",
                      isSuperAdminView
                        ? "text-slate-300 hover:text-white hover:bg-slate-800 border-slate-800"
                        : "text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 border-[#E2E8F0]"
                    )}
                    title="Notifications"
                  >
                    <Bell size={18} />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#2563EB] rounded-full ring-2 ring-white" />
                  </Link>

                  {/* Support & Issues Hub strictly for Client Store Admins */}
                  {flags?.isAdmin && !flags?.isSuperAdmin && (
                    <button
                      onClick={() => setIssueModalOpen(true)}
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1E40AF] border border-[#BFDBFE] text-xs font-semibold transition-all shadow-xs active:scale-95"
                      title="View raised issues or report a new bug to SeyalPro"
                    >
                      <LifeBuoy size={14} className="text-[#2563EB]" />
                      <span className="hidden md:inline">Support & Issues</span>
                    </button>
                  )}

                  {/* User Menu Trigger */}
                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setMenuOpen(!menuOpen)}
                      className={cn(
                        "flex items-center gap-2 p-1.5 sm:pl-3 rounded-lg border transition-all focus:outline-none focus:ring-2",
                        isSuperAdminView
                          ? "border-slate-700 bg-slate-800/80 hover:bg-slate-800 focus:ring-blue-500/20"
                          : "border-[#E2E8F0] bg-white hover:bg-slate-50 focus:ring-[#2563EB]/20"
                      )}
                    >
                      <span className={cn(
                        "text-xs font-bold leading-tight max-w-[120px] truncate hidden sm:block capitalize",
                        isSuperAdminView ? "text-white" : "text-[#0F172A]"
                      )}>
                        {displayName || "Guest"}
                      </span>

                      <div className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center text-xs font-extrabold shadow-xs">
                        {initial}
                      </div>
                      <ChevronDown size={14} className="text-[#64748B] mr-1" />
                    </button>

                    {/* Dropdown Menu */}
                    {menuOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-[#E2E8F0] p-1.5 animate-in fade-in zoom-in-95 duration-150 origin-top-right z-50">
                        <div className="px-3.5 py-3 border-b border-slate-100">
                          <p className="text-sm font-bold text-[#0F172A] capitalize">{displayName}</p>
                          <p className="text-xs text-[#64748B] truncate">{userEmail}</p>

                          {business?.name && !flags?.isSuperAdmin && (
                            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] text-xs font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse shrink-0" />
                              <Store size={12} className="text-[#2563EB] shrink-0" />
                              <span className="truncate">{business.name}</span>
                            </div>
                          )}

                          <div className="mt-2">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                              {flags?.isSuperAdmin ? "👑 Platform Super Admin" : flags?.isAdmin ? "🛡️ Store Admin" : "👤 Staff Member"}
                            </span>
                          </div>
                        </div>

                        <div className="py-1 space-y-0.5">
                          <Link
                            href="/profile"
                            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#0F172A] font-medium rounded-lg hover:bg-slate-100 transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            <User size={16} className="text-[#64748B]" />
                            <span>My Profile</span>
                          </Link>

                          {flags?.isAdmin && !flags?.isSuperAdmin && (
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                setIssueModalOpen(true);
                              }}
                              className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[#2563EB] font-semibold rounded-lg hover:bg-[#EFF6FF] transition-colors"
                            >
                              <LifeBuoy size={16} className="text-[#2563EB]" />
                              <span>Support & Issues</span>
                            </button>
                          )}

                          {flags?.isSuperAdmin && (
                            <Link
                              href="/super-admin"
                              className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#2563EB] font-semibold rounded-lg hover:bg-[#EFF6FF] transition-colors"
                              onClick={() => setMenuOpen(false)}
                            >
                              <Globe size={16} className="text-[#2563EB]" />
                              <span>Super Admin Hub</span>
                            </Link>
                          )}
                        </div>

                        <div className="pt-1 border-t border-slate-100">
                          <button
                            onClick={handleLogout}
                            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[#DC2626] font-medium rounded-lg hover:bg-[#FEF2F2] transition-colors"
                          >
                            <LogOut size={16} />
                            <span>Sign out</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Raise Issue / Support Ticket Modal */}
      <RaiseIssueModal isOpen={issueModalOpen} onClose={() => setIssueModalOpen(false)} />

      {/* Modern Mobile Bottom Navigation Bar - Only for staff or super admin */}
      {!isFocusMode && (!flags?.isAdmin || isSuperAdminView) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-[#E2E8F0] shadow-md pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around h-16 px-2">
            {allLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative flex flex-col items-center justify-center w-full h-full py-1 transition-all",
                    isActive ? "text-[#2563EB]" : "text-[#64748B] hover:text-[#0F172A]"
                  )}
                >
                  <div className={cn(
                    "p-1.5 rounded-lg transition-all duration-200",
                    isActive ? "bg-[#EFF6FF] scale-105" : "bg-transparent"
                  )}>
                    <Icon size={20} className={isActive ? "stroke-[2.5]" : "stroke-[1.75]"} />
                  </div>
                  <span className={cn(
                    "text-[10px] tracking-tight mt-0.5",
                    isActive ? "font-bold text-[#2563EB]" : "font-medium text-[#64748B]"
                  )}>
                    {link.label}
                  </span>
                  {isActive && (
                    <span className="w-1 h-1 rounded-full bg-[#2563EB] absolute bottom-1.5" />
                  )}
                </Link>
              );
            })}

            <Link
              href="/profile"
              className={cn(
                "relative flex flex-col items-center justify-center w-full h-full py-1 transition-all",
                pathname === "/profile" ? "text-[#2563EB]" : "text-[#64748B] hover:text-[#0F172A]"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-lg transition-all duration-200",
                pathname === "/profile" ? "bg-[#EFF6FF] scale-105" : "bg-transparent"
              )}>
                <User size={20} className={pathname === "/profile" ? "stroke-[2.5]" : "stroke-[1.75]"} />
              </div>
              <span className={cn(
                "text-[10px] tracking-tight mt-0.5",
                pathname === "/profile" ? "font-bold text-[#2563EB]" : "font-medium text-[#64748B]"
              )}>
                Profile
              </span>
              {pathname === "/profile" && (
                <span className="w-1 h-1 rounded-full bg-[#2563EB] absolute bottom-1.5" />
              )}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
