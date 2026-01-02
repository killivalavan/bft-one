"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { Loader2, User, Clock, X } from "lucide-react";

interface PresentStaffModalProps {
    open: boolean;
    onClose: () => void;
    date: Date;
}

interface StaffEntry {
    user_id: string;
    full_name: string;
    check_in: string; // ISO string
}

export function PresentStaffModal({ open, onClose, date }: PresentStaffModalProps) {
    const [loading, setLoading] = useState(false);
    const [staff, setStaff] = useState<StaffEntry[]>([]);
    const [mounted, setMounted] = useState(false);
    const dateStr = format(date, "yyyy-MM-dd");

    useEffect(() => {
        setMounted(true);
        if (open) {
            document.body.style.overflow = 'hidden';
            fetchPresent();
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open, dateStr]);

    async function fetchPresent() {
        setLoading(true);
        try {
            // 1. Get timesheets for this date
            const { data: sheets, error: tsError } = await supabaseClient
                .from("timesheets")
                .select("user_id, check_in")
                .eq("work_date", dateStr);

            if (tsError) throw tsError;
            if (!sheets || sheets.length === 0) {
                setStaff([]);
                return;
            }

            // 2. Get profiles
            const userIds = sheets.map(s => s.user_id);
            const { data: profiles, error: profError } = await supabaseClient
                .from("profiles")
                .select("id, full_name, email")
                .in("id", userIds);

            if (profError) throw profError;

            // 3. Map
            const profMap = new Map();
            profiles?.forEach(p => {
                let displayName = p.full_name;
                if (!displayName && p.email) {
                    // Format email to name: "john.doe@example.com" -> "John Doe"
                    const local = p.email.split('@')[0];
                    displayName = local.split(/[._-]/).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                }
                profMap.set(p.id, displayName || "Unknown User");
            });

            const merged = sheets.map(s => ({
                user_id: s.user_id,
                full_name: profMap.get(s.user_id) || "Unknown User",
                check_in: s.check_in
            }));

            // Sort by check-in time
            merged.sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());

            setStaff(merged);
        } catch (err) {
            console.error("Failed to fetch present staff", err);
        } finally {
            setLoading(false);
        }
    }

    if (!mounted || !open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
            <div
                className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-100 animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                    <h3 className="font-bold text-zinc-900">Present Staff ({dateStr})</h3>
                    <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex justify-center py-8 text-zinc-400">
                            <Loader2 className="animate-spin" size={24} />
                        </div>
                    ) : staff.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
                            No staff data found for this date.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {staff.map((s) => (
                                <div key={s.user_id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-zinc-100 shadow-sm hover:border-indigo-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                                            <User size={14} />
                                        </div>
                                        <span className="font-medium text-zinc-900">{s.full_name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-50 px-2 py-1 rounded-md border border-zinc-100">
                                        <Clock size={12} />
                                        {format(new Date(s.check_in), "h:mm a")}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
