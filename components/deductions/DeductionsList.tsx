"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/Card";
import { Loader2, Clock, AlertCircle, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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
        (async () => {
            try {
                setLoading(true);

                // Fetch salary entries with user emails - only late deductions
                const { data: entries, error } = await supabaseClient
                    .from('salary_entries')
                    .select(`
                        id,
                        entry_date,
                        amount_cents,
                        reason,
                        kind,
                        user_id,
                        profiles!inner(id, email)
                    `)
                    .eq('kind', 'deduction')
                    .order('entry_date', { ascending: false });

                if (error) {
                    console.error('Failed to fetch deductions:', error);
                    return;
                }

                // Transform and filter data - only late deductions
                const transformedData: DeductionRecord[] = (entries || [])
                    .map((entry: any) => ({
                        id: entry.id,
                        user_email: entry.profiles?.email || 'Unknown',
                        user_id: entry.user_id,
                        reason: entry.reason,
                        amount_cents: entry.amount_cents,
                        entry_date: entry.entry_date,
                    }))
                    .filter((record) => record.reason.toLowerCase().includes('late'));

                setDeductions(transformedData);
            } catch (err) {
                console.error('Error loading deductions:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
        );
    }

    // Filter deductions by selected month
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    
    const filteredDeductions = deductions.filter(record => {
        const recordDate = new Date(record.entry_date);
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
                                <div className="grid grid-cols-3 gap-2">
                                    {(() => {
                                        const now = new Date();
                                        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                                        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                                        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

                                        const thisMonthAmount = records
                                            .filter(r => new Date(r.entry_date) >= currentMonth)
                                            .reduce((sum, r) => sum + r.amount_cents, 0);

                                        const lastMonthAmount = records
                                            .filter(r => {
                                                const d = new Date(r.entry_date);
                                                return d >= lastMonth && d < currentMonth;
                                            })
                                            .reduce((sum, r) => sum + r.amount_cents, 0);

                                        const lastSixMonthsAmount = records
                                            .filter(r => new Date(r.entry_date) >= sixMonthsAgo)
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
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0">
                                                    <Clock className="w-4 h-4 text-red-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-zinc-500">
                                                        {new Date(record.entry_date).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right ml-2 flex-shrink-0">
                                                <p className="font-semibold text-red-600">₹ {(record.amount_cents / 100).toFixed(2)}</p>
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
