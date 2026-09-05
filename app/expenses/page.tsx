"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
    ChevronLeft, ChevronRight, Loader2, Plus, Receipt, Trash2, Pencil,
    Lock, Calendar, X, Check, PackageSearch, ClipboardList, BarChart3, Search, ArrowUpDown, Download,
    Flame, TrendingUp, TrendingDown, ArrowRight, ChevronDown,
    LineChart as LineChartIcon, AreaChart as AreaChartIcon, PieChart as PieChartIcon
} from "lucide-react";
import Link from "next/link";
import {
    format, addDays, isSameDay, addWeeks, addMonths, addYears,
    startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay
} from "date-fns";
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { FixedPriceManager, FixedPriceItem } from "@/components/expenses/FixedPriceManager";
import { Tag } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";

interface ExpenseRow {
    id: string;
    expense_date: string;
    item_name: string;
    quantity: number;
    price_cents: number;
    submitted_by: string | null;
    created_at: string;
}

export default function ExpensesPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    // Date being viewed (admin can browse history, regular users stay on today)
    const [date, setDate] = useState<Date>(new Date());
    const isToday = isSameDay(date, new Date());

    const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
    const [allExpenses, setAllExpenses] = useState<ExpenseRow[]>([]);
    const [namesById, setNamesById] = useState<Record<string, string>>({});
    const [listLoading, setListLoading] = useState(true);

    // Tabs: adding new entries vs. browsing spending history
    const [activeTab, setActiveTab] = useState<"add" | "overview">("add");

    // Overview filter: period scope + anchor date used for week/month/year navigation
    const [overviewScope, setOverviewScope] = useState<"today" | "week" | "month" | "year" | "all" | "custom">("month");
    const [overviewAnchor, setOverviewAnchor] = useState<Date>(new Date());
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortKey, setSortKey] = useState<"date" | "amount">("date");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [trendChartType, setTrendChartType] = useState<"bar" | "line" | "area">("bar");
    const [expandedPriceItems, setExpandedPriceItems] = useState<Set<string>>(new Set());
    const [exportingPdf, setExportingPdf] = useState(false);
    const trendChartRef = useRef<HTMLDivElement>(null);
    const leakChartsRef = useRef<HTMLDivElement>(null);

    // Add-entry form
    const [itemName, setItemName] = useState("");
    const [price, setPrice] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [saving, setSaving] = useState(false);

    // Fixed-price catalog: everyone can pick from it, only admins can edit the prices
    const [priceList, setPriceList] = useState<FixedPriceItem[]>([]);
    const [selectedFixedItem, setSelectedFixedItem] = useState<FixedPriceItem | null>(null);
    const [showPriceManager, setShowPriceManager] = useState(false);

    // Admin inline edit
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editItemName, setEditItemName] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editQuantity, setEditQuantity] = useState("1");

    useEffect(() => {
        checkUser();
    }, []);

    // Support deep-linking straight into the Spending Overview tab (e.g. from the admin panel).
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("tab") === "overview") {
            setActiveTab("overview");
        }
    }, []);

    useEffect(() => {
        fetchPriceList();
    }, []);

    useEffect(() => {
        if (userId) fetchExpenses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, userId]);

    useEffect(() => {
        if (userId && isAdmin) fetchAllExpenses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, isAdmin]);

    async function checkUser() {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("is_admin")
                .eq("id", user.id)
                .single();

            setIsAdmin(!!profile?.is_admin);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function loadNames(rows: ExpenseRow[]) {
        const ids = Array.from(new Set(rows.map(r => r.submitted_by).filter(Boolean))) as string[];
        const missing = ids.filter(id => !namesById[id]);
        if (missing.length === 0) return;

        const { data } = await supabaseClient.from("profiles").select("id,email,full_name").in("id", missing);
        if (!data) return;
        setNamesById(prev => {
            const next = { ...prev };
            for (const p of data as any[]) {
                next[p.id] = p.full_name || (p.email ? p.email.split("@")[0] : "Unknown");
            }
            return next;
        });
    }

    async function fetchExpenses() {
        setListLoading(true);
        const dateStr = format(date, "yyyy-MM-dd");
        const { data, error } = await supabaseClient
            .from("daily_expenses")
            .select("*")
            .eq("expense_date", dateStr)
            .order("created_at", { ascending: true });

        if (error) {
            toast({ title: "Failed to load expenses", description: error.message, variant: "error" });
            setExpenses([]);
        } else {
            const rows = (data || []) as ExpenseRow[];
            setExpenses(rows);
            if (isAdmin) loadNames(rows);
        }
        setListLoading(false);
    }

    async function fetchAllExpenses() {
        if (!isAdmin) return; // overview/price-watch data is admin-only
        const { data, error } = await supabaseClient
            .from("daily_expenses")
            .select("*")
            .order("expense_date", { ascending: true });

        if (!error) {
            const rows = (data || []) as ExpenseRow[];
            setAllExpenses(rows);
            if (isAdmin) loadNames(rows);
        }
    }

    async function fetchPriceList() {
        const { data, error } = await supabaseClient
            .from("expense_price_list")
            .select("*")
            .order("item_name", { ascending: true });

        if (!error) setPriceList((data || []) as FixedPriceItem[]);
    }

    async function addPriceItem(name: string, priceRupees: number) {
        const { error } = await supabaseClient.from("expense_price_list").insert({
            item_name: name,
            price_cents: Math.round(priceRupees * 100),
            updated_by: userId,
        });
        if (error) {
            toast({ title: "Failed to add item", description: error.message, variant: "error" });
            return false;
        }
        toast({ title: "Fixed price item added", variant: "success" });
        fetchPriceList();
        return true;
    }

    async function updatePriceItemPrice(id: string, priceRupees: number) {
        const { error } = await supabaseClient.from("expense_price_list").update({
            price_cents: Math.round(priceRupees * 100),
            updated_by: userId,
            updated_at: new Date().toISOString(),
        }).eq("id", id);
        if (error) {
            toast({ title: "Failed to update price", description: error.message, variant: "error" });
            return false;
        }
        toast({ title: "Price updated", variant: "success" });
        fetchPriceList();
        setSelectedFixedItem(prev => prev && prev.id === id ? { ...prev, price_cents: Math.round(priceRupees * 100) } : prev);
        return true;
    }

    async function togglePriceItemActive(id: string, active: boolean) {
        const { error } = await supabaseClient.from("expense_price_list").update({ active }).eq("id", id);
        if (error) {
            toast({ title: "Failed to update item", description: error.message, variant: "error" });
            return;
        }
        fetchPriceList();
    }

    async function deletePriceItem(id: string) {
        if (!confirm("Delete this fixed price item?")) return;
        const { error } = await supabaseClient.from("expense_price_list").delete().eq("id", id);
        if (error) {
            toast({ title: "Failed to delete item", description: error.message, variant: "error" });
            return;
        }
        toast({ title: "Item deleted", variant: "success" });
        if (selectedFixedItem?.id === id) setSelectedFixedItem(null);
        fetchPriceList();
    }

    function resetForm() {
        setItemName("");
        setPrice("");
        setQuantity("1");
        setSelectedFixedItem(null);
    }

    function selectFixedItem(item: FixedPriceItem | null) {
        setSelectedFixedItem(item);
        setItemName(item ? item.item_name : "");
        setPrice("");
    }

    async function addExpense() {
        const qtyNum = Number(quantity) || 1;
        if (qtyNum <= 0) {
            toast({ title: "Invalid quantity", variant: "error" });
            return;
        }

        let finalName: string;
        let finalPriceCents: number;

        if (selectedFixedItem) {
            finalName = selectedFixedItem.item_name;
            finalPriceCents = selectedFixedItem.price_cents * qtyNum;
        } else {
            const trimmedName = itemName.trim();
            if (!trimmedName) {
                toast({ title: "Enter item name", variant: "error" });
                return;
            }
            const priceNum = Number(price);
            if (!price || isNaN(priceNum) || priceNum <= 0) {
                toast({ title: "Invalid price", description: "Enter a valid amount", variant: "error" });
                return;
            }
            finalName = trimmedName;
            finalPriceCents = Math.round(priceNum * 100);
        }

        setSaving(true);
        const { error } = await supabaseClient.from("daily_expenses").insert({
            expense_date: format(date, "yyyy-MM-dd"),
            item_name: finalName,
            quantity: qtyNum,
            price_cents: finalPriceCents,
            submitted_by: userId,
        });
        setSaving(false);

        if (error) {
            toast({ title: "Failed to add expense", description: error.message, variant: "error" });
            return;
        }

        toast({ title: "Expense added", variant: "success" });
        resetForm();
        fetchExpenses();
        fetchAllExpenses();
    }

    function startEdit(row: ExpenseRow) {
        setEditingId(row.id);
        setEditItemName(row.item_name);
        setEditPrice((row.price_cents / 100).toString());
        setEditQuantity(row.quantity.toString());
    }

    function cancelEdit() {
        setEditingId(null);
    }

    async function saveEdit(row: ExpenseRow) {
        const trimmedName = editItemName.trim();
        const priceNum = Number(editPrice);
        const qtyNum = Number(editQuantity) || 1;
        if (!trimmedName || !editPrice || isNaN(priceNum) || priceNum <= 0) {
            toast({ title: "Invalid entry", description: "Check name and price", variant: "error" });
            return;
        }

        const { error } = await supabaseClient.from("daily_expenses").update({
            item_name: trimmedName,
            quantity: qtyNum,
            price_cents: Math.round(priceNum * 100),
            updated_by: userId,
            updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        if (error) {
            toast({ title: "Failed to update", description: error.message, variant: "error" });
            return;
        }

        toast({ title: "Expense updated", variant: "success" });
        setEditingId(null);
        fetchExpenses();
        fetchAllExpenses();
    }

    async function deleteExpense(row: ExpenseRow) {
        if (!confirm(`Delete "${row.item_name}"?`)) return;

        const { error } = await supabaseClient.from("daily_expenses").delete().eq("id", row.id);
        if (error) {
            toast({ title: "Failed to delete", description: error.message, variant: "error" });
            return;
        }

        toast({ title: "Expense deleted", variant: "success" });
        fetchExpenses();
        fetchAllExpenses();
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

    function getOverviewRange(): { start: Date; end: Date } | null {
        switch (overviewScope) {
            case "today":
                return { start: startOfDay(new Date()), end: endOfDay(new Date()) };
            case "week":
                return { start: startOfWeek(overviewAnchor, { weekStartsOn: 1 }), end: endOfWeek(overviewAnchor, { weekStartsOn: 1 }) };
            case "month":
                return { start: startOfMonth(overviewAnchor), end: endOfMonth(overviewAnchor) };
            case "year":
                return { start: startOfYear(overviewAnchor), end: endOfYear(overviewAnchor) };
            case "custom": {
                if (!customFrom && !customTo) return null;
                const start = customFrom ? startOfDay(new Date(`${customFrom}T00:00:00`)) : new Date(0);
                const end = customTo ? endOfDay(new Date(`${customTo}T00:00:00`)) : endOfDay(new Date());
                return { start, end };
            }
            default:
                return null;
        }
    }

    const overviewRange = getOverviewRange();
    const rangedRows = overviewRange
        ? allExpenses.filter(r => {
            const d = new Date(`${r.expense_date}T00:00:00`);
            return d >= overviewRange.start && d <= overviewRange.end;
        })
        : allExpenses;

    const searchTerm = searchQuery.trim().toLowerCase();
    const overviewRows = searchTerm
        ? rangedRows.filter(r => r.item_name.toLowerCase().includes(searchTerm))
        : rangedRows;

    const overviewTotalCents = overviewRows.reduce((sum, r) => sum + r.price_cents, 0);
    const overviewItemSummary = Object.values(
        overviewRows.reduce((acc, r) => {
            const key = r.item_name.trim().toLowerCase();
            if (!acc[key]) acc[key] = { name: r.item_name, quantity: 0, cents: 0 };
            acc[key].quantity += Number(r.quantity) || 0;
            acc[key].cents += r.price_cents;
            return acc;
        }, {} as Record<string, { name: string; quantity: number; cents: number }>)
    ).sort((a, b) => b.cents - a.cents);

    const distinctItemCount = overviewItemSummary.length;
    const avgPerEntryCents = overviewRows.length > 0 ? overviewTotalCents / overviewRows.length : 0;

    // Chart grouping: by day for short ranges, by month across a year, by year for all-time
    const chartGroupBy: "day" | "month" | "year" =
        overviewScope === "year" ? "month" : overviewScope === "all" ? "year" : "day";
    const chartMap = new Map<string, number>();
    for (const r of overviewRows) {
        const d = new Date(`${r.expense_date}T00:00:00`);
        const key = chartGroupBy === "day" ? format(d, "MMM d") : chartGroupBy === "month" ? format(d, "MMM") : format(d, "yyyy");
        chartMap.set(key, (chartMap.get(key) || 0) + r.price_cents);
    }
    const chartData = Array.from(chartMap.entries()).map(([name, cents]) => ({ name, Amount: cents / 100 }));

    // "Where is it leaking" insights: biggest spend contributors, most-bought items, and their share of the total
    const PIE_COLORS = ["#0891B2", "#F97316", "#8B5CF6", "#EC4899", "#22C55E", "#A1A1AA"];
    const topLeakItems = overviewItemSummary.slice(0, 6).map(i => ({
        name: i.name,
        Amount: i.cents / 100,
        percent: overviewTotalCents > 0 ? (i.cents / overviewTotalCents) * 100 : 0,
    }));
    const topQuantityItems = [...overviewItemSummary]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 6)
        .map(i => ({ name: i.name, Qty: i.quantity }));
    const pieData = (() => {
        const top = overviewItemSummary.slice(0, 5).map(i => ({ name: i.name, value: i.cents / 100 }));
        const othersCents = overviewItemSummary.slice(5).reduce((sum, i) => sum + i.cents, 0);
        if (othersCents > 0) top.push({ name: "Other", value: othersCents / 100 });
        return top;
    })();
    const biggestLeak = overviewItemSummary[0] || null;
    const biggestLeakPercent = biggestLeak && overviewTotalCents > 0 ? (biggestLeak.cents / overviewTotalCents) * 100 : 0;

    // Price Watch: full price-change timeline per item across all history (not just the selected period),
    // so a past spike is still visible even if the price has since come back down (e.g. ₹20 -> ₹100 -> ₹20).
    const priceTimelines = (() => {
        const searchT = searchQuery.trim().toLowerCase();
        const source = searchT ? allExpenses.filter(r => r.item_name.toLowerCase().includes(searchT)) : allExpenses;
        const byItem = new Map<string, { name: string; entries: { date: string; unit: number }[] }>();
        for (const r of source) {
            if (!r.quantity || r.quantity <= 0) continue;
            const key = r.item_name.trim().toLowerCase();
            if (!byItem.has(key)) byItem.set(key, { name: r.item_name, entries: [] });
            byItem.get(key)!.entries.push({ date: r.expense_date, unit: r.price_cents / r.quantity });
        }

        type Change = { date: string; fromCents: number; toCents: number; percent: number };
        const timelines: {
            key: string; name: string; currentCents: number; firstCents: number;
            peakCents: number; peakDate: string; changes: Change[];
        }[] = [];

        for (const [key, { name, entries }] of byItem.entries()) {
            const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
            // Collapse consecutive purchases at (roughly) the same price into a single price-point
            const points: { date: string; unit: number }[] = [];
            for (const e of sorted) {
                const last = points[points.length - 1];
                if (!last || Math.round(last.unit) !== Math.round(e.unit)) points.push(e);
            }
            if (points.length < 2) continue; // price never changed

            const changes: Change[] = [];
            for (let i = 1; i < points.length; i++) {
                const from = points[i - 1].unit;
                const to = points[i].unit;
                changes.push({ date: points[i].date, fromCents: from, toCents: to, percent: from > 0 ? ((to - from) / from) * 100 : 0 });
            }
            if (!changes.some(c => c.percent > 0)) continue; // only surface items that have gone up at least once

            let peak = points[0];
            for (const p of points) if (p.unit > peak.unit) peak = p;

            timelines.push({
                key,
                name,
                currentCents: points[points.length - 1].unit,
                firstCents: points[0].unit,
                peakCents: peak.unit,
                peakDate: peak.date,
                changes: [...changes].reverse(), // most recent change first
            });
        }

        return timelines.sort((a, b) => {
            const growthA = a.firstCents > 0 ? (a.peakCents - a.firstCents) / a.firstCents : 0;
            const growthB = b.firstCents > 0 ? (b.peakCents - b.firstCents) / b.firstCents : 0;
            return growthB - growthA;
        });
    })();

    const sortedTransactions = [...overviewRows].sort((a, b) => {
        const diff = sortKey === "date"
            ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            : a.price_cents - b.price_cents;
        return sortDir === "asc" ? diff : -diff;
    });

    function toggleSort(key: "date" | "amount") {
        if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
        else { setSortKey(key); setSortDir("desc"); }
    }

    function togglePriceItem(key: string) {
        setExpandedPriceItems(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }

    let overviewPeriodLabel = "All Time";
    if (overviewScope === "today") overviewPeriodLabel = format(new Date(), "MMMM d, yyyy");
    else if (overviewScope === "week" && overviewRange) overviewPeriodLabel = `${format(overviewRange.start, "MMM d")} – ${format(overviewRange.end, "MMM d, yyyy")}`;
    else if (overviewScope === "month") overviewPeriodLabel = format(overviewAnchor, "MMMM yyyy");
    else if (overviewScope === "year") overviewPeriodLabel = format(overviewAnchor, "yyyy");

    function prevOverviewPeriod() {
        if (overviewScope === "week") setOverviewAnchor(d => addWeeks(d, -1));
        else if (overviewScope === "month") setOverviewAnchor(d => addMonths(d, -1));
        else if (overviewScope === "year") setOverviewAnchor(d => addYears(d, -1));
    }

    function nextOverviewPeriod() {
        if (overviewScope === "week") setOverviewAnchor(d => addWeeks(d, 1));
        else if (overviewScope === "month") setOverviewAnchor(d => addMonths(d, 1));
        else if (overviewScope === "year") setOverviewAnchor(d => addYears(d, 1));
    }

    const showsNav = overviewScope === "week" || overviewScope === "month" || overviewScope === "year";
    const scopeOptions: Array<{ id: typeof overviewScope; label: string }> = [
        { id: "today", label: "Today" },
        { id: "week", label: "This Week" },
        { id: "month", label: "This Month" },
        { id: "year", label: "This Year" },
        { id: "all", label: "All Time" },
        { id: "custom", label: "Custom Range" },
    ];

    const viewedDateTotalCents = expenses.reduce((sum, r) => sum + r.price_cents, 0);

    // Captures a chart section as an image so the PDF mirrors what's on screen, not just raw numbers
    async function addChartImage(doc: jsPDF, el: HTMLDivElement | null, title: string, y: number): Promise<number> {
        if (!el) return y;
        const pageWidth = doc.internal.pageSize.getWidth();
        const imgWidth = pageWidth - 28;
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (y + imgHeight + 14 > 280) { doc.addPage(); y = 20; }
        doc.setFontSize(13);
        doc.setTextColor(24, 24, 27);
        doc.text(title, 14, y);
        y += 5;
        doc.addImage(canvas.toDataURL("image/png"), "PNG", 14, y, imgWidth, imgHeight);
        return y + imgHeight + 10;
    }

    async function exportOverviewPdf() {
        setExportingPdf(true);
        try {
            const doc = new jsPDF();
            let y = 20;

            doc.setFontSize(18);
            doc.text("Daily Expenses Report", 14, y);
            y += 8;
            doc.setFontSize(11);
            doc.setTextColor(82, 82, 91);
            doc.text(`Period: ${overviewPeriodLabel}`, 14, y);
            y += 6;
            doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, h:mm a")}`, 14, y);
            y += 8;

            doc.setFontSize(11);
            doc.setTextColor(24, 24, 27);
            doc.text(`Total Spent: Rs. ${(overviewTotalCents / 100).toFixed(2)}`, 14, y);
            doc.text(`Avg / Entry: Rs. ${(avgPerEntryCents / 100).toFixed(2)}`, 105, y);
            y += 6;
            doc.text(`Entries: ${overviewRows.length}`, 14, y);
            doc.text(`Distinct Items: ${distinctItemCount}`, 105, y);
            y += 10;

            if (biggestLeak) {
                doc.setFillColor(255, 251, 235);
                doc.rect(14, y - 5, 182, 12, "F");
                doc.setTextColor(180, 83, 9);
                doc.setFontSize(10);
                doc.text(
                    `Biggest Expense Leak: ${biggestLeak.name} - Rs. ${(biggestLeak.cents / 100).toFixed(2)} (${biggestLeakPercent.toFixed(0)}% of total spend)`,
                    17, y + 2
                );
                doc.setTextColor(24, 24, 27);
                y += 14;
            }

            y = await addChartImage(doc, trendChartRef.current, "Spending Trend", y);
            y = await addChartImage(doc, leakChartsRef.current, "Where the Money Is Going", y);

            if (priceTimelines.length > 0) {
                if (y > 250) { doc.addPage(); y = 20; }
                doc.setFontSize(13);
                doc.text("Price Watch — Items That Got Costlier", 14, y);
                autoTable(doc, {
                    startY: y + 4,
                    head: [["Item", "First Price", "Peak Price (Date)", "Current Price", "Peak Change"]],
                    body: priceTimelines.map(t => [
                        t.name,
                        `Rs. ${(t.firstCents / 100).toFixed(2)}`,
                        `Rs. ${(t.peakCents / 100).toFixed(2)} (${format(new Date(`${t.peakDate}T00:00:00`), "d MMM yyyy")})`,
                        `Rs. ${(t.currentCents / 100).toFixed(2)}`,
                        `+${(t.firstCents > 0 ? ((t.peakCents - t.firstCents) / t.firstCents) * 100 : 0).toFixed(0)}%`,
                    ]),
                    headStyles: { fillColor: [225, 29, 72] },
                });
                y = (doc as any).lastAutoTable.finalY + 10;
            }

            if (y > 250) { doc.addPage(); y = 20; }
            doc.setFontSize(13);
            doc.text("Item-wise Breakdown", 14, y);
            autoTable(doc, {
                startY: y + 4,
                head: [["Item", "Qty", "Total (Rs)"]],
                body: overviewItemSummary.map(i => [i.name, i.quantity, (i.cents / 100).toFixed(2)]),
                headStyles: { fillColor: [8, 145, 178] },
            });

            const afterItemsY = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(13);
            doc.text("All Transactions", 14, afterItemsY);

            autoTable(doc, {
                startY: afterItemsY + 4,
                head: [["Date", "Item", "Qty", "Amount (Rs)", ...(isAdmin ? ["Added By"] : [])]],
                body: sortedTransactions.map(r => [
                    format(new Date(`${r.expense_date}T00:00:00`), "dd MMM yyyy"),
                    r.item_name,
                    r.quantity,
                    (r.price_cents / 100).toFixed(2),
                    ...(isAdmin ? [r.submitted_by && namesById[r.submitted_by] ? namesById[r.submitted_by] : "-"] : []),
                ]),
                headStyles: { fillColor: [39, 39, 42] },
            });

            const fileLabel = overviewPeriodLabel.replace(/[^a-z0-9]+/gi, "_");
            doc.save(`expenses_report_${fileLabel}.pdf`);
        } finally {
            setExportingPdf(false);
        }
    }

    return (
        <div className="min-h-screen bg-neutral-50/50 pb-20 md:pb-10">
            <div className={`mx-auto p-4 md:p-6 space-y-6 ${activeTab === "overview" && isAdmin ? "max-w-6xl" : "max-w-md"}`}>
                {/* Header */}
                <div className="space-y-4">
                    <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors text-sm font-medium">
                        <ChevronLeft size={16} />
                        Back Home
                    </Link>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                                <Receipt size={22} className="text-cyan-600" />
                                Daily Expenses
                            </h1>
                            <p className="text-zinc-500 text-sm">Track daily purchases and spends</p>
                        </div>

                        {isAdmin && (
                            <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 shadow-sm">
                                <button onClick={() => setDate(d => addDays(d, -1))} className="p-2 hover:bg-zinc-50 rounded-md text-zinc-600">
                                    <ChevronLeft size={18} />
                                </button>
                                <div className="px-2 text-sm font-semibold text-zinc-900 min-w-[90px] text-center">
                                    {isToday ? "Today" : format(date, "MMM dd")}
                                </div>
                                <button
                                    onClick={() => setDate(d => addDays(d, 1))}
                                    className="p-2 hover:bg-zinc-50 rounded-md text-zinc-600 disabled:opacity-30"
                                    disabled={isToday}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    {!isToday && (
                        <div className="bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-2">
                            <Calendar size={12} />
                            Viewing past entries: <strong>{format(date, "MMMM do, yyyy")}</strong>
                        </div>
                    )}
                </div>

                {/* Tabs — Spending Overview is admin-only */}
                {isAdmin && (
                    <div className={`flex p-1 bg-zinc-100 rounded-xl ${activeTab === "overview" ? "max-w-md" : ""}`}>
                        <button
                            onClick={() => setActiveTab("add")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === "add" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                            <ClipboardList size={16} className={activeTab === "add" ? "text-cyan-600" : "text-zinc-400"} />
                            Add Expense
                        </button>
                        <button
                            onClick={() => setActiveTab("overview")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === "overview" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                            <BarChart3 size={16} className={activeTab === "overview" ? "text-cyan-600" : "text-zinc-400"} />
                            Spending Overview
                        </button>
                    </div>
                )}

                {(activeTab === "add" || !isAdmin) && (
                    <>
                        {/* Total Cost */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">
                                    {isToday ? "Today's Total" : `Total for ${format(date, "MMM dd")}`}
                                </p>
                                <p className="text-2xl font-bold text-zinc-900">₹{(viewedDateTotalCents / 100).toFixed(2)}</p>
                            </div>
                            <p className="text-xs text-zinc-400 shrink-0">{expenses.length} {expenses.length === 1 ? "entry" : "entries"}</p>
                        </div>

                        {/* Add Entry */}
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 space-y-3">
                            <h2 className="font-semibold text-zinc-900">Add Expense</h2>

                            {priceList.filter(p => p.active).length > 0 && (
                                <div className="flex flex-wrap content-start gap-2 max-h-[76px] overflow-y-auto pb-1">
                                    <button
                                        onClick={() => selectFixedItem(null)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${!selectedFixedItem ? "bg-cyan-600 border-cyan-600 text-white" : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}
                                    >
                                        Custom
                                    </button>
                                    {priceList.filter(p => p.active).map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => selectFixedItem(item)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${selectedFixedItem?.id === item.id ? "bg-cyan-600 border-cyan-600 text-white" : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}
                                        >
                                            {item.item_name} · ₹{(item.price_cents / 100).toFixed(0)}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <Input
                                placeholder="Item name, e.g. Paper Plates"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                disabled={!!selectedFixedItem}
                            />
                            <div className="flex gap-3 items-start">
                                <div className="flex-1 space-y-1">
                                    <label className="text-xs font-medium text-zinc-500 flex items-center gap-1 h-4">
                                        Price (₹)
                                        {selectedFixedItem && <Lock size={10} className="text-zinc-400" />}
                                    </label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={selectedFixedItem ? ((selectedFixedItem.price_cents * (Number(quantity) || 1)) / 100).toFixed(2) : price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        disabled={!!selectedFixedItem}
                                    />
                                </div>
                                <div className="w-20 space-y-1">
                                    <label className="text-xs font-medium text-zinc-500 flex items-center h-4">Qty</label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                    />
                                </div>
                            </div>
                            <Button className="w-full gap-2" onClick={addExpense} disabled={saving}>
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                Add Expense
                            </Button>
                        </div>

                        {/* Entries List */}
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                            <div className="p-5 pb-3 flex items-center justify-between">
                                <h2 className="font-semibold text-zinc-900">
                                    {isToday ? "Today's Entries" : `Entries for ${format(date, "MMM dd")}`}
                                </h2>
                                {!isAdmin && (
                                    <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
                                        <Lock size={10} /> Locked after saving
                                    </span>
                                )}
                            </div>

                            {listLoading ? (
                                <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-zinc-300" /></div>
                            ) : expenses.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                                    <PackageSearch className="w-10 h-10 text-zinc-300 mb-2" />
                                    <p className="text-zinc-500 text-sm">No expenses added for this day</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-zinc-50">
                                    {expenses.map((row) => {
                                        const isEditing = editingId === row.id;
                                        return (
                                            <div key={row.id} className="px-5 py-3">
                                                {isEditing ? (
                                                    <div className="space-y-2">
                                                        <Input value={editItemName} onChange={(e) => setEditItemName(e.target.value)} />
                                                        <div className="flex gap-2">
                                                            <Input type="number" className="flex-1" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Price" />
                                                            <Input type="number" className="w-20" min={1} value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} placeholder="Qty" />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button size="sm" className="flex-1 gap-1" onClick={() => saveEdit(row)}>
                                                                <Check size={14} /> Save
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="gap-1" onClick={cancelEdit}>
                                                                <X size={14} /> Cancel
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-zinc-900 truncate">{row.item_name}</span>
                                                                {row.quantity > 1 && (
                                                                    <span className="text-[11px] text-zinc-400 shrink-0">×{row.quantity}</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] text-zinc-400">
                                                                {format(new Date(row.created_at), "h:mm a")}
                                                                {isAdmin && row.submitted_by && namesById[row.submitted_by] && (
                                                                    <> · {namesById[row.submitted_by]}</>
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="font-semibold text-zinc-900">₹{(row.price_cents / 100).toFixed(2)}</span>
                                                            {isAdmin && (
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={() => startEdit(row)} className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500">
                                                                        <Pencil size={14} />
                                                                    </button>
                                                                    <button onClick={() => deleteExpense(row)} className="p-1.5 rounded-md hover:bg-red-50 text-red-500">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === "overview" && isAdmin && (
                    <div className="space-y-6">
                        {/* Filters */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 overflow-x-auto flex-1">
                                    {scopeOptions.map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setOverviewScope(opt.id)}
                                            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${overviewScope === opt.id ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setShowPriceManager(v => !v)}
                                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors shrink-0 ${showPriceManager ? "bg-cyan-600 border-cyan-600 text-white" : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}
                                >
                                    <Tag size={14} />
                                    Price List
                                </button>
                                <Button onClick={exportOverviewPdf} variant="outline" size="sm" className="gap-2 shrink-0" disabled={exportingPdf}>
                                    {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                    {exportingPdf ? "Generating…" : "Export"}
                                </Button>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                {showsNav && (
                                    <div className="flex items-center justify-between sm:justify-start gap-2 bg-zinc-50 border border-zinc-200 rounded-xl p-1 shrink-0">
                                        <button onClick={prevOverviewPeriod} className="p-2 hover:bg-white rounded-lg text-zinc-600">
                                            <ChevronLeft size={18} />
                                        </button>
                                        <div className="text-sm font-semibold text-zinc-900 text-center px-2 min-w-[140px]">
                                            {overviewPeriodLabel}
                                        </div>
                                        <button onClick={nextOverviewPeriod} className="p-2 hover:bg-white rounded-lg text-zinc-600">
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                )}

                                {overviewScope === "custom" && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Input type="date" className="w-auto" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                                        <span className="text-zinc-400 text-sm">to</span>
                                        <Input type="date" className="w-auto" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                                    </div>
                                )}

                                <div className="relative flex-1 min-w-[200px]">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                    <Input
                                        placeholder="Search item name..."
                                        className="pl-9"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {showPriceManager && (
                            <FixedPriceManager
                                items={priceList}
                                onAdd={addPriceItem}
                                onUpdatePrice={updatePriceItemPrice}
                                onToggleActive={togglePriceItemActive}
                                onDelete={deletePriceItem}
                            />
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Total Spent</p>
                                <p className="text-2xl font-bold text-zinc-900 mt-1">₹{(overviewTotalCents / 100).toFixed(2)}</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Entries</p>
                                <p className="text-2xl font-bold text-zinc-900 mt-1">{overviewRows.length}</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Distinct Items</p>
                                <p className="text-2xl font-bold text-zinc-900 mt-1">{distinctItemCount}</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Avg / Entry</p>
                                <p className="text-2xl font-bold text-zinc-900 mt-1">₹{(avgPerEntryCents / 100).toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Biggest leak insight */}
                        {biggestLeak && (
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/70 rounded-2xl p-4 sm:p-5 flex items-center gap-4">
                                <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                    <Flame size={20} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Biggest Expense Leak</p>
                                    <p className="text-sm text-zinc-700 mt-0.5">
                                        <span className="font-bold text-zinc-900 capitalize">{biggestLeak.name}</span> cost{" "}
                                        <span className="font-bold text-zinc-900">₹{(biggestLeak.cents / 100).toFixed(2)}</span> — that&apos;s{" "}
                                        <span className="font-bold text-amber-700">{biggestLeakPercent.toFixed(0)}%</span> of total spend this period.
                                    </p>
                                    <div className="w-full h-1.5 bg-amber-100 rounded-full mt-2 overflow-hidden">
                                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(biggestLeakPercent, 100)}%` }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Chart */}
                        <div ref={trendChartRef} className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 h-[320px]">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="font-semibold text-zinc-900">Spending Trend</h2>
                                <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
                                    <button
                                        onClick={() => setTrendChartType("bar")}
                                        className={`p-1.5 rounded-md transition-colors ${trendChartType === "bar" ? "bg-white shadow-sm text-cyan-600" : "text-zinc-400 hover:text-zinc-600"}`}
                                        title="Bar chart"
                                    >
                                        <BarChart3 size={14} />
                                    </button>
                                    <button
                                        onClick={() => setTrendChartType("line")}
                                        className={`p-1.5 rounded-md transition-colors ${trendChartType === "line" ? "bg-white shadow-sm text-cyan-600" : "text-zinc-400 hover:text-zinc-600"}`}
                                        title="Line chart"
                                    >
                                        <LineChartIcon size={14} />
                                    </button>
                                    <button
                                        onClick={() => setTrendChartType("area")}
                                        className={`p-1.5 rounded-md transition-colors ${trendChartType === "area" ? "bg-white shadow-sm text-cyan-600" : "text-zinc-400 hover:text-zinc-600"}`}
                                        title="Area chart"
                                    >
                                        <AreaChartIcon size={14} />
                                    </button>
                                </div>
                            </div>
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="85%">
                                    {trendChartType === "bar" ? (
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E5" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                cursor={{ fill: '#F4F4F5' }}
                                                formatter={(v: number | undefined) => [`₹${(v ?? 0).toFixed(2)}`, "Spent"]}
                                            />
                                            <Bar dataKey="Amount" fill="#0891B2" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    ) : trendChartType === "line" ? (
                                        <LineChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E5" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(v: number | undefined) => [`₹${(v ?? 0).toFixed(2)}`, "Spent"]}
                                            />
                                            <Line type="monotone" dataKey="Amount" stroke="#0891B2" strokeWidth={2.5} dot={{ r: 3, fill: "#0891B2" }} activeDot={{ r: 5 }} />
                                        </LineChart>
                                    ) : (
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient id="expenseAreaFill" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#0891B2" stopOpacity={0.35} />
                                                    <stop offset="95%" stopColor="#0891B2" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E5" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(v: number | undefined) => [`₹${(v ?? 0).toFixed(2)}`, "Spent"]}
                                            />
                                            <Area type="monotone" dataKey="Amount" stroke="#0891B2" strokeWidth={2.5} fill="url(#expenseAreaFill)" />
                                        </AreaChart>
                                    )}
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-zinc-400 text-sm">No data for this period</div>
                            )}
                        </div>

                        {/* Leak analysis: top spend sources, quantity purchased, share of wallet */}
                        <div ref={leakChartsRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 h-[300px] flex flex-col">
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp size={15} className="text-red-500" />
                                    <h2 className="font-semibold text-zinc-900 text-sm">Top Expense Leaks</h2>
                                </div>
                                <p className="text-[11px] text-zinc-400 mb-2">Where the money is really going</p>
                                {topLeakItems.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topLeakItems} layout="vertical" margin={{ left: 8, right: 16 }}>
                                            <XAxis type="number" hide />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                width={90}
                                                tick={{ fill: '#52525B', fontSize: 11 }}
                                                tickFormatter={(v: string) => v.length > 12 ? `${v.slice(0, 12)}…` : v}
                                            />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                cursor={{ fill: '#F4F4F5' }}
                                                formatter={(v: number | undefined, _n, item: any) => [`₹${(v ?? 0).toFixed(2)} (${item?.payload?.percent?.toFixed(0)}%)`, "Spent"]}
                                            />
                                            <Bar dataKey="Amount" radius={[0, 4, 4, 0]}>
                                                {topLeakItems.map((_, idx) => (
                                                    <Cell key={idx} fill={idx === 0 ? "#DC2626" : "#F97316"} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">No data</div>
                                )}
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 h-[300px] flex flex-col">
                                <div className="flex items-center gap-2 mb-1">
                                    <PieChartIcon size={15} className="text-cyan-600" />
                                    <h2 className="font-semibold text-zinc-900 text-sm">Spend Distribution</h2>
                                </div>
                                <p className="text-[11px] text-zinc-400 mb-2">Share of total spend by item</p>
                                {pieData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius="45%"
                                                outerRadius="75%"
                                                paddingAngle={2}
                                            >
                                                {pieData.map((_, idx) => (
                                                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(v: number | undefined, name: string | undefined) => [`₹${(v ?? 0).toFixed(2)}`, name ?? ""]}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={36}
                                                iconSize={8}
                                                wrapperStyle={{ fontSize: 11, color: '#71717A' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">No data</div>
                                )}
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 h-[300px] flex flex-col">
                                <div className="flex items-center gap-2 mb-1">
                                    <PackageSearch size={15} className="text-violet-600" />
                                    <h2 className="font-semibold text-zinc-900 text-sm">Most Purchased</h2>
                                </div>
                                <p className="text-[11px] text-zinc-400 mb-2">Highest quantity items bought</p>
                                {topQuantityItems.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topQuantityItems} layout="vertical" margin={{ left: 8, right: 16 }}>
                                            <XAxis type="number" hide allowDecimals={false} />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                width={90}
                                                tick={{ fill: '#52525B', fontSize: 11 }}
                                                tickFormatter={(v: string) => v.length > 12 ? `${v.slice(0, 12)}…` : v}
                                            />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                cursor={{ fill: '#F4F4F5' }}
                                                formatter={(v: number | undefined) => [`${v} units`, "Purchased"]}
                                            />
                                            <Bar dataKey="Qty" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">No data</div>
                                )}
                            </div>
                        </div>

                        {/* Price Watch: catches items whose unit price has crept up over time, even if it's since come back down */}
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                            <div className="p-5 pb-3 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                                    <TrendingUp size={16} />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-zinc-900">Price Watch</h2>
                                    <p className="text-xs text-zinc-400">Full price history per item — every increase is tracked, even ones that later came back down</p>
                                </div>
                            </div>

                            {priceTimelines.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                                    <Check className="w-8 h-8 text-emerald-400 mb-2" />
                                    <p className="text-zinc-500 text-sm">No price increases detected — prices look stable</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-zinc-50 max-h-[380px] overflow-y-auto">
                                    {priceTimelines.map((t) => {
                                        const isExpanded = expandedPriceItems.has(t.key);
                                        const isAtPeak = t.currentCents >= t.peakCents;
                                        const peakPercent = t.firstCents > 0 ? ((t.peakCents - t.firstCents) / t.firstCents) * 100 : 0;
                                        return (
                                            <div key={t.key} className="px-5 py-3">
                                                <button onClick={() => togglePriceItem(t.key)} className="w-full flex items-center justify-between gap-3 text-left">
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-zinc-900 truncate capitalize">{t.name}</p>
                                                        <p className="text-[11px] text-zinc-400 mt-0.5">
                                                            Now ₹{(t.currentCents / 100).toFixed(2)}
                                                            {!isAtPeak && (
                                                                <> · peaked at ₹{(t.peakCents / 100).toFixed(2)} on {format(new Date(`${t.peakDate}T00:00:00`), "d MMM yyyy")}</>
                                                            )}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isAtPeak ? "text-rose-600 bg-rose-50" : "text-amber-600 bg-amber-50"}`}>
                                                            +{peakPercent.toFixed(0)}% peak
                                                        </span>
                                                        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className="mt-2.5 pl-3 border-l-2 border-zinc-100 space-y-1.5">
                                                        {t.changes.map((c, idx) => (
                                                            <div key={idx} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                                                {c.percent > 0
                                                                    ? <TrendingUp size={11} className="text-rose-500 shrink-0" />
                                                                    : <TrendingDown size={11} className="text-emerald-500 shrink-0" />}
                                                                <span>{format(new Date(`${c.date}T00:00:00`), "d MMM yyyy")}</span>
                                                                <span className="text-zinc-300">·</span>
                                                                <span>₹{(c.fromCents / 100).toFixed(2)}</span>
                                                                <ArrowRight size={9} />
                                                                <span className="font-semibold text-zinc-700">₹{(c.toCents / 100).toFixed(2)}</span>
                                                                <span className={c.percent > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>
                                                                    ({c.percent > 0 ? "+" : ""}{c.percent.toFixed(0)}%)
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Breakdown + Transactions */}
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                            {/* Item-wise Breakdown */}
                            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden h-fit">
                                <div className="p-5 pb-3">
                                    <h2 className="font-semibold text-zinc-900">Item-wise Breakdown</h2>
                                    <p className="text-xs text-zinc-400 mt-0.5">How many of each thing was bought, and for how much</p>
                                </div>

                                {overviewItemSummary.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                                        <PackageSearch className="w-10 h-10 text-zinc-300 mb-2" />
                                        <p className="text-zinc-500 text-sm">No expenses recorded for this period</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-zinc-50 max-h-[420px] overflow-y-auto">
                                        {overviewItemSummary.map((item, idx) => (
                                            <div key={idx} className="px-5 py-3 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="font-medium text-zinc-900 truncate capitalize">{item.name}</p>
                                                    <p className="text-[11px] text-zinc-400">Qty: {item.quantity}</p>
                                                </div>
                                                <span className="font-semibold text-zinc-900 shrink-0">₹{(item.cents / 100).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Transactions Table */}
                            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                                <div className="p-5 pb-3 flex items-center justify-between">
                                    <h2 className="font-semibold text-zinc-900">All Transactions</h2>
                                    <div className="flex items-center gap-1 text-xs">
                                        <button onClick={() => toggleSort("date")} className={`flex items-center gap-1 px-2 py-1 rounded-md ${sortKey === "date" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400"}`}>
                                            Date <ArrowUpDown size={12} />
                                        </button>
                                        <button onClick={() => toggleSort("amount")} className={`flex items-center gap-1 px-2 py-1 rounded-md ${sortKey === "amount" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400"}`}>
                                            Amount <ArrowUpDown size={12} />
                                        </button>
                                    </div>
                                </div>

                                {sortedTransactions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                                        <PackageSearch className="w-10 h-10 text-zinc-300 mb-2" />
                                        <p className="text-zinc-500 text-sm">No transactions match these filters</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-zinc-50 border-b border-zinc-100 text-zinc-500 sticky top-0">
                                                <tr>
                                                    <th className="px-5 py-2.5 font-medium">Date</th>
                                                    <th className="px-5 py-2.5 font-medium">Item</th>
                                                    <th className="px-5 py-2.5 font-medium">Qty</th>
                                                    <th className="px-5 py-2.5 font-medium">Amount</th>
                                                    {isAdmin && <th className="px-5 py-2.5 font-medium">Added By</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-50">
                                                {sortedTransactions.map(row => (
                                                    <tr key={row.id} className="hover:bg-zinc-50/50">
                                                        <td className="px-5 py-3 whitespace-nowrap text-zinc-600">{format(new Date(`${row.expense_date}T00:00:00`), "d MMM yyyy")}</td>
                                                        <td className="px-5 py-3 font-medium text-zinc-900">{row.item_name}</td>
                                                        <td className="px-5 py-3 text-zinc-600">{row.quantity}</td>
                                                        <td className="px-5 py-3 font-semibold text-zinc-900 whitespace-nowrap">₹{(row.price_cents / 100).toFixed(2)}</td>
                                                        {isAdmin && (
                                                            <td className="px-5 py-3 text-zinc-500 whitespace-nowrap">
                                                                {row.submitted_by && namesById[row.submitted_by] ? namesById[row.submitted_by] : "-"}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

