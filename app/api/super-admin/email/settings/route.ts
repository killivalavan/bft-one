import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { extractClientMetadata, logAuditEvent } from "@/lib/services/auditLogger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa } = auth;
    const { data, error } = await supa.from("email_settings").select("*").eq("id", 1).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ settings: data || null });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa, user: caller } = auth;
    const body = await request.json().catch(() => ({}));

    const updates: Record<string, unknown> = {
      updated_by: caller.id,
      updated_at: new Date().toISOString(),
    };

    if (typeof body?.senderName === "string" && body.senderName.trim()) {
      updates.sender_name = body.senderName.trim().slice(0, 80);
    }
    if (typeof body?.senderEmail === "string" && body.senderEmail.includes("@")) {
      updates.sender_email = body.senderEmail.trim().toLowerCase();
    }
    if (typeof body?.replyToEmail === "string" && body.replyToEmail.includes("@")) {
      updates.reply_to_email = body.replyToEmail.trim().toLowerCase();
    }
    if (typeof body?.reminder7dEnabled === "boolean") updates.reminder_7d_enabled = body.reminder7dEnabled;
    if (typeof body?.reminder1dEnabled === "boolean") updates.reminder_1d_enabled = body.reminder1dEnabled;
    if (typeof body?.reminder0dEnabled === "boolean") updates.reminder_0d_enabled = body.reminder0dEnabled;
    if (typeof body?.supportResolutionEnabled === "boolean") updates.support_resolution_enabled = body.supportResolutionEnabled;
    if (typeof body?.announcementsEnabled === "boolean") updates.announcements_enabled = body.announcementsEnabled;

    if (body?.sendHourLocal !== undefined) {
      const hr = Math.min(23, Math.max(0, Number(body.sendHourLocal)));
      if (!Number.isNaN(hr)) updates.send_hour_local = hr;
    }
    if (typeof body?.timezone === "string" && body.timezone.trim()) {
      updates.timezone = body.timezone.trim();
    }
    if (body?.appDailyLimit !== undefined) {
      const v = Math.max(1, Number(body.appDailyLimit));
      if (!Number.isNaN(v)) updates.app_daily_limit = v;
    }
    if (body?.appMonthlyLimit !== undefined) {
      const v = Math.max(1, Number(body.appMonthlyLimit));
      if (!Number.isNaN(v)) updates.app_monthly_limit = v;
    }
    if (body?.criticalReserveCount !== undefined) {
      const v = Math.max(0, Number(body.criticalReserveCount));
      if (!Number.isNaN(v)) updates.critical_reserve_count = v;
    }

    const { data, error } = await supa
      .from("email_settings")
      .update(updates)
      .eq("id", 1)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: null,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "EMAIL_SETTINGS_UPDATED",
      targetType: "email_settings",
      targetId: "1",
      details: { updatedFields: Object.keys(updates) },
      ...clientMeta,
    });

    return NextResponse.json({ ok: true, settings: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

