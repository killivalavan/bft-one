"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
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
  upi_id?: string | null;
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
  name: "Brown Fening Tea",
  slug: "bft-navalur",
  logo_url: "/dummy-logo.svg",
  signature_url: "/default-signature.svg",
  address: "255, Rajiv Gandhi Salai (OMR), Navalur,\nChennai,\nTamil Nadu, India - 600130",
  phone: "+91 98765 43210",
  gstin: "",
  upi_id: "",
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
    b2b_bridge: true,
    baker_mode: true,
  },
  plan_type: "pro",
  max_users: 50,
  is_active: true,
};

/**
 * Neutral, store-less placeholder used while the real tenant is being resolved.
 * It intentionally carries no store name/id so that no other store's identity
 * (or localStorage namespace) can ever be shown or used before resolution.
 */
export const NEUTRAL_BUSINESS: Business = {
  id: "",
  name: "",
  slug: "",
  logo_url: null,
  signature_url: null,
  address: "",
  phone: "",
  gstin: "",
  upi_id: "",
  currency_symbol: "₹",
  timezone: "Asia/Kolkata",
  geofence_lat: null,
  geofence_lng: null,
  geofence_radius_meters: 150,
  geofence_enabled: false,
  enabled_modules: {},
  plan_type: "pro",
  max_users: 50,
  is_active: true,
};

export type TenantStatus = "resolving" | "ready" | "error";

export function isValidCustomLogo(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/dummy-logo.svg")) return false;
  // If it's a 1x1 dummy pixel (<= 200 chars base64), it's not a real custom logo
  if (url.startsWith("data:image") && url.length < 200) return false;
  return true;
}

export function isValidCustomSig(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/default-signature.svg")) return false;
  if (url.startsWith("data:image") && url.length < 200) return false;
  return true;
}

const TENANT_CACHE_KEY = "bftone_tenant_cache";

interface TenantCacheEntry {
  ownerUserId: string | null;
  business: Business;
  cachedAt: number;
}

function readTenantCache(): TenantCacheEntry | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(TENANT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Legacy (un-owned) cache entries are ignored: they cannot be trusted to belong to this user
    if (!parsed || typeof parsed !== "object" || !("ownerUserId" in parsed) || !parsed.business?.id) return null;
    return parsed as TenantCacheEntry;
  } catch {
    return null;
  }
}

export function clearTenantCache() {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(TENANT_CACHE_KEY);
  } catch {}
}

interface TenantContextType {
  business: Business;
  loading: boolean;
  status: TenantStatus;
  isResolved: boolean;
  isModuleEnabled: (moduleName: string) => boolean;
  refreshBusiness: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
  business: NEUTRAL_BUSINESS,
  loading: true,
  status: "resolving",
  isResolved: false,
  isModuleEnabled: () => true,
  refreshBusiness: async () => {},
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  // Identical on server and client: never prerender another store's identity into the HTML
  const [business, setBusiness] = useState<Business>(NEUTRAL_BUSINESS);
  const [status, setStatus] = useState<TenantStatus>("resolving");
  const loading = status === "resolving";
  // Which user the currently-held business belongs to (null = logged-out visitor)
  const ownerRef = useRef<string | null | undefined>(undefined);
  // Guards against out-of-order fetchTenant responses overwriting newer ones
  const requestIdRef = useRef(0);

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

  function applyTenant(biz: Business, ownerUserId: string | null, reqId: number) {
    if (reqId !== requestIdRef.current) return; // stale response
    ownerRef.current = ownerUserId;
    setBusiness(biz);
    setStatus("ready");
    if (biz.id) persistTenant(biz, ownerUserId);
  }

  async function fetchTenant() {
    const reqId = ++requestIdRef.current;
    let currentUser: { id: string; email?: string } | null = null;
    try {
      // 1. Authenticated User Resolution (direct session check to eliminate React state race)
      const sessionPromise = supabaseClient.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 5000)
      );
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
      currentUser = session?.user || user;
      const currentUserId = currentUser?.id ?? null;

