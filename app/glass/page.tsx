"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ChevronLeft, Plus, BarChart3, AlertTriangle, CalendarRange, Clock } from "lucide-react";
import { StatCard } from "@/components/glass/StatCard";

type GlassLog = {
  id: string; created_at: string; log_date: string; shift: "morning" | "night";
  small_count: number; large_count: number; broken_count: number;
};

export default function GlassPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<GlassLog[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const loadingInFlight = useRef(false);
  const { user } = useUser();

  async function load() {
    if (loadingInFlight.current) return;
    loadingInFlight.current = true;
    setLoading(true);
    const from = new Date(); from.setDate(from.getDate() - 365);
    try {
      // Warmup session
      const { data: s } = await supabaseClient.auth.getSession();
      if (!s?.session) await new Promise(r => setTimeout(r, 250));

      const { data, error } = await supabaseClient
        .from("glass_logs")
        .select("*")
        .gte("log_date", from.toISOString().slice(0, 10))
        .order("log_date", { ascending: false });

      if (error) throw error;
      setLogs((data as any) || []);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "error" });
    } finally {
      setLoading(false);
      loadingInFlight.current = false;
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const aggregates = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    const day = startOfDay.getDay();
    const diffToMonday = (day + 6) % 7;
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

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-20">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-sky-700 transition-colors text-sm font-medium">
              <ChevronLeft size={16} />
              Back Home
            </Link>
            <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Glass Dashboard</h1>
            <p className="text-zinc-500">Overview of breakage stats across shifts.</p>
          </div>

          <Link href="/glass/entry">
            <Button className="w-full md:w-auto bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-200">
              <Plus size={18} className="mr-2" />
              New Entry
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Broken Today"
            value={aggregates.perDay}
            icon={AlertTriangle}
            color="rose"
            subtext="Since midnight"
          />
          <StatCard
            label="This Week"
            value={aggregates.perWeek}
            icon={CalendarRange}
            color="amber"
            subtext="Since Monday"
          />
          <StatCard
            label="This Month"
            value={aggregates.perMonth}
            icon={BarChart3}
            color="indigo"
            subtext="Current month"
          />
          <StatCard
            label="This Year"
            value={aggregates.perYear}
            icon={Clock}
            color="sky"
            subtext="Year to date"
          />
        </div>

        {/* Info Block */}
        <div className="bg-sky-50 border border-sky-100 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="p-3 bg-white rounded-full shadow-sm text-sky-600">
            <BarChart3 size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sky-900">Tracking Logic</h3>
            <p className="text-sm text-sky-700/80 mt-1">
              "Broken" counts are calculated by comparing the <strong>Morning</strong> count (Start of day) vs <strong>Night</strong> count (End of day).
              Make sure to log both shifts for accurate daily reports.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
