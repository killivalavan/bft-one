import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { checkRateLimit } from "@/lib/security/csrf";
import { sendTransactionalEmail } from "@/lib/email/emailService";
import { COUNTERCUB_EMAIL_FROM, COUNTERCUB_EMAIL_REPLY_TO } from "@/lib/email/resendClient";
import { extractClientMetadata, logAuditEvent } from "@/lib/services/auditLogger";

export const dynamic = "force-dynamic";

const SAMPLE_VARS: Record<string, string> = {
  storeName: "Royal Chai House",
  subdomain: "royal-chai.countercub.com",
  storePrefix: "KBS",
  storeId: "KBS74713",
  adminLoginId: "KBS74713",
  contactEmail: "owner@royalchai.com",
  adminName: "Aarav",
  planName: "Pro Plan",
  planPrice: "₹999",
  planAmount: "₹999",
  previousPlan: "Basic Plan",
  newPlan: "Pro Plan",
  priceDifference: "+₹500 / cycle",
  billingCycle: "Monthly (1 month)",
  productLimit: "250",
  employeeLimit: "25",
  activationDate: "16 Nov 2026",
  effectiveDate: "16 Nov 2026",
  expiryDate: "16 Dec 2026",
  daysRemainingLabel: "in 7 days",
  loginUrl: "https://royal-chai.countercub.com/login",
  renewalUrl: "https://royal-chai.countercub.com/admin/subscription",
  retryUrl: "https://royal-chai.countercub.com/admin/subscription",
  supportEmail: "support@countercub.com",
  ticketNumber: "SP-49281",
  issueTitle: "POS Printer Sync",
  resolutionSummary: "Updated thermal printer configuration and verified receipt printing.",
  resolvedDate: "16 Nov 2026",
  paymentAmount: "₹999",
  paymentDate: "16 Nov 2026",
  transactionRef: "TXN_904821",
  subscriptionStatus: "Active",
  renewalAmount: "₹999",
  accountStatus: "Expired",
  gracePeriodInfo: "Submit a renewal request from your Store Subscription page.",
  limitationsNote: "Limited to 50 active products and 3 employee seats.",
  failureReason: "Card authorization declined",
};

function interpolateSampleVars(tpl: string): string {
  return (tpl || "").replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_VARS[key] ?? `{{${key}}}`);
}

function sanitizeTemplateHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa } = auth;
    const { data, error } = await supa
      .from("email_templates")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ templates: data || [] });
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
    const templateKey = String(body?.templateKey || "").trim();

    if (!templateKey) {
      return NextResponse.json({ error: "templateKey is required." }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supa
      .from("email_templates")
      .select("*")
      .eq("template_key", templateKey)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    if (existing.is_mandatory && body?.isEnabled === false) {
      return NextResponse.json(
        { error: "Mandatory security and authentication templates cannot be disabled." },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_by: caller.id,
      updated_at: new Date().toISOString(),
    };
    if (typeof body?.subjectTemplate === "string" && body.subjectTemplate.trim()) {
      updates.subject_template = body.subjectTemplate.trim().slice(0, 200);
    }
    if (typeof body?.bodyHtmlTemplate === "string" && body.bodyHtmlTemplate.trim()) {
      updates.body_html_template = sanitizeTemplateHtml(body.bodyHtmlTemplate);
    }
    if (typeof body?.bodyTextTemplate === "string" && body.bodyTextTemplate.trim()) {
      updates.body_text_template = body.bodyTextTemplate.trim();
    }
    if (typeof body?.isEnabled === "boolean" && !existing.is_mandatory) {
      updates.is_enabled = body.isEnabled;
    }

    const { data: updated, error: upErr } = await supa
      .from("email_templates")
      .update(updates)
      .eq("template_key", templateKey)
      .select("*")
      .single();

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: null,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "EMAIL_TEMPLATE_MODIFIED",
      targetType: "email_template",
      targetId: templateKey,
      details: { updatedFields: Object.keys(updates) },
      ...clientMeta,
    });

    return NextResponse.json({ ok: true, template: updated });
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
    const rate = checkRateLimit(`super_admin_template_test:${caller.id}`, 10, 10 * 60_000);
    if (!rate.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many test email requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const { data: authUserResp, error: authErr } = await supa.auth.admin.getUserById(caller.id);
    const verifiedEmail = authUserResp?.user?.email_confirmed_at
      ? (authUserResp.user.email || "").trim().toLowerCase()
      : "";

    if (authErr || !verifiedEmail) {
      return NextResponse.json(
        { error: "Super Admin verified email address could not be resolved." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const templateKey = String(body?.templateKey || "").trim();
    if (!templateKey) {
      return NextResponse.json({ error: "templateKey is required." }, { status: 400 });
    }

    const { data: tpl, error: tplErr } = await supa
      .from("email_templates")
      .select("*")
      .eq("template_key", templateKey)
      .maybeSingle();

    if (tplErr || !tpl) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    const rawSubject =
      typeof body?.subjectTemplate === "string" && body.subjectTemplate.trim()
        ? body.subjectTemplate.trim()
        : tpl.subject_template;
    const rawBodyHtml =
      typeof body?.bodyHtmlTemplate === "string" && body.bodyHtmlTemplate.trim()
        ? sanitizeTemplateHtml(body.bodyHtmlTemplate)
        : sanitizeTemplateHtml(tpl.body_html_template);

    const subject = `[TEST] ${interpolateSampleVars(rawSubject)}`;
    const bodyHtml = interpolateSampleVars(rawBodyHtml);
    const vars: string[] = Array.isArray(tpl.allowed_variables) ? tpl.allowed_variables : [];
    const detailRows = vars
      .slice(0, 6)
      .map(
        (v) =>
          `<tr><td style="padding:5px 12px 5px 0;color:#64748b;width:140px;white-space:nowrap;text-transform:capitalize;">${v.replace(/([A-Z])/g, " $1")}</td><td style="padding:5px 0;color:#0f172a;font-weight:600;">${SAMPLE_VARS[v] || "Sample Value"}</td></tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;padding:20px 24px;">
                <span style="font-size:18px;font-weight:700;color:#ffffff;">CounterCub</span>
                <span style="display:inline-block;margin-left:10px;padding:2px 8px;border-radius:9999px;background:#1e293b;color:#cbd5e1;font-size:10px;font-weight:600;text-transform:uppercase;">${tpl.category} (Test)</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-size:14px;line-height:1.65;color:#1e293b;">
                ${bodyHtml}
                ${
                  detailRows
                    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;">${detailRows}</table>`
                    : ""
                }
                <p style="margin:18px 0 0;font-size:13px;color:#475569;">Regards,<br/>CounterCub Support Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                CounterCub Platform &bull; support@countercub.com
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const text = `${subject}\n\n${interpolateSampleVars(tpl.body_text_template || "")}\n\nRegards,\nCounterCub Support Team`;

    const res = await sendTransactionalEmail({
      to: [verifiedEmail],
      from: COUNTERCUB_EMAIL_FROM,
      replyTo: COUNTERCUB_EMAIL_REPLY_TO,
      subject,
      html,
      text,
      tags: [
        { name: "category", value: "template_test" },
        { name: "template_key", value: templateKey },
      ],
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.statusCode });
    }

    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: null,
      actorId: caller.id,
      actorEmail: verifiedEmail,
      action: "SUPER_ADMIN_TEST_EMAIL_SENT",
      targetType: "email_template",
      targetId: templateKey,
      details: { messageId: res.messageId, recipientEmail: verifiedEmail, templateName: tpl.name },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      messageId: res.messageId,
      recipient: verifiedEmail,
      templateKey,
      templateName: tpl.name,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

