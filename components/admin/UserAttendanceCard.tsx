"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { Check, Clock, X, AlertCircle, Coffee } from "lucide-react";

interface AttendanceState {
    status: 'present' | 'leave' | 'half_day' | 'off' | 'unmarked';
    lateMinutes: number;
}

interface UserAttendanceCardProps {
    user: { id: string; email: string };
    current: AttendanceState;
    onChange: (id: string, state: AttendanceState) => Promise<void>;
}

export function UserAttendanceCard({ user, current, onChange }: UserAttendanceCardProps) {
    const [status, setStatus] = useState<'present' | 'leave' | 'half_day' | 'off' | 'unmarked'>(current.status);
    const [late, setLate] = useState<number>(current.lateMinutes);
    const [loading, setLoading] = useState(false);

    // Sync if parent updates (e.g. date change)
    useEffect(() => {
        setStatus(current.status);
        setLate(current.lateMinutes);
    }, [current.status, current.lateMinutes]);

    async function handleStatusChange(s: 'present' | 'leave' | 'half_day' | 'off' | 'unmarked') {
        setStatus(s);
        const newLate = s === 'present' ? late : 0; // Reset late if not present? Or keep it?
        setLoading(true);
        await onChange(user.id, { status: s, lateMinutes: newLate });
        setLoading(false);
    }

    async function handleLateChange(l: number) {
        setLate(l);
        if (status === 'present') {
            setLoading(true);
            await onChange(user.id, { status, lateMinutes: l });
            setLoading(false);
        }
    }

    const initials = user.email.slice(0, 2).toUpperCase();

    return (
        <div className="flex-shrink-0 w-[280px] h-[320px] bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold mb-3 border-2 border-indigo-100">
                    {initials}
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 truncate w-full text-center">{user.email.split('@')[0]}</h3>
                <p className="text-xs text-zinc-400">{user.email}</p>
            </div>

            <div className="space-y-4">
                {/* Status Selection */}
                {/* Status Selection */}
                <div className="grid grid-cols-4 gap-2">
                    <button
                        onClick={() => handleStatusChange('present')}
                        className={cn(
                            "flex flex-col items-center justify-center py-3 rounded-2xl border transition-all",
                            status === 'present'
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700 ring-1 ring-emerald-200"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                    >
                        <Check size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase">Present</span>
                    </button>
                    <button
                        onClick={() => handleStatusChange('half_day')}
                        className={cn(
                            "flex flex-col items-center justify-center py-3 rounded-2xl border transition-all",
                            status === 'half_day'
                                ? "bg-amber-50 border-amber-200 text-amber-700 ring-1 ring-amber-200"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                    >
                        <Clock size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase">Half</span>
                    </button>
                    <button
                        onClick={() => handleStatusChange('leave')}
                        className={cn(
                            "flex flex-col items-center justify-center py-3 rounded-2xl border transition-all",
                            status === 'leave'
                                ? "bg-rose-50 border-rose-200 text-rose-700 ring-1 ring-rose-200"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                    >
                        <X size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase">Leave</span>
                    </button>
                    <button
                        onClick={() => handleStatusChange('off')}
                        className={cn(
                            "flex flex-col items-center justify-center py-3 rounded-2xl border transition-all",
                            status === 'off'
                                ? "bg-zinc-100 border-zinc-200 text-zinc-700 ring-1 ring-zinc-200"
                                : "border-zinc-100 text-zinc-500 hover:bg-zinc-50"
                        )}
                    >
                        <Coffee size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase">Off</span>
                    </button>
                </div>

                {/* Late Modifier (Only if Present) */}
                <div className={cn("transition-all duration-300 overflow-hidden", status === 'present' ? "max-h-24 opacity-100" : "max-h-0 opacity-0")}>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase mb-2">Late Arrival?</p>
                    <select
                        value={late}
                        onChange={(e) => handleLateChange(Number(e.target.value))}
                        className="w-full h-11 px-3 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    >
                        <option value={0}>On Time</option>
                        <option value={15}>15 Mins Late (₹50)</option>
                        <option value={30}>30 Mins Late (₹100)</option>
                        <option value={60}>1 Hr Late (₹200)</option>
                        <option value={120}>2 Hrs Late (₹200)</option>
                        <option value={180}>3 Hrs Late</option>
                    </select>
                </div>
            </div>

            {/* Save Indicator */}
            <div className="flex items-center justify-center h-4">
                {loading && <span className="text-[10px] text-zinc-400 animate-pulse">Saving...</span>}
            </div>
        </div>
    );
}
