"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { Button } from "@/components/ui/Button";
import { Loader2, Download, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
// jsPDF and autoTable lazy-loaded in exportPdf

import { format, startOfMonth, endOfMonth, addMonths, isSameMonth, isSameYear, addYears, getYear } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface SalesData {
    id: string;
    sale_date: string;
    total_cash_cents: number | null;
    drawer_cash_cents?: number | null;
    daily_expense_cents?: number | null;
    upi_amount_cents: number | null;
    cash_submitter: { full_name?: string; email?: string } | null;
    upi_submitter: { full_name?: string; email?: string } | null;
}

interface SalesManagerProps {
    businessId?: string | null;
    refreshKey?: number;
}

export function SalesManager({ businessId, refreshKey }: SalesManagerProps = {}) {
    const { business } = useTenant();
    const [view, setView] = useState<"daily" | "monthly" | "yearly">("daily");
    const [allSales, setAllSales] = useState<SalesData[]>([]);
    const [loading, setLoading] = useState(true);

    // Daily View State (Month Selector)
    const [currentDate, setCurrentDate] = useState(new Date());

    // Monthly View State (Year Selector)
    const [currentYear, setCurrentYear] = useState(new Date());

    const effectiveBizId = businessId || (business?.id && business.id !== "default" ? business.id : null);

    useEffect(() => {
        loadData();
    }, [business?.id, effectiveBizId, refreshKey]);

    async function loadData() {
        setLoading(true);
        let query = supabaseClient
            .from("daily_sales")
            .select(`
                *,
                cash_submitter:cash_submitted_by(full_name, email),
                upi_submitter:upi_submitted_by(full_name, email)
            `);

        if (effectiveBizId) {
            query = query.eq("business_id", effectiveBizId);
        }

        const { data, error } = await query.order("sale_date", { ascending: false });

        if (error) {
            console.warn("Failed to load sales with submitter join, trying fallback:", error.message);
            let fbQuery = supabaseClient.from("daily_sales").select("*");
            if (effectiveBizId) {
                fbQuery = fbQuery.eq("business_id", effectiveBizId);
            }
            const { data: fbData, error: fbError } = await fbQuery.order("sale_date", { ascending: false });
            if (fbError) {
                console.error("Failed to load sales fallback:", fbError);
                setAllSales([]);
            } else {
                setAllSales((fbData as any) || []);
            }
        } else {
            setAllSales(data as any || []);
        }
        setLoading(false);
    }

    function formatName(obj: any) {
        if (!obj) return "-";
        if (obj.full_name) return obj.full_name;
        if (obj.email) return obj.email.split('@')[0];
        return "Unknown";
    }

    function renderTrendBadge(growth: number) {
        if (growth === 0) {
            return <span className="text-slate-400 text-xs">-</span>;
        }

        const isPositive = growth > 0;
        return (
            <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center font-bold ${isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {isPositive ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                {Math.abs(growth).toFixed(0)}%
            </span>
        );
    }

    // --- Data Preparation ---

    // 1. Filtered Raw Data
    const dailySales = allSales.filter(s => isSameMonth(new Date(s.sale_date), currentDate));
    const yearlyRawSales = allSales.filter(s => isSameYear(new Date(s.sale_date), currentYear));
    const allHistorySales = allSales;

    // 2. Aggregations

    // Monthly View Aggregation (Jan, Feb, ... for currentYear)
    const monthlyAggregated = Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(currentYear.getFullYear(), i, 1);
        const monthSales = yearlyRawSales.filter(s => new Date(s.sale_date).getMonth() === i);

        const cash = monthSales.reduce((sum, s) => sum + (s.total_cash_cents || 0), 0);
        const upi = monthSales.reduce((sum, s) => sum + (s.upi_amount_cents || 0), 0);

        return {
            id: i,
            monthName: format(monthDate, "MMMM"),
            shortName: format(monthDate, "MMM"),
            fullDate: monthDate,
            total_cash_cents: cash,
            upi_amount_cents: upi,
            total_cents: cash + upi,
            hasData: monthSales.length > 0
        };
    });

    // Yearly View Aggregation (2025, 2026, ...)
    const yearsInData = Array.from(new Set(allSales.map(s => getYear(new Date(s.sale_date))))).sort((a, b) => a - b);
    if (yearsInData.length === 0) yearsInData.push(new Date().getFullYear());

    const yearlyAggregated = yearsInData.map(year => {
        const yearSales = allSales.filter(s => getYear(new Date(s.sale_date)) === year);
        const cash = yearSales.reduce((sum, s) => sum + (s.total_cash_cents || 0), 0);
        const upi = yearSales.reduce((sum, s) => sum + (s.upi_amount_cents || 0), 0);
        return {
            year: year,
            total_cash_cents: cash,
            upi_amount_cents: upi,
            total_cents: cash + upi
        };
    });

    // 3. Stats Calculation (Dynamic based on View)
    let activeStatsSource: SalesData[] = [];
    if (view === 'daily') activeStatsSource = dailySales;
    else if (view === 'monthly') activeStatsSource = yearlyRawSales;
    else activeStatsSource = allSales;

    const totalCash = activeStatsSource.reduce((sum, s) => sum + (s.total_cash_cents || 0), 0);
    const totalUpi = activeStatsSource.reduce((sum, s) => sum + (s.upi_amount_cents || 0), 0);
    const grandTotal = totalCash + totalUpi;

    // 4. Chart Data
    let chartData: any[] = [];
    if (view === 'daily') {
        chartData = [...dailySales]
            .sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime())
            .map(s => ({
                name: format(new Date(s.sale_date), "d MMM"),
                Cash: (s.total_cash_cents || 0) / 100,
                UPI: (s.upi_amount_cents || 0) / 100,
            }));
    } else if (view === 'monthly') {
        chartData = monthlyAggregated.map(m => ({
            name: m.shortName,
            Cash: m.total_cash_cents / 100,
            UPI: m.upi_amount_cents / 100,
        }));
    } else {
        // Yearly
        chartData = yearlyAggregated.map(y => ({
            name: y.year.toString(),
            Cash: y.total_cash_cents / 100,
            UPI: y.upi_amount_cents / 100,
        }));
    }

    // --- Navigation Handlers ---
    function prevPeriod() {
        if (view === 'daily') setCurrentDate(d => addMonths(d, -1));
        else if (view === 'monthly') setCurrentYear(d => addYears(d, -1));
    }

    function nextPeriod() {
        if (view === 'daily') setCurrentDate(d => addMonths(d, 1));
        else if (view === 'monthly') setCurrentYear(d => addYears(d, 1));
    }

    // --- Export ---
    async function exportPdf() {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
        const doc = new jsPDF();
        let titleTime = "";
        if (view === 'daily') titleTime = format(currentDate, 'MMMM yyyy');
        else if (view === 'monthly') titleTime = format(currentYear, 'yyyy');
        else titleTime = "All Time";

        doc.setFontSize(18);
        doc.text(`Sales Report - ${titleTime} (${view.charAt(0).toUpperCase() + view.slice(1)})`, 14, 20);

        doc.setFontSize(11);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
        doc.text(`Total Revenue: Rs. ${(grandTotal / 100).toFixed(2)}`, 14, 36);

        let body: any[] = [];
        let head: any[] = [];

        if (view === 'daily') {
            head = [["Date", "Drawer Cash (Rs)", "Expenses (Rs)", "Gross Cash (Rs)", "UPI (Rs)", "Total (Rs)", "Change"]];
            const sortedDaily = [...dailySales].sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime());
            body = sortedDaily.map((s, index) => {
                const grossCash = (s.total_cash_cents || 0) / 100;
                const exp = (s.daily_expense_cents || 0) / 100;
                const drawer = s.drawer_cash_cents !== null && s.drawer_cash_cents !== undefined
                    ? s.drawer_cash_cents / 100
                    : Math.max(0, grossCash - exp);
                const u = (s.upi_amount_cents || 0) / 100;
                const total = grossCash + u;
                const prevDayTotal = index > 0 ? ((sortedDaily[index - 1].total_cash_cents || 0) + (sortedDaily[index - 1].upi_amount_cents || 0)) / 100 : 0;
                const growth = prevDayTotal > 0 ? ((total - prevDayTotal) / prevDayTotal) * 100 : 0;
                return [
                    s.sale_date,
                    drawer.toFixed(2),
                    exp.toFixed(2),
                    grossCash.toFixed(2),
                    u.toFixed(2),
                    total.toFixed(2),
                    growth === 0 ? "-" : `${growth > 0 ? "+" : ""}${growth.toFixed(0)}%`
                ];
            });
        } else if (view === 'monthly') {
            head = [["Month", "Cash (Rs)", "UPI (Rs)", "Total (Rs)", "Change"]];
            body = monthlyAggregated.map((m, idx) => {
                const c = m.total_cash_cents / 100;
                const u = m.upi_amount_cents / 100;
                const t = m.total_cents / 100;
                let growth = 0;
                if (idx > 0) {
                    const prev = monthlyAggregated[idx - 1];
                    const prevT = prev.total_cents / 100;
                    if (prevT > 0) growth = ((t - prevT) / prevT) * 100;
                }
                return [m.monthName, c.toFixed(2), u.toFixed(2), (c + u).toFixed(2), growth === 0 ? "-" : `${growth > 0 ? "+" : ""}${growth.toFixed(0)}%`];
            });
        } else {
            // Yearly
            head = [["Year", "Cash (Rs)", "UPI (Rs)", "Total (Rs)", "Change"]];
            const sortedYears = [...yearlyAggregated].sort((a, b) => b.year - a.year);
            body = sortedYears.map((y, idx) => {
                const c = y.total_cash_cents / 100;
                const u = y.upi_amount_cents / 100;
                const t = y.total_cents / 100;
                let growth = 0;
                if (idx < sortedYears.length - 1) {
                    const prevYearRec = sortedYears[idx + 1];
                    const prevT = prevYearRec.total_cents / 100;
                    if (prevT > 0) growth = ((t - prevT) / prevT) * 100;
                }
                return [y.year, c.toFixed(2), u.toFixed(2), (c + u).toFixed(2), growth === 0 ? "-" : `${growth > 0 ? "+" : ""}${growth.toFixed(0)}%`];
            });
        }

        autoTable(doc, {
            head: head,
            body: body,
            startY: 45,
        });

        doc.save(`sales_report_${view}_${titleTime.replace(' ', '_')}.pdf`);
    }

    if (loading) return (
        <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <span className="text-xs font-semibold">Loading Cash & UPI Analytics...</span>
        </div>
    );

    let navTitle = "";
    if (view === 'daily') navTitle = format(currentDate, "MMMM yyyy");
    else if (view === 'monthly') navTitle = format(currentYear, "yyyy");
    else navTitle = "All Time History";

    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">

                {/* View Toggle */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start overflow-x-auto max-w-full border border-slate-200/80">
                    <button
                        onClick={() => setView("daily")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${view === "daily" ? "bg-white text-slate-900 shadow-xs border border-slate-200/80" : "text-slate-600 hover:text-slate-900"}`}
                    >
                        Daily
                    </button>
                    <button
                        onClick={() => setView("monthly")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${view === "monthly" ? "bg-white text-slate-900 shadow-xs border border-slate-200/80" : "text-slate-600 hover:text-slate-900"}`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setView("yearly")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${view === "yearly" ? "bg-white text-slate-900 shadow-xs border border-slate-200/80" : "text-slate-600 hover:text-slate-900"}`}
                    >
                        Yearly
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Period Picker */}
                    <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
                        {view !== 'yearly' && (
                            <button onClick={prevPeriod} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer" title="Previous Period">
                                <ChevronLeft size={16} />
                            </button>
                        )}
                        <div className={`text-xs sm:text-sm font-bold text-slate-800 text-center select-none ${view === 'yearly' ? 'px-3 py-1' : 'w-36'}`}>
                            {navTitle}
                        </div>
                        {view !== 'yearly' && (
                            <button onClick={nextPeriod} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer" title="Next Period">
                                <ChevronRight size={16} />
                            </button>
                        )}
                    </div>

                    <Button onClick={exportPdf} className="gap-1.5 text-xs font-bold rounded-xl border-slate-200/80 hover:bg-slate-50 cursor-pointer" variant="outline">
                        <Download size={14} /> Export PDF
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Total Settlement ({view === 'daily' ? 'Month' : view === 'monthly' ? 'Year' : 'All Time'})
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
                        ₹{(grandTotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Cash</div>
                    <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-2">
                        ₹{(totalCash / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                    <div className="text-xs font-bold uppercase tracking-wider text-purple-700">Total Online / UPI</div>
                    <div className="text-2xl sm:text-3xl font-black text-purple-600 mt-2">
                        ₹{(totalUpi / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            {/* Chart Section */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col h-[420px]">
                <div className="flex items-center justify-between mb-4 shrink-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-600" />
                        <span>{view === 'daily' ? 'Daily Cash vs UPI Collections' : view === 'monthly' ? 'Monthly Cash vs UPI Collections' : 'Yearly Cash vs UPI Collections'}</span>
                    </h3>
                    <span className="text-xs text-slate-500 font-mono">
                        Cash (Green) + UPI (Purple)
                    </span>
                </div>
                <div className="flex-1 w-full min-h-0">
                    {chartData.length > 0 && chartData.some(d => d.Cash > 0 || d.UPI > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={(val) => `₹${val / 1000}k`} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '12px' }}
                                    cursor={{ fill: '#F1F5F9' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                <Bar dataKey="Cash" fill="#10B981" radius={[4, 4, 0, 0]} stackId="a" />
                                <Bar dataKey="UPI" fill="#9333EA" radius={[4, 4, 0, 0]} stackId="a" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                            No sales records found for this period.
                        </div>
                    )}
                </div>
            </div>

            {/* Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        {view === 'daily' ? 'Daily Settlement Logs' : view === 'monthly' ? 'Monthly Aggregations' : 'Yearly Summaries'}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                            <tr>
                                {view === 'daily' ? (
                                    <>
                                        <th className="px-5 py-3.5">Date</th>
                                        <th className="px-5 py-3.5 text-slate-700">Drawer Cash (₹)</th>
                                        <th className="px-5 py-3.5 text-amber-700">Expenses (₹)</th>
                                        <th className="px-5 py-3.5 text-emerald-700">Gross Cash (₹)</th>
                                        <th className="px-5 py-3.5 text-purple-700">UPI (₹)</th>
                                        <th className="px-5 py-3.5 font-bold text-slate-900">Total (₹)</th>
                                        <th className="px-5 py-3.5">Change</th>
                                    </>
                                ) : view === 'monthly' ? (
                                    <>
                                        <th className="px-6 py-3.5">Month</th>
                                        <th className="px-6 py-3.5 text-emerald-700">Total Cash (₹)</th>
                                        <th className="px-6 py-3.5 text-purple-700">Total UPI (₹)</th>
                                        <th className="px-6 py-3.5 font-bold text-slate-900">Total Revenue (₹)</th>
                                        <th className="px-6 py-3.5">Trend</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-6 py-3.5">Year</th>
                                        <th className="px-6 py-3.5 text-emerald-700">Total Cash (₹)</th>
                                        <th className="px-6 py-3.5 text-purple-700">Total UPI (₹)</th>
                                        <th className="px-6 py-3.5 font-bold text-slate-900">Total Revenue (₹)</th>
                                        <th className="px-6 py-3.5">Trend</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {view === 'daily' ? (
                                [...dailySales]
                                    .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
                                    .map((s, index, arr) => {
                                        const grossCash = (s.total_cash_cents || 0) / 100;
                                        const exp = (s.daily_expense_cents || 0) / 100;
                                        const drawer = s.drawer_cash_cents !== null && s.drawer_cash_cents !== undefined
                                            ? s.drawer_cash_cents / 100
                                            : Math.max(0, grossCash - exp);
                                        const u = (s.upi_amount_cents || 0) / 100;
                                        const t = grossCash + u;
                                        const prevTotal = index > 0 ? ((arr[index - 1].total_cash_cents || 0) + (arr[index - 1].upi_amount_cents || 0)) / 100 : 0;
                                        const growth = prevTotal > 0 ? ((t - prevTotal) / prevTotal) * 100 : 0;

                                        return (
                                            <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                                                    {format(new Date(s.sale_date), "dd MMM yyyy")}
                                                </td>
                                                <td className="px-5 py-3.5 text-slate-700 font-mono">₹{drawer.toFixed(2)}</td>
                                                <td className="px-5 py-3.5 text-amber-700 font-mono font-medium">₹{exp.toFixed(2)}</td>
                                                <td className="px-5 py-3.5 text-emerald-700 font-mono font-semibold">₹{grossCash.toFixed(2)}</td>
                                                <td className="px-5 py-3.5 text-purple-700 font-mono font-semibold">₹{u.toFixed(2)}</td>
                                                <td className="px-5 py-3.5 font-bold font-mono text-slate-900">₹{t.toFixed(2)}</td>
                                                <td className="px-5 py-3.5">
                                                    {renderTrendBadge(growth)}
                                                </td>
                                            </tr>
                                        );
                                    })
                            ) : view === 'monthly' ? (
                                monthlyAggregated.map((m, idx) => {
                                    const c = m.total_cash_cents / 100;
                                    const u = m.upi_amount_cents / 100;
                                    const t = m.total_cents / 100;
                                    if (!m.hasData && t === 0) return null;

                                    let growth = 0;
                                    if (idx > 0) {
                                        const prev = monthlyAggregated[idx - 1];
                                        const prevT = prev.total_cents / 100;
                                        if (prevT > 0) growth = ((t - prevT) / prevT) * 100;
                                    }

                                    return (
                                        <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                                            <td className="px-6 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                                                {m.monthName}
                                            </td>
                                            <td className="px-6 py-3.5 text-emerald-700 font-mono font-semibold">₹{c.toFixed(2)}</td>
                                            <td className="px-6 py-3.5 text-purple-700 font-mono font-semibold">₹{u.toFixed(2)}</td>
                                            <td className="px-6 py-3.5 font-bold font-mono text-slate-900">₹{t.toFixed(2)}</td>
                                            <td className="px-6 py-3.5">
                                                {renderTrendBadge(growth)}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                yearlyAggregated.sort((a, b) => b.year - a.year).map((y, idx, arr) => {
                                    const c = y.total_cash_cents / 100;
                                    const u = y.upi_amount_cents / 100;
                                    const t = y.total_cents / 100;

                                    const prevYearRec = idx < arr.length - 1 ? arr[idx + 1] : null;
                                    let growth = 0;
                                    if (prevYearRec) {
                                        const prevT = prevYearRec.total_cents / 100;
                                        if (prevT > 0) growth = ((t - prevT) / prevT) * 100;
                                    }

                                    return (
                                        <tr key={y.year} className="hover:bg-slate-50/70 transition-colors">
                                            <td className="px-6 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                                                {y.year}
                                            </td>
                                            <td className="px-6 py-3.5 text-emerald-700 font-mono font-semibold">₹{c.toFixed(2)}</td>
                                            <td className="px-6 py-3.5 text-purple-700 font-mono font-semibold">₹{u.toFixed(2)}</td>
                                            <td className="px-6 py-3.5 font-bold font-mono text-slate-900">₹{t.toFixed(2)}</td>
                                            <td className="px-6 py-3.5">
                                                {renderTrendBadge(growth)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}

                            {/* Empty State */}
                            {((view === 'daily' && dailySales.length === 0) || (view === 'monthly' && monthlyAggregated.every(m => m.total_cents === 0)) || (view === 'yearly' && yearlyAggregated.length === 0)) && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                        No sales records found for this period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
