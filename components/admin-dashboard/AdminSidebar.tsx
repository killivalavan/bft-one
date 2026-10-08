"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { supabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils/cn";
import { SeyalLogo } from "@/components/ui/SeyalLogo";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Coffee,
  TrendingUp,
  FileText,
  Boxes,
  Banknote,
  Receipt,
  CalendarCheck2,
  CalendarPlus,
  TrendingDown,
  Shield,
  Bell,
  ChevronRight,
  ChevronUp,
  Store,
  Sparkles,
  CalendarDays,
  Contact,
  Users,
  LifeBuoy,
  User,
  LogOut,
  Wallet,
  Megaphone
} from "lucide-react";

export interface NavItemConfig {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  category: "CORE" | "OPERATIONS" | "FINANCE" | "STAFF" | "ADMIN";
  badge?: string;
  adminOnly?: boolean;
  colorScheme?: "blue" | "emerald" | "amber" | "purple" | "cyan" | "rose" | "slate";
}

interface AdminSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onItemClick?: () => void;
  storeName?: string;
  activeItem?: string;
  onSelectInternalView?: (viewId: string) => void;
  isGridViewActive?: boolean;
  onToggleGridView?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AdminSidebar({
  isCollapsed,
  onToggleCollapse,
  onItemClick,
  storeName = "SeyalPro Store",
  activeItem = "dashboard",
  onSelectInternalView,
  isGridViewActive = false,
  onToggleGridView,
  isMobileOpen = false,
  onCloseMobile,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const { flags } = useProfile();

  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("bftone_display_email") || undefined;
      } catch {}
    }
    return undefined;
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);

  const [cachedIsAdmin, setCachedIsAdmin] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith("bftone_flags") || key === "bftone_flags")) {
            const val = JSON.parse(localStorage.getItem(key) || "{}");
            if (val.is_admin || val.is_super_admin || val.isAdmin || val.isSuperAdmin) return true;
          }
        }
        const email = localStorage.getItem("bftone_display_email");
        if (email && email.toLowerCase().includes("admin")) return true;
      } catch {}
    }
    return false;
  });

  // Sync display email
  React.useEffect(() => {
    try {
      const cached = typeof window !== "undefined" ? localStorage.getItem("bftone_display_email") : null;
      if (cached) setUserEmail(cached);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (user) {
      setUserEmail(user.email);
      try { localStorage.setItem("bftone_display_email", user.email!); } catch {}
    } else if (!loading) {
      setUserEmail(undefined);
      try { localStorage.removeItem("bftone_display_email"); } catch {}
    }
  }, [user, loading]);

  // Click outside to close profile popover
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Close popover when collapsing/expanding
  React.useEffect(() => {
    setProfileMenuOpen(false);
  }, [isCollapsed]);

  const isAdmin = Boolean(
    flags?.isAdmin ||
    flags?.isSuperAdmin ||
    cachedIsAdmin ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/super-admin") ||
    (userEmail && userEmail.toLowerCase().includes("admin")) ||
    (user && user.email && user.email.toLowerCase().includes("admin"))
  );

  const userRoleTitle = isAdmin
    ? "Store Admin"
    : flags?.isStockManager
    ? "Stock Manager"
    : "Staff Member";

  const displayName = userEmail ? userEmail.split("@")[0] : null;
  const initial = displayName ? displayName[0].toUpperCase() : (isAdmin ? "A" : "S");

  async function handleLogout() {
    try {
      await Promise.race([
        supabaseClient.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);
    } catch (e) {
      console.error("Logout error/timeout", e);
    } finally {
      setProfileMenuOpen(false);
      try { localStorage.removeItem("bftone_display_email"); } catch {}
      try { localStorage.removeItem("bftone_tenant_cache"); } catch {}
      try { localStorage.removeItem("bftone_flags"); } catch {}
      if (typeof document !== "undefined") {
        document.cookie = "tenant_slug=; path=/; max-age=0; SameSite=Lax";
      }
      window.location.href = "/login";
    }
  }

  // Prevent background scroll when mobile drawer is open
  React.useEffect(() => {
    if (typeof document !== "undefined") {
      if (isMobileOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    };
  }, [isMobileOpen]);

  // Escape key closes mobile drawer
  React.useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseMobile?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const navItems: NavItemConfig[] = [
    {
      id: "dashboard",
      label: isAdmin ? "Command Center" : "Employee Hub",
      href: "/",
      icon: isAdmin ? LayoutDashboard : Sparkles,
      category: "CORE",
      colorScheme: "blue",
    },
    {
      id: "billing",
      label: "Billing / POS",
      href: "/billing",
      icon: Coffee,
      category: "OPERATIONS",
      badge: "POS",
      colorScheme: "blue",
    },
    {
      id: "daily-sales",
      label: "Orders & Sales",
      href: "/daily-sales",
      icon: TrendingUp,
      category: "OPERATIONS",
      badge: "Live",
      colorScheme: "emerald",
    },
    {
      id: "inventory",
      label: "Inventory & BOM",
      href: "/inventory",
      icon: Boxes,
      category: "OPERATIONS",
      badge: "BOM",
      colorScheme: "purple",
    },
    {
      id: "notifications",
      label: "Alerts",
      href: "/notifications",
      icon: Bell,
      category: "OPERATIONS",
      colorScheme: "slate",
    },
    {
      id: "notice-board",
      label: "Notice Board",
      href: "/notice-board",
      icon: Megaphone,
      category: "STAFF",
      badge: "Board",
      colorScheme: "blue",
    },
    ...(!isAdmin
      ? [
          {
            id: "timesheet",
            label: "Timesheets",
            href: "/timesheet",
            icon: CalendarCheck2,
            category: "STAFF" as const,
            colorScheme: "cyan" as const,
          },
          {
            id: "salary",
            label: "My Salary",
            href: "/mysalary",
            icon: Wallet,
            category: "STAFF" as const,
            colorScheme: "emerald" as const,
          },
        ]
      : []),
    {
      id: "deductions",
      label: "Late Deductions",
      href: "/deductions",
      icon: TrendingDown,
      category: "STAFF",
      colorScheme: "rose",
    },
    {
      id: "calendar",
      label: "Calendar",
      href: "/calendar",
      icon: CalendarDays,
      category: "STAFF",
      colorScheme: "blue",
    },
    {
      id: "contacts",
      label: "Contacts",
      href: "/contacts",
      icon: Contact,
      category: "STAFF",
      colorScheme: "slate",
    },
    {
      id: "invoices",
      label: "Tax Invoices",
      href: "/invoices",
      icon: FileText,
      category: "FINANCE",
      adminOnly: true,
      colorScheme: "blue",
    },
    {
      id: "sales",
      label: "Cash Settlement",
      href: "/sales",
      icon: Banknote,
      category: "FINANCE",
      colorScheme: "cyan",
    },
    {
      id: "expenses",
      label: "Daily Expenses",
      href: "/expenses",
      icon: Receipt,
      category: "FINANCE",
      colorScheme: "amber",
    },
    {
      id: "admin-users",
      label: "Users & Roles",
      href: "/admin/users",
      icon: Users,
      category: "ADMIN",
      colorScheme: "blue",
    },
    {
      id: "fill-timesheet",
      label: "Manual Timesheet Entry",
      href: "/admin/fill-timesheet",
      icon: CalendarPlus,
      category: "ADMIN",
      colorScheme: "purple",
    },
    {
      id: "admin-store",
      label: "Business Profile",
      href: "/admin/store",
      icon: Store,
      category: "ADMIN",
      colorScheme: "blue",
    },
    {
      id: "admin-support",
      label: "Support & Issues",
      href: "/admin/support",
      icon: LifeBuoy,
      category: "ADMIN",
      colorScheme: "amber",
    },
  ];

  const isItemActive = (item: NavItemConfig) => {
    if (item.id === "dashboard" && pathname === "/") return true;
    if (item.id === "admin-users" && (pathname === "/admin/users" || pathname === "/admin")) return true;
    return pathname === item.href;
  };

  const handleNavClick = (item: NavItemConfig) => {
    if (onSelectInternalView) onSelectInternalView(item.id);
    if (onItemClick) onItemClick();
    if (onCloseMobile) onCloseMobile();
  };

  const categories = ["CORE", "OPERATIONS", "STAFF", "FINANCE", "ADMIN"] as const;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 transition-opacity duration-300 md:hidden",
          isMobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      {/* Mobile Slide-Over Drawer (< md screens) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] flex flex-col bg-[#0B132B] border-r border-slate-800 text-slate-300 shadow-2xl transition-transform duration-300 ease-in-out md:hidden select-none",
          isMobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        )}
        aria-label="Mobile Admin Navigation Drawer"
      >
        {/* Mobile Header: Brand + Store + Close Button */}
        <div className="flex items-center justify-between h-[68px] px-3.5 border-b border-slate-800/80 shrink-0">
          <Link href="/" className="min-w-0 pr-2">
            <SeyalLogo size={36} showWordmark theme="dark" />
          </Link>

          <button
            onClick={onCloseMobile}
            title="Close Menu"
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700/80 transition-all shrink-0"
            aria-label="Close Menu"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Prominent Store Identity Badge in Mobile Drawer */}
        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-white shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Store size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <p className="text-xs font-bold text-white truncate leading-tight" title={storeName}>
                  {storeName}
                </p>
              </div>
              <span className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider block mt-0.5">
                Connected Store
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Nav Items with 48px touch targets */}
        <div className="flex-1 overflow-y-auto py-2.5 px-2.5 space-y-2.5 scrollbar-none pb-[env(safe-area-inset-bottom,24px)]">
          {categories.map((cat) => {
            const itemsInCat = navItems.filter((item) => item.category === cat);
            if (itemsInCat.length === 0) return null;

            return (
              <div key={`mob-${cat}`} className="space-y-1">
                <div className="px-2.5 pt-2 pb-0.5 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    {cat}
                  </span>
                  {cat === "ADMIN" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold tracking-wider uppercase bg-amber-400/10 text-amber-300 border border-amber-400/25">
                      <Shield size={9} className="text-amber-400 shrink-0" />
                      <span>Admin Access</span>
                    </span>
                  )}
                </div>
                {itemsInCat.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(item);

                  return (
                    <Link
                      key={`mob-${item.id}`}
                      href={item.href}
                      onClick={() => handleNavClick(item)}
                      className={cn(
                        "relative flex items-center min-h-[46px] px-3 py-2 rounded-xl font-semibold transition-all duration-150 justify-between text-sm active:scale-[0.98]",
                        isActive
                          ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30"
                          : "text-slate-300 hover:text-white hover:bg-slate-800/80"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          size={18}
                          className={cn(
                            "shrink-0",
                            isActive ? "text-white" : "text-slate-400"
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.adminOnly ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wider shrink-0 border transition-all",
                            isActive
                              ? "bg-amber-400/25 text-amber-200 border-amber-300/40 shadow-xs"
                              : "bg-amber-400/10 text-amber-300 border-amber-400/25"
                          )}
                        >
                          <Shield size={10} className="text-amber-400 shrink-0" />
                          <span>Admin</span>
                        </span>
                      ) : item.badge ? (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 border",
                            isActive
                              ? "bg-blue-700/60 text-white border-blue-400/40"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          )}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Mobile Drawer Admin Profile & Session Footer (Directly below Alerts) */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/95 shrink-0 space-y-2.5">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white font-extrabold text-sm flex items-center justify-center shadow-md shadow-blue-900/30">
                {initial}
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B132B] absolute -bottom-0.5 -right-0.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold text-white capitalize truncate leading-tight">
                  {displayName || userRoleTitle}
                </p>
                {!flags?.isAdmin && (
                  <span className={cn(
                    "px-1.5 py-0.2 rounded text-[8.5px] font-extrabold uppercase shrink-0 border",
                    flags?.isStockManager
                      ? "bg-purple-500/20 text-purple-300 border-purple-400/30"
                      : "bg-blue-500/20 text-blue-300 border-blue-400/30"
                  )}>
                    {flags?.isStockManager ? "Manager" : "Staff"}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                {userEmail || (flags?.isAdmin ? "admin@seyalpro.com" : "staff@seyalpro.com")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <Link
              href="/profile"
              onClick={onCloseMobile}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-800 hover:text-white border border-slate-700/60 active:scale-95 transition-all min-h-[40px]"
            >
              <User size={14} className="text-blue-400 shrink-0" />
              <span>My Profile</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 active:scale-95 transition-all min-h-[40px]"
            >
              <LogOut size={14} className="shrink-0" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop Sticky Sidebar (>= md screens) */}
      <aside
        className={cn(
          "hidden md:flex sticky top-0 h-screen flex-col bg-[#0B132B] border-r border-slate-800 text-slate-300 transition-all duration-200 ease-in-out z-40 select-none shadow-xl shrink-0 rounded-none overflow-hidden",
          isCollapsed ? "w-[60px] sm:w-[64px]" : "w-[240px] md:w-[250px]"
        )}
      >
      {/* Top Header (Height 68px matching top Navbar) */}
      <div className={cn(
        "flex items-center h-[68px] px-2.5 border-b border-slate-800/80 transition-all shrink-0",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {isCollapsed ? (
          /* Collapsed Mode: Toggle Trigger */
          <button
            onClick={onToggleCollapse}
            title="Expand Sidebar (Ctrl+B)"
            aria-label="Expand Sidebar"
            className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all border border-slate-700/80"
          >
            <PanelLeftOpen size={18} />
          </button>
        ) : (
          /* Expanded Mode: Full Brand + Store + Collapse Button */
          <>
            <Link href="/" className="min-w-0 pr-1">
              <SeyalLogo size={36} showWordmark theme="dark" />
            </Link>

            <button
              onClick={onToggleCollapse}
              title="Collapse Sidebar (Ctrl+B)"
              aria-label="Collapse Sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/90 active:scale-95 transition-all flex items-center justify-center border border-slate-800"
            >
              <PanelLeftClose size={16} className="text-slate-300" />
            </button>
          </>
        )}
      </div>

      {/* Prominent Store Identity Badge inside Desktop Sidebar */}
      {!isCollapsed ? (
        <div className="px-2 pt-2 pb-1 shrink-0">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-white shadow-2xs">
            <div className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Store size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <p className="text-xs font-bold text-white truncate leading-tight" title={storeName}>
                  {storeName}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-1.5 flex justify-center shrink-0">
          <div
            className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-center text-blue-400 relative group cursor-default"
            title={`Store: ${storeName}`}
          >
            <Store size={14} />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-1 right-1" />
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-xl border border-slate-700 whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="font-bold">{storeName}</span>
              <span className="text-[10px] text-slate-400 block">Connected Store</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Links Area - Completely Scroll-Free / Hidden Scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-1.5 space-y-1.5 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {categories.map((cat) => {
          const itemsInCat = navItems.filter((item) => item.category === cat);
          if (itemsInCat.length === 0) return null;

          return (
            <div key={cat} className="space-y-0.5">
              {/* Category Header */}
              {!isCollapsed ? (
                <div className="px-2 pt-1.5 pb-0.5 flex items-center justify-between">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                    {cat}
                  </span>
                  {cat === "ADMIN" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase bg-amber-400/10 text-amber-300 border border-amber-400/25">
                      <Shield size={8} className="text-amber-400 shrink-0" />
                      <span>Admin Access</span>
                    </span>
                  )}
                </div>
              ) : (
                <div className="h-px bg-slate-800/60 mx-1.5 my-0.5" />
              )}

              {/* Items */}
              {itemsInCat.map((item) => {
                const Icon = item.icon;
                const isActive = isItemActive(item);

                return (
                  <div
                    key={item.id}
                    className="relative group"
                    onMouseEnter={() => isCollapsed && setHoveredItem(item.id)}
                    onMouseLeave={() => isCollapsed && setHoveredItem(null)}
                  >
                    <Link
                      href={item.href}
                      onClick={() => handleNavClick(item)}
                      className={cn(
                        "relative flex items-center rounded-lg font-semibold transition-all duration-150 group/link",
                        isCollapsed
                          ? "w-9 h-8 mx-auto justify-center"
                          : "px-2 py-1.5 gap-2.5 justify-between text-xs",
                        isActive
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-slate-300 hover:text-white hover:bg-slate-800/80"
                      )}
                    >
                      {/* Active Indicator Bar on Left */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white rounded-r-full" />
                      )}

                      {/* Subtle admin indicator dot in collapsed mode */}
                      {isCollapsed && item.adminOnly && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-[#0B132B] absolute top-1 right-1"
                          title="Admin privilege required"
                        />
                      )}

                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          size={16}
                          className={cn(
                            "shrink-0 transition-transform duration-150 group-hover/link:scale-110",
                            isActive ? "text-white" : "text-slate-400 group-hover/link:text-blue-400"
                          )}
                        />
                        {!isCollapsed && (
                          <span className="truncate text-xs">{item.label}</span>
                        )}
                      </div>

                      {/* Badge if present */}
                      {!isCollapsed && (
                        item.adminOnly ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider uppercase shrink-0 border transition-all",
                              isActive
                                ? "bg-amber-400/25 text-amber-200 border-amber-300/40 shadow-xs"
                                : "bg-amber-400/10 text-amber-300 border-amber-400/25 group-hover/link:bg-amber-400/20 group-hover/link:border-amber-400/40"
                            )}
                            title="Store Administrator Privilege Required"
                          >
                            <Shield size={9} className="text-amber-400 shrink-0" />
                            <span>Admin</span>
                          </span>
                        ) : item.badge ? (
                          <span
                            className={cn(
                              "px-1 py-0.2 rounded text-[8.5px] font-bold uppercase tracking-wider shrink-0 border",
                              isActive
                                ? "bg-blue-700/60 text-white border-blue-400/40"
                                : "bg-slate-800 text-slate-300 border-slate-700"
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null
                      )}
                    </Link>

                    {/* Collapsed Mode: Hover Floating Tooltip */}
                    {isCollapsed && hoveredItem === item.id && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-xl border border-slate-700 whitespace-nowrap z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-100 flex items-center gap-1.5">
                        <span className="font-bold">{item.label}</span>
                        {item.adminOnly ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase bg-amber-400/15 text-amber-300 border border-amber-400/30">
                            <Shield size={9} className="text-amber-400" />
                            Admin
                          </span>
                        ) : item.category === "ADMIN" ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-400/10 text-amber-300 border border-amber-400/25">
                            <Shield size={8} className="text-amber-400" />
                            Admin
                          </span>
                        ) : item.badge ? (
                          <span className="px-1 py-0.2 rounded text-[8px] font-extrabold uppercase bg-blue-600/30 text-blue-300 border border-blue-500/30">
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Bottom Switcher: Compact view switch */}
      {onToggleGridView && (
        <div className="p-1 border-t border-slate-800/80 bg-slate-950/40 shrink-0">
          <button
            onClick={onToggleGridView}
            className={cn(
              "w-full flex items-center rounded-lg p-1.5 text-xs font-semibold transition-all border border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/70 text-slate-300 hover:text-white",
              isCollapsed ? "justify-center" : "justify-between"
            )}
            title={isGridViewActive ? "Switch to PetPooja Command View" : "Move tiles to Main Grid"}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <LayoutDashboard size={12} />
              </div>
              {!isCollapsed && (
                <span className="text-[11px] font-bold truncate">
                  {isGridViewActive ? "Command Feed" : "Tiles Grid"}
                </span>
              )}
            </div>
            {!isCollapsed && <ChevronRight size={12} className="text-slate-400" />}
          </button>
        </div>
      )}

      {/* Desktop Admin Profile & Session Footer (Directly below Alerts) */}
      <div
        ref={profileMenuRef}
        className={cn(
          "border-t border-slate-800/80 bg-slate-950/80 shrink-0 relative transition-all duration-200",
          isCollapsed ? "py-2.5 px-2 flex justify-center" : "p-2"
        )}
      >
        {/* Floating Dropup / Flyout Menu */}
        {profileMenuOpen && (
          <div
            className={cn(
              "bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in duration-150 backdrop-blur-xl",
              isCollapsed
                ? "absolute left-full bottom-2 ml-3 w-64 zoom-in-95"
                : "absolute bottom-full left-2 right-2 mb-2 slide-in-from-bottom-2"
            )}
          >
            {/* Popover Header */}
            <div className="px-2.5 py-2 border-b border-slate-800/80 mb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white capitalize truncate">{displayName || userRoleTitle}</p>
                  <p className="text-[10px] text-slate-400 truncate">{userEmail}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border",
                  flags?.isAdmin
                    ? "bg-amber-500/15 text-amber-300 border-amber-400/30"
                    : flags?.isStockManager
                    ? "bg-purple-500/15 text-purple-300 border-purple-400/30"
                    : "bg-blue-500/15 text-blue-300 border-blue-400/30"
                )}>
                  {flags?.isAdmin ? (
                    <>
                      <Shield size={10} className="text-amber-400" />
                      Store Admin
                    </>
                  ) : flags?.isStockManager ? (
                    <>
                      <Boxes size={10} className="text-purple-400" />
                      Stock Manager
                    </>
                  ) : (
                    <>
                      <User size={10} className="text-blue-400" />
                      Staff Member
                    </>
                  )}
                </span>
                <span className="text-[9.5px] text-slate-400 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              </div>
            </div>

            {/* Popover Links */}
            <div className="space-y-0.5 py-0.5">
              <Link
                href="/profile"
                onClick={() => setProfileMenuOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:text-white rounded-xl hover:bg-slate-800/90 transition-colors"
              >
                <User size={15} className="text-blue-400 shrink-0" />
                <span>My Profile & Settings</span>
              </Link>

              {isAdmin ? (
                <>
                  <Link
                    href="/admin/store"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:text-white rounded-xl hover:bg-slate-800/90 transition-colors"
                  >
                    <Store size={15} className="text-blue-400 shrink-0" />
                    <span>Business Profile</span>
                  </Link>

                  <Link
                    href="/admin/support"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:text-white rounded-xl hover:bg-slate-800/90 transition-colors"
                  >
                    <LifeBuoy size={15} className="text-amber-400 shrink-0" />
                    <span>Support & Issues Hub</span>
                  </Link>
                </>
              ) : (
                <Link
                  href="/mysalary"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:text-white rounded-xl hover:bg-slate-800/90 transition-colors"
                >
                  <Wallet size={15} className="text-emerald-400 shrink-0" />
                  <span>My Salary & Stats</span>
                </Link>
              )}
            </div>

            {/* Popover Sign Out */}
            <div className="pt-1 mt-1 border-t border-slate-800/80">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 rounded-xl hover:bg-rose-500/15 transition-colors text-left"
              >
                <LogOut size={15} className="shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        )}

        {/* Collapsed Mode Avatar Trigger */}
        {isCollapsed ? (
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs hover:scale-105 hover:ring-2 hover:ring-blue-400 transition-all group"
            title={`${userRoleTitle}: ${displayName || "User"} (${userEmail}) - Click for options`}
            aria-label="User Profile and Settings"
          >
            {initial}
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B132B] absolute -bottom-0.5 -right-0.5" />
          </button>
        ) : (
          /* Expanded Mode Profile Card Trigger */
          <div
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700/80 transition-all cursor-pointer group select-none shadow-xs"
            title={`${userRoleTitle} Account & Settings`}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-1">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                  {initial}
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0B132B] absolute -bottom-0.5 -right-0.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-white capitalize truncate leading-tight group-hover:text-blue-300 transition-colors">
                    {displayName || userRoleTitle}
                  </p>
                  {!flags?.isAdmin && (
                    <span className={cn(
                      "px-1 py-0.2 rounded text-[8px] font-extrabold uppercase shrink-0 border",
                      flags?.isStockManager
                        ? "bg-purple-500/20 text-purple-300 border-purple-400/30"
                        : "bg-blue-500/20 text-blue-300 border-blue-400/30"
                    )}>
                      {flags?.isStockManager ? "Manager" : "Staff"}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5" title={userEmail}>
                  {userEmail || (flags?.isAdmin ? "admin@seyalpro.com" : "staff@seyalpro.com")}
                </p>
              </div>
            </div>

            <div className="flex items-center shrink-0">
              <div className={cn(
                "w-6 h-6 rounded-lg text-slate-400 group-hover:text-white flex items-center justify-center transition-transform duration-200",
                profileMenuOpen ? "rotate-180" : ""
              )}>
                <ChevronUp size={14} />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
