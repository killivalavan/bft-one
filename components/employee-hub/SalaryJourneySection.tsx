"use client";

import React, { useState } from "react";
import {
  Wallet,
  TrendingUp,
  History,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Info,
  Clock,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import {
  SalaryProjectionPoint,
  IncrementHistoryItem,
} from "@/lib/services/employeeHubService";
import { SalaryProjectionChart } from "./SalaryProjectionChart";
import { cn } from "@/lib/utils/cn";

interface SalaryJourneySectionProps {
  currentMonthlySalary: number;
  joiningMonthlySalary: number;
  incrementAmount: number;
  incrementFrequencyMonths: number;
  nextIncrementDate: string | null;
  lastIncrement: IncrementHistoryItem | null;
  incrementHistory: IncrementHistoryItem[];
  projections: {
    5: SalaryProjectionPoint[];
    10: SalaryProjectionPoint[];
    15: SalaryProjectionPoint[];
  };
  incrementPolicyNote?: string | null;
}

export function SalaryJourneySection({
  currentMonthlySalary,
  joiningMonthlySalary,
  incrementAmount,
  incrementFrequencyMonths,
  nextIncrementDate,
  lastIncrement,
  incrementHistory,
  projections,
  incrementPolicyNote,
}: SalaryJourneySectionProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<5 | 10 | 15>(5);

  const activeProjectionData = projections[selectedPeriod] || projections[5] || [];
  const projectedEndSalary =
    activeProjectionData.length > 0
      ? activeProjectionData[activeProjectionData.length - 1].monthlySalary
      : currentMonthlySalary;

  const totalGrowthSinceJoining = Math.max(0, currentMonthlySalary - joiningMonthlySalary);
  const percentGrowthSinceJoining =
    joiningMonthlySalary > 0
      ? Math.round((totalGrowthSinceJoining / joiningMonthlySalary) * 100)
      : 0;

  const formattedNextIncrement = nextIncrementDate
    ? new Date(nextIncrementDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Next Review Cycle";

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center shrink-0 shadow-2xs">
            <TrendingUp size={20} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
              My Salary Journey
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B]">
              Career earnings trajectory, increment milestones, and projected future salary.
            </p>
          </div>
        </div>

        {/* Projection Period Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200/80">
          {([5, 10, 15] as const).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                selectedPeriod === period
                  ? "bg-white text-[#2563EB] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              )}
            >
              {period} Years
            </button>
          ))}
        </div>
      </div>

      {/* Salary Overview Metric Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Current Salary */}
        <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/70">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Current Salary
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-[#0F172A] mt-1 tabular-nums">
            ₹ {currentMonthlySalary.toLocaleString("en-IN")}
            <span className="text-xs font-normal text-[#64748B]"> / mo</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
            <ArrowUpRight size={12} />
            <span>Active base structure</span>
          </span>
        </div>

        {/* Joining Salary */}
        <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/70">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Joining Salary
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-[#0F172A] mt-1 tabular-nums">
            {joiningMonthlySalary > 0
              ? `₹ ${joiningMonthlySalary.toLocaleString("en-IN")}`
              : "—"}
            <span className="text-xs font-normal text-[#64748B]"> / mo</span>
          </div>
          <span className="text-[11px] text-[#64748B] font-medium mt-1 block">
            {totalGrowthSinceJoining > 0
              ? `Growth: +₹${totalGrowthSinceJoining.toLocaleString("en-IN")} (+${percentGrowthSinceJoining}%)`
              : "Initial entry level"}
          </span>
        </div>

        {/* Last Increment */}
        <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/70">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Last Increment
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
            {lastIncrement ? (
              `+₹ ${(lastIncrement.incrementAmountCents / 100).toLocaleString("en-IN")}`
            ) : (
              <span className="text-base text-slate-400 font-normal">No past records</span>
            )}
          </div>
          <span className="text-[11px] text-[#64748B] font-medium mt-1 block truncate">
            {lastIncrement
              ? new Date(lastIncrement.effectiveDate).toLocaleDateString("en-IN", {
                  month: "short",
                  year: "numeric",
                })
              : "Awaiting first review"}
          </span>
        </div>

        {/* Next Expected Increment */}
        <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/70">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Next Increment
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-[#2563EB] mt-1 tabular-nums">
            +₹ {incrementAmount.toLocaleString("en-IN")}
          </div>
          <span className="text-[11px] text-[#64748B] font-medium mt-1 block truncate">
            {formattedNextIncrement}
          </span>
        </div>
      </div>

      {/* Projection Chart & Headline */}
      <div className="bg-gradient-to-b from-blue-50/40 via-white to-white rounded-2xl border border-blue-100 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#0F172A]">
                {selectedPeriod}-Year Salary Projection
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-extrabold uppercase">
                Interactive
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Projected monthly salary reaching{" "}
              <strong className="text-[#2563EB]">
                ₹ {projectedEndSalary.toLocaleString("en-IN")} / mo
              </strong>{" "}
              in {new Date().getFullYear() + selectedPeriod}
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto shadow-2xs">
            Increment Policy:{" "}
            <span className="text-[#2563EB] font-bold">
              +₹{incrementAmount.toLocaleString("en-IN")} / {incrementFrequencyMonths === 12 ? "year" : `${incrementFrequencyMonths}mo`}
            </span>
          </div>
        </div>

        {/* Chart Component */}
        <SalaryProjectionChart data={activeProjectionData} />

        {/* Disclaimer */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-[#64748B]">
          <Info size={14} className="text-[#2563EB] shrink-0" />
          <span>
            {incrementPolicyNote || "Projection is based on the current increment policy and may change based on company reviews."}
          </span>
        </div>
      </div>

      {/* Increment History Timeline */}
      {incrementHistory && incrementHistory.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <History size={16} className="text-[#2563EB]" />
              <span>Increment History Log</span>
            </h3>
            <span className="text-xs text-[#64748B]">
              {incrementHistory.length} Recorded {incrementHistory.length === 1 ? "Appraisal" : "Appraisals"}
            </span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {incrementHistory.map((inc) => (
              <div
                key={inc.id}
                className="p-3.5 sm:px-4 bg-white hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 font-bold text-xs">
                    <TrendingUp size={14} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#0F172A]">{inc.reason}</div>
                    <div className="text-xs text-[#64748B] flex items-center gap-2">
                      <span>
                        Effective:{" "}
                        {new Date(inc.effectiveDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {inc.approvedBy && (
                        <>
                          <span>•</span>
                          <span>Approved by: {inc.approvedBy}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <div className="text-right text-xs">
                    <div className="text-[#64748B]">Previous: ₹{(inc.previousSalaryCents / 100).toLocaleString("en-IN")}</div>
                    <div className="font-bold text-[#0F172A]">New: ₹{(inc.newSalaryCents / 100).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg bg-emerald-100/70 text-emerald-800 border border-emerald-200 text-xs font-bold">
                    +₹{(inc.incrementAmountCents / 100).toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
