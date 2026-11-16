"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { resolveCanonicalHostname } from "@/lib/tenant/hostnameResolver";

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
 * Carries no store name/id so that no other store's identity (or localStorage namespace)
 * can ever be shown or used before resolution.
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

export type TenantResolutionErrorCode =
  | "TENANT_NOT_FOUND"
  | "TENANT_RETIRED"
  | "TENANT_HOSTNAME_MISMATCH"
  | "TENANT_SUSPENDED"
  | "UNASSIGNED_TENANT"
  | "IMPERSONATION_REQUIRED"
  | null;

export interface ActiveImpersonationState {
  sessionId: string;
  targetBusinessId: string;
  targetBusinessSlug?: string | null;
  reason: string;
  expiresAt: string;
}

export function isValidCustomLogo(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/dummy-logo.svg")) return false;
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
  hostname?: string;
  business: Business;
  cachedAt: number;
}

function readTenantCache(expectedHostname?: string): TenantCacheEntry | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(TENANT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("ownerUserId" in parsed) ||
      !parsed.business?.id
    ) {
      return null;
    }
    if (
      expectedHostname &&
      parsed.hostname &&
      parsed.hostname !== expectedHostname
    ) {
      return null;
    }
    return parsed as TenantCacheEntry;
  } catch {
    return null;
  }
}

export function clearTenantCache() {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(TENANT_CACHE_KEY);
  } catch { }
}

interface TenantContextType {
  business: Business;
  loading: boolean;
  status: TenantStatus;
  tenantError: TenantResolutionErrorCode;
  userHomeBusiness?: { name: string; slug: string } | null;
  impersonationSession: ActiveImpersonationState | null;
  isResolved: boolean;
  isModuleEnabled: (moduleName: string) => boolean;
  refreshBusiness: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
  business: NEUTRAL_BUSINESS,
  loading: true,
  status: "resolving",
  tenantError: null,
  userHomeBusiness: null,
  impersonationSession: null,
  isResolved: false,
  isModuleEnabled: () => true,
  refreshBusiness: async () => { },
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [business, setBusiness] = useState<Business>(NEUTRAL_BUSINESS);
  const [status, setStatus] = useState<TenantStatus>("resolving");
  const [tenantError, setTenantError] = useState<TenantResolutionErrorCode>(null);
  const [userHomeBusiness, setUserHomeBusiness] = useState<{ name: string; slug: string } | null>(null);
  const [impersonationSession, setImpersonationSession] =
    useState<ActiveImpersonationState | null>(null);
  const loading = status === "resolving";
  const ownerRef = useRef<string | null | undefined>(undefined);
  const requestIdRef = useRef(0);

  /**
   * Resolves canonical hostname context strictly from `window.location.host`
   * using the centralized hostname resolver (never query params or cookies).
   */
  function getBrowserHostnameResolution() {
    if (typeof window === "undefined") return null;
    return resolveCanonicalHostname(window.location.host);
  }

  function applyTenant(
    biz: Business,
    ownerUserId: string | null,
    reqId: number,
    activeImpersonation: ActiveImpersonationState | null = null
  ) {
    if (reqId !== requestIdRef.current) return;
    ownerRef.current = ownerUserId;
    setBusiness(biz);
    setTenantError(null);
    setUserHomeBusiness(null);
    setImpersonationSession(activeImpersonation);
    setStatus("ready");
    if (biz.id) persistTenant(biz, ownerUserId);
  }

  function applyTenantError(
    errorCode: TenantResolutionErrorCode,
    reqId: number,
    homeBiz: { name: string; slug: string } | null = null
  ) {
    if (reqId !== requestIdRef.current) return;
    ownerRef.current = undefined;
    clearTenantCache();
    setBusiness(NEUTRAL_BUSINESS);
    setImpersonationSession(null);
    setUserHomeBusiness(homeBiz);
    setTenantError(errorCode);
    setStatus("error");
  }

