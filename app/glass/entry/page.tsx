"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ChevronLeft, FileDown } from "lucide-react";
import { GlassTabs } from "@/components/glass/GlassTabs";
import { EntryForm } from "@/components/glass/EntryForm";
import { StatCard } from "@/components/glass/StatCard";
import { DailyTable } from "@/components/glass/DailyTable";
import { generateGlassReportPdf } from "@/lib/utils/glassReport";

type GlassLog = {
  id: string; created_at: string; log_date: string; shift: "morning" | "night";
  small_count: number; large_count: number; broken_count: number;
  broken_reasons?: string[] | null;
  user_id?: string | null;
  profiles?: { full_name: string | null } | null;
};

export default function GlassEntryPage() {
  const { toast } = useToast();
  const [logDate, setLogDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mSmall, setMSmall] = useState<string>("0");
  const [mLarge, setMLarge] = useState<string>("0");
  const [nSmall, setNSmall] = useState<string>("0");
  const [nLarge, setNLarge] = useState<string>("0");
  const [logs, setLogs] = useState<GlassLog[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [suppressPrefillForDate, setSuppressPrefillForDate] = useState<string | null>(null);
  const [tab, setTab] = useState<"entry" | "logs" | "daily">("entry");
  const [reasons, setReasons] = useState<string[]>([]);

  const [userMap, setUserMap] = useState<Record<string, string>>({});

  const mounted = useRef(true);
  const loadingInFlight = useRef(false);
  const { user } = useUser();

  async function load() {
    if (loadingInFlight.current) return;
    loadingInFlight.current = true;
    if (mounted.current) setLoading(true);

    const from = new Date(); from.setDate(from.getDate() - 365);
    try {
      const { data: s } = await supabaseClient.auth.getSession();
      if (!s?.session) await new Promise(r => setTimeout(r, 250));

      const { data, error } = await supabaseClient
        .from("glass_logs")
        .select("*")
        .gte("log_date", from.toISOString().slice(0, 10))
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const logsData = (data as any) || [];

      // Manually fetch profiles
      const userIds = Array.from(new Set(logsData.map((l: any) => l.user_id).filter(Boolean))) as string[];
      if (userIds.length > 0) {
        const { data: profiles } = await supabaseClient
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach(p => {
            map[p.id] = p.full_name || (p.email ? p.email.split('@')[0] : "Unknown");
          });
          if (mounted.current) setUserMap(map);
        }
      }

      if (mounted.current) setLogs(logsData);
    } catch (e: any) {
      if (mounted.current) toast({ title: "Failed to load", description: e?.message, variant: "error" });
    } finally {
      if (mounted.current) setLoading(false);
      loadingInFlight.current = false;
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (user) load();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Prefill logic
  useEffect(() => {
    if (suppressPrefillForDate && suppressPrefillForDate === logDate) return;
    const dayLogs = logs.filter((l) => l.log_date === logDate);
    const m = dayLogs.find((l) => l.shift === "morning");
    const n = dayLogs.find((l) => l.shift === "night");
    setMSmall(String(m?.small_count ?? 0));
    setMLarge(String(m?.large_count ?? 0));
    setNSmall(String(n?.small_count ?? 0));
    setNLarge(String(n?.large_count ?? 0));

    if (n?.broken_reasons && Array.isArray(n.broken_reasons)) {
      setReasons(n.broken_reasons);
    } else {
      setReasons([]);
    }
  }, [logDate, logs, suppressPrefillForDate]);

  // Derived Values
  const computedBrokenSmall = useMemo(() => {
    const m = parseInt(mSmall || "0", 10) || 0;
    const n = parseInt(nSmall || "0", 10) || 0;
    const d = m - n; return d > 0 ? d : 0;
  }, [mSmall, nSmall]);

  const computedBrokenLarge = useMemo(() => {
    const m = parseInt(mLarge || "0", 10) || 0;
    const n = parseInt(nLarge || "0", 10) || 0;
    const d = m - n; return d > 0 ? d : 0;
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

  const submitterInfo = useMemo(() => {
    const dayLogs = logs.filter((l) => l.log_date === logDate);
    const m = dayLogs.find((l) => l.shift === "morning");
    const n = dayLogs.find((l) => l.shift === "night");

    const getName = (l?: GlassLog) => {
      if (!l || !l.user_id) return null;
      if (userMap[l.user_id]) return userMap[l.user_id];
      return `User ${l.user_id.slice(0, 5)}...`;
    };

    const result = {
      mSubmittedBy: getName(m),
      nSubmittedBy: getName(n)
    };
    return result;
  }, [logs, logDate, userMap]);

  const monthSummary = useMemo(() => {
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
    const rows: { date: string; bSmall: number; bLarge: number; broken: number; reasons?: string[] | null }[] = [];
    for (const [date, { m, n }] of map.entries()) {
      if (!n) continue;
      const bSmall = Math.max((m?.small_count || 0) - (n.small_count || 0), 0);
      const bLarge = Math.max((m?.large_count || 0) - (n.large_count || 0), 0);
      rows.push({ date, bSmall, bLarge, broken: bSmall + bLarge, reasons: n.broken_reasons });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 31);
  }, [logs]);

  // Actions
  async function saveMorning() {
    if (!logDate) { toast({ title: "Select a date", variant: "error" }); return; }
    const mSmallNum = parseInt(mSmall || "0", 10) || 0;
    const mLargeNum = parseInt(mLarge || "0", 10) || 0;

    await supabaseClient.from("glass_logs").delete().eq("log_date", logDate).eq("shift", "morning");
    const { error } = await supabaseClient.from("glass_logs").insert([{
      log_date: logDate,
      shift: "morning",
      small_count: mSmallNum,
      large_count: mLargeNum,
      broken_count: 0,
      user_id: user?.id
    }]);

    if (error) { toast({ title: "Failed to save", description: error.message, variant: "error" }); return; }

    toast({ title: "Morning saved", variant: "success" });
    setSuppressPrefillForDate(logDate);
    await load();
    setSuppressPrefillForDate(null);
  }

  async function saveNight() {
    if (!logDate) { toast({ title: "Select a date", variant: "error" }); return; }
    const nSmallNum = parseInt(nSmall || "0", 10) || 0;
    const nLargeNum = parseInt(nLarge || "0", 10) || 0;
    const brokenNum = computedBroken;

    await supabaseClient.from("glass_logs").delete().eq("log_date", logDate).eq("shift", "night");
    const { error } = await supabaseClient.from("glass_logs").insert([{
      log_date: logDate,
      shift: "night",
      small_count: nSmallNum,
      large_count: nLargeNum,
      broken_count: brokenNum,
      user_id: user?.id,
      broken_reasons: reasons && reasons.length > 0 ? reasons : null
    }]);

    if (error) { toast({ title: "Failed to save", description: error.message, variant: "error" }); return; }

    toast({ title: "Night saved", variant: "success" });
    setSuppressPrefillForDate(logDate);
    await load();
    setSuppressPrefillForDate(null);
  }

  async function saveReasons() {
    if (!logDate) return;

    // 1. Fetch existing row to preserve counts/ownership
    const { data: existing, error: fetchError } = await supabaseClient
      .from("glass_logs")
      .select("*")
      .eq("log_date", logDate)
      .eq("shift", "night")
      .maybeSingle();

    if (fetchError) {
      toast({ title: "Fetch failed", description: fetchError.message, variant: "error" });
      return;
    }

    if (!existing) {
      toast({ title: "Save failed", description: "Night shift not found. Save Night first.", variant: "error" });
      return;
    }

    // 2. Delete
    await supabaseClient.from("glass_logs").delete().eq("id", existing.id);

    // 3. Insert with reasons
    const { error: insertError } = await supabaseClient.from("glass_logs").insert([{
      log_date: existing.log_date,
      shift: "night",
      small_count: existing.small_count,
      large_count: existing.large_count,
      broken_count: existing.broken_count,
      user_id: existing.user_id, // preserve original submitter
      broken_reasons: reasons && reasons.length > 0 ? reasons : null
    }]);

    if (insertError) {
      toast({ title: "Failed to save reasons", description: insertError.message, variant: "error" });
      return;
    }

    toast({ title: "Reasons saved", variant: "success" });
    setSuppressPrefillForDate(logDate);
    await load();
    setSuppressPrefillForDate(null);
  }



  async function handleExportPdf() {
    toast({ title: "Generating Report...", description: "Fetching full history", variant: "info" });
    try {
      // 1. Fetch ALL logs
      const { data: allLogs, error } = await supabaseClient
        .from("glass_logs")
        .select("*")
        .order("log_date", { ascending: false });

      if (error) throw error;
      const logs = (allLogs || []) as GlassLog[];

      // 2. Fetch Profiles for these logs
      const userIds = Array.from(new Set(logs.map(l => l.user_id).filter(Boolean))) as string[];
      const uMap: Record<string, string> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabaseClient
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        profiles?.forEach(p => {
          uMap[p.id] = p.full_name || (p.email ? p.email.split('@')[0] : "Unknown");
        });
      }

      // 3. Attach names (cast to any or extend type if needed, but passing to utility handles it if utility accepts intersection)
      // The utility expects GlassLog which has optional submitter_name in my definition? 
      // Wait, in page.tsx GlassLog is defined locally (Line 14), and in utility it's defined too.
      // I should update the local type or just cast it.
      // The utility defines its own type. I'll cast `logs` to `any` when mapping to avoid conflict with local type.

      const enrichedLogs = logs.map(l => ({
        ...l,
        submitter_name: l.user_id ? (uMap[l.user_id] || "User " + l.user_id.slice(0, 5)) : "Unknown"
      }));

      // 4. Generate PDF
      await generateGlassReportPdf(enrichedLogs as any);
      toast({ title: "Export Complete", variant: "success" });

    } catch (e: any) {
      console.error(e);
      toast({ title: "Export Failed", description: e.message, variant: "error" });
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-20">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/glass" className="inline-flex items-center gap-2 text-zinc-500 hover:text-sky-700 transition-colors text-sm font-medium">
            <ChevronLeft size={16} />
            Back to Dashboard
          </Link>
          <Button size="sm" variant="outline" onClick={handleExportPdf} className="h-9">
            <FileDown size={16} className="mr-2" />
            Export
          </Button>
        </div>

        {/* Top Stats for Selected/Current Day */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Broken Small"
            value={savedDay.hasBoth ? savedDay.bSmall! : "—"}
            color="sky"
            className="py-3 px-4"
          />
          <StatCard
            label="Broken Large"
            value={savedDay.hasBoth ? savedDay.bLarge! : "—"}
            color="indigo"
            className="py-3 px-4"
          />
          <StatCard
            label="Total Broken"
            value={savedDay.hasBoth ? savedDay.broken! : "—"}
            color="rose"
            className="py-3 px-4"
          />
        </div>

        {/* Tab Switcher */}
        <GlassTabs activeTab={tab} onChange={setTab} />

        {/* Content Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
          {tab === 'entry' && (
            <EntryForm
              date={logDate}
              onDateChange={setLogDate}
              mSmall={mSmall} setMSmall={setMSmall} mLarge={mLarge} setMLarge={setMLarge}
              onSaveMorning={saveMorning}
              nSmall={nSmall} setNSmall={setNSmall} nLarge={nLarge} setNLarge={setNLarge}
              onSaveNight={saveNight}
              isMorningSaved={!!logs.find(l => l.log_date === logDate && l.shift === 'morning')}
              isNightSaved={!!logs.find(l => l.log_date === logDate && l.shift === 'night')}
              mSubmittedBy={submitterInfo.mSubmittedBy}
              nSubmittedBy={submitterInfo.nSubmittedBy}
              showWarning={!savedDay.hasBoth}
              brokenCount={savedDay.broken || 0}
              reasons={reasons}
              onReasonChange={(i, v) => {
                const newR = [...reasons];
                while (newR.length <= i) newR.push("");
                newR[i] = v;
                setReasons(newR);
              }}
              onSaveReasons={saveReasons}
              reasonsSaved={!!logs.find(l => l.log_date === logDate && l.shift === 'night')?.broken_reasons?.length}
            />
          )}

          {tab === 'logs' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-zinc-900">Recent Activity</h3>
              {Array.from(new Set(logs.map((l) => l.log_date))).slice(0, 20).map(d => {
                const dayLogs = logs.filter(l => l.log_date === d);
                const m = dayLogs.find(l => l.shift === 'morning');
                const n = dayLogs.find(l => l.shift === 'night');
                const bTotal = (Math.max((m?.small_count || 0) - (n?.small_count || 0), 0)) + (Math.max((m?.large_count || 0) - (n?.large_count || 0), 0));

                return (
                  <div key={d} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                    <div>
                      <div className="font-medium text-zinc-900">{d}</div>
                      <div className="text-xs text-zinc-500 mt-1 flex gap-3">
                        <span>Morning: <span className="font-medium text-zinc-700">{m ? '✅' : '❌'}</span></span>
                        <span>Night: <span className="font-medium text-zinc-700">{n ? '✅' : '❌'}</span></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-zinc-900">{bTotal}</div>
                      <div className="text-xs text-zinc-500">Broken</div>
                    </div>
                  </div>
                )
              })}
              {logs.length === 0 && <div className="text-center text-zinc-500 py-8">No logs found.</div>}
            </div>
          )}

          {tab === 'daily' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-zinc-900">30-Day Report</h3>
              <DailyTable rows={monthSummary} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}