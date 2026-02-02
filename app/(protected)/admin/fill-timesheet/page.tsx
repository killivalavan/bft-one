"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, ArrowLeftRight, GripHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { format, addDays, addMonths, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isSameDay } from "date-fns";
import { supabaseClient } from "@/lib/supabaseClient";
import { UserAttendanceCard } from "@/components/admin/UserAttendanceCard";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";

// Helper Types
type UserProfile = { id: string; email: string; base_salary_cents: number; per_day_salary_cents: number; is_admin: boolean };
type AttendanceStatus = 'present' | 'leave' | 'half_day' | 'off' | 'unmarked';
type DayLog = { status: AttendanceStatus; lateMinutes: number; extraHours: number };
type MonthlyLogs = Record<string, Record<string, DayLog>>; // dateKey -> userId -> Log

export default function FillTimesheetPage() {
    const { toast } = useToast();
    const [date, setDate] = useState(new Date());
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [monthlyLogs, setMonthlyLogs] = useState<MonthlyLogs>({});
    const [loading, setLoading] = useState(true);

    const dateKey = format(date, "yyyy-MM-dd");

    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);

    // Derived state for the cards (Single Day)
    const dailyLogs = useMemo(() => monthlyLogs[dateKey] || {}, [monthlyLogs, dateKey]);

    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const monthKey = format(monthStart, 'yyyy-MM');

    // Load Data (Month Wise)
    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                // Fetch Users (Filter Admins)
                const { data: us } = await supabaseClient.from('profiles').select('id, email, base_salary_cents, per_day_salary_cents, is_admin').order('email');
                const staff = (us || []).filter((u: any) => !u.is_admin);

                // Restore Order
                const savedOrder = localStorage.getItem('bft_attendance_order');
                if (savedOrder) {
                    const orderIds = JSON.parse(savedOrder) as string[];
                    staff.sort((a: any, b: any) => {
                        const idxA = orderIds.indexOf(a.id);
                        const idxB = orderIds.indexOf(b.id);
                        if (idxA === -1 && idxB === -1) return 0;
                        if (idxA === -1) return 1;
                        if (idxB === -1) return -1;
                        return idxA - idxB;
                    });
                }

                setUsers(staff);

                // Fetch Logs for ENTIRE Month
                const startStr = format(monthStart, 'yyyy-MM-dd');
                const endStr = format(monthEnd, 'yyyy-MM-dd');

                const [{ data: ts }, { data: lv }] = await Promise.all([
                    supabaseClient.from('timesheets').select('user_id, minutes_late, work_date, extra_hours').gte('work_date', startStr).lte('work_date', endStr),
                    supabaseClient.from('leaves').select('user_id, reason, leave_date').gte('leave_date', startStr).lte('leave_date', endStr)
                ]);

                // Map to State
                const newLogs: MonthlyLogs = {};

                // Helper to set log
                const setLog = (d: string, u: string, l: DayLog) => {
                    if (!newLogs[d]) newLogs[d] = {};
                    newLogs[d][u] = l;
                };

                // Apply Leaves
                (lv || []).forEach((l: any) => {
                    const status = l.reason === 'Half Day' ? 'half_day' : l.reason === 'Weekly Off' ? 'off' : 'leave';
                    setLog(l.leave_date, l.user_id, { status, lateMinutes: 0, extraHours: 0 });
                });

                // Apply Timesheets (Override)
                (ts || []).forEach((t: any) => {
                    setLog(t.work_date, t.user_id, { status: 'present', lateMinutes: t.minutes_late || 0, extraHours: t.extra_hours || 0 });
                });

                setMonthlyLogs(newLogs);

            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [monthKey]); // Reload when month changes

    // Handle Update (Single Users, Single Day)
    async function updateAttendance(userId: string, newState: DayLog) {
        // Optimistic UI Update
        setMonthlyLogs(prev => ({
            ...prev,
            [dateKey]: {
                ...(prev[dateKey] || {}),
                [userId]: newState
            }
        }));

        try {
            const user = users.find(u => u.id === userId);
            if (!user) return;

            // Database Sync
            const delResults = await Promise.all([
                supabaseClient.from('timesheets').delete().eq('user_id', userId).eq('work_date', dateKey),
                supabaseClient.from('leaves').delete().eq('user_id', userId).eq('leave_date', dateKey),
                // Delete deductions and additions (overtime)
                supabaseClient.from('salary_entries').delete().eq('user_id', userId).eq('entry_date', dateKey).or('kind.eq.deduction,kind.eq.addition').in('reason', ['late', 'leave', 'Half Day', 'half day', 'Leave deduction', 'Weekly Off']).ilike('reason', '%Overtime%')
            ]);
            // Note: The OR logic above is tricky with Supabase syntax. Better to split deletion.

            // Clear specific salary entries (Deductions relating to attendance)
            await supabaseClient.from('salary_entries').delete().eq('user_id', userId).eq('entry_date', dateKey).in('reason', ['late', 'leave', 'Half Day', 'half day', 'Leave deduction', 'Weekly Off']);
            // Clear Overtime entries
            await supabaseClient.from('salary_entries').delete().eq('user_id', userId).eq('entry_date', dateKey).ilike('reason', 'Overtime%');


            if (newState.status === 'present') {
                const checkInDate = new Date(date);
                checkInDate.setHours(9, newState.lateMinutes, 0, 0);

                const { error } = await supabaseClient.from('timesheets').insert({
                    user_id: userId,
                    work_date: dateKey,
                    check_in: checkInDate.toISOString(),
                    minutes_late: newState.lateMinutes,
                    extra_hours: newState.extraHours || 0
                });
                if (error) throw error;

                // Late Deduction
                if (newState.lateMinutes > 0) {
                    const amount = newState.lateMinutes >= 60 ? 20000 : newState.lateMinutes >= 30 ? 10000 : 5000;
                    const { error: salError } = await supabaseClient.from('salary_entries').insert({
                        user_id: userId, entry_date: dateKey, amount_cents: amount, reason: 'late', kind: 'deduction'
                    });
                    if (salError) throw salError;
                }

                // Overtime Addition
                if (newState.extraHours > 0) {
                    const amount = newState.extraHours * 50 * 100; // 50 INR per hour -> cents
                    const { error: otError } = await supabaseClient.from('salary_entries').insert({
                        user_id: userId, entry_date: dateKey, amount_cents: amount, reason: `Overtime (${newState.extraHours} hrs)`, kind: 'addition'
                    });
                    if (otError) throw otError;
                }

            } else if (newState.status === 'leave') {
                const { error } = await supabaseClient.from('leaves').insert({ user_id: userId, leave_date: dateKey, reason: 'Admin Marked' });
                if (error) throw error;

                if (user.per_day_salary_cents > 0) {
                    const { error: salError } = await supabaseClient.from('salary_entries').insert({
                        user_id: userId, entry_date: dateKey, amount_cents: user.per_day_salary_cents, reason: 'leave', kind: 'deduction'
                    });
                    if (salError) throw salError;
                }
            } else if (newState.status === 'half_day') {
                const { error } = await supabaseClient.from('leaves').insert({ user_id: userId, leave_date: dateKey, reason: 'Half Day' });
                if (error) throw error;

                if (user.per_day_salary_cents > 0) {
                    const { error: salError } = await supabaseClient.from('salary_entries').insert({
                        user_id: userId, entry_date: dateKey, amount_cents: Math.round(user.per_day_salary_cents / 2), reason: 'Half Day', kind: 'deduction'
                    });
                    if (salError) throw salError;
                }
            } else if (newState.status === 'off') {
                const { error } = await supabaseClient.from('leaves').insert({ user_id: userId, leave_date: dateKey, reason: 'Weekly Off' });
                if (error) throw error;
            }

            toast({ title: "Updated", variant: "success", duration: 1000 });
        } catch (e: any) {
            toast({ title: "Failed", description: e.message, variant: "error" });
        }
    }

    // Calculate Monthly Stats
    const stats = useMemo(() => {
        const result: Record<string, { present: number; leave: number; half_day: number; }> = {};
        users.forEach(u => {
            result[u.id] = { present: 0, leave: 0, half_day: 0 };
        });

        // Only count logs that are within the current month view
        // filter dates from monthlyLogs keys that match current month
        const currentMonthPrefix = format(date, 'yyyy-MM');

        Object.keys(monthlyLogs).forEach(dKey => {
            if (dKey.startsWith(currentMonthPrefix)) {
                const dayLogs = monthlyLogs[dKey];
                Object.entries(dayLogs).forEach(([uid, log]) => {
                    if (result[uid]) {
                        if (log.status === 'present') result[uid].present++;
                        else if (log.status === 'leave') result[uid].leave++;
                        else if (log.status === 'half_day') result[uid].half_day++;
                    }
                });
            }
        });
        return result;
    }, [monthlyLogs, users, date]);

    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const prettyDate = format(date, "EEEE, d MMMM yyyy");

    // Drag Handlers
    function handleDragStart(e: React.DragEvent, id: string) {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }

    function handleDrop(e: React.DragEvent, targetId: string) {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const newUsers = [...users];
        const dragIdx = newUsers.findIndex(u => u.id === draggedId);
        const targetIdx = newUsers.findIndex(u => u.id === targetId);

        if (dragIdx === -1 || targetIdx === -1) return;

        // Move item
        const [moved] = newUsers.splice(dragIdx, 1);
        newUsers.splice(targetIdx, 0, moved);

        setUsers(newUsers);

        // Persist
        localStorage.setItem('bft_attendance_order', JSON.stringify(newUsers.map(u => u.id)));
        setDraggedId(null);
    }

    return (
        <div className="min-h-screen bg-zinc-50/50 pb-20">
            <div className="max-w-[100vw] overflow-hidden">
                {/* Header */}
                <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
                    <div className="max-w-7xl mx-auto px-2 sm:px-4 min-h-[64px] flex flex-row items-center justify-between gap-2 py-2">
                        <div className="flex items-center gap-2">
                            <Link href="/admin" className="p-2 text-zinc-400 hover:text-zinc-600 shrink-0">
                                <ChevronLeft size={20} />
                            </Link>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-lg font-bold text-zinc-900 truncate">
                                    <span className="sm:hidden">Attendance</span>
                                    <span className="hidden sm:inline">Attendance Register</span>
                                </h1>
                                <p className="text-xs text-zinc-500 hidden sm:block">Fill daily logs & view monthly report.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-3 bg-zinc-100 rounded-lg p-1 shrink-0">
                            <button onClick={() => setDate(addDays(date, -1))} className="p-1.5 sm:p-2 hover:bg-white rounded-md transition-all shadow-sm">
                                <ChevronLeft size={16} />
                            </button>
                            <span className="text-xs sm:text-sm font-semibold min-w-[100px] sm:w-32 text-center tabular-nums truncate">{prettyDate}</span>
                            <button onClick={() => setDate(addDays(date, 1))} className="p-1.5 sm:p-2 hover:bg-white rounded-md transition-all shadow-sm">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Day Fill Cards */}
                <div className="p-6 overflow-x-auto bg-zinc-50/50 border-b border-zinc-200">
                    <div className="flex gap-6 pb-2 min-w-max mx-auto">
                        {users.map(user => (
                            <div
                                key={user.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, user.id)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, user.id)}
                                className={cn(
                                    "transition-all duration-200 cursor-grab active:cursor-grabbing rounded-3xl pt-2",
                                    draggedId === user.id ? "opacity-50 scale-95" : "hover:-translate-y-1 block"
                                )}
                            >
                                <div className="flex justify-center pb-1 text-zinc-300 hover:text-zinc-500 transition-colors">
                                    <GripHorizontal size={20} />
                                </div>
                                <UserAttendanceCard
                                    user={user}
                                    current={dailyLogs[user.id] || { status: 'unmarked', lateMinutes: 0, extraHours: 0 }}
                                    onChange={updateAttendance}
                                />
                            </div>
                        ))}
                        {loading && users.length === 0 && <div className="text-zinc-400 p-10">Loading staff...</div>}
                    </div>
                </div>

                {/* Monthly Table */}
                <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <h2 className="text-lg font-bold text-zinc-900">{format(date, 'MMMM yyyy')} Summary</h2>
                            <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5 shadow-sm">
                                <button
                                    onClick={() => setDate(addMonths(date, -1))}
                                    className="p-1 hover:bg-zinc-50 rounded-md text-zinc-500 hover:text-zinc-700 transition-colors"
                                    title="Previous Month"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    onClick={() => setDate(addMonths(date, 1))}
                                    className="p-1 hover:bg-zinc-50 rounded-md text-zinc-500 hover:text-zinc-700 transition-colors"
                                    title="Next Month"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <div className="w-px h-4 bg-zinc-200 mx-1"></div>
                                <button
                                    onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                                    className="p-1 hover:bg-zinc-50 rounded-md text-zinc-500 hover:text-zinc-700 transition-colors"
                                    title="Zoom Out"
                                >
                                    <ZoomOut size={16} />
                                </button>
                                <button
                                    onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
                                    className="p-1 hover:bg-zinc-50 rounded-md text-zinc-500 hover:text-zinc-700 transition-colors"
                                    title="Zoom In"
                                >
                                    <ZoomIn size={16} />
                                </button>
                            </div>
                        </div>

                    </div>

                    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-auto max-h-[75vh]">
                        <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap relative border-collapse" style={{ zoom: zoom }}>
                            <thead className="bg-zinc-50 border-b border-zinc-100">
                                <tr>
                                    <th className="px-4 py-3 font-semibold text-zinc-600 w-32 sticky left-0 top-0 bg-zinc-50 z-30 border-r border-zinc-100 shadow-[2px_2px_4px_rgba(0,0,0,0.02)]">Date</th>
                                    {users.map(u => (
                                        <th key={u.id} className="px-4 py-3 font-semibold text-zinc-600 text-center min-w-[100px] sticky top-0 bg-zinc-50 z-20 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                                            {u.email.split('@')[0]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {monthDays.map(d => {
                                    const dKey = format(d, 'yyyy-MM-dd');
                                    const isWk = isWeekend(d);
                                    const isActive = isSameDay(d, date);
                                    const rowBg = isActive ? 'bg-indigo-50/50' : isWk ? 'bg-rose-50/30' : 'hover:bg-zinc-50';

                                    return (
                                        <tr
                                            key={dKey}
                                            className={`transition-colors cursor-pointer ${rowBg}`}
                                            onClick={() => setDate(d)}
                                        >
                                            <td className={`px-4 py-3 font-medium sticky left-0 z-10 border-r border-zinc-100 ${rowBg} backdrop-blur-sm`}>
                                                <div className={`flex items-center gap-2 ${isWk ? 'text-rose-600' : 'text-zinc-700'}`}>
                                                    <span className="w-6 text-center tabular-nums text-zinc-400">{format(d, 'dd')}</span>
                                                    <span>{format(d, 'eee')}</span>
                                                </div>
                                            </td>
                                            {users.map(u => {
                                                const log = monthlyLogs[dKey]?.[u.id];

                                                let content: React.ReactNode = <span className="text-zinc-300">-</span>;
                                                let cellClass = "";

                                                if (log) {
                                                    const { status, lateMinutes } = log;

                                                    if (status === 'present') {
                                                        cellClass = "text-emerald-600 font-medium";
                                                        content = "Present";
                                                        if (lateMinutes > 0) {
                                                            cellClass = "text-amber-600 font-medium";
                                                            content = `Present (+${lateMinutes}m)`;
                                                        }
                                                    } else if (status === 'leave') {
                                                        cellClass = "text-rose-600 font-bold";
                                                        content = "Leave";
                                                    } else if (status === 'half_day') {
                                                        cellClass = "text-amber-600 font-bold";
                                                        content = "Half Day";
                                                    } else if (status === 'off') {
                                                        cellClass = "text-zinc-400 font-medium";
                                                        content = "Off";
                                                    }
                                                }

                                                return (
                                                    <td key={u.id} className="px-4 py-3 text-center border-l border-dashed border-zinc-100 last:border-r-0">
                                                        <span className={cellClass}>{content}</span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-zinc-50 border-t border-zinc-200 font-medium text-xs sm:text-sm">
                                <tr className="hover:bg-zinc-50">
                                    <td className="px-4 py-3 font-semibold text-zinc-700 sticky left-0 bg-zinc-50 z-10 border-r border-zinc-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">Total Present</td>
                                    {users.map(u => (
                                        <td key={u.id} className="px-4 py-3 text-center text-emerald-600 font-bold bg-emerald-50/30">
                                            {stats[u.id]?.present || 0}
                                        </td>
                                    ))}
                                </tr>
                                <tr className="hover:bg-zinc-50">
                                    <td className="px-4 py-3 font-semibold text-zinc-700 sticky left-0 bg-zinc-50 z-10 border-r border-zinc-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">Total Leaves</td>
                                    {users.map(u => (
                                        <td key={u.id} className="px-4 py-3 text-center text-rose-600 font-bold bg-rose-50/30">
                                            {stats[u.id]?.leave || 0}
                                        </td>
                                    ))}
                                </tr>
                                <tr className="hover:bg-zinc-50">
                                    <td className="px-4 py-3 font-semibold text-zinc-700 sticky left-0 bg-zinc-50 z-10 border-r border-zinc-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">Half Days</td>
                                    {users.map(u => (
                                        <td key={u.id} className="px-4 py-3 text-center text-amber-600 font-bold bg-amber-50/30">
                                            {stats[u.id]?.half_day || 0}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
