"use client";

import React from "react";
import { Trophy, Sparkles, Clock, CheckCircle2, Award } from "lucide-react";
import { NextMilestoneInfo } from "@/lib/services/employeeHubService";
import { cn } from "@/lib/utils/cn";

interface NextMilestoneCardProps {
  nextMilestone: NextMilestoneInfo | null;
  joiningDateStr?: string | null;
}

export function NextMilestoneCard({
  nextMilestone,
  joiningDateStr,
}: NextMilestoneCardProps) {
  if (!joiningDateStr) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-[#E2E8F0] p-6 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
          <Trophy size={24} />
        </div>
        <h3 className="text-base font-bold text-[#0F172A]">Career Milestones</h3>
        <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
          Add your joining date to calculate and track your service anniversaries and milestone badges.
        </p>
      </div>
    );
  }

  if (!nextMilestone) {
    return (
      <div className="bg-gradient-to-br from-amber-50/60 via-white to-amber-50/30 rounded-2xl border border-amber-200/80 p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
            <Trophy size={26} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Pillar of the Company
            </div>
            <h3 className="text-xl font-extrabold text-[#0F172A]">
              All Core Milestones Completed! 👑
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              You are a senior veteran of the team. Thank you for your continued dedication and leadership.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { milestone, daysRemaining, progressPercent, isReachedToday, congratulationsText } =
    nextMilestone;

  return (
    <div
      className={cn(
        "relative rounded-2xl border p-5 sm:p-6 transition-all shadow-xs overflow-hidden",
        isReachedToday
          ? "bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 border-emerald-300 ring-2 ring-emerald-500/20"
          : "bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 border-blue-200/80"
      )}
    >
      {/* Decorative ambient aura */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        {/* Left Milestone Title & Badge */}
        <div className="flex items-center gap-3.5">
          <div
            className={cn(
              "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shrink-0 shadow-xs",
              isReachedToday
                ? "bg-emerald-600 text-white animate-bounce"
                : "bg-white border border-blue-200 shadow-2xs"
            )}
          >
            {isReachedToday ? "🎉" : milestone.badgeEmoji}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
                {isReachedToday ? "Anniversary Today!" : "Your Next Milestone"}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100/70 text-blue-800 border border-blue-200">
                <Sparkles size={11} />
                <span>{milestone.targetYears} Years Target</span>
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight mt-0.5">
              {isReachedToday ? congratulationsText : milestone.title}
            </h3>
          </div>
        </div>

        {/* Right Countdown Pill */}
        <div className="sm:text-right shrink-0">
          {isReachedToday ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xs">
              <CheckCircle2 size={15} />
              <span>Milestone Achieved!</span>
            </div>
          ) : (
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#2563EB] tabular-nums tracking-tight">
                {daysRemaining}{" "}
                <span className="text-sm sm:text-base font-semibold text-[#64748B]">
                  days to go
                </span>
              </div>
              <div className="text-xs text-[#64748B] flex items-center sm:justify-end gap-1 mt-0.5">
                <Clock size={12} />
                <span>
                  Expected:{" "}
                  {new Date(milestone.targetDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-[#64748B]">Milestone Progress</span>
          <span className="text-[#0F172A] font-bold tabular-nums">
            {progressPercent}% completed
          </span>
        </div>

        {/* Custom Progress Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/80">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-1000 ease-out shadow-2xs",
              isReachedToday
                ? "bg-emerald-600"
                : "bg-gradient-to-r from-blue-600 to-indigo-600"
            )}
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-0.5">
          <span>{milestone.description}</span>
          <span className="font-medium text-[#2563EB]">Keep going! 🚀</span>
        </div>
      </div>
    </div>
  );
}
