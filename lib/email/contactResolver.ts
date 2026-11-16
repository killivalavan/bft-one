import type { SupabaseClient } from "@supabase/supabase-js";
import { isInternalTenantEmail } from "@/lib/utils/storeIdGenerator";

export interface StoreAdminContact {
  businessId: string;
  storeName: string;
  slug: string;
  currencySymbol: string;
  timezone: string;
  adminUserId: string | null;
  adminName: string;
  contactEmail: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Authoritatively resolves the Store Admin's verified contact email and store metadata
 * from Supabase (`businesses` + `profiles`). Never trusts client-supplied recipients
 * and never returns synthetic `.internal` addresses.
 */
export async function resolveStoreAdminContact(
  supa: SupabaseClient,
  businessId: string
): Promise<StoreAdminContact | null> {
  const [{ data: biz, error: bizErr }, { data: adminProfiles }] = await Promise.all([
    supa
      .from("businesses")
      .select("id, name, slug, currency_symbol, timezone")
      .eq("id", businessId)
      .maybeSingle(),
    supa
      .from("profiles")
      .select("id, email, contact_email, full_name, is_admin, is_super_admin")
      .eq("business_id", businessId)
      .eq("is_admin", true)
      .order("created_at", { ascending: true }),
  ]);

  if (bizErr || !biz) {
    return null;
  }

  const primaryAdmin =
    (adminProfiles || []).find((p: any) => !p.is_super_admin) ||
    (adminProfiles || [])[0] ||
    null;

  let contactEmail: string | null = null;
  if (primaryAdmin) {
    const candidateContact = String(primaryAdmin.contact_email || "").trim().toLowerCase();
    const candidateAuth = String(primaryAdmin.email || "").trim().toLowerCase();

    if (candidateContact && EMAIL_REGEX.test(candidateContact) && !isInternalTenantEmail(candidateContact)) {
      contactEmail = candidateContact;
    } else if (candidateAuth && EMAIL_REGEX.test(candidateAuth) && !isInternalTenantEmail(candidateAuth)) {
      contactEmail = candidateAuth;
    }
  }

  const adminName =
    String(primaryAdmin?.full_name || "").trim() ||
    (contactEmail ? contactEmail.split("@")[0] : "Store Admin");

  return {
    businessId: biz.id,
    storeName: biz.name || biz.slug,
    slug: biz.slug,
    currencySymbol: biz.currency_symbol || "₹",
    timezone: biz.timezone || "Asia/Kolkata",
    adminUserId: primaryAdmin?.id || null,
    adminName,
    contactEmail,
  };
}

