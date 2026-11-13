import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportLevel = "standard" | "priority";
export type SubscriptionStatus = "active" | "pending" | "suspended" | "expired";
export type DerivedSubscriptionStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "pending"
  | "suspended";
export type ExpiryNotificationLevel = "none" | "7_days" | "3_days" | "expired";
export type BillingDurationMonths = 1 | 3 | 6 | 12;

export interface SubscriptionPlan {
  id: string;
  plan_key: string;
  plan_name: string;
  monthly_price: number;
  currency: string;
  max_active_products: number | null; // null = Unlimited
  max_employee_seats: number;
  support_level: SupportLevel;
  feature_entitlements: Record<string, any>;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface TenantSubscription {
  id: string;
  business_id: string;
  plan_id: string;
  plan_key_snapshot: string;
  plan_name_snapshot: string;
  subscription_status: SubscriptionStatus;
  start_date: string;
  expiry_date: string | null;
  billing_duration_months: number | null;
  price_snapshot: number;
  product_limit_snapshot: number | null; // null = Unlimited
  employee_limit_snapshot: number;
  support_level_snapshot: SupportLevel;
  custom_limit_overrides: Record<string, any>;
  is_current: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionEvent {
  id: string;
  business_id: string;
  subscription_id: string | null;
  event_type: string;
  previous_values: Record<string, any>;
  new_values: Record<string, any>;
  admin_id: string | null;
  admin_email: string | null;
  reason: string;
  created_at: string;
}

export interface SubscriptionRequest {
  id: string;
  business_id: string;
  current_subscription_id: string | null;
  current_plan_key: string;
  requested_plan_id: string;
  requested_duration_months: BillingDurationMonths;
  current_expiry_date: string | null;
  request_note: string | null;
  request_status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  requested_plan?: {
    plan_key: string;
    plan_name: string;
    monthly_price: number;
  } | null;
  businesses?: {
    id: string;
    name: string;
    slug: string;
    enabled_modules?: Record<string, any>;
  } | null;
}

export interface EffectiveEntitlements {
  businessId: string;
  planKey: string;
  planName: string;
  monthlyPrice: number;
  subscriptionStatus: SubscriptionStatus;
  derivedStatus: DerivedSubscriptionStatus;
  startDate: string | null;
  expiryDate: string | null;
  daysRemaining: number | null;
  notificationLevel: ExpiryNotificationLevel;
  isExpiredFallback: boolean;
  maxActiveProducts: number | null; // null = Unlimited
  maxEmployeeSeats: number;
  supportLevel: SupportLevel;
  usage: {
    activeProducts: number;
    posProducts: number;
    b2bProducts: number;
    employeeLogins: number;
    adminLogins: number;
  };
}

export const DEFAULT_PLAN_DEFINITIONS: Omit<SubscriptionPlan, "id">[] = [
  {
    plan_key: "free",
    plan_name: "Free",
    monthly_price: 0,
    currency: "INR",
    max_active_products: 5,
    max_employee_seats: 0,
    support_level: "standard",
    feature_entitlements: { store_admin_logins: 1, historical_sales_unlimited: true },
    is_active: true,
    sort_order: 1,
  },
  {
    plan_key: "basic",
    plan_name: "Basic",
    monthly_price: 199,
    currency: "INR",
    max_active_products: 20,
    max_employee_seats: 5,
    support_level: "standard",
    feature_entitlements: { store_admin_logins: 1, historical_sales_unlimited: true },
    is_active: true,
    sort_order: 2,
  },
  {
    plan_key: "pro",
    plan_name: "Pro",
    monthly_price: 299,
    currency: "INR",
    max_active_products: 250,
    max_employee_seats: 25,
    support_level: "standard",
    feature_entitlements: { store_admin_logins: 1, historical_sales_unlimited: true },
    is_active: true,
    sort_order: 3,
  },
  {
    plan_key: "business",
    plan_name: "Business",
    monthly_price: 499,
    currency: "INR",
    max_active_products: null,
    max_employee_seats: 50,
    support_level: "priority",
    feature_entitlements: { store_admin_logins: 1, historical_sales_unlimited: true, priority_support: true },
    is_active: true,
    sort_order: 4,
  },
];

export function normalizeLegacyPlanKey(planType?: string | null): string {
  const raw = String(planType || "pro").trim().toLowerCase();
  if (raw === "free") return "free";
  if (raw === "starter" || raw === "basic") return "basic";
  if (raw === "enterprise" || raw === "business") return "business";
  if (raw === "pro") return "pro";
  return raw;
}

/**
 * Adds exact calendar months in UTC, clamping day-of-month to the target month's
 * last day (e.g. Jan 31 + 1 month -> Feb 28/29).
 */
export function addCalendarMonths(startDate: Date, months: number): Date {
  const d = new Date(startDate.getTime());
  const originalDay = d.getUTCDate();
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  const daysInTargetMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return d;
}

/**
 * Computes the new expiry date when extending a subscription.
 * Rule:
 *  - If subscription is still active (expiryDate > now), extend from existing expiryDate.
 *  - If expired or no expiryDate, extend from `now`.
 */
export function calculateExtensionExpiry(
  currentExpiryIso: string | null | undefined,
  durationMonths: number,
  now: Date = new Date()
): Date {
  const currentExpiry = currentExpiryIso ? new Date(currentExpiryIso) : null;
  const baseDate =
    currentExpiry && !Number.isNaN(currentExpiry.getTime()) && currentExpiry.getTime() > now.getTime()
      ? currentExpiry
      : now;
  return addCalendarMonths(baseDate, durationMonths);
}

export function deriveSubscriptionState(
  sub: Pick<TenantSubscription, "plan_key_snapshot" | "subscription_status" | "expiry_date">,
  now: Date = new Date()
): {
  derivedStatus: DerivedSubscriptionStatus;
  daysRemaining: number | null;
  notificationLevel: ExpiryNotificationLevel;
  isExpiredFallback: boolean;
} {
  if (sub.subscription_status === "suspended") {
    return {
      derivedStatus: "suspended",
      daysRemaining: null,
      notificationLevel: "none",
      isExpiredFallback: false,
    };
  }

  if (sub.subscription_status === "pending") {
    return {
      derivedStatus: "pending",
      daysRemaining: null,
      notificationLevel: "none",
      isExpiredFallback: false,
    };
  }

  const isFreePlan = sub.plan_key_snapshot === "free";
  if (sub.subscription_status === "expired") {
    return {
      derivedStatus: "expired",
      daysRemaining: 0,
      notificationLevel: isFreePlan ? "none" : "expired",
      isExpiredFallback: !isFreePlan,
    };
  }

  if (!sub.expiry_date) {
    return {
      derivedStatus: "active",
      daysRemaining: null,
      notificationLevel: "none",
      isExpiredFallback: false,
    };
  }

  const exp = new Date(sub.expiry_date);
  if (Number.isNaN(exp.getTime())) {
    return {
      derivedStatus: "active",
      daysRemaining: null,
      notificationLevel: "none",
      isExpiredFallback: false,
    };
  }

  const diffMs = exp.getTime() - now.getTime();
  if (diffMs <= 0) {
    return {
      derivedStatus: "expired",
      daysRemaining: 0,
      notificationLevel: isFreePlan ? "none" : "expired",
      isExpiredFallback: !isFreePlan,
    };
  }

  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (!isFreePlan && daysRemaining <= 3) {
    return {
      derivedStatus: "expiring_soon",
      daysRemaining,
      notificationLevel: "3_days",
      isExpiredFallback: false,
    };
  }
  if (!isFreePlan && daysRemaining <= 7) {
    return {
      derivedStatus: "expiring_soon",
      daysRemaining,
      notificationLevel: "7_days",
      isExpiredFallback: false,
    };
  }

  return {
    derivedStatus: "active",
    daysRemaining,
    notificationLevel: "none",
    isExpiredFallback: false,
  };
}

export async function getTenantUsageCounts(
  supa: SupabaseClient,
  businessId: string
): Promise<{
  activeProducts: number;
  posProducts: number;
  b2bProducts: number;
  employeeLogins: number;
  adminLogins: number;
}> {
  const [posRes, b2bRes, bizRes, empRes, adminRes] = await Promise.all([
    supa
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .or("active.is.null,active.eq.true"),
    supa
      .from("b2b_products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .or("is_active.is.null,is_active.eq.true"),
    supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle(),
    supa
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_admin", false)
      .or("is_super_admin.is.null,is_super_admin.eq.false"),
    supa
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_admin", true)
      .or("is_super_admin.is.null,is_super_admin.eq.false"),
  ]);

  const posProducts = posRes.count || 0;
  let b2bProducts = b2bRes.error ? 0 : b2bRes.count || 0;

  // Dual-engine fallback: if b2b_products table is unavailable or empty, count active products in enabled_modules._b2b_data.products
  if (b2bRes.error || b2bProducts === 0) {
    const fallbackProducts = bizRes.data?.enabled_modules?._b2b_data?.products;
    if (Array.isArray(fallbackProducts) && fallbackProducts.length > 0) {
      b2bProducts = fallbackProducts.filter((p: any) => p?.is_active !== false).length;
    }
  }

  return {
    activeProducts: posProducts + b2bProducts,
    posProducts,
    b2bProducts,
    employeeLogins: empRes.count || 0,
    adminLogins: adminRes.count || 0,
  };
}

export async function getEffectiveEntitlements(
  supa: SupabaseClient,
  businessId: string
): Promise<EffectiveEntitlements> {
  const [subRes, freePlanRes, usage] = await Promise.all([
    supa
      .from("tenant_subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_current", true)
      .maybeSingle(),
    supa
      .from("subscription_plans")
      .select("*")
      .eq("plan_key", "free")
      .maybeSingle(),
    getTenantUsageCounts(supa, businessId),
  ]);

  const freePlan = freePlanRes.data || DEFAULT_PLAN_DEFINITIONS[0];

  if (subRes.error || !subRes.data) {
    // Graceful fallback if migration hasn't been applied or row missing: read businesses.plan_type
    const { data: biz } = await supa
      .from("businesses")
      .select("plan_type, max_users, is_active, created_at")
      .eq("id", businessId)
      .maybeSingle();

    const mappedKey = normalizeLegacyPlanKey(biz?.plan_type);
    const matchedDefault =
      DEFAULT_PLAN_DEFINITIONS.find((p) => p.plan_key === mappedKey) ||
      DEFAULT_PLAN_DEFINITIONS[2];

    const status: SubscriptionStatus =
      biz?.is_active === false ? "suspended" : "active";

    return {
      businessId,
      planKey: matchedDefault.plan_key,
      planName: matchedDefault.plan_name,
      monthlyPrice: matchedDefault.monthly_price,
      subscriptionStatus: status,
      derivedStatus: status === "suspended" ? "suspended" : "active",
      startDate: biz?.created_at || null,
      expiryDate: null,
      daysRemaining: null,
      notificationLevel: "none",
      isExpiredFallback: false,
      maxActiveProducts: matchedDefault.max_active_products,
      maxEmployeeSeats:
        typeof biz?.max_users === "number"
          ? Math.max(0, biz.max_users)
          : matchedDefault.max_employee_seats,
      supportLevel: matchedDefault.support_level,
      usage,
    };
  }

  const sub = subRes.data as TenantSubscription;
  const state = deriveSubscriptionState(sub);

  if (state.isExpiredFallback) {
    return {
      businessId,
      planKey: sub.plan_key_snapshot,
      planName: sub.plan_name_snapshot,
      monthlyPrice: Number(sub.price_snapshot) || 0,
      subscriptionStatus: "expired",
      derivedStatus: "expired",
      startDate: sub.start_date,
      expiryDate: sub.expiry_date,
      daysRemaining: 0,
      notificationLevel: "expired",
      isExpiredFallback: true,
      maxActiveProducts: freePlan.max_active_products ?? 5,
      maxEmployeeSeats: freePlan.max_employee_seats ?? 0,
      supportLevel: (freePlan.support_level as SupportLevel) || "standard",
      usage,
    };
  }

  return {
    businessId,
    planKey: sub.plan_key_snapshot,
    planName: sub.plan_name_snapshot,
    monthlyPrice: Number(sub.price_snapshot) || 0,
    subscriptionStatus: sub.subscription_status,
    derivedStatus: state.derivedStatus,
    startDate: sub.start_date,
    expiryDate: sub.expiry_date,
    daysRemaining: state.daysRemaining,
    notificationLevel: state.notificationLevel,
    isExpiredFallback: false,
    maxActiveProducts: sub.product_limit_snapshot,
    maxEmployeeSeats: sub.employee_limit_snapshot,
    supportLevel: sub.support_level_snapshot,
    usage,
  };
}

