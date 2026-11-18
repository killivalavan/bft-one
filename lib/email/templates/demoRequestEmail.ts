export interface DemoRequestEmailParams {
  name: string;
  phone: string;
  email?: string;
  storeName: string;
  city?: string;
  businessType: string;
  plan: string;
  currency: string;
  submittedAtIso: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeLine(value: string): string {
  return value.replace(/[\r\n\0-\x1F\x7F]+/g, " ").trim();
}

export function buildDemoRequestEmail(params: DemoRequestEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = sanitizeLine(params.name);
  const safePhone = sanitizeLine(params.phone);
  const safeEmail = sanitizeLine(params.email || "");
  const safeStoreName = sanitizeLine(params.storeName);
  const safeCity = sanitizeLine(params.city || "Not specified");
  const safeBusinessType = sanitizeLine(params.businessType);
  const safePlan = sanitizeLine(params.plan);
  const safeCurrency = sanitizeLine(params.currency);

  const formattedTime = (() => {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(params.submittedAtIso));
    } catch {
      return params.submittedAtIso;
    }
  })();

  const subject = `[CounterCub Demo Lead] ${safeStoreName} — ${safeBusinessType} (${safePlan} Plan)`.slice(
    0,
    180
  );

  const text = [
    "New Demo Request from CounterCub Website",
    "",
    `Full Name: ${safeName}`,
    `Phone / WhatsApp: ${safePhone}`,
    `Contact Email: ${safeEmail || "Not provided"}`,
    `Store / Business Name: ${safeStoreName}`,
    `City / Country: ${safeCity}`,
    `Business Type: ${safeBusinessType}`,
    `Interested Plan: ${safePlan} (${safeCurrency})`,
    `Submitted At (IST): ${formattedTime}`,
    "",
    "Sent via CounterCub Public Demo Form (www.countercub.com)",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background-color:#1e3a8a;padding:22px 28px;">
                <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">CounterCub</div>
                <div style="font-size:12px;color:#bfdbfe;margin-top:4px;">New Website Demo &amp; Store Setup Request</div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;font-size:14px;line-height:1.65;color:#1e293b;">
                <p style="margin:0 0 16px;">A prospective customer requested a 15-minute CounterCub demo from the landing page.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:13px;line-height:1.8;color:#334155;">
                      <div><strong>Full Name:</strong> ${escapeHtml(safeName)}</div>
                      <div><strong>Phone / WhatsApp:</strong> ${escapeHtml(safePhone)}</div>
                      <div><strong>Contact Email:</strong> ${escapeHtml(safeEmail || "Not provided")}</div>
                      <div><strong>Store / Business:</strong> ${escapeHtml(safeStoreName)}</div>
                      <div><strong>City / Country:</strong> ${escapeHtml(safeCity)}</div>
                      <div><strong>Business Type:</strong> ${escapeHtml(safeBusinessType)}</div>
                      <div><strong>Interested Plan:</strong> ${escapeHtml(safePlan)} (${escapeHtml(safeCurrency)})</div>
                      <div><strong>Submitted At (IST):</strong> ${escapeHtml(formattedTime)}</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
                  ${safeEmail ? "You can reply directly to this email to contact the lead." : "Use the phone/WhatsApp number above to reach the lead."}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
