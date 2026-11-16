import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoreAdminContact } from "@/lib/email/contactResolver";
import { sendTransactionalEmail } from "@/lib/email/emailService";
import {
  COUNTERCUB_EMAIL_FROM,
  COUNTERCUB_EMAIL_REPLY_TO,
} from "@/lib/email/resendClient";
import { buildSupportResolvedEmail } from "@/lib/email/templates/supportEmails";

export async function notifySupportTicketResolved(
  supa: SupabaseClient,
  params: {
    ticketId: string;
    ticketNumber: string;
    businessId: string;
    title: string;
    resolutionNotes?: string | null;
    resolvedAtIso: string;
  }
) {
  try {
    const { data: settings } = await supa
      .from("email_settings")
      .select("sender_name, sender_email, reply_to_email, support_resolution_enabled")
      .eq("id", 1)
      .maybeSingle();

    if (settings?.support_resolution_enabled === false) {
      return { skippedDisabled: true };
    }

    const contact = await resolveStoreAdminContact(supa, params.businessId);
    if (!contact?.contactEmail) {
      return { skippedNoContact: true };
    }

    const from = settings?.sender_email
      ? `${settings.sender_name || "CounterCub Support"} <${settings.sender_email}>`
      : COUNTERCUB_EMAIL_FROM;
    const replyTo = settings?.reply_to_email || COUNTERCUB_EMAIL_REPLY_TO;

    const resolvedDate = new Date(params.resolvedAtIso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });

    const content = buildSupportResolvedEmail({
      ticketId: params.ticketNumber || params.ticketId,
      storeName: contact.storeName,
      issueTitle: params.title,
      resolutionSummary:
        (params.resolutionNotes || "").trim() ||
        "Your support request has been resolved by the CounterCub team.",
      resolvedDate,
      supportEmail: replyTo,
    });

    // Cycle key includes resolvedAtIso so reopened & re-resolved tickets send a new notification,
    // while repeated edits to an already-resolved ticket do not re-trigger.
    const idempotencyKey = `support_resolved:${params.ticketId}:${params.resolvedAtIso}`;
    const { data: inserted, error: insErr } = await supa
      .from("email_dispatches")
      .insert({
        idempotency_key: idempotencyKey,
        email_type: "support_ticket_resolved",
        category: "support",
        priority: 1,
        business_id: params.businessId,
        user_id: contact.adminUserId,
        recipient_email: contact.contactEmail,
        from_email: from,
        reply_to_email: replyTo,
        subject: content.subject,
        payload: {
          ticketId: params.ticketId,
          ticketNumber: params.ticketNumber,
          resolvedAtIso: params.resolvedAtIso,
        },
        status: "sending",
        provider: "resend",
      })
      .select("id")
      .single();

    if (insErr && insErr.code === "23505") {
      return { skippedDuplicate: true };
    }

    const res = await sendTransactionalEmail({
      to: [contact.contactEmail],
      from,
      replyTo,
      subject: content.subject,
      html: content.html,
      text: content.text,
      tags: [
        { name: "category", value: "support" },
        { name: "email_type", value: "support_ticket_resolved" },
        { name: "business_id", value: params.businessId },
      ],
    });

    const nowIso = new Date().toISOString();
    if (inserted?.id) {
      await supa
        .from("email_dispatches")
        .update(
          res.ok
            ? {
                status: "sent",
                provider_message_id: res.messageId,
                attempt_count: 1,
                sent_at: nowIso,
                last_attempted_at: nowIso,
                updated_at: nowIso,
              }
            : {
                status: "failed",
                attempt_count: 1,
                last_error: res.error,
                last_attempted_at: nowIso,
                updated_at: nowIso,
              }
        )
        .eq("id", inserted.id);
    }

    return res;
  } catch (err: unknown) {
    console.error(
      "[SupportEmail] Non-fatal error:",
      err instanceof Error ? err.message : "Unknown error"
    );
    return { ok: false };
  }
}

