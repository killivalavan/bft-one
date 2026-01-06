"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ChevronLeft, Loader2, Save, Lock } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default function SalesPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    // Form State
    const [cash, setCash] = useState("");
    const [upi, setUpi] = useState("");

    // Status State (Saved/Locked)
    const [cashSaved, setCashSaved] = useState(false);
    const [upiSaved, setUpiSaved] = useState(false);

    const todayStr = format(new Date(), "yyyy-MM-dd");

    useEffect(() => {
        checkUser();
    }, []);

    async function checkUser() {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                // Redirect or show generic loading? 
                // Middleware usually handles this but we'll be safe
                return;
            }
            setUserId(user.id);

            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("is_admin")
                .eq("id", user.id)
                .single();

            setIsAdmin(!!profile?.is_admin);

            await fetchTodaySales();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchTodaySales() {
        const { data, error } = await supabaseClient
            .from("daily_sales")
            .select("*")
            .eq("sale_date", todayStr)
            .maybeSingle();

        if (data) {
            if (data.total_cash_cents !== null) {
                setCash((data.total_cash_cents / 100).toString());
                setCashSaved(true);
            }
            if (data.upi_amount_cents !== null) {
                setUpi((data.upi_amount_cents / 100).toString());
                setUpiSaved(true);
            }
        }
    }

    async function saveCash() {
        if (!cash || isNaN(Number(cash))) {
            toast({ title: "Invalid Amount", description: "Please enter a valid cash amount", variant: "error" });
            return;
        }

        const cents = Math.round(Number(cash) * 100);

        // UPSERT logic: conflict on sale_date
        // We need to fetch existing first to preserve potential UPI data if row exists?
        // Actually supabase upsert merges if we don't specify columns to ignore, 
        // but let's be safe and check if row exists to do update vs insert.

        const { data: existing } = await supabaseClient
            .from("daily_sales")
            .select("id")
            .eq("sale_date", todayStr)
            .maybeSingle();

        let error;
        if (existing) {
            const { error: err } = await supabaseClient
                .from("daily_sales")
                .update({
                    total_cash_cents: cents,
                    cash_submitted_by: userId,
                    updated_at: new Date().toISOString()
                })
                .eq("id", existing.id);
            error = err;
        } else {
            const { error: err } = await supabaseClient
                .from("daily_sales")
                .insert({
                    sale_date: todayStr,
                    total_cash_cents: cents,
                    cash_submitted_by: userId
                });
            error = err;
        }

        if (error) {
            toast({ title: "Failed to save", description: error.message, variant: "error" });
        } else {
            toast({ title: "Cash Sales Saved", variant: "success" });
            setCashSaved(true);
        }
    }

    async function saveUpi() {
        if (!upi || isNaN(Number(upi))) {
            toast({ title: "Invalid Amount", description: "Please enter a valid UPI amount", variant: "error" });
            return;
        }

        const cents = Math.round(Number(upi) * 100);

        const { data: existing } = await supabaseClient
            .from("daily_sales")
            .select("id")
            .eq("sale_date", todayStr)
            .maybeSingle();

        let error;
        if (existing) {
            const { error: err } = await supabaseClient
                .from("daily_sales")
                .update({
                    upi_amount_cents: cents,
                    upi_submitted_by: userId,
                    updated_at: new Date().toISOString()
                })
                .eq("id", existing.id);
            error = err;
        } else {
            // Theoretically admin shouldn't be inserting NEW row for UPI before Cash? 
            // Possibly, so handle insert too.
            const { error: err } = await supabaseClient
                .from("daily_sales")
                .insert({
                    sale_date: todayStr,
                    upi_amount_cents: cents,
                    upi_submitted_by: userId
                });
            error = err;
        }

        if (error) {
            toast({ title: "Failed to save", description: error.message, variant: "error" });
        } else {
            toast({ title: "UPI Sales Saved", variant: "success" });
            setUpiSaved(true);
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
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Daily Sales Entry</h1>
                    <p className="text-zinc-500 text-sm">Log today's sales data ({todayStr})</p>
                </div>

                <div className="grid gap-6">
                    {/* Cash Section - Visible to All */}
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
                                disabled={cashSaved && !isAdmin}
                            />
                            {(!cashSaved || isAdmin) && (
                                <Button className="w-full gap-2" onClick={saveCash}>
                                    <Save size={16} /> {cashSaved ? "Update Cash Entry" : "Save Cash Entry"}
                                </Button>
                            )}
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
                                    disabled={upiSaved}
                                />
                                {!upiSaved && (
                                    <Button className="w-full gap-2" onClick={saveUpi} variant="primary">
                                        <Save size={16} /> Save UPI Entry
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Hidden for normal users, or show placeholder? Requirements say "not visible".
                        null
                    )}
                </div>
            </div>
        </div>
    );
}
