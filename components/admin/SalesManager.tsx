"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Loader2, Download, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfMonth, endOfMonth, addMonths, isSameMonth, isSameYear, addYears, getYear } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface SalesData {
    id: string;
    sale_date: string;
    total_cash_cents: number | null;
    upi_amount_cents: number | null;
    cash_submitter: { full_name?: string; email?: string } | null;
    upi_submitter: { full_name?: string; email?: string } | null;
}

export function SalesManager() {
    const [view, setView] = useState<"daily" | "monthly" | "yearly">("daily");
    const [allSales, setAllSales] = useState<SalesData[]>([]);
    const [loading, setLoading] = useState(true);

    // Daily View State (Month Selector)
    const [currentDate, setCurrentDate] = useState(new Date());

    // Monthly View State (Year Selector)
    const [currentYear, setCurrentYear] = useState(new Date());

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const { data, error } = await supabaseClient
            .from("daily_sales")
            .select(`
                *,
                cash_submitter:cash_submitted_by(full_name, email),
                upi_submitter:upi_submitted_by(full_name, email)
            `)
            .order("sale_date", { ascending: false });

        if (error) {
            console.error("Failed to load sales", error);
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

    // --- Data Preparation ---

    // 1. Filtered Raw Data
    const dailySales = allSales.filter(s => isSameMonth(new Date(s.sale_date), currentDate));
    const yearlyRawSales = allSales.filter(s => isSameYear(new Date(s.sale_date), currentYear));
    // For Yearly view, we use ALL sales (or we could limit window, but let's use all for now as user probably wants full history)
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
    // Find unique years in data
    const yearsInData = Array.from(new Set(allSales.map(s => getYear(new Date(s.sale_date))))).sort((a, b) => a - b);
    // Ensure current year is in list if empty
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
        // Yearly has no nav (shows all)
    }

    function nextPeriod() {
        if (view === 'daily') setCurrentDate(d => addMonths(d, 1));
        else if (view === 'monthly') setCurrentYear(d => addYears(d, 1));
        // Yearly has no nav
    }

    // --- Export ---
    function exportPdf() {
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
            head = [["Date", "Cash (Rs)", "UPI (Rs)", "Total (Rs)", "Submitted By"]];
            const sortedDaily = [...dailySales].sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime());
            body = sortedDaily.map(s => {
                const c = (s.total_cash_cents || 0) / 100;
                const u = (s.upi_amount_cents || 0) / 100;
                return [s.sale_date, c.toFixed(2), u.toFixed(2), (c + u).toFixed(2), formatName(s.cash_submitter)];
            });
        } else if (view === 'monthly') {
            head = [["Month", "Cash (Rs)", "UPI (Rs)", "Total (Rs)"]];
            body = monthlyAggregated.map(m => {
                const c = m.total_cash_cents / 100;
                const u = m.upi_amount_cents / 100;
                return [m.monthName, c.toFixed(2), u.toFixed(2), (c + u).toFixed(2)];
            });
        } else {
            // Yearly
            head = [["Year", "Cash (Rs)", "UPI (Rs)", "Total (Rs)"]];
            // Sort Descending for table
            const sortedYears = [...yearlyAggregated].sort((a, b) => b.year - a.year);
            body = sortedYears.map(y => {
                const c = y.total_cash_cents / 100;
                const u = y.upi_amount_cents / 100;
                return [y.year, c.toFixed(2), u.toFixed(2), (c + u).toFixed(2)];
            });
        }

        autoTable(doc, {
            head: head,
            body: body,
            startY: 45,
        });

        doc.save(`sales_report_${view}_${titleTime.replace(' ', '_')}.pdf`);
    }

    if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

    let navTitle = "";
    if (view === 'daily') navTitle = format(currentDate, "MMMM yyyy");
    else if (view === 'monthly') navTitle = format(currentYear, "yyyy");
    else navTitle = "All Time History";

    return (
        <div className="space-y-8">
            {/* Header Controls */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">

                {/* View Toggle */}
                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl self-start overflow-x-auto max-w-full">
                    <button
                        onClick={() => setView("daily")}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${view === "daily" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                    >
                        Daily
                    </button>
                    <button
                        onClick={() => setView("monthly")}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${view === "monthly" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setView("yearly")}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${view === "yearly" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                    >
                        Yearly
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    {/* Period Picker (Hidden for Yearly?) Or showing title? */}
                    <div className="flex items-center gap-4 bg-white p-1 rounded-xl border border-zinc-200 shadow-sm">
                        {view !== 'yearly' && (
                            <button onClick={prevPeriod} className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-lg">
                                <ChevronLeft size={20} />
                            </button>
                        )}
                        <div className={`text-lg font-bold text-zinc-800 text-center select-none ${view === 'yearly' ? 'px-4' : 'w-40'}`}>
                            {navTitle}
                        </div>
                        {view !== 'yearly' && (
                            <button onClick={nextPeriod} className="p-2 hover:bg-zinc-50 text-zinc-600 rounded-lg">
                                <ChevronRight size={20} />
                            </button>
                        )}
                    </div>

                    <Button onClick={exportPdf} className="gap-2" variant="outline">
                        <Download size={14} /> Export
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                    <div className="text-sm font-medium text-zinc-500">Total Revenue ({view === 'daily' ? 'Month' : view === 'monthly' ? 'Year' : 'All Time'})</div>
                    <div className="text-3xl font-bold text-zinc-900 mt-2">₹ {(grandTotal / 100).toLocaleString('en-IN')}</div>
                </div>
                <div className="p-5 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                    <div className="text-sm font-medium text-zinc-500">Total Cash</div>
                    <div className="text-3xl font-bold text-emerald-600 mt-2">₹ {(totalCash / 100).toLocaleString('en-IN')}</div>
                </div>
                <div className="p-5 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                    <div className="text-sm font-medium text-zinc-500">Total UPI</div>
                    <div className="text-3xl font-bold text-purple-600 mt-2">₹ {(totalUpi / 100).toLocaleString('en-IN')}</div>
                </div>
            </div>

            {/* Chart Section */}
            <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm h-[400px]">
                <h3 className="text-lg font-bold text-zinc-800 mb-6">
                    {view === 'daily' ? 'Daily Sales Trend' : view === 'monthly' ? 'Monthly Sales Trend' : 'Yearly Sales Trend'}
                </h3>
                {chartData.length > 0 && chartData.some(d => d.Cash > 0 || d.UPI > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E5" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} tickFormatter={(val) => `₹${val / 1000}k`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                cursor={{ fill: '#F4F4F5' }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Bar dataKey="Cash" fill="#10B981" radius={[4, 4, 0, 0]} stackId="a" />
                            <Bar dataKey="UPI" fill="#9333EA" radius={[4, 4, 0, 0]} stackId="a" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-zinc-400">
                        No sales data found for this period.
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-50 border-b border-zinc-200 font-medium text-zinc-500">
                            <tr>
                                {view === 'daily' ? (
                                    <>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Cash</th>
                                        <th className="px-6 py-4">UPI</th>
                                        <th className="px-6 py-4">Total</th>
                                        <th className="px-6 py-4">Submitted By</th>
                                    </>
                                ) : view === 'monthly' ? (
                                    <>
                                        <th className="px-6 py-4">Month</th>
                                        <th className="px-6 py-4">Total Cash</th>
                                        <th className="px-6 py-4">Total UPI</th>
                                        <th className="px-6 py-4">Total Revenue</th>
                                        <th className="px-6 py-4">Trend</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-6 py-4">Year</th>
                                        <th className="px-6 py-4">Total Cash</th>
                                        <th className="px-6 py-4">Total UPI</th>
                                        <th className="px-6 py-4">Total Revenue</th>
                                        <th className="px-6 py-4">Trend</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {view === 'daily' ? (
                                // DAILY ROWS
                                [...dailySales]
                                    .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
                                    .map(s => {
                                        const c = (s.total_cash_cents || 0) / 100;
                                        const u = (s.upi_amount_cents || 0) / 100;
                                        const t = c + u;
                                        return (
                                            <tr key={s.id} className="hover:bg-zinc-50/50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-zinc-900 whitespace-nowrap">
                                                    {format(new Date(s.sale_date), "dd MMM yyyy")}
                                                </td>
                                                <td className="px-6 py-4 text-emerald-700 font-medium">₹ {c.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-purple-700 font-medium">₹ {u.toFixed(2)}</td>
                                                <td className="px-6 py-4 font-bold text-zinc-900">₹ {t.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-zinc-500 text-xs">
                                                    {s.cash_submitter ? formatName(s.cash_submitter) : "-"}
                                                </td>
                                            </tr>
                                        );
                                    })
                            ) : view === 'monthly' ? (
                                // MONTHLY ROWS
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
                                        <tr key={m.id} className="hover:bg-zinc-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-zinc-900 whitespace-nowrap">
                                                {m.monthName}
                                            </td>
                                            <td className="px-6 py-4 text-emerald-700 font-medium">₹ {c.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-purple-700 font-medium">₹ {u.toFixed(2)}</td>
                                            <td className="px-6 py-4 font-bold text-zinc-900">₹ {t.toFixed(2)}</td>
                                            <td className="px-6 py-4">
                                                {growth !== 0 && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center font-bold ${growth > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {growth > 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                                                        {Math.abs(growth).toFixed(0)}%
                                                    </span>
                                                )}
                                                {growth === 0 && <span className="text-zinc-400 text-xs">-</span>}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                // YEARLY ROWS
                                yearlyAggregated.sort((a, b) => b.year - a.year).map((y, idx) => {
                                    const c = y.total_cash_cents / 100;
                                    const u = y.upi_amount_cents / 100;
                                    const t = y.total_cents / 100;

                                    // Growth from previous year in list? (Sorted Descending, so 'idx+1' is prev year)
                                    // Actually we sorted Descending (2026, 2025). So idx+1 is 2025.
                                    let growth = 0;
                                    // We need to compare with the 'older' year. if we are at 2026 (0), we compare with 2025 (1).
                                    // But list might not be contiguous. It's fine.
                                    const sortedDesc = yearlyAggregated.sort((a, b) => b.year - a.year);
                                    if (idx < sortedDesc.length - 1) {
                                        const prevYearRec = sortedDesc[idx + 1];
                                        const prevT = prevYearRec.total_cents / 100;
                                        if (prevT > 0) growth = ((t - prevT) / prevT) * 100;
                                    }

                                    return (
                                        <tr key={y.year} className="hover:bg-zinc-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-zinc-900 whitespace-nowrap">
                                                {y.year}
                                            </td>
                                            <td className="px-6 py-4 text-emerald-700 font-medium">₹ {c.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-purple-700 font-medium">₹ {u.toFixed(2)}</td>
                                            <td className="px-6 py-4 font-bold text-zinc-900">₹ {t.toFixed(2)}</td>
                                            <td className="px-6 py-4">
                                                {growth !== 0 && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center font-bold ${growth > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {growth > 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                                                        {Math.abs(growth).toFixed(0)}%
                                                    </span>
                                                )}
                                                {growth === 0 && <span className="text-zinc-400 text-xs">-</span>}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}

                            {/* Empty State */}
                            {((view === 'daily' && dailySales.length === 0) || (view === 'monthly' && monthlyAggregated.every(m => m.total_cents === 0)) || (view === 'yearly' && yearlyAggregated.length === 0)) && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
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
