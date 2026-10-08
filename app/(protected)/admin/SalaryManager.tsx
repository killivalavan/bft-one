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
import { SalarySettlementModal } from "@/components/admin/SalarySettlementModal";

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
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<{ date: string; reason: string; amount: string; kind: string }>({
    date: (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })(),
    reason: "",
    amount: "0",
    kind: "deduction",
  });
  const [base, setBase] = useState<number>(0);
  const [fixedAllowance, setFixedAllowance] = useState<number>(0);
  const [isSettled, setIsSettled] = useState(false);
  const [settlementDetails, setSettlementDetails] = useState<{
    isSettled: boolean;
    settledAmountRupees?: number;
    carryForwardRupees?: number;
    paymentMode?: string;
    notes?: string;
  } | null>(null);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);

  // Auto-fill amount for 'Leave' based on per-day salary
  useEffect(() => {
    if (form.kind === "deduction" && form.reason.toLowerCase().includes("leave") && perDaySalary) {
      if (form.amount === "0" || form.amount === "") {
        setForm((f) => ({ ...f, amount: (perDaySalary / 100).toFixed(2) }));
      }
    }
  }, [form.reason, form.kind, perDaySalary]);

  const range = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const toDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    return {
      startStr: toDateStr(start),
      endStr: toDateStr(end),
      monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
    };
  }, [month]);

  async function load() {
    const [{ data }, { data: prof }] = await Promise.all([
      supabaseClient
        .from("salary_entries")
        .select("id,entry_date,amount_cents,reason,kind")
        .eq("user_id", userId)
        .gte("entry_date", range.startStr)
        .lte("entry_date", range.endStr)
        .order("entry_date", { ascending: false }),
      supabaseClient
        .from("profiles")
        .select("base_salary_cents, fixed_allowance_cents")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    // Try full settlement fetch with new columns; fallback safely if unmigrated
    let settlementData: any = null;
    const { data: fullSet, error: fullSetErr } = await supabaseClient
      .from("salary_settlements")
      .select("is_settled, settled_amount_cents, carry_forward_cents, payment_mode, notes")
      .eq("user_id", userId)
      .eq("month_key", range.monthKey)
      .maybeSingle();

    if (fullSetErr) {
      const { data: basicSet } = await supabaseClient
        .from("salary_settlements")
        .select("is_settled")
        .eq("user_id", userId)
        .eq("month_key", range.monthKey)
        .maybeSingle();
      settlementData = basicSet;
    } else {
      settlementData = fullSet;
    }

    setRows(data || []);
    setBase(prof?.base_salary_cents || 0);
    setFixedAllowance(prof?.fixed_allowance_cents || 0);

    const settled = settlementData?.is_settled || false;
    setIsSettled(settled);
    setSettlementDetails({
      isSettled: settled,
      settledAmountRupees: settlementData?.settled_amount_cents != null ? settlementData.settled_amount_cents / 100 : undefined,
      carryForwardRupees: settlementData?.carry_forward_cents != null ? settlementData.carry_forward_cents / 100 : undefined,
      paymentMode: settlementData?.payment_mode || undefined,
      notes: settlementData?.notes || undefined,
    });
    onSettlementChange?.(range.monthKey, settled);
  }

  useEffect(() => {
    load();
  }, [userId, range.startStr, range.endStr]);

  async function add() {
    const cents = Math.round((parseFloat(form.amount || "0") || 0) * 100);
    const { error } = await supabaseClient.from("salary_entries").insert({
      user_id: userId,
      entry_date: form.date,
      amount_cents: cents,
      reason: form.reason || "Manual entry",
      kind: form.kind || "deduction",
      business_id: business?.id,
    });
    if (!error) {
      setForm({ ...form, reason: "", amount: "0" });
      await load();
    }
  }

  async function del(id: string) {
    await supabaseClient.from("salary_entries").delete().eq("id", id);
    await load();
  }

  async function handleConfirmSettlement(data: {
    settledAmountRupees: number;
    carryForwardToNextMonth: boolean;
    carryForwardAmountRupees: number;
    carryForwardType: "addition" | "deduction" | "none";
    paymentMode: string;
    notes: string;
  }) {
    const settledCents = Math.round(data.settledAmountRupees * 100);
    const carryForwardCents = Math.round(data.carryForwardAmountRupees * 100);

    // 1. Upsert settlement record
    const fullPayload: any = {
      user_id: userId,
      month_key: range.monthKey,
      is_settled: true,
      settled_amount_cents: settledCents,
      carry_forward_cents: carryForwardCents,
      payment_mode: data.paymentMode,
      notes: data.notes,
      business_id: business?.id,
    };

    const { error: errFull } = await supabaseClient
      .from("salary_settlements")
      .upsert(fullPayload);

    if (errFull) {
      console.warn("Full settlement upsert failed, fallback to basic is_settled:", errFull.message);
      await supabaseClient
        .from("salary_settlements")
        .upsert({ user_id: userId, month_key: range.monthKey, is_settled: true, business_id: business?.id });
    }

    // 2. Automated carry-forward to next month 1st if selected
    if (data.carryForwardToNextMonth && data.carryForwardAmountRupees > 0 && data.carryForwardType !== "none") {
      const nextMonthDate = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const y = nextMonthDate.getFullYear();
      const m = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
      const nextMonth1stStr = `${y}-${m}-01`;
      const nextMonthName = nextMonthDate.toLocaleString("en-IN", { month: "long", year: "numeric" });

      const entryKind = data.carryForwardType === "addition" ? "addition" : "advance";
      const entryReason =
        data.carryForwardType === "addition"
          ? `Remaining balance carried forward from ${monthLabel} settlement`
          : `Excess advance carried forward from ${monthLabel} settlement`;

      // Check if an existing automated entry exists to prevent duplicates
      const { data: existingEntries } = await supabaseClient
        .from("salary_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("entry_date", nextMonth1stStr)
        .ilike("reason", `%${monthLabel} settlement%`);

      if (existingEntries && existingEntries.length > 0) {
        await supabaseClient
          .from("salary_entries")
          .update({
            amount_cents: carryForwardCents,
            kind: entryKind,
            reason: entryReason,
          })
          .eq("id", existingEntries[0].id);
      } else {
        await supabaseClient.from("salary_entries").insert({
          user_id: userId,
          entry_date: nextMonth1stStr,
          amount_cents: carryForwardCents,
          reason: entryReason,
          kind: entryKind,
          business_id: business?.id,
        });
      }

      toast({
        title: "Salary Settled & Carried Forward!",
        description:
          data.carryForwardType === "addition"
            ? `Settled ₹${data.settledAmountRupees.toLocaleString("en-IN")}. Remaining ₹${data.carryForwardAmountRupees.toLocaleString("en-IN")} added to 1st ${nextMonthName} salary.`
            : `Settled ₹${data.settledAmountRupees.toLocaleString("en-IN")}. Excess advance ₹${data.carryForwardAmountRupees.toLocaleString("en-IN")} will be deducted from 1st ${nextMonthName} salary.`,
        variant: "success",
      });
    } else {
      toast({
        title: "Salary Marked as Settled",
        description: `Settled amount ₹${data.settledAmountRupees.toLocaleString("en-IN")} recorded for ${monthLabel}.`,
        variant: "success",
      });
    }

    setIsSettled(true);
    onSettlementChange?.(range.monthKey, true);
    await load();
  }

  async function handleUnsettle() {
    const { error } = await supabaseClient
      .from("salary_settlements")
      .delete()
      .eq("user_id", userId)
      .eq("month_key", range.monthKey);

    if (error) {
      toast({ title: "Failed to revert settlement", description: error.message, variant: "error" });
      return;
    }

    // Also clean up any automated carry-forward entry for next month 1st
    const nextMonthDate = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const y = nextMonthDate.getFullYear();
    const m = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
    const nextMonth1stStr = `${y}-${m}-01`;

    await supabaseClient
      .from("salary_entries")
      .delete()
      .eq("user_id", userId)
      .eq("entry_date", nextMonth1stStr)
      .ilike("reason", `%${monthLabel} settlement%`);

    setIsSettled(false);
    onSettlementChange?.(range.monthKey, false);
    toast({
      title: "Settlement Reverted",
      description: `Settlement for ${monthLabel} has been reverted to unsettled.`,
      variant: "success",
    });
    await load();
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
      const pdfResult = await onDownloadPayslip(userId, month);
      let publicPdfUrl = "";

      if (pdfResult && typeof pdfResult === "object" && pdfResult.publicUrl) {
        publicPdfUrl = pdfResult.publicUrl;
      }

      const totalEarningsRupees = (base + fixedAllowance + totals.additions) / 100;
      const totalDeductionsRupees = totals.deductions / 100;
      const netPayRupees = totals.net / 100;

      const employeeDisplayName = userEmail ? userEmail.split("@")[0] : "Employee";
      const statusStr = isSettled ? "Settled / Disbursed ✅" : "Pending Settlement ⏳";

      let message = `*PAYSLIP NOTIFICATION — ${business?.name || "SEYAL PRO"}*\n\n`;
      message += `Hello *${employeeDisplayName}*,\n`;
      message += `Here is your salary summary for *${monthLabel}*:\n\n`;
      message += `▫️ *Base Salary:* ₹ ${(base / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`;
      if (fixedAllowance > 0 || totals.additions > 0) {
        message += `▫️ *Allowances & Extra:* +₹ ${((fixedAllowance + totals.additions) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`;
      }
      if (totalDeductionsRupees > 0) {
        message += `▫️ *Deductions & Advances:* -₹ ${totalDeductionsRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`;
      }
      message += `--------------------------------\n`;
      message += `💰 *NET PAY:* *₹ ${netPayRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}*\n`;
      if (isSettled && settlementDetails?.settledAmountRupees != null) {
        message += `💵 *Settled Amount:* ₹ ${settlementDetails.settledAmountRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`;
      }
      message += `📊 *Status:* ${statusStr}\n`;
      message += `--------------------------------\n\n`;

      if (publicPdfUrl) {
        message += `📄 *Download Official PDF Payslip:*\n${publicPdfUrl}\n\n`;
      } else {
        message += `_Your official PDF payslip has been generated._\n\n`;
      }

      message += `Thank you,\n*${business?.name || "Management"}*`;

      const encodedMsg = encodeURIComponent(message);
      const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const whatsappUrl = isMobileDevice
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
        : `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;

      window.open(whatsappUrl, "_blank", "noopener,noreferrer");

      toast({
        title: "WhatsApp Opened",
        description: `Payslip details prepared for +${cleanPhone}.`,
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

  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });
  const totals = (() => {
    let ded = 0;
    let add = 0;
    (rows || []).forEach((r) => {
      if (["allowance", "bonus", "addition"].includes(r.kind)) add += r.amount_cents || 0;
      else ded += r.amount_cents || 0;
    });

    const net = (base || 0) + (fixedAllowance || 0) + add - ded;
    return { deductions: ded, additions: add, net };
  })();

  const defaultNetRupees = totals.net / 100;

  return (
    <div
      className={cn(
        "grid gap-2 mt-2 transition-colors duration-300",
        isSettled ? "bg-emerald-50/70 p-3 rounded-xl border border-emerald-200" : ""
      )}
    >
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold text-slate-900">Payslip — {monthLabel}</div>
          {isSettled && (
            <span
              onClick={() => setSettlementModalOpen(true)}
              className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              title="Click to view or edit settlement details"
            >
              <CheckCircle size={10} />
              <span>
                Settled
                {settlementDetails?.settledAmountRupees != null
                  ? ` (₹ ${settlementDetails.settledAmountRupees.toLocaleString("en-IN")})`
                  : ""}
              </span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Base salary</div>
          <div className="text-lg font-semibold text-slate-900">₹ {(base / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Fixed + Extra</div>
          <div className="text-lg font-semibold text-emerald-700">
            ₹ {((fixedAllowance + totals.additions) / 100).toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Deductions</div>
          <div className="text-lg font-semibold text-slate-700">
            ₹ {(totals.deductions / 100).toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 bg-white text-center">
          <div className="text-[11px] text-slate-500 font-medium">Net Pay</div>
          <div className="text-lg font-bold text-slate-900">₹ {(totals.net / 100).toFixed(2)}</div>
        </div>
      </div>

      <div className="grid gap-2 text-slate-900">
        {rows.map((r, idx) => {
          const isPos = ["allowance", "bonus", "addition"].includes(r.kind);
          const badge = isPos
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-slate-100 text-slate-800 border-slate-200";
          return (
            <div
              key={r.id}
              className={`rounded-xl border border-slate-200 p-2.5 flex items-center justify-between text-sm text-slate-900 bg-white hover:bg-slate-50 transition-colors ${
                idx % 2 === 1 ? "bg-slate-50/50" : ""
              }`}
            >
              <div>
                <div className="font-medium text-slate-900 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${badge}`}>
                    {r.reason}
                  </span>
                </div>
                <div className="text-[12px] text-slate-500 mt-0.5">
                  {r.entry_date} • {r.kind}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`font-semibold tabular-nums ${isPos ? "text-emerald-700" : "text-slate-900"}`}>
                  {isPos ? "+" : "-"} ₹ {(r.amount_cents / 100).toFixed(2)}
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => del(r.id)}>
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="text-sm text-slate-400 py-2">No entries</div>}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        <Input placeholder="Reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        <Input type="number" placeholder="Amount (₹)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        <select
          className="h-11 px-3 rounded-lg border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none"
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
        >
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
            {/* Mark as Settled Button -> Opens Settlement Modal with Default Net Pay */}
            <Button
              variant={isSettled ? "secondary" : "outline"}
              className={cn(
                "w-full justify-center gap-2 h-10 text-xs sm:text-sm font-semibold whitespace-nowrap transition-all",
                isSettled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
              )}
              onClick={() => setSettlementModalOpen(true)}
            >
              {isSettled ? <CheckCircle size={15} /> : <Circle size={15} />}
              <span>
                {isSettled
                  ? settlementDetails?.settledAmountRupees != null
                    ? `Settled (₹ ${settlementDetails.settledAmountRupees.toLocaleString("en-IN")})`
                    : "Settled"
                  : "Mark as Settled"}
              </span>
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

      {/* WhatsApp Payslip Share Modal */}
      <WhatsAppPayslipModal
        open={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
        userId={userId}
        employeeName={userEmail ? userEmail.split("@")[0] : "Employee"}
        contactNumber={contactNumber || ""}
        monthLabel={monthLabel}
        monthDate={month}
        onDownloadPayslip={onDownloadPayslip}
        onSavePhone={onUpdateContactNumber}
      />

      {/* Salary Settlement Modal with Editable Net Pay & Carry Forward */}
      <SalarySettlementModal
        open={settlementModalOpen}
        onClose={() => setSettlementModalOpen(false)}
        userId={userId}
        employeeName={userEmail ? userEmail.split("@")[0] : "Employee"}
        monthDate={month}
        monthLabel={monthLabel}
        defaultNetRupees={defaultNetRupees}
        baseSalaryRupees={base / 100}
        additionsRupees={(fixedAllowance + totals.additions) / 100}
        deductionsRupees={totals.deductions / 100}
        currentSettlement={settlementDetails}
        onConfirmSettlement={handleConfirmSettlement}
        onUnsettle={handleUnsettle}
      />
    </div>
  );
}