  async function fetchTenant() {
    const reqId = ++requestIdRef.current;
    let currentUser: { id: string; email?: string } | null = null;
    try {
      const hostRes = getBrowserHostnameResolution();
      const currentHostname =
        typeof window !== "undefined"
          ? window.location.hostname.toLowerCase()
          : "";

      // If subdomain is explicitly invalid or reserved, fail closed immediately
      if (hostRes && !hostRes.valid && hostRes.kind === "invalid_subdomain") {
        applyTenantError("TENANT_NOT_FOUND", reqId);
        return;
      }

      // The public website (localhost / www.countercub.com) and the platform admin host
      // (app.localhost / app.countercub.com) never load a store, even for logged-in users.
      // A store is only ever resolved on its own <slug> host.
      if (hostRes?.kind === "marketing" || hostRes?.kind === "platform_admin") {
        applyTenant(NEUTRAL_BUSINESS, user?.id ?? null, reqId, null);
        return;
      }

      // 1. Authenticated User Resolution
      const sessionPromise = supabaseClient.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 5000)
      );
      const {
        data: { session },
      } = await Promise.race([sessionPromise, timeoutPromise]);
      currentUser = session?.user || user;
      const currentUserId = currentUser?.id ?? null;

      if (ownerRef.current !== currentUserId) {
        const cached = currentUserId
          ? readTenantCache(currentHostname)
          : null;
        if (cached && cached.ownerUserId === currentUserId) {
          // Verify cached slug matches subdomain if on a tenant workspace host
          if (
            hostRes?.kind !== "tenant_workspace" ||
            cached.business.slug === hostRes.tenantSlug
          ) {
            ownerRef.current = currentUserId;
            setBusiness(cached.business);
            setStatus("ready");
          } else {
            ownerRef.current = undefined;
            setBusiness(NEUTRAL_BUSINESS);
            setStatus("resolving");
          }
        } else {
          ownerRef.current = undefined;
          setBusiness(NEUTRAL_BUSINESS);
          setStatus("resolving");
        }
      }

      if (currentUser) {
        let prof: { business_id: string | null; is_super_admin?: boolean | null } | null = null;
        let serverBiz: Record<string, any> | null = null;
        let resolvedFromServer = false;
        let sessionInvalid = false;

        const token = session?.access_token;
        if (token) {
          try {
            const meRes = await fetch("/api/user/me", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            });
            if (meRes.status === 401) {
              sessionInvalid = true;
            } else if (meRes.ok) {
              const meData = await meRes.json();
              prof = meData?.profile || null;
              serverBiz = meData?.business || null;
              resolvedFromServer = true;
            }
          } catch (meErr) {
            console.warn("[TenantContext] /api/user/me fetch failed, falling back to client query:", meErr);
          }
        }

        if (sessionInvalid) {
          // Stale or revoked session: clear local session and fall through to public tenant resolution
          // so AppShell redirects cleanly to /login instead of showing Workspace Unavailable.
          await supabaseClient.auth.signOut({ scope: "local" }).catch(() => { });
          currentUser = null;
        } else if (!resolvedFromServer) {
          const { data: clientProf, error: profErr } = await supabaseClient
            .from("profiles")
            .select("business_id, is_super_admin")
            .eq("id", currentUser.id)
            .maybeSingle();
          if (profErr) throw profErr;
          prof = clientProf;
        }

