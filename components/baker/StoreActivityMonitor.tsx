"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  analyzeStoreReorderActivity,
  StoreActivityAnalysis,
} from "@/lib/utils/b2bStoreActivity";
import {
  Store,
  Clock,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Search,
  ArrowRight,
  Sparkles,
  Calendar,
  Layers,
  Bot,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StoreActivityMonitorProps {
  invoices: any[];
  stores: any[];
}

export default function StoreActivityMonitor({
  invoices,
  stores,
}: StoreActivityMonitorProps) {
  const [activeTab, setActiveTab] = useState<"not_ordering" | "reduced_orders" | "all" | "normal">("not_ordering");
  const [searchQuery, setSearchQuery] = useState("");

  // Run the deterministic activity analysis
  const summary = useMemo(() => {
    return analyzeStoreReorderActivity(invoices, stores);
  }, [invoices, stores]);

  // Filter stores according to active tab & search query
  const displayedStores = useMemo(() => {
    let list: StoreActivityAnalysis[] = [];

    if (activeTab === "not_ordering") {
      list = summary.notOrdering;
    } else if (activeTab === "reduced_orders") {
      list = summary.reducedOrders;
    } else if (activeTab === "normal") {
      list = summary.normal;
    } else {
      list = [
        ...summary.notOrdering,
        ...summary.reducedOrders,
        ...summary.normal,
        ...summary.newOrIdle,
      ];
    }

    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.storeName.toLowerCase().includes(query) ||
        (s.phone && s.phone.toLowerCase().includes(query)) ||
        (s.address && s.address.toLowerCase().includes(query))
    );
  }, [summary, activeTab, searchQuery]);

  return (
    <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-xs space-y-3 sm:space-y-3.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-100 pb-2.5 sm:pb-3">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold shrink-0">
            <Bot size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-xs sm:text-base font-extrabold text-[#0F172A] tracking-tight">
                Store Re-Order &amp; Activity Monitor
              </h2>
              {/* AI-Powered Live Agent Badge in our brand Blue */}
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[9.5px] sm:text-[10.5px] font-black tracking-wide shrink-0">
                <Sparkles size={10} className="text-blue-600 shrink-0" />
                <span>AI-Powered Agent</span>
              </div>
            </div>
            <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5 truncate">
              Tracing store replenishment cadences to pinpoint stopped or declining accounts
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-60 shrink-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search store name or phone..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Agentic AI Tracing Status Bar (Compact & Responsive) */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-200/90 text-[11px] sm:text-xs text-slate-700">
        <div className="flex items-center gap-1.5 min-w-0 font-medium">
          <Activity size={13} className="text-blue-600 shrink-0" />
          <span className="truncate">
            Tracing <strong className="text-slate-900 font-extrabold">{summary.totalStoresCount} partner stores</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-[10.5px] sm:text-[11px] font-semibold text-slate-500 shrink-0">
          <span className="inline-flex items-center gap-1 text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Watchdog: <strong className="text-emerald-700">Active</strong>
          </span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="hidden sm:inline-flex items-center gap-1 text-slate-600">
            <ShieldCheck size={11} className="text-blue-600" />
            <strong className="text-slate-700">Multi-Tenant</strong>
          </span>
        </div>
      </div>

      {/* Filter Tabs (Mobile Horizontal Scroll / Compact Bar) */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {/* Tab 1: Not Ordering */}
        <button
          type="button"
          onClick={() => setActiveTab("not_ordering")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs",
            activeTab === "not_ordering"
              ? "bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 text-rose-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <Clock size={12} className="text-rose-600 shrink-0" />
          <span className="whitespace-nowrap">Not Ordering</span>
          <span className={cn(
            "text-[10px] font-black px-1.5 py-0.2 rounded-full",
            summary.notOrdering.length > 0 ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500"
          )}>
            {summary.notOrdering.length}
          </span>
        </button>

        {/* Tab 2: Reduced Order Counts */}
        <button
          type="button"
          onClick={() => setActiveTab("reduced_orders")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs",
            activeTab === "reduced_orders"
              ? "bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 text-amber-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <TrendingDown size={12} className="text-amber-600 shrink-0" />
          <span className="whitespace-nowrap">Reduced Counts</span>
          <span className={cn(
            "text-[10px] font-black px-1.5 py-0.2 rounded-full",
            summary.reducedOrders.length > 0 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"
          )}>
            {summary.reducedOrders.length}
          </span>
        </button>

        {/* Tab 3: Ordering Normally */}
        <button
          type="button"
          onClick={() => setActiveTab("normal")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs",
            activeTab === "normal"
              ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 text-emerald-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
          <span className="whitespace-nowrap">Normal Rhythm</span>
          <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-emerald-600 text-white">
            {summary.normal.length}
          </span>
        </button>

        {/* Tab 4: All Stores */}
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs",
            activeTab === "all"
              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 text-blue-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <Store size={12} className="text-blue-600 shrink-0" />
          <span className="whitespace-nowrap">All Stores</span>
          <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-blue-600 text-white">
            {summary.totalStoresCount}
          </span>
        </button>
      </div>

      {/* Stores List */}
      <div className="space-y-2">
        {displayedStores.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/60 rounded-2xl border border-slate-200/80">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto mb-1.5 font-bold">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="text-xs sm:text-sm font-extrabold text-[#0F172A]">
              {activeTab === "not_ordering"
                ? "No Silent Stores Detected!"
                : activeTab === "reduced_orders"
                ? "No Stores with Reduced Orders!"
                : "No matching stores found"}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 max-w-sm mx-auto">
              {activeTab === "not_ordering"
                ? "Agentic AI verified that all active partner stores are re-ordering within their normal expected cycle."
                : activeTab === "reduced_orders"
                ? "Agentic AI verified that none of your partner clients experienced a 30%+ drop in order frequency."
                : "Try clearing your search query to see all partner stores."}
            </p>
          </div>
        ) : (
          displayedStores.map((store) => {
            const isNotOrdering = store.status === "not_ordering";
            const isReduced = store.status === "reduced_orders";
            const isNormal = store.status === "normal";

            return (
              <div
                key={store.storeId}
                className={cn(
                  "p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border transition-all space-y-1.5",
                  isNotOrdering
                    ? "bg-rose-50/30 border-rose-200 hover:border-rose-300"
                    : isReduced
                    ? "bg-amber-50/30 border-amber-200 hover:border-amber-300"
                    : isNormal
                    ? "bg-white border-slate-200 hover:border-slate-300"
                    : "bg-slate-50/50 border-slate-200"
                )}
              >
                {/* Top Row: Store Name + Direct "View Client" button on right */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h4 className="text-xs sm:text-sm font-extrabold text-[#0F172A] truncate">
                      {store.storeName}
                    </h4>

                    {/* AI Traced Badge */}
                    {isNotOrdering && (
                      <span className="hidden xs:inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                        <Bot size={10} className="shrink-0 text-rose-600" />
                        Lapsed
                      </span>
                    )}

                    {isReduced && (
                      <span className="hidden xs:inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                        <Bot size={10} className="shrink-0 text-amber-600" />
                        Decay
                      </span>
                    )}

                    {isNormal && (
                      <span className="hidden xs:inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        <Bot size={10} className="shrink-0 text-emerald-600" />
                        On Schedule
                      </span>
                    )}
                  </div>

                  {/* Right Action Button (Always aligned on the top right) */}
                  <Link
                    href={`/b2b/customers/${encodeURIComponent(store.storeId || store.storeName)}`}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-1 shadow-2xs hover:text-blue-600 shrink-0"
                  >
                    <span>View Client</span>
                    <ArrowRight size={11} className="text-slate-400" />
                  </Link>
                </div>

                {/* Second Row: Status Diagnosis Explanation */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Status Value Badge on small screen if Lapsed / Reduced */}
                  {isNotOrdering && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white shadow-2xs">
                      <Clock size={10} className="shrink-0" />
                      {store.daysSinceLastOrder !== null
                        ? `${store.daysSinceLastOrder} Days Overdue`
                        : "Not Ordering"}
                    </span>
                  )}

                  {isReduced && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-2xs">
                      <TrendingDown size={10} className="shrink-0" />
                      🔻 {store.dropPercentage}% Order Drop
                    </span>
                  )}

                  <p className="text-[11px] sm:text-xs text-slate-600 font-medium">
                    {store.explanation}
                  </p>
                </div>

                {/* Third Row: Meta Footer (Phone, Last Delivery, Lifetime Slips) in a clean line */}
                <div className="flex flex-wrap items-center gap-2.5 text-[10.5px] sm:text-[11px] text-slate-500 pt-0.5 border-t border-slate-100">
                  {store.phone && (
                    <a
                      href={`tel:${store.phone}`}
                      className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-600 transition-colors"
                      title="Call Store"
                    >
                      <Phone size={11} className="text-slate-400" />
                      <span>{store.phone}</span>
                    </a>
                  )}

                  {store.lastOrderDateStr && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={11} className="text-slate-400" />
                      Last delivery: <strong className="text-slate-700">{store.lastOrderDateStr}</strong>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1">
                    <Layers size={11} className="text-slate-400" />
                    Lifetime: <strong className="text-slate-700">{store.totalOrdersLifetime} slips</strong>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
