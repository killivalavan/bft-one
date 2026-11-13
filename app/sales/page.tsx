"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useProfile } from "@/lib/hooks/useProfile";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Save,
    Lock,
    Calendar,
    Banknote,
    QrCode,
    ShoppingBag,
    Clock,
    CheckCircle2,
    Sparkles,
    Shield,
    BarChart3,
    Receipt,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Info,
    Layers
} from "lucide-react";
import Link from "next/link";
import { format, addDays, isSameDay } from "date-fns";
import { STORES, getItemsByTenant, LocalDailyExpense } from "@/lib/offline/db";

export default function SalesPage() {
    const { toast } = useToast();
    const { confirm } = useConfirm();
    const { business } = useTenant();
    const { flags } = useProfile();
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [profileBusinessId, setProfileBusinessId] = useState<string | null>(null);

    // Cached Admin Flag check for instant authorization
    const [cachedIsAdmin] = useState<boolean>(() => {
        if (typeof window !== "undefined") {
            try {
                const cachedFlags = localStorage.getItem("bftone_flags");
                if (cachedFlags) {
                    const parsed = JSON.parse(cachedFlags);
                    if (parsed.is_admin || parsed.isAdmin || parsed.is_super_admin || parsed.isSuperAdmin) {
                        return true;
                    }
                }
                const email = localStorage.getItem("bftone_display_email");
                if (email && email.toLowerCase().includes("admin")) {
                    return true;
                }
            } catch { }
        }
        return false;
    });

    const effectiveIsAdmin = Boolean(
        isAdmin ||
        flags?.isAdmin ||
        flags?.isSuperAdmin ||
        cachedIsAdmin
    );

    // Date State
    const getInitialDate = () => {
        const now = new Date();
        return now.getHours() < 5 ? addDays(now, -1) : now;
    };
    const [date, setDate] = useState<Date>(getInitialDate);
    const [manualOverride, setManualOverride] = useState(false);
    const dateStr = format(date, "yyyy-MM-dd");
    const isToday = isSameDay(date, new Date());

    // Form State
    const [cash, setCash] = useState("");
    const [upi, setUpi] = useState("");

    // Daily Expenses State (Auto-synced from Expenses page)
    interface DailyExpenseSummaryItem {
        id: string;
        item_name: string;
        quantity: number;
        price_cents: number;
        created_at?: string;
    }
    const [dailyExpenses, setDailyExpenses] = useState<DailyExpenseSummaryItem[]>([]);
    const [expensesLoading, setExpensesLoading] = useState(false);
    const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false);

    // Status State (Saved/Locked)
    const [cashSaved, setCashSaved] = useState(false);
    const [upiSaved, setUpiSaved] = useState(false);
    const [cashEditing, setCashEditing] = useState(false);
    const [upiEditing, setUpiEditing] = useState(false);
    const [cashSubmittedBy, setCashSubmittedBy] = useState<string | null>(null);
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);

    const currentBusinessId = business?.id || profileBusinessId;
    const effectiveBizId = currentBusinessId || (business?.id && business.id !== "default" ? business.id : null) || profileBusinessId;

    useEffect(() => {
        checkUser();
    }, []);

    // Fetch data whenever date changes (if user is loaded)
    useEffect(() => {
        if (userId) fetchSales();
    }, [date, userId, currentBusinessId]);

    async function checkUser() {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("is_admin, is_super_admin, business_id")
                .eq("id", user.id)
                .maybeSingle();

            const isUserAdmin = Boolean(
                profile?.is_admin ||
                (profile as any)?.is_super_admin ||
                user.email?.toLowerCase().includes("admin")
            );
            setIsAdmin(isUserAdmin);
            if (profile?.business_id) {
                setProfileBusinessId(profile.business_id);
            }
        } catch (error) {
            console.error("Error checking user:", error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchDailyExpenses(targetDateStr: string, bId: string) {
        setExpensesLoading(true);
        // 1. Warm start from IndexedDB
        try {
            const localExpenses = await getItemsByTenant<LocalDailyExpense>(STORES.daily_expenses, bId);
            const filtered = (localExpenses || []).filter((e) => e.expense_date === targetDateStr);
            if (filtered.length > 0) {
                setDailyExpenses(filtered.map(r => ({
                    id: r.id,
                    item_name: r.item_name,
                    quantity: r.quantity,
                    price_cents: r.price_cents,
                    created_at: r.created_at,
                })));
            }
        } catch {}

        // 2. Refresh from Supabase cloud
        try {
            const { data, error } = await supabaseClient
                .from("daily_expenses")
                .select("id, item_name, quantity, price_cents, created_at")
                .eq("expense_date", targetDateStr)
                .eq("business_id", bId)
                .order("created_at", { ascending: true });

            if (!error && data) {
                setDailyExpenses(data as DailyExpenseSummaryItem[]);
            }
        } catch (err) {
            console.warn("Failed to fetch daily expenses for settlement:", err);
        } finally {
            setExpensesLoading(false);
        }
    }

    async function fetchSales() {
        // Reset state for new date
        setCash("");
        setUpi("");
        setCashSaved(false);
        setUpiSaved(false);
        setCashSubmittedBy(null);

        const bId = effectiveBizId;
        if (!bId) return;

        // Fetch daily expenses for this store and date in parallel
        fetchDailyExpenses(dateStr, bId);

        let query = supabaseClient
            .from("daily_sales")
            .select("*")
            .eq("sale_date", dateStr)
            .eq("business_id", bId);

        const { data } = await query.maybeSingle();

        if (data) {
            // Priority: drawer_cash_cents if column exists, otherwise fallback to total_cash_cents
            if (data.drawer_cash_cents !== null && data.drawer_cash_cents !== undefined) {
                setCash((data.drawer_cash_cents / 100).toString());
                setCashSaved(true);
                setCashEditing(false);
            } else if (data.total_cash_cents !== null) {
                // Legacy row: if daily_expense_cents was stored, drawer cash was total minus expense
                const storedExp = data.daily_expense_cents || 0;
                const legacyDrawer = Math.max(0, data.total_cash_cents - storedExp);
                setCash((legacyDrawer / 100).toString());
                setCashSaved(true);
                setCashEditing(false);
            }

            // Fetch the submitter's email and extract name
            if (data.cash_submitted_by) {
                const { data: profile } = await supabaseClient.from("profiles").select("email").eq("id", data.cash_submitted_by).maybeSingle();
                if (profile?.email) {
                    const name = profile.email.split("@")[0].replace(/[._-]/g, " ");
                    const capitalizedName = name.split(" ").map((word: any) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
                    setCashSubmittedBy(capitalizedName);
                }
            }

            if (data.upi_amount_cents !== null) {
                setUpi((data.upi_amount_cents / 100).toString());
                setUpiSaved(true);
                setUpiEditing(false);
            }
        }
    }

    // Auto-switch visible date to today when clock passes 5:00
    useEffect(() => {
        const id = setInterval(() => {
            const now = new Date();
            if (now.getHours() >= 5 && !manualOverride) {
                const yesterday = addDays(now, -1);
                if (isSameDay(date, yesterday)) {
                    setDate(now);
                    toast({ title: "Date switched to today", description: "Automatically switched after 05:00", variant: "info" });
                }
            }
        }, 60 * 1000);
        return () => clearInterval(id);
    }, [date, manualOverride]);

    async function getEffectiveBusinessId(): Promise<string | null> {
        if (currentBusinessId) return currentBusinessId;
        if (business?.id && business.id !== "default") return business.id;
        if (profileBusinessId) return profileBusinessId;
        if (userId) {
            const { data: prof } = await supabaseClient.from("profiles").select("business_id").eq("id", userId).maybeSingle();
            if (prof?.business_id) {
                setProfileBusinessId(prof.business_id);
                return prof.business_id;
            }
        }
        return null;
    }

    async function saveCash() {
        if (!cash || isNaN(Number(cash))) {
            toast({ title: "Invalid Amount", description: "Please enter a valid cash amount", variant: "error" });
            return;
        }

        const bId = await getEffectiveBusinessId();
        if (!bId) {
            toast({ title: "Store Not Selected", description: "Cannot record sales without an active store context.", variant: "error" });
            return;
        }

        const drawerCents = Math.round(Number(cash) * 100);
        const expCents = dailyExpenses.reduce((sum, item) => sum + (item.price_cents || 0), 0);
        const grossCashCents = drawerCents + expCents;

        // If user is saving on 'today' before 5:00, record as yesterday
        const now = new Date();
        let targetDate = date;
        if (isSameDay(date, new Date()) && now.getHours() < 5) {
            targetDate = addDays(date, -1);
        }
        const saveDateStr = format(targetDate, "yyyy-MM-dd");

        const { data: existing } = await supabaseClient
            .from("daily_sales")
            .select("id")
            .eq("sale_date", saveDateStr)
            .eq("business_id", bId)
            .maybeSingle();

        let error;
        if (existing) {
            const updatePayload: any = {
                total_cash_cents: grossCashCents,
                drawer_cash_cents: drawerCents,
                daily_expense_cents: expCents,
                cash_submitted_by: userId,
                updated_at: new Date().toISOString()
            };
            const { error: err } = await supabaseClient.from("daily_sales").update(updatePayload).eq("id", existing.id);
            if (err && (err.message?.includes("drawer_cash_cents") || (err as any).code === "42703")) {
                // Backward compatibility if new columns are not yet applied to database
                const fbPayload = {
                    total_cash_cents: grossCashCents,
                    cash_submitted_by: userId,
                    updated_at: new Date().toISOString()
                };
                const { error: fbErr } = await supabaseClient.from("daily_sales").update(fbPayload).eq("id", existing.id);
                error = fbErr;
            } else {
                error = err;
            }
        } else {
            const insertPayload: any = {
                business_id: bId,
                sale_date: saveDateStr,
                total_cash_cents: grossCashCents,
                drawer_cash_cents: drawerCents,
                daily_expense_cents: expCents,
                cash_submitted_by: userId,
            };
            const { error: err } = await supabaseClient.from("daily_sales").insert(insertPayload);
            if (err && (err.message?.includes("drawer_cash_cents") || (err as any).code === "42703")) {
                const fbPayload = {
                    business_id: bId,
                    sale_date: saveDateStr,
                    total_cash_cents: grossCashCents,
                    cash_submitted_by: userId,
                };
                const { error: fbErr } = await supabaseClient.from("daily_sales").insert(fbPayload);
                error = fbErr;
            } else {
                error = err;
            }
        }

        if (error) toast({ title: "Failed to save", description: error.message, variant: "error" });
        else {
            toast({
                title: "Cash Settlement Saved",
                description: `Drawer Cash: ₹${(drawerCents / 100).toFixed(2)} + Expenses: ₹${(expCents / 100).toFixed(2)} = Total Cash: ₹${(grossCashCents / 100).toFixed(2)}`,
                variant: "success"
            });
            setCashSaved(true);
            setCashEditing(false);
            // Show success modal for non-admin users
            if (!effectiveIsAdmin) {
                setShowSaveSuccess(true);
                setTimeout(() => setShowSaveSuccess(false), 5000);
            }
            // Refetch to get updated submitter info
            await fetchSales();
        }
    }

    async function clearCash() {
        const ok = await confirm({
            title: "Clear Cash Amount",
            description: "Are you sure you want to clear the cash settlement for the selected date?",
            confirmLabel: "Clear Cash",
            variant: "danger",
        });
        if (!ok) return;
        const now = new Date();
        let targetDate = date;
        if (isSameDay(date, new Date()) && now.getHours() < 5) {
            targetDate = addDays(date, -1);
        }
        const saveDateStr = format(targetDate, "yyyy-MM-dd");
        const bId = await getEffectiveBusinessId();
        if (!bId) {
            toast({ title: "Store Not Selected", description: "Cannot clear sales without an active store context.", variant: "error" });
            return;
        }

        const { data: existing } = await supabaseClient
            .from("daily_sales")
            .select("id")
            .eq("sale_date", saveDateStr)
            .eq("business_id", bId)
            .maybeSingle();

        if (!existing) {
            toast({ title: "Nothing to clear", variant: "info" });
            return;
        }

        const clearPayload: any = {
            total_cash_cents: null,
            drawer_cash_cents: null,
            daily_expense_cents: null,
            cash_submitted_by: null,
            updated_at: new Date().toISOString()
        };
        let { error } = await supabaseClient.from("daily_sales").update(clearPayload).eq("id", existing.id);
        if (error && (error.message?.includes("drawer_cash_cents") || (error as any).code === "42703")) {
            const { error: fbErr } = await supabaseClient.from("daily_sales").update({
                total_cash_cents: null,
                cash_submitted_by: null,
                updated_at: new Date().toISOString()
            }).eq("id", existing.id);
            error = fbErr;
        }

        if (error) {
            toast({ title: "Failed to clear", description: error.message, variant: "error" });
            return;
        }

        toast({ title: "Cash cleared", variant: "success" });
        setCash("");
        setCashSaved(false);
        setCashEditing(false);
        setCashSubmittedBy(null);
        await fetchSales();
    }

    async function saveUpi() {
        if (!upi || isNaN(Number(upi))) {
            toast({ title: "Invalid Amount", description: "Please enter a valid UPI amount", variant: "error" });
            return;
        }

        const bId = await getEffectiveBusinessId();
        if (!bId) {
            toast({ title: "Store Not Selected", description: "Cannot record sales without an active store context.", variant: "error" });
            return;
        }

        const cents = Math.round(Number(upi) * 100);
        // If user is saving on 'today' before 5:00, record as yesterday
        const now = new Date();
        let targetDate = date;
        if (isSameDay(date, new Date()) && now.getHours() < 5) {
            targetDate = addDays(date, -1);
        }
        const saveDateStr = format(targetDate, "yyyy-MM-dd");

        const { data: existing } = await supabaseClient
            .from("daily_sales")
            .select("id")
            .eq("sale_date", saveDateStr)
            .eq("business_id", bId)
            .maybeSingle();

        let error;
        if (existing) {
            const { error: err } = await supabaseClient.from("daily_sales").update({
                upi_amount_cents: cents,
                upi_submitted_by: userId,
                updated_at: new Date().toISOString()
            }).eq("id", existing.id);
            error = err;
        } else {
            const { error: err } = await supabaseClient.from("daily_sales").insert({
                business_id: bId,
                sale_date: saveDateStr,
                upi_amount_cents: cents,
                upi_submitted_by: userId,
            });
            error = err;
        }

        if (error) toast({ title: "Failed to save", description: error.message, variant: "error" });
        else {
            toast({ title: "UPI Sales Saved", variant: "success" });
            setUpiSaved(true);
            setUpiEditing(false);
            await fetchSales();
        }
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

    const numDrawerCash = Number(cash) || 0;
    const dailyExpensesTotalCents = dailyExpenses.reduce((sum, item) => sum + (item.price_cents || 0), 0);
    const numDailyExpenses = dailyExpensesTotalCents / 100;
    const totalCashAccounted = numDrawerCash + numDailyExpenses;
    const numUpi = Number(upi) || 0;
    const totalDaySettlement = totalCashAccounted + numUpi;

    return (
        <div>
            <div className="max-w-5xl 2xl:max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-7">
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 border border-blue-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                            <Banknote size={24} />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                                Cash & UPI Settlement
                            </h1>
                            <p className="text-[#64748B] text-xs sm:text-sm mt-0.5">
                                Record physical drawer cash & digital UPI closing collections
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        {effectiveIsAdmin && (
                            <Link
                                href="/admin/sales"
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold transition shadow-2xs active:scale-95"
                                title="View Cash & UPI Sales Analytics and Reports"
                            >
                                <BarChart3 size={14} />
                                <span>Sales Analytics</span>
                                <ChevronRight size={13} />
                            </Link>
                        )}

                        <Link
                            href="/daily-sales"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold transition shadow-2xs active:scale-95"
                            title="View itemized daily sales & orders"
                        >
                            <ShoppingBag size={14} />
                            <span>Itemized Sales</span>
                            <ChevronRight size={13} />
                        </Link>

                        {/* Date Navigator */}
                        {effectiveIsAdmin ? (
                            <div className="flex items-center gap-1.5">
                                <span className="hidden md:inline-flex text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded-lg">
                                    Admin Only
                                </span>
                                <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-xl p-1 shadow-2xs">
                                    <button
                                        onClick={() => { setDate(addDays(date, -1)); setManualOverride(true); }}
                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                                        title="Previous Day"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <div className="px-2.5 text-xs font-bold text-[#0F172A] min-w-[95px] text-center tabular-nums">
                                        {isToday ? "Today" : format(date, "MMM dd, yyyy")}
                                    </div>
                                    <button
                                        onClick={() => { setDate(addDays(date, 1)); setManualOverride(true); }}
                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 disabled:opacity-30 transition-colors cursor-pointer"
                                        disabled={isToday}
                                        title="Next Day"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    {manualOverride && (
                                        <button
                                            onClick={() => { setManualOverride(false); setDate(getInitialDate()); }}
                                            className="ml-1 text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 border border-blue-200 transition-colors cursor-pointer"
                                        >
                                            Auto
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E2E8F0] rounded-xl shadow-2xs">
                                <Calendar size={14} className="text-blue-600" />
                                <span className="text-xs font-bold text-slate-800">{format(date, "MMM dd, yyyy")}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Date Notices */}
                {!isToday && (
                    <div className="bg-amber-50 text-amber-900 text-xs px-4 py-2.5 rounded-xl border border-amber-200/80 flex items-center gap-2 shadow-2xs">
                        <Calendar size={14} className="text-amber-600 shrink-0" />
                        <span>Viewing past entry for <strong>{format(date, "MMMM do, yyyy")}</strong>. Any saved values will update closing records.</span>
                    </div>
                )}
                {new Date().getHours() < 5 && (
                    <div className="bg-blue-50 text-blue-900 text-xs px-4 py-2.5 rounded-xl border border-blue-200/80 flex items-center gap-2 shadow-2xs">
                        <Clock size={14} className="text-blue-600 shrink-0" />
                        <span><strong>Note:</strong> You are entering sales for yesterday's shift closing. This will auto-switch to today at 5:00 AM.</span>
                    </div>
                )}

                {/* Live Settlement Summary Ribbon */}
                <div className={effectiveIsAdmin ? "grid grid-cols-2 lg:grid-cols-5 gap-3.5" : "grid grid-cols-1 sm:grid-cols-3 gap-3.5"}>
                    {/* Card 1: Counted Drawer Cash */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                        <div>
                            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Counted Drawer Cash</p>
                            <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">
                                ₹{numDrawerCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">Physical in register</span>
                            <span className={cashSaved
                                ? "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"
                                : "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200"
                            }>
                                {cashSaved ? <><CheckCircle2 size={10} /> Saved</> : "Unsaved"}
                            </span>
                        </div>
                    </div>

                    {/* Card 2: Daily Cash Expenses */}
                    <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-700">Cash Expenses</p>
                                <span className="text-[8px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 px-1 py-0.2 rounded">
                                    Auto
                                </span>
                            </div>
                            <p className="text-lg sm:text-2xl font-black text-amber-900 mt-1">
                                ₹{numDailyExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-[10px] text-amber-700">
                            <span>{dailyExpenses.length} {dailyExpenses.length === 1 ? 'item' : 'items'} paid</span>
                            <span className="font-semibold text-amber-800 flex items-center gap-0.5">
                                <Lock size={9} /> Uneditable
                            </span>
                        </div>
                    </div>

                    {/* Card 3: Total Cash Accounted (Drawer + Expenses) */}
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 p-4 rounded-2xl border border-emerald-200 shadow-2xs flex flex-col justify-between">
                        <div>
                            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-800">Total Cash Accounted</p>
                            <p className="text-lg sm:text-2xl font-black text-emerald-950 mt-1">
                                ₹{totalCashAccounted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-[10px] text-emerald-700">
                            <span>Drawer + Expenses</span>
                            <span className="font-bold">Gross Cash</span>
                        </div>
                    </div>

                    {/* Card 4: Online / UPI (Admin Only) */}
                    {effectiveIsAdmin && (
                        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Online / UPI</p>
                                    <span className="text-[8px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-1 py-0.2 rounded">
                                        Admin
                                    </span>
                                </div>
                                <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">
                                    ₹{numUpi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="mt-2.5 flex items-center justify-between">
                                <span className="text-[10px] text-slate-400">Soundbox & QR</span>
                                <span className={upiSaved
                                    ? "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"
                                    : "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200"
                                }>
                                    {upiSaved ? <><CheckCircle2 size={10} /> Saved</> : "Unsaved"}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Card 5: Total Day Settlement (Admin Only) */}
                    {effectiveIsAdmin && (
                        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-4 rounded-2xl shadow-xs flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Settlement</p>
                                    <span className="text-[8px] font-extrabold uppercase tracking-wider bg-white/20 text-white border border-white/30 px-1 py-0.2 rounded">
                                        Admin
                                    </span>
                                </div>
                                <p className="text-lg sm:text-2xl font-black text-white mt-1">
                                    ₹{totalDaySettlement.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="mt-2.5 flex items-center justify-between text-[10px] text-blue-100">
                                <span>Gross Cash + UPI</span>
                                <Sparkles size={14} className="text-amber-300" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Settlement Forms Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* Left Column: Physical Drawer Cash (and Cash Expenses for Admin) */}
                    <div className="space-y-5">
                        {/* 1. Cash Drawer Section Card */}
                        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                                        <Banknote size={18} />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-base text-[#0F172A]">Physical Drawer Cash</h2>
                                        <p className="text-xs text-slate-400">Total counted notes &amp; coins in the register</p>
                                    </div>
                                </div>
                                {cashSaved && (
                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg flex items-center gap-1 border border-emerald-200">
                                        <Lock size={11} /> Saved
                                    </span>
                                )}
                            </div>

                            <div className="space-y-3 pt-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Counted Cash in Drawer (₹)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-extrabold text-slate-400">₹</span>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        className="pl-8 text-xl sm:text-2xl font-bold h-13 rounded-xl border-slate-200 focus:border-blue-500"
                                        value={cash}
                                        onChange={(e) => setCash(e.target.value)}
                                        disabled={cashSaved && !cashEditing}
                                    />
                                </div>

                                {/* Submitter Info */}
                                {cashSaved && cashSubmittedBy && (
                                    <p className="text-xs text-slate-500 flex items-center gap-1.5 pt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        <span>Last submitted by: <strong>{cashSubmittedBy}</strong></span>
                                    </p>
                                )}

                                {/* Action Buttons */}
                                <div className="pt-2">
                                    {!cashSaved && (
                                        <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs active:scale-[0.99] transition-all cursor-pointer" onClick={saveCash}>
                                            <Save size={16} /> Save Cash Settlement
                                        </Button>
                                    )}
                                    {cashSaved && effectiveIsAdmin && !cashEditing && (
                                        <div className="flex gap-2.5 w-full">
                                            <Button className="flex-1 h-11 rounded-xl font-bold border-slate-200 hover:bg-slate-50 gap-1.5 cursor-pointer" onClick={() => setCashEditing(true)} variant="outline">
                                                <span>Edit Cash</span>
                                                <span className="text-[9px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded">
                                                    Admin Only
                                                </span>
                                            </Button>
                                            <Button className="w-32 h-11 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold gap-1 cursor-pointer" onClick={clearCash} variant="ghost">
                                                <span>Clear</span>
                                                <span className="text-[9px] font-extrabold uppercase bg-rose-50 text-rose-600 border border-rose-200 px-1 py-0.2 rounded">
                                                    Admin
                                                </span>
                                            </Button>
                                        </div>
                                    )}
                                    {cashSaved && cashEditing && (
                                        <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs cursor-pointer" onClick={saveCash}>
                                            <Save size={16} /> Save Changes
                                        </Button>
                                    )}
                                </div>

                                <p className="text-[11px] text-slate-400 pt-1">
                                    Tip: Count notes and coins thoroughly before locking in the day closing.
                                </p>
                            </div>
                        </div>

                        {/* For Admin: Also show Cash Expenses here under Drawer Cash */}
                        {effectiveIsAdmin && (
                            <div className="bg-white p-5 rounded-2xl shadow-xs border border-amber-200/90 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                                            <Receipt size={18} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h2 className="font-bold text-base text-[#0F172A]">Daily Cash Expenses</h2>
                                                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <Lock size={10} /> Auto-Synced &bull; Uneditable
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-400">Petty expenses taken from current cash during shift</p>
                                        </div>
                                    </div>
                                    <Link
                                        href="/expenses"
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline"
                                        title="Go to Daily Expenses page to add or edit expense entries"
                                    >
                                        <span>Expenses Hub</span>
                                        <ExternalLink size={12} />
                                    </Link>
                                </div>

                                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/60 flex items-center justify-between">
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                                            Total Paid from Register
                                        </p>
                                        <p className="text-2xl sm:text-3xl font-black text-amber-950 mt-0.5">
                                            ₹{numDailyExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-bold text-amber-900 bg-amber-100/70 border border-amber-200 px-2.5 py-1 rounded-lg inline-block">
                                            {expensesLoading ? (
                                                <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading...</span>
                                            ) : (
                                                `${dailyExpenses.length} ${dailyExpenses.length === 1 ? 'Voucher' : 'Vouchers'}`
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* Itemized Breakdown Toggle */}
                                {dailyExpenses.length > 0 ? (
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowExpenseBreakdown(!showExpenseBreakdown)}
                                            className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-between transition cursor-pointer"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <Receipt size={13} className="text-amber-600" />
                                                <span>{showExpenseBreakdown ? "Hide Today's Expense Items" : `View Today's Expense Items (${dailyExpenses.length})`}</span>
                                            </span>
                                            {showExpenseBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>

                                        {showExpenseBreakdown && (
                                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs animate-in fade-in duration-200 max-h-52 overflow-y-auto">
                                                {dailyExpenses.map((exp, idx) => (
                                                    <div key={exp.id || idx} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                                                        <div className="min-w-0 pr-2">
                                                            <span className="font-bold text-slate-900 block truncate">{exp.item_name}</span>
                                                            <span className="text-[11px] text-slate-400">Qty: {exp.quantity || 1}</span>
                                                        </div>
                                                        <span className="font-mono font-bold text-amber-900 shrink-0">
                                                            ₹{((exp.price_cents || 0) / 100).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                                <div className="p-2 bg-slate-50 text-[11px] text-slate-500 text-center">
                                                    Need to modify? Edit directly in <Link href="/expenses" className="text-blue-600 underline font-bold">Expenses</Link>.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-2">
                                        <Info size={14} className="text-slate-400 shrink-0" />
                                        <span>No cash expenses recorded for {format(date, "MMM dd")}. (₹0.00 added to total)</span>
                                    </div>
                                )}

                                {/* Reconciliation Formula Banner */}
                                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                                    <div className="flex items-center justify-between font-bold">
                                        <span>Total Cash Accounted Formula:</span>
                                        <span className="text-emerald-700 text-[10px] uppercase tracking-wider font-extrabold bg-emerald-100 px-2 py-0.5 rounded">Reconciliation</span>
                                    </div>
                                    <div className="font-mono font-bold text-slate-800 text-[11px] sm:text-xs flex items-center justify-between gap-1 flex-wrap pt-0.5">
                                        <span>₹{numDrawerCash.toFixed(2)} <span className="text-slate-400 text-[10px]">(Counted)</span></span>
                                        <span>+</span>
                                        <span>₹{numDailyExpenses.toFixed(2)} <span className="text-slate-400 text-[10px]">(Expenses)</span></span>
                                        <span>=</span>
                                        <span className="text-emerald-800 font-extrabold text-sm sm:text-base">
                                            ₹{totalCashAccounted.toFixed(2)} <span className="text-[10px]">(Gross Total)</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Online/UPI (Admin) OR Cash Expenses Card (in place of Closing Handoff Protocol for Staff) */}
                    {effectiveIsAdmin ? (
                        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 px-3 py-1 bg-blue-50 rounded-bl-xl border-b border-l border-blue-200 text-[10px] font-extrabold text-[#1E40AF] uppercase tracking-wider">
                                Admin Only
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
                                        <QrCode size={18} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="font-bold text-base text-[#0F172A]">Online / UPI Collections</h2>
                                            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full">
                                                Admin Only
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400">Total merchant QR &amp; soundbox collections (Hidden from staff view)</p>
                                    </div>
                                </div>
                                {upiSaved && (
                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg flex items-center gap-1 border border-emerald-200">
                                        <Lock size={11} /> Saved
                                    </span>
                                )}
                            </div>

                            <div className="space-y-3 pt-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    UPI Closing Amount (₹)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-extrabold text-slate-400">₹</span>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        className="pl-8 text-xl sm:text-2xl font-bold h-13 rounded-xl border-slate-200 focus:border-blue-500"
                                        value={upi}
                                        onChange={(e) => setUpi(e.target.value)}
                                        disabled={upiSaved && !upiEditing}
                                    />
                                </div>

                                <div className="pt-2">
                                    {!upiSaved && (
                                        <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs active:scale-[0.99] transition-all cursor-pointer" onClick={saveUpi}>
                                            <Save size={16} /> <span>Save UPI Entry</span>
                                            <span className="ml-1 text-[9px] font-extrabold uppercase bg-blue-800 text-white px-1.5 py-0.5 rounded tracking-wider">
                                                Admin Only
                                            </span>
                                        </Button>
                                    )}
                                    {upiSaved && effectiveIsAdmin && !upiEditing && (
                                        <Button className="w-full h-11 rounded-xl font-bold border-slate-200 hover:bg-slate-50 gap-1.5 cursor-pointer" onClick={() => setUpiEditing(true)} variant="outline">
                                            <span>Edit UPI</span>
                                            <span className="text-[9px] font-extrabold uppercase bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                                                Admin Only
                                            </span>
                                        </Button>
                                    )}
                                    {upiSaved && upiEditing && (
                                        <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs cursor-pointer" onClick={saveUpi}>
                                            <Save size={16} /> <span>Save Changes</span>
                                            <span className="ml-1 text-[9px] font-extrabold uppercase bg-blue-800 text-white px-1.5 py-0.5 rounded tracking-wider">
                                                Admin Only
                                            </span>
                                        </Button>
                                    )}
                                </div>

                                <p className="text-[11px] text-slate-400 pt-1">
                                    Tip: Compare with your merchant app's daily settlement summary before confirming.
                                </p>
                            </div>
                        </div>
                    ) : (
                        /* Staff View: Daily Cash Expenses Card in place of Closing Handoff Protocol */
                        <div className="bg-white p-6 rounded-2xl shadow-xs border border-amber-200/90 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                                        <Receipt size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="font-bold text-base text-[#0F172A]">Daily Cash Expenses</h2>
                                            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <Lock size={10} /> Auto-Synced &bull; Uneditable
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400">Petty expenses taken from register cash during shift</p>
                                    </div>
                                </div>
                                <Link
                                    href="/expenses"
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline shrink-0"
                                    title="Go to Daily Expenses page to view or add expense entries"
                                >
                                    <span>Expenses Hub</span>
                                    <ExternalLink size={12} />
                                </Link>
                            </div>

                            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                                        Total Paid from Register
                                    </p>
                                    <p className="text-2xl sm:text-3xl font-black text-amber-950 mt-0.5">
                                        ₹{numDailyExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-bold text-amber-900 bg-white/80 border border-amber-200 px-2.5 py-1 rounded-lg inline-block">
                                        {expensesLoading ? (
                                            <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading...</span>
                                        ) : (
                                            `${dailyExpenses.length} ${dailyExpenses.length === 1 ? 'Voucher' : 'Vouchers'}`
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Itemized Breakdown Toggle */}
                            {dailyExpenses.length > 0 ? (
                                <div className="space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowExpenseBreakdown(!showExpenseBreakdown)}
                                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-between transition cursor-pointer"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <Receipt size={13} className="text-amber-600" />
                                            <span>{showExpenseBreakdown ? "Hide Today's Expense Items" : `View Today's Expense Items (${dailyExpenses.length})`}</span>
                                        </span>
                                        {showExpenseBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>

                                    {showExpenseBreakdown && (
                                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs animate-in fade-in duration-200 max-h-56 overflow-y-auto">
                                            {dailyExpenses.map((exp, idx) => (
                                                <div key={exp.id || idx} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                                                    <div className="min-w-0 pr-2">
                                                        <span className="font-bold text-slate-900 block truncate">{exp.item_name}</span>
                                                        <span className="text-[11px] text-slate-400">Qty: {exp.quantity || 1}</span>
                                                    </div>
                                                    <span className="font-mono font-bold text-amber-900 shrink-0">
                                                        ₹{((exp.price_cents || 0) / 100).toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                            <div className="p-2 bg-slate-50 text-[11px] text-slate-500 text-center">
                                                Need to modify? Edit directly in <Link href="/expenses" className="text-blue-600 underline font-bold">Expenses</Link>.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-2">
                                    <Info size={14} className="text-slate-400 shrink-0" />
                                    <span>No cash expenses recorded for {format(date, "MMM dd")}. (₹0.00 added to total)</span>
                                </div>
                            )}

                            {/* Reconciliation Formula Banner */}
                            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                                <div className="flex items-center justify-between font-bold">
                                    <span>Total Cash Accounted Formula:</span>
                                    <span className="text-emerald-700 text-[10px] uppercase tracking-wider font-extrabold bg-emerald-100 px-2 py-0.5 rounded">Reconciliation</span>
                                </div>
                                <div className="font-mono font-bold text-slate-800 text-[11px] sm:text-xs flex items-center justify-between gap-1 flex-wrap pt-0.5">
                                    <span>₹{numDrawerCash.toFixed(2)} <span className="text-slate-400 text-[10px]">(Counted)</span></span>
                                    <span>+</span>
                                    <span>₹{numDailyExpenses.toFixed(2)} <span className="text-slate-400 text-[10px]">(Expenses)</span></span>
                                    <span>=</span>
                                    <span className="text-emerald-800 font-extrabold text-sm sm:text-base">
                                        ₹{totalCashAccounted.toFixed(2)} <span className="text-[10px]">(Gross Total)</span>
                                    </span>
                                </div>
                                <p className="text-[10px] text-emerald-800 pt-0.5">
                                    Accounts for all cash collected from sales before store petty expenses were paid.
                                </p>
                            </div>

                            {/* Handoff Protocol Footer inside Cash Expenses */}
                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Shift Handoff Checklist
                                </p>
                                <ul className="space-y-1.5 text-xs text-slate-600">
                                    <li className="flex items-start gap-2">
                                        <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[9px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                                        <span>Count physical register notes &amp; coins and enter on left.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[9px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                                        <span>Ensure all petty expense receipts match the items listed above.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[9px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                                        <span>Tap <strong>Save Cash Settlement</strong> and hand over cash drawer bag + receipts to manager.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sub-banner linking directly to the new dedicated Analytics page */}
                <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 text-blue-900">
                        <BarChart3 className="w-5 h-5 text-blue-600 shrink-0" />
                        <div>
                            <span className="font-bold">Need historical trends &amp; reports?</span>
                            <span className="text-slate-600 block sm:inline sm:ml-1">
                                Check daily, monthly, and yearly Cash vs UPI charts and export PDF reports.
                            </span>
                        </div>
                    </div>
                    <Link
                        href="/admin/sales"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold transition shadow-2xs shrink-0 self-start sm:self-auto"
                    >
                        <span>Open Cash &amp; UPI Analytics</span>
                        <ChevronRight size={13} />
                    </Link>
                </div>

                {/* Success Modal for Regular Users */}
                {showSaveSuccess && !effectiveIsAdmin && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center border border-[#E2E8F0]">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#F0FDF4] rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#DCFCE7] shadow-xs">
                                <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[#16A34A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-xl sm:text-2xl font-bold text-[#0F172A] mb-2">Settlement Recorded!</h3>
                            <p className="text-sm text-[#64748B] mb-4">Thanks for balancing the register. Your cash closing has been safely recorded.</p>
                            <p className="text-xs text-slate-400">Closing automatically...</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
