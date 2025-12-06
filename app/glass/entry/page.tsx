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

type GlassLog = {
  id: string;
  created_at: string;
  log_date: string; // YYYY-MM-DD
  shift: "morning" | "night";
  small_count: number;
  large_count: number;
  broken_count: number;
};

export default function GlassEntryPage() {
  const { toast } = useToast();
  const [logDate, setLogDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mSmall, setMSmall] = useState<string>("0");
  const [mLarge, setMLarge] = useState<string>("0");
  const [nSmall, setNSmall] = useState<string>("0");
  const [nLarge, setNLarge] = useState<string>("0");
  const [logs, setLogs] = useState<GlassLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [suppressPrefillForDate, setSuppressPrefillForDate] = useState<string | null>(null);
  const [tab, setTab] = useState<"entry" | "logs" | "daily">("entry");
  const mounted = useRef(true);
  const loadingInFlight = useRef(false);
  const hasLoadedOnce = useRef(false);
  const loadRetries = useRef(0);

  async function load() {
    if (loadingInFlight.current) return;
    loadingInFlight.current = true;
    if (mounted.current) setLoading(true);
    const watchdog = setTimeout(() => {
      if (!mounted.current) return;
      setLoading(false);
      toast({ title: "Taking longer than usual", description: "Loading logs timed out.", variant: "error" });
      loadingInFlight.current = false;
    }, 10000);
    const from = new Date();
    from.setDate(from.getDate() - 365);
    try {
      const { data: s } = await supabaseClient.auth.getSession();
      if (!s?.session) {
        await new Promise(r => setTimeout(r, 250));
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
        if (rows.length > 0) break;
        await new Promise(r => setTimeout(r, (attempts + 1) * 200));
      }
      if (lastErr && rows.length === 0) throw lastErr;
      if (rows.length === 0 && hasLoadedOnce.current && logs.length > 0) {
        return;
      }
      if (mounted.current) setLogs(rows as any);
      if (rows.length > 0) {
        hasLoadedOnce.current = true;
        loadRetries.current = 0;
      } else if (!hasLoadedOnce.current && loadRetries.current < 5) {
        loadRetries.current += 1;
        setTimeout(() => { loadingInFlight.current = false; if (mounted.current) load(); }, 400);
      }
    } catch (e: any) {
      if (mounted.current) toast({ title: "Failed to load", description: e?.message || String(e), variant: "error" });
    } finally {
      clearTimeout(watchdog);
      if (mounted.current) setLoading(false);
      loadingInFlight.current = false;
    }
  }

  const { user } = useUser();

  useEffect(() => {
    mounted.current = true;
    if (user) {
      load();
    }
    return () => { mounted.current = false; };
  }, [user]);

  useEffect(() => {
    const onFocus = () => { if (mounted.current) load(); };
    const onVisibility = () => { if (mounted.current && document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (suppressPrefillForDate && suppressPrefillForDate === logDate) return;
    const dayLogs = logs.filter((l) => l.log_date === logDate);
    const m = dayLogs.find((l) => l.shift === "morning");
    const n = dayLogs.find((l) => l.shift === "night");
    setMSmall(String(m?.small_count ?? 0));
    setMLarge(String(m?.large_count ?? 0));
    setNSmall(String(n?.small_count ?? 0));
    setNLarge(String(n?.large_count ?? 0));
  }, [logDate, logs, suppressPrefillForDate]);

  const monthSummary = useMemo(() => {
    const map = new Map<string, { m?: GlassLog; n?: GlassLog }>();
    for (const l of logs) {
      const key = l.log_date;
      const entry = map.get(key) || {};
      if (l.shift === "morning") {
        if (!entry.m || l.created_at > entry.m.created_at) entry.m = l;
      } else if (l.shift === "night") {
        if (!entry.n || l.created_at > entry.n.created_at) entry.n = l;
      }
      map.set(key, entry);
    }
    const rows: { date: string; bSmall: number; bLarge: number; broken: number }[] = [];
    for (const [date, { m, n }] of map.entries()) {
      if (!n) continue;
      const bSmall = Math.max((m?.small_count || 0) - (n.small_count || 0), 0);
      const bLarge = Math.max((m?.large_count || 0) - (n.large_count || 0), 0);
      rows.push({ date, bSmall, bLarge, broken: bSmall + bLarge });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 31);
  }, [logs]);

  const computedBrokenSmall = useMemo(() => {
    const m = parseInt(mSmall || "0", 10) || 0;
    const n = parseInt(nSmall || "0", 10) || 0;
    const d = m - n;
    return d > 0 ? d : 0;
  }, [mSmall, nSmall]);
  const computedBrokenLarge = useMemo(() => {
    const m = parseInt(mLarge || "0", 10) || 0;
    const n = parseInt(nLarge || "0", 10) || 0;
    const d = m - n;
    return d > 0 ? d : 0;
  }, [mLarge, nLarge]);
  const computedBroken = useMemo(() => computedBrokenSmall + computedBrokenLarge, [computedBrokenSmall, computedBrokenLarge]);

  const savedDay = useMemo(() => {
    const dayLogs = logs.filter((l) => l.log_date === logDate);
    const m = dayLogs.find((l) => l.shift === "morning");
    const n = dayLogs.find((l) => l.shift === "night");
    const hasBoth = !!m && !!n;
    const bSmall = hasBoth ? Math.max((m?.small_count || 0) - (n?.small_count || 0), 0) : null;
    const bLarge = hasBoth ? Math.max((m?.large_count || 0) - (n?.large_count || 0), 0) : null;
    const broken = hasBoth && bSmall !== null && bLarge !== null ? bSmall + bLarge : null;
    return { hasBoth, bSmall, bLarge, broken };
  }, [logs, logDate]);

  const currentDay = useMemo(() => {
    const dayLogs = logs.filter((l) => l.log_date === logDate);
    const m = dayLogs.find((l) => l.shift === "morning");
    const n = dayLogs.find((l) => l.shift === "night");
    return { m, n, hasMorning: !!m, hasNight: !!n };
  }, [logs, logDate]);

  useEffect(() => {
    if (currentDay.m) {
      setMSmall(String(currentDay.m.small_count ?? 0));
      setMLarge(String(currentDay.m.large_count ?? 0));
    }
    if (currentDay.n) {
      setNSmall(String(currentDay.n.small_count ?? 0));
      setNLarge(String(currentDay.n.large_count ?? 0));
    }
  }, [currentDay.m?.id, currentDay.n?.id]);

  async function saveMorning() {
    if (!logDate) {
      toast({ title: "Select a date", variant: "error" });
      return;
    }
    const mSmallNum = parseInt(mSmall || "0", 10) || 0;
    const mLargeNum = parseInt(mLarge || "0", 10) || 0;

    const { error: delErr } = await supabaseClient
      .from("glass_logs")
      .delete()
      .eq("log_date", logDate)
      .eq("shift", "morning");
    if (delErr) {
      toast({ title: "Failed to save morning", description: delErr.message, variant: "error" });
      return;
    }

    const { error } = await supabaseClient.from("glass_logs").insert([
      { log_date: logDate, shift: "morning", small_count: mSmallNum, large_count: mLargeNum, broken_count: 0 },
    ]);
    if (error) {
      toast({ title: "Failed to save morning", description: error.message, variant: "error" });
      return;
    }
    toast({ title: "Morning saved", variant: "success" });
    setSuppressPrefillForDate(logDate);
    await load();
    setSuppressPrefillForDate(null);
  }

  async function saveNight() {
    if (!logDate) {
      toast({ title: "Select a date", variant: "error" });
      return;
    }
    const nSmallNum = parseInt(nSmall || "0", 10) || 0;
    const nLargeNum = parseInt(nLarge || "0", 10) || 0;
    const brokenNum = computedBroken;

    const { error: delErr } = await supabaseClient
      .from("glass_logs")
      .delete()
      .eq("log_date", logDate)
      .eq("shift", "night");
    if (delErr) {
      toast({ title: "Failed to save night", description: delErr.message, variant: "error" });
      return;
    }

    const { error } = await supabaseClient.from("glass_logs").insert([
      { log_date: logDate, shift: "night", small_count: nSmallNum, large_count: nLargeNum, broken_count: brokenNum },
    ]);
    if (error) {
      toast({ title: "Failed to save night", description: error.message, variant: "error" });
      return;
    }
    toast({ title: "Night saved", variant: "success" });
    setSuppressPrefillForDate(logDate);
    await load();
    setSuppressPrefillForDate(null);
  }

  function computeAggregates() {
    const byDate = new Map<string, number>();
    const map = new Map<string, { m?: GlassLog; n?: GlassLog }>();
    for (const l of logs) {
      const key = l.log_date;
      const entry = map.get(key) || {};
      if (l.shift === "morning") {
        if (!entry.m || l.created_at > entry.m.created_at) entry.m = l;
      } else {
        if (!entry.n || l.created_at > entry.n.created_at) entry.n = l;
      }
      map.set(key, entry);
    }
    for (const [date, { m, n }] of map.entries()) {
      if (!n) continue;
      const bSmall = Math.max((m?.small_count || 0) - (n.small_count || 0), 0);
      const bLarge = Math.max((m?.large_count || 0) - (n.large_count || 0), 0);
      byDate.set(date, bSmall + bLarge);
    }
    const daily = Array.from(byDate.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));

    function weekStartStr(dStr: string) {
      const d = new Date(dStr + 'T00:00:00');
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day; // Monday as start
      const ws = new Date(d);
      ws.setDate(d.getDate() + diff);
      return ws.toISOString().slice(0, 10);
    }

    const weekly = new Map<string, number>();
    const monthly = new Map<string, number>();
    const yearly = new Map<string, number>();

    for (const [date, val] of byDate.entries()) {
      const w = weekStartStr(date);
      const mKey = date.slice(0, 7);
      const yKey = date.slice(0, 4);
      weekly.set(w, (weekly.get(w) || 0) + val);
      monthly.set(mKey, (monthly.get(mKey) || 0) + val);
      yearly.set(yKey, (yearly.get(yKey) || 0) + val);
    }

    const weeklyArr = Array.from(weekly.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const monthlyArr = Array.from(monthly.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const yearlyArr = Array.from(yearly.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));

    return { daily, weekly: weeklyArr, monthly: monthlyArr, yearly: yearlyArr };
  }

  function handleExportPdf() {
    const { daily, weekly, monthly, yearly } = computeAggregates();
    const last14 = daily.slice(-14);
    const maxVal = Math.max(1, ...last14.map(([, v]) => v));
    const bars = last14
      .map(([d, v]) => {
        const pct = Math.round((v / maxVal) * 100);
        return `<div style=\"display:flex;align-items:center;gap:8px\"><div style=\"width:64px;font:12px Inter,ui-sans-serif\">${d}</div><div style=\"flex:1;background:#e5e7eb;height:8px;border-radius:9999px;overflow:hidden\"><div style=\"width:${pct}%;height:100%;background:#0369a1\"></div></div><div style=\"width:32px;text-align:right;font:12px Inter,ui-sans-serif\">${v}</div></div>`;
      })
      .join("");

    function table(title: string, rows: [string, number][]) {
      const trs = rows
        .map(([k, v]) => `<tr><td style=\"padding:6px 8px;border-bottom:1px solid #e5e7eb\">${k}</td><td style=\"padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb\">${v}</td></tr>`)
        .join("");
      return `<div style=\"margin-top:16px\"><div style=\"font:600 14px Inter,ui-sans-serif;color:#111827;margin-bottom:6px\">${title}</div><table style=\"width:100%;border-collapse:collapse;font:13px Inter,ui-sans-serif;color:#111827;background:white;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr style=\"background:#f9fafb\"><th style=\"text-align:left;padding:8px\">Period</th><th style=\"text-align:right;padding:8px\">Broken</th></tr></thead><tbody>${trs}</tbody></table></div>`;
    }

    const html = `<!doctype html><html><head><meta charset=\"utf-8\" /><title>Glass Breakage Report</title></head><body style=\"background:#f3f4f6;padding:24px\"><div style=\"max-width:900px;margin:0 auto\">\
      <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">\
        <div style=\"font:600 18px Inter,ui-sans-serif;color:#111827\">Glass Breakage Report</div>\
        <div style=\"font:500 12px Inter,ui-sans-serif;color:#6b7280\">Generated ${new Date().toLocaleString()}</div>\
      </div>\
      <div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px\">\
        <div style=\"border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;padding:12px;text-align:center\">\
          <div style=\"font:500 11px Inter,ui-sans-serif;color:#6b7280\">Broken small</div>\
          <div style=\"font:700 18px Inter,ui-sans-serif;color:#111827\">${savedDay.hasBoth ? savedDay.bSmall : "—"}</div>\
        </div>\
        <div style=\"border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;padding:12px;text-align:center\">\
          <div style=\"font:500 11px Inter,ui-sans-serif;color:#6b7280\">Broken large</div>\
          <div style=\"font:700 18px Inter,ui-sans-serif;color:#111827\">${savedDay.hasBoth ? savedDay.bLarge : "—"}</div>\
        </div>\
        <div style=\"border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;padding:12px;text-align:center\">\
          <div style=\"font:500 11px Inter,ui-sans-serif;color:#6b7280\">Broken total</div>\
          <div style=\"font:700 18px Inter,ui-sans-serif;color:#111827\">${savedDay.hasBoth ? savedDay.broken : "—"}</div>\
        </div>\
      </div>\
      <div style=\"border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;padding:16px;margin-bottom:16px\">\
        <div style=\"font:600 14px Inter,ui-sans-serif;color:#111827;margin-bottom:8px\">Last 14 days</div>\
        <div>${bars}</div>\
      </div>\
      ${table('Daily', daily)}\
      ${table('Weekly (Mon-Sun)', weekly)}\
      ${table('Monthly', monthly)}\
      ${table('Yearly', yearly)}\
    </div>\
    <script>setTimeout(() => { window.print(); }, 400);</script>\
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast({ title: 'Popup blocked', description: 'Allow popups to generate the PDF/print report.', variant: 'error' });
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="grid gap-2">
      <div>
        <Link href="/glass" className="inline-flex items-center gap-1 text-sky-700 text-sm">
          <ChevronLeft size={16} />
          <span>Back to summary</span>
        </Link>
      </div>
      <div className="h-0" />
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-zinc-200 p-3 bg-white text-center">
          <div className="text-[11px] text-zinc-600">Broken small</div>
          <div className="text-xl font-semibold text-zinc-900">{savedDay.hasBoth ? savedDay.bSmall : "—"}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 bg-white text-center">
          <div className="text-[11px] text-zinc-600">Broken large</div>
          <div className="text-xl font-semibold text-zinc-900">{savedDay.hasBoth ? savedDay.bLarge : "—"}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3 bg-white text-center">
          <div className="text-[11px] text-zinc-600">Broken total</div>
          <div className="text-xl font-semibold text-zinc-900">{savedDay.hasBoth ? savedDay.broken : "—"}</div>
        </div>
      </div>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-zinc-900">Glass count</div>
                <div className="text-sm text-zinc-600">Enter counts and review logs</div>
              </div>
              <Button size="sm" onClick={handleExportPdf}>Export PDF</Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex gap-2 border-b border-zinc-200">
              <button className={`${tab === "entry" ? "border-b-2 border-sky-600 text-sky-700" : "text-zinc-600"} px-3 py-2 text-sm`} onClick={() => setTab("entry")}>
                Entry
              </button>
              <button className={`${tab === "logs" ? "border-b-2 border-sky-600 text-sky-700" : "text-zinc-600"} px-3 py-2 text-sm`} onClick={() => setTab("logs")}>
                Logs
              </button>
              <button className={`${tab === "daily" ? "border-b-2 border-sky-600 text-sky-700" : "text-zinc-600"} px-3 py-2 text-sm`} onClick={() => setTab("daily")}>
                Daily broken
              </button>
            </div>

            {tab === "entry" && (
              <div className="grid gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <span className="text-[12px] text-zinc-600">Date</span>
                    <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-[12px] text-zinc-600">Morning</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1">
                        <span className="text-[12px] text-zinc-600">Small</span>
                        <Input type="number" value={mSmall} onChange={(e) => setMSmall(e.target.value)} />
                      </div>
                      <div className="grid gap-1">
                        <span className="text-[12px] text-zinc-600">Large</span>
                        <Input type="number" value={mLarge} onChange={(e) => setMLarge(e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <Button onClick={saveMorning} className="w-full">Save morning</Button>
                    </div>
                  </div>

                  <div className="grid gap-1">
                    <span className="text-[12px] text-zinc-600">Night</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1">
                        <span className="text-[12px] text-zinc-600">Small</span>
                        <Input type="number" value={nSmall} onChange={(e) => setNSmall(e.target.value)} />
                      </div>
                      <div className="grid gap-1">
                        <span className="text-[12px] text-zinc-600">Large</span>
                        <Input type="number" value={nLarge} onChange={(e) => setNLarge(e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <Button onClick={saveNight} className="w-full">Save night</Button>
                    </div>
                  </div>
                </div>

                {!savedDay.hasBoth && (
                  <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Save both morning and night to compute the broken summary.
                  </div>
                )}
              </div>
            )}

            {tab === "logs" && (
              <div className="grid gap-2">
                <div className="text-sm font-medium text-zinc-900">Recent logs</div>
                <div className="grid gap-2">
                  {loading && (
                    <>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-zinc-200 p-3 bg-white animate-pulse">
                          <div className="h-4 bg-zinc-200 rounded w-1/2" />
                        </div>
                      ))}
                    </>
                  )}
                  {Array.from(new Set(logs.map((l) => l.log_date)))
                    .slice(0, 30)
                    .map((d) => {
                      const dayLogs = logs.filter((l) => l.log_date === d);
                      const m = dayLogs.find((l) => l.shift === "morning");
                      const n = dayLogs.find((l) => l.shift === "night");
                      const bSmall = Math.max((m?.small_count || 0) - (n?.small_count || 0), 0);
                      const bLarge = Math.max((m?.large_count || 0) - (n?.large_count || 0), 0);
                      const bTotal = bSmall + bLarge;
                      return (
                        <div key={d} className="rounded-xl border border-zinc-200 p-3 bg-white text-sm">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-zinc-900">{d}</div>
                            <div className="text-[11px] text-zinc-600">
                              Broken: <span className="font-semibold text-zinc-900">{bTotal}</span> (S:{bSmall} L:{bLarge})
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-zinc-200 p-2">
                              <div className="text-[11px] text-zinc-600">Morning</div>
                              <div className="text-[12px] text-zinc-700">Small: {m?.small_count || 0} • Large: {m?.large_count || 0}</div>
                            </div>
                            <div className="rounded-lg border border-zinc-200 p-2">
                              <div className="text-[11px] text-zinc-600">Night</div>
                              <div className="text-[12px] text-zinc-700">Small: {n?.small_count || 0} • Large: {n?.large_count || 0}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {!loading && logs.length === 0 && <div className="text-sm text-zinc-500">No logs yet</div>}
                </div>
              </div>
            )}

            {tab === "daily" && (
              <div className="grid gap-2">
                <div className="text-sm font-medium text-zinc-900">Daily broken (last 30 days)</div>
                <div className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
                  <div className="grid grid-cols-5 bg-zinc-50 text-[12px] font-semibold text-zinc-700">
                    <div className="px-3 py-2">Date</div>
                    <div className="px-3 py-2 text-right">Small</div>
                    <div className="px-3 py-2 text-right">Large</div>
                    <div className="px-3 py-2 text-right">Total</div>
                    <div className="px-3 py-2 text-right">Δ (day)</div>
                  </div>
                  <div>
                    {monthSummary.map((row, idx) => {
                      const prev = monthSummary[idx + 1];
                      const delta = Math.max((row.broken || 0) - (prev?.broken || 0), 0);
                      const zebra = idx % 2 === 0 ? "bg-white" : "bg-zinc-50";
                      const deltaColor = delta > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700";
                      return (
                        <div key={row.date} className={`grid grid-cols-5 items-center text-sm ${zebra} hover:bg-zinc-100/70 transition-colors`}>
                          <div className="px-3 py-2 text-zinc-900 font-medium">{row.date}</div>
                          <div className="px-3 py-2 text-right">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium">{row.bSmall}</span>
                          </div>
                          <div className="px-3 py-2 text-right">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{row.bLarge}</span>
                          </div>
                          <div className="px-3 py-2 text-right">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">{row.broken}</span>
                          </div>
                          <div className="px-3 py-2 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${deltaColor}`}>{delta}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}