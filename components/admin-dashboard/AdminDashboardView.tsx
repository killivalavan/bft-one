"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { cn } from "@/lib/utils/cn";
import { format, subDays } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  CreditCard,
  Banknote,
  AlertTriangle,
  Users,
  Coffee,
  Boxes,
  Plus,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  LayoutGrid,
  Sidebar as SidebarIcon,
  ChevronRight,
  Sparkles,
  Store,
  Clock,
  Receipt,
  FileText
} from "lucide-react";
import { LiveOrdersActivityTable } from "./LiveOrdersActivityTable";
import { AdminOrderRecord } from "./OrderReceiptModal";
import { DashboardGrid, DashboardItem } from "@/components/home/DashboardGrid";
import { useToast } from "@/components/ui/Toast";

interface StockAlertItem {
  id: string;
  name: string;
  current_stock: number;
  min_reorder_level: number;
  unit: string;
  category: string;
}

interface TopProductSummary {
  name: string;
  units: number;
  revenueCents: number;
}

interface AdminDashboardViewProps {
  baseItems: DashboardItem[];
}

export function AdminDashboardView({ baseItems }: AdminDashboardViewProps) {
  const { user } = useUser();
  const { flags } = useProfile();
  const { business } = useTenant();
  const { toast } = useToast();

  // View Mode State: Command Feed vs Tiles Grid
  const [isTilesGridMode, setIsTilesGridMode] = useState<boolean>(false);

  // Live Data State
  const [orders, setOrders] = useState<AdminOrderRecord[]>([]);
  const [yesterdayRevenueCents, setYesterdayRevenueCents] = useState<number>(0);
  const [stockAlerts, setStockAlerts] = useState<StockAlertItem[]>([]);
  const [activeStaffCount, setActiveStaffCount] = useState<number>(0);
  const [totalStaffCount, setTotalStaffCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

  // Fetch Dashboard Intelligence
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    const bizId = business?.id;

    try {
      const dayStart = `${todayStr}T00:00:00.000Z`;
      const dayEnd = `${todayStr}T23:59:59.999Z`;

      const yestStart = `${yesterdayStr}T00:00:00.000Z`;
      const yestEnd = `${yesterdayStr}T23:59:59.999Z`;

      // 1. Fetch Today's Orders with Items
      let todayQuery = supabaseClient
        .from("orders")
        .select(`
          id,
          business_id,
          total_cents,
          subtotal_cents,
          tax_cents,
          discount_cents,
          status,
          payment_mode,
          customer_name,
          customer_phone,
          table_number,
          created_at,
          order_items (
            id,
            product_id,
            qty,
            price_cents,
            products (
              id,
              name,
              unit_label
            )
          )
        `)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false });

      if (bizId) {
        todayQuery = todayQuery.eq("business_id", bizId);
      }

      const { data: todayOrdersData, error: todayErr } = await todayQuery;

      if (!todayErr && todayOrdersData) {
        const formatted: AdminOrderRecord[] = todayOrdersData.map((o: any) => ({
          id: o.id,
          business_id: o.business_id,
          total_cents: Number(o.total_cents) || 0,
          subtotal_cents: o.subtotal_cents,
          tax_cents: o.tax_cents,
          discount_cents: o.discount_cents,
          status: o.status || "COMPLETED",
          payment_mode: o.payment_mode || "cash",
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          table_number: o.table_number,
          created_at: o.created_at,
          order_type: o.table_number ? "Dine-in" : "Takeaway",
          order_items: (o.order_items || []).map((it: any) => ({
            id: it.id,
            product_id: it.product_id,
            name: it.products?.name || "Order Item",
            qty: it.qty || 1,
            price_cents: it.price_cents || 0,
            unit_label: it.products?.unit_label,
          })),
        }));
        setOrders(formatted);
      } else {
        // Fallback: simple orders fetch
        let fbQuery = supabaseClient
          .from("orders")
          .select("id, business_id, total_cents, status, payment_mode, customer_name, customer_phone, table_number, created_at")
          .gte("created_at", dayStart)
          .lte("created_at", dayEnd)
          .order("created_at", { ascending: false });

        if (bizId) fbQuery = fbQuery.eq("business_id", bizId);
        const { data: fbOrders } = await fbQuery;
        setOrders((fbOrders || []).map((o: any) => ({
          ...o,
          total_cents: Number(o.total_cents) || 0,
          order_items: [],
        })));
      }

      // 2. Fetch Yesterday's Orders for Comparison
      let yestQuery = supabaseClient
        .from("orders")
        .select("total_cents")
        .gte("created_at", yestStart)
        .lte("created_at", yestEnd);

      if (bizId) yestQuery = yestQuery.eq("business_id", bizId);
      const { data: yestOrders } = await yestQuery;

      const yestTotal = (yestOrders || []).reduce((acc: number, curr: any) => acc + (Number(curr.total_cents) || 0), 0);
      setYesterdayRevenueCents(yestTotal);

      // 3. Fetch Low Stock Items from inventory_items
      let stockQuery = supabaseClient
        .from("inventory_items")
        .select("id, name, current_stock, min_reorder_level, unit, category")
        .eq("is_active", true)
        .order("current_stock", { ascending: true })
        .limit(10);

      if (bizId) stockQuery = stockQuery.eq("business_id", bizId);
      const { data: stockData } = await stockQuery;

      if (stockData) {
        const lowItems = stockData.filter(
          (item: any) => Number(item.current_stock) <= Number(item.min_reorder_level)
        );
        setStockAlerts(lowItems);
      }

      // 4. Fetch Staff Attendance for Today
      let staffTotalQuery = supabaseClient
        .from("profiles")
        .select("id", { count: "exact" });
      if (bizId) staffTotalQuery = staffTotalQuery.eq("business_id", bizId);
      const { count: staffCount } = await staffTotalQuery;
      setTotalStaffCount(staffCount || 0);

      let timesheetQuery = supabaseClient
        .from("timesheets")
        .select("id, user_id")
        .eq("date", todayStr);
      if (bizId) timesheetQuery = timesheetQuery.eq("business_id", bizId);
      const { data: presentToday } = await timesheetQuery;
      const uniquePresent = new Set((presentToday || []).map((t: any) => t.user_id));
      setActiveStaffCount(uniquePresent.size);

      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [business?.id, todayStr, yesterdayStr]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let todayGrossCents = 0;
    let cashCents = 0;
    let upiCents = 0;
    let completedCount = 0;

    orders.forEach((o) => {
      const cents = o.total_cents || 0;
      todayGrossCents += cents;
      if (o.payment_mode === "cash") {
        cashCents += cents;
      } else {
        upiCents += cents;
      }
      if (o.status !== "CANCELLED") {
        completedCount++;
      }
    });

    const avgBillCents = completedCount > 0 ? Math.round(todayGrossCents / completedCount) : 0;

    // Growth vs yesterday
    let growthPct: number | null = null;
    if (yesterdayRevenueCents > 0) {
      growthPct = Math.round(((todayGrossCents - yesterdayRevenueCents) / yesterdayRevenueCents) * 100);
    } else if (todayGrossCents > 0) {
      growthPct = 100;
    }

    // Cash vs UPI percentage
    const totalPayments = cashCents + upiCents;
    const cashPct = totalPayments > 0 ? Math.round((cashCents / totalPayments) * 100) : 50;
    const upiPct = totalPayments > 0 ? 100 - cashPct : 50;

    return {
      todayGrossRupees: (todayGrossCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      todayGrossCents,
      completedCount,
      avgBillRupees: (avgBillCents / 100).toFixed(2),
      growthPct,
      cashRupees: (cashCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 }),
      upiRupees: (upiCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 }),
      cashPct,
      upiPct,
    };
  }, [orders, yesterdayRevenueCents]);

  // Aggregate Top Selling Items Today
  const topProducts = useMemo(() => {
    const map = new Map<string, { units: number; revenueCents: number }>();

    orders.forEach((order) => {
      if (order.status === "CANCELLED") return;
      (order.order_items || []).forEach((item) => {
        const key = item.name || "Special Item";
        const current = map.get(key) || { units: 0, revenueCents: 0 };
        current.units += item.qty;
        current.revenueCents += item.price_cents * item.qty;
        map.set(key, current);
      });
    });

    const list: TopProductSummary[] = Array.from(map.entries()).map(([name, val]) => ({
      name,
      units: val.units,
      revenueCents: val.revenueCents,
    }));

    return list.sort((a, b) => b.units - a.units).slice(0, 5);
  }, [orders]);

  // Accept Order Handler
  const handleAcceptOrder = async (orderId: string) => {
    try {
      const { error } = await supabaseClient
        .from("orders")
        .update({ status: "ACCEPTED" })
        .eq("id", orderId);

      if (error) throw error;

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "ACCEPTED" } : o))
      );
      toast({ title: "Order Accepted", description: "Order status updated to Accepted.", variant: "success" });
    } catch (e: any) {
      toast({ title: "Failed to update order", description: e.message, variant: "error" });
    }
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* Top Header Bar & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
                <span>Live Admin Command Center</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">
                <Store size={13} className="text-blue-600" />
                <span>{business?.name || "Active Store"}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Executive Store Overview
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Real-time sales velocity, live kitchen orders, cash drawer settlement & inventory alerts.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* View Switcher: Move tiles to left sidebar vs show grid */}
            <button
              onClick={() => setIsTilesGridMode((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-2xs",
                isTilesGridMode
                  ? "bg-blue-600 text-white border-blue-600 shadow-blue-500/20"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              )}
              title={isTilesGridMode ? "Switch to PetPooja Command Center" : "Expand all tiles into Main Screen"}
            >
              {isTilesGridMode ? (
                <>
                  <SidebarIcon size={15} />
                  <span>Dock Tiles to Sidebar</span>
                </>
              ) : (
                <>
                  <LayoutGrid size={15} />
                  <span>Show All Tiles Grid</span>
                </>
              )}
            </button>

            {/* Preview Employee Hub */}
            <Link
              href="/?previewStaff=me"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all shadow-2xs"
              title="Preview Employee Hub (Staff View)"
            >
              <Sparkles size={13} className="text-blue-600" />
              <span>Employee Hub</span>
            </Link>

            {/* Quick "+ New POS Bill" Button */}
            <Link
              href="/billing"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs transition-all active:scale-95"
            >
              <Plus size={16} />
              <span>+ New POS Bill</span>
            </Link>

            {/* Refresh */}
            <button
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-all shadow-2xs"
              title="Refresh Live Metrics"
            >
              <RefreshCw size={15} className={cn(isLoading && "animate-spin text-blue-600")} />
            </button>
          </div>
        </div>

        {/* IF USER TOGGLED "TILES GRID MODE", DISPLAY THE CLASSIC TILES WITH RE-DOCK BUTTON */}
        {isTilesGridMode ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs text-blue-900 font-semibold">
              <span>All 12 enterprise module tiles are shown below. Click "Dock Tiles to Sidebar" anytime to switch back to the PetPooja Live Feed view.</span>
              <button
                onClick={() => setIsTilesGridMode(false)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shrink-0 ml-3"
              >
                Dock to Sidebar
              </button>
            </div>
            <DashboardGrid items={baseItems} />
          </div>
        ) : (
          /* DEFAULT: EXECUTIVE STORE COMMAND CENTER VIEW (AS CHOSEN BY USER) */
          <>
            {/* 3. EXECUTIVE REAL-TIME KPI CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Card 1: Today's Gross Revenue */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Today's Gross Sales
                    </span>
                    <div className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                      ₹{metrics.todayGrossRupees}
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <TrendingUp size={22} />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">
                    {metrics.completedCount} orders today
                  </span>
                  {metrics.growthPct !== null && (
                    <span className={cn(
                      "inline-flex items-center gap-1 font-bold",
                      metrics.growthPct >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {metrics.growthPct >= 0 ? "+" : ""}{metrics.growthPct}% vs yest
                    </span>
                  )}
                </div>
              </div>

              {/* Card 2: Orders Count & AOV */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Bills & Average Value
                    </span>
                    <div className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                      {metrics.completedCount} <span className="text-sm font-semibold text-slate-400">Bills</span>
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                    <ShoppingBag size={22} />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Average Bill Value:</span>
                  <span className="font-extrabold text-slate-900">₹{metrics.avgBillRupees}</span>
                </div>
              </div>

              {/* Card 3: Cash vs UPI Breakdown */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Payment Channels
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-black text-emerald-700">₹{metrics.cashRupees}</span>
                      <span className="text-xs text-slate-400">/</span>
                      <span className="text-lg font-black text-blue-700">₹{metrics.upiRupees}</span>
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700">
                    <CreditCard size={22} />
                  </div>
                </div>

                {/* Split Progress Bar */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${metrics.cashPct}%` }}
                      className="bg-emerald-500 h-full transition-all"
                      title={`Cash: ${metrics.cashPct}%`}
                    />
                    <div
                      style={{ width: `${metrics.upiPct}%` }}
                      className="bg-blue-600 h-full transition-all"
                      title={`UPI: ${metrics.upiPct}%`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span className="text-emerald-700">Cash {metrics.cashPct}%</span>
                    <span className="text-blue-700">UPI {metrics.upiPct}%</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Inventory & Staff Pulse */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Inventory & Staff
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Users size={16} className="text-blue-600" />
                        <span className="text-xl font-black text-slate-900">{activeStaffCount}</span>
                        <span className="text-xs text-slate-400">/{totalStaffCount} on duty</span>
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "w-11 h-11 rounded-xl border flex items-center justify-center",
                    stockAlerts.length > 0
                      ? "bg-amber-50 border-amber-200 text-amber-600"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  )}>
                    {stockAlerts.length > 0 ? <AlertTriangle size={22} /> : <Boxes size={22} />}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  {stockAlerts.length > 0 ? (
                    <Link
                      href="/inventory"
                      className="text-amber-700 font-bold hover:underline flex items-center gap-1"
                    >
                      <span>{stockAlerts.length} items low on stock</span>
                      <ChevronRight size={13} />
                    </Link>
                  ) : (
                    <span className="text-emerald-600 font-bold">Stock levels healthy</span>
                  )}
                  <Link
                    href="/timesheet"
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Attendance
                  </Link>
                </div>
              </div>
            </div>

            {/* 4. PETPOOJA LIVE ORDERS ACTIVITY STREAM TABLE */}
            <LiveOrdersActivityTable
              orders={orders}
              isLoading={isLoading}
              onRefresh={fetchDashboardData}
              onAcceptOrder={handleAcceptOrder}
              storeName={business?.name || "Main Counter POS"}
              currencySymbol="₹"
            />

            {/* 5. TWO-COLUMN OPERATIONAL INTELLIGENCE SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left Widget: Fast Moving Dishes / Top Selling Products Today */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                      <Coffee size={16} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">
                        Top Selling Items Today
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium">Fastest moving dishes & beverages</p>
                    </div>
                  </div>
                  <Link
                    href="/daily-sales"
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <span>Itemized Breakdown</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>

                {topProducts.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No item sales logged yet today. Create a bill on the POS to see fast-moving items!
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {topProducts.map((p, idx) => {
                      const revRupees = (p.revenueCents / 100).toFixed(2);
                      return (
                        <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-extrabold text-[10px] flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-slate-900">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">
                              {p.units} {p.units === 1 ? "unit" : "units"}
                            </span>
                            <span className="font-black text-slate-900 w-16 text-right">₹{revRupees}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Widget: Critical Reorder Radar & Quick Admin Stations */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                      <Boxes size={16} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">
                        Critical Inventory Re-order Radar
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium">Raw ingredients below threshold</p>
                    </div>
                  </div>
                  <Link
                    href="/inventory"
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <span>Manage Stock</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>

                {stockAlerts.length === 0 ? (
                  <div className="py-4 px-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                    <span>All recipe items & packaging are above safety reorder stock levels.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stockAlerts.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            Category: {item.category} • Min Level: {item.min_reorder_level} {item.unit}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-rose-600">
                            {item.current_stock} {item.unit} left
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Operations Launchpad */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Direct Launch Stations
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Link
                      href="/sales"
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-center transition-all group"
                    >
                      <Banknote size={16} className="mx-auto text-cyan-600 mb-1 group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold text-slate-800 block truncate">Cash Drawer</span>
                    </Link>
                    <Link
                      href="/expenses"
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-center transition-all group"
                    >
                      <Receipt size={16} className="mx-auto text-amber-600 mb-1 group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold text-slate-800 block truncate">Log Expense</span>
                    </Link>
                    <Link
                      href="/invoices"
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-center transition-all group"
                    >
                      <FileText size={16} className="mx-auto text-blue-600 mb-1 group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold text-slate-800 block truncate">Tax Invoice</span>
                    </Link>
                    <Link
                      href="/admin/fill-timesheet"
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-center transition-all group"
                    >
                      <Users size={16} className="mx-auto text-purple-600 mb-1 group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold text-slate-800 block truncate">Attendance</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
