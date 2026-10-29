"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import {
  Package,
  Store,
  Layers,
  TrendingUp,
  BarChart3,
  Table,
  IndianRupee,
  Trophy,
  Sparkles,
  BarChart2,
  LayoutList,
  CheckCircle2,
  AlertCircle,
  Eye,
  ArrowUpRight,
  TrendingDown,
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
  LabelList,
} from "recharts";

export interface ProductAnalyticsItem {
  name: string;
  units: number;
  revenue: number;
  slipsCount: number;
  clients: Record<string, number>;
}

export interface ClientAnalyticsItem {
  name: string;
  billed: number;
  paid: number;
  unpaid: number;
  units: number;
  topProduct: string;
  lastDate?: string;
}

export interface TimelineAnalyticsItem {
  date: string;
  rawDate: string;
  units: number;
  revenue: number;
}

export interface MatrixDataItem {
  name: string;
  units: number;
  revenue: number;
}

export interface PeriodDateRanges {
  label: string;
  shortLabel: string;
  dateBadge: string;
  currentInterval: { start: Date; end: Date } | null;
  prevInterval: { start: Date; end: Date } | null;
  hasPrevComparison: boolean;
  prevLabel: string;
}

export interface DispatchClientIntelligenceProps {
  activeChartTab: "products" | "clients" | "matrix" | "trend";
  setActiveChartTab: (tab: "products" | "clients" | "matrix" | "trend") => void;
  productAnalytics: ProductAnalyticsItem[];
  clientAnalytics: ClientAnalyticsItem[];
  timelineAnalytics: TimelineAnalyticsItem[];
  clientNames: string[];
  matrixData: MatrixDataItem[];
  selectedMatrixClient: string;
  setSelectedMatrixClient: (client: string) => void;
  periodDateRanges: PeriodDateRanges;
  totalDeliveredPieces: number;
  grossSales?: number;
  pendingDues?: number;
}

/**
 * Custom X-Axis Tick that prevents label cutoff for long product and client names
 */
interface CustomTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  maxLen?: number;
}

const CustomAxisTick = ({ x = 0, y = 0, payload, maxLen = 22 }: CustomTickProps) => {
  if (!payload || !payload.value) return null;
  const rawText = String(payload.value);
  const displayText = rawText.length > maxLen ? rawText.slice(0, maxLen - 1) + "…" : rawText;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="end"
        fill="#64748B"
        fontSize={10.5}
        fontWeight={600}
        transform="rotate(-20)"
      >
        {displayText}
      </text>
    </g>
  );
};

