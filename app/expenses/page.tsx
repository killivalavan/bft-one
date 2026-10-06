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
    LineChart as LineChartIcon, AreaChart as AreaChartIcon, PieChart as PieChartIcon,
    Wallet, Building2, CheckCircle2, Power, Zap, AlertCircle, ArrowUpRight, ArrowDownRight,
    History, Info, Filter, SlidersHorizontal, RefreshCw, ShieldCheck, Users
} from "lucide-react";
import {
    format, addDays, isSameDay, addWeeks, addMonths, addYears,
    startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay
} from "date-fns";
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { FixedPriceManager, FixedPriceItem } from "@/components/expenses/FixedPriceManager";
import { ExpenseAIAgent } from "@/components/expenses/ExpenseAIAgent";
import { calculateDailyRecurringProjections, DailyRecurringProjectedItem } from "@/lib/ai/expense-agent";
import { Tag, Sparkles, Bot, Layers } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";
import { useTenant } from "@/lib/context/TenantContext";
import { SyncStatusBadge } from "@/components/offline/SyncStatusBadge";
import {
    STORES,
    getItemsByTenant,
    putItem,
    bulkPutItems,
    deleteItem as idbDeleteItem,
    LocalDailyExpense,
} from "@/lib/offline/db";
import { enqueueSyncOperation } from "@/lib/offline/syncEngine";

interface ExpenseRow {
    id: string;
    expense_date: string;
    item_name: string;
    quantity: number;
    price_cents: number;
    submitted_by: string | null;
    created_at: string;
}

interface MonthlyExpenseRow {
    id: string;
    expense_month?: string | null;
    category: string;
    item_name: string;
    amount_cents: number;
    previous_amount_cents?: number | null;
    is_active?: boolean;
    notes: string | null;
    submitted_by: string | null;
    created_at: string;
    updated_at?: string | null;
}

const MONTHLY_CATEGORIES = [
    "Rent", "Salary", "Electricity", "Water", "Internet",
    "Insurance", "Maintenance", "Transport", "Marketing", "Other"
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Rent: { bg: "bg-[#EFF6FF]", text: "text-[#1E40AF]", border: "border-[#BFDBFE]" },
    Salary: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" },
    Electricity: { bg: "bg-[#FFFBEB]", text: "text-[#B45309]", border: "border-[#FDE68A]" },
    Water: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" },
    Internet: { bg: "bg-[#EFF6FF]", text: "text-[#1E40AF]", border: "border-[#BFDBFE]" },
    Insurance: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" },
    Maintenance: { bg: "bg-[#FFFBEB]", text: "text-[#B45309]", border: "border-[#FDE68A]" },
    Transport: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" },
    Marketing: { bg: "bg-[#F5F3FF]", text: "text-[#6D28D9]", border: "border-[#DDD6FE]" },
    Other: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" },
};

const CATEGORY_PRESETS: Record<string, string[]> = {
    Rent: ["Shop Rent", "Warehouse Rent", "Office Rent", "Equipment Lease"],
    Salary: ["Staff Salary", "Manager Salary", "Chef / Cook Salary", "Helper / Cleaner Salary", "Security Salary"],
    Electricity: ["EB Bill - Shop Meter", "EB Bill - Commercial Meter", "Generator Diesel / Fuel"],
    Water: ["Water Can Delivery", "Municipal Water Tax", "Tanker Water Supply"],
    Internet: ["Broadband / Fiber", "POS SIM Recharge", "Cloud / Software Subscriptions"],
    Insurance: ["Shop Insurance Policy", "Staff Health Cover", "Fire & Burglary Insurance"],
    Maintenance: ["AC Servicing & Gas", "Plumbing & Electrical Repair", "Pest Control Treatment", "Equipment AMC"],
    Transport: ["Goods Delivery / Auto Freight", "Staff Travel Allowance", "Vehicle Fuel"],
    Marketing: ["Flyers & Pamphlet Printing", "Local Social Media Ads", "Flex / Store Signboard"],
    Other: ["Trade License & Taxes", "Waste Disposal & Cleaning", "Chartered Accountant Fee"],
};

function numberToWords(amount: number | string): string {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num) || num <= 0) return "";

    const ones = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"
    ];
    const tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ];

    function convertTwoDigits(n: number): string {
        if (n < 20) return ones[n];
        const t = tens[Math.floor(n / 10)];
        const o = ones[n % 10];
        return o ? `${t}-${o}` : t;
    }

    function convertThreeDigits(n: number): string {
        const h = Math.floor(n / 100);
        const rem = n % 100;
        let str = "";
        if (h > 0) str += `${ones[h]} Hundred`;
        if (rem > 0) {
            str += str ? ` and ${convertTwoDigits(rem)}` : convertTwoDigits(rem);
        }
        return str;
    }

    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);

    if (integerPart === 0 && decimalPart === 0) return "";

    let words = "";
    const crore = Math.floor(integerPart / 10000000);
    const lakh = Math.floor((integerPart % 10000000) / 100000);
    const thousand = Math.floor((integerPart % 100000) / 1000);
    const remainder = integerPart % 1000;

    if (crore > 0) {
        words += `${crore > 99 ? convertThreeDigits(crore) : convertTwoDigits(crore)} Crore `;
    }
    if (lakh > 0) {
        words += `${lakh > 99 ? convertThreeDigits(lakh) : convertTwoDigits(lakh)} Lakh `;
    }
    if (thousand > 0) {
        words += `${convertTwoDigits(thousand)} Thousand `;
    }
    if (remainder > 0) {
        words += `${convertThreeDigits(remainder)} `;
    }

    words = words.trim();
    if (!words && integerPart > 0) words = "Zero";

    const rupeeStr = integerPart === 1 ? "Rupee" : "Rupees";
    let finalStr = words ? `${words} ${rupeeStr}` : "";

    if (decimalPart > 0) {
        const paiseWords = convertTwoDigits(decimalPart);
        if (finalStr) {
            finalStr += ` and ${paiseWords} Paise`;
        } else {
            finalStr = `${paiseWords} Paise`;
        }
    }

    return finalStr ? `${finalStr} only` : "";
}

