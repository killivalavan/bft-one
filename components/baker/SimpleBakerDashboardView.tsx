"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { generateBillPdf, BillPdfData } from "@/lib/utils/billPdf";
import { format } from "date-fns";
import {
  Store, Plus, Minus, Send, Download, CheckCircle2,
  Clock, TrendingUp, Users, ArrowRightLeft, Sparkles,
  Coffee, Receipt, Award, PackageCheck, AlertCircle, RefreshCw, Trash2,
  Phone, MapPin, Package, Truck
} from "lucide-react";
import { capitalizeWords } from "@/app/(protected)/b2b/products/page";
import { formatCafeName, DEFAULT_BAKER_SAMPLE_STORES, sanitizeBakerStores } from "@/lib/utils/bakerUtils";
import { fetchB2BClients, saveB2BClient, B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";
import {
  STORES,
  getItemsByTenant,
  putItem,
  LocalInvoice,
  LocalCustomer,
} from "@/lib/offline/db";
import { enqueueSyncOperation } from "@/lib/offline/syncEngine";

export interface SimpleBakerDashboardViewProps {
  onSwitchToCafeMode: () => void;
}

interface BakerStore {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  business_id?: string;
}

interface BakerItemSelection {
  name: string;
  rate: number;
  qty: number;
  unit: string;
}

const DEFAULT_BAKER_ITEMS: BakerItemSelection[] = [
  { name: "Brownie", rate: 40, qty: 0, unit: "Pcs" },
  { name: "Tea Cake", rate: 30, qty: 0, unit: "Pcs" },
  { name: "Jam Cake", rate: 35, qty: 0, unit: "Pcs" },
  { name: "Banana Bread", rate: 45, qty: 0, unit: "Pcs" },
  { name: "Choco Chip Cookies", rate: 25, qty: 0, unit: "Pcs" },
  { name: "Cupcake", rate: 30, qty: 0, unit: "Pcs" },
];

export function SimpleBakerDashboardView({ onSwitchToCafeMode }: SimpleBakerDashboardViewProps) {
  const { business, isModuleEnabled } = useTenant();
  const { toast } = useToast();

  const isBridgeEnabled = isModuleEnabled ? isModuleEnabled("b2b_bridge") : false;

  // Active Tab: "dispatch" | "stores" | "items" | "profit" | "staff"
  const [activeTab, setActiveTab] = useState<"dispatch" | "stores" | "items" | "profit" | "staff">("dispatch");

  // Stores Directory (Reusing LocalStorage & IndexedDB)
  const [stores, setStores] = useState<BakerStore[]>(DEFAULT_BAKER_SAMPLE_STORES);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(DEFAULT_BAKER_SAMPLE_STORES[0].id);
  const [storeSearch, setStoreSearch] = useState("");
  const [newStoreModal, setNewStoreModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStorePhone, setNewStorePhone] = useState("");

  const filteredStores = useMemo(() => {
    if (!storeSearch.trim()) return stores;
    const q = storeSearch.toLowerCase();
    return stores.filter(
      (st) => (st.name || "").toLowerCase().includes(q) || (st.phone && st.phone.includes(q))
    );
  }, [stores, storeSearch]);

  // Quick Dispatch Items
  const [dispatchItems, setDispatchItems] = useState<BakerItemSelection[]>(DEFAULT_BAKER_ITEMS);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemRate, setCustomItemRate] = useState("");
  const [isSavingBill, setIsSavingBill] = useState(false);

  // Invoices & Financial History
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [salariesTotal, setSalariesTotal] = useState(0);
  const [loadingData, setLoadingData] = useState(false);

  // Helper Staff State
  const [helpers, setHelpers] = useState<{ id: string; name: string; role: string; salary: number; advances: number }[]>([
    { id: "h-1", name: "Ramesh", role: "Assistant Baker", salary: 9000, advances: 1000 },
    { id: "h-2", name: "Kavitha", role: "Packaging & Cleaning", salary: 6500, advances: 500 },
  ]);
  const [advanceHelperId, setAdvanceHelperId] = useState<string | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState("");

  // 1. Load Invoices & Stores from LocalStorage & Supabase
  useEffect(() => {
    const bizId = business?.id || "default";

    // Load Stores strictly for this bakery
    try {
      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) {
        const parsed = JSON.parse(storedCusts);
        const cleaned = sanitizeBakerStores(parsed);
        if (cleaned.length > 0) {
          setStores(cleaned);
          setSelectedStoreId((prev) => prev || cleaned[0]?.id || "");
        }
      }
    } catch {}

    // Fetch live B2B clients from server (ensures incognito & mobile are in sync)
    if (bizId && bizId !== "default") {
      fetchB2BClients(bizId).then((serverClients) => {
        if (serverClients && serverClients.length > 0) {
          setStores(serverClients);
          setSelectedStoreId((prev) => prev || serverClients[0]?.id || "");
        }
      });
    }

    const handleStoresUpdated = (e: any) => {
      if (e?.detail?.clients) {
        setStores(e.detail.clients);
      }
    };
    window.addEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);

    // Load Invoices
    loadInvoicesAndFinances();

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  async function loadInvoicesAndFinances() {
    const bizId = business?.id || "default";
    setLoadingData(true);
    try {
      // Load local invoices
      const stored = localStorage.getItem(`bftone_invoices_${bizId}`);
      let invList = stored ? JSON.parse(stored) : [];

      // Also query Supabase if online
      if (business?.id) {
        const { data: dbInvoices } = await supabaseClient
          .from("invoices")
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false });

        if (dbInvoices && dbInvoices.length > 0) {
          invList = dbInvoices.map((d: any) => ({
            id: d.id,
            invoiceNumber: d.invoice_number,
            title: d.title || "Delivery Slip",
            date: d.invoice_date || format(new Date(), "MMM dd, yyyy"),
            customerName: d.customer_name,
            customerPhone: d.customer_phone,
            items: d.items || [],
            totalAmount: (d.total_cents || 0) / 100,
            status: d.status || "unpaid",
          }));
        }

        // Fetch Expenses
        const { data: exps } = await supabaseClient
          .from("daily_expenses")
          .select("price_cents, quantity")
          .eq("business_id", business.id);

        let expSum = 0;
        if (exps) {
          expSum = exps.reduce((s, r) => s + (((r.price_cents || 0) * (r.quantity || 1)) / 100), 0);
        }

        // Fetch Settlements
        const { data: sals } = await supabaseClient
          .from("salary_settlements")
          .select("settled_amount_cents")
          .eq("is_settled", true);

        let salSum = 0;
        if (sals) {
          salSum = sals.reduce((s, r) => s + ((r.settled_amount_cents || 0) / 100), 0);
        }

        setExpensesTotal(expSum);
        setSalariesTotal(salSum);
      }

      setInvoices(invList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingData(false);
    }
  }

  // Selected Store Object
  const selectedStore = useMemo(() => {
    return stores.find(s => s.id === selectedStoreId) || stores[0] || { id: "general", name: "Direct Client" };
  }, [stores, selectedStoreId]);

  // Current Bill Totals
  const activeSelectedItems = useMemo(() => {
    return dispatchItems.filter(it => it.qty > 0);
  }, [dispatchItems]);

  const billTotalAmount = useMemo(() => {
    return activeSelectedItems.reduce((sum, it) => sum + (it.qty * it.rate), 0);
  }, [activeSelectedItems]);

  const billTotalPieces = useMemo(() => {
    return activeSelectedItems.reduce((sum, it) => sum + it.qty, 0);
  }, [activeSelectedItems]);

  // Quantity Adjuster
  function updateItemQty(name: string, delta: number) {
    setDispatchItems(prev => prev.map(it => {
      if (it.name === name) {
        return { ...it, qty: Math.max(0, it.qty + delta) };
      }
      return it;
    }));
  }

  function setItemQtyDirect(name: string, val: number) {
    setDispatchItems(prev => prev.map(it => {
      if (it.name === name) {
        return { ...it, qty: Math.max(0, val) };
      }
      return it;
    }));
  }

  function handleAddCustomItem() {
    if (!customItemName.trim()) return;
    const rateNum = Number(customItemRate) || 30;
    setDispatchItems(prev => [
      ...prev,
      { name: capitalizeWords(customItemName), rate: rateNum, qty: 10, unit: "Pcs" }
    ]);
    setCustomItemName("");
    setCustomItemRate("");
  }

  function handleStorePhoneChange(val: string) {
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
  }

  function handleCreateStore() {
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

    const newStore: BakerStore = {
      id: `store-${Date.now()}`,
      name: capitalizeWords(newStoreName),
      phone: formattedPhone,
    };
    const nextStores = [newStore, ...stores];
    setStores(nextStores);
    setSelectedStoreId(newStore.id);
    setNewStoreModal(false);
    setNewStoreName("");
    setNewStorePhone("");

    // Persist to server & local cache
    const bizId = business?.id || "default";
    saveB2BClient(bizId, {
      id: newStore.id,
      name: newStore.name,
      phone: newStore.phone,
    });
    toast({ title: "Store Added! 🏬", description: `${newStore.name} added to your store list.`, variant: "success" });
  }

  // Create & Save Dispatch Invoice
  async function handleSaveDispatch(andShareWhatsApp = false) {
    if (activeSelectedItems.length === 0) {
      toast({ title: "No Items Selected", description: "Please add at least 1 item to dispatch.", variant: "warning" });
      return;
    }

    setIsSavingBill(true);
    const bizId = business?.id || "default";
    const invNumber = `BKR-${Date.now().toString().slice(-5)}`;
    const dateStr = format(new Date(), "MMM dd, yyyy");

    const newInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: invNumber,
      title: "DELIVERY SLIP",
      date: dateStr,
      dueDate: format(new Date(), "MMM dd, yyyy"),
      customerName: selectedStore.name,
      customerPhone: selectedStore.phone || "",
      customerAddress: selectedStore.address || "",
      customerGstin: "",
      items: activeSelectedItems.map((it, idx) => ({
        id: `row-${idx}`,
        name: it.name,
        qty: it.qty,
        unit: it.unit,
        rate: it.rate,
        amount: it.qty * it.rate,
      })),
      subtotal: billTotalAmount,
      taxRate: 0,
      taxAmount: 0,
      tdsAmount: 0,
      discountAmount: 0,
      additionalCharges: 0,
      totalAmount: billTotalAmount,
      status: "unpaid",
      paymentMode: "UPI",
      createdAt: new Date().toISOString(),
    };

    // Save to LocalStorage
    const nextInvoices = [newInvoice, ...invoices];
    setInvoices(nextInvoices);
    try {
      localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(nextInvoices));
    } catch {}

    // Save to Offline IDB & Sync Queue
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
      status: (newInvoice.status as "paid" | "unpaid" | "overdue" | "cancelled") || "unpaid",
      payment_mode: "UPI",
      created_at: newInvoice.createdAt,
    }).catch(() => {});

    // Sync to Supabase
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
        payment_mode: "UPI",
      }).then(() => {});
    }

    setIsSavingBill(false);

    // Reset item quantities
    setDispatchItems(DEFAULT_BAKER_ITEMS);

    toast({
      title: "Delivery Slip Saved! 📦",
      description: `Slip #${invNumber} generated for ${selectedStore.name}.`,
      variant: "success",
    });

    if (andShareWhatsApp) {
      shareWhatsAppBill(newInvoice);
    }
  }

  // Format & Share WhatsApp Delivery Slip
  function shareWhatsAppBill(inv: any) {
    const cleanPhone = (inv.customerPhone || "").replace(/[^0-9]/g, "");
    const storeTarget = cleanPhone.length >= 10 ? cleanPhone : "";

    const lines = [
      `📦 *${business?.name || "Dispatch Central"}*`,
      `📄 *DELIVERY SLIP: #${inv.invoiceNumber}*`,
      `🏬 Store: *${formatCafeName(inv.customerName)}*`,
      `📅 Date: ${inv.date}`,
      `─────────────────`,
      ...inv.items.map((it: any) => `• *${it.name}*: ${it.qty} pcs @ ₹${it.rate} = ₹${it.amount}`),
      `─────────────────`,
      `💰 *Total Amount: ₹${inv.totalAmount}*`,
      `📌 Status: *Pending Settlement*`,
      ...(business?.upi_id?.trim() ? [``, `UPI ID: ${business.upi_id.trim()}`] : []),
      ``,
      `Thank you for your business! 🙏`
    ];

    const message = encodeURIComponent(lines.join("\n"));
    const url = storeTarget
      ? `https://api.whatsapp.com/send?phone=${storeTarget}&text=${message}`
      : `https://api.whatsapp.com/send?text=${message}`;

    window.open(url, "_blank");
  }

  // Analytics Computation
  const storeStats = useMemo(() => {
    const storeMap: Record<string, { name: string; count: number; pieces: number; billed: number; unpaid: number }> = {};
    const itemMap: Record<string, { name: string; totalPieces: number; totalRevenue: number; topStore: string; storeCounts: Record<string, number> }> = {};

    invoices.forEach(inv => {
      const sName = inv.customerName || "Store";
      if (!storeMap[sName]) storeMap[sName] = { name: sName, count: 0, pieces: 0, billed: 0, unpaid: 0 };

      storeMap[sName].count += 1;
      storeMap[sName].billed += inv.totalAmount || 0;
      if (inv.status === "unpaid") storeMap[sName].unpaid += inv.totalAmount || 0;

      (inv.items || []).forEach((it: any) => {
        const iName = it.name || "Item";
        const qty = Number(it.qty) || 0;
        const amt = Number(it.amount) || (qty * (Number(it.rate) || 0));

        storeMap[sName].pieces += qty;

        if (!itemMap[iName]) itemMap[iName] = { name: iName, totalPieces: 0, totalRevenue: 0, topStore: "-", storeCounts: {} };
        itemMap[iName].totalPieces += qty;
        itemMap[iName].totalRevenue += amt;
        itemMap[iName].storeCounts[sName] = (itemMap[iName].storeCounts[sName] || 0) + qty;
      });
    });

    // Top store for each item
    Object.values(itemMap).forEach(im => {
      let maxQ = -1;
      let topS = "-";
      Object.entries(im.storeCounts).forEach(([s, q]) => {
        if (q > maxQ) { maxQ = q; topS = `${s} (${q} pcs)`; }
      });
      im.topStore = topS;
    });

    const storeList = Object.values(storeMap).sort((a, b) => b.billed - a.billed);
    const itemList = Object.values(itemMap).sort((a, b) => b.totalPieces - a.totalPieces);
    const totalDeliveredPieces = storeList.reduce((s, st) => s + st.pieces, 0);
    const totalBilledSales = storeList.reduce((s, st) => s + st.billed, 0);

    return {
      storeList,
      itemList,
      totalStoresCount: storeList.length,
      totalDeliveredPieces,
      totalBilledSales,
    };
  }, [invoices]);

  // Profit Calculation
  const profitStats = useMemo(() => {
    const gross = storeStats.totalBilledSales;
    const cogs = expensesTotal;
    const wages = salariesTotal;
    const net = gross - cogs - wages;
    const margin = gross > 0 ? ((net / gross) * 100).toFixed(1) : "0";
    return { gross, cogs, wages, net, margin };
  }, [storeStats.totalBilledSales, expensesTotal, salariesTotal]);

  // Give Advance to Helper
  function handleAddAdvance(helperId: string) {
    const amt = Number(advanceAmount);
    if (!amt || amt <= 0) return;
    setHelpers(prev => prev.map(h => h.id === helperId ? { ...h, advances: h.advances + amt } : h));
    setAdvanceHelperId(null);
    setAdvanceAmount("");
    toast({ title: "Advance Recorded! 💵", description: `₹${amt} logged for helper. Deducts from month-end payout.`, variant: "success" });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16">
      {/* ======================================================== */}
      {/* 1. TOP HEADER & MODE TOGGLE                              */}
      {/* ======================================================== */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-xs">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[#0F172A] leading-tight">
                  {business?.name || "B2B Supply Hub"}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                  B2B Wholesale Hub
                </span>
              </div>
              <p className="text-xs text-[#64748B]">B2B store dispatches, sales analytics &amp; take-home profit</p>
            </div>
          </div>

          {/* Right Mode Switcher */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center p-1 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
              <button
                type="button"
                onClick={onSwitchToCafeMode}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-all flex items-center gap-1.5 cursor-pointer"
                title="Switch to Cafe POS Mode"
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>Cafe POS</span>
              </button>

              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-white text-[#0F172A] shadow-xs border border-slate-200 transition-all flex items-center gap-1.5 cursor-default"
              >
                <Truck className="w-3.5 h-3.5 text-blue-600" />
                <span>B2B Supply</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* 2. TAB NAVIGATION */}
        <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-[#E2E8F0] shadow-2xs overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("dispatch")}
            className={cn(
              "flex-1 min-w-[130px] py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === "dispatch" ? "bg-[#2563EB] text-white shadow-xs" : "text-[#64748B] hover:bg-slate-50"
            )}
          >
            <Send className="w-4 h-4" />
            <span>New Dispatch Slip</span>
          </button>

          <button
            onClick={() => setActiveTab("stores")}
            className={cn(
              "flex-1 min-w-[130px] py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === "stores" ? "bg-[#2563EB] text-white shadow-xs" : "text-[#64748B] hover:bg-slate-50"
            )}
          >
            <Store className="w-4 h-4" />
            <span>Store Sales ({storeStats.totalStoresCount})</span>
          </button>

          <button
            onClick={() => setActiveTab("items")}
            className={cn(
              "flex-1 min-w-[130px] py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === "items" ? "bg-[#2563EB] text-white shadow-xs" : "text-[#64748B] hover:bg-slate-50"
            )}
          >
            <Award className="w-4 h-4" />
            <span>Which Item Sold Where</span>
          </button>

          <button
            onClick={() => setActiveTab("profit")}
            className={cn(
              "flex-1 min-w-[130px] py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === "profit" ? "bg-[#2563EB] text-white shadow-xs" : "text-[#64748B] hover:bg-slate-50"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Profit &amp; Margins</span>
          </button>

          <button
            onClick={() => setActiveTab("staff")}
            className={cn(
              "flex-1 min-w-[130px] py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === "staff" ? "bg-[#2563EB] text-white shadow-xs" : "text-[#64748B] hover:bg-slate-50"
            )}
          >
            <Users className="w-4 h-4" />
            <span>Operations Staff ({helpers.length})</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: QUICK STORE DISPATCH SLIP (MINIMAL REQUIRED ENTRY)*/}
        {/* ======================================================== */}
        {activeTab === "dispatch" && (
          <div className="space-y-6">
            {/* Store Selector Header Card (ui-ux-pro-max elevated card grid) */}
            <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="p-3.5 sm:p-5 border-b border-[#F1F5F9] bg-gradient-to-r from-slate-50/60 to-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <span className="px-2 py-0.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider shrink-0">
                    Step 01
                  </span>
                  <h2 className="text-xs sm:text-base font-extrabold text-[#0F172A] tracking-tight truncate">
                    <span className="hidden sm:inline">Select Delivery Store / Café</span>
                    <span className="sm:hidden">Select Café</span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setNewStoreModal(true)}
                  className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0 whitespace-nowrap ml-auto"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Add Client / Store</span>
                  <span className="sm:hidden">Add Store</span>
                </button>
              </div>

              <div className="p-5 space-y-3.5">
                {/* Search Filter if stores > 3 */}
                {stores.length > 3 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                    <div className="relative flex-1 max-w-sm">
                      <input
                        type="text"
                        placeholder="Search stores by name or phone..."
                        value={storeSearch}
                        onChange={(e) => setStoreSearch(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/60"
                      />
                    </div>
                    <span className="text-[11px] font-bold text-[#64748B] whitespace-nowrap">
                      Showing <strong className="text-[#0F172A]">{filteredStores.length}</strong> of {stores.length} stores
                    </span>
                  </div>
                )}

                {/* Store Grid Container */}
                <div className={cn(
                  "pr-1.5 scrollbar-thin",
                  filteredStores.length > 6 && "max-h-[420px] sm:max-h-[460px] overflow-y-auto"
                )}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredStores.map(st => {
                    const isSelected = selectedStoreId === st.id;

                    return (
                      <div
                        key={st.id}
                        onClick={() => setSelectedStoreId(st.id)}
                        className={cn(
                          "relative p-4 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between gap-3 group select-none",
                          isSelected
                            ? "bg-blue-50/40 border-blue-600 ring-2 ring-blue-600/30 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 transition-all shadow-2xs",
                              isSelected
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                            )}>
                              <Store size={16} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="font-extrabold text-xs text-[#0F172A] truncate tracking-tight font-sans whitespace-nowrap" title={formatCafeName(st.name)}>
                                  {formatCafeName(st.name)}
                                </h3>
                                {st.business_id && (
                                  <span className="px-1.5 py-0.2 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
                                    ⚡ SeyalPro
                                  </span>
                                )}
                              </div>
                              {st.address && (
                                <p className="text-[11px] text-[#64748B] flex items-center gap-1 truncate mt-0.5">
                                  <MapPin size={10} className="shrink-0 text-slate-400" />
                                  <span>{st.address}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black transition-all",
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "border border-slate-300 text-transparent group-hover:border-slate-400"
                          )}>
                            ✓
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          {st.phone ? (
                            <span className="text-[#64748B] font-mono flex items-center gap-1">
                              <Phone size={10} className="text-slate-400" />
                              <span>{st.phone}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No phone</span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                            Connected
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* B2B Bridge Partner Badge */}
                {isBridgeEnabled && (selectedStore as any)?.business_id && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800">
                    <ArrowRightLeft className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Connected {selectedStore.name}: Instant 1-click stock inward &amp; payment sync enabled!</span>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Bakery Items Stepper */}
            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="border-b border-[#E2E8F0] pb-3">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">Step 2</span>
                <h2 className="text-base font-bold text-[#0F172A]">Enter Bakery Items &amp; Counts</h2>
                <p className="text-xs text-[#64748B]">Tap + or type the quantity delivered to {selectedStore.name}</p>
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dispatchItems.map(item => (
                  <div
                    key={item.name}
                    className={cn(
                      "p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3",
                      item.qty > 0 ? "bg-[#EFF6FF] border-[#BFDBFE]" : "bg-[#F8FAFC] border-[#E2E8F0]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-[#0F172A]">{item.name}</div>
                        <div className="text-[11px] text-[#64748B] font-semibold">₹{item.rate} / piece</div>
                      </div>
                      {item.qty > 0 && (
                        <span className="font-extrabold text-xs text-[#2563EB]">
                          ₹{item.qty * item.rate}
                        </span>
                      )}
                    </div>

                    {/* Stepper Controls */}
                    <div className="flex items-center justify-between bg-white rounded-lg border border-slate-200 p-1">
                      <button
                        type="button"
                        onClick={() => updateItemQty(item.name, -5)}
                        className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700 cursor-pointer active:scale-95"
                        title="Minus 5"
                      >
                        -5
                      </button>

                      <button
                        type="button"
                        onClick={() => updateItemQty(item.name, -1)}
                        className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700 cursor-pointer active:scale-95"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <input
                        type="number"
                        min="0"
                        value={item.qty === 0 ? "" : item.qty}
                        onChange={e => setItemQtyDirect(item.name, Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-14 text-center font-black text-sm text-[#0F172A] outline-none bg-transparent"
                      />

                      <button
                        type="button"
                        onClick={() => updateItemQty(item.name, 1)}
                        className="w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 flex items-center justify-center font-bold text-[#2563EB] cursor-pointer active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => updateItemQty(item.name, 10)}
                        className="w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 flex items-center justify-center font-bold text-[10px] text-[#2563EB] cursor-pointer active:scale-95"
                        title="Plus 10"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Custom Item Quick Row */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  placeholder="Other bakery item (e.g. Muffin, Tart)..."
                  value={customItemName}
                  onChange={e => setCustomItemName(e.target.value)}
                  className="w-full sm:w-60 px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-800 outline-none"
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  value={customItemRate}
                  onChange={e => setCustomItemRate(e.target.value)}
                  className="w-full sm:w-28 px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-800 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCustomItem}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Add Item
                </button>
              </div>
            </div>

            {/* Bill Summary & 1-Click WhatsApp Trigger */}
            <div className="bg-[#0F172A] text-white p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Delivery Total for {formatCafeName(selectedStore.name)}
                </span>
                <div className="text-3xl font-black mt-1">
                  ₹{billTotalAmount.toLocaleString("en-IN")}
                  <span className="text-xs text-slate-300 font-normal ml-2">
                    ({billTotalPieces} pieces)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingBill || billTotalAmount === 0}
                  onClick={() => handleSaveDispatch(false)}
                  className="flex-1 sm:flex-none px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  Save Delivery Slip
                </button>

                <button
                  type="button"
                  disabled={isSavingBill || billTotalAmount === 0}
                  onClick={() => handleSaveDispatch(true)}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Bill on WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: STORE SALES & PENDING DUES                        */}
        {/* ======================================================== */}
        {activeTab === "stores" && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-5 space-y-4">
            <div className="border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">Store Deliveries &amp; Balance Dues</h2>
                <p className="text-xs text-[#64748B]">Total pieces supplied and pending collections per store</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#EFF6FF] text-[#1E3A8A]">
                {storeStats.storeList.length} Stores Tracked
              </span>
            </div>

            {storeStats.storeList.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                No delivery bills recorded yet. Create your first dispatch above!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {storeStats.storeList.map(st => (
                  <div key={st.name} className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans whitespace-nowrap">{formatCafeName(st.name)}</h3>
                      <span className="text-xs font-bold text-slate-500 whitespace-nowrap">{st.count} orders</span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-[10px] text-[#64748B] uppercase font-bold block">Pieces Delivered</span>
                        <span className="text-lg font-black text-[#0F172A]">{st.pieces.toLocaleString()} pcs</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#64748B] uppercase font-bold block">Total Billed</span>
                        <span className="text-lg font-black text-[#0F172A]">₹{st.billed.toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">Payment Status:</span>
                      {st.unpaid > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          ₹{st.unpaid.toLocaleString("en-IN")} Pending
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          All Paid ✅
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: WHICH ITEM SOLD WHERE                             */}
        {/* ======================================================== */}
        {activeTab === "items" && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-5 space-y-4">
            <div className="border-b border-[#E2E8F0] pb-3">
              <h2 className="text-base font-bold text-[#0F172A]">Which Item Sold Where</h2>
              <p className="text-xs text-[#64748B]">Breakdown of item sales across each client store</p>
            </div>

            {storeStats.itemList.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                No items sold yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {storeStats.itemList.map(item => (
                  <div key={item.name} className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🧁</span>
                        <div>
                          <div className="font-bold text-sm text-[#0F172A]">{item.name}</div>
                          <div className="text-[11px] text-[#64748B]">{item.totalPieces} pcs total (₹{item.totalRevenue.toLocaleString("en-IN")})</div>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Top: {item.topStore}
                      </span>
                    </div>

                    {/* Stores distribution */}
                    <div className="space-y-1.5 pt-1">
                      {Object.entries(item.storeCounts).map(([sName, count]) => {
                        const pct = item.totalPieces > 0 ? Math.round((count / item.totalPieces) * 100) : 0;
                        return (
                          <div key={sName} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700 whitespace-nowrap">{formatCafeName(sName)}</span>
                              <span className="font-bold text-[#0F172A] whitespace-nowrap">{count} pcs ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: PROFIT & MARGIN CALCULATOR                        */}
        {/* ======================================================== */}
        {activeTab === "profit" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-2xs">
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">1. Total Invoiced Sales</span>
                <div className="text-xl font-black text-[#0F172A] mt-1">₹{profitStats.gross.toLocaleString("en-IN")}</div>
                <p className="text-[11px] text-[#64748B]">All store delivery bills</p>
              </div>

              <div className="bg-[#FFFBEB] p-4 rounded-xl border border-[#FEF3C7] shadow-2xs">
                <span className="text-[10px] font-bold text-[#B45309] uppercase tracking-wider block">2. Baking &amp; Box Costs</span>
                <div className="text-xl font-black text-[#B45309] mt-1">₹{profitStats.cogs.toLocaleString("en-IN")}</div>
                <p className="text-[11px] text-[#B45309]">Ingredients &amp; delivery expenses</p>
              </div>

              <div className="bg-[#F5F3FF] p-4 rounded-xl border border-[#EDE9FE] shadow-2xs">
                <span className="text-[10px] font-bold text-[#6D28D9] uppercase tracking-wider block">3. Helper Staff Wages</span>
                <div className="text-xl font-black text-[#6D28D9] mt-1">₹{profitStats.wages.toLocaleString("en-IN")}</div>
                <p className="text-[11px] text-[#6D28D9]">Assistant &amp; runner payouts</p>
              </div>

              <div className="bg-[#F0FDF4] p-4 rounded-xl border border-[#BBF7D0] shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#15803D] uppercase tracking-wider block">4. Net Profit</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200 text-emerald-900">
                    {profitStats.margin}% Margin
                  </span>
                </div>
                <div className="text-xl font-black text-[#15803D] mt-1">₹{profitStats.net.toLocaleString("en-IN")}</div>
                <p className="text-[11px] text-[#16A34A]">Real take-home earnings</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] text-xs text-[#64748B] space-y-1">
              <div className="font-bold text-[#0F172A]">How is this calculated?</div>
              <div>Sales (₹{profitStats.gross}) minus Costs (₹{profitStats.cogs}) minus Wages (₹{profitStats.wages}) = <strong>₹{profitStats.net} Take-Home Profit</strong>.</div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: HELPER STAFF & WAGES                              */}
        {/* ======================================================== */}
        {activeTab === "staff" && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-5 space-y-4">
            <div className="border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">Helper Staff &amp; Wage Payouts</h2>
                <p className="text-xs text-[#64748B]">Track cash advances and send month-end WhatsApp salary slips</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {helpers.map(h => (
                <div key={h.id} className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-[#0F172A]">{h.name}</h3>
                      <p className="text-[11px] text-[#64748B]">{h.role}</p>
                    </div>
                    <span className="font-bold text-xs text-[#0F172A]">Base: ₹{h.salary}/mo</span>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase block">Advances Taken</span>
                      <span className="font-bold text-amber-700">₹{h.advances}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#64748B] uppercase block">Net Payout Due</span>
                      <span className="font-black text-emerald-700">₹{h.salary - h.advances}</span>
                    </div>
                  </div>

                  {advanceHelperId === h.id ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        placeholder="Advance amount (₹)"
                        value={advanceAmount}
                        onChange={e => setAdvanceAmount(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddAdvance(h.id)}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvanceHelperId(null)}
                        className="px-2 py-1.5 text-slate-500 text-xs shrink-0 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAdvanceHelperId(h.id)}
                        className="flex-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        + Give Advance
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const netPay = h.salary - h.advances;
                          const msg = encodeURIComponent(
                            `🧁 *Salary Slip*\nName: ${h.name} (${h.role})\nBase Pay: ₹${h.salary}\nAdvance Deducted: -₹${h.advances}\n*Net Payable: ₹${netPay}*\nStatus: Paid via UPI`
                          );
                          window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank");
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all cursor-pointer"
                      >
                        WhatsApp Slip
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* New Store Modal with 10-Digit Phone Enforcement */}
      {newStoreModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-extrabold text-base text-[#0F172A]">Add New Client Store</h3>
              <button
                type="button"
                onClick={() => setNewStoreModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Store Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chai Galli OMR"
                  value={newStoreName}
                  onChange={e => setNewStoreName(e.target.value)}
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
                    onChange={e => handleStorePhoneChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold text-[#0F172A] focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {newStorePhone.length === 10
                    ? "✓ Valid 10-digit Indian phone number"
                    : "Strictly 10 digits required for India (+91)"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewStoreModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateStore}
                className="flex-1 py-2.5 text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl cursor-pointer shadow-xs"
              >
                Save Store
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
