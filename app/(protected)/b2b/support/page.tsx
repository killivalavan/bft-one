"use client";

import React from "react";
import RaiseIssueModal from "@/components/support/RaiseIssueModal";
import { LifeBuoy, Sparkles, ShieldCheck } from "lucide-react";
import { useTenant } from "@/lib/context/TenantContext";

export default function BakerSupportPage() {
  const { business } = useTenant();

  return (
    <div className="w-full max-w-6xl group-data-[sidebar-collapsed=true]:max-w-none mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="sticky top-14 md:top-0 z-20 w-full px-1 sm:px-2 md:px-0 bg-[#F8FAFC] pt-1.5 sm:pt-2 md:pt-3 pb-2.5 sm:pb-3 transition-all">
        <div className="w-full px-3.5 sm:px-5 py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 bg-white rounded-3xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
              <LifeBuoy size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight">
                  Support &amp; Issue Resolution
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-900 border border-blue-200 whitespace-nowrap shrink-0">
                  B2B Hub
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block mt-0.5">
                Report technical glitches, request B2B features, or contact platform engineering for {business?.name || "your business"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-200 shrink-0">
            <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
            <span>Priority B2B Desk Active</span>
          </div>
        </div>
      </div>

      {/* Main Support Workspace */}
      <div className="w-full px-1 sm:px-2 md:px-0 pt-1 pb-6 space-y-5 sm:space-y-6">
        <RaiseIssueModal isOpen={true} isInline={true} onClose={() => {}} />
      </div>
    </div>
  );
}
