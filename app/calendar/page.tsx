"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

// Uses the same schema as Timesheet page: public.leaves(id, leave_date, user_id, reason)
// We read all leaves for the visible month and show names on each day.

type Leave = { id: string; leave_date: string; user_id: string; reason?: string|null };
 type Profile = { id: string; email: string; name?: string|null };

export default function CalendarPage() {
  const [month, setMonth] = useState<Date>(()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [fetching, setFetching] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; date?: string; names?: string[] }>({ open: false });

  const range = useMemo(()=>{
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth()+1, 0);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    return { start, end, startStr, endStr };
  }, [month]);

  const reqIdRef = useRef(0);
  async function load() {
    const my = ++reqIdRef.current;
    setFetching(true);
    try {
      // First get leaves for the visible range
      const { data: lv } = await supabaseClient
        .from("leaves")
        .select("id,leave_date,user_id,reason")
        .gte("leave_date", range.startStr)
        .lte("leave_date", range.endStr);
      // Then fetch only the profiles we need
      const ids = Array.from(new Set((lv||[]).map(l=>l.user_id).filter(Boolean)));
      let ps:any[] = [];
      if (ids.length>0) {
        const { data: profs } = await supabaseClient.from("profiles").select("id,email").in("id", ids);
        ps = profs||[];
      }
      if (reqIdRef.current !== my) return; // stale response, ignore
      setLeaves(lv||[]);
      setProfiles(ps as any);
      setInitialized(true);
    } finally {
      if (reqIdRef.current === my) {
        setFetching(false);
        setInitialized(true);
      }
    }
  }
  // Debounce month changes slightly to avoid rapid overlapping loads
  useEffect(()=>{
    const t = setTimeout(()=>{ load(); }, 150);
    return ()=> clearTimeout(t);
  }, [range.startStr, range.endStr]);

  const nameById = useMemo(()=>{
    const m = new Map<string,string>();
    profiles.forEach(p=> {
      const local = (p.email || "").split("@")[0] || "User";
      m.set(p.id, local);
    });
    return m;
  }, [profiles]);

  const days = useMemo(()=>{
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth()+1, 0);
    const slots: { date: Date; iso: string; inMonth: boolean; names: string[] }[] = [];
    // Week starts on Monday
    const weekday = (first.getDay()+6)%7; // 0 Mon ... 6 Sun
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - weekday);
    for (let i=0;i<42;i++){
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate()+i);
      const iso = format(d, 'yyyy-MM-dd');
      const inMonth = d.getMonth()===month.getMonth();
      const names = (leaves||[]).filter(l=>l.leave_date===iso).map(l=> nameById.get(l.user_id) || "Unknown");
      slots.push({ date: d, iso, inMonth, names });
    }
    return slots;
  }, [month, leaves, nameById]);

  function prevMonth(){ setMonth(m=> new Date(m.getFullYear(), m.getMonth()-1, 1)); }
  function nextMonth(){ setMonth(m=> new Date(m.getFullYear(), m.getMonth()+1, 1)); }

  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="grid gap-2">
      <div className="mx-auto w-full max-w-2xl md:max-w-3xl lg:max-w-5xl px-0">
        <Link href="/" className="inline-flex items-center gap-1 text-sky-700 text-sm">
          <ChevronLeft size={16} />
          <span>Home</span>
        </Link>
      </div>
      <div className="h-0" />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-zinc-900"><CalendarDays size={18} className="text-sky-700" /> {monthLabel}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={prevMonth}><ChevronLeft size={16} /></Button>
              <Button size="sm" onClick={nextMonth}><ChevronRight size={16} /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-7 text-[12px] text-zinc-600">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>(
              <div key={d} className="px-2 py-1 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {days.map((d,idx)=>(
              <button key={idx} type="button" onClick={()=> setDialog({ open: true, date: d.iso, names: d.names })}
                className={`relative text-left min-h-16 sm:min-h-24 rounded-lg sm:rounded-xl border p-1.5 sm:p-2 ${d.inMonth? 'bg-white' : 'bg-zinc-50 text-zinc-400'}`}>
                <div className={`text-[11px] sm:text-[12px] font-medium ${d.names.length>0 ? 'text-red-600' : 'text-zinc-700'}`}>{d.date.getDate()}</div>
                {d.names.length>0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                )}
                <div className="mt-1 grid gap-0.5 sm:gap-1">
                  {!initialized && d.inMonth ? (
                    <div className="h-2.5 w-12 sm:h-3 sm:w-16 bg-zinc-200 rounded animate-pulse" />
                  ) : (
                    d.names.slice(0,4).map((n,i)=>{
                      const initial = (n||'').charAt(0).toUpperCase();
                      return (
                        <div key={i} className="inline-flex items-center justify-center text-[10px] sm:text-[11px] px-1.5 py-0.5 sm:px-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 truncate w-5 h-5 sm:w-auto sm:h-auto">
                          <span className="sm:hidden leading-none">{initial}</span>
                          <span className="hidden sm:block leading-none">{n}</span>
                        </div>
                      );
                    })
                  )}
                  {d.names.length>4 && (
                    <div className="text-[10px] text-zinc-500">+{d.names.length-4} more</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {dialog.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={()=>setDialog({ open:false })}>
          <div className="bg-white w-full sm:w-[420px] rounded-t-2xl sm:rounded-2xl shadow-lg p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-zinc-900">Leaves on {dialog.date}</div>
              <button className="text-sm text-zinc-600" onClick={()=>setDialog({ open:false })}>Close</button>
            </div>
            <div className="mt-3 grid gap-2">
              {(dialog.names||[]).length===0 && (
                <div className="text-sm text-zinc-500">No leaves</div>
              )}
              {(dialog.names||[]).map((n,i)=> (
                <div key={i} className="text-sm px-3 py-2 rounded-lg border bg-white text-zinc-900">{n}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
