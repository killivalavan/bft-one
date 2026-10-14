"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { generateStatementPdf } from "@/lib/utils/statementPdf";
import { formatCafeName, DEFAULT_BAKER_SAMPLE_STORES, sanitizeBakerStores } from "@/lib/utils/bakerUtils";
import {
  fetchB2BClients,
  saveB2BClient,
  updateB2BClient,
  deleteB2BClient,
  B2B_CUSTOMERS_UPDATED_EVENT,
} from "@/lib/services/b2bClients";
import {
  Store, Plus, Phone, MapPin, Receipt, ArrowRight,
  Search, CheckCircle2, AlertCircle,
  Trash2, Edit3, FileDown, FileText
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
}

interface SeyalProPartner {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
}

export default function BakerCustomersPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  const [stores, setStores] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentsHistory, setPaymentsHistory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingCafe, setDeletingCafe] = useState<CafeCustomer | null>(null);

  // SeyalPro Partner Directory for Linking
  const [partnerDirectory, setPartnerDirectory] = useState<SeyalProPartner[]>([]);

  // Add Cafe Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [linkedBusinessId, setLinkedBusinessId] = useState<string>("");

  // Edit Cafe Modal
  const [editingCafe, setEditingCafe] = useState<CafeCustomer | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLinkedBusinessId, setEditLinkedBusinessId] = useState<string>("");

  // Load Data
  useEffect(() => {
    // 1. Initial immediate load from local cache to avoid flicker
    try {
      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) {
        const parsed = JSON.parse(storedCusts);
        const cleaned = sanitizeBakerStores(parsed);
        if (cleaned.length > 0) {
          setStores(cleaned);
        }
      }

      // 2. Invoices
      const storedInvs = localStorage.getItem(`bftone_invoices_${bizId}`);
      if (storedInvs) {
        setInvoices(JSON.parse(storedInvs));
      }

      // 3. Payments
      const storedPayments = localStorage.getItem(`bftone_baker_payments_${bizId}`);
      if (storedPayments) {
        setPaymentsHistory(JSON.parse(storedPayments));
      }
    } catch {}

    // Fetch latest B2B clients from server (ensures incognito & mobile are in sync)
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

    // Load registered SeyalPro partner businesses for linking
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

    // Online fetch from Supabase
    if (business?.id) {
      supabaseClient.from("invoices").select("*").eq("business_id", business.id).then(({ data }) => {
        if (data && data.length > 0) {
          const mapped = data.map((d: any) => ({
            id: d.id,
            invoiceNumber: d.invoice_number,
            customerName: d.customer_name,
            totalAmount: (d.total_cents || 0) / 100,
            status: d.status || "unpaid",
            date: d.invoice_date || format(new Date(), "MMM dd, yyyy"),
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

  // Compute Cafe Ledger
  const cafesWithLedger: CafeCustomer[] = useMemo(() => {
    return stores.map((st) => {
      const storeInvoices = invoices.filter(
        (inv) => (inv.customerName || "").toLowerCase().trim() === st.name.toLowerCase().trim()
      );

      const totalBilled = storeInvoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
      const unpaidDues = storeInvoices
        .filter((inv) => inv.status === "unpaid")
        .reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
      const totalPaid = totalBilled - unpaidDues;

      return {
        id: st.id,
        name: st.name,
        phone: st.phone,
        address: st.address,
        business_id: st.business_id,
        totalBilled,
        totalPaid,
        unpaidDues,
        slipsCount: storeInvoices.length,
      };
    });
  }, [stores, invoices]);

  const filteredCafes = cafesWithLedger.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.phone && c.phone.includes(searchQuery))
  );

  const totalOutstandingAll = cafesWithLedger.reduce((acc, c) => acc + c.unpaidDues, 0);
  const totalBilledAll = cafesWithLedger.reduce((acc, c) => acc + c.totalBilled, 0);

  // Phone change handler enforcing max 10 digits for India (+91)
  const sanitize10Digits = (val: string) => {
    let digits = val.replace(/\D/g, "");
    if (digits.startsWith("91") && digits.length > 10) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0") && digits.length > 10) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }
    return digits;
  };

  const handlePhoneChange = (val: string) => {
    setPhone(sanitize10Digits(val));
  };

  const handleEditPhoneChange = (val: string) => {
    setEditPhone(sanitize10Digits(val));
  };

  // Auto-detection of SeyalPro partners while typing phone or name
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
      if (partner.phone) {
        setEditPhone(partner.phone.replace(/\D/g, "").slice(-10));
      }
      if (partner.address) setEditAddress(partner.address);
    } else {
      setLinkedBusinessId(partner.id);
      setName(partner.name);
      if (partner.phone) {
        setPhone(partner.phone.replace(/\D/g, "").slice(-10));
      }
      if (partner.address) setAddress(partner.address);
    }
  };

  // Start Edit
  const handleStartEdit = (cafe: CafeCustomer) => {
    setEditingCafe(cafe);
    setEditName(cafe.name);
    const existingDigits = (cafe.phone || "").replace(/\D/g, "");
    setEditPhone(existingDigits.slice(-10));
    setEditAddress(cafe.address || "");
    setEditLinkedBusinessId(cafe.business_id || "");
  };

  // Save Edit Cafe
  const handleSaveEditCafe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCafe || !editName.trim()) return;

    if (editPhone.trim() && editPhone.length !== 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Indian mobile number must be exactly 10 digits.",
        variant: "error",
      });
      return;
    }

    const formattedPhone = editPhone.trim() ? `+91 ${editPhone.trim()}` : "";
    const oldName = editingCafe.name.trim();
    const newName = formatCafeName(editName.trim());

    const updatedStores = stores.map((s) =>
      s.id === editingCafe.id
        ? {
            ...s,
            name: newName,
            phone: formattedPhone,
            address: editAddress.trim(),
            business_id: editLinkedBusinessId || undefined,
          }
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

    // If store name changed, update historical invoices so ledger stays consistent
    if (oldName.toLowerCase() !== newName.toLowerCase()) {
      const updatedInvoices = invoices.map((inv) =>
        (inv.customerName || "").toLowerCase().trim() === oldName.toLowerCase()
          ? { ...inv, customerName: newName }
          : inv
      );
      setInvoices(updatedInvoices);
      try {
        localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(updatedInvoices));
      } catch {}
    }

    setEditingCafe(null);
    toast({
      title: "Store / Client Updated!",
      description: `${newName} details saved successfully.${editLinkedBusinessId ? " Linked to SeyalPro partner network." : ""}`,
      variant: "success",
    });
  };

  // Save New Cafe
  const handleSaveCafe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (phone.trim() && phone.length !== 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Indian mobile number must be exactly 10 digits.",
        variant: "error",
      });
      return;
    }

    const formattedPhone = phone.trim() ? `+91 ${phone.trim()}` : "";
    const formattedName = formatCafeName(name.trim());

    const newSt = {
      id: `store-${Date.now()}`,
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
    toast({
      title: "Store / Client Added!",
      description: `${newSt.name} added.${newSt.business_id ? " Linked to SeyalPro partner network." : ""}`,
    });
  };

  // Remove Cafe
  const handleConfirmRemoveCafe = () => {
    if (!deletingCafe) return;
    const updated = stores.filter((s) => s.id !== deletingCafe.id);
    setStores(updated);
    deleteB2BClient(bizId, deletingCafe.id);
    toast({
      title: "Store / Client Removed",
      description: `${deletingCafe.name} removed from your store list.`,
    });
    setDeletingCafe(null);
  };

  // Generate & Download Comprehensive Statement PDF
  const handleDownloadStatementPdf = (cafe: CafeCustomer) => {
    const cafeInvoices = invoices.filter(
      (inv) => (inv.customerName || "").toLowerCase().trim() === cafe.name.toLowerCase().trim()
    );

    const cafePayments = paymentsHistory.filter(
      (p) => (p.storeName || "").toLowerCase().trim() === cafe.name.toLowerCase().trim()
    );

    generateStatementPdf({
      businessName: business?.name || "Dispatch Central",
      businessPhone: business?.phone || "+91 98765 43210",
      businessAddress: business?.address || "OMR, Chennai",
      customerName: cafe.name,
      customerPhone: cafe.phone,
      customerAddress: cafe.address,
      date: format(new Date(), "MMM dd, yyyy"),
      totalBilled: cafe.totalBilled,
      totalPaid: cafe.totalPaid,
      outstandingBalance: cafe.unpaidDues,
      invoices: cafeInvoices,
      payments: cafePayments,
      upiId: business?.upi_id?.trim() || "",
    });

    toast({
      title: "Statement PDF Downloaded! 📄",
      description: `Itemized statement of account downloaded for ${cafe.name}.`,
      variant: "success",
    });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Top Header */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              <Store size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">Client &amp; Store Ledgers</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200 shrink-0 whitespace-nowrap">
                  {cafesWithLedger.length} Accounts &amp; Stores
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">Track store balances, delivery history, and download itemized account statements</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/b2b/payments"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
            >
              <span>Record Payment</span>
              <ArrowRight size={13} className="shrink-0" />
            </Link>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={14} className="shrink-0" />
              <span>Add Client / Store</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Outstanding Dues</p>
              <h3 className="text-2xl font-black text-rose-600 mt-0.5">₹{totalOutstandingAll.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-rose-600/80 font-semibold mt-1">Pending payment across cafes</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <AlertCircle size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Lifetime Billed Sales</p>
              <h3 className="text-2xl font-black text-[#0F172A] mt-0.5">₹{totalBilledAll.toLocaleString("en-IN")}</h3>
              <p className="text-xs text-emerald-600 font-semibold mt-1">Total value of all delivery slips</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Receipt size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Active Store Partners</p>
              <h3 className="text-2xl font-black text-[#0F172A] mt-0.5">{cafesWithLedger.length} Accounts</h3>
              <p className="text-xs text-[#64748B] font-semibold mt-1">Commercial clients &amp; delivery points</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Store size={20} />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search client or store by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
          <span className="text-xs text-[#64748B] font-semibold">
            Showing <strong className="text-[#0F172A]">{filteredCafes.length}</strong> stores
          </span>
        </div>

        {/* MOBILE VIEW: Vertical Card Feed (Zero horizontal scrolling; scroll vertically to view all details) */}
        <div className="md:hidden space-y-3">
          {filteredCafes.map((c) => {
            const formattedName = formatCafeName(c.name);
            return (
              <div
                key={c.id}
                className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3 transition-all"
              >
                {/* Header: Icon, Name, App Badge, and Action Buttons */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700 shrink-0">
                      <Store size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-sm text-[#0F172A] leading-snug truncate" title={formattedName}>
                          {formattedName}
                        </h4>
                        {c.business_id ? (
                          <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                            ⚡ SeyalPro App
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded-md text-[9px] font-semibold text-slate-400 bg-slate-100 border border-slate-200">
                            External
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

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadStatementPdf(c)}
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 border border-blue-200/80 transition-all cursor-pointer"
                      title="Download Statement PDF"
                    >
                      <FileText size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(c)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200/60 transition-all cursor-pointer"
                      title="Edit Store"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingCafe(c)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/60 transition-all cursor-pointer"
                      title="Delete Store"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 4-Stat Financial Grid (All metrics visible vertically) */}
                <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Slips</span>
                    <span className="text-xs font-black text-[#0F172A] mt-0.5 block truncate">{c.slipsCount}</span>
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

                {/* Status bar */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400 font-medium">Account Status</span>
                  {c.unpaidDues > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                      Due Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Settled (All Paid)
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredCafes.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] text-center text-[#64748B]">
              <p className="font-bold text-sm">No partner stores found.</p>
              <p className="text-xs text-slate-400 mt-1">Tap &ldquo;Add Client Store&rdquo; to register new stores.</p>
            </div>
          )}
        </div>

        {/* DESKTOP VIEW: Café Directory & Ledgers Table */}
        <div className="hidden md:block bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3.5 px-4 min-w-[220px]">Client / Store &amp; Contact</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Deliveries</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Total Billed (₹)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Total Settled (₹)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Pending Balance (₹)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                {filteredCafes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-100/60 border border-blue-200/60 flex items-center justify-center text-blue-700 font-bold shrink-0">
                          <Store size={15} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-extrabold text-sm text-[#0F172A] tracking-tight whitespace-nowrap font-sans">
                              {formatCafeName(c.name)}
                            </p>
                            {c.business_id ? (
                              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1 shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                                ⚡ SeyalPro App
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-semibold text-slate-400 bg-slate-100 border border-slate-200">
                                External
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#64748B] font-medium mt-0.5 whitespace-nowrap">
                            {c.phone && <span className="flex items-center gap-1 font-mono shrink-0 whitespace-nowrap text-slate-600 font-semibold"><Phone size={10} className="text-blue-500" /> {c.phone}</span>}
                            {c.address && <span className="flex items-center gap-1 text-slate-400 whitespace-nowrap">· {c.address}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold whitespace-nowrap">
                        {c.slipsCount} slips
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-[#0F172A] whitespace-nowrap">
                      ₹{c.totalBilled.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600 whitespace-nowrap">
                      ₹{c.totalPaid.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {c.unpaidDues > 0 ? (
                        <span className="font-black text-rose-600 text-sm whitespace-nowrap">
                          ₹{c.unpaidDues.toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-600 text-xs whitespace-nowrap">
                          ₹0 (All Paid)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {c.unpaidDues > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap shrink-0">
                          Due Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
                          Settled
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownloadStatementPdf(c)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title="Download Comprehensive Statement PDF with item purchases"
                        >
                          <FileText size={13} />
                          <span>Statement</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(c)}
                          className="px-2 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title={`Edit ${c.name} details & phone number`}
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCafe(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                          title={`Remove ${c.name} from store list`}
                        >
                          <Trash2 size={14} />
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

      {/* Edit Cafe Modal */}
      {editingCafe && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Edit3 size={16} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0F172A]">Edit Client / Store</h3>
                  <p className="text-[11px] text-[#64748B]">Update store name, contact & address</p>
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
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Client / Store Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metro Retail or Corner Hub"
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
                <p className="text-[10px] text-slate-400 mt-1">
                  {editPhone.length === 10
                    ? "✓ Valid 10-digit Indian phone number"
                    : "Strictly 10 digits required for India (+91)"}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Store Delivery Address</label>
                <input
                  type="text"
                  placeholder="Navalur OMR, Chennai"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* SeyalPro App Linking Section */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span>⚡ Link SeyalPro Store</span>
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
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs animate-in fade-in">
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
                      if (matched.phone) {
                        setEditPhone(matched.phone.replace(/\D/g, "").slice(-10));
                      }
                      if (matched.address) setEditAddress(matched.address);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- External Store (WhatsApp &amp; PDF only) --</option>
                  {partnerDirectory.map((p) => (
                    <option key={p.id} value={p.id}>
                      ⚡ {p.name} {p.phone ? `(${p.phone})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10.5px] text-slate-500 leading-snug">
                  {editLinkedBusinessId
                    ? "✓ Connected: This client will receive live in-app announcements & 1-click B2B inventory sync!"
                    : "Tip: Connect to a SeyalPro client to deliver live in-app advisories & instant stock sync."}
                </p>
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
                  Update Client / Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCafe && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-base text-[#0F172A]">Remove Café?</h3>
              <p className="text-xs text-[#64748B]">
                Are you sure you want to remove <strong className="text-[#0F172A]">{deletingCafe.name}</strong> from your partner store list?
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

      {/* Add Cafe Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-extrabold text-base text-[#0F172A]">New Client / Store</h3>
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
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Client / Store Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metro Retail or Corner Hub"
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
                <p className="text-[10px] text-slate-400 mt-1">
                  {phone.length === 10
                    ? "✓ Valid 10-digit Indian phone number"
                    : "Strictly 10 digits required for India (+91)"}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Store Delivery Address</label>
                <input
                  type="text"
                  placeholder="Navalur OMR, Chennai"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* SeyalPro App Linking Section */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span>⚡ Link SeyalPro Store</span>
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
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs animate-in fade-in">
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
                      if (matched.phone) {
                        setPhone(matched.phone.replace(/\D/g, "").slice(-10));
                      }
                      if (matched.address) setAddress(matched.address);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- External Store (WhatsApp &amp; PDF only) --</option>
                  {partnerDirectory.map((p) => (
                    <option key={p.id} value={p.id}>
                      ⚡ {p.name} {p.phone ? `(${p.phone})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10.5px] text-slate-500 leading-snug">
                  {linkedBusinessId
                    ? "✓ Connected: This client will receive live in-app announcements & 1-click B2B inventory sync!"
                    : "Tip: Connect to a SeyalPro client to deliver live in-app advisories & instant stock sync."}
                </p>
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
                  Save Client / Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
