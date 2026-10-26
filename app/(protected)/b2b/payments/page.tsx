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
  Search, ArrowRight, Store, DollarSign, Send, Filter,
  X, Building2, History, Receipt, RotateCcw
} from "lucide-react";
import { formatCafeName } from "@/lib/utils/bakerUtils";
import { fetchB2BClients, B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";
import { SelectDropdown, SelectOption } from "@/components/ui/SelectDropdown";
import { useB2BWorkspace, useRecordPaymentMutation } from "@/lib/hooks/useB2BData";

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
  const initialAction = searchParams?.get("action") || "";
  const bizId = business?.id || "default";

  // Authoritative cloud workspace data & mutation hook via TanStack Query
  const { data: cloudWorkspace } = useB2BWorkspace(bizId);
  const recordPaymentMutation = useRecordPaymentMutation(bizId);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [paymentsHistory, setPaymentsHistory] = useState<BakerPaymentRecord[]>([]);

  // Main Tracking Filters
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>(initialStore || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "paid">("unpaid");
  const [activeTab, setActiveTab] = useState<"slips" | "history">("slips");
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

    // Synchronize cloud data from TanStack Query
    if (cloudWorkspace) {
      if (Array.isArray(cloudWorkspace.payments) && cloudWorkspace.payments.length > 0) {
        setPaymentsHistory(cloudWorkspace.payments);
      }
      if (Array.isArray(cloudWorkspace.invoices) && cloudWorkspace.invoices.length > 0) {
        setInvoices(cloudWorkspace.invoices);
      }
      if (Array.isArray(cloudWorkspace.stores) && cloudWorkspace.stores.length > 0) {
        setStores(cloudWorkspace.stores);
      }
    }

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

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [bizId, business?.id]);

  // Synchronize cross-tab or local storage updates
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === `bftone_invoices_${bizId}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setInvoices(parsed);
        } catch {}
      }
      if (e.key === `bftone_customers_${bizId}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setStores(parsed);
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [bizId]);

  // Synchronize when initialStore query param updates
  useEffect(() => {
    if (initialStore) {
      setSelectedStoreFilter(initialStore);
      if (initialAction === "record") {
        setSelectedInvoiceId(null);
        setSelectedInvoiceNumber(null);
        setSelectedStoreName(initialStore);
        setIsRecordModalOpen(true);
      }
    }
  }, [initialStore, initialAction]);

  // Build unique list of available stores from both registered stores and invoices
  const availableStores = useMemo(() => {
    const storeNamesSet = new Set<string>();
    stores.forEach((s) => {
      if (s.name?.trim()) storeNamesSet.add(s.name.trim());
    });
    invoices.forEach((inv) => {
      const name = inv.customerName || inv.client_name;
      if (name?.trim()) storeNamesSet.add(name.trim());
    });
    return Array.from(storeNamesSet).sort((a, b) => a.localeCompare(b));
  }, [stores, invoices]);

  // Per-store metrics map
  const storeStats = useMemo(() => {
    const map: Record<
      string,
      {
        totalBilled: number;
        unpaidDues: number;
        paidAmount: number;
        unpaidCount: number;
        paidCount: number;
        phone?: string;
      }
    > = {};

    availableStores.forEach((storeName) => {
      const storeInvs = invoices.filter((inv) => {
        const invName = (inv.customerName || inv.client_name || "").toLowerCase().trim();
        const sName = storeName.toLowerCase().trim();
        return invName === sName || (invName && sName && (invName.replace(/[^a-z0-9]/g, "") === sName.replace(/[^a-z0-9]/g, "")));
      });
      const storeObj = stores.find((s) => (s.name || "").toLowerCase().trim() === storeName.toLowerCase().trim());

      const rawBilled = storeInvs.reduce((acc, inv) => {
        const val = Number(inv.totalAmount !== undefined ? inv.totalAmount : (inv.total_amount ?? 0));
        return acc + (Number.isFinite(val) ? val : 0);
      }, 0);
      const totalBilled = Number.isFinite(rawBilled) ? rawBilled : 0;

      const rawUnpaid = storeInvs
        .filter((inv) => {
          const s = String(inv.status || "").toLowerCase();
          const due = Number(inv.balanceDue ?? inv.balance_due ?? (Number(inv.totalAmount || inv.total_amount || 0) - Number(inv.paidAmount || inv.paid_amount || 0)));
          return (s === "unpaid" || s === "pending") || due > 0;
        })
        .reduce((acc, inv) => {
          const val = Number(inv.balanceDue !== undefined ? inv.balanceDue : (inv.balance_due !== undefined ? inv.balance_due : (inv.totalAmount || inv.total_amount || 0)));
          return acc + (Number.isFinite(val) ? val : 0);
        }, 0);
      const unpaidDues = Number.isFinite(rawUnpaid) ? rawUnpaid : 0;
      const paidAmount = Math.max(0, totalBilled - unpaidDues);
      const unpaidCount = storeInvs.filter((inv) => {
        const s = String(inv.status || "").toLowerCase();
        const due = Number(inv.balanceDue ?? inv.balance_due ?? (Number(inv.totalAmount || inv.total_amount || 0) - Number(inv.paidAmount || inv.paid_amount || 0)));
        return (s === "unpaid" || s === "pending") || due > 0;
      }).length;
      const paidCount = storeInvs.filter((inv) => inv.status === "paid" && (inv.balanceDue === undefined || inv.balanceDue <= 0)).length;

      map[storeName] = {
        totalBilled,
        unpaidDues,
        paidAmount,
        unpaidCount,
        paidCount,
        phone: storeObj?.phone || storeInvs[0]?.customerPhone || storeInvs[0]?.client_phone,
      };
    });

    return map;
  }, [availableStores, stores, invoices]);

  // Open modal prefilled from a specific delivery slip or return slip
  const handleOpenRecordPaymentModal = (inv: any) => {
    setSelectedInvoiceId(inv.id);
    setSelectedInvoiceNumber(inv.invoiceNumber);
    setSelectedStoreName(inv.customerName);
    const isRet = (inv.totalAmount || 0) < 0 || Boolean(inv.isReturn) || (inv.invoiceNumber || "").startsWith("RET-");
    const positiveAmt = Math.abs(inv.totalAmount || 0);
    setAmountReceived(String(positiveAmt));
    setNotes(isRet ? `Refund / credit settled for return slip ${inv.invoiceNumber}` : `Settlement for slip ${inv.invoiceNumber}`);
    setPaymentMode(isRet ? "Cash Refund" : "UPI (GPay / PhonePe)");
    setIsRecordModalOpen(true);
  };

  // Open generic record payment modal (defaults to current store filter if selected)
  const handleOpenNewPaymentModal = () => {
    const defaultStore =
      selectedStoreFilter !== "all"
        ? selectedStoreFilter
        : stores[0]?.name || availableStores[0] || "";

    setSelectedInvoiceId(null);
    setSelectedInvoiceNumber(null);
    setSelectedStoreName(defaultStore);
    const storeDues = storeStats[defaultStore]?.unpaidDues;
    setAmountReceived(storeDues && storeDues > 0 ? String(storeDues) : "");
    setNotes(storeDues && storeDues > 0 ? `Clearing balance for ${defaultStore}` : "");
    setPaymentMode("UPI (GPay / PhonePe)");
    setIsRecordModalOpen(true);
  };

  // Record Payment / Refund Settlement Submit
  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amountReceived);
    if (!selectedStoreName || isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid amount.", variant: "error" });
      return;
    }

    const isRetSlip = Boolean(
      selectedInvoiceId &&
      invoices.some((inv) => inv.id === selectedInvoiceId && ((inv.totalAmount || 0) < 0 || inv.isReturn || (inv.invoiceNumber || "").startsWith("RET-")))
    );

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

    // 2. Add to payment history (negative for refund payout so ledger balances correctly)
    const newRecord: BakerPaymentRecord = {
      id: `pay-${Date.now()}`,
      storeName: selectedStoreName,
      amount: isRetSlip ? -amt : amt,
      paymentMode,
      date: format(new Date(), "MMM dd, yyyy"),
      invoiceNumber: selectedInvoiceNumber || undefined,
      notes: notes.trim() || (selectedInvoiceNumber ? (isRetSlip ? `Refund settled for return slip ${selectedInvoiceNumber}` : `Settlement for slip ${selectedInvoiceNumber}`) : "Account balance clearance"),
    };

    const nextHistory = [newRecord, ...paymentsHistory];
    setPaymentsHistory(nextHistory);
    try {
      localStorage.setItem(`bftone_baker_payments_${bizId}`, JSON.stringify(nextHistory));
    } catch {}

    // Asynchronously persist payment transaction & reconciled invoices to Supabase
    recordPaymentMutation.mutateAsync({
      payment: {
        id: newRecord.id,
        client_name: newRecord.storeName,
        amount: newRecord.amount,
        payment_method: newRecord.paymentMode,
        reference_no: newRecord.invoiceNumber || "",
        notes: newRecord.notes,
        date: new Date().toISOString().split("T")[0],
      },
      updatedInvoices: nextInvoices,
    }).catch((e) => {
      console.warn("Cloud payment recording note:", e);
    });

    setIsRecordModalOpen(false);
    setSelectedInvoiceId(null);
    setSelectedInvoiceNumber(null);
    setAmountReceived("");
    setNotes("");
    toast({
      title: isRetSlip ? "Refund / Credit Settled" : "Payment Recorded",
      description: isRetSlip
        ? `₹${amt.toLocaleString("en-IN")} refund settlement logged for ${selectedStoreName}`
        : `₹${amt.toLocaleString("en-IN")} payment recorded for ${selectedStoreName}`,
      variant: "success",
    });
  };

  // WhatsApp Single Slip Reminder
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
      ? `https://api.whatsapp.com/send?phone=${phoneClean.startsWith("91") ? phoneClean : `91${phoneClean}`}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(message).catch(() => {});
    }

    window.open(waUrl, "_blank");
    toast({ title: "Reminder Opened on WhatsApp! 📱", description: `Sent to ${inv.customerName}` });
  };

  // Consolidated WhatsApp Reminder for all pending dues of a store
  const handleSendStoreConsolidatedReminder = (storeName: string) => {
    const storeInvs = invoices.filter(
      (inv) =>
        (inv.customerName || "").toLowerCase().trim() === storeName.toLowerCase().trim() &&
        inv.status === "unpaid"
    );

    if (storeInvs.length === 0) {
      toast({ title: "No Pending Dues", description: `${storeName} has zero pending dues!`, variant: "success" });
      return;
    }

    const totalDues = storeInvs.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
    const upiLine = business?.upi_id?.trim()
      ? `\nUPI ID: *${business.upi_id.trim()}*\n`
      : "";

    const slipsBreakdown = storeInvs
      .map((inv) => `• Slip ${inv.invoiceNumber} (${inv.date}): ₹${(inv.totalAmount || 0).toLocaleString("en-IN")}`)
      .join("\n");

    const message =
      `Hello *${formatCafeName(storeName)}* 👋\n\n` +
      `Payment summary from *${business?.name || "SeyalPro Dispatch"}*:\n` +
      `Total Outstanding Due: *₹${totalDues.toLocaleString("en-IN")}* (${storeInvs.length} delivery ${storeInvs.length === 1 ? "slip" : "slips"})\n\n` +
      `*Pending Slips:*\n${slipsBreakdown}\n` +
      upiLine +
      `\n_Please confirm once transferred. Thank you!_`;

    const phone = storeStats[storeName]?.phone || storeInvs[0]?.customerPhone || "";
    const phoneClean = phone.replace(/[^0-9]/g, "");
    const waUrl = phoneClean
      ? `https://api.whatsapp.com/send?phone=${phoneClean.startsWith("91") ? phoneClean : `91${phoneClean}`}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(message).catch(() => {});
    }

    window.open(waUrl, "_blank");
    toast({
      title: "Consolidated Reminder Opened! 📱",
      description: `Summary of ${storeInvs.length} slips sent to ${storeName}`,
    });
  };

  // Metrics for Current Scope (Store-specific or All Stores)
  const isSpecificStore = selectedStoreFilter !== "all";
  const activeStoreStats = isSpecificStore ? storeStats[selectedStoreFilter] : null;

  const scopedInvoices = useMemo(() => {
    if (!isSpecificStore) return invoices;
    return invoices.filter(
      (inv) => (inv.customerName || "").toLowerCase().trim() === selectedStoreFilter.toLowerCase().trim()
    );
  }, [invoices, isSpecificStore, selectedStoreFilter]);

  const totalPendingAmount = scopedInvoices
    .filter((i) => i.status === "unpaid")
    .reduce((acc, i) => acc + (i.totalAmount || 0), 0);

  const totalCollectedAmount = scopedInvoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (i.totalAmount || 0), 0);

  const settlementRate =
    scopedInvoices.length > 0
      ? Math.round((scopedInvoices.filter((i) => i.status === "paid").length / scopedInvoices.length) * 100)
      : 0;

  // Filtered Delivery Slips List
  const filteredInvoices = useMemo(() => {
    return scopedInvoices.filter((inv) => {
      const matchesStatus =
        statusFilter === "all" ? true : statusFilter === "unpaid" ? inv.status === "unpaid" : inv.status === "paid";
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (inv.customerName || "").toLowerCase().includes(q) ||
        (inv.invoiceNumber || "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [scopedInvoices, statusFilter, searchQuery]);

  // Filtered Payments History List
  const filteredHistory = useMemo(() => {
    return paymentsHistory.filter((pay) => {
      const matchesStore =
        !isSpecificStore || (pay.storeName || "").toLowerCase().trim() === selectedStoreFilter.toLowerCase().trim();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (pay.storeName || "").toLowerCase().includes(q) ||
        (pay.notes || "").toLowerCase().includes(q) ||
        (pay.invoiceNumber || "").toLowerCase().includes(q) ||
        (pay.paymentMode || "").toLowerCase().includes(q);
      return matchesStore && matchesSearch;
    });
  }, [paymentsHistory, isSpecificStore, selectedStoreFilter, searchQuery]);

  // Stores with dues count for quick chip summary
  const totalStoresWithDuesCount = useMemo(() => {
    return Object.values(storeStats).filter((s) => s.unpaidDues > 0).length;
  }, [storeStats]);

  // Rich options for Store Filter SelectDropdown
  const storeFilterOptions = useMemo((): SelectOption[] => {
    const list: SelectOption[] = [
      {
        value: "all",
        label: `All Stores (${availableStores.length})`,
        icon: <Building2 size={13} className="text-blue-600" />,
        badge: totalStoresWithDuesCount > 0 ? `${totalStoresWithDuesCount} with dues` : "All clear",
        badgeVariant: totalStoresWithDuesCount > 0 ? "danger" : "success",
      },
    ];

    availableStores.forEach((storeName) => {
      const s = storeStats[storeName];
      const hasDues = s && s.unpaidDues > 0;
      list.push({
        value: storeName,
        label: formatCafeName(storeName),
        icon: <Store size={13} className="text-slate-500" />,
        badge: hasDues ? `₹${s.unpaidDues.toLocaleString("en-IN")} due` : "✓ Clear",
        badgeVariant: hasDues ? "danger" : "success",
      });
    });

    return list;
  }, [availableStores, storeStats, totalStoresWithDuesCount]);

  // Rich options for Modal Record Payment SelectDropdown
  const storeRecordOptions = useMemo((): SelectOption[] => {
    return availableStores.map((s) => {
      const due = storeStats[s]?.unpaidDues || 0;
      return {
        value: s,
        label: formatCafeName(s),
        icon: <Store size={13} className="text-slate-500" />,
        badge: due > 0 ? `₹${due.toLocaleString("en-IN")} due` : "✓ Clear",
        badgeVariant: due > 0 ? "danger" : "success",
      };
    });
  }, [availableStores, storeStats]);

  // Selected slip for modal (differentiates delivery slip vs return slip refund)
  const selectedSlip = useMemo(() => {
    if (!selectedInvoiceId) return null;
    return invoices.find((i) => i.id === selectedInvoiceId) || null;
  }, [selectedInvoiceId, invoices]);

  const isSelectedSlipReturn = Boolean(
    selectedSlip &&
    ((selectedSlip.totalAmount || 0) < 0 || Boolean(selectedSlip.isReturn) || (selectedSlip.invoiceNumber || "").startsWith("RET-"))
  );

  // Helper to render celebratory and meaningful empty states
  const renderSlipsEmptyState = () => {
    const unpaidCount = scopedInvoices.filter((i) => i.status === "unpaid").length;
    const isAllPaid = scopedInvoices.length > 0 && unpaidCount === 0;

    if (isAllPaid) {
      return (
        <div className="max-w-md mx-auto py-2 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 size={26} />
          </div>
          <div>
            <h4 className="font-extrabold text-base text-[#0F172A]">
              {isSpecificStore
                ? `All Bills Paid for ${formatCafeName(selectedStoreFilter)}! 🎉`
                : "All Bills Paid & Cleared! 🎉"}
            </h4>
            <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto leading-relaxed">
              Zero outstanding dues. All {scopedInvoices.length} delivery {scopedInvoices.length === 1 ? "slip has" : "slips have"} been fully settled.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            {statusFilter === "unpaid" && (
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition cursor-pointer"
              >
                View Cleared Slips ({scopedInvoices.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              View Payment Receipts
            </button>
          </div>
        </div>
      );
    }

    if (searchQuery.trim()) {
      return (
        <div className="max-w-md mx-auto py-2 text-center space-y-2.5">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto shadow-2xs">
            <Search size={22} />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-[#0F172A]">No Matching Delivery Slips</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              No slips match &ldquo;{searchQuery}&rdquo;.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      );
    }

    if (statusFilter === "paid" && scopedInvoices.length > 0) {
      return (
        <div className="max-w-md mx-auto py-2 text-center space-y-2.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
            <Clock size={22} />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-[#0F172A]">No Cleared Payments Yet</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              All {scopedInvoices.length} delivery {scopedInvoices.length === 1 ? "slip is" : "slips are"} currently pending payment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter("unpaid")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition cursor-pointer"
          >
            View Pending Slips ({scopedInvoices.length})
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-md mx-auto py-2 text-center space-y-2.5">
        <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto shadow-2xs">
          <Receipt size={22} />
        </div>
        <div>
          <h4 className="font-extrabold text-sm text-[#0F172A]">
            {isSpecificStore
              ? `No Delivery Slips for ${formatCafeName(selectedStoreFilter)}`
              : "No Delivery Slips Recorded Yet"}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Deliveries created from B2B Dispatch will appear here for settlement tracking.
          </p>
        </div>
        <Link
          href="/b2b/invoices"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition"
        >
          <span>Go to Deliveries</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              <CreditCard size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                  Payment Tracking &amp; Settlements
                </h1>
                {isSpecificStore ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 shrink-0 whitespace-nowrap">
                    Store: {formatCafeName(selectedStoreFilter)}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
                    {availableStores.length} Stores Tracked
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">
                Track pending dues, clear invoices, and record payments filtered by store name
              </p>
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
        {/* ==================================================== */}
        {/* STORE SELECTION CHIPS (HORIZONTAL SCROLL BAR)        */}
        {/* ==================================================== */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="font-extrabold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Store size={13} className="text-blue-600" />
              <span>Track By Store</span>
            </span>
            {isSpecificStore && (
              <button
                type="button"
                onClick={() => setSelectedStoreFilter("all")}
                className="text-blue-600 hover:underline font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <X size={12} />
                <span>Show All Stores</span>
              </button>
            )}
          </div>

          {/* Quick Filter Horizontal Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
            {/* All Stores Chip */}
            <button
              type="button"
              onClick={() => setSelectedStoreFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border shadow-2xs",
                selectedStoreFilter === "all"
                  ? "bg-[#0F172A] text-white border-[#0F172A]"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <span>All Stores</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-md text-[10px] font-black",
                selectedStoreFilter === "all" ? "bg-slate-800 text-slate-200" : "bg-rose-100 text-rose-800"
              )}>
                {totalStoresWithDuesCount > 0 ? `${totalStoresWithDuesCount} with dues` : "All clear"}
              </span>
            </button>

            {/* Individual Store Chips */}
            {availableStores.map((storeName) => {
              const stats = storeStats[storeName];
              const isSelected = selectedStoreFilter.toLowerCase().trim() === storeName.toLowerCase().trim();
              const hasDues = stats && stats.unpaidDues > 0;

              return (
                <button
                  key={storeName}
                  type="button"
                  onClick={() => setSelectedStoreFilter(storeName)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border shadow-2xs",
                    isSelected
                      ? "bg-blue-600 text-white border-blue-600 shadow-blue-200"
                      : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40"
                  )}
                >
                  <span className="truncate max-w-[140px] sm:max-w-[180px]">{formatCafeName(storeName)}</span>
                  {hasDues ? (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded-md text-[10px] font-black",
                        isSelected ? "bg-white/20 text-white" : "bg-rose-100 text-rose-800"
                      )}
                    >
                      ₹{stats.unpaidDues.toLocaleString("en-IN")}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded-md text-[10px] font-bold",
                        isSelected ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                      )}
                    >
                      ✓ Clear
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ==================================================== */}
        {/* SELECTED STORE SPOTLIGHT CARD (WHEN STORE SELECTED)  */}
        {/* ==================================================== */}
        {isSpecificStore && activeStoreStats && (
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                  Active Store Filter
                </span>
                {activeStoreStats.unpaidDues > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/90 text-white">
                    ₹{activeStoreStats.unpaidDues.toLocaleString("en-IN")} Pending Dues
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/90 text-white">
                    ✓ All Dues Settled
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                {formatCafeName(selectedStoreFilter)}
              </h2>
              {activeStoreStats.phone && (
                <p className="text-xs text-blue-200 font-mono">
                  Phone: {activeStoreStats.phone}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {activeStoreStats.unpaidDues > 0 && (
                <button
                  type="button"
                  onClick={() => handleSendStoreConsolidatedReminder(selectedStoreFilter)}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-[#16A34A] hover:bg-[#15803D] text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                  title="Send combined WhatsApp reminder for all pending slips of this store"
                >
                  <Send size={13} />
                  <span>Send Store Reminder</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenNewPaymentModal}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-white text-slate-900 hover:bg-slate-100 flex items-center gap-1.5 shadow-xs cursor-pointer transition"
              >
                <Plus size={13} />
                <span>Record Store Payment</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* METRIC CARDS (DYNAMICALLY SCOPED)                   */}
        {/* ==================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                {isSpecificStore ? "Store Pending Dues" : "Total Pending Dues"}
              </p>
              <h3 className="text-2xl font-black text-rose-600 mt-0.5">₹{totalPendingAmount.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-rose-600/80 font-semibold mt-1">
                {scopedInvoices.filter((i) => i.status === "unpaid").length} unpaid delivery slips
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <AlertCircle size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                {isSpecificStore ? "Store Settled Amount" : "Total Settled Collections"}
              </p>
              <h3 className="text-2xl font-black text-emerald-600 mt-0.5">₹{totalCollectedAmount.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-emerald-600/80 font-semibold mt-1">
                {scopedInvoices.filter((i) => i.status === "paid").length} slips cleared into bank/cash
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                {isSpecificStore ? "Store Settlement Rate" : "Global Settlement Rate"}
              </p>
              <h3 className="text-2xl font-black text-[#0F172A] mt-0.5">{settlementRate}%</h3>
              <p className="text-xs text-[#64748B] font-semibold mt-1">Paid delivery slip percentage</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Clock size={20} />
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* FILTER BAR & VIEW TABS                               */}
        {/* ==================================================== */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* View Switcher: Delivery Slips vs Payment History */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl shrink-0 max-w-full overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab("slips")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                  activeTab === "slips" ? "bg-white text-[#0F172A] shadow-2xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Receipt size={13} />
                <span>Delivery Slips ({scopedInvoices.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                  activeTab === "history" ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <History size={13} />
                <span>Receipts History ({filteredHistory.length})</span>
              </button>
            </div>

            {/* Status Pills (Only when on Slips Tab) */}
            {activeTab === "slips" && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0 max-w-full overflow-x-auto scrollbar-none">
                <button
                  type="button"
                  onClick={() => setStatusFilter("unpaid")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                    statusFilter === "unpaid" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Pending ({scopedInvoices.filter((i) => i.status === "unpaid").length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("paid")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                    statusFilter === "paid" ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Settled ({scopedInvoices.filter((i) => i.status === "paid").length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                    statusFilter === "all" ? "bg-white text-[#0F172A] shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  All ({scopedInvoices.length})
                </button>
              </div>
            )}
          </div>

          {/* Search bar & Store Select Filter Dropdown */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-slate-100">
            {/* Store Select Dropdown */}
            <div className="w-full sm:w-72 shrink-0">
              <SelectDropdown
                value={selectedStoreFilter}
                onChange={(val) => setSelectedStoreFilter(val)}
                options={storeFilterOptions}
                size="sm"
                placeholder="Filter by Store..."
                searchPlaceholder="Search store name..."
              />
            </div>

            {/* Keyword Search */}
            <div className="relative flex-1 w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={
                  activeTab === "slips"
                    ? "Search slip # or store..."
                    : "Search receipt notes, store, or reference..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* VIEW 1: DELIVERY SLIPS (PENDING & SETTLED)           */}
        {/* ==================================================== */}
        {activeTab === "slips" && (
          <div className="space-y-3">
            {/* MOBILE VIEW: Vertical Card Feed */}
            <div className="md:hidden space-y-3">
              {filteredInvoices.map((inv) => {
                const formattedStore = formatCafeName(inv.customerName);
                const isRet = (inv.totalAmount || 0) < 0 || Boolean(inv.isReturn) || (inv.invoiceNumber || "").startsWith("RET-");
                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "p-4 rounded-2xl border shadow-2xs space-y-3 transition-all",
                      isRet ? "bg-amber-50/30 border-amber-200/80" : "bg-white border-[#E2E8F0]"
                    )}
                  >
                    {/* Header: Icon, Store Name, Slip # and Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                          isRet ? "bg-amber-100/80 border-amber-200 text-amber-800" : "bg-blue-50 border-blue-200/80 text-blue-700"
                        )}>
                          {isRet ? <RotateCcw size={16} /> : <Store size={16} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-sm text-[#0F172A] leading-snug truncate" title={formattedStore}>
                            {formattedStore}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] flex-wrap">
                            <span className={cn(
                              "font-mono font-bold",
                              isRet ? "text-amber-800" : "text-blue-600"
                            )}>
                              {inv.invoiceNumber}
                            </span>
                            {isRet && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                                Return Credit
                              </span>
                            )}
                            <span className="text-slate-300">•</span>
                            <span className="text-[#64748B] font-medium">{inv.date}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {inv.status === "unpaid" ? (
                          isRet ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
                              <RotateCcw size={10} />
                              <span>Refund Due</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle size={10} />
                              <span>Pending</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={10} />
                            <span>{isRet ? "Refunded" : "Settled"}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3-Stat Financial Grid */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                          {isRet ? "Credit Owed" : "Amount"}
                        </span>
                        <span className={cn(
                          "text-xs font-black mt-0.5 block truncate",
                          isRet ? "text-amber-800" : "text-[#0F172A]"
                        )}>
                          {isRet ? `-₹${Math.abs(inv.totalAmount).toLocaleString("en-IN")}` : `₹${inv.totalAmount.toLocaleString("en-IN")}`}
                        </span>
                      </div>
                      <div className="min-w-0 border-l border-slate-200">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Items</span>
                        <span className="text-xs font-semibold text-slate-700 mt-0.5 block truncate">{(inv.items || []).length} {isRet ? "returned" : "items"}</span>
                      </div>
                      <div className="min-w-0 border-l border-slate-200">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Status</span>
                        <span
                          className={cn(
                            "text-xs font-black mt-0.5 block truncate",
                            inv.status === "unpaid" ? (isRet ? "text-amber-800" : "text-rose-600") : "text-emerald-700"
                          )}
                        >
                          {inv.status === "unpaid" ? (isRet ? "Refund Owed" : "Due") : "Cleared"}
                        </span>
                      </div>
                    </div>

                    {/* Actions Row */}
                    {inv.status === "unpaid" ? (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleOpenRecordPaymentModal(inv)}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-xl text-xs font-extrabold text-white shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                            isRet ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                          )}
                        >
                          {isRet ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                          <span>{isRet ? "Settle Refund / Credit" : "Mark as Paid"}</span>
                        </button>
                        {!isRet && (
                          <button
                            type="button"
                            onClick={() => handleSendReminder(inv)}
                            className="py-2 px-3 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer"
                            title="Send WhatsApp Reminder"
                          >
                            <Send size={13} />
                            <span>Reminder</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400 font-medium">{isRet ? "Refund status" : "Payment status"}</span>
                        <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                          <CheckCircle2 size={12} /> {isRet ? "Refund Settled" : "Settled & Verified"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredInvoices.length === 0 && (
                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2E8F0] text-center shadow-2xs">
                  {renderSlipsEmptyState()}
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
                      <th className="py-3 px-4 whitespace-nowrap">Date</th>
                      <th className="py-3 px-4 whitespace-nowrap">Amount (₹)</th>
                      <th className="py-3 px-4 whitespace-nowrap">Payment Status</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                    {filteredInvoices.map((inv) => {
                      const isRet = (inv.totalAmount || 0) < 0 || Boolean(inv.isReturn) || (inv.invoiceNumber || "").startsWith("RET-");
                      return (
                        <tr key={inv.id} className={cn("transition-colors", isRet ? "bg-amber-50/20 hover:bg-amber-50/40" : "hover:bg-slate-50/80")}>
                          <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                            <span className={isRet ? "text-amber-800" : "text-blue-600"}>
                              {inv.invoiceNumber}
                            </span>
                            {isRet && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                                Return
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedStoreFilter(inv.customerName)}
                              className="flex items-center gap-2 hover:text-blue-600 transition text-left cursor-pointer"
                              title={`Filter to ${inv.customerName}`}
                            >
                              <Store size={14} className={isRet ? "text-amber-600 shrink-0" : "text-blue-500 shrink-0"} />
                              <span className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans whitespace-nowrap hover:underline">
                                {formatCafeName(inv.customerName)}
                              </span>
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-[#64748B] font-medium whitespace-nowrap">{inv.date}</td>
                          <td className="py-3.5 px-4 font-black text-base whitespace-nowrap">
                            {isRet ? (
                              <span className="text-amber-800 font-mono">
                                -₹{Math.abs(inv.totalAmount).toLocaleString("en-IN")}
                              </span>
                            ) : (
                              <span className="text-[#0F172A]">
                                ₹{inv.totalAmount.toLocaleString("en-IN")}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {inv.status === "unpaid" ? (
                              isRet ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
                                  <RotateCcw size={10} />
                                  <span>Refund Due to Client</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                  <AlertCircle size={10} />
                                  <span>Pending Payment</span>
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                <CheckCircle2 size={10} />
                                <span>{isRet ? "Refund Settled" : "Settled (Paid)"}</span>
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
                                    className={cn(
                                      "px-3 py-1.5 rounded-lg text-xs font-extrabold text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap",
                                      isRet ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                                    )}
                                    title={isRet ? "Settle return refund payout to client" : "Record payment to mark slip as paid"}
                                  >
                                    {isRet ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                                    <span>{isRet ? "Settle Refund" : "Mark Paid"}</span>
                                  </button>
                                  {!isRet && (
                                    <button
                                      type="button"
                                      onClick={() => handleSendReminder(inv)}
                                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 border border-emerald-200 transition-all cursor-pointer"
                                      title="Send Reminder on WhatsApp"
                                    >
                                      <Send size={13} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 whitespace-nowrap">
                                  <CheckCircle2 size={13} /> {isRet ? "Refunded" : "Cleared"}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredInvoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 px-4 text-center">
                          {renderSlipsEmptyState()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW 2: PAYMENT RECEIPTS HISTORY LOG                 */}
        {/* ==================================================== */}
        {activeTab === "history" && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm text-[#0F172A]">Payment Receipts &amp; Collections Log</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isSpecificStore ? `Showing payments recorded for ${selectedStoreFilter}` : "All incoming UPI and cash logs"}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                {filteredHistory.length} Recorded
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                    <th className="py-3 px-4 whitespace-nowrap">Date</th>
                    <th className="py-3 px-4 whitespace-nowrap">Store / Client</th>
                    <th className="py-3 px-4 whitespace-nowrap">Amount (₹)</th>
                    <th className="py-3 px-4 whitespace-nowrap">Payment Mode</th>
                    <th className="py-3 px-4 whitespace-nowrap">Slip / Reference Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                  {filteredHistory.map((pay) => {
                    const isRefund = pay.amount < 0 || (pay.notes || "").toLowerCase().includes("refund");
                    return (
                      <tr key={pay.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-[#64748B] font-medium whitespace-nowrap">{pay.date}</td>
                        <td className="py-3.5 px-4 font-extrabold text-[#0F172A] whitespace-nowrap">
                          {formatCafeName(pay.storeName)}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 font-black whitespace-nowrap",
                          isRefund ? "text-amber-800" : "text-emerald-600"
                        )}>
                          {isRefund ? `-₹${Math.abs(pay.amount).toLocaleString("en-IN")}` : `₹${pay.amount.toLocaleString("en-IN")}`}
                          {isRefund && (
                            <span className="ml-1.5 text-[9.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded">
                              Refund Paid
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {pay.paymentMode}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                          {pay.notes || (pay.invoiceNumber ? `Slip #${pay.invoiceNumber}` : "Balance payment")}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#64748B]">
                        <p className="font-bold text-sm">No payment history recorded yet.</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Payments recorded using &ldquo;Record Payment&rdquo; will be logged here.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* RECORD PAYMENT MODAL                                 */}
      {/* ==================================================== */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0",
                  isSelectedSlipReturn ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                )}>
                  {isSelectedSlipReturn ? <RotateCcw size={16} /> : <CreditCard size={16} />}
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0F172A]">
                    {isSelectedSlipReturn
                      ? "Settle Client Return Refund"
                      : (selectedInvoiceNumber ? "Settle Delivery Slip" : "Record Store Payment")}
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    {isSelectedSlipReturn
                      ? `Record refund payout or return credit settlement for Slip #${selectedInvoiceNumber}`
                      : (selectedInvoiceNumber
                          ? `Record payment received for Slip #${selectedInvoiceNumber}`
                          : "Clear dues and record incoming UPI or cash")}
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
              <div className={cn(
                "p-3 rounded-2xl flex items-center justify-between",
                isSelectedSlipReturn ? "bg-amber-50/90 border border-amber-200/90" : "bg-blue-50/80 border border-blue-200/80"
              )}>
                <div>
                  <p className={cn("text-xs font-bold", isSelectedSlipReturn ? "text-amber-950" : "text-blue-900")}>
                    Slip #{selectedInvoiceNumber}
                  </p>
                  <p className={cn("text-[11px]", isSelectedSlipReturn ? "text-amber-800/80" : "text-blue-700/80")}>
                    {selectedStoreName}
                  </p>
                </div>
                <span className={cn(
                  "font-mono font-extrabold text-xs px-2 py-0.5 rounded-full border",
                  isSelectedSlipReturn ? "bg-amber-100 text-amber-900 border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"
                )}>
                  {isSelectedSlipReturn ? `Return Credit (-₹${Math.abs(selectedSlip?.totalAmount || 0).toLocaleString("en-IN")})` : "Target Slip"}
                </span>
              </div>
            )}

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">
                  {isSelectedSlipReturn ? "Client / Store Receiving Refund *" : "Paying Store / Café *"}
                </label>
                <SelectDropdown
                  value={selectedStoreName}
                  onChange={(st) => {
                    setSelectedStoreName(st);
                    const due = storeStats[st]?.unpaidDues;
                    if (due && due > 0 && !selectedInvoiceNumber) {
                      setAmountReceived(String(due));
                      setNotes(`Clearing dues for ${st}`);
                    }
                  }}
                  options={storeRecordOptions}
                  size="md"
                  placeholder="Select store / café..."
                  searchPlaceholder="Search store name..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#0F172A]">
                    {isSelectedSlipReturn ? "Refund / Settlement Amount (₹) *" : "Amount Received (₹) *"}
                  </label>
                  {!isSelectedSlipReturn && selectedStoreName && storeStats[selectedStoreName]?.unpaidDues > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmountReceived(String(storeStats[selectedStoreName].unpaidDues))}
                      className="text-[10.5px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Fill full dues (₹{storeStats[selectedStoreName].unpaidDues.toLocaleString("en-IN")})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder={isSelectedSlipReturn ? "e.g. 75" : "e.g. 3500"}
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-black text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {isSelectedSlipReturn && (
                  <p className="text-[11px] text-amber-800 font-medium mt-1">
                    ✓ Confirming ₹{amountReceived || "0"} refund payout or credit note settlement issued to {formatCafeName(selectedStoreName)}.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">
                  {isSelectedSlipReturn ? "Settlement / Refund Mode" : "Payment Mode"}
                </label>
                <div className={cn("grid gap-2", isSelectedSlipReturn ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
                  {(isSelectedSlipReturn
                    ? ["Cash Refund", "UPI Payout", "Bill Credit", "Bank Transfer"]
                    : ["UPI (GPay / PhonePe)", "Cash", "Bank Transfer"]
                  ).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMode(m)}
                      className={cn(
                        "py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center truncate",
                        paymentMode === m
                          ? (isSelectedSlipReturn ? "bg-amber-800 text-white border-amber-800" : "bg-[#0F172A] text-white border-[#0F172A]")
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
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white shadow-xs cursor-pointer transition flex items-center justify-center gap-1.5",
                    isSelectedSlipReturn ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                  )}
                >
                  {isSelectedSlipReturn ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                  <span>{isSelectedSlipReturn ? "Confirm Refund / Settle Slip" : "Record Payment"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
