"use client";

import React, { useState } from "react";
import {
  Award,
  Sparkles,
  Lock,
  CheckCircle2,
  Trophy,
  Zap,
  Rocket,
  BookOpen,
  Heart,
  Users,
  ShieldAlert,
} from "lucide-react";
import { AchievementItem } from "@/lib/services/employeeHubService";
import { cn } from "@/lib/utils/cn";

interface AchievementsSectionProps {
  achievements: AchievementItem[];
}

export function AchievementsSection({ achievements }: AchievementsSectionProps) {
  const [filter, setFilter] = useState<string>("all");

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;
  const totalCount = achievements.length;

  const filteredItems = achievements.filter((item) => {
    if (filter === "all") return true;
    if (filter === "unlocked") return item.isUnlocked;
    if (filter === "locked") return !item.isUnlocked;
    return item.category === filter;
  });

  const renderBadgeIcon = (iconName: string, isUnlocked: boolean, emoji: string) => {
    return (
      <div
        className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-xs",
          isUnlocked
            ? "bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200"
            : "bg-slate-100 border border-slate-200 text-slate-400 grayscale"
        )}
      >
        {emoji}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-[#D97706] flex items-center justify-center shrink-0 shadow-2xs">
            <Award size={20} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
              Badges & Recognition
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B]">
              Recognizing your dedication, milestones, and daily contributions.
            </p>
          </div>
        </div>

        {/* Unlocked Stats & Progress Counter */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold shadow-2xs">
            <Sparkles size={14} className="text-amber-600" />
            <span>
              {unlockedCount} / {totalCount} Badges Unlocked
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {[
          { key: "all", label: "All Badges" },
          { key: "unlocked", label: `Unlocked (${unlockedCount})` },
          { key: "locked", label: `Locked (${totalCount - unlockedCount})` },
          { key: "tenure", label: "Tenure" },
          { key: "excellence", label: "Excellence" },
          { key: "skill", label: "Skills" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
              filter === tab.key
                ? "bg-[#0F172A] text-white shadow-xs"
                : "bg-slate-100 text-[#64748B] hover:text-[#0F172A] hover:bg-slate-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredItems.map((badge) => {
          return (
            <div
              key={badge.id}
              className={cn(
                "group relative rounded-2xl border p-4 transition-all duration-300 flex items-start gap-3.5 overflow-hidden",
                badge.isUnlocked
                  ? "bg-gradient-to-br from-white via-white to-amber-50/20 border-slate-200 hover:border-amber-300 hover:shadow-md"
                  : "bg-slate-50/50 border-dashed border-slate-200 opacity-60 hover:opacity-80"
              )}
            >
              {/* Badge Icon */}
              {renderBadgeIcon(badge.iconName, badge.isUnlocked, badge.emoji)}

              {/* Badge Information */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4
                    className={cn(
                      "text-sm font-bold truncate",
                      badge.isUnlocked ? "text-[#0F172A]" : "text-slate-600"
                    )}
                  >
                    {badge.title}
                  </h4>

                  {badge.isUnlocked ? (
                    <span
                      title="Badge Earned"
                      className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"
                    >
                      <CheckCircle2 size={13} />
                    </span>
                  ) : (
                    <span
                      title="Locked"
                      className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
                    >
                      <Lock size={11} />
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#64748B] mt-1 line-clamp-2 leading-relaxed">
                  {badge.description}
                </p>

                <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[11px]">
                  <span className="capitalize text-slate-400 font-medium">
                    {badge.category}
                  </span>
                  {badge.isUnlocked ? (
                    <span className="font-semibold text-emerald-700">
                      {badge.achievedDate
                        ? `Unlocked ${new Date(badge.achievedDate).toLocaleDateString("en-IN", {
                            month: "short",
                            year: "numeric",
                          })}`
                        : "Unlocked"}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">In Progress</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
