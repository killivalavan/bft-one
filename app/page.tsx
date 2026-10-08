"use client";
import Link from "next/link";
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
  const { user, loading: userLoading } = useUser();
  const { flags, loading: profileLoading } = useProfile();
  const { isModuleEnabled } = useTenant();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [previewStaffId, setPreviewStaffId] = useState<string | null>(null);

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
      preloadBillingCache(supabaseClient);
    } else if (user === null) {
      setUserEmail(null);
      try { localStorage.removeItem('bftone_display_email'); } catch { }
    }
  }, [user]);

  const isAdmin = Boolean(
    flags?.isAdmin ||
    flags?.isSuperAdmin ||
    (userEmail && userEmail.toLowerCase().includes("admin")) ||
    (user && user.email && user.email.toLowerCase().includes("admin"))
  );

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
      {
        label: "Manual Timesheet Entry",
        href: "/admin/fill-timesheet",
        icon: CalendarPlus,
        category: "Staff",
        badge: "Admin Only",
        colorTheme: "purple" as const,
        description: "Bulk update staff attendance & logs."
      }
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
    ...(!isAdmin ? [{
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

  // While auth state is resolving, render a smooth minimal loading screen
  if (userLoading || profileLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading workspace...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show sign-in prompt
  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-lg space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Sign in to SeyalPro</h2>
          <p className="text-sm text-slate-500">
            Please sign in with your employee account to view your dashboard.
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition shadow-sm"
            >
              Go to Login
            </Link>
          </div>
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

  // If Admin Logged In: Render PetPooja-inspired Executive Store Command Center with left slide navbar
  if (isAdmin) {
    return (
      <div className="min-h-screen">
        <AdminDashboardView baseItems={baseItems} />
      </div>
    );
  }

  // Dedicated Employee / Staff Landing Page ("My journey with the company")
  return <EmployeeHubView />;
}
