"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format } from "date-fns";
import {
  Send, Plus, Minus, Download, Store, Package, Sparkles, CheckCircle2,
  Calendar, RefreshCw, AlertCircle, ArrowRight, Phone, MapPin, Search,
  FileText, History, Check, Eye, Trash2, CreditCard, RotateCcw, X
} from "lucide-react";
import { generateBillPdf, BillPdfData } from "@/lib/utils/billPdf";
import { putItem, STORES, LocalInvoice } from "@/lib/offline/db";
import { BakerProduct, INITIAL_BAKER_PRODUCTS, capitalizeWords, normalizeBakerProduct } from "../products/page";
import { formatCafeName, DEFAULT_BAKER_SAMPLE_STORES, sanitizeBakerStores } from "@/lib/utils/bakerUtils";
import { fetchB2BClients, saveB2BClient, B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";
import { generateWhatsAppSlipMessage } from "@/lib/utils/b2bSlipWhatsapp";
import { useB2BWorkspace, useCreateDispatchMutation } from "@/lib/hooks/useB2BData";
import { useSearchParams } from "next/navigation";

interface BakerStore {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  business_id?: string;
}

export default function BakerDispatchPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const bizId = business?.id || "default";

  // Authoritative cloud workspace data & mutation hook via TanStack Query
  const { data: cloudWorkspace } = useB2BWorkspace(bizId);
  const createDispatchMutation = useCreateDispatchMutation(bizId);

  // Tab State: "entry" (Delivery) | "return" (Return Intake) | "history" (Saved Slips)
  const [activeTab, setActiveTab] = useState<"entry" | "return" | "history">(() => {
    if (tabParam === "history") return "history";
    if (tabParam === "return") return "return";
    return "entry";
  });

  const isReturnMode = activeTab === "return";
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (tabParam === "history") {
      setActiveTab("history");
    } else if (tabParam === "return") {
      setActiveTab("return");
    } else if (tabParam === "entry") {
      setActiveTab("entry");
    }
  }, [tabParam]);

  // Stores
  const [stores, setStores] = useState<BakerStore[]>(DEFAULT_BAKER_SAMPLE_STORES);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [storeSearch, setStoreSearch] = useState("");

  // Add Store Modal State
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStorePhone, setNewStorePhone] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");

  // Products
  const [products, setProducts] = useState<BakerProduct[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Invoices / Saved Delivery Slips
  const [savedInvoices, setSavedInvoices] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [createdSlipModal, setCreatedSlipModal] = useState<any | null>(null);
  const [viewingSlipDetails, setViewingSlipDetails] = useState<any | null>(null);

  // Load Products, Stores & Past Invoices
  useEffect(() => {
    try {
      // 1. Products
      const storedProds = localStorage.getItem(`bftone_baker_products_${bizId}`);
      if (storedProds) {
        const parsed = JSON.parse(storedProds);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed.map(normalizeBakerProduct).filter((p: BakerProduct) => p.is_active));
        } else {
          setProducts(INITIAL_BAKER_PRODUCTS.map(normalizeBakerProduct));
        }
      } else {
        setProducts(INITIAL_BAKER_PRODUCTS.map(normalizeBakerProduct));
      }

      // 2. Stores (Baker's own B2B client customer shops)
      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) {
        const parsed = JSON.parse(storedCusts);
        const cleaned = sanitizeBakerStores(parsed);
        if (cleaned.length > 0) {
          setStores(cleaned);
        }
      }

      // 3. Saved Invoices
      const storedInvs = localStorage.getItem(`bftone_invoices_${bizId}`);
      if (storedInvs) {
        setSavedInvoices(JSON.parse(storedInvs));
      }
    } catch {}

    // Synchronize cloud data from TanStack Query
    if (cloudWorkspace) {
      if (Array.isArray(cloudWorkspace.invoices) && cloudWorkspace.invoices.length > 0) {
        setSavedInvoices(cloudWorkspace.invoices);
      }
      if (Array.isArray(cloudWorkspace.products) && cloudWorkspace.products.length > 0) {
        setProducts(cloudWorkspace.products.map(normalizeBakerProduct).filter((p: any) => p.is_active));
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

  // Prevent background body scroll when any modal is active
  useEffect(() => {
    const hasOpenModal = Boolean(createdSlipModal || viewingSlipDetails || isAddStoreOpen);
    if (typeof document !== "undefined") {
      if (hasOpenModal) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    };
  }, [createdSlipModal, viewingSlipDetails, isAddStoreOpen]);

  const selectedStore = useMemo(() => {
    if (!selectedStoreId) return null;
    return stores.find((s) => s.id === selectedStoreId) || null;
  }, [stores, selectedStoreId]);

  // Compute pending balance per store
  const storeBalances = useMemo(() => {
    const map: Record<string, number> = {};
    savedInvoices.forEach((inv) => {
      const sName = (inv.customerName || "").toLowerCase().trim();
      if (inv.status === "unpaid") {
        map[sName] = (map[sName] || 0) + (inv.totalAmount || 0);
      }
    });
    return map;
  }, [savedInvoices]);

  const filteredStores = useMemo(() => {
    if (!storeSearch.trim()) return stores;
    const q = storeSearch.toLowerCase();
    return stores.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))
    );
  }, [stores, storeSearch]);

  // Stepper handlers
  const handleQtyChange = (productId: string, delta: number) => {
    if (!selectedStore) {
      toast({
        title: "Select Store First 🏬",
        description: isReturnMode
          ? "Please select the returning store / café in Step 1 before adding returned items."
          : "Please select a delivery store / café in Step 1 before adding product quantities.",
        variant: "error",
      });
      const step1El = document.getElementById("dispatch-step-1");
      if (step1El) step1El.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setQuantities((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const handleSetExactQty = (productId: string, val: string) => {
    if (!selectedStore) {
      toast({
        title: "Select Store First 🏬",
        description: isReturnMode
          ? "Please select the returning store / café in Step 1 before adding returned items."
          : "Please select a delivery store / café in Step 1 before adding product quantities.",
        variant: "error",
      });
      const step1El = document.getElementById("dispatch-step-1");
      if (step1El) step1El.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const num = parseInt(val) || 0;
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, num) }));
  };

  // Calculations
  const lineItems = useMemo(() => {
    return products
      .map((p) => {
        const qty = quantities[p.id] || 0;
        const rawPrice = Number(p.selling_price !== undefined && p.selling_price !== null ? p.selling_price : (p.rate ?? p.price ?? 0));
        const validPrice = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;
        const rawCost = Number(p.making_cost !== undefined && p.making_cost !== null ? p.making_cost : (validPrice > 0 ? Math.round(validPrice * 0.42) : 0));
        const validCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
        const rawProfit = Number(p.unit_profit !== undefined && p.unit_profit !== null ? p.unit_profit : (validPrice - validCost));
        const validProfit = Number.isFinite(rawProfit) ? rawProfit : validPrice - validCost;

        const total = qty * validPrice;
        const profit = qty * validProfit;
        return {
          product: {
            ...p,
            selling_price: validPrice,
            rate: validPrice,
            making_cost: validCost,
            unit_profit: validProfit,
            name: capitalizeWords(p.name)
          },
          qty,
          total: Number.isFinite(total) ? total : 0,
          profit: Number.isFinite(profit) ? profit : 0,
        };
      })
      .filter((it) => it.qty > 0);
  }, [products, quantities]);

  const rawBillTotal = lineItems.reduce((acc, it) => acc + it.total, 0);
  const billTotalAmount = Number.isFinite(rawBillTotal) ? rawBillTotal : 0;
  const totalUnitsDelivered = lineItems.reduce((acc, it) => acc + it.qty, 0);
  const rawEstimatedProfit = lineItems.reduce((acc, it) => acc + it.profit, 0);
  const estimatedProfit = Number.isFinite(rawEstimatedProfit) ? rawEstimatedProfit : 0;
  const overallMargin = billTotalAmount > 0 ? ((estimatedProfit / billTotalAmount) * 100).toFixed(1) : "0";

  // Phone input handler enforcing max 10 digits for India (+91)
  const handleStorePhoneChange = (val: string) => {
    let digits = val.replace(/\D/g, "");
    if (digits.startsWith("91") && digits.length > 10) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0") && digits.length > 10) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }
    setNewStorePhone(digits);
  };

  // Quick Store Add
  const handleSaveNewStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;

    if (newStorePhone.trim() && newStorePhone.length !== 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Indian phone number must be exactly 10 digits.",
        variant: "error",
      });
      return;
    }

    const formattedPhone = newStorePhone.trim() ? `+91 ${newStorePhone.trim()}` : "";

    const newSt: BakerStore = {
      id: `store-${Date.now()}`,
      name: capitalizeWords(newStoreName),
      phone: formattedPhone,
      address: newStoreAddress.trim(),
    };

    const updated = [newSt, ...stores];
    setStores(updated);
    setSelectedStoreId(newSt.id);
    saveB2BClient(bizId, {
      id: newSt.id,
      name: newSt.name,
      phone: newSt.phone,
      address: newSt.address,
    });

    setIsAddStoreOpen(false);
    setNewStoreName("");
    setNewStorePhone("");
    setNewStoreAddress("");
    toast({ title: "Café Added! 🏬", description: `${newSt.name} added to your store list.` });
  };

  // Create & Save Delivery Slip / Return Slip
  const createDeliverySlip = async (): Promise<any | null> => {
    if (!selectedStore) {
      toast({
        title: "No Store Selected",
        description: isReturnMode
          ? "Please select the returning café / store in Step 1 first."
          : "Please select a delivery store / café in Step 1 first.",
        variant: "error",
      });
      const step1El = document.getElementById("dispatch-step-1");
      if (step1El) step1El.scrollIntoView({ behavior: "smooth", block: "start" });
      return null;
    }

    if (lineItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: isReturnMode
          ? "Please select quantity for at least one returned item."
          : "Please increment quantity for at least one bakery item.",
        variant: "error",
      });
      return null;
    }

    setIsSaving(true);
    const invNumber = isReturnMode
      ? `RET-${Date.now().toString().slice(-6)}`
      : `SLIP-${Date.now().toString().slice(-6)}`;
    const dateStr = format(new Date(), "MMM dd, yyyy");

    const slipTotal = isReturnMode ? -billTotalAmount : billTotalAmount;
    const slipSubtotal = isReturnMode ? -billTotalAmount : billTotalAmount;

    const newInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: invNumber,
      title: isReturnMode ? "RETURN & CREDIT SLIP" : "DELIVERY SLIP",
      isReturn: isReturnMode,
      date: dateStr,
      dueDate: dateStr,
      customerName: selectedStore.name,
      customerPhone: selectedStore.phone || "",
      customerAddress: selectedStore.address || "",
      items: lineItems.map((it, idx) => {
        const itemRate = Number(it.product.selling_price ?? it.product.rate ?? 0);
        const validItemRate = Number.isFinite(itemRate) ? itemRate : 0;
        const validItemTotal = Number.isFinite(it.total) ? it.total : 0;
        return {
          id: `row-${idx}`,
          name: capitalizeWords(it.product.name),
          qty: it.qty,
          unit: it.product.unit || "Unit",
          rate: validItemRate,
          amount: isReturnMode ? -validItemTotal : validItemTotal,
          isReturn: isReturnMode,
        };
      }),
      subtotal: Number.isFinite(slipSubtotal) ? slipSubtotal : 0,
      totalAmount: Number.isFinite(slipTotal) ? slipTotal : 0,
      balanceDue: Number.isFinite(slipTotal) ? slipTotal : 0,
      paidAmount: 0,
      status: "unpaid" as const,
      paymentMode: isReturnMode ? "Account Credit" : "UPI",
      createdAt: new Date().toISOString(),
    };

    // Update in-memory & LocalStorage
    const updatedList = [newInvoice, ...savedInvoices];
    setSavedInvoices(updatedList);
    try {
      localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(updatedList));
    } catch {}

    // Asynchronously persist to Supabase via TanStack mutation
    createDispatchMutation.mutateAsync(newInvoice).catch((e) => {
      console.warn("Cloud dispatch persistence note:", e);
    });

    // Save to IDB
    putItem<LocalInvoice>(STORES.invoices, {
      id: newInvoice.id,
      business_id: bizId,
      invoice_number: newInvoice.invoiceNumber,
      title: newInvoice.title,
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: new Date().toISOString().split("T")[0],
      customer_name: newInvoice.customerName,
      customer_phone: newInvoice.customerPhone,
      items: newInvoice.items,
      subtotal_cents: Math.round(newInvoice.subtotal * 100),
      tax_rate: 0,
      tax_cents: 0,
      tds_cents: 0,
      discount_cents: 0,
      additional_cents: 0,
      total_cents: Math.round(newInvoice.totalAmount * 100),
      status: "unpaid",
      payment_mode: isReturnMode ? "Account Credit" : "UPI",
      created_at: newInvoice.createdAt,
    }).catch(() => {});

    // Save to Supabase if connected
    if (business?.id) {
      supabaseClient.from("invoices").insert({
        business_id: business.id,
        invoice_number: newInvoice.invoiceNumber,
        title: newInvoice.title,
        customer_name: newInvoice.customerName,
        customer_phone: newInvoice.customerPhone,
        items: newInvoice.items,
        subtotal_cents: Math.round(newInvoice.subtotal * 100),
        total_cents: Math.round(newInvoice.totalAmount * 100),
        status: "unpaid",
        payment_mode: isReturnMode ? "Account Credit" : "UPI",
      }).then(() => {});
    }

    setIsSaving(false);
    setCreatedSlipModal(newInvoice);
    return newInvoice;
  };

  // WhatsApp Action
  const handleSendWhatsApp = async (customSlip?: any) => {
    const slip = customSlip || (await createDeliverySlip());
    if (!slip) return;

    const isRet = slip.isReturn || slip.totalAmount < 0 || (slip.title || "").includes("RETURN");
    const items = slip.items || lineItems.map((it) => ({
      qty: it.qty,
      name: it.product.name,
      rate: it.product.selling_price,
      amount: it.total,
    }));

    const { message, waUrl } = generateWhatsAppSlipMessage({
      slip: {
        invoiceNumber: slip.invoiceNumber,
        date: slip.date,
        customerName: slip.customerName,
        customerPhone: slip.customerPhone || selectedStore?.phone || "",
        totalAmount: slip.totalAmount,
        status: slip.status,
        items: items.map((it: any) => ({
          name: capitalizeWords(it.name),
          qty: it.qty,
          rate: it.rate,
          amount: it.amount,
        })),
      },
      business,
      isReturn: isRet,
    });

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(message).catch(() => {});
    }

    window.open(waUrl, "_blank");
    toast({
      title: isRet ? "Return Slip Shared on WhatsApp! 📱" : "WhatsApp Delivery Slip Generated! 📱",
      description: `Opened chat for ${formatCafeName(slip.customerName)}`
    });
    if (!customSlip) setQuantities({});
  };

  // Download PDF Action
  const handleDownloadPdf = async (customSlip?: any) => {
    const slip = customSlip || (await createDeliverySlip());
    if (!slip) return;

    const isRet = slip.isReturn || slip.totalAmount < 0 || (slip.title || "").includes("RETURN");

    const pdfData: BillPdfData = {
      orderId: slip.invoiceNumber,
      invoiceTitle: isRet ? "RETURN & CREDIT SLIP" : (slip.title || "DELIVERY SLIP"),
      businessName: business?.name || "Dispatch Central",
      businessPhone: business?.phone || "+91 98765 43210",
      businessAddress: business?.address || undefined,
      businessGstin: business?.gstin || undefined,
      logoUrl: business?.logo_url || undefined,
      signatureUrl: business?.signature_url || undefined,
      customerName: slip.customerName,
      customerPhone: slip.customerPhone,
      customerAddress: slip.customerAddress,
      date: slip.date,
      items: (slip.items || []).map((it: any) => ({
        ...it,
        amount: Math.abs(it.amount || it.qty * it.rate),
      })),
      subtotal: Math.abs(slip.subtotal || slip.totalAmount),
      totalAmount: Math.abs(slip.totalAmount),
      paymentMode: isRet ? "Adjusted / Deducted from Balance" : (slip.status === "paid" ? "Settled (Paid)" : "Pending Settlement (UPI)"),
    };

    generateBillPdf(pdfData);
    toast({
      title: isRet ? "Return Credit Slip Downloaded! 📥" : "PDF Slip Downloaded! 📥",
      description: `Saved slip ${slip.invoiceNumber}`
    });
    if (!customSlip) setQuantities({});
  };

  // Submit & Record Delivery Slip / Return Slip (Opens Decision Modal)
  const handleRecordAndDispatch = async () => {
    const slip = await createDeliverySlip();
    if (!slip) return;
    toast({
      title: isReturnMode ? "Return Slip Recorded! 🔄" : "Delivery Slip Recorded! 📦",
      description: isReturnMode
        ? `Return Slip ${slip.invoiceNumber} recorded. Amount deducted from ${slip.customerName}.`
        : `Slip ${slip.invoiceNumber} recorded for ${slip.customerName}.`,
      variant: "success",
    });
    setQuantities({});
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return savedInvoices;
    const q = historySearch.toLowerCase();
    return savedInvoices.filter(
      (inv) =>
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
        (inv.customerName && inv.customerName.toLowerCase().includes(q))
    );
  }, [savedInvoices, historySearch]);

  return (
    <div className="space-y-6">
      {/* Top Header with Tab Switcher - docks cleanly below AppShell mobile header on mobile */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 py-3 sm:py-3.5 sm:flex sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={cn(
              "w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0 transition-all",
              isReturnMode
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-700"
                : "bg-blue-600/10 border border-blue-500/20 text-blue-700"
            )}>
              {isReturnMode ? "🔄" : "📦"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                  {isReturnMode ? "Item Returns & Credit Slips" : "Delivery Slips & Sales"}
                </h1>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold border shrink-0 whitespace-nowrap",
                  isReturnMode
                    ? "bg-amber-100 text-amber-900 border-amber-200"
                    : "bg-blue-100 text-blue-800 border-blue-200"
                )}>
                  {savedInvoices.length} Slips Recorded
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">
                {isReturnMode
                  ? "Select café, tap expired or returned items, and issue return credit slip"
                  : "Select café, tap item counts, and dispatch or view past slips anytime"}
              </p>
            </div>
          </div>

          {/* Tab Navigation Pill: Delivery | Returns | Saved Slips */}
          <div className="mt-2.5 sm:mt-0 grid grid-cols-3 sm:flex sm:items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200 w-full sm:w-auto shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                if (activeTab === "return") setQuantities({});
                setActiveTab("entry");
              }}
              className={cn(
                "px-1.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap min-w-0 leading-tight",
                activeTab === "entry"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Send size={12} className="shrink-0 hidden xs:inline sm:inline" />
              <span className="sm:hidden">Delivery</span>
              <span className="hidden sm:inline">New Delivery Slip</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (activeTab === "entry") setQuantities({});
                setActiveTab("return");
              }}
              className={cn(
                "px-1.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap min-w-0 leading-tight",
                activeTab === "return"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-amber-800 hover:bg-amber-50/50"
              )}
            >
              <RotateCcw size={12} className="shrink-0 hidden xs:inline sm:inline" />
              <span className="sm:hidden">Returns</span>
              <span className="hidden sm:inline">Return (Expired)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={cn(
                "px-1.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap min-w-0 leading-tight",
                activeTab === "history"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <History size={12} className="shrink-0 hidden xs:inline sm:inline" />
              <span className="sm:hidden">Saved ({savedInvoices.length})</span>
              <span className="hidden sm:inline">Saved Slips ({savedInvoices.length})</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ======================================================== */}
        {/* TAB 1 & 2: QUICK SALES ENTRY OR RETURN INTAKE ENTRY      */}
        {/* ======================================================== */}
        {activeTab === "entry" || activeTab === "return" ? (
          <>
            {/* ==================================================== */}
            {/* STEP 1: SELECT STORE / CAFÉ                          */}
            {/* ==================================================== */}
            <div id="dispatch-step-1" className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden scroll-mt-24">
              {/* Step Header */}
              <div className="p-3.5 sm:p-5 border-b border-[#F1F5F9] bg-gradient-to-r from-slate-50/60 to-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <span className={cn(
                    "px-2 py-0.5 rounded-lg text-white text-[10px] font-black uppercase tracking-wider shrink-0",
                    isReturnMode ? "bg-amber-600" : "bg-blue-600"
                  )}>
                    Step 01
                  </span>
                  <h2 className="text-xs sm:text-base font-extrabold text-[#0F172A] tracking-tight truncate">
                    {isReturnMode ? (
                      <>
                        <span className="hidden sm:inline">Select Café / Store Returning Items</span>
                        <span className="sm:hidden">Select Returning Café</span>
                      </>
                    ) : (
                      <>
                        <span className="hidden sm:inline">Select Delivery Store / Café</span>
                        <span className="sm:hidden">Select Café</span>
                      </>
                    )}
                  </h2>
                  {selectedStore ? (
                    <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ✓ {formatCafeName(selectedStore.name)}
                    </span>
                  ) : (
                    <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-300 animate-pulse">
                      Required: Pick a Store
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddStoreOpen(true)}
                  className={cn(
                    "px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-extrabold text-white transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0 whitespace-nowrap ml-auto",
                    isReturnMode ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  <Plus size={13} className="shrink-0" />
                  <span className="hidden sm:inline">Add Client / Store</span>
                  <span className="sm:hidden">Add Store</span>
                </button>
              </div>

              <div className="p-5 space-y-3.5">
                {/* Search Filter bar & Store count */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search stores or clients by name or phone..."
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      className={cn(
                        "w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none bg-slate-50/60",
                        isReturnMode ? "focus:ring-2 focus:ring-amber-500" : "focus:ring-2 focus:ring-blue-500"
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-[#64748B] whitespace-nowrap">
                    <span>Showing <strong className="text-[#0F172A]">{filteredStores.length}</strong> of {stores.length} partner stores</span>
                  </div>
                </div>

                {/* Store Grid Container */}
                <div className={cn(
                  "pr-1.5 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300",
                  filteredStores.length > 6 && "max-h-[420px] sm:max-h-[460px] overflow-y-auto"
                )}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredStores.map((st) => {
                      const isSelected = selectedStoreId === st.id;
                      const dueAmt = storeBalances[st.name.toLowerCase().trim()] || 0;

                      return (
                        <div
                          key={st.id}
                          onClick={() => setSelectedStoreId(st.id)}
                          className={cn(
                            "relative p-4 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between gap-3 group select-none",
                            isSelected
                              ? isReturnMode
                                ? "bg-amber-50/40 border-amber-600 ring-2 ring-amber-600/30 shadow-xs"
                                : "bg-blue-50/40 border-blue-600 ring-2 ring-blue-600/30 shadow-xs"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/40"
                          )}
                        >
                          {/* Store Top Identity */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 transition-all shadow-2xs",
                                isSelected
                                  ? isReturnMode
                                    ? "bg-amber-600 text-white"
                                    : "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                              )}>
                                <Store size={16} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h3 className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans whitespace-nowrap truncate" title={formatCafeName(st.name)}>
                                    {formatCafeName(st.name)}
                                  </h3>
                                  {st.business_id && (
                                    <span className="px-1.5 py-0.2 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
                                      ⚡ SeyalPro
                                    </span>
                                  )}
                                </div>
                                {st.address && (
                                  <p className="text-[11px] text-[#64748B] flex items-center gap-1 truncate mt-0.5 whitespace-nowrap">
                                    <MapPin size={10} className="shrink-0 text-slate-400" />
                                    <span>{st.address}</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Selected Check Pill */}
                            <div className={cn(
                              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black transition-all",
                              isSelected
                                ? isReturnMode
                                  ? "bg-amber-600 text-white"
                                  : "bg-blue-600 text-white"
                                : "border border-slate-300 text-transparent group-hover:border-slate-400"
                            )}>
                              ✓
                            </div>
                          </div>

                          {/* Store Balance & Phone Footer */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                            {st.phone ? (
                              <span className="text-[#64748B] font-mono flex items-center gap-1 whitespace-nowrap font-semibold">
                                <Phone size={10} className={isReturnMode ? "text-amber-500" : "text-blue-500"} />
                                <span>{st.phone}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">No phone</span>
                            )}

                            {dueAmt > 0 ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                ₹{dueAmt.toLocaleString("en-IN")} Due
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                ✓ All Clear
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {filteredStores.length === 0 && (
                      <div className="col-span-full py-10 text-center text-xs text-slate-400 font-semibold">
                        No partner stores match &ldquo;{storeSearch}&rdquo;. Tap &ldquo;Add Client / Store&rdquo; above.
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected Store Active Spotlight Banner OR Prompt */}
                {selectedStore ? (
                  <div className={cn(
                    "p-3.5 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-all",
                    isReturnMode
                      ? "bg-amber-50/80 border border-amber-200/90"
                      : "bg-blue-50/80 border border-blue-200/90"
                  )}>
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-2xs text-white mt-0.5",
                        isReturnMode ? "bg-amber-600" : "bg-blue-600"
                      )}>
                        {isReturnMode ? <RotateCcw size={16} /> : <Store size={16} />}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-wider",
                            isReturnMode ? "text-amber-800" : "text-blue-700"
                          )}>
                            {isReturnMode ? "Returning Store" : "Active Recipient"}
                          </span>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full animate-pulse",
                            isReturnMode ? "bg-amber-500" : "bg-emerald-500"
                          )} />
                          {isReturnMode && (
                            <span className="hidden sm:inline text-[10px] text-amber-700/80 font-medium">
                              (Balance credited)
                            </span>
                          )}
                          {selectedStore.business_id ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                              ⚡ SeyalPro App
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.2 rounded-md bg-white/90 text-slate-600 border border-slate-200">
                              External Client
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-extrabold text-[#0F172A] tracking-tight font-sans break-words">
                            {formatCafeName(selectedStore.name)}
                          </span>
                          {selectedStore.phone && (
                            <span className={cn(
                              "font-semibold font-mono text-[11px] whitespace-nowrap inline-flex items-center gap-1 bg-white/90 px-2 py-0.5 rounded-md border shadow-2xs",
                              isReturnMode ? "text-amber-900 border-amber-200/80" : "text-[#475569] border-blue-200/80"
                            )}>
                              <Phone size={10} className={isReturnMode ? "text-amber-500 shrink-0" : "text-blue-500 shrink-0"} />
                              {selectedStore.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={cn(
                      "flex items-center gap-2 shrink-0 sm:self-center self-stretch pt-2 sm:pt-0 border-t sm:border-t-0",
                      isReturnMode ? "border-amber-200/60" : "border-blue-200/60"
                    )}>
                      <Link
                        href="/b2b/customers"
                        className={cn(
                          "w-full sm:w-auto justify-center px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white transition-all flex items-center gap-1 shadow-2xs cursor-pointer border",
                          isReturnMode
                            ? "hover:bg-amber-100 text-amber-800 border-amber-200"
                            : "hover:bg-blue-100 text-blue-700 border-blue-200"
                        )}
                      >
                        <span>View Client Ledger →</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    "p-3.5 rounded-2xl flex items-center gap-3 border shadow-2xs",
                    isReturnMode ? "bg-amber-50/80 border-amber-200/90" : "bg-blue-50/80 border-blue-200/90"
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-xl text-white flex items-center justify-center font-bold shrink-0 shadow-2xs",
                      isReturnMode ? "bg-amber-500" : "bg-blue-600"
                    )}>
                      <Store size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "text-xs font-extrabold tracking-tight",
                        isReturnMode ? "text-amber-900" : "text-blue-900"
                      )}>
                        {isReturnMode ? "No Returning Café Selected Yet" : "No Delivery Store Selected Yet"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ==================================================== */}
            {/* STEP 2: TAP ITEM QUANTITIES                          */}
            {/* ==================================================== */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
              {/* Step 2 Header */}
              <div className="border-b border-[#F1F5F9] pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                    <span className={cn(
                      "px-2 sm:px-2.5 py-0.5 rounded-lg text-white text-[10px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap",
                      isReturnMode ? "bg-amber-600" : "bg-blue-600"
                    )}>
                      Step 02
                    </span>
                    <h2 className="text-xs sm:text-base font-extrabold text-[#0F172A] tracking-tight truncate">
                      {isReturnMode ? (
                        <>
                          <span className="hidden sm:inline">Tap Returned / Expired Quantities</span>
                          <span className="sm:hidden">Return Items</span>
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Tap Item Quantities</span>
                          <span className="sm:hidden">Item Quantities</span>
                        </>
                      )}
                    </h2>
                  </div>

                  {/* Piece counter badge - compact on mobile, full on desktop */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap pl-2">
                    {totalUnitsDelivered > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setQuantities({})}
                          className="text-[11px] font-bold text-slate-400 hover:text-rose-600 px-1.5 py-0.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Clear all product quantities"
                        >
                          Reset
                        </button>
                        <span className={cn(
                          "sm:hidden px-2 py-0.5 rounded-lg text-xs font-black whitespace-nowrap border",
                          isReturnMode
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        )}>
                          {totalUnitsDelivered} {isReturnMode ? "ret" : "pcs"}
                        </span>
                      </>
                    )}
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-[#64748B] whitespace-nowrap">
                      <strong className="text-[#0F172A] font-extrabold">{totalUnitsDelivered}</strong> total {isReturnMode ? "returned pieces" : "pieces"} selected
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#64748B] mt-1 hidden sm:block">
                  {isReturnMode
                    ? "Select exact pieces collected back from café due to expiry, damage, or unsold stock"
                    : "Set the exact pieces packed for dispatch"}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {products.map((p) => {
                  const qty = quantities[p.id] || 0;
                  const capName = capitalizeWords(p.name);
                  const rawPrice = Number(p.selling_price !== undefined && p.selling_price !== null ? p.selling_price : (p.rate ?? p.price ?? 0));
                  const safePrice = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;
                  const rawCost = Number(p.making_cost !== undefined && p.making_cost !== null ? p.making_cost : (safePrice > 0 ? Math.round(safePrice * 0.42) : 0));
                  const safeCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
                  const rawProfit = Number(p.unit_profit !== undefined && p.unit_profit !== null ? p.unit_profit : (safePrice - safeCost));
                  const safeProfit = Number.isFinite(rawProfit) ? rawProfit : safePrice - safeCost;
                  const rawItemTotal = qty * safePrice;
                  const safeItemTotal = Number.isFinite(rawItemTotal) ? rawItemTotal : 0;

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 group shadow-2xs select-none",
                        qty > 0
                          ? isReturnMode
                            ? "bg-amber-50/50 border-amber-400 ring-2 ring-amber-300/40 shadow-xs"
                            : "bg-blue-50/50 border-blue-400 ring-2 ring-blue-300/40 shadow-xs"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
                      )}
                    >
                      {/* Unified Single Row: Product Details (Left) & Stepper with +5 (Right) */}
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-xs sm:text-sm font-extrabold text-[#0F172A] tracking-tight truncate font-sans" title={capName}>
                              {capName}
                            </h3>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px] font-semibold text-[#64748B]">
                            <span className="text-[#0F172A] font-bold">₹{safePrice}</span>
                            <span>/ {p.unit || "pc"}</span>
                            {!isReturnMode ? (
                              safeProfit >= 0 ? (
                                <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  +₹{safeProfit} profit
                                </span>
                              ) : (
                                <span className="text-rose-600 text-[10px] font-bold bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                  -₹{Math.abs(safeProfit)} margin
                                </span>
                              )
                            ) : (
                              <span className="text-amber-700 text-[10px] font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                Return rate
                              </span>
                            )}
                            {qty > 0 && (
                              <span className={cn(
                                "text-[10.5px] font-black px-1.5 py-0.2 rounded border shadow-2xs",
                                isReturnMode
                                  ? "bg-amber-100 text-amber-900 border-amber-300"
                                  : "bg-blue-100 text-blue-950 border-blue-300"
                              )}>
                                = {isReturnMode ? "-" : ""}₹{safeItemTotal.toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stepper Controls: Minus, Input, Plus, +5 Inline */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(p.id, -1)}
                            disabled={!selectedStore || qty === 0}
                            aria-label="Decrease quantity by 1"
                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center font-black cursor-pointer transition-all active:scale-95 shadow-2xs"
                          >
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={qty || ""}
                            placeholder="0"
                            disabled={!selectedStore}
                            onChange={(e) => handleSetExactQty(p.id, e.target.value)}
                            className={cn(
                              "w-10 sm:w-11 h-8 text-center rounded-xl border border-slate-200 text-xs font-black text-[#0F172A] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed bg-white shadow-inner",
                              isReturnMode ? "focus:ring-2 focus:ring-amber-500" : "focus:ring-2 focus:ring-blue-500"
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(p.id, 1)}
                            disabled={!selectedStore}
                            aria-label="Increase quantity by 1"
                            className={cn(
                              "w-8 h-8 rounded-xl text-white flex items-center justify-center font-black cursor-pointer transition-all active:scale-95 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed",
                              isReturnMode
                                ? "bg-amber-600 hover:bg-amber-700"
                                : "bg-blue-600 hover:bg-blue-700"
                            )}
                          >
                            <Plus size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={!selectedStore}
                            onClick={() => handleQtyChange(p.id, 5)}
                            className={cn(
                              "h-8 px-2.5 rounded-xl text-xs font-black transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed border shadow-2xs flex items-center justify-center",
                              isReturnMode
                                ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200/90"
                                : "bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-200/90"
                            )}
                            title="Add 5 pieces"
                          >
                            +5
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ==================================================== */}
            {/* STEP 3: TOTAL & DISPATCH / RETURN ACTIONS            */}
            {/* ==================================================== */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
              {/* Step 3 Header */}
              <div className="border-b border-[#F1F5F9] pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                    <span className={cn(
                      "px-2 sm:px-2.5 py-0.5 rounded-lg text-white text-[10px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap",
                      isReturnMode ? "bg-amber-600" : "bg-blue-600"
                    )}>
                      Step 03
                    </span>
                    <h2 className="text-xs sm:text-base font-extrabold text-[#0F172A] tracking-tight truncate">
                      {isReturnMode ? (
                        <>
                          <span className="hidden sm:inline">Review Return Value & Deduct</span>
                          <span className="sm:hidden">Review Return</span>
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Review Total & Dispatch</span>
                          <span className="sm:hidden">Review Total</span>
                        </>
                      )}
                    </h2>
                  </div>

                  {/* Total price - compact on mobile, full breakdown on desktop */}
                  <div className="text-right shrink-0 whitespace-nowrap pl-2">
                    <span className="hidden sm:block text-[10px] font-bold text-[#64748B] uppercase tracking-wider whitespace-nowrap">
                      {isReturnMode ? "Total Return Credit (To Deduct)" : "Gross Billed Total"}
                    </span>
                    <span className={cn(
                      "text-base sm:text-2xl font-black whitespace-nowrap",
                      isReturnMode ? "text-amber-700" : "text-[#0F172A]"
                    )}>
                      {isReturnMode ? `-₹${(Number.isFinite(billTotalAmount) ? billTotalAmount : 0).toLocaleString("en-IN")}` : `₹${(Number.isFinite(billTotalAmount) ? billTotalAmount : 0).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#64748B] mt-1 hidden sm:block">
                  {isReturnMode
                    ? "Preview returned items, total deducted credit, and issue return slip"
                    : "Preview line items, margins, and download or WhatsApp slip"}
                </p>
              </div>

              {/* Line Items Preview */}
              {lineItems.length > 0 ? (
                <div className="space-y-3">
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 overflow-hidden">
                    {lineItems.map((it) => (
                      <div key={it.product.id} className="p-3 bg-slate-50/50 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-extrabold text-[#0F172A]">{it.qty}x {capitalizeWords(it.product.name)}</span>
                          <span className="text-slate-400 ml-2">(@ ₹{Number(it.product.selling_price ?? it.product.rate ?? 0)})</span>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            "font-black",
                            isReturnMode ? "text-amber-700" : "text-[#0F172A]"
                          )}>
                            {isReturnMode ? `-₹${(Number.isFinite(it.total) ? it.total : 0).toLocaleString("en-IN")}` : `₹${(Number.isFinite(it.total) ? it.total : 0).toLocaleString("en-IN")}`}
                          </span>
                          {!isReturnMode ? (
                            <span className="text-[10px] text-emerald-600 font-bold block">(+₹{Number.isFinite(it.profit) ? it.profit : 0} profit)</span>
                          ) : (
                            <span className="text-[10px] text-amber-700 font-bold block">(returned item)</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary Banner: Return Deduction or Profit */}
                  {isReturnMode ? (
                    <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex items-center justify-between gap-3 shadow-2xs">
                      <div className="min-w-0">
                        <span className="text-[10px] sm:text-[11px] font-extrabold text-amber-800 uppercase tracking-wider block">
                          Client Outstanding Balance Deduction
                        </span>
                        <span className="text-base sm:text-lg font-black text-amber-700">
                          -₹{(Number.isFinite(billTotalAmount) ? billTotalAmount : 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-amber-800 px-3 py-1 rounded-full bg-amber-100 border border-amber-300/80 whitespace-nowrap inline-flex items-center shadow-2xs">
                          Credit Return
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 flex items-center justify-between gap-3 shadow-2xs">
                      <div className="min-w-0">
                        <span className="text-[10px] sm:text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider block">
                          Estimated Net Profit
                        </span>
                        <span className="text-base sm:text-lg font-black text-emerald-700">
                          ₹{(Number.isFinite(estimatedProfit) ? estimatedProfit : 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-emerald-800 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300/80 whitespace-nowrap inline-flex items-center shadow-2xs">
                          {Number.isFinite(Number(overallMargin)) ? overallMargin : "0"}% Margin
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                  {isReturnMode
                    ? "Tap + on products in Step 2 to add items taken back as returns."
                    : "Tap + on products in Step 2 to generate the delivery slip preview."}
                </div>
              )}

              {/* Single Clear Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={!selectedStore || lineItems.length === 0 || isSaving}
                  onClick={handleRecordAndDispatch}
                  className={cn(
                    "w-full py-3 sm:py-3.5 px-3 sm:px-6 rounded-2xl text-xs sm:text-sm font-extrabold disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2 sm:gap-2.5 transition-all active:scale-[0.99] cursor-pointer whitespace-nowrap shadow-md",
                    isReturnMode
                      ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20"
                      : "bg-[#2563EB] hover:bg-blue-700 shadow-blue-500/20"
                  )}
                >
                  {isReturnMode ? <RotateCcw size={16} className="shrink-0" /> : <CheckCircle2 size={16} className="shrink-0" />}
                  <span className="whitespace-nowrap">
                    {!selectedStore
                      ? isReturnMode
                        ? "Select a Returning Café in Step 1 to Submit"
                        : "Select a Delivery Store in Step 1 to Submit"
                      : lineItems.length === 0
                        ? isReturnMode
                          ? "Add Returned Items in Step 2 to Submit"
                          : "Add Products in Step 2 to Submit"
                        : isSaving
                          ? isReturnMode ? "Recording Return Slip..." : "Recording Delivery Slip..."
                          : isReturnMode
                            ? `Submit & Record Return Slip (-₹${(Number.isFinite(billTotalAmount) ? billTotalAmount : 0).toLocaleString("en-IN")})`
                            : `Submit & Record Delivery Slip (₹${(Number.isFinite(billTotalAmount) ? billTotalAmount : 0).toLocaleString("en-IN")})`}
                  </span>
                </button>
                <p className="text-center text-[11px] text-[#64748B] mt-2 font-medium">
                  {isReturnMode
                    ? "Submitting records the return, automatically reduces this client's pending balance, and lets you WhatsApp or print the return receipt."
                    : "Submitting saves the delivery slip and opens options to share via WhatsApp or download the PDF."}
                </p>
              </div>
            </div>
          </>
        ) : (
          /* ======================================================== */
          /* TAB 2: SAVED DELIVERY SLIPS HISTORY (WHERE USER CAN SEE) */
          /* ======================================================== */
          <div className="space-y-4 animate-in fade-in">
            {/* History Search & Stats Bar */}
            <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Slip Number or Client Name..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-[#64748B]">
                <span>Showing <strong>{filteredHistory.length}</strong> saved delivery slips</span>
              </div>
            </div>

            {/* MOBILE VIEW: Vertical Card Feed */}
            <div className="md:hidden space-y-3">
              {filteredHistory.map((slip) => {
                const totalPieces = (slip.items || []).reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0);
                const formattedCustomer = formatCafeName(slip.customerName);
                const isRet = slip.isReturn || slip.totalAmount < 0 || (slip.title || "").includes("RETURN");

                return (
                  <div
                    key={slip.id}
                    className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3 transition-all"
                  >
                    {/* Header: Store Icon, Store Name, Slip #, Date, and Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                          isRet
                            ? "bg-amber-50 border-amber-200/80 text-amber-700"
                            : "bg-blue-50 border-blue-200/80 text-blue-700"
                        )}>
                          {isRet ? <RotateCcw size={16} /> : <Store size={16} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-sm text-[#0F172A] leading-snug truncate" title={formattedCustomer}>
                            {formattedCustomer}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] flex-wrap">
                            <span className={cn("font-mono font-bold", isRet ? "text-amber-700" : "text-blue-600")}>
                              {slip.invoiceNumber}
                            </span>
                            {isRet && (
                              <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                                Return
                              </span>
                            )}
                            <span className="text-slate-300">•</span>
                            <span className="text-[#64748B] font-medium">{slip.date}</span>
                          </div>
                        </div>
                      </div>

                      {/* Top Action Icons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(slip)}
                          className={cn(
                            "p-1.5 rounded-lg border border-slate-200/60 transition cursor-pointer",
                            isRet ? "text-amber-700 hover:bg-amber-50" : "text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                          )}
                          title="Download PDF Slip"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(slip)}
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 border border-emerald-200/60 transition cursor-pointer"
                          title="Share on WhatsApp"
                        >
                          <Send size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewingSlipDetails(slip)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/60 transition cursor-pointer"
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Delivered / Returned Items Summary Bar */}
                    <div className="text-xs bg-slate-50/80 p-2 rounded-xl border border-slate-100 text-[#0F172A] flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-600 text-[11px] truncate">
                        {(slip.items || []).slice(0, 3).map((it: any) => `${it.qty}x ${capitalizeWords(it.name)}`).join(", ")}
                        {(slip.items || []).length > 3 ? ` +${(slip.items || []).length - 3} more` : ""}
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-md font-extrabold text-[10px] shrink-0 border",
                        isRet
                          ? "bg-amber-50 text-amber-800 border-amber-200/60"
                          : "bg-blue-50 text-blue-700 border-blue-200/60"
                      )}>
                        {totalPieces} {isRet ? "returned pcs" : "pcs"}
                      </span>
                    </div>

                    {/* 3-Stat Financial Grid */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                          {isRet ? "Deduction" : "Total Bill"}
                        </span>
                        <span className={cn(
                          "text-xs font-black mt-0.5 block truncate",
                          isRet ? "text-amber-700" : "text-[#0F172A]"
                        )}>
                          {isRet ? `-₹${Math.abs(slip.totalAmount || 0).toLocaleString("en-IN")}` : `₹${(slip.totalAmount || 0).toLocaleString("en-IN")}`}
                        </span>
                      </div>
                      <div className="min-w-0 border-l border-slate-200">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Total Qty</span>
                        <span className="text-xs font-semibold text-slate-700 mt-0.5 block truncate">
                          {totalPieces} {isRet ? "returned" : "units"}
                        </span>
                      </div>
                      <div className="min-w-0 border-l border-slate-200">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Payment</span>
                        <span
                          className={cn(
                            "text-xs font-black mt-0.5 block truncate",
                            isRet ? "text-amber-700" : slip.status === "paid" ? "text-emerald-700" : "text-rose-600"
                          )}
                        >
                          {isRet ? "Credited" : slip.status === "paid" ? "Settled" : "Due"}
                        </span>
                      </div>
                    </div>

                    {/* Status Bar */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium">Slip Status</span>
                      {isRet ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                          🔄 Deducted from Balance
                        </span>
                      ) : slip.status === "paid" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✓ Settled (Paid)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                          Pending Dues
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredHistory.length === 0 && (
                <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] text-center text-[#64748B]">
                  <p className="font-bold text-sm">No slips found.</p>
                  <p className="text-xs text-slate-400 mt-1">Try another search or record a new delivery or return slip.</p>
                </div>
              )}
            </div>

            {/* DESKTOP VIEW: Full Slips Table */}
            <div className="hidden md:block bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              {filteredHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[740px] text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                        <th className="py-3 px-4 whitespace-nowrap">Slip #</th>
                        <th className="py-3 px-4 whitespace-nowrap">Date</th>
                        <th className="py-3 px-4 whitespace-nowrap">Store / Client</th>
                        <th className="py-3 px-4 whitespace-nowrap">Items Summary</th>
                        <th className="py-3 px-4 whitespace-nowrap">Total Amount</th>
                        <th className="py-3 px-4 whitespace-nowrap">Status</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                      {filteredHistory.map((slip) => {
                        const totalPieces = (slip.items || []).reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0);
                        const isRet = slip.isReturn || slip.totalAmount < 0 || (slip.title || "").includes("RETURN");

                        return (
                          <tr key={slip.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 font-mono font-bold whitespace-nowrap">
                                <span className={isRet ? "text-amber-700" : "text-blue-600"}>
                                  {slip.invoiceNumber}
                                </span>
                                {isRet && (
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                                    Return
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                              {slip.date}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 font-extrabold text-sm text-[#0F172A] tracking-tight font-sans">
                                {isRet ? (
                                  <RotateCcw size={13} className="text-amber-600 shrink-0" />
                                ) : (
                                  <Store size={13} className="text-blue-500 shrink-0" />
                                )}
                                <span>{formatCafeName(slip.customerName)}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                              <span className="font-bold text-[#0F172A]">
                                {totalPieces} {isRet ? "returned pcs" : "pcs"}
                              </span>
                              <span className="text-slate-400 text-[11px] ml-1.5">
                                ({(slip.items || []).slice(0, 2).map((it: any) => `${it.qty}x ${capitalizeWords(it.name)}`).join(", ")}
                                {(slip.items || []).length > 2 ? "..." : ""})
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className={cn(
                                "text-sm font-black whitespace-nowrap",
                                isRet ? "text-amber-700" : "text-[#0F172A]"
                              )}>
                                {isRet ? `-₹${Math.abs(slip.totalAmount || 0).toLocaleString("en-IN")}` : `₹${(slip.totalAmount || 0).toLocaleString("en-IN")}`}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isRet ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                                  🔄 Credit Deducted
                                </span>
                              ) : slip.status === "paid" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                  ✓ Settled
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                  Pending Dues
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPdf(slip)}
                                  className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                                  title="Download / Print PDF Slip"
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSendWhatsApp(slip)}
                                  className="p-1.5 rounded-lg text-[#16A34A] hover:bg-[#16A34A]/10 transition cursor-pointer"
                                  title="Resend on WhatsApp"
                                >
                                  <Send size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setViewingSlipDetails(slip)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                                  title="View Slip Details"
                                >
                                  <Eye size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <FileText size={24} />
                  </div>
                  <h3 className="font-extrabold text-sm text-[#0F172A]">No Delivery Slips Found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Any delivery slip created from the Quick Sales Entry tab will be saved and visible here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("entry")}
                    className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white"
                  >
                    Create First Delivery Slip
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* INSTANT SLIP CREATED MODAL (ANSWERS "WHERE CAN I SEE")*/}
      {/* ==================================================== */}
      {isMounted && createdSlipModal && createPortal((() => {
        const isRet = createdSlipModal.isReturn || createdSlipModal.totalAmount < 0 || (createdSlipModal.title || "").includes("RETURN");
        const absTotal = Math.abs(createdSlipModal.totalAmount || 0);

        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setCreatedSlipModal(null);
            }}
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
          >
            <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-6">
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md transform rounded-3xl bg-white p-5 sm:p-6 text-left shadow-2xl transition-all border border-slate-200 space-y-4 my-8 animate-in zoom-in-95"
              >
                {/* Top-Right Close Button */}
                <button
                  type="button"
                  onClick={() => setCreatedSlipModal(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer z-10"
                  title="Close"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>

                <div className="text-center space-y-1">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto shadow-2xs",
                    isRet
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-emerald-50 border-emerald-100 text-emerald-600"
                  )}>
                    {isRet ? <RotateCcw size={24} /> : <CheckCircle2 size={24} />}
                  </div>
                  <h3 className="font-black text-lg text-[#0F172A]">
                    {isRet ? "Return Slip Recorded! 🔄" : "Delivery Slip Recorded! 📦"}
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    {isRet ? "Return Slip " : "Slip "}
                    <strong className={cn("font-mono", isRet ? "text-amber-700" : "text-blue-600")}>
                      {createdSlipModal.invoiceNumber}
                    </strong>{" "}
                    saved for <strong className="text-[#0F172A]">{createdSlipModal.customerName}</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Date:</span>
                    <span className="font-semibold text-slate-800">{createdSlipModal.date}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isRet ? "Credit Deducted:" : "Billed Amount:"}</span>
                    <span className={cn(
                      "font-black text-sm",
                      isRet ? "text-amber-700" : "text-[#0F172A]"
                    )}>
                      {isRet ? `-₹${absTotal.toLocaleString("en-IN")}` : `₹${absTotal.toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Items:</span>
                    <span className="font-semibold text-slate-800">
                      {createdSlipModal.items?.length || 0} product types {isRet ? "(returned)" : ""}
                    </span>
                  </div>

                  {isRet && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-amber-800 font-semibold flex items-center gap-1.5">
                      <RotateCcw size={13} className="shrink-0 text-amber-700" />
                      <span>₹{absTotal.toLocaleString("en-IN")} credited &amp; deducted from client ledger.</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSendWhatsApp(createdSlipModal);
                      setCreatedSlipModal(null);
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-extrabold bg-[#16A34A] hover:bg-[#15803D] text-white flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Send size={14} />
                    <span>{isRet ? "Share Return Slip on WhatsApp" : "Share Slip on WhatsApp Now"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadPdf(createdSlipModal);
                      setCreatedSlipModal(null);
                    }}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer shadow-xs",
                      isRet ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                    )}
                  >
                    <Download size={14} />
                    <span>{isRet ? "Download Return Credit PDF" : "Download Printable PDF"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCreatedSlipModal(null);
                      setActiveTab("history");
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <History size={14} />
                    <span>View All Saved Slips History</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setCreatedSlipModal(null)}
                  className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 pt-1 cursor-pointer"
                >
                  {isRet ? "Close & Record Another Return" : "Close & Create Another Slip"}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ==================================================== */}
      {/* VIEW SLIP DETAILS MODAL                              */}
      {/* ==================================================== */}
      {isMounted && viewingSlipDetails && createPortal((() => {
        const isRet = viewingSlipDetails.isReturn || viewingSlipDetails.totalAmount < 0 || (viewingSlipDetails.title || "").includes("RETURN");
        const absTotal = Math.abs(viewingSlipDetails.totalAmount || 0);

        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setViewingSlipDetails(null);
            }}
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
          >
            <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-6">
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-lg transform rounded-3xl bg-white p-5 sm:p-6 text-left shadow-2xl transition-all border border-slate-200 space-y-4 my-8 animate-in zoom-in-95"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {isRet ? "Return & Credit Slip" : "Delivery Slip Details"}
                      </span>
                      {isRet && (
                        <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                          Return Note
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
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer"
                    title="Close"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
                  <p><strong className="text-slate-700">{isRet ? "Client / Café:" : "Delivered To:"}</strong> {viewingSlipDetails.customerName}</p>
                  <p><strong className="text-slate-700">Date:</strong> {viewingSlipDetails.date}</p>
                  <p><strong className="text-slate-700">Phone:</strong> {viewingSlipDetails.customerPhone || "N/A"}</p>
                  <p><strong className="text-slate-700">Status:</strong> {isRet ? "Deducted from Outstanding Balance" : viewingSlipDetails.status === "paid" ? "Settled (Paid)" : "Pending Dues"}</p>
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
                  <span>{isRet ? "Total Deducted Amount:" : "Total Amount:"}</span>
                  <span className={cn("text-base", isRet ? "text-amber-700" : "text-blue-600")}>
                    {isRet ? `-₹${absTotal.toLocaleString("en-IN")}` : `₹${absTotal.toLocaleString("en-IN")}`}
                  </span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(viewingSlipDetails)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-xs",
                      isRet ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                    )}
                  >
                    <Download size={14} />
                    <span>{isRet ? "Download Return PDF" : "Download PDF"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(viewingSlipDetails)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-extrabold bg-[#16A34A] hover:bg-[#15803D] text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Send size={14} />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ==================================================== */}
      {/* ADD CAFÉ MODAL (WITH 10-DIGIT INDIA PHONE VALIDATION) */}
      {/* ==================================================== */}
      {isMounted && isAddStoreOpen && createPortal((
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddStoreOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-6">
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm transform rounded-3xl bg-white p-5 sm:p-6 text-left shadow-2xl transition-all border border-slate-200 space-y-4 my-8 animate-in zoom-in-95"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="font-extrabold text-base text-[#0F172A]">New Client / Store</h3>
                <button
                  type="button"
                  onClick={() => setIsAddStoreOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer"
                  title="Close"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveNewStore} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-[#0F172A] block mb-1">Client / Store Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Metro Retail or Corner Hub"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#0F172A]">WhatsApp Mobile Number *</label>
                    <span className={cn(
                      "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
                      newStorePhone.length === 10 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                    )}>
                      {newStorePhone.length}/10 digits
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
                      value={newStorePhone}
                      onChange={(e) => handleStorePhoneChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-semibold text-[#0F172A] focus:outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {newStorePhone.length === 10
                      ? "✓ Valid 10-digit Indian phone number"
                      : "Strictly 10 digits required for India (+91)"}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0F172A] block mb-1">Delivery Address</label>
                  <input
                    type="text"
                    placeholder="Navalur OMR, Chennai"
                    value={newStoreAddress}
                    onChange={(e) => setNewStoreAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddStoreOpen(false)}
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
        </div>
      ), document.body)}
    </div>
  );
}
