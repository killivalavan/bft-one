"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
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
    Sparkles
} from "lucide-react";
import Link from "next/link";
import { format, addDays, isSameDay } from "date-fns";

export default function SalesPage() {
    const { toast } = useToast();
    const { business } = useTenant();
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [profileBusinessId, setProfileBusinessId] = useState<string | null>(null);

    // Date State
    const getInitialDate = () => {
        const now = new Date();
        return now.getHours() < 9 ? addDays(now, -1) : now;
    };
    const [date, setDate] = useState<Date>(getInitialDate);
    const [manualOverride, setManualOverride] = useState(false);
    const dateStr = format(date, "yyyy-MM-dd");
    const isToday = isSameDay(date, new Date());

    // Form State
    const [cash, setCash] = useState("");
    const [upi, setUpi] = useState("");

    // Status State (Saved/Locked)
    const [cashSaved, setCashSaved] = useState(false);
    const [upiSaved, setUpiSaved] = useState(false);
    const [cashEditing, setCashEditing] = useState(false);
    const [upiEditing, setUpiEditing] = useState(false);
    const [cashSubmittedBy, setCashSubmittedBy] = useState<string | null>(null);
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);

    const currentBusinessId = business?.id || profileBusinessId;

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
                .select("is_admin, business_id")
                .eq("id", user.id)
                .single();

            setIsAdmin(!!profile?.is_admin);
            if (profile?.business_id) {
                setProfileBusinessId(profile.business_id);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchSales() {
        // Reset state for new date
        setCash("");
        setUpi("");
        setCashSaved(false);
        setUpiSaved(false);
        setCashSubmittedBy(null);

        let query = supabaseClient
            .from("daily_sales")
            .select("*")
            .eq("sale_date", dateStr);

        if (currentBusinessId) {
            query = query.eq("business_id", currentBusinessId);
        }

        const { data } = await query.maybeSingle();

        if (data) {
            if (data.total_cash_cents !== null) {
                setCash((data.total_cash_cents / 100).toString());
                setCashSaved(true);
                setCashEditing(false);
                // Fetch the submitter's email and extract name
                if (data.cash_submitted_by) {
                    const { data: profile } = await supabaseClient.from("profiles").select("email").eq("id", data.cash_submitted_by).maybeSingle();
                    if (profile?.email) {
                        const name = profile.email.split("@")[0].replace(/[._-]/g, " ");
                        const capitalizedName = name.split(" ").map((word: any) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
                        setCashSubmittedBy(capitalizedName);
                    }
                }
            }
            if (data.upi_amount_cents !== null) {
                setUpi((data.upi_amount_cents / 100).toString());
                setUpiSaved(true);
                setUpiEditing(false);
            }
        }
    }

    // Auto-switch visible date to today when clock passes 9:00
    useEffect(() => {
        const id = setInterval(() => {
            const now = new Date();
            if (now.getHours() >= 9 && !manualOverride) {
                const yesterday = addDays(now, -1);
                if (isSameDay(date, yesterday)) {
                    setDate(now);
                    toast({ title: "Date switched to today", description: "Automatically switched after 09:00", variant: "info" });
                }
            }
        }, 60 * 1000);
        return () => clearInterval(id);
    }, [date]);

    const DEFAULT_BUSINESS_ID = "a0000000-0000-0000-0000-000000000001";

    async function getEffectiveBusinessId(): Promise<string> {
        if (currentBusinessId) return currentBusinessId;
        if (business?.id) return business.id;
        if (userId) {
            const { data: prof } = await supabaseClient.from("profiles").select("business_id").eq("id", userId).maybeSingle();
            if (prof?.business_id) {
                setProfileBusinessId(prof.business_id);
                return prof.business_id;
            }
        }
        return DEFAULT_BUSINESS_ID;
    }

    async function saveCash() {
        if (!cash || isNaN(Number(cash))) {
            toast({ title: "Invalid Amount", description: "Please enter a valid cash amount", variant: "error" });
            return;
        }

        const cents = Math.round(Number(cash) * 100);
        // If user is saving on 'today' before 9:00, record as yesterday
        const now = new Date();
        let targetDate = date;
        if (isSameDay(date, new Date()) && now.getHours() < 9) {
            targetDate = addDays(date, -1);
        }
        const saveDateStr = format(targetDate, "yyyy-MM-dd");
        const bId = await getEffectiveBusinessId();

        const { data: existing } = await supabaseClient
            .from("daily_sales")
            .select("id")
            .eq("sale_date", saveDateStr)
            .eq("business_id", bId)
            .maybeSingle();

        let error;
        if (existing) {
            const { error: err } = await supabaseClient.from("daily_sales").update({
                total_cash_cents: cents,
                cash_submitted_by: userId,
                updated_at: new Date().toISOString()
            }).eq("id", existing.id);
            error = err;
        } else {
            const { error: err } = await supabaseClient.from("daily_sales").insert({
                business_id: bId,
                sale_date: saveDateStr,
                total_cash_cents: cents,
                cash_submitted_by: userId,
            });
            error = err;
        }

        if (error) toast({ title: "Failed to save", description: error.message, variant: "error" });
        else {
            toast({ title: "Cash Sales Saved", variant: "success" });
            setCashSaved(true);
            setCashEditing(false);
            // Show success modal for non-admin users
            if (!isAdmin) {
                setShowSaveSuccess(true);
                setTimeout(() => setShowSaveSuccess(false), 5000);
            }
            // Refetch to get updated submitter info
            await fetchSales();
        }
    }

    async function clearCash() {
        if (!confirm("Clear cash amount for the selected date?")) return;
        const now = new Date();
        let targetDate = date;
        if (isSameDay(date, new Date()) && now.getHours() < 9) {
            targetDate = addDays(date, -1);
        }
        const saveDateStr = format(targetDate, "yyyy-MM-dd");
        const bId = await getEffectiveBusinessId();

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

        const { error } = await supabaseClient.from("daily_sales").update({ total_cash_cents: null, cash_submitted_by: null, updated_at: new Date().toISOString() }).eq("id", existing.id);
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

        const cents = Math.round(Number(upi) * 100);
        // If user is saving on 'today' before 9:00, record as yesterday
        const now = new Date();
        let targetDate = date;
        if (isSameDay(date, new Date()) && now.getHours() < 9) {
            targetDate = addDays(date, -1);
        }
        const saveDateStr = format(targetDate, "yyyy-MM-dd");
        const bId = await getEffectiveBusinessId();

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
        }
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

    const numCash = Number(cash) || 0;
    const numUpi = Number(upi) || 0;
    const totalSettlement = numCash + numUpi;

    return (
        <div className="min-h-screen bg-slate-50/50 pb-20 md:pb-12">
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
                        {isAdmin ? (
                            <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-xl p-1 shadow-2xs">
                                <button
                                    onClick={() => { setDate(addDays(date, -1)); setManualOverride(true); }}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                                    title="Previous Day"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <div className="px-2.5 text-xs font-bold text-[#0F172A] min-w-[95px] text-center tabular-nums">
                                    {isToday ? "Today" : format(date, "MMM dd, yyyy")}
                                </div>
                                <button
                                    onClick={() => { setDate(addDays(date, 1)); setManualOverride(true); }}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 disabled:opacity-30 transition-colors"
                                    disabled={isToday}
                                    title="Next Day"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                {manualOverride && (
                                    <button
                                        onClick={() => { setManualOverride(false); setDate(getInitialDate()); }}
                                        className="ml-1 text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 border border-blue-200 transition-colors"
                                    >
                                        Auto
                                    </button>
                                )}
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
                {new Date().getHours() < 9 && (
                    <div className="bg-blue-50 text-blue-900 text-xs px-4 py-2.5 rounded-xl border border-blue-200/80 flex items-center gap-2 shadow-2xs">
                        <Clock size={14} className="text-blue-600 shrink-0" />
                        <span><strong>Note:</strong> You are entering sales for yesterday's shift closing. This will auto-switch to today at 9:00 AM.</span>
                    </div>
                )}

                {/* Live Settlement Summary Ribbon */}
                <div className={isAdmin ? "grid grid-cols-1 sm:grid-cols-3 gap-4" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Drawer Cash</p>
                            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                                ₹{numCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <span className={cashSaved
                            ? "px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"
                            : "px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200"
                        }>
                            {cashSaved ? <><CheckCircle2 size={11} /> Saved</> : "Unsaved"}
                        </span>
                    </div>

                    {isAdmin && (
                        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Online / UPI</p>
                                <p className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                                    ₹{numUpi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <span className={upiSaved
                                ? "px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"
                                : "px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200"
                            }>
                                {upiSaved ? <><CheckCircle2 size={11} /> Saved</> : "Unsaved"}
                            </span>
                        </div>
                    )}

                    <div className={isAdmin
                        ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-4 rounded-2xl shadow-xs flex items-center justify-between"
                        : "bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between"
                    }>
                        <div>
                            <p className={isAdmin ? "text-[11px] font-bold uppercase tracking-wider text-blue-100" : "text-[11px] font-bold uppercase tracking-wider text-slate-400"}>
                                {isAdmin ? "Total Day Closing" : "Shift Date"}
                            </p>
                            <p className={isAdmin ? "text-xl sm:text-2xl font-black text-white mt-0.5" : "text-base sm:text-lg font-bold text-slate-900 mt-0.5"}>
                                {isAdmin
                                    ? `₹${totalSettlement.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                    : format(date, "EEEE, MMM dd")}
                            </p>
                        </div>
                        {isAdmin && (
                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                                <Sparkles size={18} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Settlement Forms Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* Cash Section Card */}
                    <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                                    <Banknote size={18} />
                                </div>
                                <div>
                                    <h2 className="font-bold text-base text-[#0F172A]">Physical Drawer Cash</h2>
                                    <p className="text-xs text-slate-400">Total counted cash from the cashier register</p>
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
                                Cash Closing Amount (₹)
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
                                    <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs active:scale-[0.99] transition-all" onClick={saveCash}>
                                        <Save size={16} /> Save Cash Entry
                                    </Button>
                                )}
                                {cashSaved && isAdmin && !cashEditing && (
                                    <div className="flex gap-2.5 w-full">
                                        <Button className="flex-1 h-11 rounded-xl font-bold border-slate-200 hover:bg-slate-50" onClick={() => setCashEditing(true)} variant="outline">
                                            Edit Cash
                                        </Button>
                                        <Button className="w-28 h-11 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold" onClick={clearCash} variant="ghost">
                                            Clear
                                        </Button>
                                    </div>
                                )}
                                {cashSaved && cashEditing && (
                                    <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs" onClick={saveCash}>
                                        <Save size={16} /> Save Changes
                                    </Button>
                                )}
                            </div>

                            <p className="text-[11px] text-slate-400 pt-1">
                                Tip: Count notes and coins thoroughly before locking in the day closing.
                            </p>
                        </div>
                    </div>

                    {/* UPI Section (Admin) or Staff Guidelines Checklist (Staff) */}
                    {isAdmin ? (
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
                                        <h2 className="font-bold text-base text-[#0F172A]">Online / UPI Collections</h2>
                                        <p className="text-xs text-slate-400">Total merchant QR & soundbox collections</p>
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
                                        <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs active:scale-[0.99] transition-all" onClick={saveUpi}>
                                            <Save size={16} /> Save UPI Entry
                                        </Button>
                                    )}
                                    {upiSaved && isAdmin && !upiEditing && (
                                        <Button className="w-full h-11 rounded-xl font-bold border-slate-200 hover:bg-slate-50" onClick={() => setUpiEditing(true)} variant="outline">
                                            Edit UPI
                                        </Button>
                                    )}
                                    {upiSaved && upiEditing && (
                                        <Button className="w-full h-11 gap-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl font-bold shadow-xs" onClick={saveUpi}>
                                            <Save size={16} /> Save Changes
                                        </Button>
                                    )}
                                </div>

                                <p className="text-[11px] text-slate-400 pt-1">
                                    Tip: Compare with your merchant app's daily settlement summary before confirming.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
                                    <CheckCircle2 size={18} />
                                </div>
                                <div>
                                    <h2 className="font-bold text-base text-[#0F172A]">Closing Handoff Protocol</h2>
                                    <p className="text-xs text-slate-400">End-of-shift checklist for cashier staff</p>
                                </div>
                            </div>

                            <ul className="space-y-3 pt-2 text-xs text-slate-600">
                                <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                                    <span>Count all physical denomination notes & coins in the cash drawer accurately.</span>
                                </li>
                                <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                                    <span>Verify that any petty expenses paid from the register were recorded in <strong>Expenses</strong>.</span>
                                </li>
                                <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                                    <span>Enter the total cash figure on the left and tap <strong>Save Cash Entry</strong>.</span>
                                </li>
                                <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                                    <span>Handoff the cash bag and key to the store manager or admin on duty.</span>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Success Modal for Regular Users */}
                {showSaveSuccess && !isAdmin && (
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
