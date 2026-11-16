import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function verifyResendSvixSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;

  const tsNum = Number(svixTimestamp);
  if (Number.isNaN(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > 300) return false; // Reject replay older than 5 mins

  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  const signatures = svixSignature.split(" ");
  for (const item of signatures) {
    const [, sigVal] = item.split(",");
    if (!sigVal) continue;
    const a = Buffer.from(sigVal);
    const b = Buffer.from(expectedSig);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

const EVENT_STATUS_PRIORITY: Record<string, number> = {
  queued: 0,
  sending: 1,
  processing: 2,
  sent: 3,
  delivered: 4,
  bounced: 5,
  complained: 6,
  failed: 5,
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const svixId = request.headers.get("svix-id") || "";
    const svixTimestamp = request.headers.get("svix-timestamp") || "";
    const svixSignature = request.headers.get("svix-signature") || "";
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() || "";

    if (!verifyResendSvixSignature(rawBody, svixId, svixTimestamp, svixSignature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = String(event?.type || "");
    const messageId = String(event?.data?.email_id || event?.data?.id || "");
    const occurredAt = event?.created_at || new Date().toISOString();

    const supa = supabaseAdmin();

    // Deduplicate webhook delivery by svix-id
    const { error: dupErr } = await supa.from("email_webhook_events").insert({
      event_id: svixId,
      provider_message_id: messageId || null,
      event_type: eventType,
      occurred_at: occurredAt,
      payload_summary: {
        type: eventType,
        email_id: messageId,
      },
    });

    if (dupErr && dupErr.code === "23505") {
      return NextResponse.json({ ok: true, deduplicated: true });
    }

    if (!messageId) {
      return NextResponse.json({ ok: true });
    }

    const statusMap: Record<string, string> = {
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.delivery_failed": "failed",
    };
    const nextStatus = statusMap[eventType];
    if (!nextStatus) {
      return NextResponse.json({ ok: true });
    }

    const { data: dispatch } = await supa
      .from("email_dispatches")
      .select("id, status, recipient_email")
      .eq("provider_message_id", messageId)
      .maybeSingle();

    if (dispatch) {
      // Out-of-order protection: do not regress higher-terminal statuses (e.g. delivered -> sent)
      const currentRank = EVENT_STATUS_PRIORITY[dispatch.status] ?? 0;
      const nextRank = EVENT_STATUS_PRIORITY[nextStatus] ?? 0;
      if (nextRank >= currentRank) {
        const updates: Record<string, unknown> = {
          status: nextStatus,
          updated_at: new Date().toISOString(),
        };
        if (nextStatus === "delivered") updates.delivered_at = occurredAt;
        if (nextStatus === "bounced") updates.bounced_at = occurredAt;
        if (nextStatus === "complained") updates.complained_at = occurredAt;

        await supa.from("email_dispatches").update(updates).eq("id", dispatch.id);
      }

      // Suppress marketing for permanent bounce or spam complaint
      if ((nextStatus === "bounced" || nextStatus === "complained") && dispatch.recipient_email) {
        await supa
          .from("marketing_preferences")
          .update({
            unsubscribed_all: true,
            suppression_reason: nextStatus,
            unsubscribed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("contact_email", dispatch.recipient_email.toLowerCase());
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook processing failed." },
      { status: 500 }
    );
  }
}

