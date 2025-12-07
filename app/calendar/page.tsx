"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight, CalendarDays, Home } from "lucide-react";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { LeafDialog } from "@/components/calendar/LeafDialog";

type Leave = { id: string; leave_date: string; user_id: string; reason?: string | null };
type Profile = { id: string; email: string; name?: string | null };

export default function CalendarPage() {
  const [month, setMonth] = useState<Date>(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [fetching, setFetching] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; date?: string; names?: string[] }>({ open: false });

  const range = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    return { start, end, startStr, endStr };
  }, [month]);

  const reqIdRef = useRef(0);

  async function load() {
    const my = ++reqIdRef.current;
    setFetching(true);
    try {
      const { data: lv } = await supabaseClient
        .from("leaves")
        .select("id,leave_date,user_id,reason")
        .gte("leave_date", range.startStr)
        .lte("leave_date", range.endStr);

      const ids = Array.from(new Set((lv || []).map(l => l.user_id).filter(Boolean)));
      let ps: any[] = [];
      if (ids.length > 0) {
        const { data: profs } = await supabaseClient.from("profiles").select("id,email").in("id", ids);
        ps = profs || [];
      }
      if (reqIdRef.current !== my) return;
      setLeaves(lv || []);
      setProfiles(ps as any);
    } finally {
      if (reqIdRef.current === my) setFetching(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 150);
    return () => clearTimeout(t);
  }, [range.startStr, range.endStr]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach(p => {
      const local = (p.email || "").split("@")[0] || "User";
      m.set(p.id, local);
    });
    return m;
  }, [profiles]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // Week starts on Monday
    const weekday = (first.getDay() + 6) % 7; // 0 Mon ... 6 Sun
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - weekday);

    const slots = [];
    for (let i = 0; i < 42; i++) { // 6 weeks
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = format(d, 'yyyy-MM-dd');
      const inMonth = d.getMonth() === month.getMonth();
      const names = (leaves || []).filter(l => l.leave_date === iso).map(l => nameById.get(l.user_id) || "Unknown");
      slots.push({ date: d, iso, inMonth, names });
    }
    return slots;
  }, [month, leaves, nameById]);

  function prevMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); }
  function nextMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); }

  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-20">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Top Nav */}
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors text-sm font-medium">
            <ChevronLeft size={16} />
            Back Home
          </Link>
        </div>

        {/* Title & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 tracking-tight flex items-center gap-3">
            <CalendarDays className="text-sky-600" size={28} />
            Global Leave Calendar
          </h1>

          <div className="flex items-center gap-3 bg-white p-1 rounded-xl shadow-sm border border-zinc-200">
            <Button variant="ghost" size="sm" onClick={prevMonth} className="h-8 w-8 p-0 rounded-lg hover:bg-zinc-100">
              <ChevronLeft size={18} />
            </Button>
            <span className="min-w-[140px] text-center font-semibold text-zinc-800 tabular-nums">
              {monthLabel}
            </span>
            <Button variant="ghost" size="sm" onClick={nextMonth} className="h-8 w-8 p-0 rounded-lg hover:bg-zinc-100">
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <MonthGrid
          days={days}
          loading={fetching}
          onDayClick={(d) => setDialog({ open: true, date: d.iso, names: d.names })}
        />

      </div>

      <LeafDialog
        open={dialog.open}
        date={dialog.date}
        names={dialog.names}
        onClose={() => setDialog({ ...dialog, open: false })}
      />
    </div>
  );
}
