"use client";
import Link from "next/link";
import { format, addDays, isAfter, isBefore, addMonths, startOfDay } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { TimesheetCalendar } from "@/components/timesheet/TimesheetCalendar";
import { ActionTabs } from "@/components/timesheet/ActionTabs";
import { LogForm } from "@/components/timesheet/LogForm";

export default function TimesheetPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"timesheet" | "leave">("timesheet");
  const [filledDates, setFilledDates] = useState<Set<string>>(new Set());
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set());
  const [today] = useState(new Date());
  const [dateChoice, setDateChoice] = useState<"today" | "yesterday">("today");
  const [leaveDate, setLeaveDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dropdownDate = useMemo(() => dateChoice === "today" ? new Date() : addDays(new Date(), -1), [dateChoice]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;
      const start = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-01");
      const end = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), "yyyy-MM-dd");
      const { data: ts } = await supabaseClient.from("timesheets").select("work_date").gte("work_date", start).lte("work_date", end);
      setFilledDates(new Set((ts || []).map((t: any) => t.work_date)));
      const { data: lv } = await supabaseClient.from("leaves").select("leave_date").gte("leave_date", start).lte("leave_date", end);
      setLeaveDates(new Set((lv || []).map((l: any) => l.leave_date)));
    })();
  }, [today]);

  async function submitTimesheet() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const twoDaysAgo = addDays(startOfDay(new Date()), -2);
    // Use the derived date from choice, not selectedDate unless visually picked (but logic says choice governs)
    const targetDate = dateChoice === 'today' ? new Date() : addDays(new Date(), -1);

    if (isBefore(targetDate, twoDaysAgo)) { toast({ title: "Only Today/Yesterday allowed", variant: "error" }); return; }
    // Prefer profiles.in_time (HH:MM) if set; fallback to shifts.start_time
    const [{ data: prof }, { data: shift }] = await Promise.all([
      supabaseClient.from("profiles").select("in_time").eq("id", user.id).maybeSingle(),
      supabaseClient.from("shifts").select("start_time").eq("user_id", user.id).maybeSingle(),
    ]);
    const check_in = new Date();
    let minutes_late = 0;
    const inTime = prof?.in_time || shift?.start_time;
    if (inTime) {
      const [hh, mm] = String(inTime).split(":").map((n: string) => parseInt(n, 10));
      const expected = new Date(targetDate); expected.setHours(hh || 0, mm || 0, 0, 0);
      const diff = Math.floor((check_in.getTime() - expected.getTime()) / 60000);
      minutes_late = Math.max(0, diff);
    }
    const dateKey = format(targetDate, "yyyy-MM-dd");
    const { error } = await supabaseClient.from("timesheets").insert({
      user_id: user.id, work_date: dateKey, check_in: check_in.toISOString(), minutes_late
    });
    if (error) { toast({ title: "Submit failed", description: error.message, variant: "error" }); return; }
    // Auto late deduction... (logic unchanged)
    try {
      if (minutes_late >= 15) {
        // Determine tier: 60+ => 200rs, 30+ => 100rs, 15+ => 50rs
        const desired = minutes_late >= 60 ? 20000 : minutes_late >= 30 ? 10000 : 5000;
        const { data: existing } = await supabaseClient.from('salary_entries')
          .select('id,amount_cents').eq('user_id', user.id).eq('entry_date', dateKey).eq('reason', 'late').maybeSingle();
        if (!existing) {
          const { error: insErr } = await supabaseClient.from('salary_entries').insert({
            user_id: user.id, entry_date: dateKey, amount_cents: desired, reason: 'late', kind: 'deduction'
          });
          if (!insErr) toast({ title: `Late deduction applied (₹ ${(desired / 100).toFixed(2)})`, variant: 'success' });
        } else if ((existing as any).amount_cents < desired) {
          await supabaseClient.from('salary_entries').update({ amount_cents: desired }).eq('id', (existing as any).id);
          toast({ title: `Late deduction upgraded`, variant: 'success' });
        }
      }
    } catch { }

    setFilledDates(prev => { const next = new Set(prev); next.add(dateKey); return next; });
    toast({ title: "Timesheet submitted", variant: "success" });
  }

  async function submitLeave() {
    const d = new Date(leaveDate);
    const max = addMonths(new Date(), 5);
    if (isAfter(d, max)) { toast({ title: "Max 5 months ahead", variant: "error" }); return; }
    const { data: { user } } = await supabaseClient.auth.getUser(); if (!user) return;
    const leaveKey = format(d, "yyyy-MM-dd");
    const { error } = await supabaseClient.from("leaves").insert({
      user_id: user.id, leave_date: leaveKey, reason
    });
    if (error) { toast({ title: "Leave failed", description: error.message, variant: "error" }); return; }
    // Auto leave deduction logic...
    try {
      const { data: prof } = await supabaseClient.from('profiles').select('per_day_salary_cents').eq('id', user.id).maybeSingle();
      const perDay = prof?.per_day_salary_cents || 0;
      if (perDay > 0) {
        await supabaseClient.from('salary_entries').insert({
          user_id: user.id, entry_date: leaveKey, amount_cents: perDay, reason: 'Leave deduction', kind: 'deduction'
        });
      }
    } catch { }
    setLeaveDates(prev => { const next = new Set(prev); next.add(leaveKey); return next; });
    toast({ title: "Leave applied", variant: "success" });
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-20 md:pb-10">
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors text-sm font-medium">
            <ChevronLeft size={16} />
            Back Home
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Timesheet</h1>
        </div>

        {/* Components */}
        <div className="space-y-6">
          <TimesheetCalendar
            value={selectedDate}
            onChange={(d) => { setSelectedDate(d); if (tab === 'leave') setLeaveDate(format(d, 'yyyy-MM-dd')); }}
            filledDates={filledDates}
            leaveDates={leaveDates}
          />

          <ActionTabs activeTab={tab} onChange={setTab} />

          <LogForm
            mode={tab}
            // Timesheet
            dateChoice={dateChoice}
            onDateChoiceChange={(v) => {
              setDateChoice(v);
              setSelectedDate(v === "today" ? new Date() : addDays(new Date(), -1));
            }}
            onSubmitTimesheet={submitTimesheet}
            // Leave
            leaveDate={leaveDate}
            onLeaveDateChange={setLeaveDate}
            reason={reason}
            onReasonChange={setReason}
            onSubmitLeave={submitLeave}
          />
        </div>
      </div>
    </div>
  );
}
