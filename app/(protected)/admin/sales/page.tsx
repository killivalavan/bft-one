"use client";

import React from "react";
import Link from "next/link";
import { BarChart3, Banknote, ArrowRight, ShoppingBag } from "lucide-react";
import { SalesManager } from "@/components/admin/SalesManager";
import { useTenant } from "@/lib/context/TenantContext";

export default function AdminSalesAnalyticsPage() {
  const { business } = useTenant();

  return (
    <div className="pb-16 min-h-screen">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-7">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-2xs">
              <BarChart3 size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                  Cash &amp; UPI Sales Analytics
                </h1>
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                  Admin Hub
                </span>
              </div>
              <p className="text-[#64748B] text-xs sm:text-sm mt-0.5">
                {business?.name || "Store Operations"} — Historical cash drawer vs digital UPI trends, settlement reports &amp; PDF exports
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/sales"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition shadow-2xs active:scale-95"
              title="Go to Cash & UPI Register Settlement"
            >
              <Banknote size={14} className="text-emerald-600" />
              <span>Cash Settlement</span>
            </Link>

            <Link
              href="/daily-sales"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold transition shadow-2xs active:scale-95"
              title="View Itemized Daily Sales"
            >
              <ShoppingBag size={14} />
              <span>Itemized Sales</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Cash & UPI Manager Component */}
        <SalesManager />
      </div>
    </div>
  );
}

