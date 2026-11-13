/**
 * Baker Mode Shared Helpers & Typography Formatters
 */
import { format } from "date-fns";

/**
 * Smart formatting for Cafe / Store names.
 * Ensures acronyms like BFT, OMR, ECR, GST are uppercase,
 * and all words are capitalized properly with premium typography handling.
 * Example: "bft mambakkam" -> "BFT Mambakkam", "bft omr" -> "BFT OMR"
 */
export function formatCafeName(str: string): string {
  if (!str) return "";
  const acronyms = new Set(["bft", "omr", "ecr", "gst", "pos", "hq", "iit", "tcs", "cts", "b2b"]);
  return str
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      // Check if word or cleaned word matches an acronym
      const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (acronyms.has(clean)) {
        return word.toUpperCase();
      }
      // Handle hyphenated words like "Tea-Navalur"
      if (word.includes("-")) {
        return word
          .split("-")
          .map((w) => {
            const c = w.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (acronyms.has(c)) return w.toUpperCase();
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          })
          .join("-");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Capitalize item / product names cleanly.
 */
export function capitalizeWords(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export interface BakerCustomerStore {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  business_id?: string;
}

/**
 * Default sample B2B customer shops for a bakery business.
 * Distinct from SeyalPro platform accounts.
 */
export const DEFAULT_BAKER_SAMPLE_STORES: BakerCustomerStore[] = [
  { id: "cust-chai", name: "Chai Galli Cafe", phone: "+91 91234 56789", address: "Thoraipakkam, Chennai" },
  { id: "cust-corner", name: "The Corner Roast", phone: "+91 99887 76655", address: "Sholinganallur, Chennai" },
];

/**
 * Validates baker customer store objects and ensures valid name and id.
 * Preserves user-linked stores (including BFT Navalur and other SeyalPro partners).
 */
export function sanitizeBakerStores(stores: any[]): BakerCustomerStore[] {
  if (!Array.isArray(stores)) return [];
  return stores.filter((s) => {
    if (!s || typeof s !== "object") return false;
    if (!s.id || !s.name || !String(s.name).trim()) return false;
    return true;
  });
}

/**
 * Helper to reliably extract a Date object from any slip/invoice object format.
 */
export function getSlipDate(slip: any): Date {
  if (!slip) return new Date();
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

/**
 * Date preset interval helper for B2B Customer Analytics and Ledger views.
 */
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