export default function ExpensesPage() {
    const { toast } = useToast();
    const { business } = useTenant();
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

    // Tabs: daily expense, monthly expense, overview, AI Advisor
    const [activeTab, setActiveTab] = useState<"add" | "monthly" | "overview" | "ai-advisor">("add");

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

    // Fixed Monthly Expenses (recurring master list, updated only when prices change)
    const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpenseRow[]>([]);
    const [totalSalaryStructureCents, setTotalSalaryStructureCents] = useState<number>(0);
    const [monthlyCategory, setMonthlyCategory] = useState(MONTHLY_CATEGORIES[0]);
    const [monthlyItemName, setMonthlyItemName] = useState("");
    const [monthlyAmount, setMonthlyAmount] = useState("");
    const [monthlyNotes, setMonthlyNotes] = useState("");
    const [monthlySaving, setMonthlySaving] = useState(false);
    const [monthlySearchQuery, setMonthlySearchQuery] = useState("");
    const [monthlyCategoryFilter, setMonthlyCategoryFilter] = useState<string>("all");
    const [monthlyEditingId, setMonthlyEditingId] = useState<string | null>(null);
    const [monthlyEditCategory, setMonthlyEditCategory] = useState("");
    const [monthlyEditItemName, setMonthlyEditItemName] = useState("");
    const [monthlyEditAmount, setMonthlyEditAmount] = useState("");
    const [monthlyEditNotes, setMonthlyEditNotes] = useState("");
    const [aiRecurrenceFilter, setAiRecurrenceFilter] = useState<"all" | "daily" | "frequent">("all");

    useEffect(() => {
        checkUser();
    }, []);

    // Support deep-linking straight into Spending Overview or AI Advisor tab
    useEffect(() => {
        const tabParam = new URLSearchParams(window.location.search).get("tab");
        if (tabParam === "overview" || tabParam === "ai-advisor" || tabParam === "monthly") {
            setActiveTab(tabParam as "overview" | "ai-advisor" | "monthly");
        }
    }, []);

    useEffect(() => {
        fetchPriceList();
    }, [business?.id]);

    useEffect(() => {
        if (userId) fetchExpenses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, userId, business?.id]);

    useEffect(() => {
        if (userId && isAdmin) fetchAllExpenses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, isAdmin, business?.id]);

    useEffect(() => {
        if (userId) fetchMonthlyExpenses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, business?.id]);

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
        const bizId = business?.id || "default";

        // 1. Instant Warm Start from IndexedDB
        try {
            const localExpenses = await getItemsByTenant<LocalDailyExpense>(STORES.daily_expenses, bizId);
            const dateFiltered = localExpenses.filter((e) => e.expense_date === dateStr);
            if (dateFiltered.length > 0) {
                setExpenses(dateFiltered as ExpenseRow[]);
                if (isAdmin) loadNames(dateFiltered as ExpenseRow[]);
            }
        } catch {}

        // 2. Cloud Refresh if online
        try {
            let query = supabaseClient
                .from("daily_expenses")
                .select("*")
                .eq("expense_date", dateStr);
            if (business?.id) query = query.eq("business_id", business.id);
            const { data, error } = await query.order("created_at", { ascending: true });

            if (error) {
                if (typeof navigator !== "undefined" && !navigator.onLine) {
                    // Silent fallback when offline
                } else {
                    toast({ title: "Failed to load expenses", description: error.message, variant: "error" });
                }
            } else {
                const rows = (data || []) as ExpenseRow[];
                setExpenses(rows);
                if (isAdmin) loadNames(rows);

                // Save to local IndexedDB
                const localRows: LocalDailyExpense[] = rows.map((r) => ({
                    id: r.id,
                    business_id: bizId,
                    expense_date: r.expense_date,
                    item_name: r.item_name,
                    quantity: r.quantity,
                    price_cents: r.price_cents,
                    submitted_by: r.submitted_by,
                    created_at: r.created_at,
                }));
                bulkPutItems(STORES.daily_expenses, localRows).catch(() => {});
            }
        } catch {
            // Offline fallback
        } finally {
            setListLoading(false);
        }
    }

    async function fetchAllExpenses() {
        if (!isAdmin) return; // overview/price-watch data is admin-only
        const bizId = business?.id || "default";

        try {
            const localExpenses = await getItemsByTenant<LocalDailyExpense>(STORES.daily_expenses, bizId);
            if (localExpenses.length > 0) {
                setAllExpenses(localExpenses as ExpenseRow[]);
                if (isAdmin) loadNames(localExpenses as ExpenseRow[]);
            }
        } catch {}

        try {
            let query = supabaseClient
                .from("daily_expenses")
                .select("*");
            if (business?.id) query = query.eq("business_id", business.id);
            const { data, error } = await query.order("expense_date", { ascending: true });

            if (!error) {
                const rows = (data || []) as ExpenseRow[];
                setAllExpenses(rows);
                if (isAdmin) loadNames(rows);

                const localRows: LocalDailyExpense[] = rows.map((r) => ({
                    id: r.id,
                    business_id: bizId,
                    expense_date: r.expense_date,
                    item_name: r.item_name,
                    quantity: r.quantity,
                    price_cents: r.price_cents,
                    submitted_by: r.submitted_by,
                    created_at: r.created_at,
                }));
                bulkPutItems(STORES.daily_expenses, localRows).catch(() => {});
            }
        } catch {}
    }

    // Fixed Monthly Expenses (recurring master list, applies across all months)
    async function fetchMonthlyExpenses() {
        // 1. Fetch current staff salary structure from Users & Roles
        let profQuery = supabaseClient
            .from("profiles")
            .select("id, email, is_admin, base_salary_cents, fixed_allowance_cents");
        if (business?.id) profQuery = profQuery.eq("business_id", business.id);
        const { data: profs } = await profQuery;

        let totalSalaryStruct = 0;
        let staffCount = 0;
        (profs || []).forEach((p: any) => {
            if (p.is_admin || p.email?.toLowerCase().includes("admin")) return;
            const base = Number(p.base_salary_cents || 0);
            const allowance = Number(p.fixed_allowance_cents || 0);
            totalSalaryStruct += (base + allowance);
            staffCount++;
        });
        setTotalSalaryStructureCents(totalSalaryStruct);

        // 2. Fetch fixed monthly expenses
        let query = supabaseClient
            .from("monthly_expenses")
            .select("*");
        if (business?.id) query = query.eq("business_id", business.id);
        const { data, error } = await query.order("created_at", { ascending: true });
        if (!error) {
            let rows = (data || []) as MonthlyExpenseRow[];

            // 3. Find existing Salary overhead entry
            const salaryEntry = rows.find(
                r => r.category === "Salary" || r.item_name.toLowerCase().includes("salary")
            );

            if (!salaryEntry && totalSalaryStruct > 0 && userId) {
                // Auto-create initial Staff Salary fixed overhead
                const { data: inserted, error: insertErr } = await supabaseClient
                    .from("monthly_expenses")
                    .insert({
                        category: "Salary",
                        item_name: "Staff Salary",
                        amount_cents: totalSalaryStruct,
                        is_active: true,
                        notes: `Auto-initialized from ${staffCount} employee salary structure in Users & Roles`,
                        submitted_by: userId,
                        business_id: business?.id,
                    })
                    .select()
                    .single();

                if (!insertErr && inserted) {
                    rows = [...rows, inserted as MonthlyExpenseRow];
                }
            } else if (salaryEntry && totalSalaryStruct > 0 && salaryEntry.amount_cents !== totalSalaryStruct) {
                // Auto-update to latest structure (when new employees are added, removed, or base salaries updated)
                const prevAmt = salaryEntry.amount_cents;
                await supabaseClient
                    .from("monthly_expenses")
                    .update({
                        amount_cents: totalSalaryStruct,
                        previous_amount_cents: prevAmt,
                        notes: `Auto-updated from ${staffCount} employee salary structure in Users & Roles`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", salaryEntry.id);

                rows = rows.map(r => r.id === salaryEntry.id ? {
                    ...r,
                    amount_cents: totalSalaryStruct,
                    previous_amount_cents: prevAmt,
                    notes: `Auto-updated from ${staffCount} employee salary structure in Users & Roles`,
                    updated_at: new Date().toISOString(),
                } : r);
            }

            setMonthlyExpenses(rows);
        }
    }

    async function addMonthlyExpense() {
        const trimmedName = monthlyItemName.trim();
        if (!trimmedName) { toast({ title: "Enter item name", variant: "error" }); return; }
        const amtNum = Number(monthlyAmount);
        if (!monthlyAmount || isNaN(amtNum) || amtNum <= 0) {
            toast({ title: "Invalid amount", variant: "error" }); return;
        }

        // Auto-assign category from item name
        const lower = trimmedName.toLowerCase();
        let cat = "Other";
        if (lower.includes("rent") || lower.includes("lease") || lower.includes("building")) cat = "Rent";
        else if (lower.includes("salary") || lower.includes("wages") || lower.includes("staff") || lower.includes("payroll")) cat = "Salary";
        else if (lower.includes("eb") || lower.includes("electric") || lower.includes("power") || lower.includes("current")) cat = "Electricity";
        else if (lower.includes("internet") || lower.includes("wifi") || lower.includes("broadband") || lower.includes("phone")) cat = "Internet";
        else if (lower.includes("water") || lower.includes("can")) cat = "Water";
        else if (lower.includes("maint") || lower.includes("repair") || lower.includes("cleaning") || lower.includes("service")) cat = "Maintenance";
        else if (lower.includes("software") || lower.includes("pos") || lower.includes("subs") || lower.includes("app")) cat = "Software";
        else if (lower.includes("gas") || lower.includes("cylinder") || lower.includes("fuel") || lower.includes("transport")) cat = "Transport";

        setMonthlySaving(true);
        const { error } = await supabaseClient.from("monthly_expenses").insert({
            category: cat,
            item_name: trimmedName,
            amount_cents: Math.round(amtNum * 100),
            is_active: true,
            notes: monthlyNotes.trim() || null,
            submitted_by: userId,
            business_id: business?.id,
        });
        setMonthlySaving(false);

        if (error) {
            toast({ title: "Failed to add", description: error.message, variant: "error" }); return;
        }
        toast({ title: "Fixed monthly expense added", description: "Will be included across all monthly overviews", variant: "success" });
        setMonthlyItemName(""); setMonthlyAmount(""); setMonthlyNotes("");
        fetchMonthlyExpenses();
    }

    function startMonthlyEdit(row: MonthlyExpenseRow) {
        setMonthlyEditingId(row.id);
        setMonthlyEditCategory(row.category);
        setMonthlyEditItemName(row.item_name);
        setMonthlyEditAmount((row.amount_cents / 100).toString());
        setMonthlyEditNotes(row.notes || "");
    }

    function cancelMonthlyEdit() { setMonthlyEditingId(null); }

    async function saveMonthlyEdit(row: MonthlyExpenseRow) {
        const trimmedName = monthlyEditItemName.trim();
        const amtNum = Number(monthlyEditAmount);
        if (!trimmedName || isNaN(amtNum) || amtNum <= 0) {
            toast({ title: "Invalid entry", variant: "error" }); return;
        }

        const newAmountCents = Math.round(amtNum * 100);
        const priceChanged = newAmountCents !== row.amount_cents;

        const { error } = await supabaseClient.from("monthly_expenses").update({
            category: monthlyEditCategory,
            item_name: trimmedName,
            amount_cents: newAmountCents,
            previous_amount_cents: priceChanged ? row.amount_cents : row.previous_amount_cents,
            notes: monthlyEditNotes.trim() || null,
            updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        if (error) {
            toast({ title: "Failed to update", description: error.message, variant: "error" }); return;
        }
        toast({
            title: priceChanged ? "Fixed expense price updated" : "Updated",
            description: priceChanged ? `Updated to ₹${amtNum.toFixed(2)}/mo` : undefined,
            variant: "success"
        });
        setMonthlyEditingId(null);
        fetchMonthlyExpenses();
    }

    async function toggleMonthlyActive(row: MonthlyExpenseRow) {
        const nextActive = row.is_active === false ? true : false;
        const { error } = await supabaseClient.from("monthly_expenses").update({
            is_active: nextActive,
            updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        if (error) {
            toast({ title: "Failed to update status", description: error.message, variant: "error" }); return;
        }
        toast({ title: nextActive ? "Overhead enabled" : "Overhead paused", variant: "success" });
        fetchMonthlyExpenses();
    }

    async function deleteMonthlyExpense(row: MonthlyExpenseRow) {
        if (!confirm(`Delete fixed monthly overhead "${row.item_name}"?`)) return;
        const { error } = await supabaseClient.from("monthly_expenses").delete().eq("id", row.id);
        if (error) {
            toast({ title: "Failed to delete", description: error.message, variant: "error" }); return;
        }
        toast({ title: "Deleted", variant: "success" });
        fetchMonthlyExpenses();
    }

    async function addAiItemToMonthlyOverheads(item: DailyRecurringProjectedItem) {
        const existing = monthlyExpenses.find(
            m => m.item_name.trim().toLowerCase() === item.itemName.trim().toLowerCase()
        );

        if (existing) {
            const priceChanged = existing.amount_cents !== item.projectedMonthlySpendCents;
            const { error } = await supabaseClient.from("monthly_expenses").update({
                amount_cents: item.projectedMonthlySpendCents,
                previous_amount_cents: priceChanged ? existing.amount_cents : existing.previous_amount_cents,
                notes: `Updated from daily demand of ${item.avgDailyQuantity.toFixed(1)} units/day (@ ₹${(item.avgUnitCostCents / 100).toFixed(2)}/unit)`,
                updated_at: new Date().toISOString(),
            }).eq("id", existing.id);

            if (error) {
                toast({ title: "Failed to update overhead", description: error.message, variant: "error" });
                return;
            }

            toast({
                title: `Updated "${item.itemName}" Fixed Budget`,
                description: `Synced to current run-rate of ₹${(item.projectedMonthlySpendCents / 100).toLocaleString("en-IN")}/mo`,
                variant: "success",
            });
            fetchMonthlyExpenses();
            return;
        }

        let cat = item.categorySuggestion;
        if (!MONTHLY_CATEGORIES.includes(cat)) {
            if (cat === "Water") cat = "Water";
            else if (cat.includes("Maintenance")) cat = "Maintenance";
            else if (cat.includes("Transport") || cat.includes("Fuel")) cat = "Transport";
            else cat = "Other";
        }

        const { error } = await supabaseClient.from("monthly_expenses").insert({
            category: cat,
            item_name: item.itemName,
            amount_cents: item.projectedMonthlySpendCents,
            is_active: true,
            notes: `Derived from daily demand of ${item.avgDailyQuantity.toFixed(1)} units/day (@ ₹${(item.avgUnitCostCents / 100).toFixed(2)}/unit)`,
            submitted_by: userId,
            business_id: business?.id,
        });

        if (error) {
            toast({ title: "Failed to add overhead", description: error.message, variant: "error" });
            return;
        }

        toast({
            title: `Added "${item.itemName}" to Fixed Overheads`,
            description: `Budgeted at ₹${(item.projectedMonthlySpendCents / 100).toLocaleString("en-IN")}/mo`,
            variant: "success",
        });
        fetchMonthlyExpenses();
    }

    async function removeAiItemFromMonthlyOverheads(item: DailyRecurringProjectedItem) {
        const existing = monthlyExpenses.find(
            m => m.item_name.trim().toLowerCase() === item.itemName.trim().toLowerCase()
        );
        if (!existing) return;
        if (!confirm(`Remove "${existing.item_name}" from Fixed Monthly Overheads?`)) return;

        const { error } = await supabaseClient.from("monthly_expenses").delete().eq("id", existing.id);
        if (error) {
            toast({ title: "Failed to remove overhead", description: error.message, variant: "error" });
            return;
        }

        toast({
            title: `Removed "${item.itemName}" from Fixed Overheads`,
            description: "Will no longer be tracked as a fixed master overhead",
            variant: "success",
        });
        fetchMonthlyExpenses();
    }

    async function fetchPriceList() {
        let query = supabaseClient
            .from("expense_price_list")
            .select("*");
        if (business?.id) query = query.eq("business_id", business.id);
        const { data, error } = await query.order("item_name", { ascending: true });

        if (!error) setPriceList((data || []) as FixedPriceItem[]);
    }

    async function addPriceItem(name: string, priceRupees: number) {
        const { error } = await supabaseClient.from("expense_price_list").insert({
            item_name: name,
            price_cents: Math.round(priceRupees * 100),
            updated_by: userId,
            business_id: business?.id,
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
        const bizId = business?.id || "default";
        const newExpenseId = crypto.randomUUID();
        const dateStr = format(date, "yyyy-MM-dd");

        const localExp: LocalDailyExpense = {
            id: newExpenseId,
            business_id: bizId,
            expense_date: dateStr,
            item_name: finalName,
            quantity: qtyNum,
            price_cents: finalPriceCents,
            submitted_by: userId,
            created_at: new Date().toISOString(),
        };

        // 1. Save locally to IndexedDB immediately
        await putItem<LocalDailyExpense>(STORES.daily_expenses, localExp);

        // 2. Optimistic UI update
        setExpenses((prev) => [...prev, localExp as ExpenseRow]);
        setAllExpenses((prev) => [...prev, localExp as ExpenseRow]);

        // 3. Enqueue idempotent synchronization operation
        await enqueueSyncOperation({
            businessId: bizId,
            tableName: "daily_expenses",
            action: "INSERT",
            payload: {
                id: localExp.id,
                expense_date: localExp.expense_date,
                item_name: localExp.item_name,
                quantity: localExp.quantity,
                price_cents: localExp.price_cents,
                submitted_by: localExp.submitted_by,
                business_id: localExp.business_id,
                created_at: localExp.created_at,
            },
            customId: newExpenseId,
        });

        setSaving(false);
        toast({ title: "Expense saved! 💰", description: "Saved locally and queued for automatic sync", variant: "success" });
        resetForm();
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

        const bizId = business?.id || "default";
        const updatedExp: LocalDailyExpense = {
            id: row.id,
            business_id: bizId,
            expense_date: row.expense_date,
            item_name: trimmedName,
            quantity: qtyNum,
            price_cents: Math.round(priceNum * 100),
            submitted_by: row.submitted_by,
            created_at: row.created_at,
        };

        // 1. Update IndexedDB immediately
        await putItem<LocalDailyExpense>(STORES.daily_expenses, updatedExp);

        // 2. Optimistic UI update
        setExpenses((prev) => prev.map((e) => (e.id === row.id ? (updatedExp as ExpenseRow) : e)));
        setAllExpenses((prev) => prev.map((e) => (e.id === row.id ? (updatedExp as ExpenseRow) : e)));

        // 3. Enqueue sync update
        await enqueueSyncOperation({
            businessId: bizId,
            tableName: "daily_expenses",
            action: "UPDATE",
            payload: {
                id: updatedExp.id,
                item_name: updatedExp.item_name,
                quantity: updatedExp.quantity,
                price_cents: updatedExp.price_cents,
                updated_by: userId,
                updated_at: new Date().toISOString(),
            },
            customId: `update-${updatedExp.id}-${Date.now()}`,
        });

        toast({ title: "Expense updated", variant: "success" });
        setEditingId(null);
    }

    async function deleteExpense(row: ExpenseRow) {
        if (!confirm(`Delete "${row.item_name}"?`)) return;

        const bizId = business?.id || "default";

        // 1. Delete from IndexedDB immediately
        await idbDeleteItem(STORES.daily_expenses, row.id);

        // 2. Optimistic UI update
        setExpenses((prev) => prev.filter((e) => e.id !== row.id));
        setAllExpenses((prev) => prev.filter((e) => e.id !== row.id));

        // 3. Enqueue sync delete
        await enqueueSyncOperation({
            businessId: bizId,
            tableName: "daily_expenses",
            action: "DELETE",
            payload: { id: row.id },
            customId: `delete-${row.id}-${Date.now()}`,
        });

        toast({ title: "Expense deleted", variant: "success" });
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

    // Active fixed recurring monthly expenses
    const activeMonthlyExpenses = monthlyExpenses.filter(m => m.is_active !== false);

    // Multiplier for recurring monthly overhead based on selected overview time frame
    const periodMonthlyMultiplier = (() => {
        switch (overviewScope) {
            case "today":
                return 1 / 30; // 1 day's share of monthly fixed overhead
            case "week":
                return 7 / 30; // 1 week's share of monthly fixed overhead
            case "month":
                return 1;      // 1 full month
            case "year":
                return 12;     // 1 full year
            case "all": {
                // Number of distinct calendar months with recorded daily expenses
                const monthsSet = new Set(allExpenses.map(e => e.expense_date.substring(0, 7)));
                return Math.max(1, monthsSet.size);
            }
            case "custom": {
                if (!overviewRange) return 1;
                const days = Math.max(1, Math.round((overviewRange.end.getTime() - overviewRange.start.getTime()) / (1000 * 60 * 60 * 24)));
                return days / 30.4;
            }
            default:
                return 1;
        }
    })();

    const searchTerm = searchQuery.trim().toLowerCase();
    const overviewRows = searchTerm
        ? rangedRows.filter(r => r.item_name.toLowerCase().includes(searchTerm))
        : rangedRows;

    const filteredMonthlyRows = searchTerm
        ? activeMonthlyExpenses.filter(r => r.item_name.toLowerCase().includes(searchTerm) || r.category.toLowerCase().includes(searchTerm))
        : activeMonthlyExpenses;

    const overviewDailyTotalCents = overviewRows.reduce((sum, r) => sum + r.price_cents, 0);
    const fixedMonthlyBaseTotalCents = filteredMonthlyRows.reduce((sum, r) => sum + r.amount_cents, 0);
    const overviewMonthlyTotalCents = Math.round(fixedMonthlyBaseTotalCents * periodMonthlyMultiplier);
    const overviewTotalCents = overviewDailyTotalCents + overviewMonthlyTotalCents;

    const overviewItemSummary = Object.values(
        overviewRows.reduce((acc, r) => {
            const key = r.item_name.trim().toLowerCase();
            if (!acc[key]) acc[key] = { name: r.item_name, quantity: 0, cents: 0, type: "daily" as const };
            acc[key].quantity += Number(r.quantity) || 0;
            acc[key].cents += r.price_cents;
            return acc;
        }, {} as Record<string, { name: string; quantity: number; cents: number; type: "daily" | "monthly" }>)
    ).sort((a, b) => b.cents - a.cents);

    // Monthly expense item summary for overview (scaled by time multiplier)
    const monthlyItemSummary = filteredMonthlyRows.map(r => ({
        name: r.item_name,
        category: r.category,
        quantity: 1,
        monthlyBaseCents: r.amount_cents,
        cents: Math.round(r.amount_cents * periodMonthlyMultiplier),
    })).sort((a, b) => b.cents - a.cents);

    const distinctItemCount = overviewItemSummary.length;
    const totalOverviewEntries = overviewRows.length + filteredMonthlyRows.length;
    const avgPerEntryCents = totalOverviewEntries > 0 ? overviewTotalCents / totalOverviewEntries : 0;

    // Chart grouping: by day for short ranges, by month across a year, by year for all-time
    const chartGroupBy: "day" | "month" | "year" =
        overviewScope === "year" ? "month" : overviewScope === "all" ? "year" : "day";
    const chartMap = new Map<string, number>();
    for (const r of overviewRows) {
        const d = new Date(`${r.expense_date}T00:00:00`);
        const key = chartGroupBy === "day" ? format(d, "MMM d") : chartGroupBy === "month" ? format(d, "MMM") : format(d, "yyyy");
        chartMap.set(key, (chartMap.get(key) || 0) + r.price_cents);
    }
    // If viewing year or multi-month, distribute fixed monthly overheads across months in trend chart
    if (chartGroupBy === "month") {
        for (const [key, cents] of chartMap.entries()) {
            chartMap.set(key, cents + fixedMonthlyBaseTotalCents);
        }
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

    const unifiedTransactions = [
        ...overviewRows.map(r => ({
            id: r.id,
            type: "daily" as const,
            date: r.expense_date,
            rawDate: new Date(r.created_at || `${r.expense_date}T00:00:00`),
            item_name: r.item_name,
            subtext: r.quantity > 1 ? `Qty: ${r.quantity}` : "Daily supply",
            amount_cents: r.price_cents,
            submitted_by: r.submitted_by,
            category: "Daily",
        })),
        ...filteredMonthlyRows.map(m => ({
            id: m.id,
            type: "monthly" as const,
            date: overviewRange ? format(overviewRange.start, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
            rawDate: new Date(m.created_at),
            item_name: m.item_name,
            subtext: m.notes ? `${m.category} · Fixed Overhead · ${m.notes}` : `${m.category} · Fixed Overhead`,
            amount_cents: Math.round(m.amount_cents * periodMonthlyMultiplier),
            submitted_by: m.submitted_by,
            category: m.category,
        })),
    ];

    const sortedTransactions = [...unifiedTransactions].sort((a, b) => {
        const diff = sortKey === "date"
            ? b.rawDate.getTime() - a.rawDate.getTime()
            : a.amount_cents - b.amount_cents;
        return sortDir === "asc" ? -diff : diff;
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
    const totalActiveMonthlyFixedCents = activeMonthlyExpenses.reduce((sum, r) => sum + r.amount_cents, 0);
    const activeMonthlyOverheadsCount = activeMonthlyExpenses.length;
    const pausedMonthlyOverheadsCount = monthlyExpenses.filter(r => r.is_active === false).length;

    // AI-calculated daily recurring demand projected across 30 days
    const aiDailyProjections = calculateDailyRecurringProjections(allExpenses);
    const grandTotalMonthlyOperationalCents = totalActiveMonthlyFixedCents + aiDailyProjections.totalProjectedMonthlyCents;
    const grandTotalDailyBurnCents = Math.round(totalActiveMonthlyFixedCents / 30.4) + aiDailyProjections.totalDailyBurnCents;
    const totalAiPotentialSavingsCents = aiDailyProjections.items.reduce((sum, i) => sum + i.suggestedSavingsCents, 0);

    const displayedAiItems = aiDailyProjections.items.filter(item => {
        if (aiRecurrenceFilter === "all") return true;
        return item.recurrenceLevel === aiRecurrenceFilter;
    });

    // Filtered monthly overheads list for the Monthly Hub tab
    const displayedMonthlyExpenses = monthlyExpenses.filter(row => {
        const matchesCat = monthlyCategoryFilter === "all" || row.category === monthlyCategoryFilter;
        const q = monthlySearchQuery.trim().toLowerCase();
        const matchesSearch = !q || row.item_name.toLowerCase().includes(q) || (row.notes && row.notes.toLowerCase().includes(q)) || row.category.toLowerCase().includes(q);
        return matchesCat && matchesSearch;
    });

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

            if (monthlyItemSummary.length > 0) {
                const currentY = (doc as any).lastAutoTable.finalY + 10;
                let myY = currentY;
                if (myY > 250) { doc.addPage(); myY = 20; }
                doc.setFontSize(13);
                doc.text("Monthly Fixed Overheads Breakdown", 14, myY);
                autoTable(doc, {
                    startY: myY + 4,
                    head: [["Category", "Item", "Total (Rs)"]],
                    body: monthlyItemSummary.map(i => [i.category, i.name, (i.cents / 100).toFixed(2)]),
                    headStyles: { fillColor: [124, 58, 237] },
                });
            }

            const afterItemsY = (doc as any).lastAutoTable.finalY + 10;
            let transY = afterItemsY;
            if (transY > 250) { doc.addPage(); transY = 20; }
            doc.setFontSize(13);
            doc.text("All Transactions (Daily & Monthly)", 14, transY);

            autoTable(doc, {
                startY: transY + 4,
                head: [["Date", "Type / Category", "Item", "Details", "Amount (Rs)", ...(isAdmin ? ["Added By"] : [])]],
                body: sortedTransactions.map(r => [
                    format(new Date(`${r.date}T00:00:00`), "dd MMM yyyy"),
                    r.category,
                    r.item_name,
                    r.subtext,
                    (r.amount_cents / 100).toFixed(2),
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
            <div className={`mx-auto p-4 md:p-6 space-y-6 ${isAdmin ? "max-w-6xl" : "max-w-md"}`}>
                {/* Header */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                                    <Receipt size={22} className="text-cyan-600" />
                                    Expenses
                                </h1>
                                <SyncStatusBadge />
                            </div>
                            <p className="text-zinc-500 text-sm">Track daily &amp; monthly expenses, analyze trends &amp; optimize costs</p>
                        </div>

                        {isAdmin && activeTab === "add" && (
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

                    {!isToday && activeTab === "add" && (
                        <div className="bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-2">
                            <Calendar size={12} />
                            Viewing past entries: <strong>{format(date, "MMMM do, yyyy")}</strong>
                        </div>
                    )}
                </div>

                {/* Tabs — Overview and AI Advisor are admin-only */}
                {isAdmin && (
                    <div className="flex p-1 bg-zinc-100 rounded-xl">
                        <button
                            onClick={() => setActiveTab("add")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${activeTab === "add" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                            <ClipboardList size={16} className={activeTab === "add" ? "text-cyan-600" : "text-zinc-400"} />
                            Daily Expense
                        </button>
                        <button
                            onClick={() => setActiveTab("monthly")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${activeTab === "monthly" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                            <Building2 size={16} className={activeTab === "monthly" ? "text-violet-600" : "text-zinc-400"} />
                            Monthly Expense
                        </button>
                        <button
                            onClick={() => setActiveTab("overview")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${activeTab === "overview" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                            <BarChart3 size={16} className={activeTab === "overview" ? "text-cyan-600" : "text-zinc-400"} />
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab("ai-advisor")}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all relative ${activeTab === "ai-advisor" ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50"}`}
                        >
                            <Sparkles size={15} className={activeTab === "ai-advisor" ? "text-violet-200 animate-pulse" : "text-violet-600"} />
                            <span>AI Advisor</span>
                            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full ${activeTab === "ai-advisor" ? "bg-white/20 text-white" : "bg-violet-100 text-violet-800"}`}>
                                Agent
                            </span>
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

                {activeTab === "monthly" && isAdmin && (
                    <div className="space-y-8">
                        {/* Master Operational Cost Overview Banner */}
                        <div className="bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 text-white p-6 sm:p-7 rounded-3xl shadow-xl border border-violet-800/40 relative overflow-hidden">
                            <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute -left-10 -top-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                            
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                                <div className="space-y-2.5 max-w-2xl">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/30 flex items-center gap-1.5">
                                            <Sparkles size={12} className="text-violet-300" />
                                            Total Monthly Operational Cost
                                        </span>
                                        <span className="text-xs text-violet-300/80 flex items-center gap-1">
                                            <ShieldCheck size={13} className="text-emerald-400" />
                                            Fixed Overheads + AI Daily Projected Demand
                                        </span>
                                    </div>
                                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                                        ₹{(grandTotalMonthlyOperationalCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        <span className="text-sm sm:text-base font-normal text-violet-300 ml-2">/ month</span>
                                    </h2>
                                    <p className="text-xs sm:text-sm text-violet-200/80 leading-relaxed">
                                        Combined monthly operational budget: <strong className="text-white font-semibold">₹{(totalActiveMonthlyFixedCents / 100).toLocaleString("en-IN")}</strong> in fixed master commitments (Rent, Salaries, EB) + <strong className="text-white font-semibold">₹{(aiDailyProjections.totalProjectedMonthlyCents / 100).toLocaleString("en-IN")}</strong> projected from recurring daily needs (e.g. daily water cans, milk, supplies).
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 shrink-0">
                                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                                        <p className="text-[10px] uppercase font-semibold text-violet-200 flex items-center gap-1">
                                            <Building2 size={12} className="text-violet-300" /> 1. Fixed Overheads
                                        </p>
                                        <p className="text-base sm:text-lg font-bold text-white mt-1">
                                            ₹{(totalActiveMonthlyFixedCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-violet-300/90 mt-0.5">{activeMonthlyOverheadsCount} direct commitments</p>
                                    </div>

                                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                                        <p className="text-[10px] uppercase font-semibold text-violet-200 flex items-center gap-1">
                                            <Bot size={12} className="text-cyan-300" /> 2. AI Daily Projected
                                        </p>
                                        <p className="text-base sm:text-lg font-bold text-cyan-300 mt-1">
                                            ₹{(aiDailyProjections.totalProjectedMonthlyCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-violet-300/90 mt-0.5">{aiDailyProjections.items.length} daily consumables</p>
                                    </div>

                                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                                        <p className="text-[10px] uppercase font-semibold text-violet-200">Daily Total Burn</p>
                                        <p className="text-base sm:text-lg font-bold text-amber-300 mt-1">
                                            ₹{(grandTotalDailyBurnCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-violet-300/90 mt-0.5">estimated / day</p>
                                    </div>

                                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                                        <p className="text-[10px] uppercase font-semibold text-violet-200">AI Savings Room</p>
                                        <p className="text-base sm:text-lg font-bold text-emerald-300 mt-1">
                                            ₹{(totalAiPotentialSavingsCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-violet-300/90 mt-0.5">wholesale / bulk opts</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SECTION 1: MASTER FIXED OVERHEADS */}
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
                                        <Building2 size={20} className="text-violet-600" />
                                        1. Fixed Monthly Overheads (Master Commitments)
                                    </h3>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        Direct recurring commitments (Rent, Staff Salaries, EB electricity, Internet, AMC). Fixed across all months.
                                    </p>
                                </div>
                                <span className="text-xs font-bold text-violet-900 bg-violet-50 px-3 py-1.5 rounded-xl border border-violet-200 shrink-0 w-fit">
                                    Total Fixed: ₹{(totalActiveMonthlyFixedCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} / mo
                                </span>
                            </div>

                            {/* Add Monthly Fixed Expense Form */}
                            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-zinc-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <h4 className="font-bold text-zinc-900 flex items-center gap-2 text-sm sm:text-base">
                                            <Plus size={16} className="text-violet-600" />
                                            Add Fixed Monthly Commitment
                                        </h4>
                                        <p className="text-xs text-zinc-500">Rent, staff salaries, EB electricity bill, internet, water &amp; recurring fixed commitments</p>
                                    </div>
                                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                                        Admin Managed
                                    </span>
                                </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-zinc-700">Expense Title / Item Name</label>
                                    <Input
                                        placeholder="e.g. Main Shop Rent, Staff Salary, EB Bill, Internet"
                                        value={monthlyItemName}
                                        onChange={(e) => setMonthlyItemName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-zinc-700">Monthly Amount (₹ / month)</label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={monthlyAmount}
                                        onChange={(e) => setMonthlyAmount(e.target.value)}
                                    />
                                    {monthlyAmount && Number(monthlyAmount) > 0 ? (
                                        <p className="text-[11px] text-zinc-400 font-medium italic pl-1 tracking-tight">
                                            {numberToWords(monthlyAmount)}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-zinc-700">Notes / Due Date / Details (Optional)</label>
                                <Input
                                    placeholder="e.g. Due on 5th via NEFT, Meter No: 4520, 2 Cook Staff"
                                    value={monthlyNotes}
                                    onChange={(e) => setMonthlyNotes(e.target.value)}
                                />
                            </div>

                            <Button className="w-full gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-sm" onClick={addMonthlyExpense} disabled={monthlySaving}>
                                {monthlySaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                Add Fixed Monthly Expense
                            </Button>
                        </div>

                        {/* Search & Category Filter for Overheads */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 space-y-3">
                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                                <div className="relative flex-1">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                    <Input
                                        placeholder="Search fixed expenses by name, category, notes..."
                                        value={monthlySearchQuery}
                                        onChange={(e) => setMonthlySearchQuery(e.target.value)}
                                        className="pl-9 text-xs sm:text-sm h-10"
                                    />
                                    {monthlySearchQuery && (
                                        <button onClick={() => setMonthlySearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
                                    <span>Showing:</span>
                                    <strong className="text-zinc-800">{displayedMonthlyExpenses.length}</strong>
                                    <span>of {monthlyExpenses.length} items</span>
                                </div>
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                                <button
                                    onClick={() => setMonthlyCategoryFilter("all")}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                                        monthlyCategoryFilter === "all"
                                            ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                                    }`}
                                >
                                    All ({monthlyExpenses.length})
                                </button>
                                {MONTHLY_CATEGORIES.map(cat => {
                                    const count = monthlyExpenses.filter(r => r.category === cat).length;
                                    if (count === 0 && monthlyCategoryFilter !== cat) return null;
                                    const isSelected = monthlyCategoryFilter === cat;
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => setMonthlyCategoryFilter(cat)}
                                            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                                                isSelected
                                                    ? "bg-violet-700 text-white border-violet-700 shadow-xs"
                                                    : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                                            }`}
                                        >
                                            {cat} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Monthly Entries List */}
                        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                            <div className="p-5 pb-3 flex items-center justify-between border-b border-zinc-100">
                                <div>
                                    <h2 className="font-bold text-zinc-900">
                                        Fixed Monthly Overheads Catalog
                                    </h2>
                                    <p className="text-xs text-zinc-400">
                                        Manage recurring commitments. Click the pencil icon to update rates when an expense increases.
                                    </p>
                                </div>
                                <span className="text-sm font-bold text-violet-900 bg-violet-50 px-3 py-1 rounded-lg border border-violet-200">
                                    Total: ₹{(totalActiveMonthlyFixedCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo
                                </span>
                            </div>

                            {displayedMonthlyExpenses.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center px-5">
                                    <Building2 className="w-12 h-12 text-zinc-300 mb-2" />
                                    <p className="text-zinc-700 font-semibold text-sm">No fixed overheads found</p>
                                    <p className="text-zinc-400 text-xs mt-1 max-w-sm">
                                        {monthlySearchQuery || monthlyCategoryFilter !== "all"
                                            ? "Try changing your search or category filter to see other fixed overheads."
                                            : "Add your shop rent, staff salaries, EB electricity bills, or internet overheads using the form above."}
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-zinc-100">
                                    {displayedMonthlyExpenses.map((row) => {
                                        const isEditing = monthlyEditingId === row.id;
                                        const c = CATEGORY_COLORS[row.category] || { bg: "bg-zinc-100", text: "text-zinc-700", border: "border-zinc-200" };
                                        const isActive = row.is_active !== false;
                                        const priceChanged = row.previous_amount_cents && row.previous_amount_cents !== row.amount_cents;
                                        const priceDiff = priceChanged ? row.amount_cents - row.previous_amount_cents! : 0;
                                        const pricePercent = priceChanged && row.previous_amount_cents! > 0
                                            ? ((priceDiff / row.previous_amount_cents!) * 100).toFixed(0)
                                            : null;

                                        return (
                                            <div key={row.id} className={`px-5 py-4 transition-colors ${!isActive ? "bg-zinc-50/70 opacity-70" : "hover:bg-zinc-50/40"}`}>
                                                {isEditing ? (
                                                    <div className="space-y-3 p-4 bg-violet-50/40 rounded-xl border border-violet-200">
                                                        <div className="flex items-center justify-between pb-1 border-b border-violet-100">
                                                            <span className="text-xs font-bold text-violet-900">Edit Fixed Overhead</span>
                                                            <span className="text-[11px] text-zinc-500">
                                                                Updating amount records price change history automatically
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-semibold text-zinc-700">Category</label>
                                                                <select
                                                                    value={monthlyEditCategory}
                                                                    onChange={(e) => setMonthlyEditCategory(e.target.value)}
                                                                    className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-xs font-medium"
                                                                >
                                                                    {MONTHLY_CATEGORIES.map(cat => (
                                                                        <option key={cat} value={cat}>{cat}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-semibold text-zinc-700">Monthly Amount (₹)</label>
                                                                <Input
                                                                    type="number"
                                                                    value={monthlyEditAmount}
                                                                    onChange={(e) => setMonthlyEditAmount(e.target.value)}
                                                                    placeholder="Amount"
                                                                />
                                                                {monthlyEditAmount && Number(monthlyEditAmount) > 0 ? (
                                                                    <p className="text-[11px] text-zinc-400 font-medium italic pl-1 tracking-tight">
                                                                        {numberToWords(monthlyEditAmount)}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-semibold text-zinc-700">Item Name / Title</label>
                                                            <Input value={monthlyEditItemName} onChange={(e) => setMonthlyEditItemName(e.target.value)} placeholder="Title" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-semibold text-zinc-700">Notes / Details</label>
                                                            <Input value={monthlyEditNotes} onChange={(e) => setMonthlyEditNotes(e.target.value)} placeholder="Notes / details" />
                                                        </div>
                                                        <div className="flex gap-2 pt-2">
                                                            <Button size="sm" className="flex-1 gap-1 bg-violet-700 hover:bg-violet-800 text-white" onClick={() => saveMonthlyEdit(row)}>
                                                                <Check size={14} /> Save Changes
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="gap-1 text-zinc-600 hover:bg-zinc-100" onClick={cancelMonthlyEdit}>
                                                                <X size={14} /> Cancel
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                        <div className="min-w-0 flex-1 space-y-1.5">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-zinc-900 text-sm sm:text-base">{row.item_name}</span>
                                                                {!isActive && (
                                                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-200 text-zinc-600">
                                                                        Paused
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {row.notes && (
                                                                <p className="text-xs text-zinc-600 line-clamp-2 flex items-center gap-1.5">
                                                                    <Info size={13} className="text-zinc-400 shrink-0" />
                                                                    <span>{row.notes}</span>
                                                                </p>
                                                            )}

                                                            {/* Price Change Audit Pill */}
                                                            {priceChanged && (
                                                                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 border ${
                                                                        priceDiff > 0
                                                                            ? "bg-rose-50 text-rose-700 border-rose-200"
                                                                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                    }`}>
                                                                        {priceDiff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                                        <span>
                                                                            {priceDiff > 0 ? "Increased from" : "Decreased from"} ₹{(row.previous_amount_cents! / 100).toLocaleString("en-IN")}
                                                                            {" "}({priceDiff > 0 ? "+" : ""}₹{(Math.abs(priceDiff) / 100).toLocaleString("en-IN")}{pricePercent ? ` · ${priceDiff > 0 ? "+" : ""}${pricePercent}%` : ""})
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* Salary Structure Sync Pill if out of sync */}
                                                            {row.category === "Salary" && totalSalaryStructureCents > 0 && row.amount_cents !== totalSalaryStructureCents && (
                                                                <div className="flex items-center gap-2 pt-0.5">
                                                                    <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1.5">
                                                                        <Users size={12} className="text-amber-600" />
                                                                        <span>Users & Roles Salary Structure: ₹{(totalSalaryStructureCents / 100).toLocaleString("en-IN")}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                await supabaseClient.from("monthly_expenses").update({
                                                                                    amount_cents: totalSalaryStructureCents,
                                                                                    previous_amount_cents: row.amount_cents,
                                                                                    notes: `Synced with Users & Roles salary structure (₹${(totalSalaryStructureCents / 100).toLocaleString("en-IN")})`,
                                                                                    updated_at: new Date().toISOString(),
                                                                                }).eq("id", row.id);
                                                                                toast({ title: "Salary overhead synced", description: `Updated to ₹${(totalSalaryStructureCents / 100).toLocaleString("en-IN")}`, variant: "success" });
                                                                                fetchMonthlyExpenses();
                                                                            }}
                                                                            className="underline font-bold text-amber-900 hover:text-amber-950 ml-1 cursor-pointer"
                                                                        >
                                                                            Sync Rate
                                                                        </button>
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* AI Daily Run-Rate Drift Pill for Consumables (e.g. Paper Plates, Water Cans) */}
                                                            {(() => {
                                                                const matchedAi = aiDailyProjections.items.find(
                                                                    a => a.itemName.trim().toLowerCase() === row.item_name.trim().toLowerCase()
                                                                );
                                                                if (!matchedAi || matchedAi.projectedMonthlySpendCents === row.amount_cents) return null;
                                                                const diff = matchedAi.projectedMonthlySpendCents - row.amount_cents;
                                                                const isIncrease = diff > 0;
                                                                return (
                                                                    <div className="flex items-center gap-2 pt-0.5">
                                                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1.5 border ${
                                                                            isIncrease ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-blue-50 text-blue-900 border-blue-200"
                                                                        }`}>
                                                                            <Bot size={12} className={isIncrease ? "text-amber-600" : "text-blue-600"} />
                                                                            <span>
                                                                                Live Daily Run-Rate: ₹{(matchedAi.projectedMonthlySpendCents / 100).toLocaleString("en-IN")}/mo ({isIncrease ? "+" : ""}₹{(diff / 100).toLocaleString("en-IN")}/mo {isIncrease ? "higher" : "lower"} consumption)
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => addAiItemToMonthlyOverheads(matchedAi)}
                                                                                className="underline font-bold hover:opacity-80 ml-1 cursor-pointer"
                                                                            >
                                                                                Update Budget
                                                                            </button>
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })()}

                                                            <p className="text-[11px] text-zinc-400">
                                                                {row.updated_at ? `Updated ${format(new Date(row.updated_at), "MMM d, yyyy")}` : `Created ${format(new Date(row.created_at), "MMM d, yyyy")}`}
                                                                {row.submitted_by && namesById[row.submitted_by] && (
                                                                    <> · by {namesById[row.submitted_by]}</>
                                                                )}
                                                            </p>
                                                        </div>

                                                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                                                            <div className="text-left sm:text-right">
                                                                <p className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
                                                                    ₹{(row.amount_cents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    <span className="text-xs font-normal text-zinc-400 ml-1">/mo</span>
                                                                </p>
                                                                <p className="text-[11px] text-zinc-400">
                                                                    ₹{((row.amount_cents * 12) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })} / yr
                                                                </p>
                                                            </div>

                                                            <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200">
                                                                <button
                                                                    onClick={() => toggleMonthlyActive(row)}
                                                                    className={`p-2 rounded-lg transition-colors text-xs font-medium flex items-center gap-1 border ${
                                                                        isActive
                                                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                                                            : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
                                                                    }`}
                                                                    title={isActive ? "Pause Overhead" : "Resume Overhead"}
                                                                >
                                                                    <Power size={14} className={isActive ? "text-emerald-600" : "text-zinc-400"} />
                                                                </button>
                                                                <button
                                                                    onClick={() => startMonthlyEdit(row)}
                                                                    className="p-2 rounded-lg hover:bg-violet-50 text-violet-700 border border-violet-200 transition-colors"
                                                                    title="Edit rate or details"
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteMonthlyExpense(row)}
                                                                    className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 border border-rose-200 transition-colors"
                                                                    title="Delete fixed overhead"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                        {/* SECTION 2: AI-CALCULATED RECURRING MONTHLY DEMAND */}
                        <div className="space-y-4 pt-6 border-t-2 border-zinc-200/60">
                            {/* Section Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-violet-500/10 p-5 rounded-2xl border border-cyan-200/60">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-700 text-white shadow-xs flex items-center gap-1.5">
                                            <Bot size={13} />
                                            Agentic AI Engine
                                        </span>
                                        <span className="text-xs text-cyan-900 font-semibold flex items-center gap-1">
                                            <Sparkles size={13} className="text-amber-500" />
                                            30-Day Daily Run-Rate Projections
                                        </span>
                                    </div>
                                    <h3 className="text-base sm:text-lg font-bold text-zinc-900">
                                        2. AI-Calculated Recurring Monthly Demand (Derived from Daily Purchases)
                                    </h3>
                                    <p className="text-xs text-zinc-600 max-w-2xl leading-relaxed">
                                        Agentic AI analyzes your daily expense entries, calculates your daily consumption velocity (e.g. buying 10 water cans daily @ ₹35/can), and projects your full 30-day recurring spend with wholesale vendor optimization advice.
                                    </p>
                                </div>

                                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 bg-white/90 backdrop-blur-sm p-3.5 rounded-2xl border border-cyan-200 shadow-xs">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">AI Projected Spend</span>
                                    <span className="text-lg sm:text-xl font-black text-cyan-950">
                                        ₹{(aiDailyProjections.totalProjectedMonthlyCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                        <span className="text-xs font-normal text-zinc-400 ml-1">/ mo</span>
                                    </span>
                                    <span className="text-[10px] text-zinc-400">from {aiDailyProjections.items.length} daily recurring items</span>
                                </div>
                            </div>

                            {/* Recurrence Filter Pills */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                                <button
                                    onClick={() => setAiRecurrenceFilter("all")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                                        aiRecurrenceFilter === "all"
                                            ? "bg-cyan-700 text-white border-cyan-700 shadow-xs"
                                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                                    }`}
                                >
                                    All Recurring Items ({aiDailyProjections.items.length})
                                </button>
                                <button
                                    onClick={() => setAiRecurrenceFilter("daily")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                                        aiRecurrenceFilter === "daily"
                                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                                    }`}
                                >
                                    Daily Need / High Recurrence ({aiDailyProjections.items.filter(i => i.recurrenceLevel === "daily").length})
                                </button>
                                <button
                                    onClick={() => setAiRecurrenceFilter("frequent")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                                        aiRecurrenceFilter === "frequent"
                                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                                    }`}
                                >
                                    Frequent Consumables ({aiDailyProjections.items.filter(i => i.recurrenceLevel === "frequent").length})
                                </button>
                            </div>

                            {/* AI Projected Cards List */}
                            {displayedAiItems.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-dashed border-zinc-200 p-8 text-center space-y-2">
                                    <Bot className="w-10 h-10 text-zinc-300 mx-auto" />
                                    <p className="text-sm font-semibold text-zinc-700">No daily recurring items detected yet</p>
                                    <p className="text-xs text-zinc-400 max-w-md mx-auto">
                                        Log your daily store purchases (e.g., 20L water cans, milk, vegetables, packaging, fuel) in the Daily Expense tab. The AI will automatically compute your daily consumption velocity and project your 30-day recurring spend here.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {displayedAiItems.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4 hover:border-cyan-300"
                                        >
                                            <div className="space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                                                                item.recurrenceLevel === "daily"
                                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                                            }`}>
                                                                {item.recurrenceLevel === "daily" ? "Daily Need" : "Frequent Consumable"}
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">
                                                                {item.categorySuggestion}
                                                            </span>
                                                        </div>
                                                        <h4 className="text-base font-bold text-zinc-900 mt-1.5 truncate" title={item.itemName}>
                                                            {item.itemName}
                                                        </h4>
                                                        <p className="text-[11px] text-zinc-400 mt-0.5">
                                                            Logged across {item.purchaseDaysCount} of {item.totalDaysSpan} recorded days ({item.confidenceScore}% consistency)
                                                        </p>
                                                    </div>

                                                    <div className="text-right shrink-0">
                                                        <p className="text-lg sm:text-xl font-black text-zinc-900">
                                                            ₹{(item.projectedMonthlySpendCents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                                            <span className="text-xs font-normal text-zinc-400 ml-1">/mo</span>
                                                        </p>
                                                        <p className="text-[11px] text-zinc-500 font-medium">
                                                            ~{Math.round(item.projectedMonthlyQuantity)} units / month
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Quantity & Daily Velocity Metrics */}
                                                <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-100 text-xs">
                                                    <div>
                                                        <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Daily Consumption</span>
                                                        <span className="font-bold text-zinc-800 text-sm">
                                                            {item.avgDailyQuantity.toFixed(1)} <span className="text-xs font-normal text-zinc-500">units / day</span>
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Avg Daily Outflow</span>
                                                        <span className="font-bold text-zinc-800 text-sm">
                                                            ₹{(item.avgDailySpendCents / 100).toFixed(2)} <span className="text-xs font-normal text-zinc-500">(@ ₹{(item.avgUnitCostCents / 100).toFixed(2)}/unit)</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Dynamic Lock / Sync Action Footer */}
                                            {(() => {
                                                const lockedOverhead = monthlyExpenses.find(
                                                    m => m.item_name.trim().toLowerCase() === item.itemName.trim().toLowerCase()
                                                );
                                                const isLocked = !!lockedOverhead;
                                                const isDrifted = isLocked && lockedOverhead.amount_cents !== item.projectedMonthlySpendCents;
                                                const driftDiff = isDrifted ? item.projectedMonthlySpendCents - lockedOverhead.amount_cents : 0;

                                                return (
                                                    <div className="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                                                        <div className="text-[11px] text-zinc-500">
                                                            {isDrifted ? (
                                                                <span className="font-semibold text-amber-700 flex items-center gap-1">
                                                                    <TrendingUp size={12} className="text-amber-600 shrink-0" />
                                                                    Fixed at ₹{(lockedOverhead.amount_cents / 100).toLocaleString("en-IN")}/mo ({driftDiff > 0 ? "+" : ""}₹{(driftDiff / 100).toLocaleString("en-IN")}/mo consumption {driftDiff > 0 ? "increase" : "decrease"})
                                                                </span>
                                                            ) : isLocked ? (
                                                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                                                    <Check size={12} className="text-emerald-600 shrink-0" />
                                                                    Locked in Fixed Overheads at ₹{(lockedOverhead.amount_cents / 100).toLocaleString("en-IN")}/mo
                                                                </span>
                                                            ) : item.suggestedSavingsCents > 0 ? (
                                                                <span className="text-emerald-700 font-medium">
                                                                    Potential wholesale saving: ₹{(item.suggestedSavingsCents / 100).toLocaleString("en-IN")}/mo
                                                                </span>
                                                            ) : (
                                                                <span className="text-zinc-400">Regular store operating consumable</span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap">
                                                            {isLocked && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => removeAiItemFromMonthlyOverheads(item)}
                                                                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 border border-rose-200 text-xs font-semibold h-8 px-2.5 gap-1 shadow-2xs"
                                                                    title="Remove from Fixed Monthly Overheads"
                                                                >
                                                                    <Trash2 size={13} />
                                                                    <span>Remove from Fixed</span>
                                                                </Button>
                                                            )}

                                                            <Button
                                                                size="sm"
                                                                onClick={() => addAiItemToMonthlyOverheads(item)}
                                                                className={`text-xs font-semibold h-8 px-3 gap-1.5 shadow-xs transition-all ${
                                                                    isDrifted
                                                                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                                                                        : isLocked
                                                                        ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                                                                        : "bg-zinc-900 hover:bg-zinc-800 text-white"
                                                                }`}
                                                            >
                                                                {isDrifted ? (
                                                                    <>
                                                                        <TrendingUp size={13} />
                                                                        <span>Sync New Rate</span>
                                                                    </>
                                                                ) : isLocked ? (
                                                                    <>
                                                                        <Check size={13} className="text-emerald-600" />
                                                                        <span>Synced</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Plus size={13} />
                                                                        <span>Lock as Fixed Overhead</span>
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
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
                                <p className="text-[11px] text-zinc-400 mt-0.5">{totalOverviewEntries} total entries</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Daily Expenses</p>
                                <p className="text-2xl font-bold text-cyan-600 mt-1">₹{(overviewDailyTotalCents / 100).toFixed(2)}</p>
                                <p className="text-[11px] text-zinc-400 mt-0.5">{overviewRows.length} daily entries</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Monthly Overheads</p>
                                <p className="text-2xl font-bold text-violet-600 mt-1">₹{(overviewMonthlyTotalCents / 100).toFixed(2)}</p>
                                <p className="text-[11px] text-zinc-400 mt-0.5">{filteredMonthlyRows.length} recurring entries</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Avg / Entry</p>
                                <p className="text-2xl font-bold text-zinc-900 mt-1">₹{(avgPerEntryCents / 100).toFixed(2)}</p>
                                <p className="text-[11px] text-zinc-400 mt-0.5">{distinctItemCount} distinct items</p>
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
                            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden h-fit space-y-4">
                                <div className="p-5 pb-0">
                                    <h2 className="font-semibold text-zinc-900">Expense Breakdown</h2>
                                    <p className="text-xs text-zinc-400 mt-0.5">Daily supply items &amp; monthly fixed overheads</p>
                                </div>

                                {/* Monthly Overheads Summary if any */}
                                {monthlyItemSummary.length > 0 && (
                                    <div className="px-5">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-violet-700 uppercase tracking-wider flex items-center gap-1.5">
                                                <Building2 size={13} /> Monthly Fixed Costs
                                            </span>
                                            <span className="text-xs font-bold text-violet-700">
                                                ₹{(overviewMonthlyTotalCents / 100).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="divide-y divide-zinc-50 rounded-xl border border-violet-100 bg-violet-50/30 overflow-hidden">
                                            {monthlyItemSummary.map((item, idx) => {
                                                const c = CATEGORY_COLORS[item.category] || { bg: "bg-zinc-100", text: "text-zinc-700", border: "border-zinc-200" };
                                                return (
                                                    <div key={idx} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border ${c.bg} ${c.text} ${c.border}`}>
                                                                    {item.category}
                                                                </span>
                                                                <p className="font-medium text-xs text-zinc-900 truncate">{item.name}</p>
                                                            </div>
                                                        </div>
                                                        <span className="font-bold text-xs text-zinc-900 shrink-0">₹{(item.cents / 100).toFixed(2)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Daily Items Summary */}
                                <div>
                                    <div className="px-5 pb-2 flex items-center justify-between">
                                        <span className="text-xs font-bold text-cyan-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <ClipboardList size={13} /> Daily Supplies
                                        </span>
                                        <span className="text-xs font-bold text-cyan-700">
                                            ₹{(overviewDailyTotalCents / 100).toFixed(2)}
                                        </span>
                                    </div>

                                    {overviewItemSummary.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-6 text-center px-5">
                                            <PackageSearch className="w-8 h-8 text-zinc-300 mb-1" />
                                            <p className="text-zinc-400 text-xs">No daily supply expenses recorded</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-zinc-50 max-h-[320px] overflow-y-auto">
                                            {overviewItemSummary.map((item, idx) => (
                                                <div key={idx} className="px-5 py-2.5 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-xs text-zinc-900 truncate capitalize">{item.name}</p>
                                                        <p className="text-[10px] text-zinc-400">Qty: {item.quantity}</p>
                                                    </div>
                                                    <span className="font-semibold text-xs text-zinc-900 shrink-0">₹{(item.cents / 100).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Transactions Table */}
                            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                                <div className="p-5 pb-3 flex items-center justify-between">
                                    <div>
                                        <h2 className="font-semibold text-zinc-900">All Transactions</h2>
                                        <p className="text-xs text-zinc-400">Daily expenses and monthly fixed overheads</p>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs">
                                        <button onClick={() => toggleSort("date")} className={`flex items-center gap-1 px-2 py-1 rounded-md ${sortKey === "date" ? "bg-zinc-100 text-zinc-900 font-semibold" : "text-zinc-400"}`}>
                                            Date <ArrowUpDown size={12} />
                                        </button>
                                        <button onClick={() => toggleSort("amount")} className={`flex items-center gap-1 px-2 py-1 rounded-md ${sortKey === "amount" ? "bg-zinc-100 text-zinc-900 font-semibold" : "text-zinc-400"}`}>
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
                                    <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-zinc-50 border-b border-zinc-100 text-zinc-500 sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-2.5 font-medium">Date</th>
                                                    <th className="px-4 py-2.5 font-medium">Category</th>
                                                    <th className="px-4 py-2.5 font-medium">Item &amp; Details</th>
                                                    <th className="px-4 py-2.5 font-medium">Amount</th>
                                                    {isAdmin && <th className="px-4 py-2.5 font-medium">Added By</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-50">
                                                {sortedTransactions.map(row => {
                                                    const isMonthly = row.type === "monthly";
                                                    const c = isMonthly && CATEGORY_COLORS[row.category]
                                                        ? CATEGORY_COLORS[row.category]
                                                        : { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" };

                                                    return (
                                                        <tr key={row.id} className="hover:bg-zinc-50/50">
                                                            <td className="px-4 py-3 whitespace-nowrap text-zinc-600 text-xs">
                                                                {format(new Date(`${row.date}T00:00:00`), "d MMM yyyy")}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}>
                                                                    {row.category}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <p className="font-medium text-zinc-900 text-xs">{row.item_name}</p>
                                                                <p className="text-[11px] text-zinc-400">{row.subtext}</p>
                                                            </td>
                                                            <td className="px-4 py-3 font-semibold text-zinc-900 whitespace-nowrap text-xs">
                                                                ₹{(row.amount_cents / 100).toFixed(2)}
                                                            </td>
                                                            {isAdmin && (
                                                                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-xs">
                                                                    {row.submitted_by && namesById[row.submitted_by] ? namesById[row.submitted_by] : "-"}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "ai-advisor" && isAdmin && (
                    <ExpenseAIAgent
                        expenses={overviewRows.length > 0 ? overviewRows : allExpenses}
                        priceList={priceList}
                        periodLabel={overviewPeriodLabel}
                        isAdmin={isAdmin}
                        monthlyExpenses={activeMonthlyExpenses.length > 0 ? activeMonthlyExpenses : monthlyExpenses}
                    />
                )}
            </div>
        </div>
    );
}

