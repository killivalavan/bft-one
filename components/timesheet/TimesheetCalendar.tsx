import dynamic from "next/dynamic";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Calendar as CalendarIcon } from "lucide-react";

// Dynamically import calendar to avoid hydration mismatch
const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
import "react-calendar/dist/Calendar.css";

interface TimesheetCalendarProps {
    value: Date;
    onChange: (d: Date) => void;
    filledDates: Set<string>;
    leaveDates: Set<string>;
}

export function TimesheetCalendar({ value, onChange, filledDates, leaveDates }: TimesheetCalendarProps) {
    const today = new Date();

    return (
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-sky-50 to-white border-b border-sky-100 pb-3">
                <CardTitle className="text-sm font-semibold text-sky-900 flex items-center gap-2">
                    <CalendarIcon size={16} className="text-sky-600" />
                    Attendance Calendar
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="custom-calendar-wrapper p-4 flex justify-center">
                    <Calendar
                        value={value}
                        onChange={(v) => onChange(v as Date)}
                        className="!border-0 !w-full !font-sans !text-sm"
                        tileClassName={({ date, view }: { date: Date; view: string }) => {
                            if (view !== 'month') return null;
                            const key = format(date, "yyyy-MM-dd");

                            // Status checks
                            if (filledDates.has(key)) return "tile-filled relative";
                            if (leaveDates.has(key)) return "tile-leave relative";

                            // Missing check (up to today)
                            const isSameMonth = date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
                            if (isSameMonth && date <= today) return "tile-empty relative";

                            return null;
                        }}
                        prev2Label={null}
                        next2Label={null}
                        formatShortWeekday={(locale, date) => format(date, 'EEEEE')} // 'M', 'T', 'W' etc.
                    />
                </div>

                {/* Legend */}
                <div className="bg-zinc-50/50 p-3 border-t border-zinc-100 flex justify-center gap-4 text-[11px] font-medium text-zinc-600">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shadow-sm ring-1 ring-white" />
                        Present
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9] shadow-sm ring-1 ring-white" />
                        Leave
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shadow-sm ring-1 ring-white" />
                        Missing
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
