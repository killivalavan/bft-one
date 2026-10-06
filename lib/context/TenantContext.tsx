"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";

export interface Business {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  signature_url?: string | null;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  currency_symbol: string;
  timezone: string;
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_radius_meters: number;
  geofence_enabled: boolean;
  enabled_modules: Record<string, boolean>;
  plan_type: string;
  max_users: number;
  is_active: boolean;
}

export const DEFAULT_BUSINESS: Business = {
  id: "a0000000-0000-0000-0000-000000000001",
  name: "Brown fening tea",
  slug: "bft-navalur",
  logo_url: "/dummy-logo.svg",
  signature_url: "/default-signature.svg",
  address: "255, Rajiv Gandhi Salai (OMR), Navalur,\nChennai,\nTamil Nadu, India - 600130",
  phone: "+91 98765 43210",
  gstin: "",
  currency_symbol: "₹",
  timezone: "Asia/Kolkata",
  geofence_lat: 12.8439,
  geofence_lng: 80.2268,
  geofence_radius_meters: 150,
  geofence_enabled: true,
  enabled_modules: {
    billing: true,
    invoices: true,
    sales: true,
    expenses: true,
    timesheet: true,
    stock: true,
    salary: true,
    contacts: true,
  },
  plan_type: "pro",
  max_users: 50,
  is_active: true,
};

