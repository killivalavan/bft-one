"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import Navbar from "@/components/Navbar";
import { AdminSidebar } from "@/components/admin-dashboard/AdminSidebar";
import { SeyalLogo } from "@/components/ui/SeyalLogo";
import { cn } from "@/lib/utils/cn";
import { PanelLeftOpen, Bell, Store } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { flags } = useProfile();
  const { business } = useTenant();

  // Always OPEN by default, user can toggle if required
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      // Clear legacy localStorage so stale state from previous runs does not keep sidebar closed
      try {
        localStorage.removeItem("bftone_admin_sidebar_collapsed");
      } catch {}
      const saved = sessionStorage.getItem("bftone_admin_sidebar_collapsed");
      if (saved !== null) return saved === "true";
    }
    return false; // Always open by default!
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("bftone_admin_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
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

  const isPublicAuthPage = pathname === "/login" || pathname.startsWith("/super-admin/login");
  const isSuperAdminView = flags?.isSuperAdmin && pathname.startsWith("/super-admin");
  const showSidebar = !isSuperAdminView && !isPublicAuthPage;
  const isBillingPage = pathname === "/billing" || pathname.startsWith("/billing");

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

  if (isPublicAuthPage) {
    return <>{children}</>;
  }

  if (showSidebar) {
    return (
      <div className={cn("min-h-screen flex bg-[#F8FAFC]", isBillingPage && "h-screen max-h-screen overflow-hidden")}>
        {/* Full-Height Left Sidebar on Desktop & Off-Canvas Drawer on Mobile */}
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          storeName={business?.name || "SeyalPro Store"}
          isMobileOpen={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />

        {/* Right Main Column: Zero top navbar on desktop; minimal drawer trigger on mobile */}
        <div className={cn("flex-1 flex flex-col min-w-0", isBillingPage ? "h-screen max-h-screen overflow-hidden" : "min-h-screen")}>
          {!isBillingPage && (
            <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-3 sm:px-4 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => setIsMobileDrawerOpen(true)}
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-[#0F172A] flex items-center justify-center transition-all border border-slate-200/80 shadow-2xs shrink-0"
                  title="Open Navigation Menu"
                  aria-label="Open Navigation Menu"
                >
                  <PanelLeftOpen size={18} className="text-[#2563EB]" />
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

              {/* Mobile alerts icon trigger */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href="/notifications"
                  className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors relative"
                  title="Alerts & Notifications"
                >
                  <Bell size={18} />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#2563EB] rounded-full ring-2 ring-white" />
                </Link>
              </div>
            </header>
          )}
          <main className={cn(
            "flex-1 min-w-0",
            isBillingPage
              ? "p-0 h-full overflow-hidden flex flex-col"
              : "px-3 sm:px-6 lg:px-8 py-5 sm:py-7 pb-24"
          )}>
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Top Navbar for super admin */}
      <Navbar />
      <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1600px] px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 flex-1">
        {children}
      </div>
    </div>
  );
}
