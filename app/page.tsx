"use client";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CalendarCheck2, Coffee, ClipboardList, Shield, CalendarDays, Wallet, Boxes, Bell, User } from "lucide-react";

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [flags, setFlags] = useState<{ is_admin:boolean; is_stock_manager:boolean }|null>(null);
  useEffect(()=>{
    async function load(){
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('bftone_flags') : null;
        if (raw) {
          const cached = JSON.parse(raw || 'null');
          if (cached && typeof cached === 'object') setFlags(cached);
        }
      } catch {}
      let { data: { session } } = await supabaseClient.auth.getSession();
      let user = session?.user || null;
      if (!user) {
        const { data: { user: u } } = await supabaseClient.auth.getUser();
        user = u ?? null;
      }
      if (user?.email) {
        setUserEmail(user.email);
        try { localStorage.setItem('bftone_display_email', user.email); } catch {}
      } 
      if (user) {
        const { data: prof } = await supabaseClient.from('profiles').select('is_admin,is_stock_manager').eq('id', user.id).maybeSingle();
        const f = { is_admin: !!prof?.is_admin, is_stock_manager: !!prof?.is_stock_manager };
        setFlags(f);
        try { localStorage.setItem('bftone_flags', JSON.stringify(f)); } catch {}
        // Preload Billing caches in background
        try {
          const ts = Number(sessionStorage.getItem('billing_cache_at')||'0');
          if (!ts || (Date.now()-ts) > 5*60*1000) {
            const [catsRes, prodsRes, stkRes] = await Promise.all([
              supabaseClient.from("categories").select("*").order("name"),
              supabaseClient.from("products").select("*").eq("active", true).order("name"),
              supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count')
            ]);
            if (!catsRes.error && catsRes.data) sessionStorage.setItem('billing_categories', JSON.stringify(catsRes.data));
            if (!prodsRes.error && prodsRes.data) sessionStorage.setItem('billing_products', JSON.stringify(prodsRes.data));
            if (!stkRes.error && stkRes.data) sessionStorage.setItem('billing_stocks', JSON.stringify(stkRes.data));
            sessionStorage.setItem('billing_cache_at', String(Date.now()));
          }
        } catch {}
      } else {
        setFlags(null);
        try { localStorage.removeItem('bftone_flags'); } catch {}
      }
    }
    load();
    const { data: sub } = supabaseClient.auth.onAuthStateChange(async (event, session)=>{
      let u = session?.user || null;
      if (!u) {
        const { data: { user: u2 } } = await supabaseClient.auth.getUser();
        u = u2 ?? null;
      }
      if (u?.email) {
        setUserEmail(u.email);
        try { localStorage.setItem('bftone_display_email', u.email); } catch {}
      } else if (event === 'SIGNED_OUT') {
        setUserEmail(null);
        try { localStorage.removeItem('bftone_display_email'); } catch {}
      } // else ignore transient nulls
      if (u) {
        const { data: prof } = await supabaseClient.from('profiles').select('is_admin,is_stock_manager').eq('id', u.id).maybeSingle();
        const f = { is_admin: !!prof?.is_admin, is_stock_manager: !!prof?.is_stock_manager };
        setFlags(f);
        try { localStorage.setItem('bftone_flags', JSON.stringify(f)); } catch {}
        (async ()=>{
          try {
            const ts = Number(sessionStorage.getItem('billing_cache_at')||'0');
            if (!ts || (Date.now()-ts) > 5*60*1000) {
              const [catsRes, prodsRes, stkRes] = await Promise.all([
                supabaseClient.from("categories").select("*").order("name"),
                supabaseClient.from("products").select("*").eq("active", true).order("name"),
                supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count')
              ]);
              if (!catsRes.error && catsRes.data) sessionStorage.setItem('billing_categories', JSON.stringify(catsRes.data));
              if (!prodsRes.error && prodsRes.data) sessionStorage.setItem('billing_products', JSON.stringify(prodsRes.data));
              if (!stkRes.error && stkRes.data) sessionStorage.setItem('billing_stocks', JSON.stringify(stkRes.data));
              sessionStorage.setItem('billing_cache_at', String(Date.now()));
            }
          } catch {}
        })();
      } else if (event === 'SIGNED_OUT') {
        setFlags(null);
        try { localStorage.removeItem('bftone_flags'); } catch {}
      }
    });
    return ()=>{ try { sub.subscription.unsubscribe(); } catch {} };
  },[]);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-sky-700">Hello{userEmail?`, ${userEmail.split("@")[0] || userEmail}`:""}</h1>
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
        {(userEmail && (flags ? !flags.is_admin : true)) && (
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
        {flags?.is_admin && (
          <Link href="/admin">
            <Card className="h-28 active:scale-[.99]">
              <CardContent className="h-full flex flex-col items-center justify-center text-center font-medium text-zinc-900">
                <Shield className="mb-1 text-sky-600" />
                Admin
              </CardContent>
            </Card>
          </Link>
        )}
        {flags?.is_stock_manager && (
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
