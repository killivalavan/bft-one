"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight, Wallet, MinusCircle, PiggyBank, Download, Loader2, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/glass/StatCard";
import jsPDF from "jspdf";
import { useToast } from "@/components/ui/Toast";
import { SalaryChart } from "@/components/mysalary/SalaryChart";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

export default function MySalaryPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState<Date>(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [base, setBase] = useState<number>(0);
  const [fixedAllowance, setFixedAllowance] = useState<number>(0);
  const [entries, setEntries] = useState<{ id: string; entry_date: string; amount_cents: number; reason: string; kind: string }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [downloading, setDownloading] = useState(false);

  const range = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    return { startStr, endStr };
  }, [month]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || "");

      const [{ data: prof }, { data: ents }] = await Promise.all([
        supabaseClient.from('profiles').select('base_salary_cents, is_admin, fixed_allowance_cents').eq('id', user.id).maybeSingle(),
        supabaseClient.from('salary_entries').select('id,entry_date,amount_cents,reason,kind').eq('user_id', user.id).gte('entry_date', range.startStr).lte('entry_date', range.endStr).order('entry_date', { ascending: false })
      ]);
      setBase(prof?.base_salary_cents || 0);
      setFixedAllowance(prof?.fixed_allowance_cents || 0);
      setIsAdmin(!!prof?.is_admin);
      setEntries(ents || []);
    })();
  }, [range.startStr, range.endStr]);

  const totals = useMemo(() => {
    let ded = 0;
    let add = 0;
    (entries || []).forEach(e => {
      if (['allowance', 'bonus'].includes(e.kind)) add += (e.amount_cents || 0);
      else ded += (e.amount_cents || 0);
    });
    // Salary calculation: Net = Base + Fixed + Additions - Deductions
    const net = (base || 0) + (fixedAllowance || 0) + add - ded;
    return { deductions: ded, additions: add, net };
  }, [entries, base, fixedAllowance]);

  function prevMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); }
  function nextMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); }

  const label = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  async function downloadPayslip() {
    try {
      setDownloading(true);
      const doc = new jsPDF();

      // Load Logo
      const logoImg = new Image();
      logoImg.src = "/logo_payslip.jpg";
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
      });

      // Header
      // Logo at top right. Dimensions approx.
      const logoW = 30;
      const logoH = 30 * (logoImg.height / logoImg.width);
      doc.addImage(logoImg, 'JPEG', 170, 10, logoW, logoH);

      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("Brown Fening Tea", 10, 20);

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text("Payslip", 10, 28);

      // Line
      doc.setDrawColor(200);
      doc.line(10, 35, 200, 35);

      // Employee Info
      doc.setFontSize(10);
      doc.text(`Employee: ${userEmail}`, 10, 45);
      doc.text(`Pay Period: ${label}`, 10, 50);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 10, 55);

      // Summary Box
      const summaryY = 65;
      doc.setFillColor(245, 247, 250); // neutral-50ish
      doc.rect(10, summaryY, 190, 25, 'F');

      doc.setFontSize(10);
      doc.text("Total Earnings", 20, summaryY + 8);
      doc.text("Total Deductions", 90, summaryY + 8);
      doc.text("Net Pay", 160, summaryY + 8);

      const totalEarnings = (base + fixedAllowance + totals.additions);

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129); // emerald
      doc.text(`Rs ${(totalEarnings / 100).toFixed(2)}`, 20, summaryY + 18);

      doc.setTextColor(220, 38, 38); // red for deductions
      doc.text(`Rs ${(totals.deductions / 100).toFixed(2)}`, 90, summaryY + 18);

      doc.setTextColor(0, 0, 0); // reset
      doc.text(`Rs ${(totals.net / 100).toFixed(2)}`, 160, summaryY + 18);

      // Entries Table
      let y = summaryY + 35;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Pay Details", 10, y);
      y += 5;

      // Table Header
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y, 190, 8, 'F');
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Date", 15, y + 5);
      doc.text("Description", 50, y + 5);
      doc.text("Type", 120, y + 5);
      doc.text("Amount", 180, y + 5, { align: 'right' });
      y += 10;

      // Rows
      doc.setFont("helvetica", "normal");
      entries.forEach((e, i) => {
        if (y > 280) { doc.addPage(); y = 20; }
        const isPos = ['allowance', 'bonus'].includes(e.kind);

        doc.text(e.entry_date, 15, y);
        doc.text(e.reason, 50, y);
        doc.text(e.kind.toUpperCase(), 120, y);

        if (isPos) doc.setTextColor(16, 185, 129);
        else doc.setTextColor(220, 38, 38);

        doc.text(`${isPos ? '+' : '-'} Rs ${(e.amount_cents / 100).toFixed(2)}`, 180, y, { align: 'right' });
        doc.setTextColor(0, 0, 0);

        y += 7;
        // Light separator
        doc.setDrawColor(240);
        doc.line(10, y - 4, 200, y - 4);
      });

      if (entries.length === 0) {
        doc.setTextColor(150);
        doc.text("No deductions found for this period.", 15, y);
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Generated by BFT One System", 105, 290, { align: 'center' });

      doc.save(`Payslip_${label.replace(' ', '_')}.pdf`);
      toast({ title: "Payslip Downloaded", variant: "success" });

    } catch (e: any) {
      console.error(e);
      toast({ title: "Download Failed", description: e.message, variant: "error" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-20">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-emerald-700 transition-colors text-sm font-medium">
              <ChevronLeft size={16} />
              Back Home
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">My Salary</h1>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadPayslip}
                  disabled={downloading}
                  className="gap-2 text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300"
                >
                  {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Payslip
                </Button>
              )}
            </div>
            <p className="text-zinc-500">Overview of earnings and deductions.</p>
          </div>

          <div className="flex items-center gap-4 bg-white p-1.5 rounded-xl border shadow-sm self-center md:self-auto">
            <Button size="sm" variant="ghost" onClick={prevMonth} className="h-8 w-8 p-0 hover:bg-zinc-100">
              <ChevronLeft size={16} />
            </Button>
            <span className="min-w-[140px] text-center font-medium text-zinc-900 tabular-nums">{label}</span>
            <Button size="sm" variant="ghost" onClick={nextMonth} className="h-8 w-8 p-0 hover:bg-zinc-100">
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        {/* Visualization & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Left Col: Chart */}
          <div className="lg:col-span-1 bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-rose-400"></div>
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide mb-6">Salary Composition</h3>
            <SalaryChart base={base} deductions={totals.deductions} net={totals.net} />

            <div className="flex gap-6 mt-8 w-full justify-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-medium text-zinc-600">Net: <AnimatedNumber value={totals.net / 100} prefix="₹" /></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                <span className="text-xs font-medium text-zinc-600">Ded: <AnimatedNumber value={totals.deductions / 100} prefix="₹" /></span>
              </div>
            </div>
          </div>

          {/* Right Col: Cards */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Standard Pay"
              value={<AnimatedNumber value={(base + fixedAllowance) / 100} prefix="₹ " />}
              icon={Wallet}
              color="emerald"
              subtext="Base + Fixed Allowance"
            />
            <StatCard
              label="Allowances"
              value={<AnimatedNumber value={totals.additions / 100} prefix="₹ " />}
              icon={TrendingUp}
              color="amber"
              subtext="Bonuses & Extras"
            />
            <StatCard
              label="Deductions"
              value={<AnimatedNumber value={totals.deductions / 100} prefix="₹ " />}
              icon={MinusCircle}
              color="rose"
              subtext="Total debit"
            />
            <StatCard
              label="Net Pay"
              value={<AnimatedNumber value={totals.net / 100} prefix="₹ " />}
              icon={PiggyBank}
              color="indigo"
              subtext="Final Payout"
            />
          </div>
        </div>

        {/* Entries List */}
        <div className="space-y-4">
          <h3 className="font-semibold text-zinc-900 px-1">Details</h3>

          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
            {entries.length === 0 ? (
              <div className="p-8 text-center bg-neutral-50/50">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Wallet size={20} />
                </div>
                <p className="text-zinc-900 font-medium">No deductions</p>
                <p className="text-sm text-zinc-500">Full salary for this month so far!</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {entries.map((e) => {
                  const reason = (e.reason || '').toLowerCase();
                  const isPositive = ['allowance', 'bonus'].includes(e.kind);
                  const badge = isPositive ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : reason === 'late' ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : reason === 'leave' ? 'bg-sky-50 text-sky-700 border-sky-200'
                        : reason.includes('half day') ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : reason === 'advance' ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200';

                  return (
                    <div key={e.id} className="group flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className={`self-start inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-wider font-semibold ${badge}`}>
                            {e.reason}
                          </span>
                          <span className="text-xs text-zinc-500 mt-1.5 font-medium tabular-nums">{e.entry_date}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-zinc-900'}`}>
                          {isPositive ? '+' : '-'} ₹{(e.amount_cents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
