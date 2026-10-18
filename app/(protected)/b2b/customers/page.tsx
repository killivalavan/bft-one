"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { generateCombinedLedgerPdf, CombinedLedgerPdfData, CombinedLedgerTransaction } from "@/lib/utils/combinedLedgerPdf";
import { generateBillPdf, BillPdfData } from "@/lib/utils/billPdf";
import { formatCafeName, capitalizeWords, sanitizeBakerStores } from "@/lib/utils/bakerUtils";
import {
  fetchB2BClients,
  saveB2BClient,
  updateB2BClient,
  deleteB2BClient,
  B2B_CUSTOMERS_UPDATED_EVENT,
} from "@/lib/services/b2bClients";
import {
  Plus, Phone, Receipt, ArrowRight,
  Search, AlertCircle,
  Trash2, Edit3, FileDown, Download,
  Building2, Eye, ChevronRight,
  Send, MapPin, Calendar,
  Clock, Sparkles, RotateCcw, Check, ArrowRightLeft
} from "lucide-react";

export interface CafeCustomer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  business_id?: string;
  totalBilled: number;
  totalPaid: number;
  unpaidDues: number;
  slipsCount: number;
  deliverySlipsCount: number;
  returnSlipsCount: number;
  lastTransactionDate?: string;
}

interface SeyalProPartner {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
}

// Helper to reliably get Date object from any slip format
export function getSlipDate(slip: any): Date {
  if (slip.createdAt) {
    const d = new Date(slip.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (slip.created_at) {
    const d = new Date(slip.created_at);
    if (!isNaN(d.getTime())) return d;
  }
  if (slip.invoice_date) {
    const d = new Date(slip.invoice_date);
    if (!isNaN(d.getTime())) return d;
  }
  if (slip.date) {
    const d = new Date(slip.date);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

// Date preset helper
export function getDateRangeInterval(
  preset: "today" | "week" | "month" | "custom" | "all",
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (preset === "today") {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: s, end: e, label: `Today (${format(now, "MMM dd, yyyy")})` };
  }
  if (preset === "week") {
    const s = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    s.setHours(0, 0, 0, 0);
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e, label: `Last 7 Days (${format(s, "MMM dd")} – ${format(e, "MMM dd, yyyy")})` };
  }
  if (preset === "month") {
    const s = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    s.setHours(0, 0, 0, 0);
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e, label: `Last 30 Days (${format(s, "MMM dd")} – ${format(e, "MMM dd, yyyy")})` };
  }
  if (preset === "custom" && customStart && customEnd) {
    const s = new Date(customStart);
    s.setHours(0, 0, 0, 0);
    const e = new Date(customEnd);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e, label: `${format(s, "MMM dd, yyyy")} – ${format(e, "MMM dd, yyyy")}` };
  }
  // All Time
  return { start: new Date(2000, 0, 1), end: new Date(2100, 0, 1), label: "All Recorded Slips (Lifetime)" };
}

