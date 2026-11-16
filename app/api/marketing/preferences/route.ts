import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { resolveStoreAdminContact } from "@/lib/email/contactResolver";
import { verifyMarketingToken } from "@/lib/email/marketingToken";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim();

    let businessId = "";
    let contactEmail = "";

    if (token) {
      const verified = verifyMarketingToken(token);
      if (!verified) {
        return NextResponse.json({ error: "Invalid or expired preference link." }, { status: 401 });
      }
      businessId = verified.businessId;
      contactEmail = verified.contactEmail;
    } else {
      const auth = await authenticateRequest(request, { requireAdmin: true });
      if ("errorResponse" in auth) return auth.errorResponse;
      businessId = auth.user.businessId;
      const contact = await resolveStoreAdminContact(supabaseAdmin(), businessId);
      contactEmail = contact?.contactEmail || "";
    }

    if (!businessId || !contactEmail) {
      return NextResponse.json({ error: "Store contact email not found." }, { status: 404 });
    }

    const supa = supabaseAdmin();
    const { data } = await supa
      .from("marketing_preferences")
      .select("*")
      .eq("business_id", businessId)
      .eq("contact_email", contactEmail)
      .maybeSingle();

    return NextResponse.json({
      preferences: data || {
        business_id: businessId,
        contact_email: contactEmail,
        offers_opted_in: false,
        features_opted_in: false,
        announcements_opted_in: false,
        unsubscribed_all: false,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    let businessId = "";
    let contactEmail = "";
    let userId: string | null = null;

    if (token) {
      const verified = verifyMarketingToken(token);
      if (!verified) {
        return NextResponse.json({ error: "Invalid or expired preference link." }, { status: 401 });
      }
      businessId = verified.businessId;
      contactEmail = verified.contactEmail;
    } else {
      const auth = await authenticateRequest(request, { requireAdmin: true });
      if ("errorResponse" in auth) return auth.errorResponse;
      businessId = auth.user.businessId;
      userId = auth.user.id;
      const contact = await resolveStoreAdminContact(supabaseAdmin(), businessId);
      contactEmail = contact?.contactEmail || "";
    }

    if (!businessId || !contactEmail) {
      return NextResponse.json({ error: "Store contact email not found." }, { status: 404 });
    }

    const unsubscribedAll = Boolean(body?.unsubscribedAll);
    const offersOptedIn = unsubscribedAll ? false : Boolean(body?.offersOptedIn);
    const featuresOptedIn = unsubscribedAll ? false : Boolean(body?.featuresOptedIn);
    const announcementsOptedIn = unsubscribedAll ? false : Boolean(body?.announcementsOptedIn);
    const nowIso = new Date().toISOString();

    const anyOptIn = offersOptedIn || featuresOptedIn || announcementsOptedIn;

    const supa = supabaseAdmin();
    const { data, error } = await supa
      .from("marketing_preferences")
      .upsert(
        {
          business_id: businessId,
          user_id: userId,
          contact_email: contactEmail,
          offers_opted_in: offersOptedIn,
          features_opted_in: featuresOptedIn,
          announcements_opted_in: announcementsOptedIn,
          unsubscribed_all: unsubscribedAll,
          consented_at: anyOptIn ? nowIso : null,
          unsubscribed_at: unsubscribedAll ? nowIso : null,
          updated_at: nowIso,
        },
        { onConflict: "business_id,contact_email" }
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, preferences: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

