"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ChevronLeft, ChevronRight, Loader2, Save, Lock, Calendar } from "lucide-react";
import Link from "next/link";
import { format, addDays, isSameDay } from "date-fns";

export default function SalesPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

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

    useEffect(() => {
        checkUser();
    }, []);

    // Fetch data whenever date changes (if user is loaded)
    useEffect(() => {
        if (userId) fetchSales();
    }, [date, userId]);

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

    async function fetchSales() {
        // Reset state for new date
        setCash("");
        setUpi("");
        setCashSaved(false);
        setUpiSaved(false);
        setCashSubmittedBy(null);

        const { data } = await supabaseClient
            .from("daily_sales")
            .select("*")
            .eq("sale_date", dateStr)
            .maybeSingle();

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
        const { data: existing } = await supabaseClient.from("daily_sales").select("id").eq("sale_date", saveDateStr).maybeSingle();

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
                sale_date: saveDateStr,
                total_cash_cents: cents,
                cash_submitted_by: userId
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
                setTimeout(() => setShowSaveSuccess(false), 10000);
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

        const { data: existing } = await supabaseClient.from("daily_sales").select("id").eq("sale_date", saveDateStr).maybeSingle();
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
        const { data: existing } = await supabaseClient.from("daily_sales").select("id").eq("sale_date", saveDateStr).maybeSingle();

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
                sale_date: saveDateStr,
                upi_amount_cents: cents,
                upi_submitted_by: userId
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

    return (
        <div className="min-h-screen bg-neutral-50/50 pb-20 md:pb-10">
            <div className="max-w-md mx-auto p-4 space-y-6">
                {/* Header */}
                <div className="space-y-4">
                    <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors text-sm font-medium">
                        <ChevronLeft size={16} />
                        Back Home
                    </Link>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Daily Sales Entry</h1>
                            <p className="text-zinc-500 text-sm">Log sales data</p>
                        </div>

                        {/* Display the date user is entering for (non-admin only) */}
                        {!isAdmin && (
                            <div className="text-right">
                                <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">Entering for</p>
                                <p className="text-base sm:text-lg font-bold text-zinc-900">{format(date, "MMM dd, yyyy")}</p>
                            </div>
                        )}
                        {isAdmin && (
                            <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 shadow-sm">
                                <button onClick={() => { setDate(addDays(date, -1)); setManualOverride(true); }} className="p-2 hover:bg-zinc-50 rounded-md text-zinc-600">
                                    <ChevronLeft size={18} />
                                </button>
                                <div className="px-2 text-sm font-semibold text-zinc-900 min-w-[100px] text-center">
                                    {isToday ? "Today" : format(date, "MMM dd")}
                                </div>
                                <button
                                    onClick={() => { setDate(addDays(date, 1)); setManualOverride(true); }}
                                    className="p-2 hover:bg-zinc-50 rounded-md text-zinc-600 disabled:opacity-30"
                                    disabled={isToday}
                                >
                                    <ChevronRight size={18} />
                                </button>
                                {manualOverride && (
                                    <button onClick={() => { setManualOverride(false); setDate(getInitialDate()); }} className="ml-2 text-xs px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200">
                                        Auto
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    {!isToday && (
                        <div className="bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-2">
                            <Calendar size={12} />
                            Viewing past entry: <strong>{format(date, "MMMM do, yyyy")}</strong>
                        </div>
                    )}
                    {/* Helper note when current time is before 9am */}
                    {new Date().getHours() < 9 && (
                        <div className="bg-blue-50 text-blue-700 text-sm px-4 py-3 rounded-lg border border-blue-200 flex items-center gap-2">
                            <Calendar size={14} />
                            <span><strong>Note:</strong> You are entering sales for yesterday (shop closing). This will auto-switch to today at 9:00 AM.</span>
                        </div>
                    )}
                </div>

                <div className="grid gap-6">
                    {/* Cash Section */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-zinc-900">Total Cash</h2>
                            {cashSaved && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1"><Lock size={10} /> Saved</span>}
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-zinc-600">Enter Cash Amount (₹)</label>
                            <Input
                                type="number"
                                placeholder="0.00"
                                className="text-lg"
                                value={cash}
                                onChange={(e) => setCash(e.target.value)}
                                disabled={cashSaved && !cashEditing}
                            />
                            {/* Show submitter info in grey */}
                            {cashSaved && cashSubmittedBy && (
                                <p className="text-xs text-zinc-400">Updated by: {cashSubmittedBy}</p>
                            )}
                            <div className="flex gap-2">
                                {!cashSaved && (
                                    <Button className="w-full gap-2" onClick={saveCash}>
                                        <Save size={16} /> Save Cash Entry
                                    </Button>
                                )}
                                {cashSaved && isAdmin && !cashEditing && (
                                    <div className="flex gap-2 w-full">
                                        <Button className="flex-1" onClick={() => setCashEditing(true)} variant="outline">
                                            Edit Cash
                                        </Button>
                                        <Button className="w-28" onClick={clearCash} variant="ghost">
                                            Clear
                                        </Button>
                                    </div>
                                )}
                                {cashSaved && cashEditing && (
                                    <Button className="w-full gap-2" onClick={saveCash}>
                                        <Save size={16} /> Save
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* UPI Section - Admin Only */}
                    {isAdmin ? (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 space-y-4 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 bg-purple-50 rounded-bl-xl border-b border-l border-purple-100 text-[10px] font-bold text-purple-600 uppercase tracking-wider">
                                Admin Only
                            </div>
                            <div className="flex items-center justify-between">
                                <h2 className="font-semibold text-zinc-900">Online / UPI</h2>
                                {upiSaved && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1"><Lock size={10} /> Saved</span>}
                            </div>
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-zinc-600">Enter UPI Amount (₹)</label>
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    className="text-lg"
                                    value={upi}
                                    onChange={(e) => setUpi(e.target.value)}
                                    disabled={upiSaved && !upiEditing}
                                />
                                <div className="flex gap-2">
                                    {!upiSaved && (
                                        <Button className="w-full gap-2" onClick={saveUpi} variant="primary">
                                            <Save size={16} /> Save UPI Entry
                                        </Button>
                                    )}
                                    {upiSaved && isAdmin && !upiEditing && (
                                        <Button className="w-full gap-2" onClick={() => setUpiEditing(true)} variant="outline">
                                            Edit UPI
                                        </Button>
                                    )}
                                    {upiSaved && upiEditing && (
                                        <Button className="w-full gap-2" onClick={saveUpi} variant="primary">
                                            <Save size={16} /> Save
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Success Modal for Regular Users */}
                {showSaveSuccess && !isAdmin && (
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center animate-in scale-in duration-300">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-600 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-2">Thank You!</h3>
                            <p className="text-sm sm:text-base text-zinc-600 mb-4">Thanks for your calculation. Your entry has been recorded successfully.</p>
                            <p className="text-xs sm:text-sm text-zinc-400">This message will close automatically...</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
