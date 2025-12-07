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
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            {/* Header Row */}
            <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/50">
                {weekDays.map(d => (
                    <div key={d} className="py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                        {d}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 bg-zinc-200 gap-px">
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
                                !d.inMonth && "bg-zinc-50/60 text-zinc-400",
                                d.inMonth && "hover:bg-sky-50/30",
                                loading && "opacity-80 cursor-wait",
                                "group focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500"
                            )}
                        >
                            {/* Date Number */}
                            <div className="flex items-start justify-between">
                                <span
                                    className={cn(
                                        "text-sm font-semibold rounded-full w-7 h-7 flex items-center justify-center",
                                        isToday
                                            ? "bg-sky-600 text-white shadow-md"
                                            : d.inMonth ? "text-zinc-700 group-hover:text-sky-700" : "text-zinc-400"
                                    )}
                                >
                                    {d.date.getDate()}
                                </span>

                                {/* Dot indicator for small screens or overflow */}
                                {hasLeaves && (
                                    <span className="md:hidden w-1.5 h-1.5 rounded-full bg-rose-500" />
                                )}
                            </div>

                            {/* Leaves Stack (Desktop mainly) */}
                            <div className="mt-2 space-y-1">
                                {hasLeaves ? (
                                    <>
                                        {d.names.slice(0, 3).map((name, idx) => (
                                            <div
                                                key={idx}
                                                className="hidden md:flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-100 truncate shadow-sm group-hover:border-rose-200"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                                <span className="truncate font-medium">{name}</span>
                                            </div>
                                        ))}
                                        {d.names.length > 3 && (
                                            <div className="hidden md:block text-[10px] text-zinc-400 pl-1">
                                                +{d.names.length - 3} more
                                            </div>
                                        )}

                                        {/* Mobile/Compact View (Avatars) */}
                                        <div className="md:hidden flex -space-x-1.5 pt-1">
                                            {d.names.slice(0, 3).map((name, idx) => (
                                                <div
                                                    key={idx}
                                                    className="w-5 h-5 rounded-full bg-rose-100 border border-white text-[9px] flex items-center justify-center font-bold text-rose-600 ring-1 ring-white"
                                                >
                                                    {name[0]}
                                                </div>
                                            ))}
                                            {d.names.length > 3 && (
                                                <div className="w-5 h-5 rounded-full bg-zinc-100 border border-white text-[9px] flex items-center justify-center text-zinc-500 font-bold ring-1 ring-white">
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
