"use client";

import { useState, useEffect } from "react";
import {
    Sparkles, TrendingDown, AlertTriangle, CheckCircle2,
    DollarSign, ShieldAlert, Sliders, BarChart2, CheckSquare,
    ShoppingBag, ArrowRight, Building2, Bot, Zap
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    Legend, CartesianGrid
} from "recharts";
import { ExpenseRecord, PriceListItem, MonthlyExpenseRecord, ExpenseAuditSummary, auditExpenses } from "@/lib/ai/expense-agent";

interface ExpenseAIAgentProps {
    expenses: ExpenseRecord[];
    priceList: PriceListItem[];
    periodLabel: string;
    isAdmin: boolean;
    monthlyExpenses?: MonthlyExpenseRecord[];
}

export function ExpenseAIAgent({
    expenses,
    priceList,
    periodLabel,
    isAdmin,
    monthlyExpenses = [],
}: ExpenseAIAgentProps) {
    const [audit, setAudit] = useState<ExpenseAuditSummary>(() => auditExpenses(expenses, priceList, periodLabel, monthlyExpenses));

    // Interactive Simulator State
    const [targetCutPercent, setTargetCutPercent] = useState<number>(15);

    // Gamified Action Checklist State
    const [completedActionIds, setCompletedActionIds] = useState<Set<string>>(new Set());

    // Recompute statistical audit when expenses or period changes
    useEffect(() => {
        const newAudit = auditExpenses(expenses, priceList, periodLabel, monthlyExpenses);
        setAudit(newAudit);
    }, [expenses, priceList, periodLabel, monthlyExpenses]);

    function toggleAction(id: string) {
        setCompletedActionIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    // Dynamic gamified score calculation
    const completedCount = completedActionIds.size;
    const totalActions = audit.topCutOpportunities.length;
    const scoreBonus = totalActions > 0 ? Math.round((completedCount / totalActions) * (100 - audit.efficiencyScore)) : 0;
    const liveScore = Math.min(100, audit.efficiencyScore + scoreBonus);

    const efficiencyColor = liveScore >= 80 ? "text-emerald-600 bg-emerald-50 border-emerald-200"
        : liveScore >= 60 ? "text-amber-600 bg-amber-50 border-amber-200"
        : "text-rose-600 bg-rose-50 border-rose-200";

    // Chart Data: Current vs AI Optimized Spend for top items
    const comparisonChartData = audit.topCutOpportunities.slice(0, 6).map(item => {
        const currentRupees = item.totalSpendCents / 100;
        const savingsRupees = item.suggestedSavingsCents / 100;
        const optimizedRupees = Math.max(0, currentRupees - savingsRupees);
        return {
            name: item.itemName.length > 14 ? item.itemName.slice(0, 12) + "…" : item.itemName,
            "Current Spend (₹)": Math.round(currentRupees),
            "Optimized Spend (₹)": Math.round(optimizedRupees),
            "Savings (₹)": Math.round(savingsRupees),
        };
    });

    // Simulator calculations
    const currentTotalRupees = audit.totalSpendCents / 100;
    const simulatedMonthlySavingsRupees = Math.round(currentTotalRupees * (targetCutPercent / 100));
    const simulatedNewBudgetRupees = Math.max(0, currentTotalRupees - simulatedMonthlySavingsRupees);
    const simulatedAnnualSavingsRupees = simulatedMonthlySavingsRupees * 12;

    return (
        <div className="space-y-6">
            {/* Executive AI Scorecard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Spend Health Score */}
                <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Spend Health Score</span>
                        <Sparkles className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div className="my-2 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-zinc-900">{liveScore}</span>
                        <span className="text-xs text-zinc-400">/ 100</span>
                        {scoreBonus > 0 && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                +{scoreBonus} pts
                            </span>
                        )}
                    </div>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${efficiencyColor} w-fit`}>
                        {liveScore >= 80 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {liveScore >= 80 ? "Well Optimized" : liveScore >= 60 ? "Moderate Leaks" : "High Cost Leaks"}
                    </div>
                </div>

                {/* Total Analyzed Spend */}
                <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Analyzed Spend</span>
                        <DollarSign className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="my-2">
                        <span className="text-2xl font-bold text-zinc-900">₹{(audit.totalSpendCents / 100).toFixed(2)}</span>
                    </div>
                    <span className="text-xs text-zinc-500">
                        {audit.monthlyFixedSpendCents > 0
                            ? `Daily: ₹${(audit.dailySpendCents / 100).toFixed(0)} · Fixed: ₹${(audit.monthlyFixedSpendCents / 100).toFixed(0)}`
                            : `${audit.totalTransactions} transactions · ${audit.distinctItems} items`}
                    </span>
                </div>

                {/* Potential Monthly Savings */}
                <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-white rounded-2xl p-5 border border-emerald-200/70 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Identified Savings</span>
                        <TrendingDown className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="my-2">
                        <span className="text-2xl font-bold text-emerald-700">₹{(audit.potentialMonthlySavingsCents / 100).toFixed(2)}</span>
                    </div>
                    <span className="text-xs text-emerald-600 font-medium">₹{((audit.potentialMonthlySavingsCents * 12) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}/year potential ROI</span>
                </div>

                {/* Active Watchdog Alerts */}
                <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Watchdog Alerts</span>
                        <ShieldAlert className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="my-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-zinc-900">{audit.inflationAlerts.length + audit.frequentLeakItems.length}</span>
                        <span className="text-xs text-zinc-400">anomalies flagged</span>
                    </div>
                    <span className="text-xs text-zinc-500">{audit.inflationAlerts.length} price hikes · {audit.frequentLeakItems.length} micro-leaks</span>
                </div>
            </div>

            {/* Visual AI Comparison Graph & Budget Cut Simulator Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Before vs After AI Optimization Graph */}
                <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-cyan-600" />
                            <div>
                                <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Current vs. AI-Optimized Spend</h3>
                                <p className="text-xs text-zinc-400">Shows how much you save on top expense items</p>
                            </div>
                        </div>
                        <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                            -₹{(audit.potentialMonthlySavingsCents / 100).toFixed(0)} Cut
                        </span>
                    </div>

                    {comparisonChartData.length === 0 ? (
                        <div className="h-56 flex items-center justify-center text-zinc-400 text-xs">
                            No sufficient expense data to compare.
                        </div>
                    ) : (
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={comparisonChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value: any) => [`₹${Number(value).toLocaleString("en-IN")}`, ""]}
                                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                                    <Bar dataKey="Current Spend (₹)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Optimized Spend (₹)" fill="#0891b2" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* 2. Interactive Budget Optimizer Simulator */}
                <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                            <div className="flex items-center gap-2">
                                <Sliders className="w-5 h-5 text-indigo-600" />
                                <div>
                                    <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Interactive Budget Simulator</h3>
                                    <p className="text-xs text-zinc-400">Simulate target reduction and project annual ROI</p>
                                </div>
                            </div>
                            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full border border-indigo-200">
                                {targetCutPercent}% Target
                            </span>
                        </div>

                        {/* Preset Buttons */}
                        <div className="pt-3 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-zinc-500 font-medium">Quick Presets:</span>
                                {[5, 10, 15, 20].map(pct => (
                                    <button
                                        key={pct}
                                        onClick={() => setTargetCutPercent(pct)}
                                        className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                            targetCutPercent === pct
                                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                                : "bg-neutral-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                                        }`}
                                    >
                                        {pct}% Cut
                                    </button>
                                ))}
                            </div>

                            {/* Slider */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs text-zinc-500">
                                    <span>Conservative (5%)</span>
                                    <span className="font-bold text-indigo-600">{targetCutPercent}% Reduction</span>
                                    <span>Aggressive (30%)</span>
                                </div>
                                <input
                                    type="range"
                                    min="3"
                                    max="30"
                                    step="1"
                                    value={targetCutPercent}
                                    onChange={(e) => setTargetCutPercent(Number(e.target.value))}
                                    className="w-full accent-indigo-600 cursor-pointer h-2 bg-zinc-200 rounded-lg"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Simulation Output Cards */}
                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-zinc-100">
                        <div className="p-3 bg-neutral-50 rounded-xl text-center">
                            <span className="text-[11px] text-zinc-400 uppercase font-semibold">New Monthly Spend</span>
                            <p className="text-base font-bold text-zinc-900 mt-1">₹{simulatedNewBudgetRupees.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                            <span className="text-[11px] text-emerald-700 uppercase font-semibold">Monthly Saved</span>
                            <p className="text-base font-bold text-emerald-700 mt-1">₹{simulatedMonthlySavingsRupees.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
                            <span className="text-[11px] text-indigo-700 uppercase font-semibold">Annual Profit Boost</span>
                            <p className="text-base font-bold text-indigo-700 mt-1">₹{simulatedAnnualSavingsRupees.toLocaleString("en-IN")}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Monthly Fixed Expenses Breakdown (Rent, Salary, EB electricity, etc.) */}
            {audit.monthlyCostBreakdown && audit.monthlyCostBreakdown.length > 0 && (
                <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-violet-600" />
                            <div>
                                <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Monthly Fixed Overheads & Utilities</h3>
                                <p className="text-xs text-zinc-400">Recurring fixed expenses: Rent, Staff Salary, EB electricity, Internet, etc.</p>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1 rounded-full">
                            Total: ₹{(audit.monthlyFixedSpendCents / 100).toFixed(2)}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {audit.monthlyCostBreakdown.map((item, idx) => {
                            const pct = audit.monthlyFixedSpendCents > 0
                                ? Math.round((item.amountCents / audit.monthlyFixedSpendCents) * 100)
                                : 0;
                            return (
                                <div key={idx} className="p-3.5 rounded-xl bg-violet-50/40 border border-violet-100/80 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-zinc-900 truncate">{item.category}</span>
                                        <span className="text-[10px] font-bold text-violet-600 bg-white px-1.5 py-0.5 rounded shadow-2xs border border-violet-100">
                                            {pct}%
                                        </span>
                                    </div>
                                    <p className="text-base font-bold text-violet-950">₹{(item.amountCents / 100).toFixed(0)}</p>
                                    <p className="text-[10px] text-zinc-400">{item.count} {item.count === 1 ? "entry" : "entries"}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* AI-Calculated Recurring Daily Demand (e.g. daily 10 water cans -> projected monthly) */}
            {audit.dailyRecurringProjections && audit.dailyRecurringProjections.items.length > 0 && (
                <div className="bg-white rounded-2xl border border-cyan-100 p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                        <div className="flex items-center gap-2">
                            <Bot className="w-5 h-5 text-cyan-600" />
                            <div>
                                <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                                    AI Daily Consumption Velocity &amp; Monthly Projections
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-700 border border-cyan-200">
                                        30-Day Run Rate
                                    </span>
                                </h3>
                                <p className="text-xs text-zinc-400">
                                    Calculates daily consumption rate (e.g. 10 water cans/day) and projects recurring monthly spend with wholesale savings opportunities.
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 px-3 py-1 rounded-full shrink-0 w-fit">
                            Total Projected: ₹{(audit.dailyRecurringProjections.totalProjectedMonthlyCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })} / mo
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {audit.dailyRecurringProjections.items.map((item, idx) => (
                            <div key={idx} className="p-4 rounded-xl bg-cyan-50/30 border border-cyan-100 space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                                                item.recurrenceLevel === "daily" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                                            }`}>
                                                {item.recurrenceLevel === "daily" ? "Daily Need" : "Frequent"}
                                            </span>
                                            <span className="text-[10px] text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200">
                                                {item.categorySuggestion}
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-sm text-zinc-900 mt-1 truncate">{item.itemName}</h4>
                                        <p className="text-[11px] text-zinc-500">
                                            Velocity: <strong className="text-zinc-800">{item.avgDailyQuantity.toFixed(1)} units/day</strong> @ ₹{(item.avgUnitCostCents / 100).toFixed(2)}
                                        </p>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <p className="text-base font-black text-zinc-900">
                                            ₹{(item.projectedMonthlySpendCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                            <span className="text-xs font-normal text-zinc-400">/mo</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Strategic Action Hub & Price Watchdog Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 3. Interactive "Take Action" Checklist with Gamified Score */}
                <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckSquare className="w-5 h-5 text-cyan-600" />
                            <div>
                                <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Store Cost-Reduction Action Plan</h3>
                                <p className="text-xs text-zinc-400">Complete items to boost your store efficiency score</p>
                            </div>
                        </div>
                        <span className="text-xs text-zinc-500 font-medium">
                            {completedCount} of {totalActions} done
                        </span>
                    </div>

                    {audit.topCutOpportunities.length === 0 ? (
                        <div className="py-6 text-center text-zinc-500 text-xs">
                            All items are well within their approved rates and budget.
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                            {audit.topCutOpportunities.map((item, idx) => {
                                const isDone = completedActionIds.has(item.itemName);
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => toggleAction(item.itemName)}
                                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                                            isDone
                                                ? "bg-emerald-50/50 border-emerald-200 text-zinc-500 line-through opacity-80"
                                                : "bg-neutral-50/60 hover:bg-neutral-50 border-zinc-100 text-zinc-800"
                                        }`}
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            {isDone ? (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-md border-2 border-zinc-300 hover:border-cyan-600" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`font-semibold text-xs sm:text-sm ${isDone ? "text-zinc-500" : "text-zinc-900"}`}>
                                                    {item.itemName}
                                                </span>
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md shrink-0 ${
                                                    item.recommendationType === "negotiate" ? "bg-amber-100 text-amber-800"
                                                    : item.recommendationType === "bulk_order" ? "bg-blue-100 text-blue-800"
                                                    : item.recommendationType === "fixed_price_lock" ? "bg-rose-100 text-rose-800"
                                                    : "bg-emerald-100 text-emerald-800"
                                                }`}>
                                                    {item.recommendationType.replace("_", " ")}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                                                {item.actionableAdvice}
                                            </p>
                                            <div className="mt-2 flex items-center justify-between text-xs">
                                                <span className="text-zinc-400">Total Spend: ₹{(item.totalSpendCents / 100).toFixed(0)}</span>
                                                <span className="font-bold text-emerald-600">Save ~₹{(item.suggestedSavingsCents / 100).toFixed(0)}/mo</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 4. Price Inflation & Purchasing Watchdog */}
                <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-amber-500" />
                            <div>
                                <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Price Inflation & Anomaly Watchdog</h3>
                                <p className="text-xs text-zinc-400">Identifies unit price hikes and fragmented micro-leaks</p>
                            </div>
                        </div>
                        <span className="text-xs bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200">
                            {audit.inflationAlerts.length + audit.frequentLeakItems.length} Flagged
                        </span>
                    </div>

                    {audit.inflationAlerts.length === 0 && audit.frequentLeakItems.length === 0 ? (
                        <div className="py-12 text-center text-zinc-400 text-xs">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                            No price spikes or irregular buying patterns observed.
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                            {audit.inflationAlerts.map((alert, i) => (
                                <div key={i} className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/70 text-xs space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-amber-950 text-sm">{alert.itemName}</span>
                                        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                                            +{alert.priceInflationPercent}% Hike
                                        </span>
                                    </div>
                                    <p className="text-amber-900/90 leading-relaxed">
                                        Unit price shifted from <strong>₹{(alert.firstUnitCostCents / 100).toFixed(2)}</strong> to <strong>₹{(alert.currentUnitCostCents / 100).toFixed(2)}</strong>.
                                    </p>
                                    <p className="text-[11px] text-amber-700/80 italic">
                                        Action: Negotiate with supplier to rollback price or explore alternative local vendors.
                                    </p>
                                </div>
                            ))}

                            {audit.frequentLeakItems.map((item, i) => (
                                <div key={`leak-${i}`} className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/70 text-xs space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-blue-950 text-sm">{item.itemName}</span>
                                        <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                                            Micro-Orders ({item.purchaseCount}x)
                                        </span>
                                    </div>
                                    <p className="text-blue-900/90 leading-relaxed">
                                        Purchased {item.purchaseCount} separate times in small quantities. Switch to weekly wholesale orders to save <strong>~₹{(item.suggestedSavingsCents / 100).toFixed(0)}/mo</strong>.
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
