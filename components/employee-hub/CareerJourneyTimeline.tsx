"use client";

import React from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  Trophy,
  Award,
  Gem,
  Crown,
  PartyPopper,
} from "lucide-react";
import { CareerMilestone } from "@/lib/services/employeeHubService";
import { cn } from "@/lib/utils/cn";

interface CareerJourneyTimelineProps {
  milestones: CareerMilestone[];
  joiningDateStr?: string | null;
}

export function CareerJourneyTimeline({
  milestones,
  joiningDateStr,
}: CareerJourneyTimelineProps) {
  if (!joiningDateStr || milestones.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-[#E2E8F0] p-6 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
          <Sparkles size={24} />
        </div>
        <h3 className="text-base font-bold text-[#0F172A]">My Service Journey</h3>
        <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
          Add your joining date to unlock your personal career timeline and anniversary milestones.
        </p>
      </div>
    );
  }

  const getMilestoneIcon = (iconType: string, isCompleted: boolean) => {
    switch (iconType) {
      case "join":
        return <PartyPopper size={18} className={isCompleted ? "text-blue-600" : "text-slate-400"} />;
      case "one_year":
        return <Award size={18} className={isCompleted ? "text-amber-500" : "text-slate-400"} />;
      case "three_years":
        return <Award size={18} className={isCompleted ? "text-emerald-600" : "text-slate-400"} />;
      case "five_years":
        return <Trophy size={18} className={isCompleted ? "text-purple-600" : "text-slate-400"} />;
      case "ten_years":
        return <Gem size={18} className={isCompleted ? "text-blue-600" : "text-slate-400"} />;
      default:
        return <Crown size={18} className={isCompleted ? "text-amber-600" : "text-slate-400"} />;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 text-[#7C3AED] flex items-center justify-center shrink-0 shadow-2xs">
            <Trophy size={20} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
              My Journey
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B]">
              Your service milestones, anniversaries, and tenure achievements.
            </p>
          </div>
        </div>

        <div className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto">
          Joined on:{" "}
          <strong className="text-[#0F172A]">
            {new Date(joiningDateStr).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </strong>
        </div>
      </div>

      {/* Horizontal / Stepped Timeline for Desktop & Clean Vertical for Mobile */}
      <div className="relative pt-2">
        {/* Timeline connector track for vertical layout */}
        <div className="space-y-4 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-200 before:-z-0">
          {milestones.map((ms, index) => {
            const formattedDate = new Date(ms.targetDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <div
                key={ms.id}
                className={cn(
                  "relative flex items-start gap-4 p-3.5 sm:p-4 rounded-xl border transition-all duration-200",
                  ms.isCompleted
                    ? "bg-slate-50/70 border-slate-200 shadow-2xs hover:bg-slate-50"
                    : ms.isCurrentNext
                    ? "bg-gradient-to-r from-blue-50/80 via-white to-white border-blue-300 ring-2 ring-blue-500/10 shadow-sm"
                    : "bg-white/60 border-dashed border-slate-200 opacity-75"
                )}
              >
                {/* Milestone Node Icon */}
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 transition-transform duration-200 shadow-xs",
                    ms.isCompleted
                      ? "bg-white border-2 border-emerald-500 text-emerald-600"
                      : ms.isCurrentNext
                      ? "bg-blue-600 text-white animate-pulse"
                      : "bg-slate-100 border border-slate-200 text-slate-400"
                  )}
                >
                  {ms.isCompleted ? (
                    <CheckCircle2 size={20} className="text-emerald-600" />
                  ) : (
                    <span className="text-base">{ms.badgeEmoji}</span>
                  )}
                </div>

                {/* Milestone Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        className={cn(
                          "text-sm sm:text-base font-bold tracking-tight",
                          ms.isCompleted
                            ? "text-[#0F172A]"
                            : ms.isCurrentNext
                            ? "text-blue-900"
                            : "text-[#64748B]"
                        )}
                      >
                        {ms.title}
                      </h4>

                      {ms.isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={10} /> Completed
                        </span>
                      )}

                      {ms.isCurrentNext && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 animate-pulse">
                          <Sparkles size={10} /> Current Target
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-[#64748B] flex items-center gap-1 shrink-0">
                      <Calendar size={12} className={ms.isCompleted ? "text-emerald-600" : "text-slate-400"} />
                      <span>{formattedDate}</span>
                    </div>
                  </div>

                  <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                    {ms.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
