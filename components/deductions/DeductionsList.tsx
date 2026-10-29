"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/Card";
import { Loader2, Clock, AlertCircle, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useUser } from "@/lib/hooks/useUser";

interface DeductionRecord {
    id: string;
    user_email: string;
    user_id: string;
    reason: string;
    amount_cents: number;
    entry_date: string;
}

export function DeductionsList() {
    const [deductions, setDeductions] = useState<DeductionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
    const [currentMonth, setCurrentMonth] = useState<Date>(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const { user, loading: authLoading } = useUser();

    const toggleUser = (email: string) => {
        setExpandedUsers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(email)) {
                newSet.delete(email);
            } else {
                newSet.add(email);
            }
            return newSet;
        });
    };

    const previousMonth = () => {
        setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    };

    useEffect(() => {
        if (authLoading) return;

        let mounted = true;

        (async () => {
            try {
                setLoading(true);

                if (!user) {
                    setDeductions([]);
                    return;
                }

                // 1. Fetch via API endpoint with auth bearer token
                const { data: { session } } = await supabaseClient.auth.getSession();
                const token = session?.access_token;

                let records: DeductionRecord[] = [];
                try {
                    const res = await fetch(`/api/deductions`, {
                        headers: {
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                    });

                    if (res.ok) {
                        const payload = await res.json();
                        if (Array.isArray(payload?.deductions)) {
                            records = payload.deductions;
                        }
                    } else {
                        console.warn("Deductions API returned non-OK status:", res.status);
                    }
                } catch (fetchErr) {
                    console.warn("Deductions API fetch failed:", fetchErr);
                }

                // 2. Resilient direct query fallback if API returned 0 records or failed
                if (records.length === 0) {
                    const { data: entries } = await supabaseClient
                        .from("salary_entries")
                        .select(`
                            id,
                            entry_date,
                            amount_cents,
                            reason,
                            kind,
                            user_id,
                            profiles(id, email)
                        `)
                        .eq("kind", "deduction")
                        .order("entry_date", { ascending: false });

                    if (entries && entries.length > 0) {
                        records = entries
                            .map((entry: any) => ({
                                id: entry.id,
                                user_email: entry.profiles?.email || (Array.isArray(entry.profiles) ? entry.profiles[0]?.email : null) || "Unknown",
                                user_id: entry.user_id,
                                reason: entry.reason,
                                amount_cents: entry.amount_cents,
                                entry_date: entry.entry_date,
                            }))
                            .filter((record: any) => typeof record.reason === "string" && record.reason.toLowerCase().includes("late"));
                    }
                }

                if (mounted) {
                    setDeductions(records);
                }
            } catch (err) {
                console.error("Error loading deductions:", err);
                if (mounted) setDeductions([]);
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [authLoading, user]);

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
        );
    }

    // Filter deductions by selected month
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const filteredDeductions = deductions.filter(record => {
        const [y, m, d] = (record.entry_date || "").split("-").map(Number);
        if (!y || !m || !d) return false;
        const recordDate = new Date(y, m - 1, d);
        return recordDate >= monthStart && recordDate <= monthEnd;
    });

    if (filteredDeductions.length === 0) {
        return (
            <div className="space-y-4">
                {/* Month Navigation */}
                <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-zinc-200">
                    <button
                        onClick={previousMonth}
                        className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <h3 className="font-semibold text-zinc-900 text-lg">
                        {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h3>
                    <button
                        onClick={nextMonth}
                        className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                        <ChevronRight className="w-5 h-5 text-zinc-600" />
                    </button>
                </div>

                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="w-12 h-12 text-zinc-300 mb-3" />
                    <p className="text-zinc-500 text-sm">No late deductions found for {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                </div>
            </div>
        );
    }

    // Group filtered deductions by employee
    const groupedByEmployee = filteredDeductions.reduce((acc, record) => {
        if (!acc[record.user_email]) {
            acc[record.user_email] = [];
        }
        acc[record.user_email].push(record);
        return acc;
    }, {} as Record<string, DeductionRecord[]>);

    return (
        <div className="space-y-4">
            {/* Month Navigation */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-zinc-200">
                <button
                    onClick={previousMonth}
                    className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-5 h-5 text-zinc-600" />
                </button>
                <h3 className="font-semibold text-zinc-900 text-lg">
                    {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                    onClick={nextMonth}
                    className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                    <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>
            </div>

            {/* Deductions List */}
            <div className="space-y-3">
            {Object.entries(groupedByEmployee)
                .sort(([, recordsA], [, recordsB]) => {
                    const totalA = recordsA.reduce((sum, record) => sum + record.amount_cents, 0);
                    const totalB = recordsB.reduce((sum, record) => sum + record.amount_cents, 0);
                    return totalB - totalA; // Descending order (highest first)
                })
                .map(([email, records]) => {
                const totalDeduction = records.reduce((sum, record) => sum + record.amount_cents, 0);
                const isExpanded = expandedUsers.has(email);
                // Extract name from email and capitalize first letter
                const employeeName = email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);

                return (
                    <Card
                        key={email}
                        className="overflow-hidden border border-zinc-200 hover:border-zinc-300 transition-all"
                    >
                        {/* Accordion Header */}
                        <button
                            onClick={() => toggleUser(email)}
                            className="w-full p-5 bg-white hover:bg-zinc-50 transition-colors flex items-center justify-between"
                        >
                            <div className="flex items-center justify-between flex-1">
                                <div className="text-left">
                                    <h3 className="font-semibold text-zinc-900">{employeeName}</h3>
                                    <p className="text-xs text-zinc-500 mt-1">{records.length} late deduction(s)</p>
                                </div>
                                <div className="ml-4 text-right">
                                    <p className="text-lg font-bold text-red-600">₹ {(totalDeduction / 100).toFixed(2)}</p>
                                    <p className="text-xs text-zinc-400">Total</p>
                                </div>
                            </div>
                            <ChevronDown
                                className={cn(
                                    "w-5 h-5 text-zinc-400 transition-transform duration-300 ml-4 flex-shrink-0",
                                    isExpanded && "rotate-180"
                                )}
                            />
                        </button>

                        {/* Accordion Content */}
                        {isExpanded && (
                            <div className="border-t border-zinc-100 bg-white px-5 py-4 space-y-4">
                                {/* Summary Chips */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {(() => {
                                        const allEmployeeRecords = deductions.filter(r => r.user_email === email);
                                        const refDate = currentMonth || new Date();
                                        const curMonthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
                                        const curMonthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);

                                        const lastMonthStart = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1, 0, 0, 0, 0);
                                        const lastMonthEnd = new Date(refDate.getFullYear(), refDate.getMonth(), 0, 23, 59, 59, 999);

                                        const sixMonthsAgoStart = new Date(refDate.getFullYear(), refDate.getMonth() - 5, 1, 0, 0, 0, 0);

                                        const parseEntryDate = (dateStr: string) => {
                                            const [y, m, d] = (dateStr || "").split("-").map(Number);
                                            return new Date(y, (m || 1) - 1, d || 1);
                                        };

                                        const thisMonthAmount = allEmployeeRecords
                                            .filter(r => {
                                                const d = parseEntryDate(r.entry_date);
                                                return d >= curMonthStart && d <= curMonthEnd;
                                            })
                                            .reduce((sum, r) => sum + r.amount_cents, 0);

                                        const lastMonthAmount = allEmployeeRecords
                                            .filter(r => {
                                                const d = parseEntryDate(r.entry_date);
                                                return d >= lastMonthStart && d <= lastMonthEnd;
                                            })
                                            .reduce((sum, r) => sum + r.amount_cents, 0);

                                        const lastSixMonthsAmount = allEmployeeRecords
                                            .filter(r => {
                                                const d = parseEntryDate(r.entry_date);
                                                return d >= sixMonthsAgoStart && d <= curMonthEnd;
                                            })
                                            .reduce((sum, r) => sum + r.amount_cents, 0);

                                        return (
                                            <>
                                                <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-3 text-center">
                                                    <p className="text-xs text-red-600 font-medium">This Month</p>
                                                    <p className="text-sm font-bold text-red-700">₹ {(thisMonthAmount / 100).toFixed(2)}</p>
                                                </div>
                                                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-3 text-center">
                                                    <p className="text-xs text-orange-600 font-medium">Last Month</p>
                                                    <p className="text-sm font-bold text-orange-700">₹ {(lastMonthAmount / 100).toFixed(2)}</p>
                                                </div>
                                                <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3 text-center">
                                                    <p className="text-xs text-amber-600 font-medium">Last 6M</p>
                                                    <p className="text-sm font-bold text-amber-700">₹ {(lastSixMonthsAmount / 100).toFixed(2)}</p>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Deduction Details */}
                                <div className="space-y-2 pt-2 border-t border-zinc-100">
                                    {records.map((record) => (
                                        <div key={record.id} className="flex items-center justify-between bg-red-50 p-3 rounded-lg">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 rounded-full bg-red-100 p-1.5 text-red-600">
                                                    <Clock className="w-3.5 h-3.5" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-zinc-800 text-sm">{record.reason}</p>
                                                    <p className="text-xs text-zinc-500 mt-1">
                                                        {new Date(record.entry_date).toLocaleDateString('en-GB', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric'
                                                        })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-red-600 text-sm">₹ {(record.amount_cents / 100).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>
                );
            })}
            </div>
        </div>
    );
}