interface TenantContextType {
  business: Business;
  loading: boolean;
  isModuleEnabled: (moduleName: string) => boolean;
  refreshBusiness: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
  business: DEFAULT_BUSINESS,
  loading: true,
  isModuleEnabled: () => true,
  refreshBusiness: async () => {},
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [business, setBusiness] = useState<Business>(() => {
    // 1. Initial warm start from localStorage ONLY if matching active cookie
    try {
      if (typeof window !== "undefined") {
        const cookieMatch = document.cookie.match(/tenant_slug=([^;]+)/);
        const cookieSlug = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        const cached = localStorage.getItem("bftone_tenant_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!cookieSlug || parsed.slug === cookieSlug) {
            return parsed;
          }
        }
      }
    } catch {}
    return DEFAULT_BUSINESS;
  });
  const [loading, setLoading] = useState(true);

  /**
   * Extract tenant slug from subdomain.
   * E.g. "navalur.bftone.com" → "navalur"
   *       "mongo-s.bft-one.vercel.app" → "mongo-s"
   */
  function getSubdomainSlug(): string | null {
    if (typeof window === "undefined") return null;
    const hostname = window.location.hostname.toLowerCase();

    // Known root domains (must match middleware.ts ROOT_DOMAINS)
    const roots = ["seyalpro.in", "seyalpro.com", "bft-one.vercel.app", "bftone.com", "localhost"];

    for (const root of roots) {
      if (hostname.endsWith("." + root)) {
        const sub = hostname.slice(0, -(root.length + 1));
        if (sub && sub !== "www" && sub !== "app") {
          return sub;
        }
      }
    }
    return null;
  }

  async function fetchTenant() {
    try {
      // 1. Authenticated User Resolution (direct session check to eliminate React state race)
      const { data: { session } } = await supabaseClient.auth.getSession();
      const currentUser = session?.user || user;

      if (currentUser) {
        const { data: prof } = await supabaseClient
          .from("profiles")
          .select("business_id, is_super_admin")
          .eq("id", currentUser.id)
          .maybeSingle();

        const isSuperAdmin = prof?.is_super_admin || currentUser.email?.toLowerCase() === "admin@seyalpro.com";

        // For regular shop admins/staff: ALWAYS bind strictly to their assigned business_id
        if (!isSuperAdmin && prof?.business_id) {
          const { data: biz } = await supabaseClient
            .from("businesses")
            .select("*")
            .eq("id", prof.business_id)
            .maybeSingle();

          if (biz) {
            const finalBiz = normalizeBusiness(biz);
            setBusiness(finalBiz);
            persistTenant(finalBiz);
            if (typeof document !== "undefined") {
              document.cookie = `tenant_slug=${finalBiz.slug}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
            }
            return;
          }
        }

        // For Super Admin: allow dynamic switching via query param, subdomain, or switch cookie
        if (isSuperAdmin) {
          const urlSlug = typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("tenant")
            : null;
          const subdomainSlug = getSubdomainSlug();
          const cookieMatch = typeof document !== "undefined"
            ? document.cookie.match(/tenant_slug=([^;]+)/)
            : null;
          const cookieSlug = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

          const explicitSlug = urlSlug || subdomainSlug || cookieSlug;
          if (explicitSlug) {
            const { data: bizBySlug } = await supabaseClient
              .from("businesses")
              .select("*")
              .eq("slug", explicitSlug)
              .maybeSingle();

            if (bizBySlug) {
              const finalBiz = normalizeBusiness(bizBySlug);
              setBusiness(finalBiz);
              persistTenant(finalBiz);
              return;
            }
          }

          // If Super Admin has an assigned business_id or default business exists in DB
          const targetBizId = prof?.business_id || DEFAULT_BUSINESS.id;
          const { data: bizById } = await supabaseClient
            .from("businesses")
            .select("*")
            .eq("id", targetBizId)
            .maybeSingle();

          if (bizById) {
            const finalBiz = normalizeBusiness(bizById);
            setBusiness(finalBiz);
            persistTenant(finalBiz);
            return;
          }
        }
      }

      // 2. Unauthenticated / Public visitor resolution (Query > Subdomain > Cookie > Default)
      const urlSlug = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tenant")
        : null;
      const subdomainSlug = getSubdomainSlug();
      const cookieMatch = typeof document !== "undefined"
        ? document.cookie.match(/tenant_slug=([^;]+)/)
        : null;
      const cookieSlug = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

      const explicitSlug = urlSlug || subdomainSlug || cookieSlug;

      if (explicitSlug) {
        const { data: bizBySlug } = await supabaseClient
          .from("businesses")
          .select("*")
          .eq("slug", explicitSlug)
          .maybeSingle();

        if (bizBySlug) {
          const finalBiz = normalizeBusiness(bizBySlug);
          setBusiness(finalBiz);
          persistTenant(finalBiz);
          return;
        }
      }

      // 3. Fall back to default business: query database for default BFT or first business
      const { data: defaultBiz } = await supabaseClient
        .from("businesses")
        .select("*")
        .eq("id", DEFAULT_BUSINESS.id)
        .maybeSingle();

      const sourceBiz = defaultBiz || DEFAULT_BUSINESS;
      const finalBiz = normalizeBusiness(sourceBiz);
      setBusiness(finalBiz);
      persistTenant(finalBiz);
    } catch (e) {
      console.warn("Tenant fetch fallback to default:", e);
      const fallbackBiz = normalizeBusiness(DEFAULT_BUSINESS);
      setBusiness(fallbackBiz);
    } finally {
      setLoading(false);
    }
  }

  function normalizeBusiness(raw: Partial<Business> | Record<string, any>): Business {
    const r = raw as any;
    const bizId = (r.id as string) || DEFAULT_BUSINESS.id;
    let localExtra: any = {};
    let localShopLoc: any = {};
    if (typeof window !== "undefined") {
      try {
        const extraJson = localStorage.getItem(`bftone_tenant_extra_${bizId}`);
        if (extraJson) localExtra = JSON.parse(extraJson);

        const scopedShopStr = localStorage.getItem(`bftone_shop_location_${bizId}`);
        if (scopedShopStr) {
          localShopLoc = JSON.parse(scopedShopStr);
        } else {
          const legacyStr = localStorage.getItem("bftone_shop_location");
          if (legacyStr) {
            const parsed = JSON.parse(legacyStr);
            if (parsed.businessId === bizId) {
              localShopLoc = parsed;
            }
          }
        }
      } catch {}
    }

    // Database record for this business is the primary source of truth
    const resolvedLat = (raw.geofence_lat !== null && raw.geofence_lat !== undefined && !isNaN(Number(raw.geofence_lat)))
      ? Number(raw.geofence_lat)
      : ((localShopLoc.lat !== undefined && localShopLoc.lat !== null && !isNaN(Number(localShopLoc.lat)))
        ? Number(localShopLoc.lat)
        : ((localExtra.geofence_lat !== undefined && localExtra.geofence_lat !== null && !isNaN(Number(localExtra.geofence_lat)))
          ? Number(localExtra.geofence_lat)
          : (bizId === DEFAULT_BUSINESS.id ? DEFAULT_BUSINESS.geofence_lat : null)));

    const resolvedLng = (raw.geofence_lng !== null && raw.geofence_lng !== undefined && !isNaN(Number(raw.geofence_lng)))
      ? Number(raw.geofence_lng)
      : ((localShopLoc.lng !== undefined && localShopLoc.lng !== null && !isNaN(Number(localShopLoc.lng)))
        ? Number(localShopLoc.lng)
        : ((localExtra.geofence_lng !== undefined && localExtra.geofence_lng !== null && !isNaN(Number(localExtra.geofence_lng)))
          ? Number(localExtra.geofence_lng)
          : (bizId === DEFAULT_BUSINESS.id ? DEFAULT_BUSINESS.geofence_lng : null)));

    const resolvedRadius = (raw.geofence_radius_meters && !isNaN(Number(raw.geofence_radius_meters)))
      ? Number(raw.geofence_radius_meters)
      : (localShopLoc.radius && !isNaN(Number(localShopLoc.radius))
        ? Number(localShopLoc.radius)
        : (localExtra.geofence_radius_meters ? Number(localExtra.geofence_radius_meters) : 150));

    const resolvedEnabled = raw.geofence_enabled !== undefined
      ? raw.geofence_enabled !== false
      : (localShopLoc.enabled !== undefined
        ? !!localShopLoc.enabled
        : (localExtra.geofence_enabled !== undefined ? localExtra.geofence_enabled !== false : true));

    return {
      id: bizId,
      name: raw.name || localExtra.name || DEFAULT_BUSINESS.name,
      slug: raw.slug || DEFAULT_BUSINESS.slug,
      logo_url: raw.logo_url || localExtra.logo_url || DEFAULT_BUSINESS.logo_url,
      signature_url: (raw.signature_url as string) || localExtra.signature_url || DEFAULT_BUSINESS.signature_url,
      address: (raw.address as string) || localExtra.address || DEFAULT_BUSINESS.address,
      phone: (raw.phone as string) || localExtra.phone || DEFAULT_BUSINESS.phone,
      gstin: (raw.gstin as string) || localExtra.gstin || DEFAULT_BUSINESS.gstin,
      currency_symbol: raw.currency_symbol || "₹",
      timezone: raw.timezone || "Asia/Kolkata",
      geofence_lat: resolvedLat,
      geofence_lng: resolvedLng,
      geofence_radius_meters: resolvedRadius,
      geofence_enabled: resolvedEnabled,
      enabled_modules: raw.enabled_modules || DEFAULT_BUSINESS.enabled_modules,
      plan_type: raw.plan_type || "pro",
      max_users: raw.max_users || 50,
      is_active: raw.is_active !== false,
    };
  }

  function persistTenant(biz: Business) {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("bftone_tenant_cache", JSON.stringify(biz));
        if (biz.id) {
          localStorage.setItem(`bftone_tenant_extra_${biz.id}`, JSON.stringify({
            name: biz.name,
            logo_url: biz.logo_url,
            signature_url: biz.signature_url,
            address: biz.address,
            phone: biz.phone,
            gstin: biz.gstin,
            geofence_lat: biz.geofence_lat,
            geofence_lng: biz.geofence_lng,
            geofence_radius_meters: biz.geofence_radius_meters,
            geofence_enabled: biz.geofence_enabled,
          }));
        }
      }
    } catch {}
  }

  useEffect(() => {
    fetchTenant();
  }, [user]);

  useEffect(() => {
    function handleLocationUpdated(e: any) {
      if (e?.detail && e.detail.lat && e.detail.lng) {
        setBusiness((prev) => ({
          ...prev,
          geofence_lat: Number(e.detail.lat),
          geofence_lng: Number(e.detail.lng),
          geofence_radius_meters: e.detail.radius ? Number(e.detail.radius) : prev.geofence_radius_meters,
          geofence_enabled: e.detail.enabled !== undefined ? Boolean(e.detail.enabled) : prev.geofence_enabled,
        }));
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("bftone_shop_location_updated", handleLocationUpdated);
      return () => window.removeEventListener("bftone_shop_location_updated", handleLocationUpdated);
    }
  }, []);

  function isModuleEnabled(moduleName: string): boolean {
    if (!business?.enabled_modules) return true;
    return business.enabled_modules[moduleName] !== false;
  }

  return (
    <TenantContext.Provider
      value={{
        business,
        loading,
        isModuleEnabled,
        refreshBusiness: fetchTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
