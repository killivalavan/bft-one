"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { preloadBillingCache } from "@/lib/utils/billing";
import { HomeHeader } from "@/components/home/HomeHeader";
import { DashboardGrid } from "@/components/home/DashboardGrid";
import {
  CalendarCheck2, Coffee, ClipboardList, Shield,
  CalendarDays, Wallet, Boxes, Bell, LayoutDashboard, Contact, Banknote, CalendarPlus
} from "lucide-react";

export default function Home() {
  const { user } = useUser();
  const { flags } = useProfile();
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

  // Define Items
  const baseItems = [
    {
      label: "Glass Register",
      href: "/glass",
      icon: ClipboardList,
      colorClass: "text-blue-600",
      bgClass: "bg-blue-50",
      description: "Track glass inventory logs."
    },
    {
      label: "Timesheet",
      href: "/timesheet",
      icon: CalendarCheck2,
      colorClass: "text-sky-600",
      bgClass: "bg-sky-50",
      description: "Log attendance and daily work."
    },
    {
      label: "Calendar",
      href: "/calendar",
      icon: CalendarDays,
      colorClass: "text-indigo-600",
      bgClass: "bg-indigo-50",
      description: "View important dates and holidays."
    },
    ...(userEmail && (flags ? !flags.isAdmin : true) ? [{
      label: "My Salary",
      href: "/mysalary",
      icon: Wallet,
      colorClass: "text-emerald-600",
      bgClass: "bg-emerald-50",
      description: "Check your earnings and stats."
    }] : []),
    {
      label: "Billing",
      href: "/billing",
      icon: Coffee,
      colorClass: "text-amber-600",
      bgClass: "bg-amber-50",
      description: "Manage billing and invoices."
    },
    {
      label: "Pending Orders",
      href: "/pending",
      icon: LayoutDashboard,
      colorClass: "text-rose-600",
      bgClass: "bg-rose-50",
      description: "View and manage active orders."
    },
    {
      label: "All Contacts",
      href: "/contacts",
      icon: Contact,
      colorClass: "text-teal-600",
      bgClass: "bg-teal-50",
      description: "Employee & Emergency directory."
    },
    ...(flags?.isAdmin ? [{
      label: "Admin Panel",
      href: "/admin",
      icon: Shield,
      colorClass: "text-purple-600",
      bgClass: "bg-purple-50",
      description: "Manage users and settings."
    },
    {
      label: "Fill Timesheet",
      href: "/admin/fill-timesheet",
      icon: CalendarPlus,
      colorClass: "text-fuchsia-600",
      bgClass: "bg-fuchsia-50",
      description: "Bulk update attendance."
    }] : []),
    ...(flags?.isStockManager ? [{
      label: "Stock Manager",
      href: "/stock",
      icon: Boxes,
      colorClass: "text-orange-600",
      bgClass: "bg-orange-50",
      description: "Control inventory and supplies."
    }] : []),
    {
      label: "Daily Sales",
      href: "/sales",
      icon: Banknote,
      colorClass: "text-emerald-600",
      bgClass: "bg-emerald-50",
      description: "Add daily sales."
    },
    {
      label: "Notifications",
      href: "/notifications",
      icon: Bell,
      colorClass: "text-pink-600",
      bgClass: "bg-pink-50",
      description: "View alerts and messages."
    }
  ];

  return (
    <div className="min-h-screen pb-20 space-y-8">
      <HomeHeader name={userEmail} />
      <DashboardGrid items={baseItems} />
    </div>
  );
}
