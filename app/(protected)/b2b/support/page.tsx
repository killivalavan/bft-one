"use client";

import React from "react";
import RaiseIssueModal from "@/components/support/RaiseIssueModal";
import { LifeBuoy, Sparkles, ShieldCheck } from "lucide-react";
import { useTenant } from "@/lib/context/TenantContext";

export default function BakerSupportPage() {
  const { business } = useTenant();

  return (
    <div>
      {/* Top Banner */}
      <div className="bg-white border-b border-[#E2E8F0] px-4 py-6 sm:px-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
              <LifeBuoy size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-black text-[#0F172A] tracking-tight">
                  Support &amp; Issue Resolution
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-900 border border-blue-200 whitespace-nowrap shrink-0">
                  B2B Hub
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
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
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <RaiseIssueModal isOpen={true} isInline={true} onClose={() => {}} />
      </div>
    </div>
  );
}
