"use client";

import React from "react";
import { Wallet, Sparkles, Trophy, TrendingUp, Calendar, Clock } from "lucide-react";
import { ServiceTenure, NextMilestoneInfo } from "@/lib/services/employeeHubService";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

interface EmployeeSummaryCardsProps {
  currentMonthlySalary: number;
  tenure: ServiceTenure;
  nextMilestone: NextMilestoneInfo | null;
  incrementAmount: number;
  nextIncrementDate: string | null;
}

export function EmployeeSummaryCards({
  currentMonthlySalary,
  tenure,
  nextMilestone,
  incrementAmount,
  nextIncrementDate,
}: EmployeeSummaryCardsProps) {
  const formattedNextIncrementDate = nextIncrementDate
    ? new Date(nextIncrementDate).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      })
    : "Next Review";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. CURRENT SALARY */}
      <div className="group relative bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-blue-300 transition-all duration-300 flex flex-col justify-between overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors pointer-events-none" />

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Current Salary
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform duration-200">
              <Wallet size={17} />
            </div>
          </div>

          <div className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight tabular-nums">
            {currentMonthlySalary > 0 ? (
              <span className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-bold text-[#2563EB]">₹</span>
                <span>{currentMonthlySalary.toLocaleString("en-IN")}</span>
                <span className="text-xs font-medium text-[#64748B]">/ mo</span>
              </span>
            ) : (
              <span className="text-base text-slate-400 font-normal">Not configured</span>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-[#64748B]">
          <span>Annual CTC</span>
          <span className="font-bold text-[#0F172A]">
            {currentMonthlySalary > 0
              ? `₹ ${(currentMonthlySalary * 12).toLocaleString("en-IN")}`
              : "—"}
          </span>
        </div>
      </div>

      {/* 2. SERVICE TENURE */}
      <div className="group relative bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all duration-300 flex flex-col justify-between overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors pointer-events-none" />

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Service
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 text-[#16A34A] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform duration-200">
              <Sparkles size={17} />
            </div>
          </div>

          <div className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
            {tenure.formatted !== "Not specified" ? (
              <span>{tenure.formatted}</span>
            ) : (
              <span className="text-base text-slate-400 font-normal">Joining date missing</span>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-[#64748B]">
          <span>Total Service</span>
          <span className="font-bold text-emerald-700">
            {tenure.totalDays > 0 ? `${tenure.totalDays} Days` : "—"}
          </span>
        </div>
      </div>

      {/* 3. NEXT MILESTONE */}
      <div className="group relative bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-purple-300 transition-all duration-300 flex flex-col justify-between overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors pointer-events-none" />

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Next Milestone
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 text-[#7C3AED] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform duration-200">
              <Trophy size={17} />
            </div>
          </div>

          <div className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight truncate">
            {nextMilestone ? (
              <span className="flex items-center gap-1.5">
                <span>{nextMilestone.milestone.badgeEmoji}</span>
                <span>{nextMilestone.milestone.title.replace(" Completed", "")}</span>
              </span>
            ) : (
              <span className="text-base text-slate-400 font-normal">Veteran Leader</span>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-[#64748B]">Status</span>
          {nextMilestone ? (
            <span className="font-bold text-purple-700">
              {nextMilestone.daysRemaining > 0
                ? `${nextMilestone.daysRemaining} days to go`
                : "Milestone reached!"}
            </span>
          ) : (
            <span className="font-bold text-purple-700">All Achieved</span>
          )}
        </div>
      </div>

      {/* 4. NEXT INCREMENT */}
      <div className="group relative bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-amber-300 transition-all duration-300 flex flex-col justify-between overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors pointer-events-none" />

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Next Increment
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 text-[#D97706] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform duration-200">
              <TrendingUp size={17} />
            </div>
          </div>

          <div className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight tabular-nums">
            {incrementAmount > 0 ? (
              <span className="text-amber-600">
                +₹{incrementAmount.toLocaleString("en-IN")}
              </span>
            ) : (
              <span className="text-base text-slate-400 font-normal">Policy Pending</span>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-[#64748B]">
          <span>Appraisal Cycle</span>
          <span className="font-bold text-[#0F172A]">{formattedNextIncrementDate}</span>
        </div>
      </div>
    </div>
  );
}
