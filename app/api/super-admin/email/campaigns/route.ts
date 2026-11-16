import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { checkRateLimit } from "@/lib/security/csrf";
import { sendTransactionalEmail } from "@/lib/email/emailService";
import { COUNTERCUB_EMAIL_FROM, COUNTERCUB_EMAIL_REPLY_TO } from "@/lib/email/resendClient";
import { createMarketingToken } from "@/lib/email/marketingToken";
import { resolveStoreAdminContact } from "@/lib/email/contactResolver";
import { extractClientMetadata, logAuditEvent } from "@/lib/services/auditLogger";

export const dynamic = "force-dynamic";

type CampaignCategory = "offers" | "features" | "announcements";

interface AudienceFilter {
  target: "all_opted_in" | "free" | "basic" | "pro" | "selected" | "inactive";
  selectedBusinessIds?: string[];
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

async function resolveCampaignAudience(
  supa: SupabaseClient,
  category: CampaignCategory,
  filter: AudienceFilter
) {
  const [{ data: businesses }, { data: prefs }, { data: bouncedRows }] = await Promise.all([
    supa.from("businesses").select("id, name, slug, plan_type, is_active"),
    supa.from("marketing_preferences").select("*"),
    supa
      .from("email_dispatches")
      .select("recipient_email")
      .in("status", ["bounced", "complained"]),
  ]);

  const suppressedEmails = new Set(
    (bouncedRows || []).map((r: any) => String(r.recipient_email || "").toLowerCase())
  );

  const prefByBiz = new Map<string, any>();
  for (const p of prefs || []) {
    prefByBiz.set(p.business_id, p);
  }

  const eligible: Array<{ businessId: string; storeName: string; contactEmail: string }> = [];
  let excludedCount = 0;

  for (const b of businesses || []) {
    // Filter by segment
    if (filter.target === "free" && b.plan_type !== "free") continue;
    if (filter.target === "basic" && b.plan_type !== "basic") continue;
    if (filter.target === "pro" && b.plan_type !== "pro") continue;
    if (filter.target === "inactive" && b.is_active) continue;
    if (
      filter.target === "selected" &&
      !(filter.selectedBusinessIds || []).includes(b.id)
    ) {
      continue;
    }

    const pref = prefByBiz.get(b.id);
    const optedIn =
      pref &&
      !pref.unsubscribed_all &&
      !pref.suppression_reason &&
      ((category === "offers" && pref.offers_opted_in) ||
        (category === "features" && pref.features_opted_in) ||
        (category === "announcements" && pref.announcements_opted_in));

    if (!optedIn) {
      excludedCount++;
      continue;
    }

    const email = String(pref.contact_email || "").toLowerCase().trim();
    if (!email || suppressedEmails.has(email) || email.endsWith(".internal")) {
      excludedCount++;
      continue;
    }

    eligible.push({ businessId: b.id, storeName: b.name, contactEmail: email });
  }

  return { eligible, excludedCount };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa } = auth;
    const { searchParams } = new URL(request.url);
    const previewAudience = searchParams.get("previewAudience") === "true";

    if (previewAudience) {
      const category = (searchParams.get("category") || "offers") as CampaignCategory;
      const target = (searchParams.get("target") || "all_opted_in") as AudienceFilter["target"];
      const { eligible, excludedCount } = await resolveCampaignAudience(supa, category, { target });
      return NextResponse.json({
        eligibleCount: eligible.length,
        excludedCount,
      });
    }

