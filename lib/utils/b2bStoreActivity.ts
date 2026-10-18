import { getSlipDate } from "@/app/(protected)/b2b/customers/page";

export interface StoreActivityAnalysis {
  storeId: string;
  storeName: string;
  phone: string;
  address?: string;
  status: "not_ordering" | "reduced_orders" | "normal" | "new_or_idle";
  daysSinceLastOrder: number | null;
  lastOrderDateStr: string | null;
  typicalIntervalDays: number | null;
  totalOrdersLifetime: number;
  recentOrdersCount: number; // Last 30 days
  priorOrdersCount: number;  // Previous 30-60 days
  dropPercentage: number;    // % drop in order count
  recentVolumePieces: number;
  priorVolumePieces: number;
  explanation: string;
}

export interface StoreActivitySummary {
  notOrdering: StoreActivityAnalysis[];
  reducedOrders: StoreActivityAnalysis[];
  normal: StoreActivityAnalysis[];
  newOrIdle: StoreActivityAnalysis[];
  totalStoresCount: number;
}

/**
 * Calculates median of an array of numbers.
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pure deterministic calculation to detect:
 * 1. Stores that are NOT ordering (exceeded cadence or inactive > 7 days)
 * 2. Stores that have REDUCED order counts (last 30 days vs prior 30 days)
 */
