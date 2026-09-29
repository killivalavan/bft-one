import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await request.json();
    const { businessId, name, logo_url, signature_url, address, phone, gstin } = body;

    const targetBizId = businessId || caller.businessId;
    if (!targetBizId) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }

    // Verify caller has permission for this business
    if (!caller.isSuperAdmin && targetBizId !== caller.businessId) {
      return NextResponse.json({ error: "Unauthorized for this business" }, { status: 403 });
    }

    // Prepare update payloads
    const fullPayload: any = {
      name: name?.trim() || "Store",
      logo_url: logo_url || "/dummy-logo.svg",
      signature_url: signature_url || "/default-signature.svg",
      address: address?.trim() || "",
      phone: phone?.trim() || "",
      gstin: gstin?.trim() || "",
      updated_at: new Date().toISOString(),
    };

    // Try updating with all columns
    let { data: updatedBiz, error: updateErr } = await supa
      .from("businesses")
      .update(fullPayload)
      .eq("id", targetBizId)
      .select("*")
      .maybeSingle();

    if (updateErr) {
      console.warn("Full business profile update failed, falling back to core columns:", updateErr.message);
      // Fallback: update only core columns in case new columns are not yet in DB schema
      const corePayload = {
        name: name?.trim() || "Store",
        logo_url: logo_url || "/dummy-logo.svg",
        updated_at: new Date().toISOString(),
      };

      const { data: fallbackBiz, error: coreErr } = await supa
        .from("businesses")
        .update(corePayload)
        .eq("id", targetBizId)
        .select("*")
        .maybeSingle();

      if (coreErr) {
        return NextResponse.json({ error: coreErr.message }, { status: 500 });
      }

      updatedBiz = {
        ...(fallbackBiz || {}),
        signature_url: signature_url || "/default-signature.svg",
        address: address || "",
        phone: phone || "",
        gstin: gstin || "",
      };
    }

    // Log Audit Event
    try {
      const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
      const clientMeta = extractClientMetadata(request);
      await logAuditEvent({
        businessId: targetBizId,
        actorId: caller.id,
        actorEmail: caller.email,
        action: "BUSINESS_UPDATED",
        targetType: "business",
        targetId: targetBizId,
        details: { name, logo_url: logo_url ? "updated" : "none", signature_url: signature_url ? "updated" : "none" },
        ...clientMeta,
      });
    } catch (_) {}

    return NextResponse.json({ ok: true, business: updatedBiz });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
