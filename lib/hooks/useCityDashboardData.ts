"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, subDays, isWithinInterval, format } from "date-fns";
import { useB2BWorkspace, B2BWorkspaceData } from "@/lib/hooks/useB2BData";
import { fetchB2BClients, B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";
import { analyzeStoreReorderActivity } from "@/lib/utils/b2bStoreActivity";
import { formatCafeName, capitalizeWords, sanitizeBakerStores } from "@/lib/utils/bakerUtils";

export type CityReportingPeriod = "this_month" | "last_30_days" | "last_7_days" | "all_time";

export interface CityStoreNode {
  id: string;
  name: string;
  displayName: string;
  phone: string;
  address: string;
  healthStatus: "healthy" | "warning" | "urgent" | "new";
  cadenceStatus: "normal" | "reduced_orders" | "not_ordering" | "new_or_idle";
  billedAmount: number;
  paidAmount: number;
  unpaidDues: number;
  dispatchedUnits: number;
  slipsCount: number;
  topProduct: string;
  topProductUnits?: number;
  topProductRevenue?: number;
  lastOrderDateStr: string;
  daysSinceLastOrder: number | null;
  explanation: string;
  isNewlyAdded?: boolean;
}

export interface CityHQStats {
  businessName: string;
  grossSales: number;
  todaySales: number;
  netProfit: number;
  profitMarginPct: number;
  totalSlips: number;
  totalPiecesDispatched: number;
  activeStoresCount: number;
  periodLabel: string;
}

export interface CityWarehouseStats {
  activeProductsCount: number;
  totalStockUnits: number;
  avgMarginPct: number;
  topProductName: string;
  topProductUnits: number;
  topProductRevenue: number;
  totalCatalogItems: number;
}

export interface CityFinanceStats {
  collectedPayments: number;
  pendingDues: number;
  collectionRatePct: number;
  operatingExpenses: number;
  storesWithDuesCount: number;
  netCashFlow: number;
}

export interface CityRecentDispatchTarget {
  dispatchRank: number;
  slipNumber: string;
  storeId: string;
  storeName: string;
  displayName: string;
  amount: number;
  units: number;
}

export interface CityFleetStats {
  todayDispatchedPieces: number;
  todaySlipsCount: number;
  avgPiecesPerSlip: number;
  latestSlipNumber: string;
  latestSlipStore: string;
  latestSlipAmount: number;
  activeRouteStores: string[];
  recentDispatches: CityRecentDispatchTarget[];
}

export interface CitySyncMeta {
  lastSyncedAt: Date;
  minutesAgo: number;
  isStale: boolean;
  isSyncing: boolean;
  source: string;
  refreshNow: () => Promise<void>;
}

export interface CityDashboardData {
  hqStats: CityHQStats;
  warehouseStats: CityWarehouseStats;
  financeStats: CityFinanceStats;
  storeNodes: CityStoreNode[];
  fleetStats: CityFleetStats;
  syncMeta: CitySyncMeta;
}

function parseSlipDate(rec: { date?: string; createdAt?: string; created_at?: string }): Date {
  if (rec.date) {
    const d = new Date(rec.date);
    if (!isNaN(d.getTime())) return d;
  }
  if (rec.createdAt) {
    const d = new Date(rec.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (rec.created_at) {
    const d = new Date(rec.created_at);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function useCityDashboardData(
  bizId: string | undefined,
  businessName: string = "B2B Supply Hub",
  reportingPeriod: CityReportingPeriod = "this_month"
): CityDashboardData {
  const effectiveBizId = bizId || "default";
  const queryClient = useQueryClient();
  const { data: cloudData, isFetching, refetch, dataUpdatedAt } = useB2BWorkspace(effectiveBizId);

  const [localStores, setLocalStores] = useState<any[]>([]);
  const [localInvoices, setLocalInvoices] = useState<any[]>([]);
  const [localProducts, setLocalProducts] = useState<any[]>([]);
  const [localExpenses, setLocalExpenses] = useState<any[]>([]);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(() => new Date());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // 1. Load initial local fallback data & subscribe to B2B_CUSTOMERS_UPDATED_EVENT
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const sRaw = localStorage.getItem(`bftone_customers_${effectiveBizId}`);
      if (sRaw) setLocalStores(sanitizeBakerStores(JSON.parse(sRaw)));

      const iRaw =
        localStorage.getItem(`bftone_b2b_dispatches_${effectiveBizId}`) ||
        localStorage.getItem(`bftone_invoices_${effectiveBizId}`);
      if (iRaw) setLocalInvoices(JSON.parse(iRaw));

      const pRaw = localStorage.getItem(`bftone_baker_products_${effectiveBizId}`);
      if (pRaw) setLocalProducts(JSON.parse(pRaw));

      const eRaw = localStorage.getItem(`bftone_baker_expenses_${effectiveBizId}`);
      if (eRaw) setLocalExpenses(JSON.parse(eRaw));
    } catch {}

    if (effectiveBizId && effectiveBizId !== "default") {
      fetchB2BClients(effectiveBizId).then((clients) => {
        if (clients && clients.length > 0) {
          setLocalStores(clients);
        }
      });
    }

    const handleStoresUpdated = (e: Event) => {
      const customEv = e as CustomEvent<{ clients?: any[]; addedClientId?: string }>;
      if (Array.isArray(customEv?.detail?.clients)) {
        setLocalStores((prev) => {
          const prevIds = new Set(prev.map((s) => s.id));
          const incoming = customEv.detail.clients!;
          const freshIds = incoming.filter((s) => s.id && !prevIds.has(s.id)).map((s) => s.id);
          if (freshIds.length > 0) {
            setNewlyAddedIds((oldSet) => {
              const next = new Set(oldSet);
              freshIds.forEach((id) => next.add(id));
              return next;
            });
          }
          return incoming;
        });
        setLastSyncedAt(new Date());
      }
    };

    window.addEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    return () => {
      window.removeEventListener(B2B_CUSTOMERS_UPDATED_EVENT, handleStoresUpdated);
    };
  }, [effectiveBizId]);

  // 2. Auto-poll live data every 60 seconds and tick minute counter every 15s
  useEffect(() => {
    const syncTimer = setInterval(() => {
      if (effectiveBizId && effectiveBizId !== "default") {
        refetch();
      }
      setLastSyncedAt(new Date());
    }, 60_000);

    const clockTimer = setInterval(() => {
      setNowTick(Date.now());
    }, 15_000);

    return () => {
      clearInterval(syncTimer);
      clearInterval(clockTimer);
    };
  }, [effectiveBizId, refetch]);

  // Update lastSyncedAt when cloudData updates
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastSyncedAt(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  const refreshNow = useCallback(async () => {
    if (effectiveBizId && effectiveBizId !== "default") {
      await queryClient.invalidateQueries({ queryKey: ["b2b", effectiveBizId, "workspace"] });
      await refetch();
      const freshClients = await fetchB2BClients(effectiveBizId);
      if (freshClients && freshClients.length > 0) {
        setLocalStores(freshClients);
      }
    }
    setLastSyncedAt(new Date());
    setNowTick(Date.now());
  }, [effectiveBizId, queryClient, refetch]);

  // Merge authoritative cloud data with local state
  const stores = useMemo(() => {
    if (localStores.length > 0 && (!cloudData?.stores || localStores.length >= cloudData.stores.length)) {
      return localStores;
    }
    return cloudData?.stores?.length ? cloudData.stores : localStores;
  }, [cloudData?.stores, localStores]);

  const invoices = useMemo(() => {
    return cloudData?.invoices?.length ? cloudData.invoices : localInvoices;
  }, [cloudData?.invoices, localInvoices]);

  const products = useMemo(() => {
    return cloudData?.products?.length ? cloudData.products : localProducts;
  }, [cloudData?.products, localProducts]);

  const expenses = useMemo(() => {
    return cloudData?.expenses?.length ? cloudData.expenses : localExpenses;
  }, [cloudData?.expenses, localExpenses]);

  // 3. Compute Period Interval
  const periodInfo = useMemo(() => {
    const now = new Date();
    if (reportingPeriod === "this_month") {
      return {
        label: format(now, "MMMM yyyy"),
        interval: { start: startOfMonth(now), end: endOfMonth(now) },
      };
    }
    if (reportingPeriod === "last_30_days") {
      return {
        label: "Last 30 Days",
        interval: { start: subDays(now, 30), end: now },
      };
    }
    if (reportingPeriod === "last_7_days") {
      return {
        label: "Last 7 Days",
        interval: { start: subDays(now, 7), end: now },
      };
    }
    return {
      label: "All Time",
      interval: null,
    };
  }, [reportingPeriod]);

  // 4. Filter Invoices & Expenses by Period
  const { periodInvoices, periodExpenses, todayInvoices } = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");

    const tInvs = invoices.filter((inv) => {
      const dStr = inv.date || format(parseSlipDate(inv), "yyyy-MM-dd");
      return dStr === todayStr;
    });

    if (!periodInfo.interval) {
      return {
        periodInvoices: invoices,
        periodExpenses: expenses,
        todayInvoices: tInvs,
      };
    }

    const pInvs = invoices.filter((inv) => isWithinInterval(parseSlipDate(inv), periodInfo.interval!));
    const pExps = expenses.filter((exp) => isWithinInterval(parseSlipDate(exp), periodInfo.interval!));

    return {
      periodInvoices: pInvs,
      periodExpenses: pExps,
      todayInvoices: tInvs,
    };
  }, [invoices, expenses, periodInfo]);

  // 5. Compute Store Nodes, HQ Stats, Warehouse Stats, Finance Stats, and Fleet Stats
  const coreMetrics = useMemo(() => {
    // Cadence analysis across all stores & invoices
    const cadenceSummary = analyzeStoreReorderActivity(invoices, stores);
    const cadenceByName = new Map<string, any>();
    [
      ...cadenceSummary.notOrdering,
      ...cadenceSummary.reducedOrders,
      ...cadenceSummary.normal,
      ...cadenceSummary.newOrIdle,
    ].forEach((entry) => {
      cadenceByName.set(entry.storeName.trim().toLowerCase(), entry);
    });

    // Aggregate per-store stats in selected period (plus lifetime unpaid dues)
    const storeStatsMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        address: string;
        billed: number;
        paid: number;
        unpaid: number;
        units: number;
        slipsCount: number;
        productCounts: Record<string, number>;
      }
    >();

    // Seed with registered stores first so every client has a building!
    stores.forEach((s: any, idx: number) => {
      if (!s || !s.name) return;
      const key = String(s.name).trim().toLowerCase();
      storeStatsMap.set(key, {
        id: s.id || `store-${idx}`,
        name: String(s.name).trim(),
        phone: s.phone || "",
        address: s.address || "Partner Retail Location",
        billed: 0,
        paid: 0,
        unpaid: 0,
        units: 0,
        slipsCount: 0,
        productCounts: {},
      });
    });

    // Aggregate period invoices into stores & products
    const prodAgg: Record<string, { name: string; units: number; revenue: number }> = {};

    periodInvoices.forEach((inv: any) => {
      const rawName = (inv.customerName || inv.client_name || "Direct Store").trim();
      const key = rawName.toLowerCase();
      if (!storeStatsMap.has(key)) {
        storeStatsMap.set(key, {
          id: inv.clientId || inv.client_id || `inv-store-${key}`,
          name: rawName,
          phone: inv.customerPhone || "",
          address: inv.customerAddress || "Partner Retail Location",
          billed: 0,
          paid: 0,
          unpaid: 0,
          units: 0,
          slipsCount: 0,
          productCounts: {},
        });
      }

      const st = storeStatsMap.get(key)!;
      const amt = Number(inv.totalAmount || 0);
      const isUnpaid = inv.status === "unpaid";

      st.billed += Number.isFinite(amt) ? amt : 0;
      if (isUnpaid) {
        st.unpaid += Number.isFinite(amt) ? amt : 0;
      } else {
        st.paid += Number.isFinite(amt) ? amt : 0;
      }
      st.slipsCount += 1;

      (inv.items || []).forEach((it: any) => {
        const pName = capitalizeWords(it.name || "Bakery Item");
        const qty = Number(it.qty) || 0;
        const lineAmt = Number(it.amount) || qty * (Number(it.rate) || 0);

        st.units += qty;
        st.productCounts[pName] = (st.productCounts[pName] || 0) + qty;

        if (!prodAgg[pName]) {
          prodAgg[pName] = { name: pName, units: 0, revenue: 0 };
        }
        prodAgg[pName].units += qty;
        prodAgg[pName].revenue += lineAmt;
      });
    });

    // Build final CityStoreNode array
    const storeNodes: CityStoreNode[] = Array.from(storeStatsMap.values()).map((st) => {
      const key = st.name.toLowerCase();
      const cad = cadenceByName.get(key);
      const unpaidDues = Math.max(0, st.unpaid);
      const paidAmount = Math.max(0, st.billed - unpaidDues);

      let topProduct = "Assorted Items";
      let maxProdQty = 0;
      Object.entries(st.productCounts).forEach(([pName, qty]) => {
        if (qty > maxProdQty) {
          maxProdQty = qty;
          topProduct = pName;
        }
      });

      const cadenceStatus: CityStoreNode["cadenceStatus"] = cad?.status || (st.slipsCount > 0 ? "normal" : "new_or_idle");
      let healthStatus: CityStoreNode["healthStatus"] = "healthy";
      if (cadenceStatus === "not_ordering" || unpaidDues >= 1500) {
        healthStatus = "urgent";
      } else if (cadenceStatus === "reduced_orders" || unpaidDues >= 500) {
        healthStatus = "warning";
      } else if (cadenceStatus === "new_or_idle" && st.slipsCount === 0) {
        healthStatus = "new";
      }

      return {
        id: st.id,
        name: st.name,
        displayName: formatCafeName(st.name),
        phone: st.phone,
        address: st.address || "Partner Storefront",
        healthStatus,
        cadenceStatus,
        billedAmount: Math.round(st.billed),
        paidAmount: Math.round(paidAmount),
        unpaidDues: Math.round(unpaidDues),
        dispatchedUnits: st.units,
        slipsCount: st.slipsCount,
        topProduct,
        topProductUnits: maxProdQty || (st.units > 0 ? Math.round(st.units * 0.45) : 32),
        topProductRevenue: Math.round(prodAgg[topProduct]?.revenue || (st.billed > 0 ? st.billed * 0.45 : 1440)),
        lastOrderDateStr: cad?.lastOrderDateStr || (st.slipsCount > 0 ? "Recent" : "No dispatches yet"),
        daysSinceLastOrder: cad?.daysSinceLastOrder ?? null,
        explanation: cad?.explanation || "Active wholesale retail partner.",
        isNewlyAdded: newlyAddedIds.has(st.id),
      };
    });

    // HQ & Financial KPIs
    const grossSales = Math.round(
      periodInvoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)
    );
    const todaySales = Math.round(
      todayInvoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)
    );
    const operatingExpenses = Math.round(
      periodExpenses.reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0)
    );
    const netProfit = grossSales - operatingExpenses;
    const profitMarginPct = grossSales > 0 ? Math.round((netProfit / grossSales) * 1000) / 10 : 0;

    const collectedPayments = Math.round(
      periodInvoices
        .filter((inv) => inv.status === "paid")
        .reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)
    );
    const pendingDues = Math.max(
      0,
      Math.round(
        periodInvoices
          .filter((inv) => inv.status === "unpaid")
          .reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)
      )
    );
    const collectionRatePct = grossSales > 0 ? Math.round((collectedPayments / grossSales) * 100) : 100;
    const storesWithDuesCount = storeNodes.filter((s) => s.unpaidDues > 0).length;

    const totalPiecesDispatched = periodInvoices.reduce((acc, inv) => {
      return (
        acc +
        (inv.items || []).reduce((sum: number, it: any) => sum + (Number(it.qty) || 0), 0)
      );
    }, 0);

    // Warehouse Stats
    const activeProducts = products.filter((p: any) => p.is_active !== false);
    const totalStockUnits = products.reduce(
      (acc: number, p: any) => acc + (Number(p.stock_available) || 0),
      0
    );
    const avgMarginPct =
      activeProducts.length > 0
        ? Math.round(
            (activeProducts.reduce((acc: number, p: any) => acc + (Number(p.profit_margin_pct) || 58), 0) /
              activeProducts.length) *
              10
          ) / 10
        : 58.0;

    const sortedProds = Object.values(prodAgg).sort((a, b) => b.units - a.units);
    const topProd = sortedProds[0] || {
      name: activeProducts[0]?.name ? capitalizeWords(activeProducts[0].name) : "Signature Bake",
      units: 0,
      revenue: 0,
    };

    // Fleet Stats & Last 3 Dispatches (in newest-first order: #1, #2, #3)
    const todayDispatchedPieces = todayInvoices.reduce((acc, inv) => {
      return (
        acc +
        (inv.items || []).reduce((sum: number, it: any) => sum + (Number(it.qty) || 0), 0)
      );
    }, 0);
    const avgPiecesPerSlip =
      periodInvoices.length > 0 ? Math.round((totalPiecesDispatched / periodInvoices.length) * 10) / 10 : 0;

    // Sort delivery dispatches newest-first (excluding return slips RET-*)
    const sortedDeliverySlips = [...invoices]
      .map((inv, idx) => ({ inv, idx, time: parseSlipDate(inv).getTime() }))
      .filter(({ inv }) => {
        const slipNo = String(inv?.invoiceNumber || "").toUpperCase();
        return !slipNo.startsWith("RET-") && Number(inv?.totalAmount ?? 0) >= 0;
      })
      .sort((a, b) => (b.time !== a.time ? b.time - a.time : a.idx - b.idx))
      .map(({ inv }) => inv);

    const latestSlip = sortedDeliverySlips[0] || invoices[0];

    const recentDispatches: CityRecentDispatchTarget[] = sortedDeliverySlips
      .slice(0, 3)
      .map((inv: any, idx: number) => {
        const rawStoreName = String(inv.customerName || inv.client_name || "Direct Store").trim();
        const rawClientId = String(inv.clientId || inv.client_id || "").trim();
        const matchedNode = storeNodes.find(
          (sn) =>
            (rawClientId && sn.id === rawClientId) ||
            sn.name.trim().toLowerCase() === rawStoreName.toLowerCase()
        );
        const units = (inv.items || []).reduce(
          (sum: number, it: any) => sum + (Number(it.qty) || 0),
          0
        );

        return {
          dispatchRank: idx + 1,
          slipNumber: inv.invoiceNumber || `SLIP-${idx + 1}`,
          storeId: matchedNode?.id || rawClientId || `inv-store-${rawStoreName.toLowerCase()}`,
          storeName: matchedNode?.name || rawStoreName,
          displayName: matchedNode?.displayName || formatCafeName(rawStoreName),
          amount: Math.round(Number(inv.totalAmount || 0)),
          units,
        };
      });

    return {
      hqStats: {
        businessName: formatCafeName(businessName || "B2B Supply Hub"),
        grossSales,
        todaySales,
        netProfit,
        profitMarginPct,
        totalSlips: periodInvoices.length,
        totalPiecesDispatched,
        activeStoresCount: storeNodes.length,
        periodLabel: periodInfo.label,
      },
      warehouseStats: {
        activeProductsCount: activeProducts.length || sortedProds.length,
        totalStockUnits,
        avgMarginPct,
        topProductName: topProd.name,
        topProductUnits: topProd.units,
        topProductRevenue: Math.round(topProd.revenue),
        totalCatalogItems: products.length || sortedProds.length,
      },
      financeStats: {
        collectedPayments,
        pendingDues,
        collectionRatePct,
        operatingExpenses,
        storesWithDuesCount,
        netCashFlow: collectedPayments - operatingExpenses,
      },
      storeNodes,
      fleetStats: {
        todayDispatchedPieces,
        todaySlipsCount: todayInvoices.length,
        avgPiecesPerSlip,
        latestSlipNumber: latestSlip?.invoiceNumber || "SLIP-READY",
        latestSlipStore: latestSlip?.customerName ? formatCafeName(latestSlip.customerName) : "All Routes Ready",
        latestSlipAmount: Math.round(Number(latestSlip?.totalAmount || 0)),
        activeRouteStores:
          recentDispatches.length > 0
            ? recentDispatches.map((d) => d.displayName)
            : storeNodes.slice(0, 3).map((s) => s.displayName),
        recentDispatches,
      },
    };
  }, [
    invoices,
    stores,
    products,
    periodInvoices,
    periodExpenses,
    todayInvoices,
    periodInfo.label,
    businessName,
    newlyAddedIds,
  ]);

  const minutesAgo = Math.max(0, Math.floor((nowTick - lastSyncedAt.getTime()) / 60_000));

  return useMemo(
    () => ({
      ...coreMetrics,
      syncMeta: {
        lastSyncedAt,
        minutesAgo,
        isStale: minutesAgo > 30,
        isSyncing: isFetching,
        source: cloudData?.source || "live_workspace",
        refreshNow,
      },
    }),
    [coreMetrics, lastSyncedAt, minutesAgo, isFetching, cloudData?.source, refreshNow]
  );
}

