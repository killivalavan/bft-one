"use client";

import React from "react";
import { Store } from "lucide-react";
import { StoreSettings } from "@/components/admin/StoreSettings";
import { useTenant } from "@/lib/context/TenantContext";

export default function B2BStoreSettingsPage() {
  const { business } = useTenant();

  return (
    <div className="w-full max-w-6xl group-data-[sidebar-collapsed=true]:max-w-none mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="sticky top-14 md:top-0 z-20 w-full px-1 sm:px-2 md:px-0 bg-[#F8FAFC] pt-1.5 sm:pt-2 md:pt-3 pb-2.5 sm:pb-3 transition-all">
        <div className="w-full px-3.5 sm:px-5 py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 bg-white rounded-3xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-700 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              <Store size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight">Business Profile</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-900 border border-blue-200">
                  B2B Supply
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block mt-0.5">
                {business?.name || "B2B Supply Hub"} — Brand logos, delivery slip headers, authorized signature &amp; business location
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-1 sm:px-2 md:px-0 pt-1 pb-6 space-y-5 sm:space-y-6">
        <StoreSettings />
      </div>
    </div>
  );
}
