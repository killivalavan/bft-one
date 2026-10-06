"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { Check, Clock, X, Coffee, Plus, Minus } from "lucide-react";

export interface AttendanceState {
    status: 'present' | 'leave' | 'half_day' | 'off' | 'unmarked';
    lateMinutes: number;
    extraHours: number;
}

export interface SalaryAdjustmentItem {
    id: string;
    userId: string;
    date: string;
    amountCents: number;
    reason: string;
    kind: 'deduction' | 'addition';
}

interface UserAttendanceCardProps {
    user: { id: string; email: string };
    current: AttendanceState;
    adjustments?: SalaryAdjustmentItem[];
    onChange: (id: string, state: AttendanceState) => Promise<void>;
    onAddAllowance?: (userId: string, reason: string, amount: number) => Promise<void>;
    onAddAdjustment?: (userId: string, reason: string, amount: number, kind: 'deduction' | 'addition') => Promise<void>;
    onDeleteAdjustment?: (entryId: string, userId: string) => Promise<void>;
}

export function UserAttendanceCard({
    user,
    current,
    adjustments = [],
    onChange,
    onAddAllowance,
    onAddAdjustment,
    onDeleteAdjustment,
}: UserAttendanceCardProps) {
    const [status, setStatus] = useState<'present' | 'leave' | 'half_day' | 'off' | 'unmarked'>(current.status);
    const [extraHours, setExtraHours] = useState<number>(current.extraHours || 0);
    const [loading, setLoading] = useState(false);

    // Adjustment state
    const [adjustmentKind, setAdjustmentKind] = useState<'deduction' | 'addition'>('deduction');
    const [adjReason, setAdjReason] = useState("");
    const [adjAmount, setAdjAmount] = useState("");
    const [addingAdj, setAddingAdj] = useState(false);

    // Sync if parent updates (e.g. date change)
    useEffect(() => {
        setStatus(current.status);
        setExtraHours(current.extraHours || 0);
    }, [current.status, current.extraHours]);

    async function handleStatusChange(s: 'present' | 'leave' | 'half_day' | 'off' | 'unmarked') {
        setStatus(s);
        const newExtra = s === 'present' ? extraHours : 0;
        setLoading(true);
        // lateMinutes is always 0: no automatic late calculation!
        await onChange(user.id, { status: s, lateMinutes: 0, extraHours: newExtra });
        setLoading(false);
    }

    async function handleExtraHoursChange(h: number) {
        setExtraHours(h);
        if (status === 'present') {
            setLoading(true);
            await onChange(user.id, { status, lateMinutes: 0, extraHours: h });
            setLoading(false);
        }
    }

    async function handleAddAdjustmentSubmit() {
        if (!adjReason.trim() || !adjAmount || Number(adjAmount) <= 0) return;
        setAddingAdj(true);
        try {
            const amountNum = Number(adjAmount);
            if (onAddAdjustment) {
                await onAddAdjustment(user.id, adjReason.trim(), amountNum, adjustmentKind);
            } else if (onAddAllowance && adjustmentKind === 'addition') {
                await onAddAllowance(user.id, adjReason.trim(), amountNum);
            }
            setAdjReason("");
            setAdjAmount("");
        } catch (err) {
            console.error("Failed to add adjustment:", err);
        } finally {
            setAddingAdj(false);
        }
    }

    const initials = user.email.slice(0, 2).toUpperCase();

    return (
        <div className="flex-shrink-0 w-[285px] min-h-[460px] h-auto bg-white rounded-3xl border border-zinc-200 shadow-sm p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold mb-2 border-2 border-indigo-100">
                    {initials}
                </div>
                <h3 className="text-base font-semibold text-zinc-900 truncate w-full text-center">{user.email.split('@')[0]}</h3>
                <p className="text-[10px] text-zinc-400">{user.email}</p>
            </div>

            <div className="space-y-3 mt-3">
                {/* Status Selection */}
                <div className="grid grid-cols-4 gap-1.5">
                    <button
                        onClick={() => handleStatusChange('present')}
                        className={cn(
                            "flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all cursor-pointer",
                            status === 'present'
                                ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-1 ring-emerald-300 font-bold"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                        title="Mark Present"
                    >
                        <Check size={16} className="mb-0.5" />
                        <span className="text-[9px] font-bold uppercase">Present</span>
                    </button>
                    <button
                        onClick={() => handleStatusChange('half_day')}
                        className={cn(
                            "flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all cursor-pointer",
                            status === 'half_day'
                                ? "bg-amber-50 border-amber-300 text-amber-700 ring-1 ring-amber-300 font-bold"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                        title="Mark Half Day"
                    >
                        <Clock size={16} className="mb-0.5" />
                        <span className="text-[9px] font-bold uppercase">Half</span>
                    </button>
                    <button
                        onClick={() => handleStatusChange('leave')}
                        className={cn(
                            "flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all cursor-pointer",
                            status === 'leave'
                                ? "bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-300 font-bold"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                        title="Mark Leave"
                    >
                        <X size={16} className="mb-0.5" />
                        <span className="text-[9px] font-bold uppercase">Leave</span>
                    </button>
                    <button
                        onClick={() => handleStatusChange('off')}
                        className={cn(
                            "flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all cursor-pointer",
                            status === 'off'
                                ? "bg-zinc-100 border-zinc-300 text-zinc-700 ring-1 ring-zinc-300 font-bold"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                        title="Mark Weekly Off"
                    >
                        <Coffee size={16} className="mb-0.5" />
                        <span className="text-[9px] font-bold uppercase">Off</span>
                    </button>
                </div>

                {/* Overtime (Extra Hours) - only when Present */}
                <div className={cn("transition-all duration-300 overflow-hidden", status === 'present' ? "max-h-20 opacity-100" : "max-h-0 opacity-0")}>
                    <p className="text-[9px] font-semibold text-zinc-400 uppercase mb-1">Overtime (Extra Hours)</p>
                    <div className="flex gap-1.5">
                        {[0, 1, 2, 3, 4, 5].map(h => (
                            <button
                                key={h}
                                onClick={() => handleExtraHoursChange(h)}
                                className={cn(
                                    "flex-1 h-7 rounded-md text-xs font-bold border transition-colors cursor-pointer",
                                    extraHours === h
                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                        : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                                )}
                            >
                                {h === 0 ? '-' : h}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Manual Salary Adjustments (Deductions & Additions) */}
                <div className="pt-2 border-t border-zinc-100 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-semibold text-zinc-400 uppercase">Manual Adjustments</p>

                        {/* Kind Toggle */}
                        <div className="flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 text-[10px] font-bold">
                            <button
                                type="button"
                                onClick={() => setAdjustmentKind('deduction')}
                                className={cn(
                                    "px-2 py-0.5 rounded-md transition-all flex items-center gap-0.5 cursor-pointer",
                                    adjustmentKind === 'deduction'
                                        ? "bg-rose-600 text-white shadow-2xs"
                                        : "text-zinc-600 hover:text-zinc-900"
                                )}
                            >
                                <Minus size={10} /> Deduct
                            </button>
                            <button
                                type="button"
                                onClick={() => setAdjustmentKind('addition')}
                                className={cn(
                                    "px-2 py-0.5 rounded-md transition-all flex items-center gap-0.5 cursor-pointer",
                                    adjustmentKind === 'addition'
                                        ? "bg-emerald-600 text-white shadow-2xs"
                                        : "text-zinc-600 hover:text-zinc-900"
                                )}
                            >
                                <Plus size={10} /> Add
                            </button>
                        </div>
                    </div>

                    {/* Quick Preset Pills */}
                    <div className="flex flex-wrap gap-1">
                        {adjustmentKind === 'deduction' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => { setAdjReason("Late arrival"); setAdjAmount("50"); }}
                                    className="px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-semibold transition-colors cursor-pointer"
                                >
                                    Late ₹50
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAdjReason("Late arrival"); setAdjAmount("100"); }}
                                    className="px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-semibold transition-colors cursor-pointer"
                                >
                                    Late ₹100
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAdjReason("Advance"); setAdjAmount("500"); }}
                                    className="px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-semibold transition-colors cursor-pointer"
                                >
                                    Advance
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => { setAdjReason("Special allowance"); setAdjAmount("200"); }}
                                    className="px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[9px] font-semibold transition-colors cursor-pointer"
                                >
                                    Allowance ₹200
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAdjReason("Bonus"); setAdjAmount("500"); }}
                                    className="px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[9px] font-semibold transition-colors cursor-pointer"
                                >
                                    Bonus ₹500
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAdjReason("Tip / Incentive"); setAdjAmount("100"); }}
                                    className="px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[9px] font-semibold transition-colors cursor-pointer"
                                >
                                    Tip ₹100
                                </button>
                            </>
                        )}
                    </div>

                    {/* Inputs Form */}
                    <div className="space-y-1.5">
                        <input
                            type="text"
                            placeholder={adjustmentKind === 'deduction' ? "Reason (e.g. Late arrival)" : "Reason (e.g. Shift bonus)"}
                            value={adjReason}
                            onChange={(e) => setAdjReason(e.target.value)}
                            className="w-full h-8 px-2.5 rounded-lg border border-zinc-200 bg-zinc-50/50 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-zinc-800 placeholder:text-zinc-400"
                        />
                        <div className="flex gap-1.5">
                            <div className="relative flex-1">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-medium">₹</span>
                                <input
                                    type="number"
                                    placeholder="Amount"
                                    value={adjAmount}
                                    onChange={(e) => setAdjAmount(e.target.value)}
                                    className="w-full h-8 pl-6 pr-2 rounded-lg border border-zinc-200 bg-zinc-50/50 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-zinc-800 placeholder:text-zinc-400"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAddAdjustmentSubmit}
                                disabled={addingAdj || !adjReason.trim() || !adjAmount || Number(adjAmount) <= 0}
                                className={cn(
                                    "h-8 px-3 text-white text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center justify-center min-w-[65px] cursor-pointer disabled:bg-zinc-200 disabled:text-zinc-400",
                                    adjustmentKind === 'deduction'
                                        ? "bg-rose-600 hover:bg-rose-700"
                                        : "bg-emerald-600 hover:bg-emerald-700"
                                )}
                            >
                                {addingAdj ? "..." : adjustmentKind === 'deduction' ? "- Deduct" : "+ Add"}
                            </button>
                        </div>
                    </div>

                    {/* Existing adjustments list for this day */}
                    {adjustments && adjustments.length > 0 && (
                        <div className="pt-1.5 space-y-1">
                            <p className="text-[9px] font-semibold text-zinc-400 uppercase">Today&apos;s Adjustments:</p>
                            <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-0.5">
                                {adjustments.map((item) => (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-medium border",
                                            item.kind === 'deduction'
                                                ? "bg-rose-50 border-rose-200 text-rose-800"
                                                : "bg-emerald-50 border-emerald-200 text-emerald-800"
                                        )}
                                    >
                                        <div className="flex items-center gap-1 truncate mr-1">
                                            <span className="font-bold">
                                                {item.kind === 'deduction' ? '-' : '+'}₹{(item.amountCents / 100).toFixed(0)}
                                            </span>
                                            <span className="truncate opacity-90">{item.reason}</span>
                                        </div>
                                        {onDeleteAdjustment && (
                                            <button
                                                type="button"
                                                onClick={() => onDeleteAdjustment(item.id, user.id)}
                                                className="text-zinc-400 hover:text-zinc-700 p-0.5 shrink-0 transition-colors cursor-pointer"
                                                title="Delete this adjustment"
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Save Indicator */}
            <div className="flex items-center justify-center h-3 mt-1">
                {loading && <span className="text-[9px] text-zinc-400 animate-pulse">Saving...</span>}
            </div>
        </div>
    );
}
