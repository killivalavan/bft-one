"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function SalaryManager({ userId }:{ userId:string }){
  const [month, setMonth] = useState<Date>(()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<{date:string; reason:string; amount:string; kind:string}>({ date: new Date().toISOString().slice(0,10), reason: '', amount: '0', kind: 'deduction' });
  const [base, setBase] = useState<number>(0);

  const range = useMemo(()=>{
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth()+1, 0);
    return { startStr: start.toISOString().slice(0,10), endStr: end.toISOString().slice(0,10) };
  }, [month]);

  async function load(){
    const [{ data }, { data: prof }] = await Promise.all([
      supabaseClient.from('salary_entries').select('id,entry_date,amount_cents,reason,kind').eq('user_id', userId).gte('entry_date', range.startStr).lte('entry_date', range.endStr).order('entry_date', { ascending: false }),
      supabaseClient.from('profiles').select('base_salary_cents').eq('id', userId).maybeSingle()
    ]);
    setRows(data||[]);
    setBase(prof?.base_salary_cents || 0);
  }
  useEffect(()=>{ load(); }, [userId, range.startStr, range.endStr]);

  async function add(){
    const cents = Math.round((parseFloat(form.amount||'0')||0)*100);
    const { error } = await supabaseClient.from('salary_entries').insert({ user_id: userId, entry_date: form.date, amount_cents: cents, reason: form.reason||'Manual entry', kind: form.kind||'deduction' });
    if (!error) { setForm({ ...form, reason: '', amount: '0' }); await load(); }
  }
  async function del(id:string){ await supabaseClient.from('salary_entries').delete().eq('id', id); await load(); }

  const monthLabel = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const totals = (()=>{
    const deductions = (rows||[]).reduce((s,r)=> s + (r.amount_cents||0), 0);
    const net = Math.max(0, (base||0) - deductions);
    return { deductions, net };
  })();

  return (
    <div className="grid gap-2 mt-2">
      <div className="flex items-center justify-between text-sm">
        <div className="font-medium text-zinc-900">Payslip — {monthLabel}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={()=>setMonth(m=> new Date(m.getFullYear(), m.getMonth()-1, 1))}>Prev</Button>
          <Button size="sm" onClick={()=>setMonth(m=> new Date(m.getFullYear(), m.getMonth()+1, 1))}>Next</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-xl border p-2 bg-white text-center">
          <div className="text-[11px] text-zinc-600">Base salary</div>
          <div className="text-lg font-semibold text-zinc-900">₹ {(base/100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border p-2 bg-white text-center">
          <div className="text-[11px] text-zinc-600">Deductions</div>
          <div className="text-lg font-semibold text-red-600">₹ {(totals.deductions/100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border p-2 bg-white text-center">
          <div className="text-[11px] text-zinc-600">Net</div>
          <div className="text-lg font-semibold text-zinc-900">₹ {(totals.net/100).toFixed(2)}</div>
        </div>
      </div>
      <div className="grid gap-2 text-zinc-900">
        {rows.map((r, idx)=> {
          const reason = String(r.reason||'').toLowerCase();
          const badge = reason === 'late' ? 'bg-red-50 text-red-700 border-red-200'
            : reason === 'leave' ? 'bg-sky-50 text-sky-700 border-sky-200'
            : reason === 'advance' ? 'bg-amber-50 text-amber-700 border-amber-200'
            : reason === 'adjustment' ? 'bg-violet-50 text-violet-700 border-violet-200'
            : 'bg-zinc-50 text-zinc-700 border-zinc-200';
          return (
          <div key={r.id} className={`rounded-xl border border-zinc-200 p-2 flex items-center justify-between text-sm text-zinc-900 bg-white hover:bg-zinc-50 transition-colors ${idx%2===1?'bg-zinc-50/40':''}`}>
            <div>
              <div className="font-medium text-zinc-900 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${badge}`}>{r.reason}</span>
              </div>
              <div className="text-[12px] text-zinc-700">{r.entry_date} • {r.kind}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="font-semibold text-red-600">₹ {(r.amount_cents/100).toFixed(2)}</div>
              <Button variant="outline" onClick={()=>del(r.id)}>Delete</Button>
            </div>
          </div>
        );})}
        {rows.length===0 && (
          <div className="text-sm text-zinc-500">No entries</div>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input type="date" value={form.date} onChange={e=>setForm(f=>({...f, date:e.target.value}))} />
        <Input placeholder="Reason" value={form.reason} onChange={e=>setForm(f=>({...f, reason:e.target.value}))} />
        <Input type="number" placeholder="Amount (₹)" value={form.amount} onChange={e=>setForm(f=>({...f, amount:e.target.value}))} />
        <select className="h-11 px-3 rounded-lg border border-zinc-300" value={form.kind} onChange={e=>setForm(f=>({...f, kind:e.target.value}))}>
          <option value="deduction">Deduction</option>
          <option value="advance">Advance</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <div className="sm:col-span-4">
          <Button onClick={add}>Add entry</Button>
        </div>
      </div>
    </div>
  );
}
