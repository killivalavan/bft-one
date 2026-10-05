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
import { PresentStaffModal } from "@/components/timesheet/PresentStaffModal";
import { Button } from "@/components/ui/Button";
import { Users } from "lucide-react";
import { useTenant } from "@/lib/context/TenantContext";
import { SyncStatusBadge } from "@/components/offline/SyncStatusBadge";
import {
  STORES,
  getItemsByTenant,
  putItem,
  LocalTimesheet,
  LocalLeave,
} from "@/lib/offline/db";
import { enqueueSyncOperation } from "@/lib/offline/syncEngine";

export default function TimesheetPage() {
  const { toast } = useToast();
  const { business } = useTenant();
  const [tab, setTab] = useState<"timesheet" | "leave">("timesheet");
  const [filledDates, setFilledDates] = useState<Set<string>>(new Set());
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set());
  const [today] = useState(new Date());
  const [dateChoice, setDateChoice] = useState<"today" | "yesterday">("today");
  const [leaveDate, setLeaveDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPresentModal, setShowPresentModal] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dropdownDate = useMemo(() => dateChoice === "today" ? new Date() : addDays(new Date(), -1), [dateChoice]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabaseClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      setIsAdmin(!!prof?.is_admin);

      const start = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-01");
      const end = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), "yyyy-MM-dd");
      const { data: ts } = await supabaseClient
        .from("timesheets")
        .select("work_date")
        .eq("user_id", user.id)
        .gte("work_date", start)
        .lte("work_date", end);
      setFilledDates(new Set((ts || []).map((t: any) => t.work_date)));
      const { data: lv } = await supabaseClient
        .from("leaves")
        .select("leave_date")
        .eq("user_id", user.id)
        .gte("leave_date", start)
        .lte("leave_date", end);
      setLeaveDates(new Set((lv || []).map((l: any) => l.leave_date)));
    })();
  }, [today]);

  async function submitTimesheet() {
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    if (!user) return;
    const twoDaysAgo = addDays(startOfDay(new Date()), -2);
    const targetDate = dateChoice === 'today' ? new Date() : addDays(new Date(), -1);

    if (isBefore(targetDate, twoDaysAgo)) { toast({ title: "Only Today/Yesterday allowed", variant: "error" }); return; }

    let prof: any = null;
    let shift: any = null;
    try {
      const [profRes, shiftRes] = await Promise.all([
        supabaseClient.from("profiles").select("in_time").eq("id", user.id).maybeSingle(),
        supabaseClient.from("shifts").select("start_time").eq("user_id", user.id).maybeSingle(),
      ]);
      prof = profRes.data;
      shift = shiftRes.data;
    } catch {}

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
    const bizId = business?.id || "default";
    const tsId = crypto.randomUUID();

    const localTs: LocalTimesheet = {
      id: tsId,
      business_id: bizId,
      user_id: user.id,
      work_date: dateKey,
      check_in: check_in.toISOString(),
      minutes_late,
      created_at: new Date().toISOString(),
    };

    // 1. Save to IndexedDB
    await putItem<LocalTimesheet>(STORES.timesheets, localTs);
    setFilledDates((prev) => { const next = new Set(prev); next.add(dateKey); return next; });

    // 2. Enqueue sync mutation
    await enqueueSyncOperation({
      businessId: bizId,
      tableName: "timesheets",
      action: "INSERT",
      payload: {
        id: localTs.id,
        user_id: localTs.user_id,
        work_date: localTs.work_date,
        check_in: localTs.check_in,
        minutes_late: localTs.minutes_late,
        business_id: localTs.business_id,
      },
      customId: tsId,
    });

    toast({ title: "Timesheet recorded! ⏱️", description: "Saved locally and queued for sync", variant: "success" });
  }

  async function submitLeave() {
    const d = new Date(leaveDate);
    const max = addMonths(new Date(), 5);
    if (isAfter(d, max)) { toast({ title: "Max 5 months ahead", variant: "error" }); return; }
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    if (!user) return;
    const leaveKey = format(d, "yyyy-MM-dd");
    const bizId = business?.id || "default";
    const lvId = crypto.randomUUID();

    const localLv: LocalLeave = {
      id: lvId,
      business_id: bizId,
      user_id: user.id,
      leave_date: leaveKey,
      reason,
      created_at: new Date().toISOString(),
    };

    // 1. Save to IndexedDB
    await putItem<LocalLeave>(STORES.leaves, localLv);
    setLeaveDates((prev) => { const next = new Set(prev); next.add(leaveKey); return next; });

    // 2. Enqueue sync mutation
    await enqueueSyncOperation({
      businessId: bizId,
      tableName: "leaves",
      action: "INSERT",
      payload: {
        id: localLv.id,
        user_id: localLv.user_id,
        leave_date: localLv.leave_date,
        reason: localLv.reason,
        business_id: localLv.business_id,
      },
      customId: lvId,
    });

    toast({ title: "Leave applied! 🌴", description: "Saved locally and queued for sync", variant: "success" });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 md:pb-10">
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-[#2563EB] transition-colors text-sm font-medium">
              <ChevronLeft size={16} />
              Back Home
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Timesheet</h1>
              <SyncStatusBadge />
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowPresentModal(true)} className="gap-2 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs">
              <Users size={16} />
              <span className="hidden sm:inline">Present Staff</span>
            </Button>
          )}
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

          <PresentStaffModal
            open={showPresentModal}
            onClose={() => setShowPresentModal(false)}
            date={selectedDate}
          />
        </div>
      </div>
    </div>
  );
}

