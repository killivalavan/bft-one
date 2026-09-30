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
        <Card className="border border-slate-200 shadow-xs bg-white overflow-hidden rounded-2xl">
            <CardHeader className="bg-slate-50 border-b border-slate-200 pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <CalendarIcon size={16} className="text-[#2563EB]" />
                    <span>Attendance Calendar</span>
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
                <div className="bg-slate-50 p-3 border-t border-slate-200 flex justify-center gap-4 text-[11px] font-medium text-slate-600">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] shadow-xs" />
                        <span>Present</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shadow-xs" />
                        <span>Leave</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] shadow-xs" />
                        <span>Missing</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