        if (currentUser) {
          // Zero-Trust Principle: Super Admin status derives strictly from DB column, never email string
          const isSuperAdmin = Boolean(prof?.is_super_admin);

          // Regular shop admins/staff: strictly bound to their assigned `prof.business_id`
          if (!isSuperAdmin) {
            if (!prof?.business_id) {
              applyTenantError("UNASSIGNED_TENANT", reqId);
              return;
            }

            let biz = serverBiz && serverBiz.id === prof.business_id ? serverBiz : null;
            if (!biz) {
              const { data: clientBiz, error: bizErr } = await supabaseClient
                .from("businesses")
                .select("*")
                .eq("id", prof.business_id)
                .maybeSingle();
              if (bizErr) throw bizErr;
              biz = clientBiz;
            }
            if (!biz) {
              applyTenantError("TENANT_NOT_FOUND", reqId);
              return;
            }

            if (biz.is_active === false) {
              applyTenantError("TENANT_SUSPENDED", reqId);
              return;
            }

            // Cross-check hostname against user's assigned tenant membership
            if (
              hostRes?.kind === "tenant_workspace" &&
              hostRes.tenantSlug &&
              biz.slug?.toLowerCase() !== hostRes.tenantSlug.toLowerCase()
            ) {
              applyTenantError("TENANT_HOSTNAME_MISMATCH", reqId, {
                name: biz.name || "Assigned Shop",
                slug: biz.slug,
              });
              return;
            }

            const finalBiz = normalizeBusiness(biz);
            applyTenant(finalBiz, currentUser.id, reqId, null);
            return;
          }

          // Platform Super Admin Path:
          // On a `<tenant-slug>.countercub.com` workspace host, verify either:
          // (a) an active audited support impersonation session, OR
          // (b) it matches the Super Admin's own assigned `prof.business_id`.
          if (hostRes?.kind === "tenant_workspace" && hostRes.tenantSlug) {
            let bizBySlug =
              serverBiz &&
                serverBiz.slug?.toLowerCase() === hostRes.tenantSlug.toLowerCase()
                ? serverBiz
                : null;
            if (!bizBySlug) {
              const { data: queriedBiz } = await supabaseClient
                .from("businesses")
                .select("*")
                .eq("slug", hostRes.tenantSlug)
                .maybeSingle();
              bizBySlug = queriedBiz;
            }

            if (!bizBySlug) {
              applyTenantError("TENANT_NOT_FOUND", reqId);
              return;
            }

            if (prof?.business_id === bizBySlug.id) {
              applyTenant(normalizeBusiness(bizBySlug), currentUser.id, reqId, null);
              return;
            }

            // Check for active support impersonation session via server API
            try {
              const impRes = await fetch("/api/super-admin/impersonation", {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                cache: "no-store",
              });
              if (impRes.ok) {
                const impData = await impRes.json();
                if (
                  impData?.active &&
                  impData?.session?.targetBusinessId === bizBySlug.id
                ) {
                  applyTenant(
                    normalizeBusiness(bizBySlug),
                    currentUser.id,
                    reqId,
                    {
                      sessionId: impData.session.sessionId,
                      targetBusinessId: impData.session.targetBusinessId,
                      targetBusinessSlug: bizBySlug.slug,
                      reason: impData.session.reason,
                      expiresAt: impData.session.expiresAt,
                    }
                  );
                  return;
                }
              }
            } catch { }

            applyTenantError("IMPERSONATION_REQUIRED", reqId);
            return;
          }

          // No shop host (should not happen: marketing/platform hosts return early above).
          // Stay store-neutral rather than falling back to the profile's business.
          applyTenant(NEUTRAL_BUSINESS, currentUser.id, reqId, null);
          return;
        }
      }

      // 2. Unauthenticated / Public visitor:
      // Resolve strictly from canonical hostname via `/api/public/tenant-resolve`
      if (hostRes?.kind === "tenant_workspace" && hostRes.tenantSlug) {
        const res = await fetch("/api/public/tenant-resolve", {
          method: "GET",
          cache: "no-store",
        });

        if (res.status === 403) {
          applyTenantError("TENANT_SUSPENDED", reqId);
          return;
        }

        if (res.status === 404) {
          let errPayload: any = null;
          try {
            errPayload = await res.json();
          } catch { }
          applyTenantError(
            errPayload?.code === "TENANT_RETIRED"
              ? "TENANT_RETIRED"
              : "TENANT_NOT_FOUND",
            reqId
          );
          return;
        }

        if (res.ok) {
          const payload = await res.json();
          if (payload?.business) {
            applyTenant(normalizeBusiness(payload.business), null, reqId, null);
            return;
          }
        }

        applyTenantError("TENANT_NOT_FOUND", reqId);
        return;
      }

      // Marketing or Platform Admin root domain: stay strictly store-neutral
      applyTenant(NEUTRAL_BUSINESS, null, reqId, null);
    } catch (e) {
      console.warn("Tenant resolution failed:", e);
      if (reqId !== requestIdRef.current) return;
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
    const bizId = (r.id as string) || "";
    let localExtra: any = {};
    let localShopLoc: any = {};
    if (typeof window !== "undefined" && bizId) {
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
      } catch { }
    }

    const resolvedLat =
      raw.geofence_lat !== null &&
        raw.geofence_lat !== undefined &&
        !isNaN(Number(raw.geofence_lat))
        ? Number(raw.geofence_lat)
        : localShopLoc.lat !== undefined &&
          localShopLoc.lat !== null &&
          !isNaN(Number(localShopLoc.lat))
          ? Number(localShopLoc.lat)
          : localExtra.geofence_lat !== undefined &&
            localExtra.geofence_lat !== null &&
            !isNaN(Number(localExtra.geofence_lat))
            ? Number(localExtra.geofence_lat)
            : null;

    const resolvedLng =
      raw.geofence_lng !== null &&
        raw.geofence_lng !== undefined &&
        !isNaN(Number(raw.geofence_lng))
        ? Number(raw.geofence_lng)
        : localShopLoc.lng !== undefined &&
          localShopLoc.lng !== null &&
          !isNaN(Number(localShopLoc.lng))
          ? Number(localShopLoc.lng)
          : localExtra.geofence_lng !== undefined &&
            localExtra.geofence_lng !== null &&
            !isNaN(Number(localExtra.geofence_lng))
            ? Number(localExtra.geofence_lng)
            : null;

    const resolvedRadius =
      raw.geofence_radius_meters && !isNaN(Number(raw.geofence_radius_meters))
        ? Number(raw.geofence_radius_meters)
        : localShopLoc.radius && !isNaN(Number(localShopLoc.radius))
          ? Number(localShopLoc.radius)
          : localExtra.geofence_radius_meters
            ? Number(localExtra.geofence_radius_meters)
            : 150;

    const resolvedEnabled =
      raw.geofence_enabled !== undefined
        ? raw.geofence_enabled !== false
        : localShopLoc.enabled !== undefined
          ? !!localShopLoc.enabled
          : localExtra.geofence_enabled !== undefined
            ? localExtra.geofence_enabled !== false
            : true;

    const isCustomDbLogo = isValidCustomLogo(raw.logo_url);
    const isCustomLocalLogo = isValidCustomLogo(localExtra.logo_url);
    const resolvedLogo = isCustomDbLogo
      ? raw.logo_url
      : isCustomLocalLogo
        ? localExtra.logo_url
        : raw.logo_url || null;

    const isCustomDbSig = isValidCustomSig(raw.signature_url);
    const hasCustomLocalSig = isValidCustomSig(localExtra.signature_url);
    const resolvedSig = isCustomDbSig
      ? (raw.signature_url as string)
      : hasCustomLocalSig
        ? localExtra.signature_url
        : raw.signature_url || null;

    return {
      id: bizId,
      name: raw.name || localExtra.name || "",
      slug: raw.slug || "",
      logo_url: resolvedLogo,
      signature_url: resolvedSig,
      address: (raw.address as string) || localExtra.address || "",
      phone: (raw.phone as string) || localExtra.phone || "",
      gstin: (raw.gstin as string) || localExtra.gstin || "",
      upi_id:
        (raw.upi_id as string) ||
        (raw.enabled_modules?.upi_id as string) ||
        localExtra.upi_id ||
        "",
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
          } catch { }
        }

        const isCustomBizLogo = isValidCustomLogo(biz.logo_url);
        const isCustomExistingLogo = isValidCustomLogo(existingExtra.logo_url);
        const preservedLogo = isCustomBizLogo
          ? biz.logo_url
          : isCustomExistingLogo
            ? existingExtra.logo_url
            : biz.logo_url;

        const isCustomBizSig = isValidCustomSig(biz.signature_url);
        const isCustomExistingSig = isValidCustomSig(existingExtra.signature_url);
        const preservedSig = isCustomBizSig
          ? biz.signature_url
          : isCustomExistingSig
            ? existingExtra.signature_url
            : biz.signature_url;

        const preservedUpi =
          (biz as any).upi_id ||
          (biz as any).enabled_modules?.upi_id ||
          existingExtra.upi_id ||
          "";

        const entry: TenantCacheEntry = {
          ownerUserId,
          hostname: window.location.hostname.toLowerCase(),
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
          localStorage.setItem(
            `bftone_tenant_extra_${biz.id}`,
            JSON.stringify({
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
            })
          );
        }
      }
    } catch { }
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
          geofence_radius_meters: e.detail.radius
            ? Number(e.detail.radius)
            : prev.geofence_radius_meters,
          geofence_enabled:
            e.detail.enabled !== undefined
              ? Boolean(e.detail.enabled)
              : prev.geofence_enabled,
        }));
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener(
        "bftone_shop_location_updated",
        handleLocationUpdated
      );
      return () =>
        window.removeEventListener(
          "bftone_shop_location_updated",
          handleLocationUpdated
        );
    }
  }, []);

  function isModuleEnabled(moduleName: string): boolean {
    if (!business?.enabled_modules) {
      if (moduleName === "baker_mode" || moduleName === "b2b_bridge") return false;
      return true;
    }
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
        tenantError,
        userHomeBusiness,
        impersonationSession,
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
