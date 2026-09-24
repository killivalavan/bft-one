"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";

export interface Business {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
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
  name: "Brown Fening Tea - Navalur",
  slug: "bft-navalur",
  logo_url: "/logo_payslip.jpg",
  currency_symbol: "₹",
  timezone: "Asia/Kolkata",
  geofence_lat: 12.8439,
  geofence_lng: 80.2268,
  geofence_radius_meters: 150,
  geofence_enabled: true,
  enabled_modules: {
    billing: true,
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
    const roots = ["bft-one.vercel.app", "bftone.com", "localhost"];

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

      // 3. Fall back to default business (BFT Navalur)
      setBusiness(DEFAULT_BUSINESS);
      persistTenant(DEFAULT_BUSINESS);
    } catch (e) {
      console.warn("Tenant fetch fallback to default:", e);
    } finally {
      setLoading(false);
    }
  }

  function normalizeBusiness(raw: Partial<Business> & Record<string, unknown>): Business {
    return {
      id: (raw.id as string) || DEFAULT_BUSINESS.id,
      name: raw.name || DEFAULT_BUSINESS.name,
      slug: raw.slug || DEFAULT_BUSINESS.slug,
      logo_url: raw.logo_url || DEFAULT_BUSINESS.logo_url,
      currency_symbol: raw.currency_symbol || "₹",
      timezone: raw.timezone || "Asia/Kolkata",
      geofence_lat: raw.geofence_lat !== null ? Number(raw.geofence_lat) : DEFAULT_BUSINESS.geofence_lat,
      geofence_lng: raw.geofence_lng !== null ? Number(raw.geofence_lng) : DEFAULT_BUSINESS.geofence_lng,
      geofence_radius_meters: raw.geofence_radius_meters ? Number(raw.geofence_radius_meters) : 150,
      geofence_enabled: raw.geofence_enabled !== false,
      enabled_modules: raw.enabled_modules || DEFAULT_BUSINESS.enabled_modules,
      plan_type: raw.plan_type || "pro",
      max_users: raw.max_users || 50,
      is_active: raw.is_active !== false,
    };
  }

  function persistTenant(biz: Business) {
    try {
      localStorage.setItem("bftone_tenant_cache", JSON.stringify(biz));
    } catch {}
  }

  useEffect(() => {
    fetchTenant();
  }, [user]);

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
