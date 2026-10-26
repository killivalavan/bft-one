"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils/cn";
import {
  Boxes, Plus, Trash2, Edit3, TrendingUp, Sparkles,
  ArrowRight, Search, Check, RefreshCw, DollarSign, Package
} from "lucide-react";
import { useB2BProducts, useSaveProductMutation } from "@/lib/hooks/useB2BData";

export interface BakerProduct {
  id: string;
  name: string;
  selling_price: number;
  rate?: number;
  price?: number;
  making_cost: number;
  unit_profit: number;
  profit_margin_pct: number;
  unit: string;
  is_active: boolean;
  category?: string;
  min_order_qty?: number;
  stock_available?: number;
}

export function capitalizeWords(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeBakerProduct(p: any): BakerProduct {
  if (!p) {
    return {
      id: `bp-${Date.now()}`,
      name: "Product Item",
      selling_price: 0,
      rate: 0,
      making_cost: 0,
      unit_profit: 0,
      profit_margin_pct: 0,
      unit: "Pcs",
      is_active: true,
    };
  }

  const rawPrice = Number(p.selling_price !== undefined && p.selling_price !== null ? p.selling_price : (p.rate ?? p.price ?? 0));
  const validPrice = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;

  const rawCost = Number(p.making_cost !== undefined && p.making_cost !== null ? p.making_cost : (validPrice > 0 ? Math.round(validPrice * 0.42) : 0));
  const validCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;

  const rawProfit = Number(p.unit_profit !== undefined && p.unit_profit !== null ? p.unit_profit : (validPrice - validCost));
  const validProfit = Number.isFinite(rawProfit) ? rawProfit : validPrice - validCost;

  const rawMargin = Number(
    p.profit_margin_pct !== undefined && p.profit_margin_pct !== null
      ? p.profit_margin_pct
      : (validPrice > 0 ? Math.round(((validProfit / validPrice) * 100) * 10) / 10 : 0)
  );
  const validMargin = Number.isFinite(rawMargin) ? rawMargin : 0;

  return {
    id: String(p.id || `bp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`),
    name: capitalizeWords(String(p.name || "Bakery Item")),
    selling_price: validPrice,
    rate: validPrice,
    making_cost: validCost,
    unit_profit: validProfit,
    profit_margin_pct: validMargin,
    unit: String(p.unit || "Pcs"),
    is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
    category: p.category || "General",
    min_order_qty: Number(p.min_order_qty || 1),
    stock_available: Number(p.stock_available || 0),
  };
}

export const INITIAL_BAKER_PRODUCTS: BakerProduct[] = [
  { id: "bp-1", name: "Choco Walnut Brownie", selling_price: 45, making_cost: 20, unit_profit: 25, profit_margin_pct: 55.6, unit: "Pcs", is_active: true },
  { id: "bp-2", name: "Classic Tea Cake", selling_price: 30, making_cost: 12, unit_profit: 18, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },
  { id: "bp-3", name: "Rich Jam Cake", selling_price: 35, making_cost: 14, unit_profit: 21, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },
  { id: "bp-4", name: "Banana Walnut Bread", selling_price: 50, making_cost: 22, unit_profit: 28, profit_margin_pct: 56.0, unit: "Pcs", is_active: true },
  { id: "bp-5", name: "Choco Chip Cookies (Box)", selling_price: 60, making_cost: 25, unit_profit: 35, profit_margin_pct: 58.3, unit: "Box", is_active: true },
  { id: "bp-6", name: "Vanilla Cupcake", selling_price: 30, making_cost: 11, unit_profit: 19, profit_margin_pct: 63.3, unit: "Pcs", is_active: true },
];

export default function BakerProductsPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const bizId = business?.id || "default";

  const [products, setProducts] = useState<BakerProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<BakerProduct | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [makingCost, setMakingCost] = useState("");
  const [unit, setUnit] = useState("Pcs");

  // Authoritative cloud products via TanStack Query
  const { data: cloudProducts } = useB2BProducts(bizId);
  const saveProductMutation = useSaveProductMutation(bizId);

  // Load from local storage cache initially
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`bftone_baker_products_${bizId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed.map(normalizeBakerProduct));
          return;
        }
      }
      setProducts(INITIAL_BAKER_PRODUCTS.map(normalizeBakerProduct));
    } catch {
      setProducts(INITIAL_BAKER_PRODUCTS.map(normalizeBakerProduct));
    }
  }, [bizId]);

  // Synchronize cloud products from TanStack Query
  useEffect(() => {
    if (cloudProducts && Array.isArray(cloudProducts) && cloudProducts.length > 0) {
      const normalized = cloudProducts.map(normalizeBakerProduct);
      setProducts(normalized);
      try {
        localStorage.setItem(`bftone_baker_products_${bizId}`, JSON.stringify(normalized));
      } catch {}
    }
  }, [cloudProducts, bizId]);

  const saveProductsToStorage = (updated: BakerProduct[]) => {
    const normalizedList = updated.map(normalizeBakerProduct);
    setProducts(normalizedList);
    try {
      localStorage.setItem(`bftone_baker_products_${bizId}`, JSON.stringify(normalizedList));
    } catch {}

    // Asynchronously push to Supabase via TanStack mutation
    if (normalizedList.length > 0) {
      const lastModified = normalizedList[0];
      saveProductMutation.mutateAsync({
        id: lastModified.id,
        name: lastModified.name,
        selling_price: lastModified.selling_price,
        rate: lastModified.selling_price,
        making_cost: lastModified.making_cost,
        unit_profit: lastModified.unit_profit,
        profit_margin_pct: lastModified.profit_margin_pct,
        unit: lastModified.unit,
        is_active: lastModified.is_active,
        category: lastModified.category,
      }).catch((e) => console.warn("Cloud product note:", e));
    }
  };

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setName("");
    setSellingPrice("");
    setMakingCost("");
    setUnit("Pcs");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: BakerProduct) => {
    setEditingProduct(p);
    setName(p.name);
    setSellingPrice(String(p.selling_price));
    setMakingCost(String(p.making_cost));
    setUnit(p.unit);
    setIsModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const sPrice = parseFloat(sellingPrice);
    const mCost = parseFloat(makingCost) || 0;

    if (!name.trim() || isNaN(sPrice) || sPrice <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter product name and valid selling price.",
        variant: "error",
      });
      return null;
    }

    const uProfit = sPrice - mCost;
    const marginPct = sPrice > 0 ? parseFloat(((uProfit / sPrice) * 100).toFixed(1)) : 0;
    const cleanName = capitalizeWords(name);

    if (editingProduct) {
      const updated = products.map((p) =>
        p.id === editingProduct.id
          ? {
              ...p,
              name: cleanName,
              selling_price: sPrice,
              making_cost: mCost,
              unit_profit: uProfit,
              profit_margin_pct: marginPct,
              unit,
            }
          : p
      );
      saveProductsToStorage(updated);
      toast({ title: "Product Updated! 📦", description: `${cleanName} updated with ₹${uProfit} unit profit.` });
    } else {
      const newProd: BakerProduct = {
        id: `bp-${Date.now()}`,
        name: cleanName,
        selling_price: sPrice,
        making_cost: mCost,
        unit_profit: uProfit,
        profit_margin_pct: marginPct,
        unit,
        is_active: true,
      };
      const updated = [newProd, ...products];
      saveProductsToStorage(updated);
      toast({ title: "Product Created! 📦", description: `${cleanName} added with ₹${uProfit} unit profit.` });
    }

    setIsModalOpen(false);
  };

  const handleDeleteProduct = async (id: string, prodName: string) => {
    const ok = await confirm({
      title: "Remove Product",
      description: `Are you sure you want to remove "${prodName}" from the catalog?`,
      confirmLabel: "Remove Product",
      variant: "danger",
    });
    if (!ok) return;
    const updated = products.filter((p) => p.id !== id);
    saveProductsToStorage(updated);
    toast({ title: "Product Removed", description: `${prodName} deleted from catalog.` });
  };

  const handleToggleActive = (id: string) => {
    const updated = products.map((p) => (p.id === id ? { ...p, is_active: !p.is_active } : p));
    saveProductsToStorage(updated);
  };

  // Metrics
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const avgMargin =
    products.length > 0
      ? (products.reduce((acc, p) => acc + p.profit_margin_pct, 0) / products.length).toFixed(1)
      : "0";

  const highestProfitItem = products.length > 0
    ? [...products].sort((a, b) => b.unit_profit - a.unit_profit)[0]
    : null;

  // Real-time Preview in Modal
  const previewSelling = parseFloat(sellingPrice) || 0;
  const previewCost = parseFloat(makingCost) || 0;
  const previewProfit = previewSelling - previewCost;
  const previewMargin = previewSelling > 0 ? ((previewProfit / previewSelling) * 100).toFixed(1) : "0";

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Top Header Card */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              <Package size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-base sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                  Product Catalog &amp; Costing
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 whitespace-nowrap">
                  {products.length} Items
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">
                Manage unit selling prices, production costs, and per-item profit margins
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/b2b/dispatch"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-1 sm:gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
            >
              <span>Go to Sales Entry</span>
              <ArrowRight size={13} className="shrink-0" />
            </Link>
            <button
              onClick={handleOpenAddModal}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={14} className="shrink-0" />
              <span>Add Product</span>
            </button>
          </div>
        </div>
      </div>
        {/* Metric Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Active Catalog</p>
              <h3 className="text-2xl font-black text-[#0F172A] mt-0.5">{products.filter((p) => p.is_active).length} Products</h3>
              <p className="text-xs text-emerald-600 font-semibold mt-1">Available for café delivery</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Package size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Average Profit Margin</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-0.5">{avgMargin}%</h3>
              <p className="text-xs text-[#64748B] font-semibold mt-1">Across all baked items</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <TrendingUp size={20} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Top Earner Per Unit</p>
              <h3 className="text-base font-black text-[#0F172A] mt-0.5 truncate max-w-[170px]" title={highestProfitItem?.name}>
                {highestProfitItem?.name || "None"}
              </h3>
              <p className="text-xs text-emerald-600 font-bold mt-1">
                +₹{highestProfitItem?.unit_profit || 0} profit / {highestProfitItem?.unit || "unit"}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Sparkles size={20} />
            </div>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <span className="text-xs text-[#64748B] font-semibold">
            Showing <strong className="text-[#0F172A]">{filteredProducts.length}</strong> items
          </span>
        </div>

        {/* MOBILE VIEW: Vertical Card Feed (Zero horizontal scrolling; scroll vertically to view all details) */}
        <div className="md:hidden space-y-3">
          {filteredProducts.map((p) => {
            const capName = capitalizeWords(p.name);
            return (
              <div
                key={p.id}
                className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3 transition-all"
              >
                {/* Header: Icon, Name, Unit, and Actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700 shrink-0">
                      <Package size={16} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-sm text-[#0F172A] leading-snug truncate" title={capName}>
                        {capName}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-bold text-[#64748B]">Per {p.unit}</span>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p.id)}
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer",
                            p.is_active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          )}
                        >
                          {p.is_active ? "Active" : "Inactive"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(p)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200/60 transition-all cursor-pointer"
                      title="Edit Product"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(p.id, p.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/60 transition-all cursor-pointer"
                      title="Delete Product"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 4-Stat Financial Grid (All metrics visible vertically) */}
                <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Selling</span>
                    <span className="text-xs font-black text-[#0F172A] mt-0.5 block truncate">₹{p.selling_price ?? p.rate ?? 0}</span>
                  </div>
                  <div className="min-w-0 border-l border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Cost</span>
                    <span className="text-xs font-semibold text-slate-600 mt-0.5 block truncate">₹{p.making_cost ?? 0}</span>
                  </div>
                  <div className="min-w-0 border-l border-slate-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block truncate">Profit</span>
                    <span className="text-xs font-black text-emerald-600 mt-0.5 block truncate">+₹{p.unit_profit ?? 0}</span>
                  </div>
                  <div className="min-w-0 border-l border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Margin</span>
                    <span className="text-xs font-black text-emerald-700 mt-0.5 block truncate">{p.profit_margin_pct ?? 0}%</span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] text-center text-[#64748B]">
              <p className="font-bold text-sm">No catalog products found.</p>
              <p className="text-xs text-slate-400 mt-1">Tap &ldquo;Add Product&rdquo; to add your products.</p>
            </div>
          )}
        </div>

        {/* DESKTOP VIEW: Full Table (Visible on md and larger) */}
        <div className="hidden md:block bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] sm:text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                  <th className="py-3 px-4 min-w-[200px]">Product Name</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Unit</th>
                  <th className="py-3 px-4 whitespace-nowrap">Selling Price (₹)</th>
                  <th className="py-3 px-4 whitespace-nowrap">Cost to Make (₹)</th>
                  <th className="py-3 px-4 whitespace-nowrap">Profit / Unit (₹)</th>
                  <th className="py-3 px-3 whitespace-nowrap">Margin %</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 min-w-[200px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700 font-bold shrink-0">
                          <Package size={14} />
                        </div>
                        <p className="font-extrabold text-sm text-[#0F172A] leading-snug">
                          {capitalizeWords(p.name)}
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-[#64748B] font-bold text-center whitespace-nowrap">{p.unit || "Unit"}</td>
                    <td className="py-3.5 px-4 font-black text-[#0F172A] whitespace-nowrap">₹{p.selling_price ?? p.rate ?? 0}</td>
                    <td className="py-3.5 px-4 font-semibold text-[#64748B] whitespace-nowrap">₹{p.making_cost ?? 0}</td>
                    <td className="py-3.5 px-4 font-black text-emerald-600 whitespace-nowrap">
                      +₹{p.unit_profit ?? 0}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {p.profit_margin_pct ?? 0}%
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(p.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer",
                          p.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                        )}
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(p)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
                          title="Edit Product"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(p.id, p.name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                          title="Delete Product"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#64748B]">
                      <p className="font-bold text-sm">No catalog items found.</p>
                      <p className="text-xs text-slate-400 mt-1">Click &ldquo;Add Product&rdquo; to add new products.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <Package size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0F172A]">
                    {editingProduct ? "Edit Product" : "New Catalog Product"}
                  </h3>
                  <p className="text-xs text-[#64748B]">Set item name, selling price & production cost</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Pack or Item Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold capitalize"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#0F172A] block mb-1">
                    Selling Price (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    placeholder="40"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-black text-[#0F172A]"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Charged to client / store</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0F172A] block mb-1">
                    Production Cost (₹)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="18"
                    value={makingCost}
                    onChange={(e) => setMakingCost(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Materials, packaging, direct cost</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-1">Unit of Measurement</label>
                <div className="flex gap-2">
                  {["Pcs", "Box", "Kg", "Slice"].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={cn(
                        "flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                        unit === u
                          ? "bg-[#0F172A] text-white border-[#0F172A]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Profit Preview Badge */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">Per Item Net Profit</p>
                  <p className="text-lg font-black text-emerald-700 mt-0.5">
                    ₹{previewProfit > 0 ? previewProfit : 0} <span className="text-xs font-bold">/ {unit}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">Margin</span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-black bg-emerald-200/60 text-emerald-900 border border-emerald-300">
                    {previewMargin}%
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-[#2563EB] hover:bg-blue-700 transition-all shadow-xs cursor-pointer"
                >
                  {editingProduct ? "Save Changes" : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
