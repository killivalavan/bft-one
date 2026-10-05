"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Download, CheckCircle, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/Toast";
import { WhatsAppPayslipModal, WhatsAppIcon, formatWhatsAppPhone } from "@/components/admin/WhatsAppPayslipModal";

interface SalaryManagerProps {
  userId: string;
  userEmail?: string;
  contactNumber?: string | null;
  perDaySalary?: number | null;
  onDownloadPayslip: (userId: string, date: Date) => Promise<any>;
  onUpdateContactNumber?: (newPhone: string) => Promise<void>;
  onSettlementChange?: (monthKey: string, isSettled: boolean) => void;
}

export default function SalaryManager({
  userId,
  userEmail,
  contactNumber,
  perDaySalary,
  onDownloadPayslip,
  onUpdateContactNumber,
  onSettlementChange,
}: SalaryManagerProps) {
  const { business } = useTenant();
  const { toast } = useToast();
  const [month, setMonth] = useState<Date>(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<{ date: string; reason: string; amount: string; kind: string }>({
    date: (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })(),
    reason: '', amount: '0', kind: 'deduction'
  });
  const [base, setBase] = useState<number>(0);
  const [fixedAllowance, setFixedAllowance] = useState<number>(0);
  const [isSettled, setIsSettled] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);

  // Auto-fill amount for 'Leave' based on per-day salary
  useEffect(() => {
    if (form.kind === 'deduction' && form.reason.toLowerCase().includes('leave') && perDaySalary) {
      // Only auto-fill if amount is 0 or matches previous auto-fill (heuristic)
      // To be safe, just set it if currently 0
      if (form.amount === '0' || form.amount === '') {
        setForm(f => ({ ...f, amount: (perDaySalary / 100).toFixed(2) }));
      }
    }
  }, [form.reason, form.kind, perDaySalary]);

  const range = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    // Use manual formatting to avoid UTC shifts
    const toDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    return { startStr: toDateStr(start), endStr: toDateStr(end), monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}` };
  }, [month]);

  async function load() {
    const [{ data }, { data: prof }, { data: settlement }] = await Promise.all([
      supabaseClient.from('salary_entries').select('id,entry_date,amount_cents,reason,kind').eq('user_id', userId).gte('entry_date', range.startStr).lte('entry_date', range.endStr).order('entry_date', { ascending: false }),
      supabaseClient.from('profiles').select('base_salary_cents, fixed_allowance_cents').eq('id', userId).maybeSingle(),
      supabaseClient.from('salary_settlements').select('is_settled').eq('user_id', userId).eq('month_key', range.monthKey).maybeSingle()
    ]);
    setRows(data || []);
    setBase(prof?.base_salary_cents || 0);
    setFixedAllowance(prof?.fixed_allowance_cents || 0);
    const settled = settlement?.is_settled || false;
    setIsSettled(settled);
    onSettlementChange?.(range.monthKey, settled);
  }
  useEffect(() => { load(); }, [userId, range.startStr, range.endStr]);

  async function add() {
    // If reason is leave and amount is 0, try to check perDaySalary again?
    // The useEffect handles the form state.
    const cents = Math.round((parseFloat(form.amount || '0') || 0) * 100);
    const { error } = await supabaseClient.from('salary_entries').insert({ user_id: userId, entry_date: form.date, amount_cents: cents, reason: form.reason || 'Manual entry', kind: form.kind || 'deduction', business_id: business?.id });
    if (!error) { setForm({ ...form, reason: '', amount: '0' }); await load(); }
  }
  async function del(id: string) { await supabaseClient.from('salary_entries').delete().eq('id', id); await load(); }

  async function toggleSettled() {
    const newVal = !isSettled;
    setIsSettled(newVal); // Optimistic
    onSettlementChange?.(range.monthKey, newVal);

    let error;
    if (newVal) {
      const { error: err } = await supabaseClient.from('salary_settlements').upsert({ user_id: userId, month_key: range.monthKey, is_settled: true, business_id: business?.id });
      error = err;
    } else {
      const { error: err } = await supabaseClient.from('salary_settlements').delete().eq('user_id', userId).eq('month_key', range.monthKey);
      error = err;
    }

    if (error) {
      console.error("Settlement update failed", error);
      setIsSettled(!newVal); // Revert
      onSettlementChange?.(range.monthKey, !newVal);
      alert("Failed to update status. Please check database permissions.");
    } else {
      await load();
    }
  }

  async function proceedShareToWhatsAppWeb(targetPhone: string) {
    const cleanPhone = formatWhatsAppPhone(targetPhone);
    if (!cleanPhone) {
      toast({
        title: "Phone Number Required",
        description: "Please enter a valid WhatsApp number.",
        variant: "error",
      });
      return;
    }

    setIsSharingWhatsApp(true);
    try {
      // 1. Generate and download the PDF payslip
      const pdfResult = await onDownloadPayslip(userId, month);

      let publicPdfUrl = "";

      // 2. Upload to Supabase Storage to get public shareable link
      if (pdfResult && pdfResult.blob) {
        try {
          const uploadData = new FormData();
          uploadData.append("file", pdfResult.blob, pdfResult.fileName || "payslip.pdf");
          uploadData.append("userId", userId);
          uploadData.append("monthLabel", monthLabel);

          const upRes = await fetch("/api/payslips/upload", {
            method: "POST",
            body: uploadData,
          });

          if (upRes.ok) {
            const data = await upRes.json();
            if (data.url) publicPdfUrl = data.url;
          }
        } catch (upErr) {
          console.warn("Could not upload PDF to cloud storage:", upErr);
        }
      }

      const cleanEmpName = (userEmail || "Employee")
        .split("@")[0]
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const netFormatted = (totals.net / 100).toFixed(2);
      const statusStr = isSettled ? "Settled / Disbursed ✅" : "Pending Settlement ⏳";

      const message = publicPdfUrl
        ? `📄 *Official Payslip — ${monthLabel.toUpperCase()}*
