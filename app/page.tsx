"use client";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { preloadBillingCache } from "@/lib/utils/billing";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { CalendarCheck2, Coffee, ClipboardList, Shield, CalendarDays, Wallet, Boxes, Bell } from "lucide-react";

export default function Home() {
  const { user } = useUser();
  const { flags } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
      try { localStorage.setItem('bftone_display_email', user.email); } catch { }

      // Billing cache logic
      preloadBillingCache(supabaseClient);

    } else if (user === null) {
      setUserEmail(null);
      try { localStorage.removeItem('bftone_display_email'); } catch { }
    }
  }, [user]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-sky-700">Hello{userEmail ? `, ${userEmail.split("@")[0] || userEmail}` : ""}</h1>
        <p className="text-sm text-zinc-600">What would you like to do?</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/timesheet">
          <Card className="h-28 active:scale-[.99]">
            <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
              <CalendarCheck2 className="mb-1 text-sky-600" />
              Timesheet
            </CardContent>
          </Card>
        </Link>
        {(userEmail && (flags ? !flags.isAdmin : true)) && (
          <Link href="/mysalary">
            <Card className="h-28 active:scale-[.99]">
              <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
                <Wallet className="mb-1 text-emerald-600" />
                My Salary
              </CardContent>
            </Card>
          </Link>
        )}
        <Link href="/calendar">
          <Card className="h-28 active:scale-[.99]">
            <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
              <CalendarDays className="mb-1 text-sky-600" />
              Calendar
            </CardContent>
          </Card>
        </Link>
        <Link href="/billing">
          <Card className="h-28 active:scale-[.99]">
            <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
              <Coffee className="mb-1 text-sky-600" />
              Billing
            </CardContent>
          </Card>
        </Link>
        <Link href="/glass">
          <Card className="h-28 active:scale-[.99]">
            <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
              <ClipboardList className="mb-1 text-sky-600" />
              Glass Register
            </CardContent>
          </Card>
        </Link>
        <Link href="/pending">
          <Card className="h-28 active:scale-[.99]">
            <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
              <ClipboardList className="mb-1 text-sky-600" />
              Pending Orders
            </CardContent>
          </Card>
        </Link>
        {flags?.isAdmin && (
          <Link href="/admin">
            <Card className="h-28 active:scale-[.99]">
              <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
                <Shield className="mb-1 text-sky-600" />
                Admin
              </CardContent>
            </Card>
          </Link>
        )}
        {flags?.isStockManager && (
          <Link href="/stock">
            <Card className="h-28 active:scale-[.99]">
              <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
                <Boxes className="mb-1 text-amber-600" />
                Stock Manager
              </CardContent>
            </Card>
          </Link>
        )}
        <Link href="/notifications">
          <Card className="h-28 active:scale-[.99]">
            <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
              <Bell className="mb-1 text-rose-600" />
              Stock Notifications
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
