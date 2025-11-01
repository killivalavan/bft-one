"use client";
import Link from "next/link";
import { format, addDays, isAfter, isBefore, addMonths, startOfDay, isSameDay } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import dynamic from "next/dynamic";
import "react-calendar/dist/Calendar.css";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const Calendar = dynamic(()=>import("react-calendar"), { ssr: false });

export default function TimesheetPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"timesheet"|"leave">("timesheet");
  const [filledDates, setFilledDates] = useState<Set<string>>(new Set());
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set());
  const [today] = useState(new Date());
  const [dateChoice, setDateChoice] = useState<"today"|"yesterday">("today");
  const [leaveDate, setLeaveDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dropdownDate = useMemo(()=> dateChoice==="today" ? new Date() : addDays(new Date(), -1), [dateChoice]);

  useEffect(()=>{
    (async ()=>{
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;
      const start = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-01");
      const end = format(new Date(today.getFullYear(), today.getMonth()+1, 0), "yyyy-MM-dd");
      const { data: ts } = await supabaseClient.from("timesheets").select("work_date").gte("work_date", start).lte("work_date", end);
      setFilledDates(new Set((ts||[]).map((t:any)=>t.work_date)));
      const { data: lv } = await supabaseClient.from("leaves").select("leave_date").gte("leave_date", start).lte("leave_date", end);
      setLeaveDates(new Set((lv||[]).map((l:any)=>l.leave_date)));
    })();
  },[today]);

  async function submitTimesheet() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const twoDaysAgo = addDays(startOfDay(new Date()), -2);
    if (isBefore(selectedDate, twoDaysAgo)) { toast({ title: "Only Today/Yesterday allowed", variant: "error" }); return; }
    // Prefer profiles.in_time (HH:MM) if set; fallback to shifts.start_time
    const [{ data: prof }, { data: shift }] = await Promise.all([
      supabaseClient.from("profiles").select("in_time").eq("id", user.id).maybeSingle(),
      supabaseClient.from("shifts").select("start_time").eq("user_id", user.id).maybeSingle(),
    ]);
    const check_in = new Date();
    let minutes_late = 0;
    const inTime = prof?.in_time || shift?.start_time;
    if (inTime) {
      const [hh,mm] = String(inTime).split(":").map((n:string)=> parseInt(n,10));
      const expected = new Date(selectedDate); expected.setHours(hh||0,mm||0,0,0);
      const diff = Math.floor((check_in.getTime() - expected.getTime()) / 60000);
      minutes_late = Math.max(0, diff);
    }
    const dateKey = format(selectedDate,"yyyy-MM-dd");
    const { error } = await supabaseClient.from("timesheets").insert({
      user_id: user.id, work_date: dateKey, check_in: check_in.toISOString(), minutes_late
    });
    if (error) { toast({ title: "Submit failed", description: error.message, variant: "error" }); return; }
    // Auto late deduction once per day with tiers
    try {
      if (minutes_late >= 15) {
        // Determine tier: 60+ => 200rs, 30+ => 100rs, 15+ => 50rs
        const desired = minutes_late >= 60 ? 20000 : minutes_late >= 30 ? 10000 : 5000;
        const { data: existing } = await supabaseClient.from('salary_entries')
          .select('id,amount_cents').eq('user_id', user.id).eq('entry_date', dateKey).eq('reason', 'late').maybeSingle();
        if (!existing) {
          const { error: insErr } = await supabaseClient.from('salary_entries').insert({
            user_id: user.id,
            entry_date: dateKey,
            amount_cents: desired,
            reason: 'late',
            kind: 'deduction'
          });
          if (insErr) {
            toast({ title: 'Late deduction failed', description: insErr.message, variant: 'error' });
          } else {
            toast({ title: `Late deduction applied (₹ ${(desired/100).toFixed(2)} for ${minutes_late} mins late)`, variant: 'success' });
          }
        } else if ((existing as any).amount_cents < desired) {
          const { error: upErr } = await supabaseClient.from('salary_entries')
            .update({ amount_cents: desired }).eq('id', (existing as any).id);
          if (upErr) {
            toast({ title: 'Late deduction update failed', description: upErr.message, variant: 'error' });
          } else {
            toast({ title: `Late deduction upgraded to ₹ ${(desired/100).toFixed(2)} (${minutes_late} mins late)`, variant: 'success' });
          }
        } else {
          toast({ title: `Late deduction already recorded (₹ ${(((existing as any).amount_cents||0)/100).toFixed(2)})`, variant: 'success' });
        }
      } else {
        // For testing visibility
        toast({ title: `Not late (minutes late: ${minutes_late})`, variant: 'success' });
      }
    } catch (e:any) {
      toast({ title: 'Late deduction error', description: e?.message || 'unknown', variant: 'error' });
    }
    // Update UI without reload
    setFilledDates(prev=>{
      const next = new Set(prev);
      next.add(dateKey);
      return next;
    });
    toast({ title: "Timesheet submitted", variant: "success" });
  }

  async function submitLeave() {
    const d = new Date(leaveDate);
    const max = addMonths(new Date(), 5);
    if (isAfter(d, max)) { toast({ title: "Max 5 months ahead", variant: "error" }); return; }
    const { data: { user } } = await supabaseClient.auth.getUser(); if (!user) return;
    const leaveKey = format(d,"yyyy-MM-dd");
    const { error } = await supabaseClient.from("leaves").insert({
      user_id: user.id, leave_date: leaveKey, reason
    });
    if (error) { toast({ title: "Leave failed", description: error.message, variant: "error" }); return; }
    // Auto leave deduction using per_day_salary_cents
    try {
      const { data: prof } = await supabaseClient.from('profiles').select('per_day_salary_cents').eq('id', user.id).maybeSingle();
      const perDay = prof?.per_day_salary_cents || 0;
      if (perDay > 0) {
        await supabaseClient.from('salary_entries').insert({
          user_id: user.id,
          entry_date: leaveKey,
          amount_cents: perDay,
          reason: 'Leave deduction',
          kind: 'deduction'
        });
      }
    } catch {}
    setLeaveDates(prev=>{
      const next = new Set(prev);
      next.add(leaveKey);
      return next;
    });
    toast({ title: "Leave applied", variant: "success" });
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
      <h1 className="text-lg font-semibold text-sky-700">Timesheet</h1>
      {/* Visual calendar with status colors */}
      <div className="rounded border p-2">
        <Calendar
          value={selectedDate}
          onChange={(v:any)=>{ const d=v as Date; setSelectedDate(d); if (tab==='leave') setLeaveDate(format(d,'yyyy-MM-dd')); }}
          tileClassName={({ date, view })=>{
            // Only style month view tiles
            if (view !== 'month') return undefined;
            const key = format(date, "yyyy-MM-dd");
            if (filledDates.has(key)) return "tile-filled"; // green
            if (leaveDates.has(key)) return "tile-leave";   // blue for leave
            // Red only for dates up to today in the current month
            const isSameMonth = date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
            if (isSameMonth && (date <= today)) return "tile-empty";
            return undefined;
          }}
          prev2Label={null}
          next2Label={null}
        />
        <div className="text-xs text-gray-500 mt-2 flex gap-4">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500"></span> Timesheet</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-sky-500"></span> Leave</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500"></span> Not Filled</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button className={`px-3 py-1.5 rounded-full border ${tab==='timesheet'?'bg-indigo-600 text-white border-indigo-600':'bg-white text-zinc-800'}`} onClick={()=>setTab("timesheet")}>Timesheet</button>
        <button className={`px-3 py-1.5 rounded-full border ${tab==='leave'?'bg-indigo-600 text-white border-indigo-600':'bg-white text-zinc-800'}`} onClick={()=>setTab("leave")}>Leave</button>
      </div>

      {tab==='timesheet' && (
        <div className="grid gap-3">
          <div className="text-sm">Selected: {format(selectedDate, "eee, MMM d")}</div>
          <label className="grid gap-1">
            <span className="text-sm">Date</span>
            <select className="border border-zinc-300 rounded p-2 bg-white text-zinc-900" value={dateChoice} onChange={e=>{const v=e.target.value as any; setDateChoice(v); setSelectedDate(v==="today"?new Date():addDays(new Date(),-1));}}>
              <option value="today">Today ({format(new Date(),"MMM d")})</option>
              <option value="yesterday">Yesterday ({format(addDays(new Date(),-1),"MMM d")})</option>
            </select>
          </label>
          <Button onClick={submitTimesheet}>Submit</Button>
        </div>
      )}

      {tab==='leave' && (
        <div className="grid gap-3">
          <input className="border border-zinc-300 rounded p-2 bg-white text-zinc-900" type="date" value={leaveDate} onChange={e=>setLeaveDate(e.target.value)} />
          <input className="border border-zinc-300 rounded p-2 bg-white text-zinc-900" placeholder="Reason" value={reason} onChange={e=>setReason(e.target.value)} />
          <Button onClick={submitLeave}>Apply Leave</Button>
        </div>
      )}
    </div>
    </div>
  );
}
