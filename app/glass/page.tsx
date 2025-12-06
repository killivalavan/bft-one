"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
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
  const [logDate, setLogDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mSmall, setMSmall] = useState<string>("0");
  const [mLarge, setMLarge] = useState<string>("0");
  const [nSmall, setNSmall] = useState<string>("0");
  const [nLarge, setNLarge] = useState<string>("0");
  const [logs, setLogs] = useState<GlassLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [suppressPrefillForDate, setSuppressPrefillForDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"logs" | "daily">("logs");

  const loadingInFlight = useRef(false);
  const hasLoadedOnce = useRef(false);
  const loadRetries = useRef(0);
  const bootLoaded = useRef(false);
  async function load() {
    if (loadingInFlight.current) return;
    loadingInFlight.current = true;
    setLoading(true);
    const watchdog = setTimeout(() => {
      setLoading(false);
      loadingInFlight.current = false;
    }, 10000);
    const from = new Date();
    from.setDate(from.getDate() - 365);
    try {
      // Ensure a real session exists (prevents empty result on first enter)
      const { data: sessionData } = await supabaseClient.auth.getSession();
      console.log('[glass] getSession ->', !!sessionData?.session);
      if (!sessionData?.session) {
        await new Promise((r) => setTimeout(r, 250));
      }

      let rows: any[] = [];
      let lastErr: any = null;
      for (let attempts = 0; attempts < 3; attempts++) {
        const { data, error } = await supabaseClient
          .from("glass_logs")
          .select("id, created_at, log_date, shift, small_count, large_count, broken_count")
          .gte("log_date", from.toISOString().slice(0, 10))
          .order("log_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) lastErr = error;
        rows = (data || []) as any[];
        console.log('[glass] fetch attempt rows=', rows.length, 'err?', !!error);
        if (rows.length > 0) break;
        await new Promise((r) => setTimeout(r, (attempts + 1) * 200));
      }
      if (lastErr && rows.length === 0) throw lastErr;

      // Avoid overwriting prior data with an empty response
      if (rows.length === 0 && hasLoadedOnce.current && logs.length > 0) {
        console.log('[glass] keeping previous logs, empty response after first load');
        return;
      }

      setLogs(rows as any);
      if (rows.length > 0) {
        hasLoadedOnce.current = true;
        loadRetries.current = 0;
      } else if (!hasLoadedOnce.current && loadRetries.current < 5) {
        loadRetries.current += 1;
        // brief retry loop to cover session warmup
        setTimeout(() => {
          loadingInFlight.current = false;
          load();
        }, 400);
      }
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message || String(e), variant: "error" });
    } finally {
      clearTimeout(watchdog);
      setLoading(false);
      loadingInFlight.current = false;
    }
  }

  const { user } = useUser();

  // Trigger load when user is available or restored
  useEffect(() => {
    if (user) {
      if (!bootLoaded.current) {
        bootLoaded.current = true;
        load();
      } else {
        // Reload on user change/restore if already booted
        hasLoadedOnce.current = false;
        loadRetries.current = 0;
        load();
      }
    }
  }, [user]);

  useEffect(() => {
    // Fallback if boot hangs
    const t = setTimeout(() => { if (!bootLoaded.current) load(); }, 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onFocus = () => { load(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Prefill inputs when date changes (unless suppressed after save)
  useEffect(() => {
    if (suppressPrefillForDate && suppressPrefillForDate === logDate) return;
    const dayLogs = logs.filter(l => l.log_date === logDate);
    const m = dayLogs.find(l => l.shift === 'morning');
    const n = dayLogs.find(l => l.shift === 'night');
    setMSmall(String(m?.small_count ?? 0));
    setMLarge(String(m?.large_count ?? 0));
    setNSmall(String(n?.small_count ?? 0));
    setNLarge(String(n?.large_count ?? 0));
  }, [logDate, logs, suppressPrefillForDate]);

  const aggregates = useMemo(() => {
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

  const monthSummary = useMemo(() => {
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
      const bSmall = Math.max((m?.small_count || 0) - (n.small_count || 0), 0);
      const bLarge = Math.max((m?.large_count || 0) - (n.large_count || 0), 0);
      rows.push({ date, bSmall, bLarge, broken: bSmall + bLarge });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 31);
  }, [logs]);

  const computedBrokenSmall = useMemo(() => {
    const m = parseInt(mSmall || '0', 10) || 0; const n = parseInt(nSmall || '0', 10) || 0; const d = m - n; return d > 0 ? d : 0;
  }, [mSmall, nSmall]);
  const computedBrokenLarge = useMemo(() => {
    const m = parseInt(mLarge || '0', 10) || 0; const n = parseInt(nLarge || '0', 10) || 0; const d = m - n; return d > 0 ? d : 0;
  }, [mLarge, nLarge]);
  const computedBroken = useMemo(() => computedBrokenSmall + computedBrokenLarge, [computedBrokenSmall, computedBrokenLarge]);

  async function saveDay() {
    if (!logDate) { toast({ title: "Select a date", variant: "error" }); return; }
    const mSmallNum = parseInt(mSmall || '0', 10) || 0;
    const mLargeNum = parseInt(mLarge || '0', 10) || 0;
    const nSmallNum = parseInt(nSmall || '0', 10) || 0;
    const nLargeNum = parseInt(nLarge || '0', 10) || 0;
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
              <div className="rounded-xl border border-zinc-200 p-3 bg-white text-center">
                <div className="text-[11px] text-zinc-600">Broken today</div>
                <div className="text-xl font-semibold text-zinc-900">{aggregates.perDay}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 p-3 bg-white text-center">
                <div className="text-[11px] text-zinc-600">This week</div>
                <div className="text-xl font-semibold text-zinc-900">{aggregates.perWeek}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 p-3 bg-white text-center">
                <div className="text-[11px] text-zinc-600">This month</div>
                <div className="text-xl font-semibold text-zinc-900">{aggregates.perMonth}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 p-3 bg-white text-center">
                <div className="text-[11px] text-zinc-600">This year</div>
                <div className="text-xl font-semibold text-zinc-900">{aggregates.perYear}</div>
              </div>
            </div>

            {/* Action */}
            <div className="mt-2">
              <Link href="/glass/entry" className="block">
                <Button block>Add glass count</Button>
              </Link>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
