"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import {
  Send, Truck, Boxes, Layers, Store, CreditCard, Receipt, PieChart,
  Users, Plus, ArrowRight, AlertCircle, CheckCircle2,
  Clock, TrendingUp, TrendingDown, Sparkles, DollarSign, Package,
  BarChart3, RefreshCw, Filter, ArrowUpRight
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatCafeName } from "@/lib/utils/bakerUtils";
import { capitalizeWords } from "./products/page";
import { fetchB2BClients, B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";
import StoreActivityMonitor from "@/components/baker/StoreActivityMonitor";

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerName: string;
  totalAmount: number;
  status: "paid" | "unpaid";
  date: string;
  items?: Array<{
    id?: string;
    name: string;
    qty: number;
    unit?: string;
    rate: number;
    amount?: number;
  }>;
}

export default function HomeBakerDashboardPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Visual Intelligence Hub State
  const [activeChartTab, setActiveChartTab] = useState<"products" | "clients" | "matrix" | "trend">("products");
  const [productMetric, setProductMetric] = useState<"units" | "revenue">("units");
  const [selectedMatrixClient, setSelectedMatrixClient] = useState<string>("all");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load Invoices, Products, Stores & Expenses
  useEffect(() => {
    try {
      const storedInvs = localStorage.getItem(`bftone_invoices_${bizId}`);
      if (storedInvs) setInvoices(JSON.parse(storedInvs));

      const storedProds = localStorage.getItem(`bftone_baker_products_${bizId}`);
      if (storedProds) setProducts(JSON.parse(storedProds));

      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) setStores(JSON.parse(storedCusts));

      const storedExp = localStorage.getItem(`bftone_baker_expenses_${bizId}`);
      if (storedExp) setExpenses(JSON.parse(storedExp));
    } catch {}

    // Fetch latest B2B clients from server
    if (bizId && bizId !== "default") {
      fetchB2BClients(bizId).then((serverClients) => {
        if (serverClients && serverClients.length > 0) {
          setStores(serverClients);
        }
      });
    }

    const handleStoresUpdated = (e: any) => {
      if (e?.detail?.clients) {
        setStores(e.detail.clients);
      }
    };
    window.addEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);

    if (business?.id) {
      supabaseClient
        .from("invoices")
        .select("*")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) {
            const mapped: InvoiceRecord[] = data.map((d: any) => ({
              id: d.id,
              invoiceNumber: d.invoice_number,
              customerName: d.customer_name,
              totalAmount: (d.total_cents || 0) / 100,
              status: (d.status || "unpaid") as "paid" | "unpaid",
              date: d.invoice_date || format(new Date(), "MMM dd, yyyy"),
              items: d.items || [],
            }));
            setInvoices(mapped);
          }
        });
    }

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [bizId, business?.id]);

  // Aggregate Core Metrics
  const grossSales = invoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
  const totalRawCost = expenses.reduce((acc, exp) => acc + (exp.amount || 0), 0);
  const netProfit = grossSales - totalRawCost;
  const isProfitPositive = netProfit >= 0;
  const netMargin = grossSales > 0 ? ((netProfit / grossSales) * 100).toFixed(1) : "0";

  const pendingDues = invoices
    .filter((inv) => inv.status === "unpaid")
    .reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);

  const totalDeliveredPieces = invoices.reduce((acc, inv) => {
    return acc + (inv.items || []).reduce((s: number, it: any) => s + (Number(it.qty) || 0), 0);
  }, 0);

  // Visual Intelligence Aggregations (Products, Clients, Matrix & Trend)
  const { productAnalytics, clientAnalytics, timelineAnalytics, clientNames } = useMemo(() => {
    const prodMap: Record<string, { name: string; units: number; revenue: number; clients: Record<string, number> }> = {};
    const clientMap: Record<string, { name: string; billed: number; paid: number; unpaid: number; units: number; topProduct: string }> = {};
    const dateMap: Record<string, { date: string; rawDate: string; units: number; revenue: number }> = {};
    const clientSet = new Set<string>();

    invoices.forEach((inv) => {
      const cName = formatCafeName(inv.customerName || "Direct Store");
      clientSet.add(cName);
      const invDate = inv.date || format(new Date(), "MMM dd");
      const total = inv.totalAmount || 0;
      const isUnpaid = inv.status === "unpaid";

      // Client aggregation
      if (!clientMap[cName]) {
        clientMap[cName] = { name: cName, billed: 0, paid: 0, unpaid: 0, units: 0, topProduct: "-" };
      }
      clientMap[cName].billed += total;
      if (isUnpaid) {
        clientMap[cName].unpaid += total;
      } else {
        clientMap[cName].paid += total;
      }

      // Timeline aggregation
      if (!dateMap[invDate]) {
        dateMap[invDate] = { date: invDate, rawDate: invDate, units: 0, revenue: 0 };
      }
      dateMap[invDate].revenue += total;

      // Line items aggregation
      (inv.items || []).forEach((it: any) => {
        const pName = capitalizeWords(it.name || "Item");
        const qty = Number(it.qty) || 0;
        const amt = Number(it.amount) || qty * (Number(it.rate) || 0);

        clientMap[cName].units += qty;
        dateMap[invDate].units += qty;

        if (!prodMap[pName]) {
          prodMap[pName] = { name: pName, units: 0, revenue: 0, clients: {} };
        }
        prodMap[pName].units += qty;
        prodMap[pName].revenue += amt;
        prodMap[pName].clients[cName] = (prodMap[pName].clients[cName] || 0) + qty;
      });
    });

    // Find top product for each client
    Object.values(clientMap).forEach((c) => {
      let maxQty = -1;
      let topP = "-";
      Object.entries(prodMap).forEach(([pName, pData]) => {
        const clientQty = pData.clients[c.name] || 0;
        if (clientQty > maxQty && clientQty > 0) {
          maxQty = clientQty;
          topP = pName;
        }
      });
      c.topProduct = topP;
    });

    const sortedProducts = Object.values(prodMap).sort((a, b) => b.units - a.units);
    const sortedClients = Object.values(clientMap).sort((a, b) => b.billed - a.billed);
    const sortedTimeline = Object.values(dateMap).slice(-7); // Last 7 dispatch points

    return {
      productAnalytics: sortedProducts,
      clientAnalytics: sortedClients,
      timelineAnalytics: sortedTimeline,
      clientNames: Array.from(clientSet),
    };
  }, [invoices]);

  // Product x Client Matrix Data for the selected client
  const matrixData = useMemo(() => {
    if (selectedMatrixClient === "all") {
      return productAnalytics.map((p) => ({
        name: p.name,
        units: p.units,
        revenue: p.revenue,
      }));
    }

    const targetClient = selectedMatrixClient;
    return productAnalytics
      .map((p) => {
        const unitsForClient = p.clients[targetClient] || 0;
        const avgRate = p.units > 0 ? p.revenue / p.units : 0;
        return {
          name: p.name,
          units: unitsForClient,
          revenue: Math.round(unitsForClient * avgRate),
        };
      })
      .filter((it) => it.units > 0);
  }, [productAnalytics, selectedMatrixClient]);

  // Top Customer Dues Breakdown
  const cafeDuesBreakdown = useMemo(() => {
    return clientAnalytics.filter((c) => c.unpaid > 0 || c.billed > 0).sort((a, b) => b.unpaid - a.unpaid);
  }, [clientAnalytics]);

  // Expand toggles
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [showAllDues, setShowAllDues] = useState(false);

  // Recent Dispatches
  const displayedInvoices = showAllInvoices ? invoices : invoices.slice(0, 5);
  const activeCafeDues = showAllDues ? cafeDuesBreakdown : cafeDuesBreakdown.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Top Header */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg sm:text-xl shadow-xs shrink-0">
              <Truck size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                  {formatCafeName(business?.name || "B2B Supply")}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 whitespace-nowrap">
                  B2B Supply Hub
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">
                Client store dispatches, accounts ledger &amp; profit analytics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/b2b/dispatch"
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95"
            >
              <Plus size={14} className="shrink-0" />
              <span>New Dispatch Slip</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 sm:py-6 space-y-5 sm:space-y-6">
        {/* Quick Action Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <Link
            href="/b2b/dispatch"
            className="p-3 sm:p-3.5 rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-300 hover:shadow-xs transition-all flex items-center gap-2.5 sm:gap-3 group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Send size={16} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-extrabold text-[#0F172A] block leading-tight truncate">Sales Entry</span>
              <span className="text-[10px] text-[#64748B] truncate block">New Delivery Slip</span>
            </div>
          </Link>

          <Link
            href="/b2b/products"
            className="p-3 sm:p-3.5 rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-300 hover:shadow-xs transition-all flex items-center gap-2.5 sm:gap-3 group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Package size={16} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-extrabold text-[#0F172A] block leading-tight truncate">Product Catalog</span>
              <span className="text-[10px] text-[#64748B] truncate block">Units, Pricing &amp; Cost</span>
            </div>
          </Link>

          <Link
            href="/b2b/customers"
            className="p-3 sm:p-3.5 rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-300 hover:shadow-xs transition-all flex items-center gap-2.5 sm:gap-3 group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Store size={16} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-extrabold text-[#0F172A] block leading-tight truncate">Client Ledgers</span>
              <span className="text-[10px] text-[#64748B] truncate block">Store &amp; Account Dues</span>
            </div>
          </Link>

          <Link
            href="/b2b/payments"
            className="p-3 sm:p-3.5 rounded-2xl bg-white border border-[#E2E8F0] hover:border-emerald-300 hover:shadow-xs transition-all flex items-center gap-2.5 sm:gap-3 group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <CreditCard size={16} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-extrabold text-[#0F172A] block leading-tight truncate">Record Payment</span>
              <span className="text-[10px] text-[#64748B] truncate block">Clear Store Dues</span>
            </div>
          </Link>
        </div>

        {/* 4 Core Financial KPI Cards (Responsive 2x2 Grid on Mobile, 4 Columns on Desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Card 1: Gross Sales */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1.5">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Gross Billed Sales
              </p>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <TrendingUp size={15} />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-lg sm:text-2xl font-black text-[#0F172A] tabular-nums tracking-tight">
                ₹{grossSales.toLocaleString("en-IN")}
              </h3>
              <p className="text-[10px] sm:text-xs text-[#64748B] font-semibold mt-0.5 truncate">
                {invoices.length} delivery slip{invoices.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {/* Card 2: Real Take-Home Profit (Dynamic Sentiment) */}
          <div className={cn(
            "p-3.5 sm:p-4 rounded-2xl border shadow-2xs flex flex-col justify-between transition-all",
            isProfitPositive
              ? "bg-emerald-50/70 border-emerald-200/80"
              : "bg-rose-50/80 border-rose-200/90"
          )}>
            <div className="flex items-center justify-between gap-1.5">
              <p className={cn(
                "text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate",
                isProfitPositive ? "text-emerald-800" : "text-rose-800"
              )}>
                Take-Home Profit
              </p>
              <div className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold shadow-2xs shrink-0 text-white",
                isProfitPositive ? "bg-emerald-600" : "bg-rose-600"
              )}>
                {isProfitPositive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              </div>
            </div>
            <div className="mt-2">
              <h3 className={cn(
                "text-lg sm:text-2xl font-black tabular-nums tracking-tight",
                isProfitPositive ? "text-emerald-700" : "text-rose-600"
              )}>
                {isProfitPositive ? "+" : ""}₹{Math.round(netProfit).toLocaleString("en-IN")}
              </h3>
              <p className={cn(
                "text-[10px] sm:text-xs font-semibold mt-0.5 truncate",
                isProfitPositive ? "text-emerald-700" : "text-rose-600"
              )}>
                {netMargin}% profit margin
              </p>
            </div>
          </div>

          {/* Card 3: Pending Client Dues */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1.5">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Pending Client Dues
              </p>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                <AlertCircle size={15} />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-lg sm:text-2xl font-black text-rose-600 tabular-nums tracking-tight">
                ₹{pendingDues.toLocaleString("en-IN")}
              </h3>
              <p className="text-[10px] sm:text-xs text-[#64748B] font-semibold mt-0.5 truncate">
                {cafeDuesBreakdown.filter((c) => c.unpaid > 0).length} store{cafeDuesBreakdown.filter((c) => c.unpaid > 0).length === 1 ? "" : "s"} with dues
              </p>
            </div>
          </div>

          {/* Card 4: Total Dispatched Units */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1.5">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Dispatched Units
              </p>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Boxes size={15} />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-lg sm:text-2xl font-black text-[#0F172A] tabular-nums tracking-tight">
                {totalDeliveredPieces} pcs
              </h3>
              <p className="text-[10px] sm:text-xs text-blue-600 font-semibold mt-0.5 truncate">
                Across all partner slips
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* STORE RE-ORDER & ACTIVITY MONITOR (NOT ORDERING / DROPS)  */}
        {/* ========================================================= */}
        <StoreActivityMonitor invoices={invoices} stores={stores} />

        {/* ========================================================= */}
        {/* INTERACTIVE VISUAL INTELLIGENCE HUB (RECHARTS GRAPHS)     */}
        {/* ========================================================= */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
          {/* Section Header & View Tabs */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <BarChart3 size={15} />
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-[#0F172A] tracking-tight">
                  Dispatch &amp; Client Intelligence
                </h2>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Visual analysis of product velocity, client store share, and who buys what
              </p>
            </div>

            {/* Interactive Tab Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto scrollbar-none self-start md:self-auto max-w-full">
              <button
                type="button"
                onClick={() => setActiveChartTab("products")}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "products"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Package size={13} className="text-blue-600 shrink-0" />
                <span>Top Products</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveChartTab("clients")}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "clients"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Store size={13} className="text-purple-600 shrink-0" />
                <span>Client Share &amp; Dues</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveChartTab("matrix")}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "matrix"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Layers size={13} className="text-emerald-600 shrink-0" />
                <span>Who Buys What?</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveChartTab("trend")}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "trend"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <TrendingUp size={13} className="text-blue-600 shrink-0" />
                <span>Velocity Trend</span>
              </button>
            </div>
          </div>

          {/* TAB 1: TOP PRODUCTS (UNITS vs REVENUE) */}
          {activeChartTab === "products" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#64748B]">
                  Ranked breakdown of catalog items across all delivery slips
                </span>
                <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setProductMetric("units")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                      productMetric === "units"
                        ? "bg-white text-blue-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    By Dispatched Pieces
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductMetric("revenue")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                      productMetric === "revenue"
                        ? "bg-white text-emerald-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    By Gross Revenue (₹)
                  </button>
                </div>
              </div>

              {isMounted && productAnalytics.length > 0 ? (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productAnalytics.slice(0, 7)}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v) => (productMetric === "revenue" ? `₹${v}` : `${v}`)}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(37, 99, 235, 0.04)" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0F172A] text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                                <p className="font-extrabold text-blue-300">{data.name}</p>
                                <div className="flex justify-between gap-4 text-slate-300">
                                  <span>Total Dispatched:</span>
                                  <strong className="text-white">{data.units} pcs</strong>
                                </div>
                                <div className="flex justify-between gap-4 text-slate-300">
                                  <span>Gross Revenue:</span>
                                  <strong className="text-emerald-400">₹{data.revenue.toLocaleString("en-IN")}</strong>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar
                        dataKey={productMetric === "units" ? "units" : "revenue"}
                        radius={[6, 6, 0, 0]}
                        fill={productMetric === "units" ? "#2563EB" : "#10B981"}
                      >
                        {productAnalytics.slice(0, 7).map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={
                              productMetric === "units"
                                ? idx === 0 ? "#1D4ED8" : "#3B82F6"
                                : idx === 0 ? "#059669" : "#10B981"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No product dispatch volume recorded yet.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLIENT DISTRIBUTION & CREDIT DUES */}
          {activeChartTab === "clients" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#64748B]">
                  Client volume, lifetime billed vs unsettled pending balances
                </span>
                <div className="flex items-center gap-3 text-[11px] font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />
                    <span className="text-slate-600">Lifetime Billed</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                    <span className="text-rose-700 font-bold">Unpaid Dues</span>
                  </span>
                </div>
              </div>

              {isMounted && clientAnalytics.length > 0 ? (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={clientAnalytics.slice(0, 6)}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v) => `₹${v}`}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(37, 99, 235, 0.04)" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0F172A] text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                                <p className="font-extrabold text-blue-300">{data.name}</p>
                                <div className="flex justify-between gap-4 text-slate-300">
                                  <span>Total Billed:</span>
                                  <strong className="text-white">₹{data.billed.toLocaleString("en-IN")}</strong>
                                </div>
                                <div className="flex justify-between gap-4 text-slate-300">
                                  <span>Pending Dues:</span>
                                  <strong className="text-rose-400">₹{data.unpaid.toLocaleString("en-IN")}</strong>
                                </div>
                                <div className="flex justify-between gap-4 text-slate-300 pt-1 border-t border-slate-800">
                                  <span>Dispatched Units:</span>
                                  <strong className="text-slate-200">{data.units} pcs</strong>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="billed" name="Lifetime Billed" radius={[4, 4, 0, 0]} fill="#2563EB" />
                      <Bar dataKey="unpaid" name="Pending Dues" radius={[4, 4, 0, 0]} fill="#F43F5E" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No partner client sales recorded yet.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRODUCT x CLIENT MATRIX ("WHO ORDERS WHAT?") */}
          {activeChartTab === "matrix" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#64748B]">
                  Select a store to see their specific product demand &amp; order mix
                </span>

                {/* Client Selection Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedMatrixClient("all")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                      selectedMatrixClient === "all"
                        ? "bg-[#0F172A] text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    All Stores
                  </button>
                  {clientNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedMatrixClient(name)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                        selectedMatrixClient === name
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {isMounted && matrixData.length > 0 ? (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={matrixData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v) => `${v} pcs`}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(37, 99, 235, 0.04)" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0F172A] text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                                <p className="font-extrabold text-blue-300">{data.name}</p>
                                <p className="text-[10px] text-slate-400">
                                  Client: {selectedMatrixClient === "all" ? "All Partner Stores" : selectedMatrixClient}
                                </p>
                                <div className="flex justify-between gap-4 text-slate-300 pt-0.5">
                                  <span>Quantity Packed:</span>
                                  <strong className="text-white">{data.units} pcs</strong>
                                </div>
                                <div className="flex justify-between gap-4 text-slate-300">
                                  <span>Billed Value:</span>
                                  <strong className="text-emerald-400">₹{data.revenue.toLocaleString("en-IN")}</strong>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="units" name="Packed Pieces" radius={[6, 6, 0, 0]} fill="#0D9488" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No dispatches recorded for {selectedMatrixClient}.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 7-DAY DISPATCH VELOCITY TREND */}
          {activeChartTab === "trend" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#64748B]">
                  Supply velocity and gross revenue billed across dispatch dates
                </span>
              </div>

              {isMounted && timelineAnalytics.length > 0 ? (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={timelineAnalytics}
                      margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0F172A] text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                                <p className="font-extrabold text-blue-300">{data.date}</p>
                                <div className="flex justify-between gap-4 text-slate-300">
                                  <span>Billed Revenue:</span>
                                  <strong className="text-emerald-400">₹{data.revenue.toLocaleString("en-IN")}</strong>
                                </div>
                                <div className="flex justify-between gap-4 text-slate-300">
                                  <span>Dispatched Units:</span>
                                  <strong className="text-white">{data.units} pcs</strong>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#2563EB"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No timeline data recorded yet.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* OPERATIONAL SECTION: PENDING BALANCES & RECENT DISPATCHES */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
          {/* Left: Pending Client Balances & Record Payment */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={18} className="text-rose-600 shrink-0" />
                <h3 className="font-extrabold text-xs sm:text-sm text-[#0F172A] tracking-tight truncate">
                  Pending Client Balances
                </h3>
              </div>
              <Link
                href="/b2b/customers"
                className="text-[11px] sm:text-xs font-bold text-blue-600 hover:underline shrink-0 whitespace-nowrap ml-auto"
              >
                View All Ledgers →
              </Link>
            </div>

            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto pr-1">
              {activeCafeDues.map((cafe) => (
                <div key={cafe.name} className="py-3 flex items-center justify-between text-xs gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans truncate">
                      {formatCafeName(cafe.name)}
                    </p>
                    <span className="text-[10px] text-[#64748B] block truncate mt-0.5">
                      ₹{cafe.billed.toLocaleString("en-IN")} lifetime billed · {cafe.units} units
                    </span>
                  </div>
                  <div className="text-right flex items-center gap-2 shrink-0">
                    <div>
                      {cafe.unpaid > 0 ? (
                        <span className="font-black text-rose-600 text-xs sm:text-sm block whitespace-nowrap tabular-nums">
                          ₹{cafe.unpaid.toLocaleString("en-IN")} Due
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-600 text-xs block whitespace-nowrap">
                          ✓ Settled
                        </span>
                      )}
                    </div>
                    {cafe.unpaid > 0 && (
                      <Link
                        href={`/b2b/payments?store=${encodeURIComponent(cafe.name)}`}
                        className="px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all whitespace-nowrap active:scale-95"
                      >
                        Record
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              {activeCafeDues.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs font-semibold whitespace-nowrap">
                  No store dispatches recorded yet.
                </div>
              )}
            </div>

            {cafeDuesBreakdown.length > 5 && (
              <div className="pt-2 text-center border-t border-slate-100 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAllDues(!showAllDues)}
                  className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  {showAllDues
                    ? "Show Top 5 Only ↑"
                    : `+${cafeDuesBreakdown.length - 5} more clients with balances · Expand All (${cafeDuesBreakdown.length}) ↓`}
                </button>
                <span className="text-slate-300">·</span>
                <Link
                  href="/b2b/customers"
                  className="text-xs font-bold text-slate-600 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  View Full Ledger →
                </Link>
              </div>
            )}
          </div>

          {/* Right: Recent Dispatches Feed */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Clock size={18} className="text-blue-600 shrink-0" />
                <h3 className="font-extrabold text-xs sm:text-sm text-[#0F172A] tracking-tight truncate">
                  Recent Delivery Slips
                </h3>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-[11px] sm:text-xs font-bold whitespace-nowrap ml-auto">
                <Link href="/b2b/dispatch" className="text-blue-600 hover:underline">
                  New Slip
                </Link>
                <span className="text-slate-300">·</span>
                <Link href="/b2b/dispatch?tab=history" className="text-blue-600 hover:underline">
                  View Full History ({invoices.length}) →
                </Link>
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto pr-1">
              {displayedInvoices.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between text-xs gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-bold text-blue-600 whitespace-nowrap text-xs">{inv.invoiceNumber}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans truncate">
                        {formatCafeName(inv.customerName)}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#64748B] block truncate mt-0.5">
                      {inv.date} · {(inv.items || []).length} line items
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-black text-[#0F172A] text-xs sm:text-sm block whitespace-nowrap tabular-nums">
                      ₹{inv.totalAmount.toLocaleString("en-IN")}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block mt-0.5 whitespace-nowrap",
                        inv.status === "paid"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      )}
                    >
                      {inv.status === "paid" ? "Paid" : "Pending"}
                    </span>
                  </div>
                </div>
              ))}
              {displayedInvoices.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs font-semibold whitespace-nowrap">
                  No delivery slips recorded yet.
                </div>
              )}
            </div>

            {invoices.length > 5 && (
              <div className="pt-2 text-center border-t border-slate-100 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAllInvoices(!showAllInvoices)}
                  className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  {showAllInvoices
                    ? "Show Recent 5 Slips ↑"
                    : `+${invoices.length - 5} more delivery slips · Expand All (${invoices.length}) ↓`}
                </button>
                <span className="text-slate-300">·</span>
                <Link
                  href="/b2b/dispatch?tab=history"
                  className="text-xs font-bold text-slate-600 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  View Invoices Table →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