export default function DispatchClientIntelligence({
  activeChartTab,
  setActiveChartTab,
  productAnalytics,
  clientAnalytics,
  timelineAnalytics,
  clientNames,
  matrixData,
  selectedMatrixClient,
  setSelectedMatrixClient,
  periodDateRanges,
  totalDeliveredPieces,
  grossSales = 0,
  pendingDues = 0,
}: DispatchClientIntelligenceProps) {
  // Metric toggle for Products tab: pieces vs revenue
  const [productMetric, setProductMetric] = useState<"units" | "revenue">("units");

  // Presentation view modes:
  // "columns" (Vertical Bar Chart) | "leaderboard" (Ranked Progress Cards) | "table" (Data Table)
  const [productsViewMode, setProductsViewMode] = useState<"columns" | "leaderboard" | "table">("columns");
  const [clientsViewMode, setClientsViewMode] = useState<"chart" | "table">("chart");

  // =========================================================================
  // Executive Insights Calculations
  // =========================================================================
  const topProduct = productAnalytics[0];
  const topProductShare =
    totalDeliveredPieces > 0 && topProduct
      ? Math.round((topProduct.units / totalDeliveredPieces) * 100)
      : 0;

  const maxProductUnits = useMemo(() => {
    return Math.max(...productAnalytics.map((p) => p.units), 1);
  }, [productAnalytics]);

  const maxProductRevenue = useMemo(() => {
    return Math.max(...productAnalytics.map((p) => p.revenue), 1);
  }, [productAnalytics]);

  const topClient = clientAnalytics[0];
  const peakTimelineDay = useMemo(() => {
    if (!timelineAnalytics.length) return null;
    return [...timelineAnalytics].sort((a, b) => b.units - a.units)[0];
  }, [timelineAnalytics]);

  const avgTimelineUnits = useMemo(() => {
    if (!timelineAnalytics.length) return 0;
    const total = timelineAnalytics.reduce((acc, t) => acc + t.units, 0);
    return Math.round(total / timelineAnalytics.length);
  }, [timelineAnalytics]);

  // Dynamic tower sizing:
  // When there are few items (e.g. 2–4 products), make the towers large, broad, and prominent (72px+).
  // As the item count increases, the towers automatically scale down smoothly and increase in count.
  const getDynamicBarSize = (count: number) => {
    if (count <= 1) return 120;
    if (count === 2) return 96;
    if (count === 3) return 82;
    if (count === 4) return 72;
    if (count === 5) return 58;
    if (count === 6) return 48;
    if (count <= 8) return 38;
    if (count <= 10) return 32;
    return 26;
  };

  // Dynamic tower count: When more products exist in catalog/dispatches, increase the tower count
  // Defaults to up to 10 products (expandable if more exist)
  const [productLimit, setProductLimit] = useState<number>(10);
  const displayProducts = useMemo(() => {
    return productAnalytics.slice(0, productLimit);
  }, [productAnalytics, productLimit]);

  const productBarSize = getDynamicBarSize(displayProducts.length);
  const productAxisMaxLen = displayProducts.length <= 4 ? 26 : displayProducts.length <= 6 ? 20 : 14;

  const [clientLimit, setClientLimit] = useState<number>(8);
  const displayClients = useMemo(() => {
    return clientAnalytics.slice(0, clientLimit);
  }, [clientAnalytics, clientLimit]);
  const clientBarSize = displayClients.length <= 2 ? 40 : displayClients.length <= 4 ? 30 : displayClients.length <= 6 ? 24 : 18;
  const clientAxisMaxLen = displayClients.length <= 4 ? 24 : 16;

  const [matrixLimit, setMatrixLimit] = useState<number>(10);
  const displayMatrix = useMemo(() => {
    return matrixData.slice(0, matrixLimit);
  }, [matrixData, matrixLimit]);
  const matrixBarSize = getDynamicBarSize(displayMatrix.length);
  const matrixAxisMaxLen = displayMatrix.length <= 4 ? 26 : displayMatrix.length <= 6 ? 20 : 14;

  return (
    <div className="relative bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* High-standard Top Accent Gradient Bar */}
      <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        {/* ========================================================= */}
        {/* SECTION HEADER & TAB SWITCHER                             */}
        {/* ========================================================= */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 border-b border-slate-100 pb-3.5 sm:pb-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 flex items-center justify-center font-bold shrink-0">
              <BarChart3 size={20} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Dispatch &amp; Client Intelligence
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Visual analysis of product velocity, client store share, and item demand mix
              </p>
            </div>
          </div>

          {/* Segmented Tab Switcher */}
          <div
            className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl overflow-x-auto scrollbar-none w-full lg:w-auto border border-slate-200/60"
            role="tablist"
            aria-label="Intelligence Views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeChartTab === "products"}
              onClick={() => setActiveChartTab("products")}
              className={cn(
                "flex-1 lg:flex-initial text-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                activeChartTab === "products"
                  ? "bg-white text-blue-700 shadow-xs font-extrabold border border-slate-200/50"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Package size={13.5} className="text-blue-600 shrink-0" aria-hidden="true" />
              <span>Top Products</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeChartTab === "clients"}
              onClick={() => setActiveChartTab("clients")}
              className={cn(
                "flex-1 lg:flex-initial text-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                activeChartTab === "clients"
                  ? "bg-white text-indigo-700 shadow-xs font-extrabold border border-slate-200/50"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Store size={13.5} className="text-indigo-600 shrink-0" aria-hidden="true" />
              <span>Client Share</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeChartTab === "matrix"}
              onClick={() => setActiveChartTab("matrix")}
              className={cn(
                "flex-1 lg:flex-initial text-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                activeChartTab === "matrix"
                  ? "bg-white text-teal-700 shadow-xs font-extrabold border border-slate-200/50"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Layers size={13.5} className="text-teal-600 shrink-0" aria-hidden="true" />
              <span>Store Mix</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeChartTab === "trend"}
              onClick={() => setActiveChartTab("trend")}
              className={cn(
                "flex-1 lg:flex-initial text-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                activeChartTab === "trend"
                  ? "bg-white text-emerald-700 shadow-xs font-extrabold border border-slate-200/50"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <TrendingUp size={13.5} className="text-emerald-600 shrink-0" aria-hidden="true" />
              <span>Velocity</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* EXECUTIVE KPI INSIGHTS STRIP (Contextual per tab)         */}
        {/* ========================================================= */}
        {activeChartTab === "products" && productAnalytics.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 bg-gradient-to-br from-slate-50 to-blue-50/30 p-2.5 sm:p-3 rounded-2xl border border-slate-200/70">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Trophy size={11} className="text-amber-500" />
                #1 Velocity Leader
              </span>
              <p className="text-xs sm:text-sm font-black text-slate-800 truncate" title={topProduct?.name}>
                {topProduct?.name || "-"}
              </p>
              <span className="text-[10px] font-bold text-blue-600">
                {topProduct ? `${topProduct.units} pcs (${topProductShare}%)` : "-"}
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Package size={11} className="text-blue-500" />
                Active Catalog
              </span>
              <p className="text-xs sm:text-sm font-black text-slate-800">
                {productAnalytics.length} Products
              </p>
              <span className="text-[10px] font-semibold text-slate-500">
                In period dispatches
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Sparkles size={11} className="text-emerald-500" />
                Total Volume
              </span>
              <p className="text-xs sm:text-sm font-black text-slate-800 tabular-nums">
                {totalDeliveredPieces.toLocaleString("en-IN")} pcs
              </p>
              <span className="text-[10px] font-semibold text-emerald-600">
                ₹{grossSales.toLocaleString("en-IN")} gross billed
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <BarChart2 size={11} className="text-indigo-500" />
                Avg. Volume / Item
              </span>
              <p className="text-xs sm:text-sm font-black text-slate-800 tabular-nums">
                {productAnalytics.length > 0
                  ? Math.round(totalDeliveredPieces / productAnalytics.length)
                  : 0}{" "}
                pcs
              </p>
              <span className="text-[10px] font-semibold text-slate-500">
                Per active SKU
              </span>
            </div>
          </div>
        )}

        {activeChartTab === "clients" && clientAnalytics.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-2.5 sm:p-3 rounded-2xl border border-slate-200/70">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Trophy size={11} className="text-amber-500" />
                Top Store Partner
              </span>
              <p className="text-xs sm:text-sm font-black text-slate-800 truncate" title={topClient?.name}>
                {topClient?.name || "-"}
              </p>
              <span className="text-[10px] font-bold text-indigo-600 tabular-nums">
                ₹{topClient?.billed.toLocaleString("en-IN")} lifetime
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Store size={11} className="text-indigo-500" />
                Partner Stores
              </span>
              <p className="text-xs sm:text-sm font-black text-slate-800">
                {clientAnalytics.length} Stores Active
              </p>
              <span className="text-[10px] font-semibold text-slate-500">
                B2B clients onboarded
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <AlertCircle size={11} className="text-rose-500" />
                Outstanding Dues
              </span>
              <p className="text-xs sm:text-sm font-black text-rose-600 tabular-nums">
                ₹{pendingDues.toLocaleString("en-IN")}
              </p>
              <span className="text-[10px] font-semibold text-slate-500">
                Across unpaid slips
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <CheckCircle2 size={11} className="text-emerald-500" />
                Total Settled
              </span>
              <p className="text-xs sm:text-sm font-black text-emerald-700 tabular-nums">
                ₹{(grossSales - pendingDues).toLocaleString("en-IN")}
              </p>
              <span className="text-[10px] font-bold text-emerald-600">
                {grossSales > 0 ? Math.round(((grossSales - pendingDues) / grossSales) * 100) : 100}% collected
              </span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: TOP PRODUCTS                                       */}
        {/* ========================================================= */}
        {activeChartTab === "products" && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* Sub-header Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                  Ranked breakdown across delivery slips
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  {periodDateRanges.label}
                </span>
              </div>

              <div className="flex items-center gap-2 justify-between sm:justify-start w-full sm:w-auto">
                {/* Metric Switcher: Pieces vs Gross Revenue */}
                <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setProductMetric("units")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                      productMetric === "units"
                        ? "bg-white text-blue-700 shadow-2xs font-black"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Package size={12} className={productMetric === "units" ? "text-blue-600" : "text-slate-400"} />
                    <span>Pieces (pcs)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductMetric("revenue")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                      productMetric === "revenue"
                        ? "bg-white text-emerald-700 shadow-2xs font-black"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <IndianRupee size={12} className={productMetric === "revenue" ? "text-emerald-600" : "text-slate-400"} />
                    <span>Revenue (₹)</span>
                  </button>
                </div>

                {/* Dynamic Tower Count Selector when catalog has more products */}
                {productAnalytics.length > 5 && (
                  <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-xl border border-slate-200/60 text-[10.5px] font-bold">
                    <button
                      type="button"
                      onClick={() => setProductLimit(5)}
                      className={cn(
                        "px-2 py-1 rounded-lg transition-all cursor-pointer",
                        productLimit === 5
                          ? "bg-white text-blue-700 shadow-2xs font-black"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Top 5
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductLimit(10)}
                      className={cn(
                        "px-2 py-1 rounded-lg transition-all cursor-pointer",
                        productLimit === 10
                          ? "bg-white text-blue-700 shadow-2xs font-black"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Top 10
                    </button>
                    {productAnalytics.length > 10 && (
                      <button
                        type="button"
                        onClick={() => setProductLimit(productAnalytics.length)}
                        className={cn(
                          "px-2 py-1 rounded-lg transition-all cursor-pointer",
                          productLimit > 10
                            ? "bg-white text-blue-700 shadow-2xs font-black"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        All ({productAnalytics.length})
                      </button>
                    )}
                  </div>
                )}

                {/* View Mode Switcher: Columns vs Leaderboard vs Table */}
                <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-xl border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setProductsViewMode("columns")}
                    title="Column Bar Chart"
                    className={cn(
                      "p-1.5 rounded-lg text-slate-600 hover:text-blue-600 transition-all cursor-pointer",
                      productsViewMode === "columns" && "bg-white text-blue-700 shadow-2xs"
                    )}
                  >
                    <BarChart3 size={13.5} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductsViewMode("leaderboard")}
                    title="Ranked Progress Leaderboard"
                    className={cn(
                      "p-1.5 rounded-lg text-slate-600 hover:text-blue-600 transition-all cursor-pointer",
                      productsViewMode === "leaderboard" && "bg-white text-blue-700 shadow-2xs"
                    )}
                  >
                    <LayoutList size={13.5} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductsViewMode("table")}
                    title="Data Table View"
                    className={cn(
                      "p-1.5 rounded-lg text-slate-600 hover:text-blue-600 transition-all cursor-pointer",
                      productsViewMode === "table" && "bg-white text-blue-700 shadow-2xs"
                    )}
                  >
                    <Table size={13.5} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {/* View Content */}
            {productAnalytics.length > 0 ? (
              productsViewMode === "columns" ? (
                /* 1. HIGH-STANDARD VERTICAL BAR CHART */
                <div className="h-72 sm:h-80 w-full min-w-0 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={displayProducts}
                      margin={{ top: 28, right: 16, left: -10, bottom: 48 }}
                      barCategoryGap="12%"
                    >
                      <defs>
                        {/* Units Gradient */}
                        <linearGradient id="productBarUnitsPrimary" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity={1} />
                          <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="productBarUnits" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#60A5FA" stopOpacity={1} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.95} />
                        </linearGradient>

                        {/* Revenue Gradient */}
                        <linearGradient id="productBarRevenuePrimary" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#059669" stopOpacity={1} />
                          <stop offset="100%" stopColor="#047857" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="productBarRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34D399" stopOpacity={1} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0.95} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />

                      <XAxis
                        dataKey="name"
                        interval={0}
                        tick={<CustomAxisTick maxLen={productAxisMaxLen} />}
                        height={55}
                      />

                      <YAxis
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v) =>
                          productMetric === "revenue"
                            ? v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`
                            : `${v}`
                        }
                      />

                      <Tooltip
                        cursor={{ fill: "rgba(59, 130, 246, 0.04)" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as ProductAnalyticsItem;
                            const share =
                              totalDeliveredPieces > 0
                                ? Math.round((data.units / totalDeliveredPieces) * 100)
                                : 0;
                            return (
                              <div className="backdrop-blur-md bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700/80 text-xs space-y-2 ring-1 ring-white/10 min-w-[210px]">
                                <div className="border-b border-slate-700/60 pb-1.5">
                                  <p className="font-black text-blue-300 text-sm leading-tight">
                                    {data.name}
                                  </p>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    Dispatched in {data.slipsCount} delivery slips
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                                      Total Dispatched:
                                    </span>
                                    <strong className="text-white font-bold">{data.units} pcs</strong>
                                  </div>

                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                      Gross Revenue:
                                    </span>
                                    <strong className="text-emerald-400 font-bold tabular-nums">
                                      ₹{data.revenue.toLocaleString("en-IN")}
                                    </strong>
                                  </div>

                                  <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                                    <span>Catalog Volume Share:</span>
                                    <span className="text-blue-300 font-black">{share}%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />

                      <Bar
                        dataKey={productMetric === "units" ? "units" : "revenue"}
                        radius={[10, 10, 0, 0]}
                        barSize={productBarSize}
                        background={{ fill: "#F8FAFC", radius: 10 }}
                      >
                        <LabelList
                          dataKey={productMetric === "units" ? "units" : "revenue"}
                          position="top"
                          offset={8}
                          formatter={(val: any) =>
                            productMetric === "revenue"
                              ? `₹${Number(val).toLocaleString("en-IN")}`
                              : `${val} pcs`
                          }
                          fill="#334155"
                          fontSize={10.5}
                          fontWeight={700}
                        />
                        {productAnalytics.slice(0, 7).map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={
                              productMetric === "units"
                                ? idx === 0
                                  ? "url(#productBarUnitsPrimary)"
                                  : "url(#productBarUnits)"
                                : idx === 0
                                ? "url(#productBarRevenuePrimary)"
                                : "url(#productBarRevenue)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : productsViewMode === "leaderboard" ? (
                /* 2. HIGH-STANDARD RANKED PROGRESS LEADERBOARD */
                <div className="space-y-2.5 pt-1">
                  {displayProducts.map((prod, idx) => {
                    const sharePct =
                      totalDeliveredPieces > 0
                        ? Math.round((prod.units / totalDeliveredPieces) * 100)
                        : 0;
                    const maxVal = productMetric === "units" ? maxProductUnits : maxProductRevenue;
                    const curVal = productMetric === "units" ? prod.units : prod.revenue;
                    const fillPct = Math.max(Math.round((curVal / maxVal) * 100), 4);

                    return (
                      <div
                        key={prod.name}
                        className="p-3 sm:p-3.5 rounded-xl border border-slate-200/80 hover:border-blue-300 hover:shadow-xs transition-all bg-white group space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Rank Badge */}
                            <span
                              className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 border",
                                idx === 0
                                  ? "bg-amber-500/10 text-amber-700 border-amber-300"
                                  : idx === 1
                                  ? "bg-slate-200/80 text-slate-800 border-slate-300"
                                  : idx === 2
                                  ? "bg-orange-500/10 text-orange-700 border-orange-300"
                                  : "bg-slate-50 text-slate-500 border-slate-200"
                              )}
                            >
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-extrabold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                                {prod.name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                Across {prod.slipsCount} delivery slips • Avg{" "}
                                {(prod.units / Math.max(prod.slipsCount, 1)).toFixed(1)} pcs/slip
                              </p>
                            </div>
                          </div>

                          {/* Value Callout */}
                          <div className="text-right shrink-0">
                            <span className="text-xs sm:text-sm font-black text-slate-900 tabular-nums">
                              {productMetric === "units"
                                ? `${prod.units} pcs`
                                : `₹${prod.revenue.toLocaleString("en-IN")}`}
                            </span>
                            <div className="flex items-center justify-end gap-1.5 text-[10px]">
                              <span className="text-slate-400">
                                {productMetric === "units"
                                  ? `₹${prod.revenue.toLocaleString("en-IN")}`
                                  : `${prod.units} pcs`}
                              </span>
                              <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                                {sharePct}% share
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Visual Progress Meter */}
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              productMetric === "units"
                                ? idx === 0
                                  ? "bg-gradient-to-r from-blue-600 to-indigo-600"
                                  : "bg-gradient-to-r from-blue-500 to-blue-400"
                                : idx === 0
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600"
                                : "bg-gradient-to-r from-emerald-500 to-emerald-400"
                            )}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 3. ACCESSIBLE DATA TABLE VIEW */
                <div className="table-scroll-container border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Rank</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3 text-right">Pieces</th>
                        <th className="py-2.5 px-3 text-right">Revenue (₹)</th>
                        <th className="py-2.5 px-3 text-right">Volume Share</th>
                        <th className="py-2.5 px-3 text-right">Delivery Slips</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productAnalytics.map((p, idx) => {
                        const sharePct =
                          totalDeliveredPieces > 0
                            ? Math.round((p.units / totalDeliveredPieces) * 100)
                            : 0;
                        return (
                          <tr key={p.name} className="hover:bg-blue-50/40 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center w-5 h-5 rounded text-[10.5px] font-bold",
                                  idx === 0
                                    ? "bg-amber-100 text-amber-800"
                                    : idx === 1
                                    ? "bg-slate-200 text-slate-800"
                                    : idx === 2
                                    ? "bg-orange-100 text-orange-800"
                                    : "text-slate-500"
                                )}
                              >
                                #{idx + 1}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">{p.name}</td>
                            <td className="py-2.5 px-3 text-right font-black tabular-nums text-slate-900">
                              {p.units} pcs
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-emerald-700 tabular-nums">
                              ₹{p.revenue.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-semibold text-slate-600">{sharePct}%</span>
                                <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                  <div
                                    className="bg-blue-600 h-full rounded-full"
                                    style={{ width: `${sharePct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-500">
                              {p.slipsCount} slips
                            </td>
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

        {/* ========================================================= */}
        {/* TAB 2: CLIENT SHARE & DUES                                */}
        {/* ========================================================= */}
        {activeChartTab === "clients" && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="text-xs font-bold text-slate-600">
                Client volume, lifetime billed vs unsettled pending balances
              </span>

              <div className="flex items-center gap-3 text-xs font-semibold justify-between sm:justify-start">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-indigo-500 to-indigo-600 inline-block shadow-2xs" />
                    <span className="text-slate-600 font-bold text-[11px]">Billed</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-rose-500 to-rose-600 inline-block shadow-2xs" />
                    <span className="text-rose-700 font-bold text-[11px]">Dues</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setClientsViewMode(clientsViewMode === "chart" ? "table" : "chart")}
                  className="p-1 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-all text-[11px] font-bold flex items-center gap-1 cursor-pointer ml-1"
                >
                  <Table size={13} aria-hidden="true" />
                  <span>{clientsViewMode === "chart" ? "Table" : "Chart"}</span>
                </button>
              </div>
            </div>

            {clientAnalytics.length > 0 ? (
              clientsViewMode === "chart" ? (
                <div className="h-72 sm:h-80 w-full min-w-0 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={displayClients}
                      margin={{ top: 20, right: 16, left: -10, bottom: 48 }}
                      barCategoryGap="14%"
                    >
                      <defs>
                        <linearGradient id="clientBilledGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366F1" stopOpacity={1} />
                          <stop offset="100%" stopColor="#4338CA" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="clientDuesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F43F5E" stopOpacity={1} />
                          <stop offset="100%" stopColor="#BE123C" stopOpacity={0.9} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />

                      <XAxis
                        dataKey="name"
                        interval={0}
                        tick={<CustomAxisTick maxLen={clientAxisMaxLen} />}
                        height={55}
                      />

                      <YAxis
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v) => (v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)}
                      />

                      <Tooltip
                        cursor={{ fill: "rgba(99, 102, 241, 0.04)" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as ClientAnalyticsItem;
                            return (
                              <div className="backdrop-blur-md bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700/80 text-xs space-y-2 ring-1 ring-white/10 min-w-[210px]">
                                <div className="border-b border-slate-700/60 pb-1.5">
                                  <p className="font-black text-indigo-300 text-sm leading-tight">
                                    {data.name}
                                  </p>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    Top SKU: {data.topProduct || "-"}
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                                      Total Billed:
                                    </span>
                                    <strong className="text-white font-bold tabular-nums">
                                      ₹{data.billed.toLocaleString("en-IN")}
                                    </strong>
                                  </div>

                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                                      Pending Dues:
                                    </span>
                                    <strong className="text-rose-400 font-bold tabular-nums">
                                      ₹{data.unpaid.toLocaleString("en-IN")}
                                    </strong>
                                  </div>

                                  <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                                    <span>Dispatched Units:</span>
                                    <strong className="text-slate-200">{data.units} pcs</strong>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />

                      <Bar
                        dataKey="billed"
                        name="Lifetime Billed"
                        radius={[8, 8, 0, 0]}
                        barSize={clientBarSize}
                        fill="url(#clientBilledGrad)"
                        background={{ fill: "#F8FAFC", radius: 8 }}
                      />
                      <Bar
                        dataKey="unpaid"
                        name="Pending Dues"
                        radius={[8, 8, 0, 0]}
                        barSize={clientBarSize}
                        fill="url(#clientDuesGrad)"
                        background={{ fill: "#F8FAFC", radius: 8 }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="table-scroll-container border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Partner Client</th>
                        <th className="py-2.5 px-3 text-right">Billed (₹)</th>
                        <th className="py-2.5 px-3 text-right">Settled (₹)</th>
                        <th className="py-2.5 px-3 text-right">Dues (₹)</th>
                        <th className="py-2.5 px-3 text-right">Pieces</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {clientAnalytics.map((c) => (
                        <tr key={c.name} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-800">{c.name}</td>
                          <td className="py-2.5 px-3 text-right font-black tabular-nums">
                            ₹{c.billed.toLocaleString("en-IN")}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-700 tabular-nums">
                            ₹{c.paid.toLocaleString("en-IN")}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-rose-600 tabular-nums">
                            {c.unpaid > 0 ? `₹${c.unpaid.toLocaleString("en-IN")}` : "₹0"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-500">
                            {c.units} pcs
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {c.unpaid > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                                Unsettled
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Settled
                              </span>
                            )}
                          </td>
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

        {/* ========================================================= */}
        {/* TAB 3: PRODUCT x CLIENT MATRIX                            */}
        {/* ========================================================= */}
        {activeChartTab === "matrix" && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="text-xs font-bold text-slate-600">
                Filter by store to analyze item pack distribution &amp; mix
              </span>

              {/* Client Selection Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedMatrixClient("all")}
                  className={cn(
                    "px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                    selectedMatrixClient === "all"
                      ? "bg-slate-900 text-white shadow-xs font-extrabold"
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
                      "px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                      selectedMatrixClient === name
                        ? "bg-teal-600 text-white shadow-xs font-extrabold"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {matrixData.length > 0 ? (
              <div className="h-72 sm:h-80 w-full min-w-0 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={displayMatrix}
                    margin={{ top: 26, right: 16, left: -10, bottom: 48 }}
                    barCategoryGap="12%"
                  >
                    <defs>
                      <linearGradient id="matrixGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0D9488" stopOpacity={1} />
                        <stop offset="100%" stopColor="#0F766E" stopOpacity={0.9} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />

                    <XAxis
                      dataKey="name"
                      interval={0}
                      tick={<CustomAxisTick maxLen={matrixAxisMaxLen} />}
                      height={55}
                    />

                    <YAxis
                      tick={{ fontSize: 10, fill: "#94A3B8" }}
                      tickFormatter={(v) => `${v} pcs`}
                    />

                    <Tooltip
                      cursor={{ fill: "rgba(13, 148, 136, 0.04)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as MatrixDataItem;
                          return (
                            <div className="backdrop-blur-md bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700/80 text-xs space-y-1.5 ring-1 ring-white/10 min-w-[200px]">
                              <p className="font-black text-teal-300 text-sm leading-tight">
                                {data.name}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                Target Store:{" "}
                                <strong className="text-white">
                                  {selectedMatrixClient === "all" ? "All Stores" : selectedMatrixClient}
                                </strong>
                              </p>
                              <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                                <span>Quantity Packed:</span>
                                <strong className="text-white font-bold">{data.units} pcs</strong>
                              </div>
                              <div className="flex justify-between items-center text-slate-300">
                                <span>Billed Value:</span>
                                <strong className="text-emerald-400 font-bold tabular-nums">
                                  ₹{data.revenue.toLocaleString("en-IN")}
                                </strong>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    <Bar
                      dataKey="units"
                      name="Packed Pieces"
                      radius={[10, 10, 0, 0]}
                      barSize={matrixBarSize}
                      fill="url(#matrixGrad)"
                      background={{ fill: "#F8FAFC", radius: 10 }}
                    >
                      <LabelList
                        dataKey="units"
                        position="top"
                        offset={8}
                        formatter={(v: any) => `${v} pcs`}
                        fill="#334155"
                        fontSize={10.5}
                        fontWeight={700}
                      />
                    </Bar>
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

        {/* ========================================================= */}
        {/* TAB 4: VELOCITY TREND                                     */}
        {/* ========================================================= */}
        {activeChartTab === "trend" && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-600">
                Supply velocity and gross revenue billed across dispatch dates
              </span>
              <div className="flex items-center gap-2">
                {peakTimelineDay && (
                  <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 hidden sm:inline">
                    Peak: {peakTimelineDay.date} ({peakTimelineDay.units} pcs)
                  </span>
                )}
                <span className="text-[10.5px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Dual: Revenue &amp; Pieces
                </span>
              </div>
            </div>

            {timelineAnalytics.length > 0 ? (
              <div className="h-72 sm:h-80 w-full min-w-0 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={timelineAnalytics}
                    margin={{ top: 20, right: 16, left: -10, bottom: 20 }}
                  >
                    <defs>
                      <linearGradient id="velocityAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />

                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10.5, fill: "#64748B", fontWeight: 600 }}
                      height={40}
                    />

                    <YAxis
                      tick={{ fontSize: 10, fill: "#94A3B8" }}
                      tickFormatter={(v) => (v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)}
                    />

                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as TimelineAnalyticsItem;
                          return (
                            <div className="backdrop-blur-md bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700/80 text-xs space-y-1.5 ring-1 ring-white/10 min-w-[190px]">
                              <p className="font-black text-indigo-300 text-sm leading-tight border-b border-slate-700/60 pb-1">
                                {data.date}
                              </p>
                              <div className="flex justify-between items-center text-slate-300">
                                <span>Billed Revenue:</span>
                                <strong className="text-emerald-400 font-bold tabular-nums">
                                  ₹{data.revenue.toLocaleString("en-IN")}
                                </strong>
                              </div>
                              <div className="flex justify-between items-center text-slate-300">
                                <span>Dispatched Units:</span>
                                <strong className="text-white font-bold">{data.units} pcs</strong>
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
                      stroke="#4F46E5"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#velocityAreaGrad)"
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
    </div>
  );
}