export function analyzeStoreReorderActivity(
  invoices: any[],
  stores: any[] = []
): StoreActivitySummary {
  const now = new Date();
  const nowMs = now.getTime();
  const msInDay = 1000 * 60 * 60 * 24;

  const thirtyDaysAgoMs = nowMs - 30 * msInDay;
  const sixtyDaysAgoMs = nowMs - 60 * msInDay;

  // Build a unique store list, including both stores table and distinct customerNames from invoices
  const storeMap = new Map<string, { id: string; name: string; phone: string; address?: string }>();

  // 1. Seed with registered partner stores
  for (const s of stores) {
    if (!s || !s.name) continue;
    const key = s.name.trim().toLowerCase();
    storeMap.set(key, {
      id: s.id || `store-${key}`,
      name: s.name.trim(),
      phone: s.phone || "",
      address: s.address || "",
    });
  }

  // 2. Discover any customerName in invoices not yet in stores table
  for (const inv of invoices) {
    const rawName = (inv.customerName || "").trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();
    if (!storeMap.has(key)) {
      storeMap.set(key, {
        id: `inv-${key}`,
        name: rawName,
        phone: inv.customerPhone || "",
        address: inv.customerAddress || "",
      });
    }
  }

  const notOrdering: StoreActivityAnalysis[] = [];
  const reducedOrders: StoreActivityAnalysis[] = [];
  const normal: StoreActivityAnalysis[] = [];
  const newOrIdle: StoreActivityAnalysis[] = [];

  for (const [, store] of storeMap.entries()) {
    const storeKey = store.name.toLowerCase();

    // Filter only delivery slips for this store (exclude returns)
    const storeSlips = invoices.filter((inv) => {
      const invCustomer = (inv.customerName || "").toLowerCase().trim();
      const isRet = Boolean(
        inv.isReturn ||
        (inv.invoiceNumber || "").startsWith("RET-") ||
        (inv.title || "").includes("RETURN") ||
        (inv.totalAmount || 0) < 0
      );
      return invCustomer === storeKey && !isRet;
    });

    // Sort chronologically ascending
    storeSlips.sort((a, b) => getSlipDate(a).getTime() - getSlipDate(b).getTime());

    const totalOrdersLifetime = storeSlips.length;

    // Case A: Store has 0 recorded dispatches
    if (totalOrdersLifetime === 0) {
      newOrIdle.push({
        storeId: store.id,
        storeName: store.name,
        phone: store.phone,
        address: store.address,
        status: "new_or_idle",
        daysSinceLastOrder: null,
        lastOrderDateStr: null,
        typicalIntervalDays: null,
        totalOrdersLifetime: 0,
        recentOrdersCount: 0,
        priorOrdersCount: 0,
        dropPercentage: 0,
        recentVolumePieces: 0,
        priorVolumePieces: 0,
        explanation: "No wholesale dispatches recorded yet for this client.",
      });
      continue;
    }

    // Most recent dispatch
    const lastSlip = storeSlips[storeSlips.length - 1];
    const lastOrderDate = getSlipDate(lastSlip);
    const lastOrderDateMs = lastOrderDate.getTime();
    const daysSinceLastOrder = Math.max(0, Math.floor((nowMs - lastOrderDateMs) / msInDay));
    const lastOrderDateStr = lastSlip.date || lastOrderDate.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

    // Calculate sequential inter-order intervals (in days)
    const intervals: number[] = [];
    for (let i = 1; i < storeSlips.length; i++) {
      const prevDate = getSlipDate(storeSlips[i - 1]);
      const currDate = getSlipDate(storeSlips[i]);
      const diffDays = Math.max(1, Math.round((currDate.getTime() - prevDate.getTime()) / msInDay));
      intervals.push(diffDays);
    }

    const typicalIntervalDays = intervals.length > 0 ? Math.round(calculateMedian(intervals)) : null;

    // Partition orders into Recent (Last 30 Days) vs Prior (Days 31-60)
    let recentOrdersCount = 0;
    let priorOrdersCount = 0;
    let recentVolumePieces = 0;
    let priorVolumePieces = 0;

    for (const slip of storeSlips) {
      const slipMs = getSlipDate(slip).getTime();
      const itemsCount = Array.isArray(slip.items)
        ? slip.items.reduce((sum: number, it: any) => sum + (Number(it.qty) || 0), 0)
        : 1;

      if (slipMs >= thirtyDaysAgoMs) {
        recentOrdersCount++;
        recentVolumePieces += itemsCount;
      } else if (slipMs >= sixtyDaysAgoMs && slipMs < thirtyDaysAgoMs) {
        priorOrdersCount++;
        priorVolumePieces += itemsCount;
      }
    }

    let dropPercentage = 0;
    if (priorOrdersCount > 0) {
      dropPercentage = Math.round(((priorOrdersCount - recentOrdersCount) / priorOrdersCount) * 100);
    }

    // Determine Classification:
    // 1. Not Ordering:
    //    - If client had a regular cadence (typicalIntervalDays) and daysSinceLastOrder is > 1.6x that interval AND >= 6 days
    //    - OR if daysSinceLastOrder >= 10 days
    const isCadenceOverdue = typicalIntervalDays ? (daysSinceLastOrder > Math.max(6, typicalIntervalDays * 1.6)) : daysSinceLastOrder >= 10;

    if (daysSinceLastOrder >= 7 && isCadenceOverdue) {
      const explanation = typicalIntervalDays
        ? `Not ordered for ${daysSinceLastOrder} days (usual cadence: every ${typicalIntervalDays} days).`
        : `No orders for ${daysSinceLastOrder} days since last dispatch on ${lastOrderDateStr}.`;

      notOrdering.push({
        storeId: store.id,
        storeName: store.name,
        phone: store.phone,
        address: store.address,
        status: "not_ordering",
        daysSinceLastOrder,
        lastOrderDateStr,
        typicalIntervalDays,
        totalOrdersLifetime,
        recentOrdersCount,
        priorOrdersCount,
        dropPercentage,
        recentVolumePieces,
        priorVolumePieces,
        explanation,
      });
      continue;
    }

    // 2. Reduced Order Counts:
    //    - If client had solid prior history (>= 2 orders in previous period) and recent count dropped by >= 30%
    //    - OR if volume pieces dropped by >= 40%
    if (priorOrdersCount >= 2 && (dropPercentage >= 30 || (priorVolumePieces > 0 && ((priorVolumePieces - recentVolumePieces) / priorVolumePieces) >= 0.4))) {
      const explanation = `Order count dropped by ${dropPercentage}%: ${recentOrdersCount} orders in the last 30 days (down from ${priorOrdersCount} orders previously).`;

      reducedOrders.push({
        storeId: store.id,
        storeName: store.name,
        phone: store.phone,
        address: store.address,
        status: "reduced_orders",
        daysSinceLastOrder,
        lastOrderDateStr,
        typicalIntervalDays,
        totalOrdersLifetime,
        recentOrdersCount,
        priorOrdersCount,
        dropPercentage,
        recentVolumePieces,
        priorVolumePieces,
        explanation,
      });
      continue;
    }

    // 3. Normal / Active
    normal.push({
      storeId: store.id,
      storeName: store.name,
      phone: store.phone,
      address: store.address,
      status: "normal",
      daysSinceLastOrder,
      lastOrderDateStr,
      typicalIntervalDays,
      totalOrdersLifetime,
      recentOrdersCount,
      priorOrdersCount,
      dropPercentage,
      recentVolumePieces,
      priorVolumePieces,
      explanation: `Ordering regularly. Last dispatch ${daysSinceLastOrder} day${daysSinceLastOrder === 1 ? "" : "s"} ago.`,
    });
  }

  // Sort by urgency:
  // Not ordering: highest days since last order first
  notOrdering.sort((a, b) => (b.daysSinceLastOrder || 0) - (a.daysSinceLastOrder || 0));

  // Reduced orders: highest drop percentage first
  reducedOrders.sort((a, b) => b.dropPercentage - a.dropPercentage);

  return {
    notOrdering,
    reducedOrders,
    normal,
    newOrIdle,
    totalStoresCount: storeMap.size,
  };
}
