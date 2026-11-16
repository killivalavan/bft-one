export interface StoreAdminWelcomeEmailParams {
  storeName: string;
  slug?: string;
  storeId?: string;
  adminLoginId: string;
  contactEmail: string;
  planName: string;
  planAmountFormatted: string;
  billingCycle: string;
  productLimitLabel: string;
  employeeLimitLabel: string;
  activationDateLabel: string;
  expiryDateLabel?: string | null;
  loginUrl: string;
  passwordSetupUrl: string;
}

const BODY_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const LINK_STYLE = `font-family:${BODY_FONT};font-size:13px;font-weight:600;color:#2563eb;text-decoration:none;word-break:break-all;`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function detailRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:5px 12px 5px 0;font-family:${BODY_FONT};font-size:13px;color:#64748b;width:152px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:5px 0;font-family:${BODY_FONT};font-size:13px;color:#0f172a;font-weight:600;word-break:break-word;">${valueHtml}</td>
  </tr>`;
}

export function buildStoreAdminWelcomeEmail(params: StoreAdminWelcomeEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Welcome to CounterCub — ${params.storeName} is Ready`;
  const cleanSlug = (params.slug || "").trim();
  const cleanContactEmail = params.contactEmail.trim();
  const cleanAdminLoginId = params.adminLoginId.trim();
  const storeRefId = (
    params.storeId ||
    (!cleanAdminLoginId.includes("@") ? cleanAdminLoginId : "") ||
    ""
  )
    .trim()
    .toUpperCase();
  const hasSeparateAdminLoginId = Boolean(
    cleanAdminLoginId &&
      cleanAdminLoginId.toLowerCase() !== cleanContactEmail.toLowerCase() &&
      cleanAdminLoginId.toUpperCase() !== storeRefId
  );

  const expiryLineText = params.expiryDateLabel
    ? `Expiry Date: ${params.expiryDateLabel}`
    : null;

  const accountLinesText = [
    `Store Name: ${params.storeName}`,
    ...(cleanSlug ? [`Subdomain: ${cleanSlug}.countercub.com`] : []),
    ...(storeRefId ? [`Store Reference ID: ${storeRefId}`] : []),
    ...(hasSeparateAdminLoginId ? [`Admin Login ID: ${cleanAdminLoginId}`] : []),
    `Store Admin Mail ID: ${cleanContactEmail}`,
    `Login URL: ${params.loginUrl}`,
    ...(storeRefId
      ? [`Login Tip: Sign in using your Store Reference ID (${storeRefId}) or Store Admin Mail ID (${cleanContactEmail}).`]
      : []),
  ];

  const text = [
    "Hello,",
    "",
    `Your CounterCub store workspace "${params.storeName}" has been provisioned and is ready to use.`,
    "",
    "Account & Workspace Details:",
    ...accountLinesText,
    "",
    "Subscription & Plan Details:",
    `Plan Name: ${params.planName}`,
    `Plan Amount: ${params.planAmountFormatted}`,
    `Billing Cycle: ${params.billingCycle}`,
    `Product Limit: ${params.productLimitLabel}`,
    `Employee Seat Limit: ${params.employeeLimitLabel}`,
    `Activation Date: ${params.activationDateLabel}`,
    ...(expiryLineText ? [expiryLineText] : []),
    "",
    "First-Time Password Setup:",
    "For your security, we never send passwords by email. Use the secure link below to set your password and sign in:",
    params.passwordSetupUrl,
    "",
    "If you need assistance, reply directly to this email or contact support@countercub.com.",
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");

  const subdomainUrl = cleanSlug ? `https://${cleanSlug}.countercub.com` : "";
  const accountRowsHtml = [
    detailRow("Store Name", escapeHtml(params.storeName)),
    cleanSlug
      ? detailRow(
          "Subdomain",
          `<a href="${escapeHtml(subdomainUrl)}" style="${LINK_STYLE}">${escapeHtml(cleanSlug)}.countercub.com</a>`
        )
      : "",
    storeRefId ? detailRow("Store Reference ID", escapeHtml(storeRefId)) : "",
    hasSeparateAdminLoginId
      ? detailRow("Admin Login ID", escapeHtml(cleanAdminLoginId))
      : "",
    detailRow(
      "Store Admin Mail ID",
      `<a href="mailto:${escapeHtml(cleanContactEmail)}" style="${LINK_STYLE}">${escapeHtml(cleanContactEmail)}</a>`
    ),
    detailRow(
      "Login URL",
      `<a href="${escapeHtml(params.loginUrl)}" style="${LINK_STYLE}">${escapeHtml(params.loginUrl)}</a>`
    ),
  ].join("");

  const accountLoginTipHtml = storeRefId
    ? `<p style="margin:10px 0 0;padding-top:8px;border-top:1px dashed #cbd5e1;font-family:${BODY_FONT};font-size:12px;color:#475569;">Sign in to your store dashboard using your Store Reference ID (<strong>${escapeHtml(storeRefId)}</strong>) or your Store Admin Mail ID (<a href="mailto:${escapeHtml(cleanContactEmail)}" style="font-family:${BODY_FONT};font-size:12px;font-weight:600;color:#2563eb;text-decoration:none;">${escapeHtml(cleanContactEmail)}</a>).</p>`
    : "";

  const expiryRowHtml = params.expiryDateLabel
    ? detailRow("Expiry Date", escapeHtml(params.expiryDateLabel))
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f172a;padding:20px 24px;">
                <span style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">CounterCub</span>
                <span style="display:inline-block;margin-left:10px;padding:2px 8px;border-radius:9999px;background-color:#1e293b;color:#cbd5e1;font-size:11px;font-weight:600;text-transform:uppercase;">Store Onboarding</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-size:14px;line-height:1.65;color:#1e293b;">
                <p style="margin:0 0 14px;">Hello,</p>
                <p style="margin:0 0 18px;">
                  Your CounterCub store workspace <strong>${escapeHtml(params.storeName)}</strong> has been provisioned and is ready to use.
                </p>

                <div style="margin:18px 0;padding:14px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;margin-bottom:8px;">
                    Account &amp; Workspace Details
                  </div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;">
                    ${accountRowsHtml}
                  </table>
                  ${accountLoginTipHtml}
                </div>

                <div style="margin:18px 0;padding:14px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;margin-bottom:8px;">
                    Subscription &amp; Plan Details
                  </div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;">
                    ${detailRow("Plan Name", escapeHtml(params.planName))}
                    ${detailRow("Plan Amount", escapeHtml(params.planAmountFormatted))}
                    ${detailRow("Billing Cycle", escapeHtml(params.billingCycle))}
                    ${detailRow("Product Limit", escapeHtml(params.productLimitLabel))}
                    ${detailRow("Employee Seats", escapeHtml(params.employeeLimitLabel))}
                    ${detailRow("Activation Date", escapeHtml(params.activationDateLabel))}
                    ${expiryRowHtml}
                  </table>
                </div>

                <div style="margin:22px 0;">
                  <p style="margin:0 0 14px;font-size:13px;color:#475569;">
                    For your security, we never send passwords by email. Click below to set your password for the first time:
                  </p>
                  <a href="${escapeHtml(params.passwordSetupUrl)}" style="display:inline-block;padding:12px 22px;background-color:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                    Set Your Password
                  </a>
                </div>

                <p style="margin:20px 0 0;font-size:13px;color:#475569;">
                  Regards,<br />
                  CounterCub Support Team
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                CounterCub Platform &bull; support@countercub.com
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
