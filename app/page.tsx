"use client";
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
  CalendarDays, Wallet, Boxes, Bell, Contact, Banknote, CalendarPlus, TrendingDown, Receipt, FileText
} from "lucide-react";

export default function Home() {
  const { user } = useUser();
  const { flags } = useProfile();
  const { isModuleEnabled } = useTenant();
  const [userEmail, setUserEmail] = useState<string | null>(null);

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

  // Dashboard Items with Deep Navy + Blue & Semantic Color Mapping
  const baseItems: DashboardItem[] = [
    ...(flags?.isAdmin ? [
      ...(isModuleEnabled("invoices") ? [{
        label: "Invoice Generator",
        href: "/invoices",
        icon: FileText,
        category: "Finance",
        badge: "Tax Ready",
        colorTheme: "blue" as const,
        description: "Generate & track official tax invoices."
      }] : []),
      {
        label: "Admin Panel",
        href: "/admin",
        icon: Shield,
        category: "Admin",
        badge: "Core",
        colorTheme: "navy" as const,
        description: "Manage users, permissions & store settings."
      },
      {
        label: "Fill Timesheet",
        href: "/admin/fill-timesheet",
        icon: CalendarPlus,
        category: "Staff",
        colorTheme: "purple" as const,
        description: "Bulk update staff attendance & logs."
      }
    ] : []),
    ...(userEmail && (flags ? !flags.isAdmin : true) ? [{
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
      href: "/sales",
      icon: Banknote,
      category: "Finance",
      colorTheme: "green" as const,
      description: "Record daily cash & UPI sales settlements."
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
      label: "Calendar",
      href: "/calendar",
      icon: CalendarDays,
      category: "Operations",
      colorTheme: "blue" as const,
      description: "View team leave schedules & holidays."
    },
    {
      label: "Timesheet",
      href: "/timesheet",
      icon: CalendarCheck2,
      category: "Staff",
      colorTheme: "cyan" as const,
      description: "Log daily attendance and check-ins."
    },
    {
      label: "All Contacts",
      href: "/contacts",
      icon: Contact,
      category: "Operations",
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
    }, {
      label: "Stock Manager",
      href: "/stock",
      icon: Boxes,
      category: "Operations",
      colorTheme: "purple" as const,
      description: "Quick POS finished goods counter & alerts."
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

  return (
    <div className="min-h-screen pb-20 space-y-6">
      <HomeHeader name={userEmail} />
      <DashboardGrid items={baseItems} />
    </div>
  );
}
