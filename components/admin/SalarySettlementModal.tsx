"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  AlertCircle,
  ArrowRight,
  CreditCard,
  X,
  Loader2,
  Calendar,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Banknote,
  PlusCircle,
  MinusCircle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface SalarySettlementModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  employeeName?: string;
  monthDate: Date;
  monthLabel: string;
  defaultNetRupees: number;
  baseSalaryRupees: number;
  additionsRupees: number;
  deductionsRupees: number;
  currentSettlement?: {
    isSettled: boolean;
    settledAmountRupees?: number;
    carryForwardRupees?: number;
    paymentMode?: string;
    notes?: string;
  } | null;
  onConfirmSettlement: (data: {
    settledAmountRupees: number;
    carryForwardToNextMonth: boolean;
    carryForwardAmountRupees: number;
    carryForwardType: "addition" | "deduction" | "none";
    paymentMode: string;
    notes: string;
  }) => Promise<void>;
  onUnsettle?: () => Promise<void>;
}

export function SalarySettlementModal({
  open,
  onClose,
  userId,
  employeeName,
  monthDate,
  monthLabel,
  defaultNetRupees,
  baseSalaryRupees,
  additionsRupees,
  deductionsRupees,
  currentSettlement,
  onConfirmSettlement,
  onUnsettle,
}: SalarySettlementModalProps) {
  const [settledAmount, setSettledAmount] = useState<string>("");
  const [carryForwardToNextMonth, setCarryForwardToNextMonth] = useState(true);
  const [paymentMode, setPaymentMode] = useState("UPI / GPay / PhonePe");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnsettling, setIsUnsettling] = useState(false);

  // Compute Next Month details (e.g. 1st of next month)
  const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  const nextMonthLabel = nextMonthDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const nextMonth1stStr = `1st ${nextMonthLabel}`;

  // Initialize or reset when modal opens or defaultNetRupees changes
  useEffect(() => {
    if (open) {
      if (currentSettlement?.isSettled && currentSettlement.settledAmountRupees != null) {
        setSettledAmount(currentSettlement.settledAmountRupees.toString());
        setPaymentMode(currentSettlement.paymentMode || "UPI / GPay / PhonePe");
        setNotes(currentSettlement.notes || "");
      } else {
        const defaultVal = Math.max(0, defaultNetRupees);
        setSettledAmount(defaultVal.toFixed(0));
        setPaymentMode("UPI / GPay / PhonePe");
        setNotes("");
      }
      setCarryForwardToNextMonth(true);
    }
  }, [open, defaultNetRupees, currentSettlement]);

  if (!open) return null;

  const parsedPaid = parseFloat(settledAmount) || 0;
  // diff = Net Pay - Paid Amount
  // If diff > 0: Paid LESS (unpaid remaining balance to add next month)
  // If diff < 0: Paid MORE (excess advance paid to deduct next month)
  const diff = Math.round((defaultNetRupees - parsedPaid) * 100) / 100;
  const isExact = Math.abs(diff) < 1;
  const isUnderpaid = diff > 0;
  const isOverpaid = diff < 0;

  const carryForwardAmount = Math.abs(diff);
  const carryForwardType: "addition" | "deduction" | "none" = isExact
    ? "none"
    : isUnderpaid
    ? "addition"
    : "deduction";

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await onConfirmSettlement({
        settledAmountRupees: parsedPaid,
        carryForwardToNextMonth: !isExact && carryForwardToNextMonth,
        carryForwardAmountRupees: carryForwardAmount,
        carryForwardType,
        paymentMode,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      console.error("Error confirming settlement:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevert() {
    if (!onUnsettle) return;
    setIsUnsettling(true);
    try {
      await onUnsettle();
      onClose();
    } catch (err) {
      console.error("Error reverting settlement:", err);
    } finally {
      setIsUnsettling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="p-3.5 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Banknote size={17} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Salary Settlement — {monthLabel}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                Staff: <span className="font-semibold text-white capitalize">{employeeName || "Employee"}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-3.5 sm:space-y-4">

          {/* 1. Net Pay Calculation Summary Banner */}
          <div className="bg-slate-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200/80 space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider">
              <span>Calculated Net Pay</span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[10px] sm:text-xs font-bold">
                Official Payslip
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] whitespace-nowrap">
                ₹ {defaultNetRupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 font-medium">
                Base: ₹{baseSalaryRupees.toLocaleString("en-IN")} • Extra: +₹{additionsRupees.toLocaleString("en-IN")} • Deduct: -₹{deductionsRupees.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* 2. Actual Amount Paid Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CreditCard size={14} className="text-[#2563EB] shrink-0" />
                <span>Actual Amount Settled / Paid (₹)</span>
              </label>
              <button
                type="button"
                onClick={() => setSettledAmount(defaultNetRupees.toFixed(0))}
                className="text-[11px] font-semibold text-[#2563EB] hover:text-blue-800 cursor-pointer"
              >
                Reset to Net Pay
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">
                ₹
              </span>
              <Input
                type="number"
                step="any"
                placeholder="Enter paid amount"
                value={settledAmount}
                onChange={(e) => setSettledAmount(e.target.value)}
                className="pl-8 text-base sm:text-lg font-bold text-slate-900 h-10 sm:h-11 bg-white border-slate-300 focus:border-blue-600 focus:ring-blue-500/20"
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Default is net salary. You can edit this if a different or partial amount was paid.
            </p>
          </div>

          {/* 3. Real-Time Carry-Forward Status Card */}
          {isUnderpaid && (
            <div className="bg-amber-50/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-amber-200/90 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <PlusCircle size={15} className="text-amber-600 shrink-0" />
                  <span>Remaining: ₹{carryForwardAmount.toLocaleString("en-IN")} unpaid</span>
                </div>
                <span className="text-[10px] font-extrabold uppercase bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full shrink-0">
                  Partial Paid
                </span>
              </div>

              <p className="text-xs text-amber-800 leading-snug">
                Employee is paid ₹{parsedPaid.toLocaleString("en-IN")} instead of ₹{defaultNetRupees.toLocaleString("en-IN")}.
              </p>

              <label className="flex items-start gap-2 pt-0.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={carryForwardToNextMonth}
                  onChange={(e) => setCarryForwardToNextMonth(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <span className="text-xs font-semibold text-amber-950 leading-snug">
                  Automatically add remaining ₹{carryForwardAmount.toLocaleString("en-IN")} to 1st {nextMonthLabel} salary
                  <span className="block text-[11px] font-normal text-amber-700 mt-0.5">
                    Will create a salary addition record on {nextMonth1stStr} so they receive it in the next payout.
                  </span>
                </span>
              </label>
            </div>
          )}

          {isOverpaid && (
            <div className="bg-purple-50/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-purple-200/90 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                  <MinusCircle size={15} className="text-purple-600 shrink-0" />
                  <span>Excess Paid: +₹{carryForwardAmount.toLocaleString("en-IN")} advance</span>
                </div>
                <span className="text-[10px] font-extrabold uppercase bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full shrink-0">
                  Advance Extra
                </span>
              </div>

              <p className="text-xs text-purple-800 leading-snug">
                Employee is paid ₹{parsedPaid.toLocaleString("en-IN")} (extra ₹{carryForwardAmount.toLocaleString("en-IN")} above net pay).
              </p>

              <label className="flex items-start gap-2 pt-0.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={carryForwardToNextMonth}
                  onChange={(e) => setCarryForwardToNextMonth(e.target.checked)}
                  className="mt-0.5 rounded border-purple-400 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <span className="text-xs font-semibold text-purple-950 leading-snug">
                  Automatically deduct excess ₹{carryForwardAmount.toLocaleString("en-IN")} from 1st {nextMonthLabel} salary
                  <span className="block text-[11px] font-normal text-purple-700 mt-0.5">
                    Will create an advance deduction record on {nextMonth1stStr} so the extra amount is adjusted.
                  </span>
                </span>
              </label>
            </div>
          )}

          {isExact && (
            <div className="bg-emerald-50/80 rounded-xl sm:rounded-2xl p-3 border border-emerald-200 flex items-center gap-2.5 text-xs font-semibold text-emerald-900">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <span>
                Exact Net Pay Settled. No pending balance or advance to carry forward.
              </span>
            </div>
          )}

          {/* 4. Payment Mode & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-0.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full h-9.5 sm:h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</option>
                <option value="Bank Transfer (NEFT/IMPS)">Bank Transfer (NEFT/IMPS)</option>
                <option value="Cash">Cash Handover</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Notes / Reference (Optional)</label>
              <Input
                type="text"
                placeholder="e.g. Paid via GPay Ref #1234"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9.5 sm:h-10 text-xs sm:text-sm bg-white border-slate-200"
              />
            </div>
          </div>

        </div>

        {/* Modal Footer - Fully Responsive for Small Views */}
        <div className="p-3 sm:p-4 bg-slate-50/90 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {currentSettlement?.isSettled && onUnsettle ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting || isUnsettling}
              onClick={handleRevert}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 font-semibold text-xs h-9.5 sm:h-10 gap-1.5 shrink-0 justify-center"
            >
              {isUnsettling ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              <span>Unsettle / Revert</span>
            </Button>
          ) : (
            <div className="text-[11px] text-slate-400 hidden sm:block">
              Updates salary records & employee portal instantly.
            </div>
          )}

          {/* Action Buttons: Cancel and Confirm - Unwrapped on mobile */}
          <div className="flex items-center gap-2 justify-end w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting || isUnsettling}
              onClick={onClose}
              className="text-xs h-9.5 sm:h-10 px-3 sm:px-4 shrink-0"
            >
              Cancel
            </Button>

            <Button
              type="button"
              disabled={isSubmitting || isUnsettling || parsedPaid < 0}
              onClick={handleConfirm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm h-9.5 sm:h-10 px-3.5 sm:px-5 gap-1.5 sm:gap-2 shadow-xs whitespace-nowrap flex-1 sm:flex-none justify-center shrink-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin shrink-0" />
                  <span>Settling...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={15} className="shrink-0" />
                  <span className="hidden sm:inline">Confirm & Mark as Settled</span>
                  <span className="sm:hidden">Confirm & Settle</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
