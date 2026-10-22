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
  Phone,
  Search,
  ArrowRight,
  Calendar,
  Layers,
  Activity,
  CreditCard,
  Plus,
  BadgeAlert,
  BarChart2,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCafeName } from "@/lib/utils/bakerUtils";

export interface MonitorInvoiceRecord {
  id: string;
  customerName?: string;
  totalAmount?: number;
  status?: string;
  date?: string;
  createdAt?: string;
  items?: Array<{ qty?: number; name?: string; rate?: number }>;
  isReturn?: boolean;
  invoiceNumber?: string;
  title?: string;
}

export interface MonitorStoreRecord {
  id?: string;
  name?: string;
  phone?: string;
  address?: string;
}

export interface StoreActivityMonitorProps {
  invoices: MonitorInvoiceRecord[];
  stores: MonitorStoreRecord[];
  onSelectClient?: (clientName: string) => void;
}

export type ActionFilterTab = "actions_needed" | "not_ordering" | "reduced_orders" | "high_dues" | "normal" | "all";

export default function StoreActivityMonitor({
  invoices,
  stores,
  onSelectClient,
}: StoreActivityMonitorProps) {
  const [activeTab, setActiveTab] = useState<ActionFilterTab>("actions_needed");
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Run deterministic reorder & cadence analysis
  const cadenceSummary = useMemo(() => {
    return analyzeStoreReorderActivity(invoices, stores);
  }, [invoices, stores]);

  // 2. Deterministic Client Receivables / Dues Mapping
  const clientDuesMap = useMemo(() => {
    const map = new Map<string, { unpaidTotal: number; unpaidCount: number; oldestUnpaidDate?: string }>();
    invoices.forEach((inv) => {
      if (inv.status === "unpaid") {
        const key = (inv.customerName || "").trim().toLowerCase();
        const current = map.get(key) || { unpaidTotal: 0, unpaidCount: 0 };
        current.unpaidTotal += inv.totalAmount || 0;
        current.unpaidCount += 1;
        if (!current.oldestUnpaidDate && inv.date) {
          current.oldestUnpaidDate = inv.date;
        }
        map.set(key, current);
      }
    });
    return map;
  }, [invoices]);

  // 3. Combined Action Items List
  const allEnrichedStores = useMemo(() => {
    const combined: (StoreActivityAnalysis & {
      unpaidDues: number;
      unpaidSlipsCount: number;
      hasHighDues: boolean;
      actionPriority: "urgent" | "warning" | "attention" | "healthy";
    })[] = [];

    const baseList = [
      ...cadenceSummary.notOrdering,
      ...cadenceSummary.reducedOrders,
      ...cadenceSummary.normal,
      ...cadenceSummary.newOrIdle,
    ];

    baseList.forEach((store) => {
      const storeKey = store.storeName.trim().toLowerCase();
      const duesInfo = clientDuesMap.get(storeKey) || { unpaidTotal: 0, unpaidCount: 0 };
      const unpaidDues = duesInfo.unpaidTotal;
      const unpaidSlipsCount = duesInfo.unpaidCount;
      const hasHighDues = unpaidDues >= 1000;

      let actionPriority: "urgent" | "warning" | "attention" | "healthy" = "healthy";
      if (store.status === "not_ordering") {
        actionPriority = "urgent";
      } else if (hasHighDues) {
        actionPriority = "attention";
      } else if (store.status === "reduced_orders") {
        actionPriority = "warning";
      }

      combined.push({
        ...store,
        unpaidDues,
        unpaidSlipsCount,
        hasHighDues,
        actionPriority,
      });
    });

    return combined;
  }, [cadenceSummary, clientDuesMap]);

  // Sub-lists for counts
  const overdueStores = useMemo(() => allEnrichedStores.filter((s) => s.status === "not_ordering"), [allEnrichedStores]);
  const reducedStores = useMemo(() => allEnrichedStores.filter((s) => s.status === "reduced_orders"), [allEnrichedStores]);
  const highDuesStores = useMemo(() => allEnrichedStores.filter((s) => s.hasHighDues), [allEnrichedStores]);
  const normalStores = useMemo(() => allEnrichedStores.filter((s) => s.status === "normal"), [allEnrichedStores]);
  const actionsNeededStores = useMemo(
    () => allEnrichedStores.filter((s) => s.status === "not_ordering" || s.status === "reduced_orders" || s.hasHighDues),
    [allEnrichedStores]
  );

  // Filter based on active tab and search query
  const displayedStores = useMemo(() => {
    let list = allEnrichedStores;

    if (activeTab === "actions_needed") {
      list = actionsNeededStores;
    } else if (activeTab === "not_ordering") {
      list = overdueStores;
    } else if (activeTab === "reduced_orders") {
      list = reducedStores;
    } else if (activeTab === "high_dues") {
      list = highDuesStores;
    } else if (activeTab === "normal") {
      list = normalStores;
    }

    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.storeName.toLowerCase().includes(query) ||
        (s.phone && s.phone.toLowerCase().includes(query)) ||
        (s.address && s.address.toLowerCase().includes(query))
    );
  }, [allEnrichedStores, activeTab, actionsNeededStores, overdueStores, reducedStores, highDuesStores, normalStores, searchQuery]);

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold shrink-0">
            <Activity size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-[#0F172A] tracking-tight">
                Supply Intelligence &amp; Action Center
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/90 text-blue-700 text-[10.5px] font-extrabold tracking-tight shrink-0 shadow-2xs">
                <Sparkles size={11} className="text-blue-600 shrink-0" />
                <span>SeyalPro AI</span>
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5">
              Automated cadence tracking, reorder reminders &amp; receivables monitoring across accounts
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by store, phone, location..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* SeyalPro AI Status Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50/80 border border-slate-200/80 text-[11px] sm:text-xs text-slate-700">
        <div className="flex items-center gap-2 min-w-0 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse shrink-0" />
          <span className="text-[11px] sm:text-xs truncate">
            <span className="sm:hidden">
              SeyalPro AI: <strong className="text-slate-900 font-extrabold">{cadenceSummary.totalStoresCount} stores</strong> active
            </span>
            <span className="hidden sm:inline">
              SeyalPro AI: Monitoring <strong className="text-slate-900 font-extrabold">{cadenceSummary.totalStoresCount} partner stores</strong> · Real-time cadence tracking
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-[10.5px] sm:text-[11px] font-semibold text-slate-500 shrink-0">
          <span className="text-slate-600 hidden xs:inline">
            Status: <strong className={actionsNeededStores.length > 0 ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
              {actionsNeededStores.length > 0 ? `${actionsNeededStores.length} Action Items` : "Optimal Cadence"}
            </strong>
          </span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="hidden sm:inline-flex items-center gap-1 text-slate-600">
            <Sparkles size={11} className="text-blue-600" />
            <span>AI Powered</span>
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none p-1.5 -mx-1.5 -mt-1.5 mb-2 sm:mb-3" role="tablist">
        {/* Tab 1: Actions Needed */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "actions_needed"}
          onClick={() => setActiveTab("actions_needed")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs font-semibold",
            activeTab === "actions_needed"
              ? "bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 text-rose-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <BadgeAlert size={12} className={actionsNeededStores.length > 0 ? "text-rose-600" : "text-slate-400"} />
          <span className="whitespace-nowrap">Action Needed</span>
          <span
            className={cn(
              "text-[10px] font-black px-1.5 py-0.2 rounded-full",
              actionsNeededStores.length > 0 ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            {actionsNeededStores.length}
          </span>
        </button>

        {/* Tab 2: Reorder Overdue */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "not_ordering"}
          onClick={() => setActiveTab("not_ordering")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs font-semibold",
            activeTab === "not_ordering"
              ? "bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 text-rose-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <Clock size={12} className="text-rose-600 shrink-0" />
          <span className="whitespace-nowrap">Reorder Overdue</span>
          <span
            className={cn(
              "text-[10px] font-black px-1.5 py-0.2 rounded-full",
              overdueStores.length > 0 ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            {overdueStores.length}
          </span>
        </button>

        {/* Tab 3: Order Contraction */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "reduced_orders"}
          onClick={() => setActiveTab("reduced_orders")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs font-semibold",
            activeTab === "reduced_orders"
              ? "bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 text-amber-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <TrendingDown size={12} className="text-amber-600 shrink-0" />
          <span className="whitespace-nowrap">Volume Drops</span>
          <span
            className={cn(
              "text-[10px] font-black px-1.5 py-0.2 rounded-full",
              reducedStores.length > 0 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            {reducedStores.length}
          </span>
        </button>

        {/* Tab 4: High Receivables */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "high_dues"}
          onClick={() => setActiveTab("high_dues")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs font-semibold",
            activeTab === "high_dues"
              ? "bg-purple-50 border-purple-300 ring-2 ring-purple-500/20 text-purple-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <CreditCard size={12} className="text-purple-600 shrink-0" />
          <span className="whitespace-nowrap">High Dues</span>
          <span
            className={cn(
              "text-[10px] font-black px-1.5 py-0.2 rounded-full",
              highDuesStores.length > 0 ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            {highDuesStores.length}
          </span>
        </button>

        {/* Tab 5: Normal Rhythm */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "normal"}
          onClick={() => setActiveTab("normal")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs font-semibold",
            activeTab === "normal"
              ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 text-emerald-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
          <span className="whitespace-nowrap">On Cadence</span>
          <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-emerald-600 text-white">
            {normalStores.length}
          </span>
        </button>

        {/* Tab 6: All Stores */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          onClick={() => setActiveTab("all")}
          className={cn(
            "px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs font-semibold",
            activeTab === "all"
              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 text-blue-800 font-bold shadow-2xs"
              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
          )}
        >
          <Store size={12} className="text-blue-600 shrink-0" />
          <span className="whitespace-nowrap">All Stores</span>
          <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
            {cadenceSummary.totalStoresCount}
          </span>
        </button>
      </div>

      {/* Stores Findings List */}
      <div className="space-y-2.5">
        {displayedStores.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/70 rounded-2xl border border-slate-200/80">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-2 font-bold shadow-xs">
              <CheckCircle2 size={22} />
            </div>
            <h3 className="text-sm font-extrabold text-[#0F172A]">
              {activeTab === "actions_needed"
                ? "All Partner Stores On Cadence!"
                : activeTab === "not_ordering"
                ? "No Overdue Accounts Detected"
                : activeTab === "reduced_orders"
                ? "No Volume Contractions"
                : activeTab === "high_dues"
                ? "No Overdue Balances Above Threshold"
                : "No matching partner stores found"}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              {activeTab === "actions_needed"
                ? "SeyalPro AI verified that all active partner stores are reordering on cadence, and receivables are healthy."
                : activeTab === "not_ordering"
                ? "All active partner stores have dispatched recently within their historical replenishment interval."
                : activeTab === "reduced_orders"
                ? "None of your partner clients experienced a 30%+ drop in order frequency or packed pieces."
                : activeTab === "high_dues"
                ? "All client dues are either settled or below the high-priority attention threshold."
                : "Try clearing your search query to see all partner stores."}
            </p>
          </div>
        ) : (
          displayedStores.map((store) => {
            const isNotOrdering = store.status === "not_ordering";
            const isReduced = store.status === "reduced_orders";
            const isNormal = store.status === "normal";
            const hasDues = store.unpaidDues > 0;

            return (
              <div
                key={store.storeId}
                className={cn(
                  "p-3.5 sm:p-4 rounded-2xl border transition-all space-y-2",
                  isNotOrdering
                    ? "bg-rose-50/30 border-rose-200 hover:border-rose-300"
                    : isReduced
                    ? "bg-amber-50/30 border-amber-200 hover:border-amber-300"
                    : store.hasHighDues
                    ? "bg-purple-50/20 border-purple-200 hover:border-purple-300"
                    : isNormal
                    ? "bg-white border-slate-200 hover:border-slate-300"
                    : "bg-slate-50/50 border-slate-200"
                )}
              >
                {/* Row 1: Store Name + Badges + Contextual Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onSelectClient?.(store.storeName)}
                      className="text-xs sm:text-sm font-extrabold text-[#0F172A] hover:text-blue-600 transition-colors truncate text-left cursor-pointer"
                      title="Filter analytics to this store"
                    >
                      {formatCafeName(store.storeName)}
                    </button>

                    {/* Status Badge */}
                    {isNotOrdering && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                        <Clock size={10} className="shrink-0 text-rose-600" />
                        {store.daysSinceLastOrder !== null
                          ? `${store.daysSinceLastOrder}d Overdue`
                          : "Lapsed Reorder"}
                      </span>
                    )}

                    {isReduced && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                        <TrendingDown size={10} className="shrink-0 text-amber-600" />
                        {store.dropPercentage}% Order Drop
                      </span>
                    )}

                    {store.hasHighDues && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200 shrink-0">
                        <CreditCard size={10} className="shrink-0 text-purple-600" />
                        ₹{store.unpaidDues.toLocaleString("en-IN")} Pending
                      </span>
                    )}

                    {isNormal && !store.hasHighDues && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        <CheckCircle2 size={10} className="shrink-0 text-emerald-600" />
                        On Cadence
                      </span>
                    )}
                  </div>

                  {/* Action Buttons: Symmetrical & Full-Width Friendly on Mobile */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto pt-1 sm:pt-0 shrink-0">
                    {/* Primary Contextual Action */}
                    {isNotOrdering ? (
                      <Link
                        href={`/b2b/dispatch?client=${encodeURIComponent(store.storeName)}`}
                        className="flex-1 sm:flex-initial justify-center px-2.5 py-1.5 sm:py-1 rounded-xl text-[11px] font-extrabold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <Plus size={12} />
                        <span>New Slip</span>
                      </Link>
                    ) : hasDues ? (
                      <Link
                        href={`/b2b/payments?store=${encodeURIComponent(store.storeName)}`}
                        className="flex-1 sm:flex-initial justify-center px-2.5 py-1.5 sm:py-1 rounded-xl text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <CreditCard size={12} />
                        <span>Record Payment</span>
                      </Link>
                    ) : null}

                    {/* Filter Analytics Button (Optional icon helper) */}
                    {onSelectClient && (
                      <button
                        type="button"
                        onClick={() => onSelectClient(store.storeName)}
                        className="hidden sm:inline-flex px-2 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 transition-all items-center gap-1 cursor-pointer"
                        title="View item demand for this store"
                      >
                        <BarChart2 size={11} />
                        <span>Mix</span>
                      </button>
                    )}

                    {/* View Client Ledger Button */}
                    <Link
                      href={`/b2b/customers/${encodeURIComponent(store.storeId || store.storeName)}`}
                      className="flex-1 sm:flex-initial justify-center px-2.5 py-1.5 sm:py-1 rounded-xl text-[11px] font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-1 shadow-2xs hover:text-blue-600 cursor-pointer active:scale-95"
                    >
                      <span>Ledger</span>
                      <ArrowRight size={11} className="text-slate-400" />
                    </Link>
                  </div>
                </div>

                {/* Row 2: Diagnostic Explanation */}
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed font-normal">
                  {store.explanation}
                  {hasDues && (
                    <span className="ml-1 text-slate-700 font-semibold">
                      · Unsettled balance: <strong className="text-rose-600">₹{store.unpaidDues.toLocaleString("en-IN")}</strong> ({store.unpaidSlipsCount} unpaid slip{store.unpaidSlipsCount === 1 ? "" : "s"}).
                    </span>
                  )}
                </p>

                {/* Row 3: Meta Footer (Structured 2-col Grid on Mobile, Inline Row on Desktop) */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 text-[10.5px] sm:text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  {store.phone && (
                    <a
                      href={`tel:${store.phone}`}
                      className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-600 transition-colors truncate"
                      title="Call Store"
                    >
                      <Phone size={11} className="text-slate-400 shrink-0" />
                      <span className="truncate">{store.phone}</span>
                    </a>
                  )}

                  {store.lastOrderDateStr && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <Calendar size={11} className="text-slate-400 shrink-0" />
                      <span className="truncate">Last: <strong className="text-slate-700 font-medium">{store.lastOrderDateStr}</strong></span>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 truncate">
                    <Layers size={11} className="text-slate-400 shrink-0" />
                    <span className="truncate">Lifetime: <strong className="text-slate-700 font-medium">{store.totalOrdersLifetime} slips</strong></span>
                  </span>

                  {store.typicalIntervalDays && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <Clock size={11} className="text-slate-400 shrink-0" />
                      <span className="truncate">Cycle: <strong className="text-slate-700 font-medium">Every {store.typicalIntervalDays}d</strong></span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
