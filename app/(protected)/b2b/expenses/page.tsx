"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import {
  Receipt, Plus, Trash2, TrendingDown, DollarSign, Calendar,
  PieChart, Search, ArrowRight, ShoppingBag
} from "lucide-react";
import { useB2BExpenses, useRecordExpenseMutation } from "@/lib/hooks/useB2BData";

export interface BakerExpense {
  id: string;
  name: string;
  amount: number;
  category: "Raw Materials & Supplies" | "Packaging & Boxes" | "Utilities & Energy" | "Logistics & Delivery" | "Maintenance & Repairs" | "Other Operating Costs" | string;
  date: string;
  notes?: string;
}

export const EXPENSE_CATEGORIES = [
  "Raw Materials & Supplies",
  "Packaging & Boxes",
  "Utilities & Energy",
  "Logistics & Delivery",
  "Maintenance & Repairs",
  "Other Operating Costs",
] as const;

export default function BakerExpensesPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  const [expenses, setExpenses] = useState<BakerExpense[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Raw Materials & Supplies");
  const [notes, setNotes] = useState("");

  // Authoritative cloud expenses via TanStack Query
  const { data: cloudExpenses } = useB2BExpenses(bizId);
  const recordExpenseMutation = useRecordExpenseMutation(bizId);

  // Synchronize cloud expenses from TanStack Query
  useEffect(() => {
    if (cloudExpenses && Array.isArray(cloudExpenses) && cloudExpenses.length > 0) {
      setExpenses(cloudExpenses);
      try {
        localStorage.setItem(`bftone_baker_expenses_${bizId}`, JSON.stringify(cloudExpenses));
      } catch {}
    }
  }, [cloudExpenses, bizId]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`bftone_baker_expenses_${bizId}`);
      if (stored) {
        setExpenses(JSON.parse(stored));
      } else {
        const initialExp: BakerExpense[] = [
          { id: "exp-1", name: "Raw Material Supplies (Batch #101)", amount: 2400, category: "Raw Materials & Supplies", date: format(new Date(), "MMM dd, yyyy") },
          { id: "exp-2", name: "Packaging Supplies & Boxes", amount: 1800, category: "Packaging & Boxes", date: format(new Date(), "MMM dd, yyyy") },
          { id: "exp-3", name: "Facility Electricity & Utilities", amount: 1200, category: "Utilities & Energy", date: format(new Date(), "MMM dd, yyyy") },
        ];
        setExpenses(initialExp);
        localStorage.setItem(`bftone_baker_expenses_${bizId}`, JSON.stringify(initialExp));
      }
    } catch {}

    if (business?.id) {
      supabaseClient.from("daily_expenses").select("*").eq("business_id", business.id).then(({ data }) => {
        if (data && data.length > 0) {
          const mapped: BakerExpense[] = data.map((d: any) => ({
            id: d.id,
            name: d.item_name || "Ingredient",
            amount: ((d.price_cents || 0) * (d.quantity || 1)) / 100,
            category: "Flour & Sugar",
            date: d.expense_date || format(new Date(), "MMM dd, yyyy"),
          }));
          setExpenses(mapped);
        }
      });
    }
  }, [bizId, business?.id]);

  const saveExpenses = (updated: BakerExpense[]) => {
    setExpenses(updated);
    try {
      localStorage.setItem(`bftone_baker_expenses_${bizId}`, JSON.stringify(updated));
    } catch {}
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt) || amt <= 0) {
      toast({ title: "Validation Error", description: "Please enter item name and valid amount.", variant: "error" });
      return;
    }

    const newExp: BakerExpense = {
      id: `exp-${Date.now()}`,
      name: name.trim(),
      amount: amt,
      category,
      date: format(new Date(), "MMM dd, yyyy"),
      notes: notes.trim(),
    };

    const updated = [newExp, ...expenses];
    saveExpenses(updated);

    // Asynchronously persist to Supabase via TanStack mutation
    recordExpenseMutation.mutateAsync(newExp).catch((err) => {
      console.warn("Cloud expense note:", err);
    });
    if (business?.id) {
      supabaseClient.from("daily_expenses").insert({
        business_id: business.id,
        item_name: newExp.name,
        category: newExp.category,
        price_cents: Math.round(newExp.amount * 100),
        quantity: 1,
        expense_date: new Date().toISOString().split("T")[0],
      }).then(() => {});
    }

    setIsModalOpen(false);
    setName("");
    setAmount("");
    setNotes("");
    toast({ title: "Expense Logged! 🧾", description: `₹${amt} logged for ${newExp.name}` });
  };

  const handleDeleteExpense = (id: string, expName: string) => {
    const updated = expenses.filter((e) => e.id !== id);
    saveExpenses(updated);
    toast({ title: "Expense Deleted", description: `Removed ${expName}` });
  };

  // Metrics
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const topCategory = useMemo(() => {
    if (expenses.length === 0) return "None";
    const counts: Record<string, number> = {};
    expenses.forEach((e) => {
      counts[e.category] = (counts[e.category] || 0) + e.amount;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? sorted[0][0] : "None";
  }, [expenses]);

  const filteredExpenses = expenses.filter(
    (e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full max-w-6xl group-data-[sidebar-collapsed=true]:max-w-none mx-auto space-y-6">
      {/* Top Header Card - docks cleanly below AppShell mobile header on mobile */}
      <div className="sticky top-14 md:top-0 z-20 w-full px-1 sm:px-2 md:px-0 bg-[#F8FAFC] pt-1.5 sm:pt-2 md:pt-3 pb-2.5 sm:pb-3 transition-all">
        <div className="w-full px-3.5 sm:px-5 py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 bg-white rounded-3xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              💸
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight">Operating Expenses</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shrink-0 whitespace-nowrap">
                  {expenses.length} Entries
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block mt-0.5">Log raw materials, supplies, packaging, utilities &amp; operational costs</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/b2b/reports"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-2xs shrink-0 whitespace-nowrap"
            >
              <span>View Net Profit</span>
              <ArrowRight size={13} className="shrink-0" />
            </Link>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus size={14} className="shrink-0" />
              <span>Log Expense</span>
            </button>
          </div>
        </div>
      </div>

      <div className="w-full px-1 sm:px-2 md:px-0 pt-1 pb-6 space-y-5 sm:space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Operating Costs</p>
              <h3 className="text-2xl font-black text-[#0F172A] mt-0.5">₹{totalExpenses.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-rose-600 font-semibold mt-1">Deducted from gross sales</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Receipt size={20} />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Top Category</p>
              <h3 className="text-base font-black text-[#0F172A] mt-0.5 truncate max-w-[170px]" title={topCategory}>{topCategory}</h3>
              <p className="text-xs text-[#64748B] font-semibold mt-1">Primary expense driver</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ShoppingBag size={20} />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Recent Expense</p>
              <h3 className="text-base font-black text-[#0F172A] mt-0.5 truncate max-w-[170px]" title={expenses[0]?.name}>
                {expenses[0]?.name || "None"}
              </h3>
              <p className="text-xs text-rose-600 font-bold mt-1">₹{expenses[0]?.amount || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <TrendingDown size={20} />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-[#E2E8F0] shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search expenses, supplies or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
          <span className="text-xs text-[#64748B] font-semibold">
            Showing <strong className="text-[#0F172A]">{filteredExpenses.length}</strong> items
          </span>
        </div>

        {/* MOBILE VIEW: Vertical Card Feed (Zero horizontal scrolling; matching other B2B tables) */}
        <div className="md:hidden space-y-3">
          {filteredExpenses.map((exp) => (
            <div
              key={exp.id}
              className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3 transition-all"
            >
              {/* Top Row: Icon, Name, Notes, and Delete Action */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-700 font-bold shrink-0 shadow-2xs">
                    <Receipt size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-sm text-[#0F172A] leading-snug break-words">
                      {exp.name}
                    </h4>
                    {exp.notes && (
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                        {exp.notes}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteExpense(exp.id, exp.name)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/60 transition-all cursor-pointer shrink-0"
                  title="Delete Expense"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* 3-Stat Financial Grid (Category, Date, Amount) */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Category</span>
                  <span className="text-xs font-extrabold text-slate-700 mt-0.5 block truncate" title={exp.category}>
                    {exp.category}
                  </span>
                </div>
                <div className="min-w-0 border-l border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Date</span>
                  <span className="text-xs font-semibold text-slate-600 mt-0.5 block truncate">{exp.date}</span>
                </div>
                <div className="min-w-0 border-l border-slate-200">
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block truncate">Amount</span>
                  <span className="text-xs font-black text-rose-600 mt-0.5 block truncate">
                    -₹{exp.amount.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {filteredExpenses.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] text-center text-[#64748B]">
              <p className="font-bold text-sm">No expenses found.</p>
              <p className="text-xs text-slate-400 mt-1">Click &ldquo;+ Log Expense&rdquo; to record business &amp; supply expenses.</p>
            </div>
          )}
        </div>

        {/* DESKTOP VIEW: Full Table (Visible on md and larger) */}
        <div className="hidden md:block bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
          <div className="table-scroll-container">
            <table className="w-full min-w-[580px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                  <th className="py-3 px-4">Item / Description</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Amount (₹)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 font-bold shrink-0">
                          <Receipt size={15} />
                        </div>
                        <div>
                          <p className="font-extrabold text-[#0F172A]">{exp.name}</p>
                          {exp.notes && <p className="text-[10px] text-slate-400">{exp.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#64748B] font-medium">{exp.date}</td>
                    <td className="py-3.5 px-4 font-black text-rose-600 text-base">
                      -₹{exp.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(exp.id, exp.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#64748B]">
                      <p className="font-bold text-sm">No expenses found.</p>
                      <p className="text-xs text-slate-400 mt-1">Click &ldquo;+ Log Expense&rdquo; to record business &amp; supply expenses.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-extrabold text-base text-[#0F172A]">Log Operating Expense</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Raw Material Batch / Packaging Supplies"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Total Bill Amount (₹) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="e.g. 2400"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-base font-black text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Vendor name or bill receipt"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl text-xs font-extrabold text-white bg-blue-600"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
