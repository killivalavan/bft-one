import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await request.json();
    const {
      businessId,
      name,
      logo_url,
      signature_url,
      address,
      phone,
      gstin,
      upi_id,
      geofence_lat,
      geofence_lng,
      geofence_radius_meters,
      geofence_enabled,
    } = body;

    const targetBizId = businessId || caller.businessId;
    if (!targetBizId) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }

    // Verify caller has permission for this business
    if (!caller.isSuperAdmin && targetBizId !== caller.businessId) {
      return NextResponse.json({ error: "Unauthorized for this business" }, { status: 403 });
    }

    // Prepare update payloads - ONLY use columns that exist in public.businesses table
    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (logo_url !== undefined) {
      updatePayload.logo_url = logo_url || "/dummy-logo.svg";
    }
    if (signature_url !== undefined) {
      updatePayload.signature_url = signature_url || "/default-signature.svg";
    }
    if (address !== undefined) {
      updatePayload.address = address?.trim() || "";
    }
    if (phone !== undefined) {
      updatePayload.phone = phone?.trim() || "";
    }
    if (gstin !== undefined) {
      updatePayload.gstin = gstin?.trim() || "";
    }

    if (upi_id !== undefined) {
      const { data: currentBiz } = await supa
        .from("businesses")
        .select("enabled_modules")
        .eq("id", targetBizId)
        .maybeSingle();

      updatePayload.enabled_modules = {
        ...(currentBiz?.enabled_modules || {}),
        upi_id: upi_id?.trim() || "",
      };
    }

    // SECURITY RULE: Store / Business name CANNOT be changed by regular clients/tenants.
    // Only SeyalPro Super Admin is permitted to change store names to prevent tenant spoofing or subscription hijacking.
    if (caller.isSuperAdmin && name?.trim()) {
      updatePayload.name = name.trim();
    }

    if (geofence_lat !== undefined) updatePayload.geofence_lat = geofence_lat !== null ? Number(geofence_lat) : null;
    if (geofence_lng !== undefined) updatePayload.geofence_lng = geofence_lng !== null ? Number(geofence_lng) : null;
    if (geofence_radius_meters !== undefined) updatePayload.geofence_radius_meters = Number(geofence_radius_meters) || 150;
    if (geofence_enabled !== undefined) updatePayload.geofence_enabled = !!geofence_enabled;

    // Try updating with validated columns
    let { data: updatedBiz, error: updateErr } = await supa
      .from("businesses")
      .update(updatePayload)
      .eq("id", targetBizId)
      .select("*")
      .maybeSingle();

    if (updateErr) {
      console.warn("Business profile update failed, falling back to minimal payload:", updateErr.message);
      // Fallback: minimal logo and geofence
      const minimalPayload: any = {
        updated_at: new Date().toISOString(),
      };
      if (logo_url !== undefined) minimalPayload.logo_url = logo_url || "/dummy-logo.svg";
      if (caller.isSuperAdmin && name?.trim()) minimalPayload.name = name.trim();
      if (geofence_lat !== undefined) minimalPayload.geofence_lat = geofence_lat !== null ? Number(geofence_lat) : null;
      if (geofence_lng !== undefined) minimalPayload.geofence_lng = geofence_lng !== null ? Number(geofence_lng) : null;

      const { data: minBiz, error: minErr } = await supa
        .from("businesses")
        .update(minimalPayload)
        .eq("id", targetBizId)
        .select("*")
        .maybeSingle();

      if (minErr) {
        return NextResponse.json({ error: minErr.message }, { status: 500 });
      }
      updatedBiz = minBiz;
    }

    if (updatedBiz) {
      updatedBiz = {
        ...updatedBiz,
        upi_id: upi_id !== undefined ? upi_id : (updatedBiz.enabled_modules?.upi_id ?? updatedBiz.upi_id ?? ""),
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
    } catch (_) { }

    return NextResponse.json({ ok: true, business: updatedBiz });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
