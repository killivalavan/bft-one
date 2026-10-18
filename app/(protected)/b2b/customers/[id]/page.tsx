"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import {
  generateCombinedLedgerPdf,
  CombinedLedgerTransaction,
  CombinedLedgerPdfData,
} from "@/lib/utils/combinedLedgerPdf";
import {
  formatCafeName,
  capitalizeWords,
  sanitizeBakerStores,
} from "@/lib/utils/bakerUtils";
import {
  fetchB2BClients,
  B2B_CUSTOMERS_UPDATED_EVENT,
} from "@/lib/services/b2bClients";
import {
  getSlipDate,
  getDateRangeInterval,
  CafeCustomer,
} from "../page";
import {
  Building2,
  Phone,
  MapPin,
  FileDown,
  Calendar,
  AlertCircle,
  Sparkles,
  ArrowRightLeft,
  ArrowLeft,
  Eye,
  Plus,
  Receipt,
  RotateCcw,
  Boxes,
  CheckCircle2,
  Clock,
  Send,
  CreditCard,
} from "lucide-react";

export default function ClientLedgerDedicatedPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id ? decodeURIComponent(String(params.id)) : "";

  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  // Data Stores
  const [stores, setStores] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Date Filter State
  const [detailDatePreset, setDetailDatePreset] = useState<"today" | "week" | "month" | "custom" | "all">("all");
  const [detailCustomStart, setDetailCustomStart] = useState("");
  const [detailCustomEnd, setDetailCustomEnd] = useState("");

  // Viewing individual slip details popup
  const [viewingSlipDetails, setViewingSlipDetails] = useState<any | null>(null);

  // Load Data
  useEffect(() => {
    try {
      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) {
        const parsed = JSON.parse(storedCusts);
        const cleaned = sanitizeBakerStores(parsed);
        if (cleaned.length > 0) setStores(cleaned);
      }

      const storedInvs = localStorage.getItem(`bftone_invoices_${bizId}`);
      if (storedInvs) {
        setInvoices(JSON.parse(storedInvs));
      }
    } catch {}

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
      supabaseClient
        .from("invoices")
        .select("*")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) {
            const mapped = data.map((d: any) => ({
              id: d.id,
              invoiceNumber: d.invoice_number,
              title: d.title || "DELIVERY SLIP",
              isReturn: Boolean(d.title?.includes("RETURN") || (d.invoice_number || "").startsWith("RET-") || (d.total_cents || 0) < 0),
              customerName: d.customer_name,
              customerPhone: d.customer_phone,
              customerAddress: d.customer_address,
              totalAmount: (d.total_cents || 0) / 100,
              subtotal: (d.subtotal_cents || 0) / 100,
              status: d.status || "unpaid",
              date: d.invoice_date || format(new Date(), "MMM dd, yyyy"),
              items: d.items || [],
              createdAt: d.created_at,
            }));
            setInvoices(mapped);
          }
          setIsLoaded(true);
        });
    } else {
      setIsLoaded(true);
    }

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [bizId, business?.id]);

  // Identify Client
  const client = useMemo(() => {
    if (!rawId) return null;
    const lower = rawId.toLowerCase().trim();

    // 1. Match by id
    const byId = stores.find((s) => s.id === rawId || (s.id && s.id.toLowerCase() === lower));
    if (byId) return byId;

    // 2. Match by name in stores
    const byName = stores.find((s) => s.name && s.name.toLowerCase().trim() === lower);
    if (byName) return byName;

    // 3. Match by name in invoices
    const matchingInv = invoices.find((inv) => (inv.customerName || "").toLowerCase().trim() === lower);
    if (matchingInv) {
      return {
        id: rawId,
        name: matchingInv.customerName,
        phone: matchingInv.customerPhone || "",
        address: matchingInv.customerAddress || "",
      };
    }

    return {
      id: rawId,
      name: rawId,
      phone: "",
      address: "",
    };
  }, [rawId, stores, invoices]);

  // Client's invoices
  const clientInvoices = useMemo(() => {
    if (!client?.name) return [];
    const clientNameLower = client.name.toLowerCase().trim();
    return invoices.filter(
      (inv) => (inv.customerName || "").toLowerCase().trim() === clientNameLower
    );
  }, [client, invoices]);

  // Date Filter calculations
  const { start, end, label } = useMemo(() => {
    return getDateRangeInterval(detailDatePreset, detailCustomStart, detailCustomEnd);
  }, [detailDatePreset, detailCustomStart, detailCustomEnd]);

  const filteredClientSlips = useMemo(() => {
    return clientInvoices.filter((s) => {
      const d = getSlipDate(s);
      return d >= start && d <= end;
    });
  }, [clientInvoices, start, end]);

  // Helper to build chronological CombinedLedgerTransaction items from slips
  const clientTransactions = useMemo(() => {
    const list: CombinedLedgerTransaction[] = [];
    const sorted = [...filteredClientSlips].sort((a, b) => getSlipDate(a).getTime() - getSlipDate(b).getTime());

    sorted.forEach((slip) => {
      const isRet = Boolean(slip.isReturn || (slip.invoiceNumber || "").startsWith("RET-") || (slip.totalAmount || 0) < 0);
      const items = slip.items && slip.items.length > 0 ? slip.items : null;

      if (items) {
        items.forEach((it: any) => {
          const qty = Number(it.qty) || 0;
          const rate = Number(it.rate) || 0;
          const amount = isRet ? -Math.abs(it.amount || qty * rate) : Math.abs(it.amount || qty * rate);

          list.push({
            date: slip.date || format(getSlipDate(slip), "MMM dd, yyyy"),
            slipNumber: slip.invoiceNumber,
            isReturn: isRet,
            storeName: slip.customerName,
            productName: capitalizeWords(it.name || "Assorted Bakery"),
            qty,
            unit: it.unit || "pcs",
            rate,
            amount,
            notes: isRet ? "Returned Stock" : "Delivered",
          });
        });
      } else {
        const amt = slip.totalAmount || 0;
        list.push({
          date: slip.date || format(getSlipDate(slip), "MMM dd, yyyy"),
          slipNumber: slip.invoiceNumber,
          isReturn: isRet,
          storeName: slip.customerName,
          productName: isRet ? "Returned Item Credit" : "Bakery Dispatch",
          qty: 1,
          unit: "lot",
          rate: Math.abs(amt),
          amount: isRet ? -Math.abs(amt) : Math.abs(amt),
          notes: isRet ? "Credit Note" : "Delivery Slip",
        });
      }
    });

    return list;
  }, [filteredClientSlips]);

  // Financial summary numbers
  const periodDeliverySlips = useMemo(() => {
    return filteredClientSlips.filter(
      (s) => !s.isReturn && !(s.invoiceNumber || "").startsWith("RET-") && (s.totalAmount || 0) >= 0
    );
  }, [filteredClientSlips]);

  const periodReturnSlips = useMemo(() => {
    return filteredClientSlips.filter(
      (s) => s.isReturn || (s.invoiceNumber || "").startsWith("RET-") || (s.totalAmount || 0) < 0
    );
  }, [filteredClientSlips]);

  const periodDeliveryValue = useMemo(() => {
    return periodDeliverySlips.reduce((acc, s) => acc + Math.abs(s.totalAmount || 0), 0);
  }, [periodDeliverySlips]);

  const periodReturnValue = useMemo(() => {
    return periodReturnSlips.reduce((acc, s) => acc + Math.abs(s.totalAmount || 0), 0);
  }, [periodReturnSlips]);

  const periodBilled = periodDeliveryValue - periodReturnValue;

  const periodPaid = useMemo(() => {
    return periodDeliverySlips
      .filter((s) => s.status === "paid")
      .reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  }, [periodDeliverySlips]);

  const periodUnpaid = useMemo(() => {
    return periodDeliverySlips
      .filter((s) => s.status === "unpaid")
      .reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  }, [periodDeliverySlips]);

  const isAllTime = detailDatePreset === "all";
  const billedLabel = isAllTime ? "Lifetime Billed" : "Period Billed";
  const paidLabel = isAllTime ? "Settled Collections" : "Period Settled";
  const duesLabel = isAllTime ? "Outstanding Dues" : "Period Dues";
  const activityLabel = isAllTime ? "Total Activity" : "Period Activity";

  // Quick presets & utilities for custom date range picker
  const applyQuickCustomRange = (type: "this_month" | "last_month" | "last_14" | "last_90" | "today" | "financial_year") => {
    const now = new Date();
    if (type === "today") {
      const todayStr = format(now, "yyyy-MM-dd");
      setDetailCustomStart(todayStr);
      setDetailCustomEnd(todayStr);
    } else if (type === "this_month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDetailCustomStart(format(firstDay, "yyyy-MM-dd"));
      setDetailCustomEnd(format(now, "yyyy-MM-dd"));
    } else if (type === "last_month") {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDetailCustomStart(format(firstDayLastMonth, "yyyy-MM-dd"));
      setDetailCustomEnd(format(lastDayLastMonth, "yyyy-MM-dd"));
    } else if (type === "last_14") {
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      setDetailCustomStart(format(fourteenDaysAgo, "yyyy-MM-dd"));
      setDetailCustomEnd(format(now, "yyyy-MM-dd"));
    } else if (type === "last_90") {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      setDetailCustomStart(format(ninetyDaysAgo, "yyyy-MM-dd"));
      setDetailCustomEnd(format(now, "yyyy-MM-dd"));
    } else if (type === "financial_year") {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fyStart = new Date(fyStartYear, 3, 1);
      setDetailCustomStart(format(fyStart, "yyyy-MM-dd"));
      setDetailCustomEnd(format(now, "yyyy-MM-dd"));
    }
  };

  const handleSwapDates = () => {
    if (!detailCustomStart || !detailCustomEnd) return;
    const temp = detailCustomStart;
    setDetailCustomStart(detailCustomEnd);
    setDetailCustomEnd(temp);
  };

  const customDaysCount = useMemo(() => {
    if (!detailCustomStart || !detailCustomEnd) return null;
    const s = new Date(detailCustomStart);
    const e = new Date(detailCustomEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    const diffTime = e.getTime() - s.getTime();
    if (diffTime < 0) return -1;
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [detailCustomStart, detailCustomEnd]);

  // Export Combined Ledger Statement PDF
  const handleExportStatementPdf = () => {
    if (!client) return;

    if (clientTransactions.length === 0) {
      toast({
        title: "No Transactions Found",
        description: `No slips found for ${client.name} in ${label}.`,
        variant: "error",
      });
      return;
    }

    const totalDeliveredQty = periodDeliverySlips.reduce(
      (acc, s) => acc + (s.items || []).reduce((q: number, it: any) => q + (Number(it.qty) || 0), 0),
      0
    );
    const totalReturnedQty = periodReturnSlips.reduce(
      (acc, s) => acc + (s.items || []).reduce((q: number, it: any) => q + (Number(it.qty) || 0), 0),
      0
    );

    try {
      const pdfData: CombinedLedgerPdfData = {
        businessName: business?.name || "SeyalPro Wholesale Bakery",
        businessPhone: business?.phone || undefined,
        businessAddress: business?.address || undefined,
        upiId: business?.upi_id?.trim() || undefined,
        mode: "client",
        entityName: client.name,
        phone: client.phone || undefined,
        address: client.address || undefined,
        periodLabel: label,
        exportDate: format(new Date(), "MMM dd, yyyy • hh:mm a"),
        totalDeliveredSlips: periodDeliverySlips.length,
        totalDeliveredQty,
        totalDeliveryValue: periodDeliveryValue,
        totalReturnedSlips: periodReturnSlips.length,
        totalReturnedQty,
        totalReturnValue: periodReturnValue,
        netPeriodValue: periodBilled,
        transactions: clientTransactions,
      };

      generateCombinedLedgerPdf(pdfData);

      toast({
        title: "Statement Downloaded 📄",
        description: `Exported statement for ${client.name} (${label}).`,
      });
    } catch (err: any) {
      toast({
        title: "Export Failed",
        description: err?.message || "Failed to generate PDF.",
        variant: "error",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-4 py-2.5 sm:py-3.5 space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center transition cursor-pointer shrink-0"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-sm sm:text-lg font-black text-[#0F172A] tracking-tight truncate">
                  {client ? formatCafeName(client.name) : "Client Statement"}
                </h1>
                {client?.business_id && (
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                    ⚡ App Linked
                  </span>
                )}
                <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                  Client Ledger
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5 line-clamp-1">
                Full chronological delivery &amp; return statement with itemized breakdowns
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center sm:gap-2">
            <button
              type="button"
              onClick={handleExportStatementPdf}
              className="px-2 sm:px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition active:scale-95"
            >
              <FileDown size={14} className="shrink-0" />
              <span className="truncate">
                <span className="sm:hidden">Statement PDF</span>
                <span className="hidden sm:inline">Export PDF Statement</span>
              </span>
            </button>

            <Link
              href="/b2b/payments"
              className="px-2 sm:px-3 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition shadow-2xs flex items-center justify-center gap-1.5 text-center"
            >
              <CreditCard size={13} className="text-blue-600 shrink-0" />
              <span className="truncate">
                <span className="sm:hidden">Payment</span>
                <span className="hidden sm:inline">Record Payment</span>
              </span>
            </Link>

            <Link
              href={client ? `/b2b/dispatch?customer=${encodeURIComponent(client.name)}` : "/b2b/dispatch"}
              className="px-2 sm:px-3 py-2 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white transition shadow-xs flex items-center justify-center gap-1.5 text-center"
            >
              <Plus size={14} className="shrink-0" />
              <span className="truncate">
                <span className="sm:hidden">Dispatch</span>
                <span className="hidden sm:inline">New Dispatch</span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3.5 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Client Identity & Contact Card */}
        {client && (client.phone || client.address) && (
          <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-200 shadow-2xs space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Building2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-[#0F172A] truncate">
                    {formatCafeName(client.name)}
                  </h3>
                  <span className="sm:hidden bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 shrink-0">
                    {clientInvoices.length} slips
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-600 mt-1">
                  {client.phone && (
                    <a
                      href={`tel:${client.phone}`}
                      className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-700 hover:text-blue-600 transition"
                    >
                      <Phone size={12} className="text-blue-600 shrink-0" />
                      <span>{client.phone}</span>
                    </a>
                  )}
                  {client.phone && client.address && (
                    <span className="hidden sm:inline text-slate-300">•</span>
                  )}
                  {client.address && (
                    <span className="inline-flex items-center gap-1.5 text-slate-600 text-[11px] sm:text-xs">
                      <MapPin size={12} className="text-blue-600 shrink-0" />
                      <span className="line-clamp-2 sm:line-clamp-1">{client.address}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-500 shrink-0">
              <span className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                Total Orders: <strong className="text-slate-900">{clientInvoices.length} slips</strong>
              </span>
            </div>
          </div>
        )}

        {/* Date Filter Bar */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-[#E2E8F0] shadow-xs space-y-2.5 sm:space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl text-xs font-bold overflow-x-auto max-w-full no-scrollbar">
              {(["all", "today", "week", "month", "custom"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setDetailDatePreset(preset);
                    if (preset === "custom" && (!detailCustomStart || !detailCustomEnd)) {
                      const now = new Date();
                      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                      setDetailCustomStart(format(thirtyDaysAgo, "yyyy-MM-dd"));
                      setDetailCustomEnd(format(now, "yyyy-MM-dd"));
                    }
                  }}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 rounded-xl transition-all capitalize cursor-pointer shrink-0 whitespace-nowrap text-xs",
                    detailDatePreset === preset
                      ? "bg-blue-600 text-white shadow-2xs font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {preset === "all" ? "All Time" : preset === "week" ? "7 Days" : preset === "month" ? "30 Days" : preset}
                </button>
              ))}
            </div>

            <div className="text-[11px] sm:text-xs text-slate-500 font-medium px-1 flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
              <span>Showing <strong>{clientTransactions.length}</strong> entries</span>
              <span className="text-slate-400 text-[10px] sm:text-[11px]">({label})</span>
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {detailDatePreset === "custom" && (
            <div className="p-3.5 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs space-y-3 sm:space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <Calendar size={14} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs sm:text-sm text-[#0F172A] leading-tight">
                      Custom Statement Window
                    </h4>
                    <p className="text-[10px] sm:text-[11px] text-slate-500">Pick any custom range or tap a quick-pick preset</p>
                  </div>
                </div>

                {customDaysCount === -1 ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shadow-2xs">
                    <AlertCircle size={11} className="text-rose-600" />
                    <span>Invalid Range</span>
                  </span>
                ) : customDaysCount !== null && customDaysCount > 0 ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shadow-2xs">
                    <Sparkles size={11} className="text-blue-600" />
                    <span>{customDaysCount} {customDaysCount === 1 ? "Day" : "Days"} Selected</span>
                  </span>
                ) : null}
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Quick Smart Presets
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  <button
                    type="button"
                    onClick={() => applyQuickCustomRange("this_month")}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickCustomRange("last_month")}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    Last Month
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickCustomRange("last_14")}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    Last 14 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickCustomRange("last_90")}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    Last 90 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickCustomRange("financial_year")}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    FY to Date
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickCustomRange("today")}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    Today Only
                  </button>
                </div>
              </div>

              {/* Date Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                <div className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-2xs focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      <span>From (Start Date)</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">00:00 AM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-blue-600 shrink-0" />
                    <input
                      type="date"
                      value={detailCustomStart}
                      onChange={(e) => setDetailCustomStart(e.target.value)}
                      className="w-full text-xs sm:text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-center py-1 sm:py-0">
                  <button
                    type="button"
                    onClick={handleSwapDates}
                    title="Swap Dates"
                    className="w-8 h-8 rounded-full bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 flex items-center justify-center font-bold text-xs shadow-2xs transition-all cursor-pointer"
                  >
                    <ArrowRightLeft size={13} />
                  </button>
                </div>

                <div className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-2xs focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      <span>To (End Date)</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">11:59 PM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-blue-600 shrink-0" />
                    <input
                      type="date"
                      value={detailCustomEnd}
                      onChange={(e) => setDetailCustomEnd(e.target.value)}
                      className="w-full text-xs sm:text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4 Financial Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-white border border-[#E2E8F0] shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                <span className="sm:hidden">Billed</span>
                <span className="hidden sm:inline">{billedLabel}</span>
              </span>
              <span className="text-lg sm:text-2xl font-black text-[#0F172A] mt-1 block truncate">
                ₹{periodBilled.toLocaleString("en-IN")}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-1.5 line-clamp-1">
              {isAllTime
                ? "All recorded dispatches"
                : periodReturnValue > 0
                ? `Net of ₹${periodReturnValue.toLocaleString("en-IN")} returns`
                : "In selected window"}
            </p>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-emerald-50/70 border border-emerald-200/80 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-wider block truncate">
                <span className="sm:hidden">Settled</span>
                <span className="hidden sm:inline">{paidLabel}</span>
              </span>
              <span className="text-lg sm:text-2xl font-black text-emerald-700 mt-1 block truncate">
                ₹{periodPaid.toLocaleString("en-IN")}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-emerald-700 font-medium mt-1.5 line-clamp-1">
              {periodDeliverySlips.filter((s) => s.status === "paid").length} slips settled
            </p>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-rose-50/70 border border-rose-200/80 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-rose-800 uppercase tracking-wider block truncate">
                <span className="sm:hidden">Outstanding</span>
                <span className="hidden sm:inline">{duesLabel}</span>
              </span>
              <span className={cn(
                "text-lg sm:text-2xl font-black mt-1 block truncate",
                periodUnpaid > 0 ? "text-rose-700" : "text-emerald-700"
              )}>
                ₹{periodUnpaid.toLocaleString("en-IN")}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-rose-700 font-medium mt-1.5 line-clamp-1">
              {periodUnpaid > 0
                ? `${periodDeliverySlips.filter((s) => s.status === "unpaid").length} slips unpaid`
                : "All clear in this period"}
            </p>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-blue-50/70 border border-blue-200/80 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-blue-800 uppercase tracking-wider block truncate">
                <span className="sm:hidden">Activity</span>
                <span className="hidden sm:inline">{activityLabel}</span>
              </span>
              <span className="text-base sm:text-2xl font-black text-blue-700 mt-1 block truncate">
                {periodDeliverySlips.length} del {periodReturnSlips.length > 0 && `• ${periodReturnSlips.length} ret`}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-blue-700 font-medium mt-1.5 line-clamp-1">
              {filteredClientSlips.length} slips recorded
            </p>
          </div>
        </div>

        {/* Chronological Statement Slips List */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
          <div className="p-3.5 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#0F172A]">
                Dispatch &amp; Return Ledger
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Every delivery slip and return credit note in chronological sequence
              </p>
            </div>
            <span className="px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-slate-100 text-slate-700 shrink-0">
              {filteredClientSlips.length} Slips
            </span>
          </div>

          {filteredClientSlips.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-slate-400">
              <Receipt size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No slips found in this date window</p>
              <p className="text-xs text-slate-400 mt-1">Try switching to "All Time" to see all recorded deliveries.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-extrabold">
                      <th className="py-3 px-4">Date &amp; Slip Ref</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Item Details</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredClientSlips.map((slip) => {
                      const isRet = Boolean(slip.isReturn || (slip.invoiceNumber || "").startsWith("RET-") || (slip.totalAmount || 0) < 0);
                      const absAmount = Math.abs(slip.totalAmount || 0);

                      return (
                        <tr key={slip.id || slip.invoiceNumber} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4">
                            <span className="font-mono font-extrabold text-blue-600 block">
                              {slip.invoiceNumber}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {slip.date}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                              isRet
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            )}>
                              {isRet ? "Return" : "Delivery"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {slip.items && slip.items.length > 0 ? (
                              <div className="space-y-0.5">
                                {slip.items.map((it: any, idx: number) => (
                                  <div key={idx} className="text-slate-700 text-[11px]">
                                    <strong>{it.qty} {it.unit || "pcs"}</strong> × {it.name}
                                    {it.rate && <span className="text-slate-400"> @ ₹{it.rate}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Wholesale Dispatch</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={cn(
                              "font-black text-sm tabular-nums",
                              isRet ? "text-amber-700" : "text-slate-900"
                            )}>
                              {isRet ? "−" : ""}₹{absAmount.toLocaleString("en-IN")}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {!isRet ? (
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                                slip.status === "paid"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              )}>
                                {slip.status === "paid" ? "Settled" : "Due"}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setViewingSlipDetails(slip)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition cursor-pointer"
                              title="View Slip Details"
                            >
                              <Eye size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View (< md) */}
              <div className="md:hidden p-3 space-y-2.5 bg-slate-50/50">
                {filteredClientSlips.map((slip) => {
                  const isRet = Boolean(slip.isReturn || (slip.invoiceNumber || "").startsWith("RET-") || (slip.totalAmount || 0) < 0);
                  const absAmount = Math.abs(slip.totalAmount || 0);

                  return (
                    <div
                      key={slip.id || slip.invoiceNumber}
                      className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/70">
                              {slip.invoiceNumber}
                            </span>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                                isRet ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"
                              )}
                            >
                              {isRet ? "Return" : "Delivery"}
                            </span>
                            {!isRet && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase",
                                  slip.status === "paid"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                )}
                              >
                                {slip.status === "paid" ? "Settled" : "Due"}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-medium mt-1">
                            {slip.date}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={cn(
                              "font-black text-sm tabular-nums block",
                              isRet ? "text-amber-700" : "text-slate-900"
                            )}
                          >
                            {isRet ? "−" : ""}₹{absAmount.toLocaleString("en-IN")}
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewingSlipDetails(slip)}
                            className="mt-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <Eye size={11} />
                            <span>Details</span>
                          </button>
                        </div>
                      </div>

                      {/* Line items snippet */}
                      {slip.items && slip.items.length > 0 ? (
                        <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 space-y-1">
                          {slip.items.map((it: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] text-slate-700">
                              <span className="truncate pr-2">
                                <strong className="text-slate-900">{it.qty} {it.unit || "pcs"}</strong> × {it.name}
                              </span>
                              <span className="text-slate-400 font-mono text-[10px] shrink-0">
                                {it.rate ? `@ ₹${it.rate}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-xl p-2 text-[11px] text-slate-400 italic">
                          Wholesale Dispatch (Lot)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slip Details Modal */}
      {viewingSlipDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-[#0F172A]">
                  Slip #{viewingSlipDetails.invoiceNumber}
                </h4>
                <p className="text-xs text-slate-500">{viewingSlipDetails.date}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingSlipDetails(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Line Items</h5>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {viewingSlipDetails.items?.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100">
                    <span>{it.qty} {it.unit || "pcs"} × {it.name}</span>
                    <strong className="text-slate-900 font-mono">₹{it.amount || (it.qty * (it.rate || 0))}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-sm font-black">
              <span>Total Amount:</span>
              <span className="text-blue-600 font-mono">₹{Math.abs(viewingSlipDetails.totalAmount || 0).toLocaleString("en-IN")}</span>
            </div>

            <button
              type="button"
              onClick={() => setViewingSlipDetails(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
