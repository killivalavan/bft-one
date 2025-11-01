"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";

export default function MySalaryPage(){
  const [month, setMonth] = useState<Date>(()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [base, setBase] = useState<number>(0);
  const [entries, setEntries] = useState<{id:string; entry_date:string; amount_cents:number; reason:string; kind:string}[]>([]);

  const range = useMemo(()=>{
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth()+1, 0);
    const startStr = start.toISOString().slice(0,10);
    const endStr = end.toISOString().slice(0,10);
    return { startStr, endStr };
  }, [month]);

  useEffect(()=>{
    (async ()=>{
      const { data:{ user } } = await supabaseClient.auth.getUser();
      if (!user) return;
      const [{ data: prof }, { data: ents }] = await Promise.all([
        supabaseClient.from('profiles').select('base_salary_cents').eq('id', user.id).maybeSingle(),
        supabaseClient.from('salary_entries').select('id,entry_date,amount_cents,reason,kind').eq('user_id', user.id).gte('entry_date', range.startStr).lte('entry_date', range.endStr).order('entry_date', { ascending: false })
      ]);
      setBase(prof?.base_salary_cents || 0);
      setEntries(ents||[]);
    })();
  }, [range.startStr, range.endStr]);

  const totals = useMemo(()=>{
    const deductions = (entries||[]).reduce((s,e)=> s + (e.amount_cents||0), 0);
    const net = Math.max(0, (base||0) - deductions);
    return { deductions, net };
  }, [entries, base]);

  function prevMonth(){ setMonth(m=> new Date(m.getFullYear(), m.getMonth()-1, 1)); }
  function nextMonth(){ setMonth(m=> new Date(m.getFullYear(), m.getMonth()+1, 1)); }

  const label = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-zinc-900"><Wallet size={18} className="text-emerald-700" /> My Salary — {label}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={prevMonth}><ChevronLeft size={16} /></Button>
              <Button size="sm" onClick={nextMonth}><ChevronRight size={16} /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-xl border p-3 bg-white text-center">
              <div className="text-[11px] text-zinc-600">Base salary</div>
              <div className="text-xl font-semibold text-zinc-900">₹ {(base/100).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border p-3 bg-white text-center">
              <div className="text-[11px] text-zinc-600">Deductions</div>
              <div className="text-xl font-semibold text-zinc-900 text-red-600">₹ {(totals.deductions/100).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border p-3 bg-white text-center">
              <div className="text-[11px] text-zinc-600">Net</div>
              <div className="text-xl font-semibold text-zinc-900">₹ {(totals.net/100).toFixed(2)}</div>
            </div>
          </div>

          <div className="grid gap-2 mt-1">
            <div className="text-sm font-medium text-zinc-900">Entries</div>
            <div className="rounded-xl border border-zinc-200 overflow-hidden bg-white text-zinc-900">
              <div className="grid grid-cols-3 bg-zinc-50 text-[12px] font-medium text-zinc-900">
                <div className="px-3 py-2">Date</div>
                <div className="px-3 py-2">Reason</div>
                <div className="px-3 py-2 text-right">Amount</div>
              </div>
              <div className="divide-y divide-zinc-200">
                {entries.map((e, idx)=> {
                  const reason = (e.reason||'').toLowerCase();
                  const badge = reason === 'late' ? 'bg-red-50 text-red-700 border-red-200'
                    : reason === 'leave' ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : reason === 'advance' ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : reason === 'adjustment' ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-200';
                  return (
                  <div key={e.id} className={`grid grid-cols-3 text-sm text-zinc-900 hover:bg-zinc-50 transition-colors ${idx%2===1? 'bg-zinc-50/40':''}`}>
                    <div className="px-3 py-2">{e.entry_date}</div>
                    <div className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${badge}`}>{e.reason}</span>
                    </div>
                    <div className="px-3 py-2 text-right font-medium">₹ {(e.amount_cents/100).toFixed(2)}</div>
                  </div>
                );})}
                {entries.length===0 && (
                  <div className="px-3 py-6 text-sm text-zinc-500">No deductions this month</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
