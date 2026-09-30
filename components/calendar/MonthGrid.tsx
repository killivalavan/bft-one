import { ActionTabs } from "@/components/timesheet/ActionTabs";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";

type DaySlot = {
    date: Date;
    iso: string;
    inMonth: boolean;
    names: string[];
};

interface MonthGridProps {
    days: DaySlot[];
    onDayClick: (d: DaySlot) => void;
    loading?: boolean;
}

export function MonthGrid({ days, onDayClick, loading }: MonthGridProps) {
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header Row */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {weekDays.map(d => (
                    <div key={d} className="py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {d}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 bg-slate-200 gap-px">
                {days.map((d, i) => {
                    const isToday = d.iso === format(new Date(), 'yyyy-MM-dd');
                    const hasLeaves = d.names.length > 0;

                    return (
                        <button
                            key={i}
                            onClick={() => onDayClick(d)}
                            disabled={loading}
                            className={cn(
                                "relative min-h-[100px] md:min-h-[120px] p-2 text-left transition-all hover:z-10 bg-white",
                                !d.inMonth && "bg-slate-50/70 text-slate-400",
                                d.inMonth && "hover:bg-[#EFF6FF]",
                                loading && "opacity-80 cursor-wait",
                                "group focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2563EB]"
                            )}
                        >
                            {/* Date Number */}
                            <div className="flex items-start justify-between">
                                <span
                                    className={cn(
                                        "text-sm font-semibold rounded-lg w-7 h-7 flex items-center justify-center",
                                        isToday
                                            ? "bg-[#2563EB] text-white shadow-xs"
                                            : d.inMonth ? "text-[#0F172A] group-hover:text-[#2563EB]" : "text-slate-400"
                                    )}
                                >
                                    {d.date.getDate()}
                                </span>

                                {/* Dot indicator for small screens or overflow */}
                                {hasLeaves && (
                                    <span className="md:hidden w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                                )}
                            </div>

                            {/* Leaves Stack (Desktop mainly) */}
                            <div className="mt-2 space-y-1">
                                {hasLeaves ? (
                                    <>
                                        {d.names.slice(0, 3).map((name, idx) => (
                                            <div
                                                key={idx}
                                                className="hidden md:flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-800 border border-slate-200 truncate shadow-xs group-hover:border-blue-300"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                                                <span className="truncate font-medium">{name}</span>
                                            </div>
                                        ))}
                                        {d.names.length > 3 && (
                                            <div className="hidden md:block text-[10px] text-slate-400 pl-1">
                                                +{d.names.length - 3} more
                                            </div>
                                        )}

                                        {/* Mobile/Compact View (Avatars) */}
                                        <div className="md:hidden flex -space-x-1.5 pt-1">
                                            {d.names.slice(0, 3).map((name, idx) => (
                                                <div
                                                    key={idx}
                                                    className="w-5 h-5 rounded-full bg-slate-100 border border-white text-[9px] flex items-center justify-center font-bold text-slate-800 ring-1 ring-white"
                                                >
                                                    {name[0]}
                                                </div>
                                            ))}
                                            {d.names.length > 3 && (
                                                <div className="w-5 h-5 rounded-full bg-slate-100 border border-white text-[9px] flex items-center justify-center text-slate-500 font-bold ring-1 ring-white">
                                                    +
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : null}
                            </div>

                            {/* Hover Overlay Effect */}
                            <div className="absolute inset-0 border-2 border-transparent group-hover:border-sky-200 pointer-events-none rounded-none z-20" />
                        </button>
                    )
                })}
            </div>
        </div>
    );
}
