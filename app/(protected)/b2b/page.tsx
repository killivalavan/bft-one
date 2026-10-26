"use client";

import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import {
  Send, Truck, Boxes, Layers, Store, CreditCard,
  Plus, AlertCircle,
  Clock, TrendingUp, TrendingDown, Package,
  BarChart3, Calendar, Table,
  Search,
  ChevronDown, ChevronUp
} from "lucide-react";
import {
  seedRoyalBakerLocalStorage,
  ROYAL_BAKER_BIZ_ID,
} from "@/lib/data/royalBakerDemoData";
import { useB2BWorkspace } from "@/lib/hooks/useB2BData";
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
import StoreActivityMonitor, { MonitorStoreRecord } from "@/components/baker/StoreActivityMonitor";

export interface InvoiceItem {
  id?: string;
  name?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  amount?: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  totalAmount: number;
  status: "paid" | "unpaid";
  date: string;
  createdAt?: string;
  title?: string;
  items?: InvoiceItem[];
}

export interface ExpenseRecord {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  createdAt?: string;
}

export type ReportingPeriod = "this_month" | "last_30_days" | "last_7_days" | "all_time";

const emptySubscribe = () => () => {};

export default function HomeBakerDashboardPage() {
  const { business } = useTenant();
  const bizId = business?.id || "default";

  // Idiomatic client-side mount detection without cascading renders
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Initial State loaded safely via lazy initializers (React 19 compliant, zero hydration cascading renders)
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => {
    if (typeof window !== "undefined" && bizId && bizId !== "default") {
      try {
        const stored = localStorage.getItem(`bftone_invoices_${bizId}`);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [];
  });

  const [stores, setStores] = useState<MonitorStoreRecord[]>(() => {
    if (typeof window !== "undefined" && bizId && bizId !== "default") {
      try {
        const stored = localStorage.getItem(`bftone_customers_${bizId}`);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [];
  });

  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => {
    if (typeof window !== "undefined" && bizId && bizId !== "default") {
      try {
        const stored = localStorage.getItem(`bftone_baker_expenses_${bizId}`);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [];
  });

  // Active Reporting Period Filter
  const [reportingPeriod, setReportingPeriod] = useState<ReportingPeriod>("this_month");

  // Visual Intelligence Hub State
  const [activeChartTab, setActiveChartTab] = useState<"products" | "clients" | "matrix" | "trend">("products");
  const [productMetric, setProductMetric] = useState<"units" | "revenue">("units");
  const [chartViewMode, setChartViewMode] = useState<"chart" | "table">("chart");
  const [selectedMatrixClient, setSelectedMatrixClient] = useState<string>("all");

  // Operational Section Filters & Expansion
  const [slipsStatusFilter, setSlipsStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const [duesSearchQuery, setDuesSearchQuery] = useState("");
  const [slipsSearchQuery, setSlipsSearchQuery] = useState("");
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [showAllDues, setShowAllDues] = useState(false);

  // Authoritative Cloud Data via TanStack Query (2-minute freshness, zero redundant network calls)
  const { data: cloudData } = useB2BWorkspace(bizId);

  // Strict tenant switch handler: reset and reload local state whenever active business changes
  useEffect(() => {
    if (typeof window !== "undefined" && bizId && bizId !== "default") {
      try {
        const storedInv = localStorage.getItem(`bftone_invoices_${bizId}`);
        setInvoices(storedInv ? JSON.parse(storedInv) : []);
        const storedStores = localStorage.getItem(`bftone_customers_${bizId}`);
        setStores(storedStores ? JSON.parse(storedStores) : []);
        const storedExp = localStorage.getItem(`bftone_baker_expenses_${bizId}`);
        setExpenses(storedExp ? JSON.parse(storedExp) : []);
      } catch {
        setInvoices([]);
        setStores([]);
        setExpenses([]);
      }
    } else {
      setInvoices([]);
      setStores([]);
      setExpenses([]);
    }
  }, [bizId]);

  // Synchronize authoritative cloud data into component state (accurately handles 0-item states)
  useEffect(() => {
    if (cloudData) {
      if (Array.isArray(cloudData.invoices)) {
        setInvoices(cloudData.invoices);
      }
      if (Array.isArray(cloudData.stores)) {
        setStores(cloudData.stores);
      }
      if (Array.isArray(cloudData.expenses)) {
        setExpenses(cloudData.expenses);
      }
    }
  }, [cloudData]);

  // Fallback seeder strictly isolated to Royal Baker demo workspace only
  useEffect(() => {
    if (typeof window !== "undefined" && bizId === ROYAL_BAKER_BIZ_ID) {
      const stored = localStorage.getItem(`bftone_invoices_${bizId}`);
      const parsed = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        const seeded = seedRoyalBakerLocalStorage(bizId);
        if (seeded) {
          setInvoices(seeded.invoices);
          setStores(seeded.stores);
          setExpenses(seeded.expenses);
        }
      }
    }
  }, [bizId]);

  // Safe Date Parser Helper
  const parseRecordDate = (rec: { date?: string; createdAt?: string }): Date => {
    if (rec.createdAt) {
      const d = new Date(rec.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    if (rec.date) {
      const d = new Date(rec.date);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  // 1. Synchronize Invoices, Stores & Expenses from Supabase & Remote Services
  useEffect(() => {
    // Fetch latest B2B clients from server
    if (bizId && bizId !== "default") {
      fetchB2BClients(bizId).then((serverClients) => {
        if (serverClients && serverClients.length > 0) {
          setStores(serverClients);
        }
      });
    }

    const handleStoresUpdated = (e: Event) => {
      const customEv = e as CustomEvent<{ clients?: MonitorStoreRecord[] }>;
      if (customEv?.detail?.clients) {
        setStores(customEv.detail.clients);
      }
    };
    window.addEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);

    if (business?.id) {
      // Fetch live Expenses from Supabase
      supabaseClient
        .from("daily_expenses")
        .select("*")
        .eq("business_id", business.id)
        .order("expense_date", { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) {
            const mapped: ExpenseRecord[] = (data as Array<Record<string, unknown>>).map((d) => ({
              id: String(d.id || ""),
              name: String(d.item_name || "Operating Expense"),
              amount: ((Number(d.price_cents) || 0) * (Number(d.quantity) || 1)) / 100,
              category: "Supplies & Operations",
              date: d.expense_date ? String(d.expense_date) : format(new Date(), "MMM dd, yyyy"),
              createdAt: d.created_at ? String(d.created_at) : undefined,
            }));
            setExpenses(mapped);
          }
        });
    }

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [bizId, business?.id]);

  // 2. Compute Active Reporting Period Date Ranges & Previous Equivalent Periods
  const periodDateRanges = useMemo(() => {
    const now = new Date();

    if (reportingPeriod === "this_month") {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      const prevMonthDate = subDays(start, 5);
      const prevStart = startOfMonth(prevMonthDate);
      const prevEnd = endOfMonth(prevMonthDate);
      return {
        label: format(now, "MMMM yyyy"),
        shortLabel: format(now, "MMM yyyy"),
        dateBadge: `${format(start, "MMM 1")} – ${format(now, "MMM d, yyyy")}`,
        currentInterval: { start, end },
        prevInterval: { start: prevStart, end: prevEnd },
        hasPrevComparison: true,
        prevLabel: format(prevStart, "MMMM"),
      };
    }

    if (reportingPeriod === "last_30_days") {
      const start = subDays(now, 30);
      const prevStart = subDays(now, 60);
      const prevEnd = subDays(now, 31);
      return {
        label: "Last 30 Days",
        shortLabel: "30 Days",
        dateBadge: `${format(start, "MMM d")} – ${format(now, "MMM d, yyyy")}`,
        currentInterval: { start, end: now },
        prevInterval: { start: prevStart, end: prevEnd },
        hasPrevComparison: true,
        prevLabel: "prior 30d",
      };
    }

    if (reportingPeriod === "last_7_days") {
      const start = subDays(now, 7);
      const prevStart = subDays(now, 14);
      const prevEnd = subDays(now, 8);
      return {
        label: "Last 7 Days",
        shortLabel: "7 Days",
        dateBadge: `${format(start, "MMM d")} – ${format(now, "MMM d, yyyy")}`,
        currentInterval: { start, end: now },
        prevInterval: { start: prevStart, end: prevEnd },
        hasPrevComparison: true,
        prevLabel: "prior 7d",
      };
    }

    // "all_time"
    return {
      label: "All Time",
      shortLabel: "All Time",
      dateBadge: "Lifetime Record",
      currentInterval: null,
      prevInterval: null,
      hasPrevComparison: false,
      prevLabel: "",
    };
  }, [reportingPeriod]);

  // 3. Filter Invoices & Expenses according to selected period
  const { currentInvoices, prevInvoices, currentExpenses } = useMemo(() => {
    if (!periodDateRanges.currentInterval) {
      return {
        currentInvoices: invoices,
        prevInvoices: [],
        currentExpenses: expenses,
      };
    }

    const currInv = invoices.filter((inv) => {
      const d = parseRecordDate(inv);
      return isWithinInterval(d, periodDateRanges.currentInterval!);
    });

    const prevInv = periodDateRanges.prevInterval
      ? invoices.filter((inv) => {
          const d = parseRecordDate(inv);
          return isWithinInterval(d, periodDateRanges.prevInterval!);
        })
      : [];

    const currExp = expenses.filter((exp) => {
      const d = parseRecordDate(exp);
      return isWithinInterval(d, periodDateRanges.currentInterval!);
    });

    return {
      currentInvoices: currInv,
      prevInvoices: prevInv,
      currentExpenses: currExp,
    };
  }, [invoices, expenses, periodDateRanges]);

  // 4. Financial Calculations & KPIs
  const rawGrossSales = currentInvoices.reduce((acc, inv) => {
    const val = Number(inv.totalAmount || 0);
    return acc + (Number.isFinite(val) ? val : 0);
  }, 0);
  const grossSales = Number.isFinite(rawGrossSales) ? rawGrossSales : 0;

  const rawCost = currentExpenses.reduce((acc, exp) => {
    const val = Number(exp.amount || 0);
    return acc + (Number.isFinite(val) ? val : 0);
  }, 0);
  const totalRawCost = Number.isFinite(rawCost) ? rawCost : 0;

  const netProfit = grossSales - totalRawCost;
  const isProfitPositive = netProfit >= 0;
  const netMargin = grossSales > 0 ? ((netProfit / grossSales) * 100).toFixed(1) : "0";

  // Collected vs Unpaid Receivables
  const collectedPayments = currentInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((acc, inv) => {
      const val = Number(inv.totalAmount || 0);
      return acc + (Number.isFinite(val) ? val : 0);
    }, 0);

  const pendingDues = currentInvoices
    .filter((inv) => inv.status === "unpaid")
    .reduce((acc, inv) => {
      const val = Number(inv.totalAmount || 0);
      return acc + (Number.isFinite(val) ? val : 0);
    }, 0);

  const collectionRate = grossSales > 0 ? Math.round(((Number.isFinite(collectedPayments) ? collectedPayments : 0) / grossSales) * 100) : 0;

  const totalDeliveredPieces = currentInvoices.reduce((acc, inv) => {
    return acc + (inv.items || []).reduce((s: number, it: InvoiceItem) => {
      const qty = Number(it.qty || 0);
      return s + (Number.isFinite(qty) ? qty : 0);
    }, 0);
  }, 0);

  const avgPiecesPerSlip = currentInvoices.length > 0 ? (totalDeliveredPieces / currentInvoices.length).toFixed(1) : "0";

  // Previous Period Comparisons
  const prevGrossSales = prevInvoices.reduce((acc, inv) => {
    const val = Number(inv.totalAmount || 0);
    return acc + (Number.isFinite(val) ? val : 0);
  }, 0);
  const hasPreviousPeriodData = periodDateRanges.hasPrevComparison && prevInvoices.length > 0;
  const salesDeltaPct =
    hasPreviousPeriodData && prevGrossSales > 0
      ? Math.round(((grossSales - prevGrossSales) / prevGrossSales) * 100)
      : null;

  // 5. Visual Intelligence Aggregations
  const { productAnalytics, clientAnalytics, timelineAnalytics, clientNames } = useMemo(() => {
    const prodMap: Record<string, { name: string; units: number; revenue: number; slipsCount: number; clients: Record<string, number> }> = {};
    const clientMap: Record<string, { name: string; billed: number; paid: number; unpaid: number; units: number; topProduct: string; lastDate?: string }> = {};
    const dateMap: Record<string, { date: string; rawDate: string; units: number; revenue: number }> = {};
    const clientSet = new Set<string>();

    currentInvoices.forEach((inv) => {
      const cName = formatCafeName(inv.customerName || "Direct Store");
      clientSet.add(cName);
      const invDate = inv.date || format(new Date(), "MMM dd");
      const total = inv.totalAmount || 0;
      const isUnpaid = inv.status === "unpaid";

      // Client aggregation
      if (!clientMap[cName]) {
        clientMap[cName] = { name: cName, billed: 0, paid: 0, unpaid: 0, units: 0, topProduct: "-", lastDate: invDate };
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
      (inv.items || []).forEach((it: InvoiceItem) => {
        const pName = capitalizeWords(it.name || "Item");
        const qty = Number(it.qty) || 0;
        const amt = Number(it.amount) || qty * (Number(it.rate) || 0);

        clientMap[cName].units += qty;
        dateMap[invDate].units += qty;

        if (!prodMap[pName]) {
          prodMap[pName] = { name: pName, units: 0, revenue: 0, slipsCount: 0, clients: {} };
        }
        prodMap[pName].units += qty;
        prodMap[pName].revenue += amt;
        prodMap[pName].slipsCount += 1;
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
    const sortedTimeline = Object.values(dateMap).slice(-10);

    return {
      productAnalytics: sortedProducts,
      clientAnalytics: sortedClients,
      timelineAnalytics: sortedTimeline,
      clientNames: Array.from(clientSet),
    };
  }, [currentInvoices]);

  // Product x Client Matrix Data
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

  // 6. Filtered Customer Dues & Slips
  const cafeDuesBreakdown = useMemo(() => {
    return clientAnalytics.filter((c) => c.unpaid > 0 || c.billed > 0).sort((a, b) => b.unpaid - a.unpaid);
  }, [clientAnalytics]);

  const filteredCafeDues = useMemo(() => {
    if (!duesSearchQuery.trim()) return cafeDuesBreakdown;
    const q = duesSearchQuery.toLowerCase().trim();
    return cafeDuesBreakdown.filter((c) => c.name.toLowerCase().includes(q));
  }, [cafeDuesBreakdown, duesSearchQuery]);

  const filteredInvoicesList = useMemo(() => {
    return currentInvoices.filter((inv) => {
      // Status filter
      if (slipsStatusFilter === "pending" && inv.status !== "unpaid") return false;
      if (slipsStatusFilter === "paid" && inv.status !== "paid") return false;

      // Search query
      if (slipsSearchQuery.trim()) {
        const q = slipsSearchQuery.toLowerCase().trim();
        const matchesNumber = (inv.invoiceNumber || "").toLowerCase().includes(q);
        const matchesName = (inv.customerName || "").toLowerCase().includes(q);
        return matchesNumber || matchesName;
      }
      return true;
    });
  }, [currentInvoices, slipsStatusFilter, slipsSearchQuery]);

  const displayedInvoices = showAllInvoices ? filteredInvoicesList : filteredInvoicesList.slice(0, 5);
  const displayedCafeDues = showAllDues ? filteredCafeDues : filteredCafeDues.slice(0, 5);

  // Time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  if (!isMounted) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 rounded-full border-3 border-blue-600 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Loading B2B Supply Workspace...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ========================================================= */}
      {/* 1. TOP HEADER & REPORTING PERIOD CONTROLS                 */}
      {/* ========================================================= */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-4 py-3 sm:py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-3.5">
          {/* Store Identity & Welcome Message */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-lg sm:text-xl shadow-xs shrink-0 ring-4 ring-blue-50">
              <Truck size={18} className="sm:hidden" aria-hidden="true" />
              <Truck size={20} className="hidden sm:block" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-sm sm:text-lg font-black text-[#0F172A] tracking-tight truncate">
                  {formatCafeName(business?.name || "B2B Supply Hub")}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                  Verified B2B Hub
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] truncate mt-0.5">
                <span className="sm:hidden">{greeting} · Wholesale dispatch &amp; profit</span>
                <span className="hidden sm:inline">{greeting} · Wholesale dispatch operations &amp; profit analytics</span>
              </p>
            </div>
          </div>

          {/* Period Switcher & Primary Action (Full-width friendly on small view) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto shrink-0">
            {/* Period Filter Dropdown / Pill Group */}
            <div
              className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-600 justify-between sm:justify-start w-full sm:w-auto overflow-x-auto scrollbar-none"
              role="group"
              aria-label="Reporting period selector"
            >
              <Calendar size={13} className="text-slate-400 ml-1.5 mr-1 shrink-0 hidden xs:inline" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setReportingPeriod("this_month")}
                className={cn(
                  "flex-1 sm:flex-initial text-center px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs font-bold whitespace-nowrap",
                  reportingPeriod === "this_month"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "hover:text-slate-900"
                )}
                title="Filter by current calendar month"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setReportingPeriod("last_30_days")}
                className={cn(
                  "flex-1 sm:flex-initial text-center px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs font-bold whitespace-nowrap",
                  reportingPeriod === "last_30_days"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "hover:text-slate-900"
                )}
                title="Filter by last 30 days"
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setReportingPeriod("last_7_days")}
                className={cn(
                  "flex-1 sm:flex-initial text-center px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs font-bold whitespace-nowrap",
                  reportingPeriod === "last_7_days"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "hover:text-slate-900"
                )}
                title="Filter by last 7 days"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setReportingPeriod("all_time")}
                className={cn(
                  "flex-1 sm:flex-initial text-center px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs font-bold whitespace-nowrap",
                  reportingPeriod === "all_time"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "hover:text-slate-900"
                )}
                title="View lifetime records"
              >
                All Time
              </button>
            </div>

            {/* Quick Action Button: New Dispatch Slip */}
            <Link
              href="/b2b/dispatch"
              className="w-full sm:w-auto justify-center px-4 py-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap active:scale-95 cursor-pointer ring-2 ring-blue-600/20"
            >
              <Plus size={15} className="shrink-0" aria-hidden="true" />
              <span>New Dispatch Slip</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3.5 sm:px-4 space-y-4 sm:space-y-6">
        {/* Active Reporting Period Sub-Bar */}
        <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-1.5 text-xs text-slate-500 bg-white px-3.5 sm:px-4 py-2.5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800 text-[11px] sm:text-xs">Active Window:</span>
            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-extrabold text-[10.5px] sm:text-[11px] border border-blue-200">
              {periodDateRanges.dateBadge}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10.5px] sm:text-[11px] text-slate-500">
            <span>{currentInvoices.length} slip{currentInvoices.length === 1 ? "" : "s"}</span>
            <span className="text-slate-300">·</span>
            <span>{totalDeliveredPieces} units dispatched</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. OPERATIONAL QUICK ACTION CARDS (NO TEXT WRAPPING)      */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <Link
            href="/b2b/dispatch"
            className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-400 hover:shadow-xs transition-all flex items-center gap-2 sm:gap-3 group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-blue-100">
              <Send size={15} className="sm:hidden" aria-hidden="true" />
              <Send size={18} className="hidden sm:block" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] xs:text-[11.5px] sm:text-xs font-black text-[#0F172A] block leading-tight truncate">
                <span className="xs:hidden">New Slip</span>
                <span className="hidden xs:inline">Sales Entry</span>
              </span>
              <span className="text-[9.5px] sm:text-[11px] text-[#64748B] block mt-0.5 truncate">
                <span className="xs:hidden">Dispatch</span>
                <span className="hidden xs:inline">New Slip</span>
              </span>
            </div>
          </Link>

          <Link
            href="/b2b/products"
            className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-400 hover:shadow-xs transition-all flex items-center gap-2 sm:gap-3 group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-blue-100">
              <Package size={15} className="sm:hidden" aria-hidden="true" />
              <Package size={18} className="hidden sm:block" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] xs:text-[11.5px] sm:text-xs font-black text-[#0F172A] block leading-tight truncate">
                <span className="xs:hidden">Catalog</span>
                <span className="hidden xs:inline">Product Catalog</span>
              </span>
              <span className="text-[9.5px] sm:text-[11px] text-[#64748B] block mt-0.5 truncate">
                Pricing &amp; Costs
              </span>
            </div>
          </Link>

          <Link
            href="/b2b/customers"
            className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-400 hover:shadow-xs transition-all flex items-center gap-2 sm:gap-3 group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-blue-100">
              <Store size={15} className="sm:hidden" aria-hidden="true" />
              <Store size={18} className="hidden sm:block" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] xs:text-[11.5px] sm:text-xs font-black text-[#0F172A] block leading-tight truncate">
                <span className="xs:hidden">Ledgers</span>
                <span className="hidden xs:inline">Client Ledgers</span>
              </span>
              <span className="text-[9.5px] sm:text-[11px] text-[#64748B] block mt-0.5 truncate">
                Dues &amp; History
              </span>
            </div>
          </Link>

          <Link
            href="/b2b/payments"
            className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] hover:border-emerald-400 hover:shadow-xs transition-all flex items-center gap-2 sm:gap-3 group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-emerald-100">
              <CreditCard size={15} className="sm:hidden" aria-hidden="true" />
              <CreditCard size={18} className="hidden sm:block" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] xs:text-[11.5px] sm:text-xs font-black text-[#0F172A] block leading-tight truncate">
                <span className="xs:hidden">Payments</span>
                <span className="hidden xs:inline">Record Payment</span>
              </span>
              <span className="text-[9.5px] sm:text-[11px] text-[#64748B] block mt-0.5 truncate">
                Clear Balances
              </span>
            </div>
          </Link>
        </div>

        {/* ========================================================= */}
        {/* 3. BUSINESS KPI CARDS (NO TEXT OVERLAP OR CLIPPING)       */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Card 1: Gross Billed Sales */}
          <Link
            href="/b2b/dispatch?tab=history"
            className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between gap-1 sm:gap-1.5">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider leading-tight">
                <span className="sm:hidden">Gross Sales</span>
                <span className="hidden sm:inline">Gross Billed Sales</span>
              </p>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0 border border-blue-100">
                <TrendingUp size={14} className="sm:hidden" aria-hidden="true" />
                <TrendingUp size={16} className="hidden sm:block" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-2 sm:mt-2.5">
              <h3 className="text-lg sm:text-2xl font-black text-[#0F172A] tabular-nums tracking-tight">
                ₹{grossSales.toLocaleString("en-IN")}
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-1 sm:mt-1.5 gap-0.5 sm:gap-1 text-xs">
                <span className="text-[#64748B] font-semibold text-[10.5px] sm:text-xs truncate">
                  {currentInvoices.length} delivery slip{currentInvoices.length === 1 ? "" : "s"}
                </span>
                {salesDeltaPct !== null ? (
                  <span
                    className={cn(
                      "text-[9.5px] sm:text-[10px] font-extrabold px-1.5 py-0.2 rounded-md shrink-0 w-fit",
                      salesDeltaPct >= 0
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    )}
                  >
                    {salesDeltaPct >= 0 ? "+" : ""}{salesDeltaPct}% vs {periodDateRanges.prevLabel}
                  </span>
                ) : (
                  <span className="text-[9.5px] sm:text-[10px] text-blue-600 font-bold shrink-0">
                    {periodDateRanges.shortLabel}
                  </span>
                )}
              </div>
            </div>
          </Link>

          {/* Card 2: Take-Home Profit */}
          <Link
            href="/b2b/expenses"
            className={cn(
              "p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group",
              isProfitPositive
                ? "bg-emerald-50/70 border-emerald-200/90 hover:border-emerald-400"
                : "bg-rose-50/80 border-rose-200/90 hover:border-rose-400"
            )}
          >
            <div className="flex items-center justify-between gap-1 sm:gap-1.5">
              <p className={cn(
                "text-[10px] sm:text-[11px] font-bold uppercase tracking-wider leading-tight",
                isProfitPositive ? "text-emerald-800" : "text-rose-800"
              )}>
                <span className="sm:hidden">Net Profit</span>
                <span className="hidden sm:inline">Take-Home Profit</span>
              </p>
              <div className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center font-bold shadow-2xs shrink-0 text-white",
                isProfitPositive ? "bg-emerald-600" : "bg-rose-600"
              )}>
                {isProfitPositive ? (
                  <>
                    <TrendingUp size={14} className="sm:hidden" aria-hidden="true" />
                    <TrendingUp size={16} className="hidden sm:block" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    <TrendingDown size={14} className="sm:hidden" aria-hidden="true" />
                    <TrendingDown size={16} className="hidden sm:block" aria-hidden="true" />
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 sm:mt-2.5">
              <h3 className={cn(
                "text-lg sm:text-2xl font-black tabular-nums tracking-tight",
                isProfitPositive ? "text-emerald-700" : "text-rose-600"
              )}>
                {isProfitPositive ? "+" : ""}₹{Math.round(netProfit).toLocaleString("en-IN")}
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-1 sm:mt-1.5 gap-0.5 sm:gap-1 text-xs">
                <span className={cn(
                  "font-bold text-[10.5px] sm:text-xs truncate",
                  isProfitPositive ? "text-emerald-700" : "text-rose-600"
                )}>
                  {netMargin}% profit margin
                </span>
                <span className="text-[9.5px] sm:text-[10px] text-slate-500 font-semibold truncate" title="Total operating expenses">
                  Cost: ₹{Math.round(totalRawCost).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </Link>

          {/* Card 3: Pending Client Dues */}
          <Link
            href="/b2b/customers"
            className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] hover:border-rose-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between gap-1 sm:gap-1.5">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider leading-tight">
                <span className="sm:hidden">Pending Dues</span>
                <span className="hidden sm:inline">Pending Client Dues</span>
              </p>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0 border border-rose-100">
                <AlertCircle size={14} className="sm:hidden" aria-hidden="true" />
                <AlertCircle size={16} className="hidden sm:block" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-2.5">
              <h3 className="text-lg sm:text-2xl font-black text-rose-600 tabular-nums tracking-tight">
                ₹{pendingDues.toLocaleString("en-IN")}
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-1 sm:mt-1.5 gap-0.5 sm:gap-1 text-xs">
                <span className="text-[#64748B] font-semibold text-[10.5px] sm:text-xs truncate">
                  {cafeDuesBreakdown.filter((c) => c.unpaid > 0).length} store{cafeDuesBreakdown.filter((c) => c.unpaid > 0).length === 1 ? "" : "s"} with dues
                </span>
                <span className="text-[9.5px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-md border border-emerald-200 w-fit">
                  {collectionRate}% Collected
                </span>
              </div>
            </div>
          </Link>

          {/* Card 4: Dispatched Units */}
          <Link
            href="/b2b/dispatch?tab=history"
            className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] hover:border-blue-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between gap-1 sm:gap-1.5">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider leading-tight">
                Dispatched Units
              </p>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0 border border-blue-100">
                <Boxes size={14} className="sm:hidden" aria-hidden="true" />
                <Boxes size={16} className="hidden sm:block" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-2.5">
              <h3 className="text-lg sm:text-2xl font-black text-[#0F172A] tabular-nums tracking-tight">
                {totalDeliveredPieces.toLocaleString("en-IN")} pcs
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-1 sm:mt-1.5 gap-0.5 sm:gap-1 text-xs">
                <span className="text-blue-600 font-semibold text-[10.5px] sm:text-xs truncate">
                  Across all partner slips
                </span>
                <span className="text-[9.5px] sm:text-[10px] text-slate-500 font-bold truncate">
                  Avg {avgPiecesPerSlip} pcs/slip
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* ========================================================= */}
        {/* 4. SEYALPRO INTELLIGENCE & ACTION CENTER                  */}
        {/* ========================================================= */}
        <StoreActivityMonitor
          invoices={invoices}
          stores={stores}
          onSelectClient={(cName) => {
            setSelectedMatrixClient(cName);
            setActiveChartTab("matrix");
          }}
        />

        {/* ========================================================= */}
        {/* 5. INTERACTIVE PRODUCT & DISPATCH ANALYTICS               */}
        {/* ========================================================= */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
          {/* Section Header & Tab Switcher */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold">
                  <BarChart3 size={17} aria-hidden="true" />
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-[#0F172A] tracking-tight">
                  Dispatch &amp; Client Intelligence
                </h2>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5">
                Visual analysis of product velocity, client store share, and item demand mix
              </p>
            </div>

            {/* Interactive Tab Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto scrollbar-none w-full md:w-auto" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeChartTab === "products"}
                onClick={() => setActiveChartTab("products")}
                className={cn(
                  "flex-1 md:flex-initial text-center px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "products"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Package size={13} className="text-blue-600 shrink-0" aria-hidden="true" />
                <span>Top Products</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeChartTab === "clients"}
                onClick={() => setActiveChartTab("clients")}
                className={cn(
                  "flex-1 md:flex-initial text-center px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "clients"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Store size={13} className="text-purple-600 shrink-0" aria-hidden="true" />
                <span>Client Share</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeChartTab === "matrix"}
                onClick={() => setActiveChartTab("matrix")}
                className={cn(
                  "flex-1 md:flex-initial text-center px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "matrix"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Layers size={13} className="text-emerald-600 shrink-0" aria-hidden="true" />
                <span>Store Mix</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeChartTab === "trend"}
                onClick={() => setActiveChartTab("trend")}
                className={cn(
                  "flex-1 md:flex-initial text-center px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                  activeChartTab === "trend"
                    ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <TrendingUp size={13} className="text-blue-600 shrink-0" aria-hidden="true" />
                <span>Velocity</span>
              </button>
            </div>
          </div>

          {/* TAB 1: TOP PRODUCTS (UNITS vs REVENUE) */}
          {activeChartTab === "products" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <span className="text-xs font-bold text-[#64748B]">
                  Ranked breakdown of catalog items across delivery slips ({periodDateRanges.label})
                </span>

                <div className="flex items-center gap-2 justify-between sm:justify-start w-full sm:w-auto">
                  {/* Metric Toggle: Dispatched Pieces vs Gross Revenue */}
                  <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg flex-1 sm:flex-initial justify-between sm:justify-start">
                    <button
                      type="button"
                      onClick={() => setProductMetric("units")}
                      className={cn(
                        "flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md text-[10.5px] sm:text-[11px] font-bold transition-all cursor-pointer text-center",
                        productMetric === "units"
                          ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Pieces (pcs)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductMetric("revenue")}
                      className={cn(
                        "flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md text-[10.5px] sm:text-[11px] font-bold transition-all cursor-pointer text-center",
                        productMetric === "revenue"
                          ? "bg-white text-emerald-700 shadow-2xs font-extrabold"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Revenue (₹)
                    </button>
                  </div>

                  {/* Accessible View Toggle: Chart vs Table */}
                  <button
                    type="button"
                    onClick={() => setChartViewMode(chartViewMode === "chart" ? "table" : "chart")}
                    className="p-1 px-2 rounded-md border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                    title={chartViewMode === "chart" ? "Switch to accessible data table view" : "Switch to graphical chart view"}
                  >
                    <Table size={13} aria-hidden="true" />
                    <span>{chartViewMode === "chart" ? "Table" : "Chart"}</span>
                  </button>
                </div>
              </div>

              {productAnalytics.length > 0 ? (
                chartViewMode === "chart" ? (
                  <div className="h-64 sm:h-72 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={productAnalytics.slice(0, 7)}
                        margin={{ top: 10, right: 10, left: -20, bottom: 35 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: "#64748B", fontWeight: 600 }}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94A3B8" }}
                          tickFormatter={(v) => (productMetric === "revenue" ? `₹${v}` : `${v}`)}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(37, 99, 235, 0.04)" }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload as { name: string; units: number; revenue: number; slipsCount: number };
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
                                  <div className="flex justify-between gap-4 text-slate-400 pt-0.5 text-[10px]">
                                    <span>Delivery Slips:</span>
                                    <span className="text-slate-200 font-semibold">{data.slipsCount} slips</span>
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
                  /* Accessible Table Representation */
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Rank</th>
                          <th className="py-2.5 px-3">Product Name</th>
                          <th className="py-2.5 px-3 text-right">Pieces</th>
                          <th className="py-2.5 px-3 text-right">Revenue (₹)</th>
                          <th className="py-2.5 px-3 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productAnalytics.map((p, idx) => {
                          const sharePct = totalDeliveredPieces > 0 ? Math.round((p.units / totalDeliveredPieces) * 100) : 0;
                          return (
                            <tr key={p.name} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-bold text-slate-500">#{idx + 1}</td>
                              <td className="py-2 px-3 font-bold text-slate-800">{p.name}</td>
                              <td className="py-2 px-3 text-right font-black tabular-nums">{p.units} pcs</td>
                              <td className="py-2 px-3 text-right font-black text-emerald-700 tabular-nums">₹{p.revenue.toLocaleString("en-IN")}</td>
                              <td className="py-2 px-3 text-right font-semibold text-slate-500">{sharePct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                  No product dispatch volume recorded in the selected period.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLIENT DISTRIBUTION & CREDIT DUES */}
          {activeChartTab === "clients" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <span className="text-xs font-bold text-[#64748B]">
                  Client volume, lifetime billed vs unsettled pending balances
                </span>
                <div className="flex items-center gap-3 text-xs font-semibold justify-between sm:justify-start">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />
                      <span className="text-slate-600">Billed</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                      <span className="text-rose-700 font-bold">Dues</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChartViewMode(chartViewMode === "chart" ? "table" : "chart")}
                    className="p-1 px-2 rounded-md border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all text-[11px] font-bold flex items-center gap-1 cursor-pointer ml-1"
                  >
                    <Table size={13} aria-hidden="true" />
                    <span>{chartViewMode === "chart" ? "Table" : "Chart"}</span>
                  </button>
                </div>
              </div>

              {clientAnalytics.length > 0 ? (
                chartViewMode === "chart" ? (
                  <div className="h-64 sm:h-72 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={clientAnalytics.slice(0, 6)}
                        margin={{ top: 10, right: 10, left: -20, bottom: 35 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: "#64748B", fontWeight: 600 }}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94A3B8" }}
                          tickFormatter={(v) => `₹${v}`}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(37, 99, 235, 0.04)" }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload as { name: string; billed: number; unpaid: number; units: number };
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
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Partner Client</th>
                          <th className="py-2.5 px-3 text-right">Billed (₹)</th>
                          <th className="py-2.5 px-3 text-right">Settled (₹)</th>
                          <th className="py-2.5 px-3 text-right">Dues (₹)</th>
                          <th className="py-2.5 px-3 text-right">Pieces</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clientAnalytics.map((c) => (
                          <tr key={c.name} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-slate-800">{c.name}</td>
                            <td className="py-2 px-3 text-right font-black tabular-nums">₹{c.billed.toLocaleString("en-IN")}</td>
                            <td className="py-2 px-3 text-right font-black text-emerald-700 tabular-nums">₹{c.paid.toLocaleString("en-IN")}</td>
                            <td className="py-2 px-3 text-right font-black text-rose-600 tabular-nums">
                              {c.unpaid > 0 ? `₹${c.unpaid.toLocaleString("en-IN")}` : "Settled"}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-slate-500">{c.units} pcs</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                  No partner client sales recorded yet.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRODUCT x CLIENT MATRIX */}
          {activeChartTab === "matrix" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <span className="text-xs font-bold text-[#64748B]">
                  Select a store to see their specific product demand &amp; order mix
                </span>

                {/* Client Selection Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedMatrixClient("all")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                      selectedMatrixClient === "all"
                        ? "bg-[#0F172A] text-white shadow-xs font-extrabold"
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
                          ? "bg-blue-600 text-white shadow-xs font-extrabold"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {matrixData.length > 0 ? (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={matrixData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 35 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "#64748B", fontWeight: 600 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v) => `${v} pcs`}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(37, 99, 235, 0.04)" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as { name: string; units: number; revenue: number };
                            return (
                              <div className="bg-[#0F172A] text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                                <p className="font-extrabold text-blue-300">{data.name}</p>
                                <p className="text-[10px] text-slate-400">
                                  Store: {selectedMatrixClient === "all" ? "All Partner Stores" : selectedMatrixClient}
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
                  <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                  No dispatches recorded for {selectedMatrixClient}.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VELOCITY TREND */}
          {activeChartTab === "trend" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#64748B]">
                  Supply velocity and gross revenue billed across dispatch dates
                </span>
                <span className="text-[10.5px] sm:text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Dual: Revenue &amp; Pieces
                </span>
              </div>

              {timelineAnalytics.length > 0 ? (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={timelineAnalytics}
                      margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B", fontWeight: 600 }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as { date: string; revenue: number; units: number };
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
                  <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                  No timeline data recorded for the active period.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* 6. OPERATIONAL SECTION: PENDING BALANCES & RECENT SLIPS   */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left Column: Pending Client Balances */}
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] pb-2.5 sm:pb-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle size={16} className="text-rose-600 shrink-0" aria-hidden="true" />
                <h3 className="font-extrabold text-xs sm:text-sm text-[#0F172A] tracking-tight whitespace-nowrap">
                  <span className="sm:hidden">Balances</span>
                  <span className="hidden sm:inline">Pending Client Balances</span>
                </h3>
                <span className="text-[9.5px] sm:text-[10px] font-black px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800">
                  ₹{pendingDues.toLocaleString("en-IN")}
                </span>
              </div>
              <Link
                href="/b2b/customers"
                className="text-[11px] sm:text-xs font-bold text-blue-600 hover:underline shrink-0 whitespace-nowrap ml-auto"
              >
                All Ledgers →
              </Link>
            </div>

            {/* Quick Search for Balances */}
            {cafeDuesBreakdown.length > 3 && (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="text"
                  value={duesSearchQuery}
                  onChange={(e) => setDuesSearchQuery(e.target.value)}
                  placeholder="Filter store accounts..."
                  aria-label="Filter store accounts"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                />
              </div>
            )}

            {/* Balances List */}
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto pr-1">
              {displayedCafeDues.map((cafe) => (
                <div key={cafe.name} className="py-2.5 sm:py-3 flex items-center justify-between text-xs gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-xs sm:text-sm text-[#0F172A] tracking-tight font-sans truncate">
                      {formatCafeName(cafe.name)}
                    </p>
                    <span className="text-[10px] sm:text-[11px] text-[#64748B] block truncate mt-0.5">
                      <span className="sm:hidden">₹{cafe.billed.toLocaleString("en-IN")} billed · {cafe.units} pcs</span>
                      <span className="hidden sm:inline">₹{cafe.billed.toLocaleString("en-IN")} lifetime billed · {cafe.units} units</span>
                    </span>
                  </div>
                  <div className="text-right flex items-center gap-1.5 sm:gap-2 shrink-0">
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
                        className="px-2 sm:px-2.5 py-1 rounded-lg sm:rounded-xl text-[10.5px] sm:text-[11px] font-extrabold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all whitespace-nowrap active:scale-95 cursor-pointer"
                      >
                        Record
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              {displayedCafeDues.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs font-semibold whitespace-nowrap">
                  No matching client balances found.
                </div>
              )}
            </div>

            {cafeDuesBreakdown.length > 5 && (
              <div className="pt-2 text-center border-t border-slate-100 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAllDues(!showAllDues)}
                  className="text-xs font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  {showAllDues ? (
                    <>
                      <span>Show Top 5 Only</span>
                      <ChevronUp size={13} aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      <span>+{cafeDuesBreakdown.length - 5} more clients · Expand All</span>
                      <ChevronDown size={13} aria-hidden="true" />
                    </>
                  )}
                </button>
                <span className="text-slate-300">·</span>
                <Link
                  href="/b2b/customers"
                  className="text-xs font-bold text-slate-600 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Full Ledger →
                </Link>
              </div>
            )}
          </div>

          {/* Right Column: Recent Delivery Slips */}
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] pb-2.5 sm:pb-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <Clock size={16} className="text-blue-600 shrink-0" aria-hidden="true" />
                <h3 className="font-extrabold text-xs sm:text-sm text-[#0F172A] tracking-tight whitespace-nowrap">
                  <span className="sm:hidden">Recent Slips</span>
                  <span className="hidden sm:inline">Recent Delivery Slips</span>
                </h3>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs font-bold whitespace-nowrap ml-auto">
                <Link href="/b2b/dispatch" className="text-blue-600 hover:underline">
                  New Slip
                </Link>
                <span className="text-slate-300">·</span>
                <Link href="/b2b/dispatch?tab=history" className="text-blue-600 hover:underline">
                  History ({currentInvoices.length}) →
                </Link>
              </div>
            </div>

            {/* Quick Filter Tabs: All, Pending, Paid + Search on mobile */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs font-bold overflow-x-auto scrollbar-none w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSlipsStatusFilter("all")}
                  className={cn(
                    "flex-1 sm:flex-initial text-center px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap",
                    slipsStatusFilter === "all"
                      ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  All ({currentInvoices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSlipsStatusFilter("pending")}
                  className={cn(
                    "flex-1 sm:flex-initial text-center px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap",
                    slipsStatusFilter === "pending"
                      ? "bg-white text-rose-700 shadow-2xs font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Pending ({currentInvoices.filter((i) => i.status === "unpaid").length})
                </button>
                <button
                  type="button"
                  onClick={() => setSlipsStatusFilter("paid")}
                  className={cn(
                    "flex-1 sm:flex-initial text-center px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap",
                    slipsStatusFilter === "paid"
                      ? "bg-white text-emerald-700 shadow-2xs font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Paid ({currentInvoices.filter((i) => i.status === "paid").length})
                </button>
              </div>

              {/* Slips search input */}
              <div className="relative w-full sm:w-44 shrink-0">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="text"
                  value={slipsSearchQuery}
                  onChange={(e) => setSlipsSearchQuery(e.target.value)}
                  placeholder="Slip # or store..."
                  aria-label="Filter delivery slips by slip number or store name"
                  className="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Slips List */}
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto pr-1">
              {displayedInvoices.map((inv) => (
                <div key={inv.id} className="py-2.5 sm:py-3 border-b border-slate-100 last:border-b-0">
                  {/* Mobile View: High readability 2-line layout (No store name truncation) */}
                  <div className="sm:hidden space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-extrabold text-xs text-[#0F172A] tracking-tight truncate flex-1">
                        {formatCafeName(inv.customerName)}
                      </p>
                      <span className="font-black text-[#0F172A] text-xs shrink-0 tabular-nums">
                        ₹{inv.totalAmount.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium truncate">
                        <span className="font-mono font-bold text-blue-600">{inv.invoiceNumber}</span>
                        <span className="text-slate-300">·</span>
                        <span>{inv.date}</span>
                        <span className="text-slate-300">·</span>
                        <span>{(inv.items || []).length} items</span>
                      </div>
                      <span
                        className={cn(
                          "text-[9px] font-extrabold px-1.5 py-0.2 rounded-full shrink-0",
                          inv.status === "paid"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        )}
                      >
                        {inv.status === "paid" ? "Paid" : "Pending"}
                      </span>
                    </div>
                  </div>

                  {/* Desktop View: Exact Approved Layout */}
                  <div className="hidden sm:flex items-center justify-between text-xs gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-blue-600 whitespace-nowrap text-xs">{inv.invoiceNumber}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans truncate">
                          {formatCafeName(inv.customerName)}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#64748B] block truncate mt-0.5">
                        {inv.date} · {(inv.items || []).length} line items
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-[#0F172A] text-sm block whitespace-nowrap tabular-nums">
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
                </div>
              ))}
              {displayedInvoices.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs font-semibold whitespace-nowrap">
                  No delivery slips found matching your filters.
                </div>
              )}
            </div>

            {filteredInvoicesList.length > 5 && (
              <div className="pt-2 text-center border-t border-slate-100 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAllInvoices(!showAllInvoices)}
                  className="text-xs font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  {showAllInvoices ? (
                    <>
                      <span>Show Recent 5 Slips</span>
                      <ChevronUp size={13} aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      <span>+{filteredInvoicesList.length - 5} more slips · Expand All</span>
                      <ChevronDown size={13} aria-hidden="true" />
                    </>
                  )}
                </button>
                <span className="text-slate-300">·</span>
                <Link
                  href="/b2b/dispatch?tab=history"
                  className="text-xs font-bold text-slate-600 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Invoices Table →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
