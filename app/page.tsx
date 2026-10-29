"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { preloadBillingCache } from "@/lib/utils/billing";
import { HomeHeader } from "@/components/home/HomeHeader";
import { DashboardGrid, DashboardItem } from "@/components/home/DashboardGrid";
import {
  CalendarCheck2, Coffee, Shield,
  CalendarDays, Wallet, Boxes, Bell, Contact, Banknote, CalendarPlus, TrendingDown, Receipt, FileText, TrendingUp, Megaphone
} from "lucide-react";

import { AdminDashboardView } from "@/components/admin-dashboard/AdminDashboardView";
import { EmployeeHubView } from "@/components/employee-hub/EmployeeHubView";

export default function Home() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { flags, loading: profileLoading } = useProfile();
  const { isModuleEnabled, isResolved } = useTenant();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [previewStaffId, setPreviewStaffId] = useState<string | null>(null);

  // App View Mode State: "cafe" (full POS/timesheets) vs "baker" (minimal dispatch/profit)
  const [appMode, setAppMode] = useState<"cafe" | "baker">(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("seyalpro_app_mode");
      if (cached === "baker" || cached === "cafe") return cached;
    }
    return "cafe";
  });

  const handleSwitchMode = (mode: "cafe" | "baker") => {
    setAppMode(mode);
    try {
      localStorage.setItem("seyalpro_app_mode", mode);
      window.dispatchEvent(new CustomEvent("seyalpro_mode_change", { detail: { mode } }));
    } catch {}
  };

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "seyalpro_app_mode" && (e.newValue === "baker" || e.newValue === "cafe")) {
        setAppMode(e.newValue);
      }
    };
    const handleCustomEvent = (e: any) => {
      if (e.detail?.mode === "baker" || e.detail?.mode === "cafe") {
        setAppMode(e.detail.mode);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("seyalpro_mode_change", handleCustomEvent);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("seyalpro_mode_change", handleCustomEvent);
    };
  }, []);

  const isBakerEnabled = isModuleEnabled ? isModuleEnabled("baker_mode") : false;
  const isBillingEnabled = isModuleEnabled ? isModuleEnabled("billing") : true;

  const isAdmin = Boolean(
    flags?.isAdmin ||
    flags?.isSuperAdmin ||
    (userEmail && userEmail.toLowerCase().includes("admin")) ||
    (user && user.email && user.email.toLowerCase().includes("admin"))
  );

  useEffect(() => {
    if (isBakerEnabled && !isBillingEnabled && appMode !== "baker") {
      setAppMode("baker");
      try {
        localStorage.setItem("seyalpro_app_mode", "baker");
      } catch {}
    } else if (!isBakerEnabled && isBillingEnabled && appMode === "baker") {
      setAppMode("cafe");
      try {
        localStorage.setItem("seyalpro_app_mode", "cafe");
      } catch {}
    }
  }, [isBakerEnabled, isBillingEnabled, appMode]);

  // If unauthenticated: redirect directly to /login
  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
    }
  }, [user, userLoading, router]);

  // If in B2B mode: redirect directly to /b2b (full B2B Executive Suite with sidebar)
  useEffect(() => {
    if (!userLoading && user && isAdmin && isResolved) {
      if (isBakerEnabled && (!isBillingEnabled || appMode === "baker")) {
        router.replace("/b2b");
      }
    }
  }, [userLoading, user, isAdmin, isResolved, isBakerEnabled, isBillingEnabled, appMode, router]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const pStaff = params.get("previewStaff");
      if (pStaff) setPreviewStaffId(pStaff);
    }
  }, []);

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
      try { localStorage.setItem('bftone_display_email', user.email); } catch { }
      // Preload retail billing cache if billing is enabled
      if (isBillingEnabled) {
        preloadBillingCache(supabaseClient);
      }
    } else if (user === null) {
      setUserEmail(null);
      try { localStorage.removeItem('bftone_display_email'); } catch { }
    }
  }, [user, isBillingEnabled]);

  // Dashboard Items with Deep Navy + Blue & Semantic Color Mapping
  const baseItems: DashboardItem[] = [
    ...(isAdmin ? [
      ...(isModuleEnabled("invoices") ? [{
        label: "Invoice Generator",
        href: "/invoices",
        icon: FileText,
        category: "Finance",
        badge: "Admin Only",
        colorTheme: "blue" as const,
        description: "Generate & track official tax invoices."
      }] : []),
      {
        label: "Admin Panel",
        href: "/admin",
        icon: Shield,
        category: "Admin",
        badge: "Admin Only",
        colorTheme: "navy" as const,
        description: "Manage users, permissions & store settings."
      },
      ...(isModuleEnabled("timesheet") ? [{
        label: "Manual Timesheet Entry",
        href: "/admin/fill-timesheet",
        icon: CalendarPlus,
        category: "Staff",
        badge: "Admin Only",
        colorTheme: "purple" as const,
        description: "Bulk update staff attendance & logs."
      }] : [])
    ] : []),
    ...(userEmail && !isAdmin ? [{
      label: "My Salary",
      href: "/mysalary",
      icon: Wallet,
      category: "Staff",
      badge: "Payout",
      colorTheme: "green" as const,
      description: "Check your earnings, allowances & stats."
    }] : []),
    {
      label: "Daily Sales",
      href: "/daily-sales",
      icon: TrendingUp,
      category: "Finance",
      badge: "Itemized",
      colorTheme: "green" as const,
      description: "Itemized sales, units sold, peak velocity & billing analytics."
    },
    {
      label: "Cash Settlement",
      href: "/sales",
      icon: Banknote,
      category: "Finance",
      colorTheme: "cyan" as const,
      description: "Record daily drawer cash & UPI closing settlements."
    },
    {
      label: "Daily Expense",
      href: "/expenses",
      icon: Receipt,
      category: "Finance",
      colorTheme: "amber" as const,
      description: "Log purchases, utility bills & vendor vouchers."
    },
    ...(userEmail ? [{
      label: "Late Deductions",
      href: "/deductions",
      icon: TrendingDown,
      category: "Staff",
      colorTheme: "red" as const,
      description: "View late deduction summaries & details."
    }] : []),
    {
      label: "Notice Board",
      href: "/notice-board",
      icon: Megaphone,
      category: "Staff",
      colorTheme: "blue" as const,
      description: "Company announcements & policy updates."
    },
    {
      label: "Calendar",
      href: "/calendar",
      icon: CalendarDays,
      category: "Staff",
      colorTheme: "blue" as const,
      description: "View team leave schedules & holidays."
    },
    ...(!isAdmin && isModuleEnabled("timesheet") ? [{
      label: "Timesheet",
      href: "/timesheet",
      icon: CalendarCheck2,
      category: "Staff",
      colorTheme: "cyan" as const,
      description: "Log daily attendance and check-ins."
    }] : []),
    {
      label: "All Contacts",
      href: "/contacts",
      icon: Contact,
      category: "Staff",
      colorTheme: "slate" as const,
      description: "Employee & vendor emergency directory."
    },
    ...(flags?.isAdmin || flags?.isStockManager ? [{
      label: "Inventory & Recipes",
      href: "/inventory",
      icon: Boxes,
      category: "Operations",
      badge: "BOM & POs",
      colorTheme: "blue" as const,
      description: "Raw items master, recipe formulas, procurement & audits."
    }] : []),
    {
      label: "Billing / POS",
      href: "/billing",
      icon: Coffee,
      category: "Live POS",
      badge: "Live POS",
      colorTheme: "blue" as const,
      isPrimary: true,
      description: "Point of sale register and table orders."
    },
    {
      label: "Notifications",
      href: "/notifications",
      icon: Bell,
      category: "Updates",
      colorTheme: "slate" as const,
      description: "View system alerts and announcements."
    }
  ];

  // While auth & tenant state is resolving, render a smooth minimal loading screen
  if (userLoading || profileLoading || !isResolved) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading workspace...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, redirecting to login
  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // If previewing as staff or Admin viewing in employee hub preview mode:
  if (previewStaffId) {
    const targetId =
      previewStaffId === "me" || previewStaffId === "current"
        ? (user?.id || null)
        : previewStaffId;
    return (
      <EmployeeHubView
        previewUserId={targetId}
        onExitPreview={() => {
          setPreviewStaffId(null);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("previewStaff");
            window.history.replaceState({}, "", url.toString());
          }
        }}
      />
    );
  }

  // If Admin Logged In: Check if user is in B2B Supply Mode vs Full Cafe Command Center
  if (isAdmin) {
    if (isBakerEnabled && (!isBillingEnabled || appMode === "baker")) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading B2B Supply Hub...</p>
          </div>
        </div>
      );
    }

    return (
      <AdminDashboardView
        baseItems={baseItems}
      />
    );
  }

  // Dedicated Employee / Staff Landing Page ("My journey with the company")
  return <EmployeeHubView />;
}
