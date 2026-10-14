"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import {
  CreditCard, Plus, CheckCircle2, Clock, AlertCircle,
  Search, ArrowRight, Store, DollarSign, Send, Filter
} from "lucide-react";
import { formatCafeName } from "@/lib/utils/bakerUtils";
import { fetchB2BClients, B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";

export interface BakerPaymentRecord {
  id: string;
  storeName: string;
  amount: number;
  paymentMode: string;
  date: string;
  invoiceNumber?: string;
  notes?: string;
}

export default function BakerPaymentsPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialStore = searchParams?.get("store") || "";
  const bizId = business?.id || "default";

  const [invoices, setInvoices] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [paymentsHistory, setPaymentsHistory] = useState<BakerPaymentRecord[]>([]);

  // Filter tabs: "all" | "unpaid" | "paid"
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "paid">("unpaid");
  const [searchQuery, setSearchQuery] = useState("");

  // Record Payment Modal
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState<string | null>(null);
  const [selectedStoreName, setSelectedStoreName] = useState(initialStore);
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI (GPay / PhonePe)");
  const [notes, setNotes] = useState("");

  // Load Invoices & Stores
  useEffect(() => {
    try {
      const storedInvs = localStorage.getItem(`bftone_invoices_${bizId}`);
      if (storedInvs) {
        setInvoices(JSON.parse(storedInvs));
      }

      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) {
        setStores(JSON.parse(storedCusts));
      }

      const storedPayments = localStorage.getItem(`bftone_baker_payments_${bizId}`);
      if (storedPayments) {
        setPaymentsHistory(JSON.parse(storedPayments));
      }
    } catch {}

    // Fetch live B2B clients from server
    if (bizId && bizId !== "default") {
      fetchB2BClients(bizId).then((serverClients) => {
        if (serverClients && serverClients.length > 0) {
          setStores(serverClients);
        }
      });
    }

    const handleStoresUpdated = (e: any) => {
      if (e?.detail?.clients) {
        setStores(e.detail.clients);
      }
    };
    window.addEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);

    if (business?.id) {
      supabaseClient.from("invoices").select("*").eq("business_id", business.id).then(({ data }) => {
        if (data && data.length > 0) {
          const mapped = data.map((d: any) => ({
            id: d.id,
            invoiceNumber: d.invoice_number,
            customerName: d.customer_name,
            customerPhone: d.customer_phone,
            totalAmount: (d.total_cents || 0) / 100,
            status: d.status || "unpaid",
            date: d.invoice_date || format(new Date(), "MMM dd, yyyy"),
            paymentMode: d.payment_mode || "UPI",
            items: d.items || [],
          }));
          setInvoices(mapped);
        }
      });
    }

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [bizId, business?.id]);

  useEffect(() => {
    if (initialStore) {
      setSelectedInvoiceId(null);
      setSelectedInvoiceNumber(null);
      setSelectedStoreName(initialStore);
      setIsRecordModalOpen(true);
    }
  }, [initialStore]);

  // Open modal prefilled from a specific delivery slip
  const handleOpenRecordPaymentModal = (inv: any) => {
    setSelectedInvoiceId(inv.id);
    setSelectedInvoiceNumber(inv.invoiceNumber);
    setSelectedStoreName(inv.customerName);
    setAmountReceived(String(inv.totalAmount));
    setNotes(`Settlement for slip ${inv.invoiceNumber}`);
    setPaymentMode("UPI (GPay / PhonePe)");
    setIsRecordModalOpen(true);
  };

  // Open generic record payment modal
  const handleOpenNewPaymentModal = () => {
    setSelectedInvoiceId(null);
    setSelectedInvoiceNumber(null);
    setSelectedStoreName(stores[0]?.name || "");
    setAmountReceived("");
    setNotes("");
    setPaymentMode("UPI (GPay / PhonePe)");
    setIsRecordModalOpen(true);
  };

  // Record Payment Submit (handles single slip or custom store amount)
  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amountReceived);
    if (!selectedStoreName || isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter valid payment amount.", variant: "error" });
      return;
    }

    // 1. Mark corresponding invoice(s) as paid
    let nextInvoices = [...invoices];
    if (selectedInvoiceId) {
      nextInvoices = invoices.map((inv) => {
        if (inv.id === selectedInvoiceId) {
          if (business?.id) {
            supabaseClient.from("invoices").update({ status: "paid" }).eq("id", inv.id).then(() => {});
          }
          return { ...inv, status: "paid" };
        }
        return inv;
      });
    } else {
      let remaining = amt;
      nextInvoices = invoices.map((inv) => {
        if (
          (inv.customerName || "").toLowerCase().trim() === selectedStoreName.toLowerCase().trim() &&
          inv.status === "unpaid" &&
          remaining >= inv.totalAmount
        ) {
          remaining -= inv.totalAmount;
          if (business?.id) {
            supabaseClient.from("invoices").update({ status: "paid" }).eq("id", inv.id).then(() => {});
          }
          return { ...inv, status: "paid" };
        }
        return inv;
      });
    }

    setInvoices(nextInvoices);
    try {
      localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(nextInvoices));
    } catch {}

    // 2. Add to payment history
    const newRecord: BakerPaymentRecord = {
      id: `pay-${Date.now()}`,
      storeName: selectedStoreName,
      amount: amt,
      paymentMode,
      date: format(new Date(), "MMM dd, yyyy"),
      invoiceNumber: selectedInvoiceNumber || undefined,
      notes: notes.trim() || (selectedInvoiceNumber ? `Settlement for slip ${selectedInvoiceNumber}` : "Account balance clearance"),
    };

    const nextHistory = [newRecord, ...paymentsHistory];
    setPaymentsHistory(nextHistory);
    try {
      localStorage.setItem(`bftone_baker_payments_${bizId}`, JSON.stringify(nextHistory));
    } catch {}

    setIsRecordModalOpen(false);
    setSelectedInvoiceId(null);
    setSelectedInvoiceNumber(null);
    setAmountReceived("");
    setNotes("");
    toast({
      title: "Payment Recorded! 💵",
      description: `₹${amt.toLocaleString("en-IN")} logged for ${selectedStoreName}`,
      variant: "success",
    });
  };

  // WhatsApp Reminder
  const handleSendReminder = (inv: any) => {
    const upiLine = business?.upi_id?.trim()
      ? `UPI ID: ${business.upi_id.trim()}\n\n`
      : "";

    const message = `Hello *${formatCafeName(inv.customerName)}* 👋\n` +
      `Friendly reminder from *${business?.name || "Dispatch Central"}*:\n` +
      `Delivery slip *${inv.invoiceNumber}* dated ${inv.date} for *₹${(inv.totalAmount || 0).toLocaleString("en-IN")}* is pending payment.\n\n` +
      upiLine +
      `_Please let us know once paid. Thank you!_`;

    const phoneClean = (inv.customerPhone || "").replace(/[^0-9]/g, "");
    const waUrl = phoneClean
      ? `https://wa.me/${phoneClean.startsWith("91") ? phoneClean : `91${phoneClean}`}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(waUrl, "_blank");
    toast({ title: "Reminder Opened on WhatsApp! 📱", description: `Sent to ${inv.customerName}` });
  };

  // Metrics
  const totalPendingAmount = invoices
    .filter((i) => i.status === "unpaid")
    .reduce((acc, i) => acc + (i.totalAmount || 0), 0);

  const totalCollectedAmount = invoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (i.totalAmount || 0), 0);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus =
      statusFilter === "all" ? true : statusFilter === "unpaid" ? inv.status === "unpaid" : inv.status === "paid";
    const matchesSearch =
      (inv.customerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.invoiceNumber || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Top Header */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              <CreditCard size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">Payment Tracking &amp; Settlements</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
                  Collections
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">Identify pending payments from clients &amp; stores and record UPI/cash receipts</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenNewPaymentModal}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={14} className="shrink-0" />
              <span>Record Payment</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Pending Dues</p>
              <h3 className="text-2xl font-black text-rose-600 mt-0.5">₹{totalPendingAmount.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-rose-600/80 font-semibold mt-1">
                {invoices.filter((i) => i.status === "unpaid").length} unpaid delivery slips
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <AlertCircle size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Settled Collections</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-0.5">₹{totalCollectedAmount.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-emerald-600/80 font-semibold mt-1">Successfully cleared into bank/cash</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Settlement Rate</p>
              <h3 className="text-2xl font-black text-[#0F172A] mt-0.5">
                {invoices.length > 0
                  ? `${Math.round((invoices.filter((i) => i.status === "paid").length / invoices.length) * 100)}%`
                  : "0%"}
              </h3>
              <p className="text-xs text-[#64748B] font-semibold mt-1">Paid delivery slip percentage</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Clock size={20} />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setStatusFilter("unpaid")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                statusFilter === "unpaid" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Pending Dues ({invoices.filter((i) => i.status === "unpaid").length})
            </button>
            <button
              onClick={() => setStatusFilter("paid")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                statusFilter === "paid" ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Settled Paid ({invoices.filter((i) => i.status === "paid").length})
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                statusFilter === "all" ? "bg-white text-[#0F172A] shadow-2xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              All Slips ({invoices.length})
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search store or slip #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
        </div>

        {/* MOBILE VIEW: Vertical Card Feed (Zero horizontal scrolling; scroll vertically to view all details) */}
        <div className="md:hidden space-y-3">
          {filteredInvoices.map((inv) => {
            const formattedStore = formatCafeName(inv.customerName);
            return (
              <div
                key={inv.id}
                className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3 transition-all"
              >
                {/* Header: Icon, Store Name, Slip # and Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700 shrink-0">
                      <Store size={16} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-sm text-[#0F172A] leading-snug truncate" title={formattedStore}>
                        {formattedStore}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                        <span className="font-mono font-bold text-blue-600">{inv.invoiceNumber}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-[#64748B] font-medium">{inv.date}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0">
                    {inv.status === "unpaid" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle size={10} />
                        <span>Pending</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={10} />
                        <span>Settled</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 3-Stat Financial Grid */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Amount</span>
                    <span className="text-xs font-black text-[#0F172A] mt-0.5 block truncate">₹{inv.totalAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="min-w-0 border-l border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Items</span>
                    <span className="text-xs font-semibold text-slate-700 mt-0.5 block truncate">{(inv.items || []).length} items</span>
                  </div>
                  <div className="min-w-0 border-l border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Settlement</span>
                    <span
                      className={cn(
                        "text-xs font-black mt-0.5 block truncate",
                        inv.status === "unpaid" ? "text-rose-600" : "text-emerald-700"
                      )}
                    >
                      {inv.status === "unpaid" ? "Due" : "Cleared"}
                    </span>
                  </div>
                </div>

                {/* Actions Row */}
                {inv.status === "unpaid" ? (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleOpenRecordPaymentModal(inv)}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>Mark as Paid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendReminder(inv)}
                      className="py-2 px-3 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Send WhatsApp Reminder"
                    >
                      <Send size={13} />
                      <span>Reminder</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400 font-medium">Payment status</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={12} /> Settled & Verified
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {filteredInvoices.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] text-center text-[#64748B]">
              <p className="font-bold text-sm">No delivery slips found.</p>
              <p className="text-xs text-slate-400 mt-1">All payments settled or filter matches zero slips.</p>
            </div>
          )}
        </div>

        {/* DESKTOP VIEW: Slips & Payments Table */}
        <div className="hidden md:block bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">Slip Number</th>
                  <th className="py-3 px-4 whitespace-nowrap">Partner Store</th>
                  <th className="py-3 px-4 whitespace-nowrap">Delivery Date</th>
                  <th className="py-3 px-4 whitespace-nowrap">Amount (₹)</th>
                  <th className="py-3 px-4 whitespace-nowrap">Payment Status</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-600 whitespace-nowrap">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Store size={14} className="text-blue-500 shrink-0" />
                        <span className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans whitespace-nowrap">
                          {formatCafeName(inv.customerName)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-[#64748B] font-medium whitespace-nowrap">{inv.date}</td>
                    <td className="py-3.5 px-4 font-black text-base text-[#0F172A] whitespace-nowrap">
                      ₹{inv.totalAmount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {inv.status === "unpaid" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                          <AlertCircle size={10} />
                          <span>Pending Payment</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                          <CheckCircle2 size={10} />
                          <span>Settled (Paid)</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {inv.status === "unpaid" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenRecordPaymentModal(inv)}
                              className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap"
                              title="Record payment to mark slip as paid"
                            >
                              <CheckCircle2 size={13} />
                              <span>Mark Paid</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendReminder(inv)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 border border-emerald-200 transition-all cursor-pointer"
                              title="Send Reminder on WhatsApp"
                            >
                              <Send size={13} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 size={13} /> Cleared
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#64748B]">
                      <p className="font-bold text-sm">No delivery slips found.</p>
                      <p className="text-xs text-slate-400 mt-1">All payments settled or filter matches zero slips.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  💳
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0F172A]">
                    {selectedInvoiceNumber ? "Settle Delivery Slip" : "Record Café Payment"}
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    {selectedInvoiceNumber
                      ? `Record payment received for Slip #${selectedInvoiceNumber}`
                      : "Clear dues and record incoming UPI or cash"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {selectedInvoiceNumber && (
              <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-blue-900">Slip #{selectedInvoiceNumber}</p>
                  <p className="text-[11px] text-blue-700/80">{selectedStoreName}</p>
                </div>
                <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  Target Slip
                </span>
              </div>
            )}

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Paying Store / Café *</label>
                <select
                  value={selectedStoreName}
                  onChange={(e) => setSelectedStoreName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Amount Received (₹) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="e.g. 3500"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-black text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Payment Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {["UPI (GPay / PhonePe)", "Cash", "Bank Transfer"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMode(m)}
                      className={cn(
                        "py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center truncate",
                        paymentMode === m
                          ? "bg-[#0F172A] text-white border-[#0F172A]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                      )}
                    >
                      {m.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Notes / UTR Reference</label>
                <input
                  type="text"
                  placeholder="Optional UPI UTR or notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
