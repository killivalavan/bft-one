import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { extractClientMetadata, logAuditEvent } from "@/lib/services/auditLogger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa } = auth;
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId")?.trim();
    const category = searchParams.get("category")?.trim();
    const status = searchParams.get("status")?.trim();
    const search = searchParams.get("search")?.trim().toLowerCase();
    const scheduledOnly = searchParams.get("scheduledOnly") === "true";

    let query = supa
      .from("email_dispatches")
      .select("id, idempotency_key, email_type, category, priority, business_id, recipient_email, from_email, reply_to_email, subject, status, provider, provider_message_id, attempt_count, last_error, scheduled_for, sent_at, delivered_at, bounced_at, complained_at, cancelled_at, cancel_reason, created_at, businesses(name, slug)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (storeId) query = query.eq("business_id", storeId);
    if (category && category !== "all") query = query.eq("category", category);
    if (status && status !== "all") query = query.eq("status", status);
    if (scheduledOnly) query = query.not("scheduled_for", "is", null);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let logs = data || [];
    if (search) {
      logs = logs.filter((r: any) => {
        const storeName = String(r.businesses?.name || "").toLowerCase();
        const recipient = String(r.recipient_email || "").toLowerCase();
        const subject = String(r.subject || "").toLowerCase();
        const msgId = String(r.provider_message_id || "").toLowerCase();
        return (
          storeName.includes(search) ||
          recipient.includes(search) ||
          subject.includes(search) ||
          msgId.includes(search)
        );
      });
    }

    // Fetch webhook events for the returned provider_message_ids
    const msgIds = logs
      .map((l: any) => l.provider_message_id)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

    let eventsByMsgId: Record<string, any[]> = {};
    if (msgIds.length > 0) {
      const { data: evRows } = await supa
        .from("email_webhook_events")
        .select("event_id, provider_message_id, event_type, occurred_at, processed_at")
        .in("provider_message_id", msgIds)
        .order("processed_at", { ascending: true });

      for (const ev of evRows || []) {
        if (!ev.provider_message_id) continue;
        if (!eventsByMsgId[ev.provider_message_id]) eventsByMsgId[ev.provider_message_id] = [];
        eventsByMsgId[ev.provider_message_id].push(ev);
      }
    }

    return NextResponse.json({
      logs: logs.map((l: any) => ({
        ...l,
        webhookEvents: l.provider_message_id ? eventsByMsgId[l.provider_message_id] || [] : [],
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa, user: caller } = auth;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const dispatchId = String(body?.dispatchId || "").trim();

    if (action !== "cancel" || !dispatchId) {
      return NextResponse.json({ error: "action='cancel' and dispatchId are required." }, { status: 400 });
    }

    const { data: row } = await supa
      .from("email_dispatches")
      .select("id, status, priority, business_id, subject")
      .eq("id", dispatchId)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "Dispatch record not found." }, { status: 404 });
    }
    if (row.priority === 0) {
      return NextResponse.json(
        { error: "Mandatory P0 security/authentication emails cannot be cancelled." },
        { status: 403 }
      );
    }
    if (row.status !== "queued") {
      return NextResponse.json(
        { error: `Only queued notifications can be cancelled (current status: ${row.status}).` },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    await supa
      .from("email_dispatches")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        cancel_reason: String(body?.reason || "Cancelled by Super Admin").slice(0, 200),
        updated_at: nowIso,
      })
      .eq("id", dispatchId);

    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: row.business_id,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "EMAIL_MANUAL_CANCELLED",
      targetType: "email_dispatch",
      targetId: dispatchId,
      details: { subject: row.subject },
      ...clientMeta,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

