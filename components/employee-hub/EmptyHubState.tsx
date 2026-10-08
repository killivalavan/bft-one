"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, Calendar, Wallet, Award, ArrowRight } from "lucide-react";

interface MissingDataNoticeProps {
  type: "salary" | "joining_date" | "achievements";
}

export function MissingDataNotice({ type }: MissingDataNoticeProps) {
  if (type === "salary") {
    return (
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 text-amber-900 shadow-2xs">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Wallet size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-amber-950">
            Salary Information Not Configured
          </h4>
          <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
            Salary information hasn't been added yet. Please contact your store manager or administrator to update your official compensation structure.
          </p>
        </div>
      </div>
    );
  }

  if (type === "joining_date") {
    return (
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 text-blue-900 shadow-2xs">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
          <Calendar size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-blue-950">
            Joining Date Required for Milestones
          </h4>
          <p className="text-xs text-blue-800/90 mt-0.5 leading-relaxed">
            Add your joining date to see your service journey and unlock your anniversary countdown.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center shadow-2xs">
      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center mx-auto mb-3">
        <Award size={22} />
      </div>
      <h4 className="text-sm font-bold text-[#0F172A]">No Achievements Yet</h4>
      <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
        Your achievements will appear here as you reach new milestones, complete attendance streaks, and achieve company recognitions.
      </p>
    </div>
  );
}
