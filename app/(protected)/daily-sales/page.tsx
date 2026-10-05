"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import {
  TrendingUp, Calendar, Search, ArrowRight,
  Receipt, ShoppingBag, Coffee, QrCode, Banknote, CreditCard,
  Download, Printer, RefreshCw, ChevronLeft, ChevronRight,
  Clock, Eye, X, CheckCircle2, AlertTriangle,
  BarChart3, UtensilsCrossed, ShieldCheck, Boxes, Sparkles, Layers
} from "lucide-react";
import Link from "next/link";
import { format, addDays, subDays, isToday as checkIsToday, parseISO } from "date-fns";

// ==========================================
// Types
// ==========================================
type OrderItem = {
  id?: string;
  order_id: string;
  product_id: string;
  qty: number;
  price_cents: number;
  products?: {
    id: string;
    name: string;
    category_id?: string;
    unit_label?: string;
    categories?: {
      id: string;
      name: string;
      icon_emoji?: string;
    };
  } | null;
};

type OrderRow = {
  id: string;
  user_id: string | null;
  business_id: string | null;
  total_cents: number;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  discount_cents?: number | null;
  status: string;
  payment_mode?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  table_number?: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

type ItemSoldSummary = {
  productId: string;
  productName: string;
  categoryName: string;
  categoryEmoji: string;
  unitLabel: string;
  unitPriceCents: number;
  totalQty: number;
  totalRevenueCents: number;
  revenueSharePercent: number;
  ordersCount: number;
  rank: number;
};

type CategorySummary = {
  name: string;
  emoji: string;
  totalQty: number;
  totalRevenueCents: number;
  revenueSharePercent: number;
  itemsCount: number;
};

type HourlyBucket = {
  hour: number;
  label: string;
  orderCount: number;
  revenueCents: number;
};

type ManualDailySales = {
  id: string;
  sale_date: string;
  total_cash_cents: number | null;
  total_upi_cents: number | null;
  cash_submitted_by?: string | null;
  upi_submitted_by?: string | null;
};

export default function DailySalesPage() {
  const { toast } = useToast();
  const { business } = useTenant();

  // Date State
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const isSelectedDateToday = checkIsToday(selectedDate);

  // Data State
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [manualSales, setManualSales] = useState<ManualDailySales | null>(null);

  // Filters & Controls
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"revenue" | "qty" | "name" | "price">("revenue");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

  // Modals
  const [selectedBillForModal, setSelectedBillForModal] = useState<OrderRow | null>(null);
  const [showZReportModal, setShowZReportModal] = useState(false);

  // Load Sales Data
  useEffect(() => {
    fetchDaySalesData();
  }, [dateStr, business?.id]);

  async function fetchDaySalesData(isManualRefresh = false) {
    if (isManualRefresh) setIsRefreshing(true);
    else setLoading(true);

    try {
      const dayStart = `${dateStr}T00:00:00.000Z`;
      const dayEnd = `${dateStr}T23:59:59.999Z`;

      // 1. Fetch Orders for Selected Date
      let ordersQuery = supabaseClient
        .from("orders")
        .select(`
          id,
          user_id,
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
            order_id,
            product_id,
            qty,
            price_cents,
            products (
              id,
              name,
              category_id,
              unit_label,
              categories (
                id,
                name,
                icon_emoji
              )
            )
          )
        `)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false });

      if (business?.id) {
        ordersQuery = ordersQuery.eq("business_id", business.id);
      }

      const { data: ordersData, error: ordersErr } = await ordersQuery;

      if (ordersErr) {
        console.error("Error fetching orders:", ordersErr);
        // Fallback: If relation join failed, fetch simply
        let fallbackQuery = supabaseClient
          .from("orders")
          .select("*")
          .gte("created_at", dayStart)
          .lte("created_at", dayEnd)
          .order("created_at", { ascending: false });
        if (business?.id) fallbackQuery = fallbackQuery.eq("business_id", business.id);
        const { data: fallbackOrders } = await fallbackQuery;

        if (fallbackOrders && fallbackOrders.length > 0) {
          const orderIds = fallbackOrders.map(o => o.id);
          const { data: itemsData } = await supabaseClient
            .from("order_items")
            .select("id, order_id, product_id, qty, price_cents, products(id, name, unit_label, category_id, categories(id, name, icon_emoji))")
            .in("order_id", orderIds);

          const itemsGrouped: Record<string, OrderItem[]> = {};
          (itemsData || []).forEach((it: any) => {
            if (!itemsGrouped[it.order_id]) itemsGrouped[it.order_id] = [];
            itemsGrouped[it.order_id].push(it);
          });

          const assembled: OrderRow[] = fallbackOrders.map(o => ({
            ...o,
            order_items: (itemsGrouped[o.id] || []) as any
          }));
          setOrders(assembled);
        } else {
          setOrders([]);
        }
      } else {
        setOrders((ordersData as any) || []);
      }

      // 2. Fetch Manual Daily Cash & UPI Entry for cross-reconciliation
      let manualQuery = supabaseClient
        .from("daily_sales")
        .select("*")
        .eq("sale_date", dateStr);

      if (business?.id) {
        manualQuery = manualQuery.eq("business_id", business.id);
      }

      const { data: manualData } = await manualQuery.maybeSingle();
      setManualSales(manualData || null);

    } catch (err: any) {
      console.error("Sales data fetch error:", err);
      toast({
        title: "Error loading sales",
        description: err.message || "Failed to load transactions",
        variant: "error"
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }

  // Realtime subscription for live orders placed today
  useEffect(() => {
    const channel = supabaseClient
      .channel(`daily-sales-live-${dateStr}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchDaySalesData(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          fetchDaySalesData(true);
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [dateStr, business?.id]);

  // ==========================================
  // Calculated Analytics & Aggregations
  // ==========================================
  
  // 1. Executive Totals
  const validOrders = useMemo(() => {
    return orders.filter(o => o.status !== "cancelled");
  }, [orders]);

  const totalRevenueCents = useMemo(() => {
    return validOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
  }, [validOrders]);

  const totalOrdersCount = validOrders.length;
  const averageOrderValueCents = totalOrdersCount > 0 ? Math.round(totalRevenueCents / totalOrdersCount) : 0;

  // 2. Payment Breakdown
  const paymentBreakdown = useMemo(() => {
    let cashCents = 0;
    let upiCents = 0;
    let cardCents = 0;
    let otherCents = 0;

    validOrders.forEach(o => {
      const mode = (o.payment_mode || "cash").toLowerCase();
      const amount = o.total_cents || 0;
      if (mode.includes("upi") || mode.includes("gpay") || mode.includes("phonepe") || mode.includes("paytm") || mode.includes("qr")) {
        upiCents += amount;
      } else if (mode.includes("card") || mode.includes("pos")) {
        cardCents += amount;
      } else if (mode.includes("cash")) {
        cashCents += amount;
      } else {
        otherCents += amount;
      }
    });

    const total = totalRevenueCents || 1;
    return {
      cashCents,
      upiCents,
      cardCents,
      otherCents,
      cashPercent: Math.round((cashCents / total) * 100),
      upiPercent: Math.round((upiCents / total) * 100),
      cardPercent: Math.round((cardCents / total) * 100),
      otherPercent: Math.round((otherCents / total) * 100),
    };
  }, [validOrders, totalRevenueCents]);

  // 3. Itemized "What is Sold & How Much Sold"
  const { itemizedSales, categoriesList, totalItemsQuantity } = useMemo(() => {
    const itemMap: Record<string, {
      productId: string;
      productName: string;
      categoryName: string;
      categoryEmoji: string;
      unitLabel: string;
      unitPriceCents: number;
      totalQty: number;
      totalRevenueCents: number;
      ordersSet: Set<string>;
    }> = {};

    const categorySet = new Set<string>();
    let totalQty = 0;

    validOrders.forEach(order => {
      (order.order_items || []).forEach(item => {
        const prod = item.products;
        const prodId = item.product_id || (prod?.id || "unknown");
        const prodName = prod?.name || "Uncatalogued Item";
        const catName = prod?.categories?.name || "General";
        const catEmoji = prod?.categories?.icon_emoji || "📦";
        const unitLabel = prod?.unit_label || "unit";
        const qty = item.qty || 1;
        const itemRevenue = (item.price_cents || 0) * qty;

        categorySet.add(catName);
        totalQty += qty;

        if (!itemMap[prodId]) {
          itemMap[prodId] = {
            productId: prodId,
            productName: prodName,
            categoryName: catName,
            categoryEmoji: catEmoji,
            unitLabel: unitLabel,
            unitPriceCents: item.price_cents || 0,
            totalQty: 0,
            totalRevenueCents: 0,
            ordersSet: new Set<string>(),
          };
        }

        itemMap[prodId].totalQty += qty;
        itemMap[prodId].totalRevenueCents += itemRevenue;
        itemMap[prodId].ordersSet.add(order.id);
      });
    });

    const totalRev = totalRevenueCents || 1;
    const itemsArray: ItemSoldSummary[] = Object.values(itemMap).map(item => ({
      productId: item.productId,
      productName: item.productName,
      categoryName: item.categoryName,
      categoryEmoji: item.categoryEmoji,
      unitLabel: item.unitLabel,
      unitPriceCents: item.unitPriceCents,
      totalQty: item.totalQty,
      totalRevenueCents: item.totalRevenueCents,
      revenueSharePercent: Math.round((item.totalRevenueCents / totalRev) * 1000) / 10,
      ordersCount: item.ordersSet.size,
      rank: 0,
    }));

    // Sort by revenue to assign ranks
    itemsArray.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
    itemsArray.forEach((item, index) => {
      item.rank = index + 1;
    });

    return {
      itemizedSales: itemsArray,
      categoriesList: Array.from(categorySet),
      totalItemsQuantity: totalQty,
    };
  }, [validOrders, totalRevenueCents]);

  // 4. Filtered & Sorted Itemized List
  const filteredItems = useMemo(() => {
    let list = [...itemizedSales];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i => 
        i.productName.toLowerCase().includes(q) || 
        i.categoryName.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (selectedCategory !== "all") {
      list = list.filter(i => i.categoryName === selectedCategory);
    }

    // Sorting
    if (sortBy === "revenue") {
      list.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
    } else if (sortBy === "qty") {
      list.sort((a, b) => b.totalQty - a.totalQty);
    } else if (sortBy === "name") {
      list.sort((a, b) => a.productName.localeCompare(b.productName));
    } else if (sortBy === "price") {
      list.sort((a, b) => b.unitPriceCents - a.unitPriceCents);
    }

    return list;
  }, [itemizedSales, searchTerm, selectedCategory, sortBy]);

  // 5. Category Performance Summary
  const categorySummaries: CategorySummary[] = useMemo(() => {
    const map: Record<string, CategorySummary> = {};
    const totalRev = totalRevenueCents || 1;

    itemizedSales.forEach(item => {
      if (!map[item.categoryName]) {
        map[item.categoryName] = {
          name: item.categoryName,
          emoji: item.categoryEmoji,
          totalQty: 0,
          totalRevenueCents: 0,
          revenueSharePercent: 0,
          itemsCount: 0,
        };
      }
      map[item.categoryName].totalQty += item.totalQty;
      map[item.categoryName].totalRevenueCents += item.totalRevenueCents;
      map[item.categoryName].itemsCount += 1;
    });

    return Object.values(map)
      .map(c => ({
        ...c,
        revenueSharePercent: Math.round((c.totalRevenueCents / totalRev) * 100),
      }))
      .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
  }, [itemizedSales, totalRevenueCents]);

  // 6. Hourly Sales Velocity & Rush Timeline
  const hourlySales = useMemo(() => {
    const buckets: HourlyBucket[] = [];
    for (let h = 6; h <= 23; h++) {
      const formatHour = h < 12 ? `${h} AM` : h === 12 ? `12 PM` : `${h - 12} PM`;
      buckets.push({
        hour: h,
        label: formatHour,
        orderCount: 0,
        revenueCents: 0,
      });
    }

    validOrders.forEach(order => {
      try {
        const orderDate = new Date(order.created_at);
        const hour = orderDate.getHours();
        const target = buckets.find(b => b.hour === hour);
        if (target) {
          target.orderCount += 1;
          target.revenueCents += order.total_cents || 0;
        }
      } catch {}
    });

    const maxRevenue = Math.max(...buckets.map(b => b.revenueCents), 1);
    const peakHour = [...buckets].sort((a, b) => b.revenueCents - a.revenueCents)[0];

    return { buckets, maxRevenue, peakHour };
  }, [validOrders]);

  // 7. Reconciliation Metrics (POS Billed vs Declared Cash & UPI)
  const reconciliation = useMemo(() => {
    const posCash = paymentBreakdown.cashCents / 100;
    const posUpi = paymentBreakdown.upiCents / 100;
    const posTotal = totalRevenueCents / 100;

    const declaredCash = manualSales?.total_cash_cents !== null && manualSales?.total_cash_cents !== undefined 
      ? manualSales.total_cash_cents / 100 
      : null;
    const declaredUpi = manualSales?.total_upi_cents !== null && manualSales?.total_upi_cents !== undefined 
      ? manualSales.total_upi_cents / 100 
      : null;
    const declaredTotal = (declaredCash !== null ? declaredCash : 0) + (declaredUpi !== null ? declaredUpi : 0);

    const hasSettlementEntry = declaredCash !== null || declaredUpi !== null;
    const variance = hasSettlementEntry ? declaredTotal - posTotal : 0;
    const cashVariance = declaredCash !== null ? declaredCash - posCash : null;
    const upiVariance = declaredUpi !== null ? declaredUpi - posUpi : null;

    return {
      posCash,
      posUpi,
      posTotal,
      declaredCash,
      declaredUpi,
      declaredTotal,
      hasSettlementEntry,
      variance,
      cashVariance,
      upiVariance,
      isBalanced: hasSettlementEntry && Math.abs(variance) < 1,
    };
  }, [paymentBreakdown, totalRevenueCents, manualSales]);

  // Helper Handlers
  function handlePrevDay() {
    setSelectedDate(prev => subDays(prev, 1));
  }

  function handleNextDay() {
    setSelectedDate(prev => addDays(prev, 1));
  }

  function handleQuickDate(type: "today" | "yesterday") {
    if (type === "today") setSelectedDate(new Date());
    else if (type === "yesterday") setSelectedDate(subDays(new Date(), 1));
  }

  // Export CSV of itemized sales
  function handleExportCsv() {
    if (itemizedSales.length === 0) {
      toast({ title: "No sales data", description: "No items sold on this date to export.", variant: "info" });
      return;
    }

    const headers = ["Rank", "Product Name", "Category", "Unit Label", "Unit Price (INR)", "Quantity Sold", "Total Revenue (INR)", "Revenue Share %", "Distinct Bills Count"];
    const rows = itemizedSales.map(i => [
      i.rank,
      `"${i.productName.replace(/"/g, '""')}"`,
      `"${i.categoryName}"`,
      `"${i.unitLabel}"`,
      (i.unitPriceCents / 100).toFixed(2),
      i.totalQty,
      (i.totalRevenueCents / 100).toFixed(2),
      `${i.revenueSharePercent}%`,
      i.ordersCount,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `daily_sales_report_${dateStr}_${business?.name || "store"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: "Report Exported", description: `Itemized sales report for ${dateStr} saved as CSV.` });
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 md:pb-12 text-[#0F172A] font-sans">
      
      {/* ========================================================================= */}
      {/* 1. TOP HERO & CONTROL BAR */}
      {/* ========================================================================= */}
      <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            
            {/* Title & Store Info */}
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shadow-xs flex-shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A] flex items-center gap-2">
                    Daily Sales
                  </h1>
                  {isSelectedDateToday && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Today
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-0.5">
                  <span className="font-medium text-slate-700">{business?.name || "Brown fening tea"}</span>
                  <span>•</span>
                  <span>Itemized POS billing & quantity analytics</span>
                </p>
              </div>
            </div>

            {/* Date Navigator & Actions */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              
              {/* Date Navigator Box */}
              <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-xs">
                <button
                  onClick={handlePrevDay}
                  title="Previous Day"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="relative px-2">
                  <input
                    type="date"
                    value={dateStr}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDate(parseISO(e.target.value));
                    }}
                    className="bg-transparent text-xs sm:text-sm font-semibold text-slate-800 outline-none cursor-pointer text-center font-mono py-1"
                  />
                </div>

                <button
                  onClick={handleNextDay}
                  title="Next Day"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="hidden sm:flex items-center gap-1 bg-slate-100 border border-slate-200/80 rounded-xl p-1 text-xs">
                <button
                  onClick={() => handleQuickDate("today")}
                  className={cn(
                    "px-3 py-1 rounded-lg font-semibold transition",
                    isSelectedDateToday
                      ? "bg-white text-[#2563EB] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Today
                </button>
                <button
                  onClick={() => handleQuickDate("yesterday")}
                  className={cn(
                    "px-3 py-1 rounded-lg font-semibold transition",
                    !isSelectedDateToday && checkIsToday(addDays(selectedDate, 1))
                      ? "bg-white text-[#2563EB] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Yesterday
                </button>
              </div>

              {/* Actions: Refresh & Export */}
              <button
                onClick={() => fetchDaySalesData(true)}
                disabled={isRefreshing}
                title="Refresh Data"
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-[#2563EB]")} />
              </button>

              <button
                onClick={() => setShowZReportModal(true)}
                title="View & Print Z-Report"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                <span className="hidden md:inline">Z-Report</span>
              </button>

              <button
                onClick={handleExportCsv}
                title="Export Itemized Sales as CSV"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>

            </div>
          </div>

          {/* Sub-navigation banner linking to Cash Register settlement */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
              <span>Viewing sales for <strong className="text-slate-800 font-semibold">{format(selectedDate, "EEEE, dd MMMM yyyy")}</strong></span>
            </div>

            <div className="flex items-center gap-2">
              <span>Closing cash drawer?</span>
              <Link
                href="/sales"
                className="inline-flex items-center gap-1 text-[#2563EB] hover:text-blue-700 font-semibold hover:underline"
              >
                <span>Go to Cash & UPI Settlement</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ========================================================================= */}
        {/* 2. EXECUTIVE KPI SUMMARY CARDS */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Total Revenue */}
          <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Total POS Sales</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Banknote className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
                ₹{(totalRevenueCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#64748B]">
                <span className="text-emerald-700 font-semibold">{totalOrdersCount} completed bills</span>
                <span>today</span>
              </div>
            </div>
          </div>

          {/* Items & Units Sold */}
          <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Total Items Sold</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
                {totalItemsQuantity.toLocaleString("en-IN")} <span className="text-base font-medium text-slate-500">Units</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#64748B]">
                <span className="text-[#2563EB] font-semibold">{itemizedSales.length} Menu Items</span>
                <span>dispensed</span>
              </div>
            </div>
          </div>

          {/* Average Order Value */}
          <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Average Order (AOV)</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
                ₹{(averageOrderValueCents / 100).toFixed(2)}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#64748B]">
                <span>Avg</span>
                <span className="text-amber-700 font-semibold">
                  {totalOrdersCount > 0 ? (totalItemsQuantity / totalOrdersCount).toFixed(1) : 0} items
                </span>
                <span>per guest bill</span>
              </div>
            </div>
          </div>

          {/* Peak Sales Hour */}
          <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Peak Rush Hour</span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
                {hourlySales.peakHour && hourlySales.peakHour.orderCount > 0 ? hourlySales.peakHour.label : "—"}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#64748B]">
                {hourlySales.peakHour && hourlySales.peakHour.orderCount > 0 ? (
                  <>
                    <span className="text-purple-700 font-semibold">₹{(hourlySales.peakHour.revenueCents / 100).toFixed(0)}</span>
                    <span>({hourlySales.peakHour.orderCount} orders)</span>
                  </>
                ) : (
                  <span>No orders placed yet</span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 3. PAYMENT SPLIT & RECONCILIATION BRIDGE */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Payment Method Distribution */}
          <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#2563EB]" />
                  Payment Mode Distribution
                </h2>
                <p className="text-xs text-[#64748B]">Collection breakdown across UPI, Cash, and Card</p>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-700">
                ₹{(totalRevenueCents / 100).toLocaleString("en-IN")} Total
              </span>
            </div>

            {/* Visual Stacked Progress Bar */}
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
              <div
                style={{ width: `${paymentBreakdown.upiPercent}%` }}
                className="h-full bg-purple-600 transition-all duration-500"
                title={`UPI: ₹${(paymentBreakdown.upiCents / 100).toFixed(2)} (${paymentBreakdown.upiPercent}%)`}
              />
              <div
                style={{ width: `${paymentBreakdown.cashPercent}%` }}
                className="h-full bg-emerald-600 transition-all duration-500"
                title={`Cash: ₹${(paymentBreakdown.cashCents / 100).toFixed(2)} (${paymentBreakdown.cashPercent}%)`}
              />
              <div
                style={{ width: `${paymentBreakdown.cardPercent}%` }}
                className="h-full bg-[#2563EB] transition-all duration-500"
                title={`Card: ₹${(paymentBreakdown.cardCents / 100).toFixed(2)} (${paymentBreakdown.cardPercent}%)`}
              />
              <div
                style={{ width: `${paymentBreakdown.otherPercent}%` }}
                className="h-full bg-slate-400 transition-all duration-500"
              />
            </div>

            {/* Individual Mode Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              
              {/* UPI */}
              <div className="rounded-xl bg-purple-50/50 border border-purple-100 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-semibold text-purple-900">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                    UPI / QR
                  </span>
                  <span className="font-mono text-purple-700 font-bold">{paymentBreakdown.upiPercent}%</span>
                </div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-slate-900">
                    ₹{(paymentBreakdown.upiCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Cash */}
              <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-900">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    Cash Drawer
                  </span>
                  <span className="font-mono text-emerald-700 font-bold">{paymentBreakdown.cashPercent}%</span>
                </div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-slate-900">
                    ₹{(paymentBreakdown.cashCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Card / Other */}
              <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-3.5 flex flex-col justify-between col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-semibold text-blue-900">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
                    Card / Other
                  </span>
                  <span className="font-mono text-blue-700 font-bold">{paymentBreakdown.cardPercent + paymentBreakdown.otherPercent}%</span>
                </div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-slate-900">
                    ₹{((paymentBreakdown.cardCents + paymentBreakdown.otherCents) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Smart Cash Register Reconciliation Bridge */}
          <div className="rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
                  Day Closing Reconciliation
                </h2>
                {reconciliation.hasSettlementEntry ? (
                  reconciliation.isBalanced ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Balanced
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Discrepancy
                    </span>
                  )
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    Pending Entry
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B] mt-1">Cross-check POS billing against physical cash closing.</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-slate-600">POS Billing Total:</span>
                <span className="font-bold text-slate-900 font-mono">₹{reconciliation.posTotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-slate-600">Staff Declared Closing:</span>
                <span className="font-bold text-slate-800 font-mono">
                  {reconciliation.hasSettlementEntry ? `₹${reconciliation.declaredTotal.toFixed(2)}` : "Not submitted yet"}
                </span>
              </div>

              {reconciliation.hasSettlementEntry && (
                <div className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border font-mono font-bold",
                  reconciliation.isBalanced
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                )}>
                  <span>Variance / Difference:</span>
                  <span>
                    {reconciliation.variance >= 0 ? "+" : ""}₹{reconciliation.variance.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <Link
              href="/sales"
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-semibold text-slate-800 transition"
            >
              <span>{reconciliation.hasSettlementEntry ? "Edit Cash Settlement" : "Enter Cash & UPI Settlement"}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#2563EB]" />
            </Link>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 4. HOURLY SALES VELOCITY RUSH TIMELINE */}
        {/* ========================================================================= */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#0F172A] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#2563EB]" />
                Hourly Sales Velocity & Rush Timeline
              </h2>
              <p className="text-xs text-[#64748B]">Order volume and revenue generated per operational hour</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[#2563EB] inline-block" /> Sales Amount (₹)
              </span>
            </div>
          </div>

          {/* Bar Timeline */}
          <div className="pt-4 overflow-x-auto pb-2">
            <div className="min-w-[640px] flex items-end justify-between gap-1.5 sm:gap-2 h-32 border-b border-slate-200 pb-2">
              {hourlySales.buckets.map((b) => {
                const heightPercent = hourlySales.maxRevenue > 0 ? (b.revenueCents / hourlySales.maxRevenue) * 100 : 0;
                const isPeak = b.hour === hourlySales.peakHour?.hour && b.orderCount > 0;

                return (
                  <div key={b.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative">
                    
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-11 z-20 pointer-events-none bg-slate-900 text-white px-2.5 py-1 rounded-lg text-[11px] text-center whitespace-nowrap shadow-md">
                      <div className="font-semibold">{b.label}</div>
                      <div className="text-emerald-300 font-mono">₹{(b.revenueCents / 100).toFixed(0)} • {b.orderCount} orders</div>
                    </div>

                    {/* Bar */}
                    <div
                      style={{ height: `${Math.max(heightPercent, b.orderCount > 0 ? 8 : 2)}%` }}
                      className={cn(
                        "w-full rounded-t-md transition-all duration-300",
                        isPeak
                          ? "bg-[#2563EB] shadow-xs"
                          : b.revenueCents > 0
                          ? "bg-blue-300 hover:bg-[#2563EB]"
                          : "bg-slate-100"
                      )}
                    />

                    {/* Label */}
                    <span className={cn(
                      "text-[10px] font-mono",
                      isPeak ? "text-[#2563EB] font-bold" : "text-slate-400"
                    )}>
                      {b.hour < 12 ? `${b.hour}a` : b.hour === 12 ? `12p` : `${b.hour - 12}p`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. ITEMIZED "WHAT WAS SOLD & HOW MUCH SOLD" (THE CORE SECTION) */}
        {/* ========================================================================= */}
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden space-y-4 p-5 sm:p-6">
          
          {/* Header & Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-[#2563EB]" />
                  Itemized Sales Register
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {filteredItems.length} items
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Exact quantity sold, unit price, total revenue earned, and percentage share of today's sales.
              </p>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search item or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2563EB] transition"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm text-slate-700 focus:outline-none focus:border-[#2563EB] cursor-pointer"
              >
                <option value="all">All Categories ({itemizedSales.length})</option>
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm text-slate-700 focus:outline-none focus:border-[#2563EB] cursor-pointer"
              >
                <option value="revenue">Sort by Highest Revenue</option>
                <option value="qty">Sort by Quantity Sold</option>
                <option value="name">Sort by Item Name (A-Z)</option>
                <option value="price">Sort by Unit Price</option>
              </select>

            </div>
          </div>

          {/* Category Quick Pills */}
          {categoriesList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedCategory("all")}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5",
                  selectedCategory === "all"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <span>All Categories</span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                  selectedCategory === "all" ? "bg-blue-800 text-white" : "bg-slate-100 text-slate-600"
                )}>
                  {itemizedSales.length}
                </span>
              </button>
              {categorySummaries.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap flex items-center gap-1.5",
                    selectedCategory === cat.name
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span>{cat.emoji} {cat.name}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    selectedCategory === cat.name ? "bg-blue-800 text-white" : "bg-slate-100 text-slate-600 font-semibold"
                  )}>
                    {cat.totalQty} sold
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ========================================================================= */}
          {/* Table of Itemized Sales */}
          {/* ========================================================================= */}
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mx-auto opacity-80" />
              <p className="text-sm text-slate-500">Aggregating itemized daily sales from orders...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="text-base font-bold text-slate-800">No Sales Recorded for This Date</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No items were billed on {format(selectedDate, "dd MMMM yyyy")}. Try selecting another date or place a bill from POS.
              </p>
              <Link
                href="/billing"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition shadow-xs"
              >
                <span>Open Billing / POS</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-[11px] border-b border-slate-200 uppercase tracking-wider">
                    <th className="py-3 px-4 text-center w-12"># Rank</th>
                    <th className="py-3 px-4">Item & Category</th>
                    <th className="py-3 px-4 text-center">Unit Price</th>
                    <th className="py-3 px-4 text-center font-bold text-slate-800">Qty Sold</th>
                    <th className="py-3 px-4 text-right font-bold text-slate-800">Total Revenue</th>
                    <th className="py-3 px-4 text-right">Share %</th>
                    <th className="py-3 px-4 text-center hidden md:table-cell">Bills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredItems.map((item) => {
                    const isTop1 = item.rank === 1;
                    const isTop2 = item.rank === 2;
                    const isTop3 = item.rank === 3;

                    return (
                      <tr
                        key={item.productId}
                        className="hover:bg-slate-50/80 transition group"
                      >
                        {/* Rank Badge */}
                        <td className="py-3.5 px-4 text-center">
                          {isTop1 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold text-xs border border-amber-300" title="#1 Top Seller">
                              🥇
                            </span>
                          ) : isTop2 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300" title="#2 Top Seller">
                              🥈
                            </span>
                          ) : isTop3 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-900 font-bold text-xs border border-amber-200" title="#3 Top Seller">
                              🥉
                            </span>
                          ) : (
                            <span className="font-mono text-slate-500 font-semibold text-xs">
                              {item.rank}
                            </span>
                          )}
                        </td>

                        {/* Product Info */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 group-hover:text-[#2563EB] transition flex items-center gap-2">
                            <span>{item.productName}</span>
                            {item.unitLabel && (
                              <span className="text-[10px] font-normal text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                {item.unitLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span>{item.categoryEmoji}</span>
                            <span>{item.categoryName}</span>
                          </div>
                        </td>

                        {/* Unit Price */}
                        <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                          ₹{(item.unitPriceCents / 100).toFixed(2)}
                        </td>

                        {/* Quantity Sold */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-[#2563EB] border border-blue-200 font-bold font-mono text-sm">
                            {item.totalQty}
                            <span className="text-[10px] font-normal text-blue-600">units</span>
                          </span>
                        </td>

                        {/* Total Revenue */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="font-bold text-slate-900 font-mono text-sm sm:text-base">
                            ₹{(item.totalRevenueCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>

                        {/* Revenue Share % */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block">
                              <div
                                style={{ width: `${Math.min(item.revenueSharePercent, 100)}%` }}
                                className="h-full bg-[#2563EB] rounded-full"
                              />
                            </div>
                            <span className="font-mono text-xs font-semibold text-slate-600">
                              {item.revenueSharePercent}%
                            </span>
                          </div>
                        </td>

                        {/* Bills Count */}
                        <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-500 hidden md:table-cell">
                          {item.ordersCount} bills
                        </td>

                      </tr>
                    );
                  })}
                </tbody>

                {/* Total Summary Footer */}
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900 text-xs sm:text-sm">
                    <td className="py-4 px-4 text-center font-mono text-slate-500">Total</td>
                    <td className="py-4 px-4">
                      <span>{filteredItems.length} Products Displayed</span>
                    </td>
                    <td className="py-4 px-4 text-center text-slate-400">—</td>
                    <td className="py-4 px-4 text-center font-mono text-[#2563EB] text-base">
                      {filteredItems.reduce((sum, i) => sum + i.totalQty, 0).toLocaleString()} units
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-[#2563EB] text-base">
                      ₹{(filteredItems.reduce((sum, i) => sum + i.totalRevenueCents, 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-slate-600">
                      {filteredItems.reduce((sum, i) => sum + i.revenueSharePercent, 0).toFixed(1)}%
                    </td>
                    <td className="py-4 px-4 text-center font-mono text-slate-500 hidden md:table-cell">
                      {totalOrdersCount}
                    </td>
                  </tr>
                </tfoot>

              </table>
            </div>
          )}

        </div>

        {/* ========================================================================= */}
        {/* 6. INDIVIDUAL BILL-BY-BILL ORDER AUDIT STREAM */}
        {/* ========================================================================= */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#0F172A] flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#2563EB]" />
                All Bills & Invoices Register ({orders.length} Bills)
              </h2>
              <p className="text-xs text-[#64748B]">Click any bill to view complete items breakdown or reprint receipt.</p>
            </div>

            {/* Filter by payment mode */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter mode:</span>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 outline-none"
              >
                <option value="all">All Modes ({orders.length})</option>
                <option value="upi">UPI Only</option>
                <option value="cash">Cash Only</option>
                <option value="card">Card Only</option>
              </select>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No bills recorded for this date.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
              {orders
                .filter(o => paymentFilter === "all" || (o.payment_mode || "cash").toLowerCase().includes(paymentFilter))
                .map((order) => {
                  const mode = (order.payment_mode || "cash").toLowerCase();
                  const isUpi = mode.includes("upi") || mode.includes("qr") || mode.includes("gpay");
                  const isCash = mode.includes("cash");
                  const isCard = mode.includes("card");

                  const timeStr = (() => {
                    try {
                      return format(new Date(order.created_at), "hh:mm a");
                    } catch {
                      return "—";
                    }
                  })();

                  const itemsCount = (order.order_items || []).reduce((sum, it) => sum + (it.qty || 1), 0);
                  const itemsPreview = (order.order_items || [])
                    .map(it => `${it.qty}x ${it.products?.name || "Item"}`)
                    .join(", ");

                  return (
                    <div
                      key={order.id}
                      onClick={() => setSelectedBillForModal(order)}
                      className="py-3 px-3 rounded-xl hover:bg-slate-50 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group border border-transparent hover:border-slate-200"
                    >
                      {/* Left: Order Info & Items */}
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center flex-shrink-0 group-hover:bg-[#2563EB] group-hover:text-white transition">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {timeStr}
                            </span>
                            {order.customer_name && order.customer_name !== "Walk-in Guest" && (
                              <span className="text-xs font-medium text-blue-700 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                                {order.customer_name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {itemsPreview || `${itemsCount} item(s)`}
                          </p>
                        </div>
                      </div>

                      {/* Right: Payment badge & Amount */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
                        {/* Mode Badge */}
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-1",
                          isUpi ? "bg-purple-50 text-purple-700 border border-purple-200" :
                          isCash ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          "bg-blue-50 text-blue-700 border border-blue-200"
                        )}>
                          {isUpi && <QrCode className="w-3 h-3" />}
                          {isCash && <Banknote className="w-3 h-3" />}
                          {isCard && <CreditCard className="w-3 h-3" />}
                          {order.payment_mode || "CASH"}
                        </span>

                        {/* Amount */}
                        <div className="text-right">
                          <div className="font-bold text-slate-900 font-mono text-sm sm:text-base">
                            ₹{(order.total_cents / 100).toFixed(2)}
                          </div>
                          <span className="text-[10px] text-slate-400">{itemsCount} units</span>
                        </div>

                        <Eye className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition" />
                      </div>

                    </div>
                  );
                })}
            </div>
          )}

        </div>

      </main>

      {/* ========================================================================= */}
      {/* 7. MODAL: INDIVIDUAL BILL RECEIPT DETAILS */}
      {/* ========================================================================= */}
      {selectedBillForModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#2563EB]" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Bill Receipt (#{selectedBillForModal.id.slice(0, 8).toUpperCase()})
                </h3>
              </div>
              <button
                onClick={() => setSelectedBillForModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Body */}
            <div className="p-5 space-y-4 text-xs">
              
              {/* Business & Time details */}
              <div className="text-center pb-3 border-b border-slate-100 space-y-1">
                <div className="font-bold text-base text-slate-900">{business?.name || "Brown fening tea"}</div>
                <div className="text-slate-500">
                  {format(new Date(selectedBillForModal.created_at), "dd MMMM yyyy, hh:mm:ss a")}
                </div>
                <div className="text-slate-600">
                  Customer: <strong className="text-slate-900 font-semibold">{selectedBillForModal.customer_name || "Walk-in Guest"}</strong>
                  {selectedBillForModal.customer_phone && ` (${selectedBillForModal.customer_phone})`}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(selectedBillForModal.order_items || []).map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-100">
                    <div>
                      <div className="font-semibold text-slate-900">{it.products?.name || "Item"}</div>
                      <div className="text-slate-500 font-mono text-[11px]">
                        {it.qty} x ₹{(it.price_cents / 100).toFixed(2)}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-slate-900">
                      ₹{((it.price_cents * it.qty) / 100).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="pt-2 border-t border-slate-200 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Payment Mode:</span>
                  <span className="font-bold text-[#2563EB] uppercase">{selectedBillForModal.payment_mode || "CASH"}</span>
                </div>
                {selectedBillForModal.tax_cents ? (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax:</span>
                    <span>₹{(selectedBillForModal.tax_cents / 100).toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                  <span>Total Paid:</span>
                  <span className="text-[#2563EB] text-base">₹{(selectedBillForModal.total_cents / 100).toFixed(2)}</span>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Print Bill</span>
              </button>
              <button
                onClick={() => setSelectedBillForModal(null)}
                className="py-2.5 px-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: DAY CLOSING Z-REPORT (PRINT / PREVIEW) */}
      {/* ========================================================================= */}
      {showZReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#2563EB]" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Store Day-End Z-Report</h3>
                  <p className="text-[11px] text-slate-500">{format(selectedDate, "dd MMMM yyyy")}</p>
                </div>
              </div>
              <button
                onClick={() => setShowZReportModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Printable Z-Report Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs font-mono text-slate-800">
              
              {/* Header Info */}
              <div className="text-center pb-4 border-b border-dashed border-slate-300 space-y-1">
                <div className="font-bold text-lg tracking-wider text-slate-900 uppercase">{business?.name || "BROWN FENING TEA"}</div>
                <div className="text-slate-600">DAILY BUSINESS SALES CLOSING (Z-REPORT)</div>
                <div className="text-slate-500 text-[10px]">
                  Date: {format(selectedDate, "yyyy-MM-dd")} | Generated: {format(new Date(), "hh:mm a")}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
                <div className="text-slate-500 font-bold uppercase text-[11px]">=== FINANCIAL SUMMARY ===</div>
                <div className="flex justify-between text-slate-800">
                  <span>Gross POS Sales:</span>
                  <span className="font-bold text-slate-900">₹{(totalRevenueCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Total Bills Generated:</span>
                  <span>{totalOrdersCount}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Average Order Value:</span>
                  <span>₹{(averageOrderValueCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Total Product Units Sold:</span>
                  <span>{totalItemsQuantity} units</span>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
                <div className="text-slate-500 font-bold uppercase text-[11px]">=== PAYMENT BREAKDOWN ===</div>
                <div className="flex justify-between text-slate-700">
                  <span>UPI / QR Collections ({paymentBreakdown.upiPercent}%):</span>
                  <span className="font-bold text-purple-700">₹{(paymentBreakdown.upiCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Cash Drawer Collections ({paymentBreakdown.cashPercent}%):</span>
                  <span className="font-bold text-emerald-700">₹{(paymentBreakdown.cashCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Card / Others ({paymentBreakdown.cardPercent + paymentBreakdown.otherPercent}%):</span>
                  <span className="font-bold text-blue-700">₹{((paymentBreakdown.cardCents + paymentBreakdown.otherCents) / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* Top 5 Products */}
              <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
                <div className="text-slate-500 font-bold uppercase text-[11px]">=== TOP SELLING PRODUCTS ===</div>
                {itemizedSales.slice(0, 5).map((it, idx) => (
                  <div key={idx} className="flex justify-between text-slate-700">
                    <span>{idx + 1}. {it.productName} ({it.totalQty}x)</span>
                    <span className="font-bold text-slate-900">₹{(it.totalRevenueCents / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Day Closing Reconciliation */}
              <div className="space-y-2">
                <div className="text-slate-500 font-bold uppercase text-[11px]">=== RECONCILIATION NOTES ===</div>
                <div className="flex justify-between text-slate-700">
                  <span>Billed POS Total:</span>
                  <span>₹{reconciliation.posTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Staff Declared Closing:</span>
                  <span>{reconciliation.hasSettlementEntry ? `₹${reconciliation.declaredTotal.toFixed(2)}` : "Pending"}</span>
                </div>
                {reconciliation.hasSettlementEntry && (
                  <div className="flex justify-between font-bold text-emerald-700">
                    <span>Variance:</span>
                    <span>₹{reconciliation.variance.toFixed(2)}</span>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Print Z-Report</span>
              </button>
              <button
                onClick={() => setShowZReportModal(false)}
                className="py-2.5 px-6 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs sm:text-sm transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
