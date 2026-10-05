"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import Navbar from "@/components/Navbar";
import { AdminSidebar } from "@/components/admin-dashboard/AdminSidebar";
import { cn } from "@/lib/utils/cn";

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
  const showAdminSidebar = flags?.isAdmin && !isSuperAdminView && !isPublicAuthPage;
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

  // Full-screen POS layout for non-admin staff
  if (isBillingPage && !showAdminSidebar) {
    return (
      <div className="h-screen max-h-screen w-full overflow-hidden bg-[#F8FAFC] flex flex-col">
        {children}
      </div>
    );
  }

  if (showAdminSidebar) {
    return (
      <div className={cn("min-h-screen flex bg-[#F8FAFC]", isBillingPage && "h-screen max-h-screen overflow-hidden")}>
        {/* Full-Height Left Sidebar on Desktop & Off-Canvas Drawer on Mobile */}
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          storeName={business?.name || "Store Admin"}
          isMobileOpen={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />

        {/* Right Main Column: Top Header (hidden for billing POS) + Page Content */}
        <div className="flex-1 flex flex-col min-w-0 h-full max-h-screen overflow-hidden">
          {!isBillingPage && (
            <Navbar
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleMobileMenu={() => setIsMobileDrawerOpen((prev) => !prev)}
            />
          )}
          <main className={cn(
            "flex-1 min-w-0",
            isBillingPage
              ? "p-0 h-full overflow-hidden flex flex-col"
              : "px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 overflow-x-auto"
          )}>
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Top Navbar for non-admin staff / super admin */}
      <Navbar />
      <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1600px] px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 flex-1">
        {children}
      </div>
    </div>
  );
}