    const { data: campaigns, error } = await supa
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaigns: campaigns || [] });
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
    const rate = checkRateLimit(`super_admin_campaign:${caller.id}`, 20, 10 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "create_draft").trim();
    const clientMeta = extractClientMetadata(request);

    if (action === "cancel") {
      const campaignId = String(body?.campaignId || "").trim();
      if (!campaignId) return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
      const nowIso = new Date().toISOString();
      await supa
        .from("email_campaigns")
        .update({ status: "cancelled", cancelled_at: nowIso, updated_at: nowIso })
        .eq("id", campaignId)
        .in("status", ["draft", "scheduled"]);

      await logAuditEvent({
        actorId: caller.id,
        actorEmail: caller.email,
        action: "EMAIL_CAMPAIGN_CANCELLED",
        targetType: "email_campaign",
        targetId: campaignId,
        ...clientMeta,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "send_test") {
      const subject = String(body?.subject || "CounterCub Campaign Preview").trim();
      const bodyHtml = sanitizeHtml(String(body?.bodyHtml || "<p>Campaign preview</p>"));
      const { data: authUser } = await supa.auth.admin.getUserById(caller.id);
      const verifiedEmail = authUser?.user?.email_confirmed_at ? authUser.user.email : null;
      if (!verifiedEmail) {
        return NextResponse.json({ error: "Super Admin email not verified." }, { status: 400 });
      }
      const res = await sendTransactionalEmail({
        to: [verifiedEmail],
        from: COUNTERCUB_EMAIL_FROM,
        replyTo: COUNTERCUB_EMAIL_REPLY_TO,
        subject: `[TEST] ${subject}`,
        html: bodyHtml,
        text: subject,
        tags: [{ name: "category", value: "marketing_test" }],
      });
      return NextResponse.json(res.ok ? { ok: true, messageId: res.messageId } : { ok: false, error: res.error }, {
        status: res.ok ? 200 : 502,
      });
    }

    const name = String(body?.name || "").trim();
    const category = (body?.category || "offers") as CampaignCategory;
    const subject = String(body?.subject || "").trim();
    const bodyHtml = sanitizeHtml(String(body?.bodyHtml || "").trim());
    const audienceFilter = (body?.audienceFilter || { target: "all_opted_in" }) as AudienceFilter;

    if (!name || !subject || !bodyHtml) {
      return NextResponse.json({ error: "name, subject, and bodyHtml are required." }, { status: 400 });
    }

    const { eligible, excludedCount } = await resolveCampaignAudience(supa, category, audienceFilter);
    const status = action === "schedule" ? "scheduled" : action === "send_now" ? "sending" : "draft";
    const scheduledFor = action === "schedule" && body?.scheduledFor ? new Date(body.scheduledFor).toISOString() : null;

    const { data: campaign, error: insErr } = await supa
      .from("email_campaigns")
      .insert({
        name,
        category,
        subject,
        header_text: String(body?.headerText || "").trim(),
        body_html: bodyHtml,
        cta_label: String(body?.ctaLabel || "").trim(),
        cta_url: String(body?.ctaUrl || "").trim(),
        audience_filter: audienceFilter,
        status,
        scheduled_for: scheduledFor,
        eligible_count: eligible.length,
        excluded_count: excludedCount,
        created_by: caller.id,
      })
      .select("*")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    if (action === "send_now") {
      let sentCount = 0;
      for (const recipient of eligible) {
        const unsubToken = createMarketingToken(recipient.businessId, recipient.contactEmail);
        const unsubUrl = `https://www.countercub.com/email-preferences?token=${encodeURIComponent(unsubToken)}`;
        const fullHtml = `${bodyHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;"/><p style="font-size:12px;color:#64748b;">You received this because you opted into CounterCub ${category} updates. <a href="${unsubUrl}">Manage preferences or unsubscribe</a>.</p>`;

        const res = await sendTransactionalEmail({
          to: [recipient.contactEmail],
          from: COUNTERCUB_EMAIL_FROM,
          replyTo: COUNTERCUB_EMAIL_REPLY_TO,
          subject,
          html: fullHtml,
          text: `${subject}\n\nManage preferences / unsubscribe: ${unsubUrl}`,
          tags: [
            { name: "category", value: "marketing" },
            { name: "campaign_id", value: campaign.id },
          ],
        });

        await supa.from("email_dispatches").insert({
          idempotency_key: `campaign:${campaign.id}:${recipient.businessId}:${recipient.contactEmail}`,
          email_type: `campaign_${category}`,
          category: "marketing",
          priority: 3,
          business_id: recipient.businessId,
          recipient_email: recipient.contactEmail,
          from_email: COUNTERCUB_EMAIL_FROM,
          reply_to_email: COUNTERCUB_EMAIL_REPLY_TO,
          subject,
          campaign_id: campaign.id,
          status: res.ok ? "sent" : "failed",
          provider_message_id: res.ok ? res.messageId : null,
          last_error: res.ok ? null : res.error,
          attempt_count: 1,
          sent_at: res.ok ? new Date().toISOString() : null,
        });

        if (res.ok) sentCount++;
      }

      await supa
        .from("email_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", campaign.id);

      await logAuditEvent({
        actorId: caller.id,
        actorEmail: caller.email,
        action: "EMAIL_CAMPAIGN_SENT",
        targetType: "email_campaign",
        targetId: campaign.id,
        details: { name, eligibleCount: eligible.length, excludedCount, sentCount },
        ...clientMeta,
      });

      return NextResponse.json({
        ok: true,
        campaign: { ...campaign, status: "sent" },
        eligibleCount: eligible.length,
        excludedCount,
        sentCount,
      });
    }

    await logAuditEvent({
      actorId: caller.id,
      actorEmail: caller.email,
      action: action === "schedule" ? "EMAIL_CAMPAIGN_SCHEDULED" : "EMAIL_CAMPAIGN_CREATED",
      targetType: "email_campaign",
      targetId: campaign.id,
      details: { name, eligibleCount: eligible.length, excludedCount, scheduledFor },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      campaign,
      eligibleCount: eligible.length,
      excludedCount,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

