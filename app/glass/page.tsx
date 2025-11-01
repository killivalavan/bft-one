"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ChevronLeft } from "lucide-react";

// glass_logs schema suggestion
// id uuid pk default uuid_generate_v4()
// created_at timestamptz default now()
// log_date date not null
// shift text check (shift in ('morning','night')) not null
// small_count int not null default 0
// large_count int not null default 0
// broken_count int not null default 0

type GlassLog = {
  id: string;
  created_at: string;
  log_date: string; // YYYY-MM-DD
  shift: "morning" | "night";
  small_count: number;
  large_count: number;
  broken_count: number;
};

export default function GlassPage() {
  const { toast } = useToast();
  const [logDate, setLogDate] = useState<string>(()=> new Date().toISOString().slice(0,10));
  const [mSmall, setMSmall] = useState<string>("0");
  const [mLarge, setMLarge] = useState<string>("0");
  const [nSmall, setNSmall] = useState<string>("0");
  const [nLarge, setNLarge] = useState<string>("0");
  const [logs, setLogs] = useState<GlassLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [suppressPrefillForDate, setSuppressPrefillForDate] = useState<string|null>(null);

  async function load() {
    setLoading(true);
    // fetch last 365 days for aggregates + table
    const from = new Date();
    from.setDate(from.getDate() - 365);
    const { data, error } = await supabaseClient
      .from("glass_logs")
      .select("id, created_at, log_date, shift, small_count, large_count, broken_count")
      .gte("log_date", from.toISOString().slice(0,10))
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "error" });
      setLoading(false);
      return;
    }
    setLogs((data||[]) as any);
    setLoading(false);
  }

  useEffect(()=>{ load(); },[]);

  // Prefill inputs when date changes (unless suppressed after save)
  useEffect(()=>{
    if (suppressPrefillForDate && suppressPrefillForDate === logDate) return;
    const dayLogs = logs.filter(l=>l.log_date===logDate);
    const m = dayLogs.find(l=>l.shift==='morning');
    const n = dayLogs.find(l=>l.shift==='night');
    setMSmall(String(m?.small_count ?? 0));
    setMLarge(String(m?.large_count ?? 0));
    setNSmall(String(n?.small_count ?? 0));
    setNLarge(String(n?.large_count ?? 0));
  }, [logDate, logs, suppressPrefillForDate]);

  const aggregates = useMemo(()=>{
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    const day = startOfDay.getDay(); // 0-6
    const diffToMonday = (day + 6) % 7; // Monday as start
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const toDate = (d: string) => new Date(d + "T00:00:00");

    let perDay = 0, perWeek = 0, perMonth = 0, perYear = 0;
    for (const l of logs) {
      const d = toDate(l.log_date);
      if (l.shift !== 'night') continue; // only count broken from night entries
      if (d >= startOfDay) perDay += l.broken_count;
      if (d >= startOfWeek) perWeek += l.broken_count;
      if (d >= startOfMonth) perMonth += l.broken_count;
      if (d >= startOfYear) perYear += l.broken_count;
    }
    return { perDay, perWeek, perMonth, perYear };
  }, [logs]);

  const monthSummary = useMemo(()=>{
    // Build by date using the latest morning & night entries and compute broken S/L
    const map = new Map<string, { m?: GlassLog; n?: GlassLog }>();
    for (const l of logs) {
      const key = l.log_date;
      const entry = map.get(key) || {};
      if (l.shift === 'morning') {
        if (!entry.m || l.created_at > entry.m.created_at) entry.m = l;
      } else if (l.shift === 'night') {
        if (!entry.n || l.created_at > entry.n.created_at) entry.n = l;
      }
      map.set(key, entry);
    }
    const rows: { date: string; bSmall: number; bLarge: number; broken: number }[] = [];
    for (const [date, { m, n }] of map.entries()) {
      if (!n) continue; // only when we have a night entry for the date
      const bSmall = Math.max((m?.small_count||0) - (n.small_count||0), 0);
      const bLarge = Math.max((m?.large_count||0) - (n.large_count||0), 0);
      rows.push({ date, bSmall, bLarge, broken: bSmall + bLarge });
    }
    return rows.sort((a,b)=> (a.date < b.date ? 1 : -1)).slice(0, 31);
  }, [logs]);

  const computedBrokenSmall = useMemo(()=>{
    const m = parseInt(mSmall||'0',10)||0; const n = parseInt(nSmall||'0',10)||0; const d = m-n; return d>0?d:0;
  }, [mSmall, nSmall]);
  const computedBrokenLarge = useMemo(()=>{
    const m = parseInt(mLarge||'0',10)||0; const n = parseInt(nLarge||'0',10)||0; const d = m-n; return d>0?d:0;
  }, [mLarge, nLarge]);
  const computedBroken = useMemo(()=> computedBrokenSmall + computedBrokenLarge, [computedBrokenSmall, computedBrokenLarge]);

  async function saveDay() {
    if (!logDate) { toast({ title: "Select a date", variant: "error" }); return; }
    const mSmallNum = parseInt(mSmall||'0',10)||0;
    const mLargeNum = parseInt(mLarge||'0',10)||0;
    const nSmallNum = parseInt(nSmall||'0',10)||0;
    const nLargeNum = parseInt(nLarge||'0',10)||0;
    const brokenNum = computedBroken;

    // upsert by deleting existing entries for the date
    const { error: delErr } = await supabaseClient.from('glass_logs').delete().eq('log_date', logDate);
    if (delErr) { toast({ title: 'Failed to save', description: delErr.message, variant: 'error' }); return; }

    const { error } = await supabaseClient.from('glass_logs').insert([
      { log_date: logDate, shift: 'morning', small_count: mSmallNum, large_count: mLargeNum, broken_count: 0 },
      { log_date: logDate, shift: 'night', small_count: nSmallNum, large_count: nLargeNum, broken_count: brokenNum },
    ]);
    if (error) { toast({ title: 'Failed to save', description: error.message, variant: 'error' }); return; }
    toast({ title: 'Saved', variant: 'success' });
    setMSmall('0'); setMLarge('0'); setNSmall('0'); setNLarge('0');
    setSuppressPrefillForDate(logDate);
    await load();
  }

  return (
    <div className="grid gap-2">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-sky-700 text-sm">
          <ChevronLeft size={16} />
          <span>Home</span>
        </Link>
      </div>
      <div className="h-0" />
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="font-semibold text-zinc-900">Glass count</div>
          <div className="text-sm text-zinc-600">Track small/large and broken counts for each shift</div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {/* Aggregates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl border p-3 bg-white text-center">
              <div className="text-[11px] text-zinc-600">Broken today</div>
              <div className="text-xl font-semibold text-zinc-900">{aggregates.perDay}</div>
            </div>
            <div className="rounded-xl border p-3 bg-white text-center">
              <div className="text-[11px] text-zinc-600">This week</div>
              <div className="text-xl font-semibold text-zinc-900">{aggregates.perWeek}</div>
            </div>
            <div className="rounded-xl border p-3 bg-white text-center">
              <div className="text-[11px] text-zinc-600">This month</div>
              <div className="text-xl font-semibold text-zinc-900">{aggregates.perMonth}</div>
            </div>
            <div className="rounded-xl border p-3 bg-white text-center">
              <div className="text-[11px] text-zinc-600">This year</div>
              <div className="text-xl font-semibold text-zinc-900">{aggregates.perYear}</div>
            </div>
          </div>

          {/* Form */}
          <div className="grid gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="grid gap-1">
                <span className="text-[12px] text-zinc-600">Date</span>
                <Input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <span className="text-[12px] text-zinc-600">Morning</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <span className="text-[12px] text-zinc-600">Small</span>
                    <Input type="number" value={mSmall} onChange={e=>setMSmall(e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-[12px] text-zinc-600">Large</span>
                    <Input type="number" value={mLarge} onChange={e=>setMLarge(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="grid gap-1">
                <span className="text-[12px] text-zinc-600">Night</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <span className="text-[12px] text-zinc-600">Small</span>
                    <Input type="number" value={nSmall} onChange={e=>setNSmall(e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-[12px] text-zinc-600">Large</span>
                    <Input type="number" value={nLarge} onChange={e=>setNLarge(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border p-3 bg-white text-center">
                <div className="text-[11px] text-zinc-600">Broken small</div>
                <div className="text-xl font-semibold text-zinc-900">{computedBrokenSmall}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white text-center">
                <div className="text-[11px] text-zinc-600">Broken large</div>
                <div className="text-xl font-semibold text-zinc-900">{computedBrokenLarge}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white text-center">
                <div className="text-[11px] text-zinc-600">Broken total</div>
                <div className="text-xl font-semibold text-zinc-900">{computedBroken}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveDay} className="flex-1">Save day</Button>
            </div>
          </div>

          {/* Table */}
          <div className="grid gap-2">
            <div className="text-sm font-medium text-zinc-900">Recent logs</div>
            <div className="grid gap-2">
              {loading && (
                <>
                  {Array.from({ length: 4 }).map((_,i)=>(
                    <div key={i} className="rounded-xl border p-3 bg-white animate-pulse">
                      <div className="h-4 bg-zinc-200 rounded w-1/2" />
                    </div>
                  ))}
                </>
              )}
              {Array.from(new Set(logs.map(l=>l.log_date))).slice(0,30).map(d=>{
                const dayLogs = logs.filter(l=>l.log_date===d);
                const m = dayLogs.find(l=>l.shift==='morning');
                const n = dayLogs.find(l=>l.shift==='night');
                const bSmall = Math.max((m?.small_count||0)-(n?.small_count||0), 0);
                const bLarge = Math.max((m?.large_count||0)-(n?.large_count||0), 0);
                const bTotal = bSmall + bLarge;
                return (
                  <div key={d} className="rounded-xl border p-3 bg-white text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-zinc-900">{d}</div>
                      <div className="text-[11px] text-zinc-600">Broken: <span className="font-semibold text-zinc-900">{bTotal}</span> (S:{bSmall} L:{bLarge})</div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border p-2">
                        <div className="text-[11px] text-zinc-600">Morning</div>
                        <div className="text-[12px] text-zinc-700">Small: {m?.small_count||0} • Large: {m?.large_count||0}</div>
                      </div>
                      <div className="rounded-lg border p-2">
                        <div className="text-[11px] text-zinc-600">Night</div>
                        <div className="text-[12px] text-zinc-700">Small: {n?.small_count||0} • Large: {n?.large_count||0}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!loading && logs.length===0 && (
                <div className="text-sm text-zinc-500">No logs yet</div>
              )}
            </div>
          </div>

          {/* Monthly summary */}
          <div className="grid gap-2 mt-2">
            <div className="text-sm font-medium text-zinc-900">Daily broken (last 30 days)</div>
            <div className="rounded-xl border overflow-hidden bg-white">
              <div className="grid grid-cols-5 bg-zinc-50 text-[12px] font-medium text-zinc-700">
                <div className="px-3 py-2">Date</div>
                <div className="px-3 py-2 text-right">Small</div>
                <div className="px-3 py-2 text-right">Large</div>
                <div className="px-3 py-2 text-right">Total</div>
                <div className="px-3 py-2 text-right">Δ (day)</div>
              </div>
              <div className="divide-y">
                {monthSummary.map((row, idx)=> {
                  const prev = monthSummary[idx+1];
                  const delta = Math.max((row.broken || 0) - (prev?.broken || 0), 0);
                  return (
                    <div key={row.date} className="grid grid-cols-5 text-sm">
                      <div className="px-3 py-2 text-zinc-900">{row.date}</div>
                      <div className="px-3 py-2 text-right text-zinc-900">{row.bSmall}</div>
                      <div className="px-3 py-2 text-right text-zinc-900">{row.bLarge}</div>
                      <div className="px-3 py-2 text-right font-medium text-zinc-900">{row.broken}</div>
                      <div className="px-3 py-2 text-right font-medium text-zinc-900">{delta}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