🏢 *${(business?.name || "SeyalPro").toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━
👤 *Employee:* ${cleanEmpName}
📅 *Period:* ${monthLabel}
💵 *Net Pay:* ₹${netFormatted}
📌 *Status:* ${statusStr}
━━━━━━━━━━━━━━━━━━━━
📥 *Download / View Payslip PDF:*
${publicPdfUrl}
━━━━━━━━━━━━━━━━━━━━
_Generated via SeyalPro._`
        : `📄 *Official Payslip — ${monthLabel.toUpperCase()}*
🏢 *${(business?.name || "SeyalPro").toUpperCase()}*
👤 *Employee:* ${cleanEmpName}
💵 *Net Pay:* ₹${netFormatted} (${statusStr})
(Payslip PDF document downloaded to device)`;

      // 3. Open WhatsApp Web directly into employee's chat with message ready to send
      const encodedMsg = encodeURIComponent(message);
      const webUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
      window.open(webUrl, "_blank");

      toast({
        title: "WhatsApp Web Opened 💬",
        description: "Payslip message with PDF link loaded in chat. Just press Send!",
        variant: "success",
      });
    } catch (e: any) {
      console.error("WhatsApp share failed:", e);
      toast({
        title: "Download Failed",
        description: e?.message || "Could not generate payslip PDF.",
        variant: "error",
      });
    } finally {
      setIsSharingWhatsApp(false);
    }
  }

  async function handleShareWhatsApp() {
    const phone = (contactNumber || "").trim();
    if (!phone) {
      setIsPhoneModalOpen(true);
      return;
    }
    await proceedShareToWhatsAppWeb(phone);
  }

  const monthLabel = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const totals = (() => {
    let ded = 0;
    let add = 0;
    (rows || []).forEach(r => {
      if (['allowance', 'bonus', 'addition'].includes(r.kind)) add += (r.amount_cents || 0);
      else ded += (r.amount_cents || 0);
    });

    const net = (base || 0) + (fixedAllowance || 0) + add - ded;
    return { deductions: ded, additions: add, net };
  })();

  return (
    <div className={cn("grid gap-2 mt-2 transition-colors duration-300", isSettled ? "bg-emerald-50/70 p-3 rounded-xl border border-emerald-200" : "")}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-slate-900">Payslip — {monthLabel}</div>
          {isSettled && <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md flex items-center gap-1"><CheckCircle size={10} /> Settled</span>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>Prev</Button>
          <Button size="sm" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>Next</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Base salary</div>
          <div className="text-lg font-semibold text-slate-900">₹ {(base / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Fixed + Extra</div>
          <div className="text-lg font-semibold text-emerald-700">₹ {((fixedAllowance + totals.additions) / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Deductions</div>
          <div className="text-lg font-semibold text-slate-700">₹ {(totals.deductions / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Net Pay</div>
          <div className="text-lg font-bold text-slate-900">₹ {(totals.net / 100).toFixed(2)}</div>
        </div>
      </div>
      <div className="grid gap-2 text-slate-900">
        {rows.map((r, idx) => {
          const isPos = ['allowance', 'bonus', 'addition'].includes(r.kind);
          const badge = isPos 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-800 border-slate-200';
          return (
            <div key={r.id} className={`rounded-xl border border-slate-200 p-2.5 flex items-center justify-between text-sm text-slate-900 bg-white hover:bg-slate-50 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
              <div>
                <div className="font-medium text-slate-900 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${badge}`}>{r.reason}</span>
                </div>
                <div className="text-[12px] text-slate-500 mt-0.5">{r.entry_date} • {r.kind}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`font-semibold tabular-nums ${isPos ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {isPos ? '+' : '-'} ₹ {(r.amount_cents / 100).toFixed(2)}
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => del(r.id)}>Delete</Button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-sm text-slate-400 py-2">No entries</div>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <Input placeholder="Reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
        <Input type="number" placeholder="Amount (₹)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        <select className="h-11 px-3 rounded-lg border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
          <option value="deduction">Deduction</option>
          <option value="allowance">Allowance</option>
          <option value="bonus">Bonus</option>
          <option value="advance">Advance</option>
          <option value="adjustment">Adjustment</option>
          <option value="addition">Addition</option>
        </select>
        <div className="sm:col-span-4 pt-3 mt-1 border-t border-slate-200/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <Button onClick={add} className="w-full md:w-auto h-10 font-semibold justify-center shadow-xs">
            Add entry
          </Button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full md:w-auto">
            <Button
              variant={isSettled ? "secondary" : "outline"}
              className={cn(
                "w-full justify-center gap-2 h-10 text-xs sm:text-sm font-semibold whitespace-nowrap",
                isSettled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
              onClick={toggleSettled}
            >
              {isSettled ? <CheckCircle size={15} /> : <Circle size={15} />}
              <span>{isSettled ? "Settled" : "Mark as Settled"}</span>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-center gap-2 text-[#2563EB] border-slate-200 hover:bg-[#EFF6FF] font-semibold text-xs sm:text-sm h-10 whitespace-nowrap"
              onClick={() => onDownloadPayslip(userId, month)}
            >
              <Download size={14} />
              <span>Download Payslip</span>
            </Button>

            <Button
              variant="outline"
              disabled={isSharingWhatsApp}
              className="w-full justify-center gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 font-semibold text-xs sm:text-sm h-10 whitespace-nowrap"
              onClick={handleShareWhatsApp}
            >
              {isSharingWhatsApp ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <WhatsAppIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>{isSharingWhatsApp ? "Opening..." : "Share on WhatsApp"}</span>
            </Button>
          </div>
        </div>
      </div>

      <WhatsAppPayslipModal
        open={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
        userId={userId}
        employeeName={userEmail ? userEmail.split('@')[0] : 'Employee'}
        contactNumber={contactNumber || ''}
        monthLabel={monthLabel}
        monthDate={month}
        onDownloadPayslip={onDownloadPayslip}
        onSavePhone={onUpdateContactNumber}
      />
    </div>
  );
}
