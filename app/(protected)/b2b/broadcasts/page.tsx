"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { supabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils/cn";
import { format, formatDistanceToNow } from "date-fns";
import {
  Radio,
  Send,
  AlertCircle,
  Clock,
  Package,
  Store,
  CheckCircle2,
  Trash2,
  Share2,
  Phone,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  Check,
  Percent,
  RefreshCw,
} from "lucide-react";
import { BakerProduct, INITIAL_BAKER_PRODUCTS } from "../products/page";
import { formatCafeName, DEFAULT_BAKER_SAMPLE_STORES, sanitizeBakerStores } from "@/lib/utils/bakerUtils";
import { fetchB2BClients, B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import { useB2BBroadcasts, usePublishBroadcastMutation } from "@/lib/hooks/useB2BData";

interface ClientStore {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  business_id?: string;
}

export interface BakerBroadcast {
  id: string;
  title: string;
  message: string;
  category: string;
  target_stores: string[]; // store ids or ["all"]
  target_store_names: string[];
  product_name?: string;
  quantity?: number;
  discount_rate?: number;
  status: "active" | "resolved";
  created_at: string;
}

const DEFAULT_STORES: ClientStore[] = [];

export default function BakerBroadcastsPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  const [stores, setStores] = useState<ClientStore[]>(DEFAULT_BAKER_SAMPLE_STORES);
  const [products, setProducts] = useState<BakerProduct[]>(INITIAL_BAKER_PRODUCTS);
  const [broadcasts, setBroadcasts] = useState<BakerBroadcast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "active" | "resolved">("all");

  // Composer Form
  const [topic, setTopic] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("memo");
  const [targetType, setTargetType] = useState<"all" | "specific">("all");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selectedProductName, setSelectedProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [discountRate, setDiscountRate] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Authoritative cloud broadcasts via TanStack Query
  const { data: cloudBroadcasts } = useB2BBroadcasts(bizId);
  const publishBroadcastMutation = usePublishBroadcastMutation(bizId);

  // Synchronize cloud broadcasts from TanStack Query
  useEffect(() => {
    if (cloudBroadcasts && Array.isArray(cloudBroadcasts) && cloudBroadcasts.length > 0) {
      setBroadcasts(cloudBroadcasts);
      try {
        localStorage.setItem(`bftone_baker_broadcasts_${bizId}`, JSON.stringify(cloudBroadcasts));
      } catch {}
    }
  }, [cloudBroadcasts, bizId]);
  useEffect(() => {
    try {
      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) {
        const parsed = JSON.parse(storedCusts);
        const cleaned = sanitizeBakerStores(parsed);
        if (cleaned.length > 0) {
          setStores(
            cleaned.map((c: any) => ({
              id: c.id,
              name: c.name,
              phone: c.phone || "",
              address: c.address || "",
              business_id: c.business_id,
            }))
          );
        }
      }
    } catch {}

    // Fetch live B2B clients from server
    if (bizId && bizId !== "default") {
      fetchB2BClients(bizId).then((serverClients) => {
        if (serverClients && serverClients.length > 0) {
          setStores(
            serverClients.map((c: any) => ({
              id: c.id,
              name: c.name,
              phone: c.phone || "",
              address: c.address || "",
              business_id: c.business_id,
            }))
          );
        }
      });
    }

    const handleStoresUpdated = (e: any) => {
      if (e?.detail?.clients) {
        setStores(
          e.detail.clients.map((c: any) => ({
            id: c.id,
            name: c.name,
            phone: c.phone || "",
            address: c.address || "",
            business_id: c.business_id,
          }))
        );
      }
    };
    window.addEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);

    try {
      const storedProds = localStorage.getItem(`bftone_baker_products_${bizId}`);
      if (storedProds) {
        const parsed = JSON.parse(storedProds);
        if (parsed.length > 0) setProducts(parsed);
      }

      const storedBroadcasts = localStorage.getItem(`bftone_baker_broadcasts_${bizId}`);
      if (storedBroadcasts) {
        const parsed = JSON.parse(storedBroadcasts);
        if (Array.isArray(parsed)) {
          // Clean historical broadcasts from any platform tenant names
          const sanitizedBc = parsed.map((b: any) => ({
            ...b,
            target_store_names: Array.isArray(b.target_store_names)
              ? b.target_store_names.map((name: string) => {
                  const nl = (name || "").toLowerCase();
                  if (nl.includes("navalur") || nl.includes("mongo")) return "Partner Cafe";
                  return name;
                })
              : [],
          }));
          setBroadcasts(sanitizedBc);
        }
      }
    } catch {}

    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [bizId]);

  const saveBroadcasts = (items: BakerBroadcast[]) => {
    setBroadcasts(items);
    try {
      localStorage.setItem(`bftone_baker_broadcasts_${bizId}`, JSON.stringify(items));
    } catch {}
  };

  const toggleStoreSelection = (id: string) => {
    setSelectedStoreIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const resolvedTargetStores = useMemo(() => {
    if (targetType === "all") return stores;
    return stores.filter((s) => selectedStoreIds.includes(s.id));
  }, [stores, targetType, selectedStoreIds]);

  const selectedStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreIds[0]) || null;
  }, [stores, selectedStoreIds]);

  const seyalProConnectedStores = useMemo(() => {
    return stores.filter((s) => Boolean(s.business_id));
  }, [stores]);

  const canSendInAppNotification = useMemo(() => {
    if (targetType === "all") {
      return seyalProConnectedStores.length > 0;
    }
    return Boolean(selectedStore?.business_id);
  }, [targetType, seyalProConnectedStores, selectedStore]);

  // Handle Send via Server-Side Admin API (bypasses RLS across tenants)
  const handleSendBroadcast = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Validation Error", description: "Please enter a title and message." });
      return;
    }

    if (targetType === "specific" && selectedStoreIds.length === 0) {
      toast({ title: "Recipient Required", description: "Please select at least one client store." });
      return;
    }

    setIsSending(true);

    try {
      const targetStoreNames = resolvedTargetStores.map((s) => formatCafeName(s.name));
      const targetIds = targetType === "all" ? ["all"] : selectedStoreIds;

      const effectiveCategory = topic.trim() || selectedCategory || "memo";

      const newBroadcast: BakerBroadcast = {
        id: `bc-${Date.now()}`,
        title: title.trim(),
        message: message.trim(),
        category: effectiveCategory,
        target_stores: targetIds,
        target_store_names: targetStoreNames,
        product_name: selectedProductName ? selectedProductName : undefined,
        quantity: quantity ? parseInt(quantity, 10) : undefined,
        discount_rate: discountRate ? parseFloat(discountRate) : undefined,
        status: "active",
        created_at: new Date().toISOString(),
      };

      // Only dispatch in-app notifications to SeyalPro linked stores
      const targetBusinessIds = targetType === "all"
        ? seyalProConnectedStores.map((s) => s.business_id as string)
        : (selectedStore?.business_id ? [selectedStore.business_id] : []);

      if (targetBusinessIds.length === 0) {
        toast({
          title: "External Client Only",
          description: "This store does not use the SeyalPro app. Please share this advisory via WhatsApp.",
          variant: "error",
        });
        setIsSending(false);
        return;
      }

      // 1. Dispatch cross-tenant broadcast via backend API
      const res = await fetch("/api/baker/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_business_id: business?.id,
          sender_name: business?.name || "Central Kitchen",
          target_type: targetType,
          target_store_ids: targetBusinessIds,
          target_store_names: targetStoreNames,
          title: title.trim(),
          message: message.trim(),
          category: effectiveCategory,
          product_name: selectedProductName || undefined,
          quantity: quantity ? parseInt(quantity, 10) : undefined,
          discount_rate: discountRate ? parseFloat(discountRate) : undefined,
        }),
      });

      const apiResult = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiResult.error || "Failed to dispatch broadcast");
      }

      // 2. Save to local broadcast feed & persist to Supabase via TanStack mutation
      const updated = [newBroadcast, ...broadcasts];
      saveBroadcasts(updated);
      publishBroadcastMutation.mutateAsync(newBroadcast).catch((err) => {
        console.warn("Cloud broadcast note:", err);
      });

      toast({
        title: "Broadcast Published!",
        description: `Delivered live to ${apiResult.targets?.join(", ") || `${resolvedTargetStores.length} shop(s)`}.`,
      });

      // Reset form fields cleanly (NO auto-text!)
      setTitle("");
      setMessage("");
      setTopic("");
      setQuantity("");
      setDiscountRate("");
      setSelectedProductName("");
    } catch (err: any) {
      console.error("Broadcast error", err);
      toast({
        title: "Published Locally",
        description: "Advisory saved to your local broadcast feed and offline storage.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleStatus = (id: string) => {
    const updated = broadcasts.map((b) =>
      b.id === id ? { ...b, status: (b.status === "active" ? "resolved" : "active") as "active" | "resolved" } : b
    );
    saveBroadcasts(updated);
    toast({ title: "Status Updated", description: "Advisory status updated." });
  };

  const handleDeleteBroadcast = (id: string) => {
    const updated = broadcasts.filter((b) => b.id !== id);
    saveBroadcasts(updated);
    toast({ title: "Advisory Deleted", description: "Advisory removed from history." });
  };

  const handleOpenWhatsApp = (b: BakerBroadcast) => {
    const targetStore = stores.find((s) => b.target_stores.includes(s.id)) || resolvedTargetStores[0];
    const phone = targetStore?.phone ? targetStore.phone.replace(/[^0-9]/g, "") : "";
    
    let text = `*SeyalPro B2B Advisory*\n`;
    text += `*${b.title}*\n\n`;
    text += `${b.message}\n\n`;
    if (b.product_name) text += `📦 *Item:* ${b.product_name}\n`;
    if (b.quantity) text += `🔢 *Available Qty:* ${b.quantity} pcs\n`;
    if (b.discount_rate) text += `🏷️ *Offer Rate:* ₹${b.discount_rate} / pc\n`;
    text += `\n_Sent via SeyalPro Central Kitchen Dispatch_`;

    const encoded = encodeURIComponent(text);
    const url = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    window.open(url, "_blank");
  };

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return broadcasts;
    return broadcasts.filter((b) => b.status === historyFilter);
  }, [broadcasts, historyFilter]);

  return (
    <div className="w-full max-w-6xl group-data-[sidebar-collapsed=true]:max-w-none mx-auto space-y-6">
      {/* Top Header Card - docks cleanly below AppShell mobile header on mobile */}
      <div className="sticky top-14 md:top-0 z-20 w-full px-1 sm:px-2 md:px-0 bg-[#F8FAFC] pt-1.5 sm:pt-2 md:pt-3 pb-2.5 sm:pb-3 transition-all">
        <div className="w-full px-3.5 sm:px-5 py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 bg-white rounded-3xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <Link
              href="/b2b"
              className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold transition-colors shrink-0"
              title="Back to Dispatch Hub"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight">
                  Client Broadcasts &amp; Alerts
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                  SeyalPro B2B
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block mt-0.5">
                Notify connected SeyalPro client stores about surplus stock, delays, and fresh batches
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5 shadow-2xs">
              <Store size={14} className="text-blue-600" />
              <span>{stores.length} B2B Customer Stores</span>
            </span>
            <Link
              href="/b2b/customers"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
              title="Add or manage your bakery's customer stores"
            >
              <span>+ Manage Client Stores</span>
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      <div className="w-full px-1 sm:px-2 md:px-0 pt-1 pb-6 space-y-5 sm:space-y-6">
        {/* Quick Operational Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Client Shops</p>
              <h4 className="text-2xl font-black text-[#0F172A] mt-0.5">{stores.length}</h4>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Store size={20} />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Active Advisories</p>
              <h4 className="text-2xl font-black text-rose-600 mt-0.5">
                {broadcasts.filter((b) => b.status === "active").length}
              </h4>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Radio size={20} className="animate-pulse" />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Dispatched</p>
              <h4 className="text-2xl font-black text-emerald-600 mt-0.5">{broadcasts.length}</h4>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </div>
        </div>

        {/* Main 2-Column Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Create Broadcast Composer (7 cols) */}
          <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-3xl border border-[#E2E8F0] shadow-xs space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  <Send size={15} />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-[#0F172A] tracking-tight">
                    Compose Client Notification
                  </h2>
                  <p className="text-[11px] text-[#64748B]">
                    Delivers in-app alert to client store SeyalPro apps &amp; notification bells
                  </p>
                </div>
              </div>
            </div>

            {/* Step 1: Topic or Advisory Type */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                1. Advisory Topic / Type
              </label>

              {/* Manual Topic Typing Input */}
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Type advisory topic (e.g. Break time, Oven Maintenance, Delivery Delay, Surplus Stock...)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-2xs"
              />
            </div>

            {/* Step 2: Target Stores (Dropdown for Specific Store) */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                2. Target Recipient Stores
              </label>
              <div className="inline-flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 max-w-full overflow-x-auto scrollbar-none">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("all");
                    setSelectedStoreIds([]);
                  }}
                  className={cn(
                    "px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0",
                    targetType === "all"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Store size={14} className="shrink-0" />
                  <span>All Connected SeyalPro Stores ({seyalProConnectedStores.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("specific")}
                  className={cn(
                    "px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0",
                    targetType === "specific"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Filter size={14} className="shrink-0" />
                  <span>Specific Store</span>
                </button>
              </div>

              {targetType === "specific" && (
                <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2.5 animate-in fade-in-50 duration-150">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Choose Recipient Store:
                    </label>
                    {selectedStoreIds.length > 0 && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                        1 Store Selected
                      </span>
                    )}
                  </div>

                  {/* Dropdown Selector */}
                  <SelectDropdown
                    value={selectedStoreIds[0] || ""}
                    onChange={(val) => {
                      setSelectedStoreIds(val ? [val] : []);
                    }}
                    options={[
                      { value: "", label: "-- Click to Select Store from Dropdown --" },
                      ...stores.map((st) => ({
                        value: st.id,
                        label: formatCafeName(st.name),
                        sublabel: st.phone ? `Phone: ${st.phone}` : undefined,
                        badge: st.business_id ? "⚡ SeyalPro App" : "📱 WhatsApp",
                        badgeVariant: st.business_id ? ("info" as const) : ("default" as const),
                        icon: <Store size={13} className="text-slate-400" />,
                      })),
                    ]}
                    size="md"
                    placeholder="Click to select store..."
                    searchPlaceholder="Search store..."
                  />

                  {selectedStoreIds[0] && (
                    <div className="p-2.5 bg-white rounded-xl border border-blue-200/80 flex items-center justify-between text-xs shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                          ✓
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-slate-900 truncate">
                              {formatCafeName(selectedStore?.name || "")}
                            </p>
                            {selectedStore?.business_id ? (
                              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
                                ⚡ SeyalPro App Linked
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200">
                                📱 External Client (WhatsApp Only)
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">
                            {selectedStore?.address || selectedStore?.phone || "Client Partner"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedStoreIds([])}
                        className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors ml-2 shrink-0 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional Item Specifics for Surplus Stock */}
            {(selectedCategory === "surplus" || selectedCategory === "restock") && (
              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                  Optional Product &amp; Surplus Details
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Product</label>
                    <SelectDropdown
                      value={selectedProductName}
                      onChange={(val) => setSelectedProductName(val)}
                      options={[
                        { value: "", label: "Select Item (Optional)" },
                        ...products.map((p) => ({
                          value: p.name,
                          label: p.name,
                          icon: <Package size={13} className="text-slate-400" />,
                        })),
                      ]}
                      size="sm"
                      placeholder="Select item..."
                      searchPlaceholder="Search product..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Available Qty (Pcs)</label>
                    <input
                      type="number"
                      placeholder="e.g. 10"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Offer Rate (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 25"
                      value={discountRate}
                      onChange={(e) => setDiscountRate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Message Title & Body (Clean inputs, NO auto text!) */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">
                  Notification Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cakes not deliverable tomorrow / Afternoon dispatch delayed"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-2xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">
                  Message Body <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type the message you want to send to client store(s)..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-2xs"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 space-y-2.5">
              {/* Informational banner when target is external (no client app) */}
              {!canSendInAppNotification && targetType === "specific" && selectedStore && (
                <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex items-start gap-2.5 text-xs text-amber-900 shadow-2xs">
                  <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-[12px] text-amber-950">
                      External Client — No SeyalPro App Connected
                    </p>
                    <p className="text-[11px] text-amber-850 leading-relaxed">
                      In-app notifications are only delivered to stores using the SeyalPro app. Since <strong className="text-amber-950 font-bold">{formatCafeName(selectedStore.name)}</strong> is an external client, dispatch this advisory directly via WhatsApp.
                    </p>
                  </div>
                </div>
              )}

              {!canSendInAppNotification && targetType === "all" && stores.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex items-start gap-2.5 text-xs text-amber-900 shadow-2xs">
                  <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-[12px] text-amber-950">
                      No SeyalPro Connected Stores
                    </p>
                    <p className="text-[11px] text-amber-850 leading-relaxed">
                      None of your registered clients are linked to a SeyalPro account yet. Link them in <Link href="/b2b/customers" className="underline font-bold text-blue-700">Client Ledgers</Link> to enable live in-app notifications.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                {/* Send Notification to Client Apps - ONLY shown for SeyalPro linked stores */}
                {canSendInAppNotification && (
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={handleSendBroadcast}
                    className="flex-1 h-11 sm:h-12 px-4 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs hover:shadow flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50 whitespace-nowrap min-w-0"
                  >
                    {isSending ? (
                      <RefreshCw size={16} className="animate-spin shrink-0" />
                    ) : (
                      <Send size={16} className="shrink-0" />
                    )}
                    <span>Send In-App Notification</span>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-black bg-blue-700/90 text-blue-100 border border-blue-400/30 shrink-0">
                      {targetType === "all"
                        ? `${seyalProConnectedStores.length} ${seyalProConnectedStores.length === 1 ? "Store" : "Stores"}`
                        : formatCafeName(selectedStore?.name || "1 Store")}
                    </span>
                  </button>
                )}

                {/* WhatsApp advisory button */}
                <button
                  type="button"
                  onClick={() => {
                    const targetStore = resolvedTargetStores[0];
                    const phone = targetStore?.phone ? targetStore.phone.replace(/[^0-9]/g, "") : "";
                    let text = `*SeyalPro B2B Advisory*\n*${title}*\n\n${message}\n`;
                    if (selectedProductName) text += `📦 Item: ${selectedProductName}\n`;
                    if (quantity) text += `🔢 Qty: ${quantity} pcs\n`;
                    if (discountRate) text += `🏷️ Offer Price: ₹${discountRate}\n`;
                    const url = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(text).catch(() => {});
                    }
                    window.open(url, "_blank");
                  }}
                  className={cn(
                    "h-11 sm:h-12 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap active:scale-[0.98] shadow-2xs shrink-0",
                    !canSendInAppNotification
                      ? "w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                      : "w-full sm:w-auto bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                  )}
                >
                  <Share2 size={16} className={cn("shrink-0", canSendInAppNotification ? "text-emerald-600" : "text-white")} />
                  <span>
                    {!canSendInAppNotification
                      ? "Send Advisory via WhatsApp"
                      : "Share via WhatsApp"}
                  </span>
                  {!canSendInAppNotification && selectedStore && (
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-black bg-emerald-700/90 text-emerald-100 border border-emerald-400/30 shrink-0 truncate max-w-[120px]">
                      {formatCafeName(selectedStore.name)}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Sent Advisories Feed (5 cols) */}
          <div className="lg:col-span-5 bg-white p-4 sm:p-5 rounded-3xl border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Radio size={16} className="text-blue-600 shrink-0" />
                <h3 className="text-xs sm:text-sm font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                  Broadcast History ({broadcasts.length})
                </h3>
              </div>

              {/* Filter */}
              <div className="flex items-center gap-1 text-[11px] font-bold bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setHistoryFilter("all")}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                    historyFilter === "all" ? "bg-white text-slate-800 shadow-2xs font-extrabold" : "text-slate-500"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter("active")}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                    historyFilter === "active" ? "bg-white text-rose-600 shadow-2xs font-extrabold" : "text-slate-500"
                  )}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter("resolved")}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                    historyFilter === "resolved" ? "bg-white text-emerald-600 shadow-2xs font-extrabold" : "text-slate-500"
                  )}
                >
                  Done
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1 scrollbar-thin">
              {filteredHistory.map((b) => {
                const isSurplus = b.category === "surplus";
                const isDelay = b.category === "delay";
                const isRestock = b.category === "restock";

                return (
                  <div
                    key={b.id}
                    className={cn(
                      "p-3.5 rounded-2xl border transition-all space-y-2.5",
                      b.status === "active"
                        ? isSurplus
                          ? "bg-rose-50/50 border-rose-200"
                          : isDelay
                          ? "bg-amber-50/50 border-amber-200"
                          : isRestock
                          ? "bg-emerald-50/50 border-emerald-200"
                          : "bg-blue-50/50 border-blue-200"
                        : "bg-slate-50 border-slate-200 opacity-75"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                              b.status === "active"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-200 text-slate-700"
                            )}
                          >
                            {b.status === "active" ? "Live Advisory" : "Resolved"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-xs text-[#0F172A] mt-1 tracking-tight">
                          {b.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(b.id)}
                          title={b.status === "active" ? "Mark as Resolved" : "Re-activate"}
                          className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-slate-800 transition-colors"
                        >
                          <CheckCircle2 size={14} className={b.status === "resolved" ? "text-emerald-600" : ""} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(b)}
                          title="Share to WhatsApp"
                          className="p-1 rounded-lg hover:bg-white text-emerald-600 transition-colors"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBroadcast(b.id)}
                          title="Delete"
                          className="p-1 rounded-lg hover:bg-white text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {b.message}
                    </p>

                    {/* Product & Qty specifics if present */}
                    {(b.product_name || b.quantity) && (
                      <div className="p-2 bg-white/90 rounded-xl border border-slate-200 flex items-center justify-between text-[11px] font-bold">
                        <span>{b.product_name || "Custom Batch"}</span>
                        <div className="flex items-center gap-2">
                          {b.quantity && <span className="text-slate-600">{b.quantity} pcs</span>}
                          {b.discount_rate && <span className="text-emerald-600">₹{b.discount_rate} / pc</span>}
                        </div>
                      </div>
                    )}

                    {/* Recipient stores */}
                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#64748B]">
                      <span className="truncate">
                        Target:{" "}
                        <strong className="text-slate-700">
                          {b.target_stores.includes("all")
                            ? "All Client Stores"
                            : b.target_store_names.join(", ")}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredHistory.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                  No announcements found in this view.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