export default function BakerCustomersPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  // Data Stores
  const [stores, setStores] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "dues" | "settled">("all");
  const [deletingCafe, setDeletingCafe] = useState<CafeCustomer | null>(null);

  // Detail Drill-down
  const [selectedClientDetail, setSelectedClientDetail] = useState<CafeCustomer | null>(null);
  const [viewingSlipDetails, setViewingSlipDetails] = useState<any | null>(null);

  // Client Detail Date Filter
  const [detailDatePreset, setDetailDatePreset] = useState<"today" | "week" | "month" | "custom" | "all">("all");
  const [detailCustomStart, setDetailCustomStart] = useState("");
  const [detailCustomEnd, setDetailCustomEnd] = useState("");

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
    if (diffTime < 0) return -1; // invalid: start > end
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [detailCustomStart, detailCustomEnd]);

  // Combined PDF Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportClientId, setExportClientId] = useState<string>("");
  const [exportDatePreset, setExportDatePreset] = useState<"today" | "week" | "month" | "custom" | "all">("month");
  const [exportCustomStart, setExportCustomStart] = useState("");
  const [exportCustomEnd, setExportCustomEnd] = useState("");

  // Partner Directory for In-App Linking
  const [partnerDirectory, setPartnerDirectory] = useState<SeyalProPartner[]>([]);

  // Add Client Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [linkedBusinessId, setLinkedBusinessId] = useState<string>("");

  // Edit Client Modal
  const [editingCafe, setEditingCafe] = useState<CafeCustomer | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLinkedBusinessId, setEditLinkedBusinessId] = useState<string>("");

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
      fetch(`/api/baker/clients/lookup?sender_business_id=${business.id}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.ok && Array.isArray(res.stores)) {
            setPartnerDirectory(res.stores);
          }
        })
        .catch(() => {});
    }

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
        });
    }

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [bizId, business?.id]);

  // Compute Clients with Ledger Metrics
  const cafesWithLedger: CafeCustomer[] = useMemo(() => {
    return stores.map((st) => {
      const clientInvoices = invoices.filter(
        (inv) => (inv.customerName || "").toLowerCase().trim() === st.name.toLowerCase().trim()
      );

      const totalBilled = clientInvoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
      const unpaidDues = clientInvoices
        .filter((inv) => inv.status === "unpaid")
        .reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
      const totalPaid = totalBilled - unpaidDues;

      const deliverySlips = clientInvoices.filter(
        (inv) => !inv.isReturn && !(inv.invoiceNumber || "").startsWith("RET-") && (inv.totalAmount || 0) >= 0
      );
      const returnSlips = clientInvoices.filter(
        (inv) => inv.isReturn || (inv.invoiceNumber || "").startsWith("RET-") || (inv.totalAmount || 0) < 0
      );

      const sortedInvs = [...clientInvoices].sort((a, b) => getSlipDate(b).getTime() - getSlipDate(a).getTime());
      const lastTx = sortedInvs[0]?.date || undefined;

      return {
        id: st.id,
        name: st.name,
        phone: st.phone,
        address: st.address,
        business_id: st.business_id,
        totalBilled,
        totalPaid,
        unpaidDues,
        slipsCount: clientInvoices.length,
        deliverySlipsCount: deliverySlips.length,
        returnSlipsCount: returnSlips.length,
        lastTransactionDate: lastTx,
      };
    });
  }, [stores, invoices]);

  // Summary Metrics
  const totalClientsCount = cafesWithLedger.length;
  const totalBilledAll = cafesWithLedger.reduce((acc, c) => acc + c.totalBilled, 0);
  const totalOutstandingAll = cafesWithLedger.reduce((acc, c) => acc + c.unpaidDues, 0);
  const totalPendingSettlementsCount = invoices.filter((inv) => inv.status === "unpaid").length;

  // Filtered Client Listing
  const filteredClients = useMemo(() => {
    let list = cafesWithLedger;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q))
      );
    }
    if (statusFilter === "dues") {
      list = list.filter((c) => c.unpaidDues > 0);
    } else if (statusFilter === "settled") {
      list = list.filter((c) => c.unpaidDues === 0);
    }
    return list;
  }, [cafesWithLedger, searchQuery, statusFilter]);

  // Phone Sanitizer
  const sanitize10Digits = (val: string) => {
    let digits = val.replace(/\D/g, "");
    if (digits.startsWith("91") && digits.length > 10) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0") && digits.length > 10) {
      digits = digits.slice(1);
    }
    return digits.slice(0, 10);
  };

  const handlePhoneChange = (val: string) => setPhone(sanitize10Digits(val));
  const handleEditPhoneChange = (val: string) => setEditPhone(sanitize10Digits(val));

  // Partner Auto-Detect
  const detectedPartner = useMemo(() => {
    if (linkedBusinessId) return null;
    const cleanPhone = phone.replace(/\D/g, "");
    const cleanName = name.trim().toLowerCase();
    if (cleanPhone.length >= 6) {
      return partnerDirectory.find((p) => p.phone && p.phone.replace(/\D/g, "").includes(cleanPhone)) || null;
    }
    if (cleanName.length >= 4) {
      return partnerDirectory.find((p) => p.name.toLowerCase().includes(cleanName) || p.slug.toLowerCase().includes(cleanName)) || null;
    }
    return null;
  }, [phone, name, linkedBusinessId, partnerDirectory]);

  const editDetectedPartner = useMemo(() => {
    if (editLinkedBusinessId) return null;
    const cleanPhone = editPhone.replace(/\D/g, "");
    const cleanName = editName.trim().toLowerCase();
    if (cleanPhone.length >= 6) {
      return partnerDirectory.find((p) => p.phone && p.phone.replace(/\D/g, "").includes(cleanPhone)) || null;
    }
    if (cleanName.length >= 4) {
      return partnerDirectory.find((p) => p.name.toLowerCase().includes(cleanName) || p.slug.toLowerCase().includes(cleanName)) || null;
    }
    return null;
  }, [editPhone, editName, editLinkedBusinessId, partnerDirectory]);

  const handleLinkPartner = (partner: SeyalProPartner, isEdit: boolean = false) => {
    if (isEdit) {
      setEditLinkedBusinessId(partner.id);
      setEditName(partner.name);
      if (partner.phone) setEditPhone(partner.phone.replace(/\D/g, "").slice(-10));
      if (partner.address) setEditAddress(partner.address);
    } else {
      setLinkedBusinessId(partner.id);
      setName(partner.name);
      if (partner.phone) setPhone(partner.phone.replace(/\D/g, "").slice(-10));
      if (partner.address) setAddress(partner.address);
    }
  };

  // Add / Edit / Remove Client Handlers
  const handleStartEdit = (cafe: CafeCustomer) => {
    setEditingCafe(cafe);
    setEditName(cafe.name);
    setEditPhone((cafe.phone || "").replace(/\D/g, "").slice(-10));
    setEditAddress(cafe.address || "");
    setEditLinkedBusinessId(cafe.business_id || "");
  };

  const handleSaveEditCafe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCafe || !editName.trim()) return;

    if (editPhone.trim() && editPhone.length !== 10) {
      toast({ title: "Invalid Phone Number", description: "Mobile number must be 10 digits.", variant: "error" });
      return;
    }

    const formattedPhone = editPhone.trim() ? `+91 ${editPhone.trim()}` : "";
    const oldName = editingCafe.name.trim();
    const newName = formatCafeName(editName.trim());

    const updatedStores = stores.map((s) =>
      s.id === editingCafe.id
        ? { ...s, name: newName, phone: formattedPhone, address: editAddress.trim(), business_id: editLinkedBusinessId || undefined }
        : s
    );

    setStores(updatedStores);
    updateB2BClient(bizId, {
      id: editingCafe.id,
      name: newName,
      phone: formattedPhone,
      address: editAddress.trim(),
      linked_business_id: editLinkedBusinessId || undefined,
    });

    if (oldName.toLowerCase() !== newName.toLowerCase()) {
      const updatedInvoices = invoices.map((inv) =>
        (inv.customerName || "").toLowerCase().trim() === oldName.toLowerCase() ? { ...inv, customerName: newName } : inv
      );
      setInvoices(updatedInvoices);
      try {
        localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(updatedInvoices));
      } catch {}
    }

    setEditingCafe(null);
    toast({ title: "Client Updated!", description: `${newName} details saved successfully.`, variant: "success" });
  };

  const handleSaveCafe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (phone.trim() && phone.length !== 10) {
      toast({ title: "Invalid Phone Number", description: "Mobile number must be 10 digits.", variant: "error" });
      return;
    }

    const formattedPhone = phone.trim() ? `+91 ${phone.trim()}` : "";
    const formattedName = formatCafeName(name.trim());

    const newSt = {
      id: `client-${Date.now()}`,
      name: formattedName,
      phone: formattedPhone,
      address: address.trim(),
      business_id: linkedBusinessId || undefined,
    };

    const updated = [newSt, ...stores];
    setStores(updated);
    saveB2BClient(bizId, {
      id: newSt.id,
      name: newSt.name,
      phone: newSt.phone,
      address: newSt.address,
      linked_business_id: newSt.business_id,
    });

    setIsModalOpen(false);
    setName("");
    setPhone("");
    setAddress("");
    setLinkedBusinessId("");
    toast({ title: "Client Added!", description: `${newSt.name} added to your partner network.`, variant: "success" });
  };

  const handleConfirmRemoveCafe = () => {
    if (!deletingCafe) return;
    const updated = stores.filter((s) => s.id !== deletingCafe.id);
    setStores(updated);
    deleteB2BClient(bizId, deletingCafe.id);
    toast({ title: "Client Removed", description: `${deletingCafe.name} removed from your list.` });
    setDeletingCafe(null);
  };

  // Helper to build chronological CombinedLedgerTransaction items from slips
  const buildTransactionsFromSlips = (slips: any[]): CombinedLedgerTransaction[] => {
    const list: CombinedLedgerTransaction[] = [];

    // Sort chronologically ascending
    const sorted = [...slips].sort((a, b) => getSlipDate(a).getTime() - getSlipDate(b).getTime());

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
  };

  // Trigger Combined Ledger PDF Export for a Client
  const handleExportCombinedPdf = (
    clientId: string,
    preset: "today" | "week" | "month" | "custom" | "all",
    customStart?: string,
    customEnd?: string
  ) => {
    const client = cafesWithLedger.find((c) => c.id === clientId || c.name.toLowerCase().trim() === clientId.toLowerCase().trim());
    if (!client) {
      toast({ title: "Client Not Found", description: "Please select a valid client.", variant: "error" });
      return;
    }

    const { start, end, label } = getDateRangeInterval(preset, customStart, customEnd);

    const matchingSlips = invoices.filter((inv) => {
      const invCustomer = (inv.customerName || "").toLowerCase().trim();
      if (invCustomer !== client.name.toLowerCase().trim()) return false;
      const slipDate = getSlipDate(inv);
      return slipDate >= start && slipDate <= end;
    });

    if (matchingSlips.length === 0) {
      toast({
        title: "No Transactions Found",
        description: `No delivery or return slips found for ${client.name} in this period (${label}).`,
        variant: "error",
      });
      return;
    }

    const transactions = buildTransactionsFromSlips(matchingSlips);

    const deliverySlips = matchingSlips.filter(
      (s) => !s.isReturn && !(s.invoiceNumber || "").startsWith("RET-") && (s.totalAmount || 0) >= 0
    );
    const returnSlips = matchingSlips.filter(
      (s) => s.isReturn || (s.invoiceNumber || "").startsWith("RET-") || (s.totalAmount || 0) < 0
    );

    const totalDeliveryValue = deliverySlips.reduce((acc, s) => acc + Math.abs(s.totalAmount || 0), 0);
    const totalReturnValue = returnSlips.reduce((acc, s) => acc + Math.abs(s.totalAmount || 0), 0);
    const netPeriodValue = totalDeliveryValue - totalReturnValue;

    const totalDeliveredQty = deliverySlips.reduce(
      (acc, s) => acc + (s.items || []).reduce((q: number, it: any) => q + (Number(it.qty) || 0), 0),
      0
    );
    const totalReturnedQty = returnSlips.reduce(
      (acc, s) => acc + (s.items || []).reduce((q: number, it: any) => q + (Number(it.qty) || 0), 0),
      0
    );

    const pdfData: CombinedLedgerPdfData = {
      businessName: business?.name || "SeyalPro Dispatch",
      businessPhone: business?.phone || "+91 98765 43210",
      businessAddress: business?.address || "OMR, Chennai",
      upiId: business?.upi_id?.trim() || "",
      mode: "client",
      entityName: client.name,
      phone: client.phone,
      address: client.address,
      periodLabel: label,
      exportDate: format(new Date(), "MMM dd, yyyy • hh:mm a"),
      totalDeliveredSlips: deliverySlips.length,
      totalDeliveredQty,
      totalDeliveryValue,
      totalReturnedSlips: returnSlips.length,
      totalReturnedQty,
      totalReturnValue,
      netPeriodValue,
      outstandingBalance: client.unpaidDues,
      transactions,
    };

    generateCombinedLedgerPdf(pdfData);

    toast({
      title: "Ledger Statement Exported! 📄",
      description: `Combined PDF downloaded for ${client.name} (${label}).`,
      variant: "success",
    });

    setIsExportModalOpen(false);
  };

  // Open Export Modal for a specific client
  const handleOpenExportModal = (clientId?: string) => {
    if (clientId) {
      setExportClientId(clientId);
    } else if (cafesWithLedger.length > 0) {
      setExportClientId(cafesWithLedger[0].id);
    }
    setExportDatePreset("month");
    setIsExportModalOpen(true);
  };

  // Live matching preview count inside Export Modal
  const exportPreviewMatchingSlips = useMemo(() => {
    if (!isExportModalOpen || !exportClientId) return [];
    const client = cafesWithLedger.find((c) => c.id === exportClientId || c.name.toLowerCase().trim() === exportClientId.toLowerCase().trim());
    if (!client) return [];

    const { start, end } = getDateRangeInterval(exportDatePreset, exportCustomStart, exportCustomEnd);
    return invoices.filter((inv) => {
      const invCustomer = (inv.customerName || "").toLowerCase().trim();
      if (invCustomer !== client.name.toLowerCase().trim()) return false;
      const slipDate = getSlipDate(inv);
      return slipDate >= start && slipDate <= end;
    });
  }, [isExportModalOpen, exportClientId, exportDatePreset, exportCustomStart, exportCustomEnd, invoices, cafesWithLedger]);

  const exportPreviewDeliveryCount = exportPreviewMatchingSlips.filter(
    (s) => !s.isReturn && !(s.invoiceNumber || "").startsWith("RET-") && (s.totalAmount || 0) >= 0
  ).length;
  const exportPreviewReturnCount = exportPreviewMatchingSlips.filter(
    (s) => s.isReturn || (s.invoiceNumber || "").startsWith("RET-") || (s.totalAmount || 0) < 0
  ).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* ==================================================== */}
      {/* TOP HEADER WITH SEARCH & EXPORT ACTION               */}
      {/* ==================================================== */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-700 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                  Client Ledgers
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 whitespace-nowrap">
                  {totalClientsCount} Active {totalClientsCount === 1 ? "Client" : "Clients"}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">
                View chronological deliveries, return credits, and export combined statements
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Top Action: Export Combined PDF Statement */}
            <button
              type="button"
              onClick={() => handleOpenExportModal()}
              className="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Export Combined Delivery & Return PDF Statement"
            >
              <FileDown size={14} className="text-blue-600 shrink-0" />
              <span className="hidden sm:inline">Export Statement PDF</span>
              <span className="sm:hidden">Export PDF</span>
            </button>

            <Link
              href="/b2b/payments"
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-1 shadow-2xs whitespace-nowrap shrink-0"
            >
              <span>Record Payment</span>
              <ArrowRight size={13} className="shrink-0 text-slate-400" />
            </Link>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={14} className="shrink-0" />
              <span>Add Client</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* ==================================================== */}
        {/* 1. OVERVIEW SUMMARY CARDS (4 METRIC CARDS)           */}
        {/* ==================================================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Clients */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Clients</p>
              <h3 className="text-xl sm:text-2xl font-black text-[#0F172A] mt-0.5">{totalClientsCount}</h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Commercial accounts</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold shrink-0">
              <Building2 size={18} />
            </div>
          </div>

          {/* Card 2: Lifetime Billed Sales */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Lifetime Billed</p>
              <h3 className="text-xl sm:text-2xl font-black text-[#0F172A] mt-0.5">₹{totalBilledAll.toLocaleString("en-IN")}</h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Total dispatch value</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold shrink-0">
              <Receipt size={18} />
            </div>
          </div>

          {/* Card 3: Total Outstanding Balance */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Outstanding Balance</p>
              <h3 className={cn(
                "text-xl sm:text-2xl font-black mt-0.5",
                totalOutstandingAll > 0 ? "text-rose-600" : "text-emerald-600"
              )}>
                ₹{totalOutstandingAll.toLocaleString("en-IN")}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {totalOutstandingAll > 0 ? "Pending collection" : "All clear"}
              </p>
            </div>
            <div className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center font-bold shrink-0",
              totalOutstandingAll > 0 ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
            )}>
              <AlertCircle size={18} />
            </div>
          </div>

          {/* Card 4: Pending Settlements */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Pending Settlements</p>
              <h3 className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">{totalPendingSettlementsCount} Slips</h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Unsettled deliveries</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-bold shrink-0">
              <Receipt size={18} />
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* SEARCH & STATUS FILTER BAR                           */}
        {/* ==================================================== */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Status Filter Pills */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  statusFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                All Statuses ({totalClientsCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("dues")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  statusFilter === "dues" ? "bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Pending Dues
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("settled")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  statusFilter === "settled" ? "bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                All Clear (Settled)
              </button>
            </div>

            {/* Quick Helper Note */}
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Click &ldquo;Ledger&rdquo; on any client to view chronological delivery and return slips
            </span>
          </div>

          {/* Search bar */}
          <div className="relative w-full">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client name, phone, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
        </div>

        {/* ==================================================== */}
        {/* CLIENT DIRECTORY (TABLE & MOBILE CARDS)              */}
        {/* ==================================================== */}
        <div className="space-y-3">
          {/* Mobile Card Feed */}
          <div className="md:hidden space-y-3">
            {filteredClients.map((c) => {
              const formattedName = formatCafeName(c.name);

              return (
                <div
                  key={c.id}
                  className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3 transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700 shrink-0">
                        <Building2 size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-extrabold text-sm text-[#0F172A] leading-snug truncate" title={formattedName}>
                            {formattedName}
                          </h4>
                          {c.business_id && (
                            <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                              ⚡ SeyalPro App
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#64748B] font-medium mt-0.5 truncate">
                          {c.phone && (
                            <span className="flex items-center gap-1 font-mono shrink-0 text-slate-600 font-semibold">
                              <Phone size={10} className="text-blue-500" /> {c.phone}
                            </span>
                          )}
                          {c.address && <span className="text-slate-400 truncate">· {c.address}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Top Action Button: Open Dedicated Ledger Page */}
                    <Link
                      href={`/b2b/customers/${encodeURIComponent(c.id)}`}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-extrabold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all flex items-center gap-1 shrink-0"
                      title="Open Dedicated Client Detailed Ledger Page"
                    >
                      <span>Ledger</span>
                      <ChevronRight size={13} />
                    </Link>
                  </div>

                  {/* Financial Stats Bar */}
                  <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Slips</span>
                      <span className="text-xs font-black text-[#0F172A] mt-0.5 block truncate">
                        {c.slipsCount}
                        {c.returnSlipsCount > 0 && <span className="text-[9.5px] text-amber-700 ml-0.5">({c.returnSlipsCount} ret)</span>}
                      </span>
                    </div>
                    <div className="min-w-0 border-l border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Billed</span>
                      <span className="text-xs font-extrabold text-slate-700 mt-0.5 block truncate">₹{c.totalBilled.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="min-w-0 border-l border-slate-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block truncate">Settled</span>
                      <span className="text-xs font-black text-emerald-600 mt-0.5 block truncate">₹{c.totalPaid.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="min-w-0 border-l border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Balance</span>
                      <span
                        className={cn(
                          "text-xs font-black mt-0.5 block truncate",
                          c.unpaidDues > 0 ? "text-rose-600" : "text-emerald-700"
                        )}
                      >
                        {c.unpaidDues > 0 ? `₹${c.unpaidDues.toLocaleString("en-IN")}` : "₹0"}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenExportModal(c.id)}
                        className="px-2 py-1 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                      >
                        <FileDown size={12} className="text-blue-600" />
                        <span>Export PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(c)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        title="Edit Client"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCafe(c)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Remove Client"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {c.unpaidDues > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                        Due Pending
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Settled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredClients.length === 0 && (
              <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] text-center text-[#64748B]">
                <p className="font-bold text-sm">No clients match your search.</p>
                <p className="text-xs text-slate-400 mt-1">Tap &ldquo;Add Client&rdquo; to register a new client account.</p>
              </div>
            )}
          </div>

          {/* Desktop Table View - 100% viewport width without horizontal scrolling */}
          <div className="hidden md:block bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
            <div className="w-full">
              <table className="w-full text-left border-collapse table-fixed">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[14%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10.5px] font-extrabold text-[#64748B] uppercase tracking-wider">
                    <th className="py-3 px-3">Client &amp; Contact</th>
                    <th className="py-3 px-3">Activity</th>
                    <th className="py-3 px-3">Billed (₹)</th>
                    <th className="py-3 px-3">Settled (₹)</th>
                    <th className="py-3 px-3">Balance Due</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                  {filteredClients.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-700 font-bold shrink-0">
                            <Building2 size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                href={`/b2b/customers/${encodeURIComponent(c.id)}`}
                                className="font-extrabold text-xs sm:text-sm text-[#0F172A] hover:text-blue-600 tracking-tight truncate font-sans transition-colors cursor-pointer"
                                title={formatCafeName(c.name)}
                              >
                                {formatCafeName(c.name)}
                              </Link>
                              {c.business_id && (
                                <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                  ⚡ App
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-medium mt-0.5 truncate">
                              {c.phone && (
                                <span className="flex items-center gap-0.5 font-mono shrink-0 text-slate-600 font-semibold text-[10.5px]">
                                  <Phone size={9} className="text-blue-500 shrink-0" /> {c.phone}
                                </span>
                              )}
                              {c.address && (
                                <span className="text-slate-400 truncate max-w-[130px] lg:max-w-[180px]" title={c.address}>
                                  · {c.address}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10.5px] font-bold border border-blue-200/60 whitespace-nowrap">
                            {c.deliverySlipsCount} del
                          </span>
                          {c.returnSlipsCount > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200/60 whitespace-nowrap">
                              {c.returnSlipsCount} ret
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-black text-xs sm:text-sm text-[#0F172A] whitespace-nowrap">
                        ₹{c.totalBilled.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-3 font-bold text-xs sm:text-sm text-emerald-600 whitespace-nowrap">
                        ₹{c.totalPaid.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {c.unpaidDues > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-rose-600 text-xs sm:text-sm whitespace-nowrap">
                              ₹{c.unpaidDues.toLocaleString("en-IN")}
                            </span>
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                              Due
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                            ✓ Settled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {/* Open Client Detail Ledger Button */}
                          <Link
                            href={`/b2b/customers/${encodeURIComponent(c.id)}`}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all flex items-center gap-0.5 whitespace-nowrap"
                            title="Open Dedicated Client Detailed Ledger Page"
                          >
                            <span>Ledger</span>
                            <ChevronRight size={12} />
                          </Link>

                          {/* Export PDF */}
                          <button
                            type="button"
                            onClick={() => handleOpenExportModal(c.id)}
                            className="p-1 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 transition cursor-pointer"
                            title="Export Client Combined PDF Statement"
                          >
                            <FileDown size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(c)}
                            className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition cursor-pointer"
                            title="Edit Client"
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingCafe(c)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Remove Client"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 2. CLIENT LEDGER DETAIL MODAL                        */}
      {/* ==================================================== */}
      {selectedClientDetail && (() => {
        const clientInvoices = invoices.filter(
          (inv) => (inv.customerName || "").toLowerCase().trim() === selectedClientDetail.name.toLowerCase().trim()
        );

        const { start, end, label } = getDateRangeInterval(detailDatePreset, detailCustomStart, detailCustomEnd);
        const filteredClientSlips = clientInvoices.filter((s) => {
          const d = getSlipDate(s);
          return d >= start && d <= end;
        });

        const clientTransactions = buildTransactionsFromSlips(filteredClientSlips);

        const periodDeliverySlips = filteredClientSlips.filter(
          (s) => !s.isReturn && !(s.invoiceNumber || "").startsWith("RET-") && (s.totalAmount || 0) >= 0
        );
        const periodReturnSlips = filteredClientSlips.filter(
          (s) => s.isReturn || (s.invoiceNumber || "").startsWith("RET-") || (s.totalAmount || 0) < 0
        );

        const periodDeliveryValue = periodDeliverySlips.reduce((acc, s) => acc + Math.abs(s.totalAmount || 0), 0);
        const periodReturnValue = periodReturnSlips.reduce((acc, s) => acc + Math.abs(s.totalAmount || 0), 0);
        const periodBilled = periodDeliveryValue - periodReturnValue;

        const periodPaid = periodDeliverySlips
          .filter((s) => s.status === "paid")
          .reduce((acc, s) => acc + (s.totalAmount || 0), 0);

        const periodUnpaid = periodDeliverySlips
          .filter((s) => s.status === "unpaid")
          .reduce((acc, s) => acc + (s.totalAmount || 0), 0);

        const isAllTime = detailDatePreset === "all";
        const billedLabel = isAllTime
          ? "Lifetime Billed"
          : detailDatePreset === "today"
          ? "Today's Billed"
          : detailDatePreset === "week"
          ? "7 Days Billed"
          : detailDatePreset === "month"
          ? "30 Days Billed"
          : "Period Billed";
        const paidLabel = isAllTime ? "Settled / Paid" : "Period Settled";
        const duesLabel = isAllTime ? "Outstanding Dues" : "Period Dues";
        const activityLabel = isAllTime ? "Total Activity" : "Period Activity";

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
              {/* Modal Top Header */}
              <div className="border-b border-slate-100 pb-3 shrink-0 space-y-2.5">
                {/* Row 1: Client Identity & Action Buttons */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold shrink-0">
                      <Building2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-black text-base sm:text-lg text-[#0F172A] leading-tight break-words">
                          {formatCafeName(selectedClientDetail.name)}
                        </h3>
                        {selectedClientDetail.business_id && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                            ⚡ App Linked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Export PDF & Close */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportCombinedPdf(selectedClientDetail.id, detailDatePreset, detailCustomStart, detailCustomEnd)}
                      className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                    >
                      <FileDown size={13} />
                      <span className="hidden sm:inline">Export Statement</span>
                      <span className="sm:hidden">PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedClientDetail(null)}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold cursor-pointer"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Row 2: Full-Width Contact Information Box (Zero column squeezing; spans 100% width) */}
                {(selectedClientDetail.phone || selectedClientDetail.address) && (
                  <div className="bg-slate-50/90 rounded-2xl p-2.5 sm:p-3 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-xs">
                    {selectedClientDetail.phone && (
                      <div className="flex items-center gap-1.5 font-mono font-bold text-slate-700 shrink-0">
                        <Phone size={12} className="text-blue-600 shrink-0" />
                        <span>{selectedClientDetail.phone}</span>
                      </div>
                    )}
                    {selectedClientDetail.phone && selectedClientDetail.address && (
                      <span className="hidden sm:inline text-slate-300">•</span>
                    )}
                    {selectedClientDetail.address && (
                      <div className="flex items-start gap-1.5 text-slate-600 text-[11px] sm:text-xs leading-relaxed min-w-0 flex-1">
                        <MapPin size={12} className="text-blue-600 shrink-0 mt-0.5" />
                        <span className="break-words">{selectedClientDetail.address}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto space-y-4 pr-1">
                {/* Date Filter Bar - Positioned at top for instant feedback */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-1.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="flex items-center gap-1 p-1 bg-white rounded-xl text-xs font-bold border border-slate-200 shadow-2xs overflow-x-auto max-w-full no-scrollbar">
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
                          "px-2.5 py-1 rounded-lg transition-all capitalize cursor-pointer shrink-0 whitespace-nowrap",
                          detailDatePreset === preset ? "bg-blue-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {preset === "all" ? "All Time" : preset === "week" ? "7 Days" : preset === "month" ? "30 Days" : preset}
                      </button>
                    ))}
                  </div>

                  <div className="text-[11px] sm:text-xs text-slate-500 font-medium px-2 flex items-center justify-between sm:justify-end gap-1 shrink-0">
                    <span>Showing <strong>{clientTransactions.length}</strong> items</span>
                    <span className="text-slate-400 text-[10px] sm:text-[11px]">({label})</span>
                  </div>
                </div>

                {/* UI-UX Pro Max: Clean Custom Date Range Calendar adhering to brand palette */}
                {detailDatePreset === "custom" && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-slate-50 border border-slate-200/90 shadow-2xs space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header Row: Title & Dynamic Window Pill */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                          <Calendar size={15} />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-[#0F172A] leading-tight flex items-center gap-1.5">
                            <span>Custom Statement Window</span>
                          </h4>
                          <p className="text-[11px] text-slate-500">Pick any custom range or tap a quick-pick preset</p>
                        </div>
                      </div>

                      {/* Dynamic Window Badge */}
                      <div className="shrink-0">
                        {customDaysCount === -1 ? (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shadow-2xs">
                            <AlertCircle size={12} className="text-rose-600" />
                            <span>Invalid Range</span>
                          </span>
                        ) : customDaysCount !== null && customDaysCount > 0 ? (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shadow-2xs">
                            <Sparkles size={11} className="text-blue-600" />
                            <span>{customDaysCount} {customDaysCount === 1 ? "Day" : "Days"} Selected</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Quick-Pick Smart Presets (1-Tap Selection) */}
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

                    {/* Twin Connected Date Inputs (Accessible & Touch-Optimized) */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                      {/* Start Date Box */}
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

                      {/* Directional Connector / Swap Button */}
                      <div className="flex items-center justify-center py-1 sm:py-0">
                        <button
                          type="button"
                          onClick={handleSwapDates}
                          title="Swap Start & End Dates"
                          className="w-8 h-8 rounded-full bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-blue-200 flex items-center justify-center font-bold text-xs shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        >
                          <ArrowRightLeft size={13} />
                        </button>
                      </div>

                      {/* End Date Box */}
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

                    {/* Inline Validation / Active Range Footer */}
                    {customDaysCount === -1 ? (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-800 animate-in fade-in">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertCircle size={14} className="text-rose-600 shrink-0" />
                          <span className="font-semibold truncate">Start date is after End date.</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSwapDates}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] hover:bg-rose-700 transition shrink-0 cursor-pointer"
                        >
                          Swap Dates
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 border-t border-slate-200/80">
                        <span className="truncate">
                          Filtered Window: <strong className="text-slate-800 font-bold">{detailCustomStart ? format(new Date(detailCustomStart), "MMM dd, yyyy") : "—"}</strong> to <strong className="text-slate-800 font-bold">{detailCustomEnd ? format(new Date(detailCustomEnd), "MMM dd, yyyy") : "—"}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailCustomEnd(format(new Date(), "yyyy-MM-dd"))}
                          className="text-blue-600 hover:text-blue-800 font-extrabold cursor-pointer hover:underline shrink-0 ml-2"
                        >
                          Set End to Today
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 4 Financial Stat Cards - Dynamically updated for the selected date period */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">{billedLabel}</span>
                    <span className="text-base sm:text-lg font-black text-[#0F172A] mt-0.5 block truncate">₹{periodBilled.toLocaleString("en-IN")}</span>
                    <span className="text-[10px] text-slate-400 font-medium mt-0.5 block truncate">
                      {isAllTime ? "All recorded dispatches" : (periodReturnValue > 0 ? `Net of ₹${periodReturnValue.toLocaleString("en-IN")} ret` : "In this period")}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block truncate">{paidLabel}</span>
                    <span className="text-base sm:text-lg font-black text-emerald-700 mt-0.5 block truncate">₹{periodPaid.toLocaleString("en-IN")}</span>
                    <span className="text-[10px] text-emerald-600 font-medium mt-0.5 block truncate">
                      {isAllTime ? "Total settled collections" : `${periodDeliverySlips.filter((s) => s.status === "paid").length} slips settled`}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80">
                    <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block truncate">{duesLabel}</span>
                    <span className={cn(
                      "text-base sm:text-lg font-black mt-0.5 block truncate",
                      periodUnpaid > 0 ? "text-rose-700" : "text-emerald-700"
                    )}>
                      ₹{periodUnpaid.toLocaleString("en-IN")}
                    </span>
                    <span className="text-[10px] text-rose-600 font-medium mt-0.5 block truncate">
                      {periodUnpaid > 0 ? `${periodDeliverySlips.filter((s) => s.status === "unpaid").length} slips unpaid` : "All clear in this period"}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200/80">
                    <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block truncate">{activityLabel}</span>
                    <span className="text-base sm:text-lg font-black text-blue-700 mt-0.5 block truncate">
                      {periodDeliverySlips.length} del {periodReturnSlips.length > 0 && `• ${periodReturnSlips.length} ret`}
                    </span>
                    <span className="text-[10px] text-blue-600 font-medium mt-0.5 block truncate">
                      {filteredClientSlips.length} slips in range
                    </span>
                  </div>
                </div>

                {/* Mobile View: Vertical Transaction Slip Cards (Zero horizontal scroll; all details visible) */}
                <div className="md:hidden space-y-2.5">
                  {filteredClientSlips.map((slip) => {
                    const isRet = Boolean(slip.isReturn || (slip.invoiceNumber || "").startsWith("RET-") || (slip.totalAmount || 0) < 0);
                    const items = slip.items && slip.items.length > 0 ? slip.items : null;
                    const absTotal = Math.abs(slip.totalAmount || 0);

                    return (
                      <div
                        key={slip.id || slip.invoiceNumber}
                        className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2"
                      >
                        {/* Header: Slip Ref, Type Badge, Status, and View Details Action */}
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
                              Date: <strong className="text-slate-600 font-semibold">{slip.date}</strong>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setViewingSlipDetails(slip)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition cursor-pointer shrink-0"
                            title="View Original Slip Details"
                          >
                            <Eye size={13} />
                          </button>
                        </div>

                        {/* Line Items List */}
                        {items && items.length > 0 ? (
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/60 divide-y divide-slate-200/50 space-y-1 text-xs">
                            {items.map((it: any, iIdx: number) => {
                              const qty = Number(it.qty) || 0;
                              const rate = Number(it.rate) || 0;
                              const itemAmt = Math.abs(it.amount || qty * rate);

                              return (
                                <div key={iIdx} className={cn("flex items-center justify-between gap-2", iIdx > 0 && "pt-1")}>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 truncate text-[11.5px]">
                                      {capitalizeWords(it.name || "Assorted Bakery")}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {qty} {it.unit || "pcs"} {rate > 0 ? `@ ₹${rate}` : ""}
                                    </p>
                                  </div>
                                  <span className={cn("font-bold text-xs shrink-0", isRet ? "text-amber-700" : "text-slate-800")}>
                                    {isRet ? "-" : ""}₹{itemAmt.toLocaleString("en-IN")}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                            <span>{isRet ? "Returned Item Credit" : "Bakery Dispatch"}</span>
                          </div>
                        )}

                        {/* Slip Total Footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                          <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                            {isRet ? "Credit Note Value" : "Slip Amount"}
                          </span>
                          <span className={cn("text-sm font-black", isRet ? "text-amber-700" : "text-blue-600")}>
                            {isRet ? `-₹${absTotal.toLocaleString("en-IN")}` : `₹${absTotal.toLocaleString("en-IN")}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {filteredClientSlips.length === 0 && (
                    <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="font-bold text-xs">No delivery or return slips recorded in this period.</p>
                    </div>
                  )}
                </div>

                {/* Desktop View: Chronological Transactions Table */}
                <div className="hidden md:block rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-extrabold text-slate-500 uppercase">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Slip Ref</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Product Description</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {clientTransactions.map((tx, idx) => {
                        const originalSlip = clientInvoices.find((s) => s.invoiceNumber === tx.slipNumber);

                        return (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{tx.date}</td>
                            <td className="py-2 px-3 font-mono font-bold text-blue-600 whitespace-nowrap">{tx.slipNumber}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase",
                                tx.isReturn ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                              )}>
                                {tx.isReturn ? "Return" : "Delivery"}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold">{tx.productName}</td>
                            <td className="py-2 px-3 text-center font-bold">{tx.qty} {tx.unit}</td>
                            <td className={cn("py-2 px-3 text-right font-black whitespace-nowrap", tx.isReturn ? "text-amber-700" : "text-[#0F172A]")}>
                              {tx.isReturn ? "-" : ""}₹{Math.abs(tx.amount).toLocaleString("en-IN")}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {originalSlip && (
                                <button
                                  type="button"
                                  onClick={() => setViewingSlipDetails(originalSlip)}
                                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                                  title="View Original Slip Details"
                                >
                                  <Eye size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {clientTransactions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No delivery or return slips found for this client in the selected date range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================================================== */}
      {/* 3. COMBINED PDF EXPORT MODAL                         */}
      {/* ==================================================== */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <FileDown size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0F172A]">Export Client Statement</h3>
                  <p className="text-[11px] text-[#64748B]">Itemized deliveries, returns &amp; account ledger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Client Selector Dropdown */}
              <div>
                <label className="text-[11px] font-extrabold text-slate-700 block mb-1 uppercase tracking-wider">
                  Select Client Account
                </label>
                <select
                  value={exportClientId}
                  onChange={(e) => setExportClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {cafesWithLedger.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatCafeName(c.name)} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Presets */}
              <div>
                <label className="text-[11px] font-extrabold text-slate-700 block mb-1 uppercase tracking-wider">
                  Statement Period
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl font-bold">
                  {(["today", "week", "month", "all", "custom"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setExportDatePreset(preset)}
                      className={cn(
                        "py-1.5 px-2 rounded-lg transition capitalize text-[11px] cursor-pointer",
                        exportDatePreset === preset ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600"
                      )}
                    >
                      {preset === "today"
                        ? "Daily (Today)"
                        : preset === "week"
                        ? "Weekly (7d)"
                        : preset === "month"
                        ? "Monthly (30d)"
                        : preset === "all"
                        ? "All Time"
                        : "Custom Range"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Pickers */}
              {exportDatePreset === "custom" && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">From Date</label>
                      <input
                        type="date"
                        value={exportCustomStart}
                        onChange={(e) => setExportCustomStart(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">To Date</label>
                      <input
                        type="date"
                        value={exportCustomEnd}
                        onChange={(e) => setExportCustomEnd(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border bg-white font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Live Counter Preview */}
              <div className={cn(
                "p-3 rounded-2xl border text-xs flex items-center justify-between gap-2",
                exportPreviewMatchingSlips.length > 0 ? "bg-blue-50/70 border-blue-200 text-blue-950" : "bg-amber-50 border-amber-200 text-amber-900"
              )}>
                <div className="min-w-0">
                  <p className="font-extrabold">
                    {exportPreviewMatchingSlips.length > 0
                      ? `✓ ${exportPreviewMatchingSlips.length} Slips Found in Range`
                      : "⚠️ No Slips in This Period"}
                  </p>
                  <p className="text-[10.5px] opacity-80 mt-0.5">
                    {exportPreviewMatchingSlips.length > 0
                      ? `${exportPreviewDeliveryCount} delivery slips • ${exportPreviewReturnCount} return credit slips`
                      : "Try selecting a broader date range or choose All Time."}
                  </p>
                </div>
                <span className="font-mono font-black text-sm shrink-0">
                  {exportPreviewMatchingSlips.length}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exportPreviewMatchingSlips.length === 0}
                onClick={() => handleExportCombinedPdf(exportClientId, exportDatePreset, exportCustomStart, exportCustomEnd)}
                className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              >
                <Download size={14} />
                <span>Download PDF Statement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 4. ORIGINAL SLIP DETAILS MODAL                       */}
      {/* ==================================================== */}
      {viewingSlipDetails && (() => {
        const isRet = Boolean(
          viewingSlipDetails.isReturn ||
          (viewingSlipDetails.invoiceNumber || "").startsWith("RET-") ||
          (viewingSlipDetails.totalAmount || 0) < 0
        );
        const absTotal = Math.abs(viewingSlipDetails.totalAmount || 0);

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {isRet ? "Return & Credit Slip" : "Delivery Slip"}
                    </span>
                    {isRet && (
                      <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                        Credit Note
                      </span>
                    )}
                  </div>
                  <h3 className={cn("font-black text-base", isRet ? "text-amber-800" : "text-[#0F172A]")}>
                    {viewingSlipDetails.invoiceNumber}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingSlipDetails(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
                <p><strong className="text-slate-700">{isRet ? "Returned From:" : "Delivered To:"}</strong> {viewingSlipDetails.customerName}</p>
                <p><strong className="text-slate-700">Date:</strong> {viewingSlipDetails.date}</p>
                <p><strong className="text-slate-700">Phone:</strong> {viewingSlipDetails.customerPhone || "N/A"}</p>
                <p><strong className="text-slate-700">Status:</strong> {isRet ? "Deducted from Account Ledger" : viewingSlipDetails.status === "paid" ? "Settled (Paid)" : "Pending Dues"}</p>
              </div>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                {(viewingSlipDetails.items || []).map((it: any, idx: number) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                    <span>{it.qty}x {capitalizeWords(it.name)}</span>
                    <span className={cn("font-bold", isRet ? "text-amber-700" : "text-[#0F172A]")}>
                      {isRet ? "-" : ""}₹{Math.abs((it.amount || it.qty * it.rate) || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-sm font-black pt-1">
                <span>{isRet ? "Total Credit Amount:" : "Total Amount:"}</span>
                <span className={cn("text-base", isRet ? "text-amber-700" : "text-blue-600")}>
                  {isRet ? `-₹${absTotal.toLocaleString("en-IN")}` : `₹${absTotal.toLocaleString("en-IN")}`}
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const pdfData: BillPdfData = {
                      orderId: viewingSlipDetails.invoiceNumber,
                      invoiceTitle: isRet ? "RETURN & CREDIT SLIP" : "DELIVERY SLIP",
                      businessName: business?.name || "Dispatch Central",
                      businessPhone: business?.phone || "+91 98765 43210",
                      customerName: viewingSlipDetails.customerName,
                      customerPhone: viewingSlipDetails.customerPhone,
                      date: viewingSlipDetails.date,
                      items: (viewingSlipDetails.items || []).map((it: any) => ({
                        ...it,
                        amount: Math.abs(it.amount || it.qty * it.rate),
                      })),
                      subtotal: absTotal,
                      totalAmount: absTotal,
                      paymentMode: isRet ? "Adjusted / Deducted from Balance" : "Pending Settlement",
                    };
                    generateBillPdf(pdfData);
                  }}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-xs",
                    isRet ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  <Download size={14} />
                  <span>Download Slip PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const phoneClean = (viewingSlipDetails.customerPhone || "").replace(/[^0-9]/g, "");
                    const items = viewingSlipDetails.items || [];
                    const itemsText = items.map((it: any) => `• ${it.qty}x ${it.name} = ₹${Math.abs(it.amount || it.qty * it.rate)}`).join("\n");
                    const msg = `*${isRet ? "RETURN SLIP" : "DELIVERY SLIP"} - ${business?.name || "SeyalPro"}*\nSlip: ${viewingSlipDetails.invoiceNumber}\nDate: ${viewingSlipDetails.date}\nClient: ${viewingSlipDetails.customerName}\n\n*Items:*\n${itemsText}\n\n*Total:* ${isRet ? "-" : ""}₹${absTotal}`;
                    const waUrl = phoneClean
                      ? `https://wa.me/${phoneClean.startsWith("91") ? phoneClean : `91${phoneClean}`}?text=${encodeURIComponent(msg)}`
                      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                    window.open(waUrl, "_blank");
                  }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-extrabold bg-[#16A34A] hover:bg-[#15803D] text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send size={14} />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================================================== */}
      {/* 5. EDIT CLIENT MODAL                                 */}
      {/* ==================================================== */}
      {editingCafe && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <Edit3 size={16} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0F172A]">Edit Client</h3>
                  <p className="text-[11px] text-[#64748B]">Update client name, contact &amp; address</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCafe(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditCafe} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Client Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metro Retail or Chai Kings"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#0F172A]">WhatsApp Mobile Number *</label>
                  <span className={cn(
                    "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
                    editPhone.length === 10 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                  )}>
                    {editPhone.length}/10 digits
                  </span>
                </div>
                <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 bg-white">
                  <div className="px-2.5 py-2 bg-slate-50 border-r border-slate-200 flex items-center gap-1 text-xs font-bold text-slate-700 shrink-0">
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={editPhone}
                    onChange={(e) => handleEditPhoneChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold text-[#0F172A] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Client Delivery Address</label>
                <input
                  type="text"
                  placeholder="Navalur OMR, Chennai"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* SeyalPro App Linking */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span>⚡ Link SeyalPro Client</span>
                  </label>
                  {editLinkedBusinessId && (
                    <button
                      type="button"
                      onClick={() => setEditLinkedBusinessId("")}
                      className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                    >
                      Unlink
                    </button>
                  )}
                </div>

                {editDetectedPartner && !editLinkedBusinessId && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-blue-900 truncate">Partner Detected: {editDetectedPartner.name}</p>
                      <p className="text-[10px] text-blue-600">On SeyalPro app</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLinkPartner(editDetectedPartner, true)}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[11px] hover:bg-blue-700 shadow-2xs shrink-0 cursor-pointer"
                    >
                      Link &amp; Fill
                    </button>
                  </div>
                )}

                <select
                  value={editLinkedBusinessId}
                  onChange={(e) => {
                    const sId = e.target.value;
                    setEditLinkedBusinessId(sId);
                    const matched = partnerDirectory.find((p) => p.id === sId);
                    if (matched) {
                      setEditName(matched.name);
                      if (matched.phone) setEditPhone(matched.phone.replace(/\D/g, "").slice(-10));
                      if (matched.address) setEditAddress(matched.address);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- External Client (WhatsApp &amp; PDF only) --</option>
                  {partnerDirectory.map((p) => (
                    <option key={p.id} value={p.id}>
                      ⚡ {p.name} {p.phone ? `(${p.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCafe(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer shadow-xs"
                >
                  Update Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 6. DELETE CLIENT CONFIRMATION MODAL                  */}
      {/* ==================================================== */}
      {deletingCafe && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-base text-[#0F172A]">Remove Client?</h3>
              <p className="text-xs text-[#64748B]">
                Are you sure you want to remove <strong className="text-[#0F172A]">{deletingCafe.name}</strong> from your partner client list?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCafe(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveCafe}
                className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 transition cursor-pointer shadow-xs"
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 7. ADD NEW CLIENT MODAL                              */}
      {/* ==================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-extrabold text-base text-[#0F172A]">New Client</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCafe} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Client Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metro Retail or Chai Kings"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#0F172A]">WhatsApp Mobile Number *</label>
                  <span className={cn(
                    "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
                    phone.length === 10 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                  )}>
                    {phone.length}/10 digits
                  </span>
                </div>
                <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 bg-white">
                  <div className="px-2.5 py-2 bg-slate-50 border-r border-slate-200 flex items-center gap-1 text-xs font-bold text-slate-700 shrink-0">
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold text-[#0F172A] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Client Delivery Address</label>
                <input
                  type="text"
                  placeholder="Navalur OMR, Chennai"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* SeyalPro App Linking */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span>⚡ Link SeyalPro Client</span>
                  </label>
                  {linkedBusinessId && (
                    <button
                      type="button"
                      onClick={() => setLinkedBusinessId("")}
                      className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                    >
                      Unlink
                    </button>
                  )}
                </div>

                {detectedPartner && !linkedBusinessId && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-blue-900 truncate">Partner Detected: {detectedPartner.name}</p>
                      <p className="text-[10px] text-blue-600">On SeyalPro app</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLinkPartner(detectedPartner)}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[11px] hover:bg-blue-700 shadow-2xs shrink-0 cursor-pointer"
                    >
                      Link &amp; Fill
                    </button>
                  </div>
                )}

                <select
                  value={linkedBusinessId}
                  onChange={(e) => {
                    const sId = e.target.value;
                    setLinkedBusinessId(sId);
                    const matched = partnerDirectory.find((p) => p.id === sId);
                    if (matched) {
                      setName(matched.name);
                      if (matched.phone) setPhone(matched.phone.replace(/\D/g, "").slice(-10));
                      if (matched.address) setAddress(matched.address);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- External Client (WhatsApp &amp; PDF only) --</option>
                  {partnerDirectory.map((p) => (
                    <option key={p.id} value={p.id}>
                      ⚡ {p.name} {p.phone ? `(${p.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer shadow-xs"
                >
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
