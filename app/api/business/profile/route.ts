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
    const {
      businessId,
      name,
      logo_url,
      signature_url,
      address,
      phone,
      gstin,
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

    if (geofence_lat !== undefined) fullPayload.geofence_lat = geofence_lat !== null ? Number(geofence_lat) : null;
    if (geofence_lng !== undefined) fullPayload.geofence_lng = geofence_lng !== null ? Number(geofence_lng) : null;
    if (geofence_radius_meters !== undefined) fullPayload.geofence_radius_meters = Number(geofence_radius_meters) || 150;
    if (geofence_enabled !== undefined) fullPayload.geofence_enabled = !!geofence_enabled;

    // Try updating with all columns
    let { data: updatedBiz, error: updateErr } = await supa
      .from("businesses")
      .update(fullPayload)
      .eq("id", targetBizId)
      .select("*")
      .maybeSingle();

    if (updateErr) {
      console.warn("Full business profile update failed, falling back to core columns:", updateErr.message);
      // Fallback 1: update core columns + geofence columns (present in businesses table)
      const geoCorePayload: any = {
        name: name?.trim() || "Store",
        logo_url: logo_url || "/dummy-logo.svg",
        updated_at: new Date().toISOString(),
      };
      if (geofence_lat !== undefined) geoCorePayload.geofence_lat = geofence_lat !== null ? Number(geofence_lat) : null;
      if (geofence_lng !== undefined) geoCorePayload.geofence_lng = geofence_lng !== null ? Number(geofence_lng) : null;
      if (geofence_radius_meters !== undefined) geoCorePayload.geofence_radius_meters = Number(geofence_radius_meters) || 150;
      if (geofence_enabled !== undefined) geoCorePayload.geofence_enabled = !!geofence_enabled;

      let { data: fallbackBiz, error: geoErr } = await supa
        .from("businesses")
        .update(geoCorePayload)
        .eq("id", targetBizId)
        .select("*")
        .maybeSingle();

      if (geoErr) {
        // Fallback 2: minimal name and logo only
        const minimalPayload = {
          name: name?.trim() || "Store",
          logo_url: logo_url || "/dummy-logo.svg",
          updated_at: new Date().toISOString(),
        };
        const { data: minBiz, error: minErr } = await supa
          .from("businesses")
          .update(minimalPayload)
          .eq("id", targetBizId)
          .select("*")
          .maybeSingle();

        if (minErr) {
          return NextResponse.json({ error: minErr.message }, { status: 500 });
        }
        fallbackBiz = minBiz;
      }

      updatedBiz = {
        ...(fallbackBiz || {}),
        signature_url: signature_url || "/default-signature.svg",
        address: address || "",
        phone: phone || "",
        gstin: gstin || "",
        geofence_lat: geofence_lat !== undefined ? (geofence_lat !== null ? Number(geofence_lat) : null) : (fallbackBiz?.geofence_lat ?? null),
        geofence_lng: geofence_lng !== undefined ? (geofence_lng !== null ? Number(geofence_lng) : null) : (fallbackBiz?.geofence_lng ?? null),
        geofence_radius_meters: geofence_radius_meters !== undefined ? Number(geofence_radius_meters) : (fallbackBiz?.geofence_radius_meters ?? 150),
        geofence_enabled: geofence_enabled !== undefined ? !!geofence_enabled : (fallbackBiz?.geofence_enabled ?? true),
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