      // If the held business does not belong to this user, never show it: warm-start
      // only from a cache entry owned by this exact user, otherwise go neutral + resolving.
      if (ownerRef.current !== currentUserId) {
        const cached = currentUserId ? readTenantCache() : null;
        if (cached && cached.ownerUserId === currentUserId) {
          ownerRef.current = currentUserId;
          setBusiness(cached.business);
          setStatus("ready");
        } else {
          ownerRef.current = undefined;
          setBusiness(NEUTRAL_BUSINESS);
          setStatus("resolving");
          if (!currentUserId) clearTenantCache();
        }
      }

      if (currentUser) {
        const { data: prof, error: profErr } = await supabaseClient
          .from("profiles")
          .select("business_id, is_super_admin")
          .eq("id", currentUser.id)
          .maybeSingle();
        if (profErr) throw profErr;

        const isSuperAdmin = prof?.is_super_admin || currentUser.email?.toLowerCase() === "admin@seyalpro.com";

        // For regular shop admins/staff: ALWAYS bind strictly to their assigned business_id.
        // Never fall back to another store.
        if (!isSuperAdmin) {
          if (!prof?.business_id) throw new Error("No workspace is assigned to this account.");
          const { data: biz, error: bizErr } = await supabaseClient
            .from("businesses")
            .select("*")
            .eq("id", prof.business_id)
            .maybeSingle();
          if (bizErr) throw bizErr;
          if (!biz) throw new Error("Assigned workspace could not be found.");

          const finalBiz = normalizeBusiness(biz);
          applyTenant(finalBiz, currentUser.id, reqId);
          if (typeof document !== "undefined" && reqId === requestIdRef.current) {
            document.cookie = `tenant_slug=${finalBiz.slug}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
          }
          return;
        }

        // For Super Admin: only an explicitly selected workspace (query, subdomain, switch cookie, or own business_id)
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
            applyTenant(normalizeBusiness(bizBySlug), currentUser.id, reqId);
            return;
          }
        }

        if (prof?.business_id) {
          const { data: bizById } = await supabaseClient
            .from("businesses")
            .select("*")
            .eq("id", prof.business_id)
            .maybeSingle();
          if (bizById) {
            applyTenant(normalizeBusiness(bizById), currentUser.id, reqId);
            return;
          }
        }

        // No workspace selected: stay store-neutral (super admin lands on the SeyalPro dashboard)
        applyTenant(NEUTRAL_BUSINESS, currentUser.id, reqId);
        return;
      }

      // 2. Unauthenticated / Public visitor: only an explicit ?tenant or subdomain brands the page
      const urlSlug = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tenant")
        : null;
      const explicitSlug = urlSlug || getSubdomainSlug();

      if (explicitSlug) {
        const { data: bizBySlug } = await supabaseClient
          .from("businesses")
          .select("*")
          .eq("slug", explicitSlug)
          .maybeSingle();
        if (bizBySlug) {
          applyTenant(normalizeBusiness(bizBySlug), null, reqId);
          return;
        }
      }

      applyTenant(NEUTRAL_BUSINESS, null, reqId);
    } catch (e) {
      console.warn("Tenant resolution failed:", e);
      if (reqId !== requestIdRef.current) return;
      // Keep an already-verified workspace for this same user (e.g. transient network blip);
      // otherwise surface an error instead of silently showing another store.
      if (currentUser && ownerRef.current === currentUser.id && business.id) {
        setStatus("ready");
      } else if (currentUser) {
        setBusiness(NEUTRAL_BUSINESS);
        setStatus("error");
      } else {
        setBusiness(NEUTRAL_BUSINESS);
        setStatus("ready");
      }
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

    const isCustomDbLogo = isValidCustomLogo(raw.logo_url);
    const isCustomLocalLogo = isValidCustomLogo(localExtra.logo_url);
    const resolvedLogo = isCustomDbLogo ? raw.logo_url : (isCustomLocalLogo ? localExtra.logo_url : (raw.logo_url || null));

    const isCustomDbSig = isValidCustomSig(raw.signature_url);
    const hasCustomLocalSig = isValidCustomSig(localExtra.signature_url);
    const resolvedSig = isCustomDbSig ? (raw.signature_url as string) : (hasCustomLocalSig ? localExtra.signature_url : (raw.signature_url || null));

    return {
      id: bizId,
      name: raw.name || localExtra.name || "",
      slug: raw.slug || "",
      logo_url: resolvedLogo,
      signature_url: resolvedSig,
      address: (raw.address as string) || localExtra.address || "",
      phone: (raw.phone as string) || localExtra.phone || "",
      gstin: (raw.gstin as string) || localExtra.gstin || "",
      upi_id: (raw.upi_id as string) || (raw.enabled_modules?.upi_id as string) || localExtra.upi_id || "",
      currency_symbol: raw.currency_symbol || "₹",
      timezone: raw.timezone || "Asia/Kolkata",
      geofence_lat: resolvedLat,
      geofence_lng: resolvedLng,
      geofence_radius_meters: resolvedRadius,
      geofence_enabled: resolvedEnabled,
      enabled_modules: raw.enabled_modules || {},
      plan_type: raw.plan_type || "pro",
      max_users: raw.max_users || 50,
      is_active: raw.is_active !== false,
    };
  }

  function persistTenant(biz: Business, ownerUserId: string | null = null) {
    try {
      if (typeof window !== "undefined") {
        let existingExtra: any = {};
        if (biz.id) {
          try {
            const extraStr = localStorage.getItem(`bftone_tenant_extra_${biz.id}`);
            if (extraStr) existingExtra = JSON.parse(extraStr);
          } catch {}
        }

        const isCustomBizLogo = isValidCustomLogo(biz.logo_url);
        const isCustomExistingLogo = isValidCustomLogo(existingExtra.logo_url);
        const preservedLogo = isCustomBizLogo ? biz.logo_url : (isCustomExistingLogo ? existingExtra.logo_url : biz.logo_url);

        const isCustomBizSig = isValidCustomSig(biz.signature_url);
        const isCustomExistingSig = isValidCustomSig(existingExtra.signature_url);
        const preservedSig = isCustomBizSig ? biz.signature_url : (isCustomExistingSig ? existingExtra.signature_url : biz.signature_url);

        const preservedUpi = (biz as any).upi_id || (biz as any).enabled_modules?.upi_id || existingExtra.upi_id || "";

        const entry: TenantCacheEntry = {
          ownerUserId,
          business: {
            ...biz,
            logo_url: preservedLogo,
            signature_url: preservedSig,
            upi_id: preservedUpi,
          },
          cachedAt: Date.now(),
        };
        localStorage.setItem(TENANT_CACHE_KEY, JSON.stringify(entry));

        if (biz.id) {
          localStorage.setItem(`bftone_tenant_extra_${biz.id}`, JSON.stringify({
            name: biz.name,
            logo_url: preservedLogo,
            signature_url: preservedSig,
            address: biz.address || existingExtra.address || "",
            phone: biz.phone || existingExtra.phone || "",
            gstin: biz.gstin || existingExtra.gstin || "",
            upi_id: preservedUpi,
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
    if (!business?.enabled_modules) {
      if (moduleName === "baker_mode" || moduleName === "b2b_bridge") return false;
      return true;
    }
    // Opt-in modules that are strictly disabled by default unless explicitly enabled by Super Admin
    if (moduleName === "baker_mode" || moduleName === "b2b_bridge") {
      return Boolean(business.enabled_modules[moduleName]);
    }
    return business.enabled_modules[moduleName] !== false;
  }

  return (
    <TenantContext.Provider
      value={{
        business,
        loading,
        status,
        isResolved: status === "ready",
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
