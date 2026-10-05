"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
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
  Store,
  Sparkles,
  CalendarDays,
  Contact
} from "lucide-react";

export interface NavItemConfig {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  category: "CORE" | "OPERATIONS" | "FINANCE" | "STAFF" | "ADMIN";
  badge?: string;
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
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

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
      label: "Command Center",
      href: "/",
      icon: LayoutDashboard,
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
      id: "invoices",
      label: "Tax Invoices",
      href: "/invoices",
      icon: FileText,
      category: "FINANCE",
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
      id: "timesheet",
      label: "Timesheets",
      href: "/timesheet",
      icon: CalendarCheck2,
      category: "STAFF",
      colorScheme: "cyan",
    },
    {
      id: "fill-timesheet",
      label: "Fill Attendance",
      href: "/admin/fill-timesheet",
      icon: CalendarPlus,
      category: "STAFF",
      colorScheme: "purple",
    },
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
      category: "OPERATIONS",
      colorScheme: "blue",
    },
    {
      id: "contacts",
      label: "Directory",
      href: "/contacts",
      icon: Contact,
      category: "OPERATIONS",
      colorScheme: "slate",
    },
    {
      id: "admin",
      label: "Store Settings",
      href: "/admin",
      icon: Shield,
      category: "ADMIN",
      badge: "Core",
      colorScheme: "blue",
    },
    {
      id: "notifications",
      label: "Alerts",
      href: "/notifications",
      icon: Bell,
      category: "ADMIN",
      colorScheme: "slate",
    },
  ];

  const categories = ["CORE", "OPERATIONS", "FINANCE", "STAFF", "ADMIN"] as const;

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
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-sm text-white tracking-tight truncate leading-tight">
                Seyal<span className="text-blue-400">Pro</span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate font-medium flex items-center gap-1 mt-0.5">
                <Store size={11} className="text-blue-400 shrink-0" />
                <span className="truncate">{storeName}</span>
              </p>
            </div>
          </div>

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
                <div className="px-2.5 pt-2 pb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {cat}
                </div>
                {itemsInCat.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.id === "dashboard" && pathname === "/");

                  return (
                    <Link
                      key={`mob-${item.id}`}
                      href={item.href}
                      onClick={() => {
                        if (onSelectInternalView) onSelectInternalView(item.id);
                        if (onItemClick) onItemClick();
                        if (onCloseMobile) onCloseMobile();
                      }}
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

                      {item.badge && (
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
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
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
          /* Collapsed Mode: Brand Gem / Toggle Trigger */
          <button
            onClick={onToggleCollapse}
            title="Expand Sidebar (Ctrl+B)"
            aria-label="Expand Sidebar"
            className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center shadow-xs transition-all group relative"
          >
            <PanelLeftOpen size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        ) : (
          /* Expanded Mode: Full Brand + Store + Collapse Button */
          <>
            <div className="flex items-center gap-2.5 min-w-0 pr-1">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Sparkles size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="font-extrabold text-sm text-white tracking-tight truncate leading-tight">
                  Seyal<span className="text-blue-400">Pro</span>
                </h2>
                <p className="text-[10px] text-slate-400 truncate font-medium flex items-center gap-1 mt-0.5">
                  <Store size={10} className="text-blue-400 shrink-0" />
                  <span className="truncate">{storeName}</span>
                </p>
              </div>
            </div>

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
                <div className="px-2 pt-1 pb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                  {cat}
                </div>
              ) : (
                <div className="h-px bg-slate-800/60 mx-1.5 my-0.5" />
              )}

              {/* Items */}
              {itemsInCat.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.id === "dashboard" && pathname === "/");

                return (
                  <div
                    key={item.id}
                    className="relative group"
                    onMouseEnter={() => isCollapsed && setHoveredItem(item.id)}
                    onMouseLeave={() => isCollapsed && setHoveredItem(null)}
                  >
                    <Link
                      href={item.href}
                      onClick={() => {
                        if (onSelectInternalView) onSelectInternalView(item.id);
                        if (onItemClick) onItemClick();
                      }}
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
                      {!isCollapsed && item.badge && (
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
                      )}
                    </Link>

                    {/* Collapsed Mode: Hover Floating Tooltip */}
                    {isCollapsed && hoveredItem === item.id && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-xl border border-slate-700 whitespace-nowrap z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-100 flex items-center gap-1.5">
                        <span className="font-bold">{item.label}</span>
                        {item.badge && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-extrabold uppercase bg-blue-600/30 text-blue-300 border border-blue-500/30">
                            {item.badge}
                          </span>
                        )}
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
    </aside>
    </>
  );
}
