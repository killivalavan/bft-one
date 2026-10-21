"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { format } from "date-fns";
import {
  Users, Plus, DollarSign, Send, Trash2, Calendar,
  Wallet, CheckCircle2, AlertCircle, ArrowRight
} from "lucide-react";
import { formatCafeName } from "@/lib/utils/bakerUtils";

export interface BakerHelper {
  id: string;
  name: string;
  role: string;
  monthlySalary: number;
  advances: number;
}

export default function BakerHelpersPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  const [helpers, setHelpers] = useState<BakerHelper[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [activeHelperId, setActiveHelperId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [role, setRole] = useState("Operations Staff");
  const [salary, setSalary] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");

  // Load from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`bftone_baker_helpers_${bizId}`);
      if (stored) {
        setHelpers(JSON.parse(stored));
      } else {
        const initialHelpers: BakerHelper[] = [
          { id: "h-1", name: "Ramesh", role: "Production & Packing", monthlySalary: 9000, advances: 1000 },
          { id: "h-2", name: "Kavitha", role: "Packaging & Dispatch", monthlySalary: 6500, advances: 500 },
        ];
        setHelpers(initialHelpers);
        localStorage.setItem(`bftone_baker_helpers_${bizId}`, JSON.stringify(initialHelpers));
      }
    } catch {}
  }, [bizId]);

  const saveHelpers = (updated: BakerHelper[]) => {
    setHelpers(updated);
    try {
      localStorage.setItem(`bftone_baker_helpers_${bizId}`, JSON.stringify(updated));
    } catch {}
  };

  const handleAddHelper = (e: React.FormEvent) => {
    e.preventDefault();
    const sal = parseFloat(salary);
    if (!name.trim() || isNaN(sal) || sal <= 0) return;

    const newH: BakerHelper = {
      id: `h-${Date.now()}`,
      name: name.trim(),
      role: role.trim(),
      monthlySalary: sal,
      advances: 0,
    };

    const updated = [newH, ...helpers];
    saveHelpers(updated);
    setIsAddModalOpen(false);
    setName("");
    setSalary("");
    toast({ title: "Staff Added! 👥", description: `${newH.name} added to payroll.` });
  };

  const handleRecordAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(advanceAmount);
    if (!activeHelperId || isNaN(amt) || amt <= 0) return;

    const updated = helpers.map((h) =>
      h.id === activeHelperId ? { ...h, advances: h.advances + amt } : h
    );

    saveHelpers(updated);
    setIsAdvanceModalOpen(false);
    setAdvanceAmount("");
    setActiveHelperId(null);
    toast({ title: "Advance Recorded! 💵", description: `₹${amt} advance logged. Deducts from month-end pay.` });
  };

  const handleDeleteHelper = (id: string, hName: string) => {
    const updated = helpers.filter((h) => h.id !== id);
    saveHelpers(updated);
    toast({ title: "Staff Removed", description: `Removed ${hName} from staff.` });
  };

  // WhatsApp Salary Slip
  const handleSendSalarySlip = (h: BakerHelper) => {
    const netPayable = Math.max(0, h.monthlySalary - h.advances);
    const message = `📋 *SALARY STATEMENT - ${business?.name || "Dispatch Central"}*\n` +
      `👤 *Staff Name:* ${h.name} (${h.role})\n` +
      `📅 *Month:* ${format(new Date(), "MMMM yyyy")}\n\n` +
      `• Base Monthly Salary: ₹${h.monthlySalary.toLocaleString("en-IN")}\n` +
      `• Cash Advances Taken: -₹${h.advances.toLocaleString("en-IN")}\n` +
      `---------------------------------\n` +
      `💵 *Net Payable Amount: ₹${netPayable.toLocaleString("en-IN")}*\n\n` +
      `_Payment will be disbursed via UPI/Cash. Thank you for your hard work!_`;

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(message).catch(() => {});
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
    toast({ title: "WhatsApp Salary Slip Ready! 📱", description: `Opened slip for ${h.name}` });
  };

  const totalMonthlyPayroll = helpers.reduce((acc, h) => acc + h.monthlySalary, 0);
  const totalAdvancesTaken = helpers.reduce((acc, h) => acc + h.advances, 0);
  const totalNetPayable = totalMonthlyPayroll - totalAdvancesTaken;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">Staff &amp; Wages</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-100 text-cyan-800 border border-cyan-200 shrink-0 whitespace-nowrap">
                  {helpers.length} Staff Members
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">Manage operations staff, track mid-month cash advances, and send WhatsApp salary slips</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus size={14} className="shrink-0" />
              <span>Add Staff Member</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Monthly Wage Bill</p>
              <h3 className="text-2xl font-black text-[#0F172A] mt-0.5">₹{totalMonthlyPayroll.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-[#64748B] font-semibold mt-1">Base salaries for {helpers.length} staff</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Wallet size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Advances Disbursed</p>
              <h3 className="text-2xl font-black text-rose-600 mt-0.5">₹{totalAdvancesTaken.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-rose-600/80 font-semibold mt-1">Mid-month cash advances taken</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <DollarSign size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Net Month-End Payable</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-0.5">₹{totalNetPayable.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-emerald-600/80 font-semibold mt-1">Remaining to disburse</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 size={20} />
            </div>
          </div>
        </div>

        {/* Helpers Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {helpers.map((h) => {
            const netPay = Math.max(0, h.monthlySalary - h.advances);
            return (
              <div key={h.id} className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-100/60 text-blue-700 flex items-center justify-center font-black">
                      {h.name[0]}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-[#0F172A]">{h.name}</h4>
                      <span className="text-xs text-[#64748B] font-semibold">{h.role}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteHelper(h.id, h.name)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">Base Salary</span>
                    <span className="font-black text-[#0F172A] text-sm">₹{h.monthlySalary}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100">
                    <span className="text-[10px] text-rose-500 block font-bold">Advances</span>
                    <span className="font-black text-rose-600 text-sm">₹{h.advances}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                    <span className="text-[10px] text-emerald-600 block font-bold">Net Due</span>
                    <span className="font-black text-emerald-700 text-sm">₹{netPay}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHelperId(h.id);
                      setIsAdvanceModalOpen(true);
                    }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <DollarSign size={13} />
                    <span>Give Advance</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendSalarySlip(h)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#16A34A] hover:bg-[#15803D] text-white transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                  >
                    <Send size={13} />
                    <span>WhatsApp Slip</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Helper Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-extrabold text-base text-[#0F172A]">Add Helper Staff</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddHelper} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Staff Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Role / Responsibility</label>
                <input
                  type="text"
                  placeholder="Assistant Baker / Packaging"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Monthly Agreed Salary (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="8500"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl text-xs font-extrabold text-white bg-blue-600"
                >
                  Save Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Advance Modal */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-extrabold text-base text-[#0F172A]">Log Cash Advance</h3>
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordAdvance} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Advance Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 500"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-base font-black text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400 block mt-1">Deducts automatically from month-end pay.</span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-600"
                >
                  Record Advance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
