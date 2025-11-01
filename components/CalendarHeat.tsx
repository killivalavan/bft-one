"use client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";

export type DayStatus = { date: string; filled: boolean };

export default function CalendarHeat({ statuses }:{statuses:DayStatus[]}) {
  const now = new Date();
  const days = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) });
  return (
    <div className="grid grid-cols-7 gap-2 p-2">
      {days.map(d=>{
        const st = statuses.find(s=>isSameDay(new Date(s.date), d));
        const color = st ? (st.filled?'bg-green-500':'bg-red-500') : 'bg-gray-200';
        return (
          <div key={d.toISOString()} className={`h-8 w-8 rounded ${color}`} title={format(d,'MMM d')}/>
        );
      })}
    </div>
  );
}
