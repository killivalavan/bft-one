function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapLayout(title: string, badge: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f172a;padding:20px 28px;">
                <span style="font-size:18px;font-weight:700;color:#ffffff;">CounterCub</span>
                <span style="display:inline-block;margin-left:10px;padding:2px 8px;border-radius:9999px;background-color:#1e293b;color:#cbd5e1;font-size:11px;font-weight:600;text-transform:uppercase;">${esc(badge)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:14px;line-height:1.65;color:#1e293b;">
                ${bodyHtml}
                <p style="margin:22px 0 0;font-size:13px;color:#475569;">
                  Regards,<br />
                  CounterCub Support Team
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                CounterCub Platform &bull; support@countercub.com
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function detailTable(rows: Array<[string, string | null | undefined]>): string {
  const validRows = rows.filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== "");
  const trs = validRows
    .map(
      ([label, val]) =>
        `<tr><td style="padding:5px 0;color:#64748b;width:185px;">${esc(label)}</td><td style="padding:5px 0;color:#0f172a;font-weight:600;">${esc(String(val))}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;padding:14px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;">${trs}</table>`;
}

export function buildPlanActivatedEmail(p: {
  storeName: string;
  adminName?: string;
  planName: string;
  planPrice: string;
  billingCycle: string;
  productLimit: string;
  employeeLimit: string;
  activationDate: string;
  expiryDate?: string | null;
  loginUrl: string;
  supportEmail: string;
}) {
  const subject = "Your CounterCub Plan Has Been Activated!";
  const greeting = p.adminName ? `Hello ${p.adminName},` : "Hello,";
  const rows: Array<[string, string | null | undefined]> = [
    ["Store Name", p.storeName],
    ["Plan Name", p.planName],
    ["Plan Price", p.planPrice],
    ["Billing Cycle", p.billingCycle],
    ["Product Limit", p.productLimit],
    ["Employee Seat Limit", p.employeeLimit],
    ["Activation Date", p.activationDate],
    ["Expiry Date", p.expiryDate || "No Expiry (Free Plan)"],
    ["Login URL", p.loginUrl],
    ["Support Email", p.supportEmail],
  ];
  const html = wrapLayout(
    subject,
    "Subscription Active",
    `<p style="margin:0 0 14px;">${esc(greeting)}</p>
     <p style="margin:0 0 16px;">Your CounterCub subscription plan for <strong>${esc(p.storeName)}</strong> has been activated.</p>
     ${detailTable(rows)}
     <a href="${esc(p.loginUrl)}" style="display:inline-block;padding:11px 20px;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Open Store Workspace</a>`
  );
  const text = [
    greeting,
    "",
    `Your CounterCub subscription plan for "${p.storeName}" has been activated.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

export function buildPlanUpgradedEmail(p: {
  storeName: string;
  previousPlan: string;
  newPlan: string;
  priceDifference?: string | null;
  productLimit: string;
  employeeLimit: string;
  effectiveDate: string;
  expiryDate?: string | null;
  loginUrl: string;
}) {
  const subject = "Your CounterCub Plan Has Been Upgraded!";
  const rows: Array<[string, string | null | undefined]> = [
    ["Store Name", p.storeName],
    ["Previous Plan", p.previousPlan],
    ["New Plan", p.newPlan],
    ["Price Difference", p.priceDifference || undefined],
    ["Updated Product Limit", p.productLimit],
    ["Updated Employee Seats", p.employeeLimit],
    ["Effective Date", p.effectiveDate],
    ["New Expiry / Renewal Date", p.expiryDate || undefined],
  ];
  const html = wrapLayout(
    subject,
    "Plan Upgraded",
    `<p style="margin:0 0 14px;">Hello,</p>
     <p style="margin:0 0 16px;">Great news! Your CounterCub subscription for <strong>${esc(p.storeName)}</strong> has been upgraded.</p>
     ${detailTable(rows)}
     <a href="${esc(p.loginUrl)}" style="display:inline-block;padding:11px 20px;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Go to Workspace</a>`
  );
  const text = [
    "Hello,",
    "",
    `Your CounterCub subscription for "${p.storeName}" has been upgraded.`,
    "",
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    `Login URL: ${p.loginUrl}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

export function buildPlanDowngradedEmail(p: {
  storeName: string;
  previousPlan: string;
  newPlan: string;
  productLimit: string;
  employeeLimit: string;
  effectiveDate: string;
  limitationsNote: string;
  loginUrl: string;
}) {
  const subject = `CounterCub Plan Updated — ${p.storeName}`;
  const rows: Array<[string, string | null | undefined]> = [
    ["Store Name", p.storeName],
    ["Previous Plan", p.previousPlan],
    ["New Plan", p.newPlan],
    ["Updated Product Limit", p.productLimit],
    ["Updated Employee Seats", p.employeeLimit],
    ["Effective Date", p.effectiveDate],
  ];
  const html = wrapLayout(
    subject,
    "Plan Updated",
    `<p style="margin:0 0 14px;">Hello,</p>
     <p style="margin:0 0 16px;">Your CounterCub subscription for <strong>${esc(p.storeName)}</strong> has been changed to <strong>${esc(p.newPlan)}</strong>.</p>
     ${detailTable(rows)}
     <div style="margin:16px 0;padding:12px 14px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e;">
       <strong>Important Feature Limitations:</strong> ${esc(p.limitationsNote)}
     </div>
     <a href="${esc(p.loginUrl)}" style="display:inline-block;padding:11px 20px;background-color:#0f172a;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">View Subscription</a>`
  );
  const text = [
    "Hello,",
    "",
    `Your CounterCub subscription for "${p.storeName}" has been changed to ${p.newPlan}.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `Important Feature Limitations: ${p.limitationsNote}`,
    `Login URL: ${p.loginUrl}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

export function buildSubscriptionRenewedEmail(p: {
  storeName: string;
  planName: string;
  renewalAmount: string;
  renewalDate: string;
  newExpiryDate: string;
  transactionRef?: string | null;
  loginUrl: string;
}) {
  const subject = "Your CounterCub Subscription Has Been Renewed!";
  const rows: Array<[string, string | null | undefined]> = [
    ["Store Name", p.storeName],
    ["Renewed Plan", p.planName],
    ["Renewal Amount", p.renewalAmount],
    ["Renewal Date", p.renewalDate],
    ["New Expiry Date", p.newExpiryDate],
    ["Transaction Reference", p.transactionRef || undefined],
  ];
  const html = wrapLayout(
    subject,
    "Subscription Renewed",
    `<p style="margin:0 0 14px;">Hello,</p>
     <p style="margin:0 0 16px;">Your CounterCub subscription for <strong>${esc(p.storeName)}</strong> has been renewed.</p>
     ${detailTable(rows)}
     <a href="${esc(p.loginUrl)}" style="display:inline-block;padding:11px 20px;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Open Store Workspace</a>`
  );
  const text = [
    "Hello,",
    "",
    `Your CounterCub subscription for "${p.storeName}" has been renewed.`,
    "",
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    `Login URL: ${p.loginUrl}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

export function buildPaymentSucceededEmail(p: {
  storeName: string;
  paymentAmount: string;
  paymentDate: string;
  transactionRef: string;
  planName: string;
  subscriptionStatus: string;
  loginUrl: string;
}) {
  const subject = `CounterCub Payment Confirmed — ${p.planName}`;
  const rows: Array<[string, string]> = [
    ["Store Name", p.storeName],
    ["Payment Amount", p.paymentAmount],
    ["Payment Date", p.paymentDate],
    ["Transaction Reference", p.transactionRef],
    ["Plan", p.planName],
    ["Subscription Status", p.subscriptionStatus],
  ];
  const html = wrapLayout(
    subject,
    "Payment Confirmed",
    `<p style="margin:0 0 14px;">Hello,</p>
     <p style="margin:0 0 16px;">Thank you! Your payment for <strong>${esc(p.storeName)}</strong> has been confirmed.</p>
     ${detailTable(rows)}
     <a href="${esc(p.loginUrl)}" style="display:inline-block;padding:11px 20px;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">View Billing &amp; Subscription</a>`
  );
  const text = [
    "Hello,",
    "",
    `Your payment for "${p.storeName}" has been confirmed.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

export function buildPaymentFailedEmail(p: {
  storeName: string;
  planName: string;
  amount: string;
  failureSummary: string;
  retryPaymentUrl: string;
  supportEmail: string;
}) {
  const subject = `Action Required: Payment Issue for ${p.storeName}`;
  const rows: Array<[string, string]> = [
    ["Store Name", p.storeName],
    ["Plan", p.planName],
    ["Amount", p.amount],
    ["Status", p.failureSummary],
    ["Support Contact", p.supportEmail],
  ];
  const html = wrapLayout(
    subject,
    "Payment Action Needed",
    `<p style="margin:0 0 14px;">Hello,</p>
     <p style="margin:0 0 16px;">We were unable to process the subscription payment for <strong>${esc(p.storeName)}</strong>.</p>
     ${detailTable(rows)}
     <a href="${esc(p.retryPaymentUrl)}" style="display:inline-block;padding:11px 20px;background-color:#dc2626;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Review &amp; Retry Payment</a>`
  );
  const text = [
    "Hello,",
    "",
    `We were unable to process the subscription payment for "${p.storeName}".`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `Retry Payment: ${p.retryPaymentUrl}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

export function buildExpiryReminderEmail(p: {
  storeName: string;
  planName: string;
  planAmount?: string | null;
  expiryDate: string;
  daysBefore: 7 | 3 | 1 | 0;
  renewalUrl: string;
  loginUrl?: string;
  supportEmail?: string;
}) {
  const whenLabel =
    p.daysBefore === 7
      ? "in 7 days"
      : p.daysBefore === 3
        ? "in 3 days"
        : p.daysBefore === 1
          ? "tomorrow"
          : "today";
  const subject = `CounterCub Subscription Reminder — Expires ${whenLabel}`;
  const supportEmail = p.supportEmail || "support@countercub.com";
  const rows: Array<[string, string | null | undefined]> = [
    ["Store Name", p.storeName],
    ["Current Plan", p.planName],
    ["Plan Amount", p.planAmount || undefined],
    ["Expiry Date", p.expiryDate],
    ["Days Remaining", p.daysBefore === 0 ? "Expires today" : `${p.daysBefore} day(s)`],
    ["Login URL", p.loginUrl || undefined],
    ["Support Contact", supportEmail],
  ];
  const html = wrapLayout(
    subject,
    "Expiry Reminder",
    `<p style="margin:0 0 14px;">Hello,</p>
     <p style="margin:0 0 16px;">This is a reminder that the <strong>${esc(p.planName)}</strong> subscription for <strong>${esc(p.storeName)}</strong> expires <strong>${esc(whenLabel)}</strong>.</p>
     ${detailTable(rows)}
     <p style="margin:0 0 16px;font-size:13px;color:#475569;">To avoid interruption, please sign in to your Store Admin workspace and submit a renewal request from the Subscription page.</p>
     <a href="${esc(p.renewalUrl)}" style="display:inline-block;padding:11px 20px;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Renew Subscription</a>`
  );
  const text = [
    "Hello,",
    "",
    `Your ${p.planName} subscription for "${p.storeName}" expires ${whenLabel} (${p.expiryDate}).`,
    ...(p.planAmount ? [`Plan Amount: ${p.planAmount}`] : []),
    `Days Remaining: ${p.daysBefore}`,
    `Renew here: ${p.renewalUrl}`,
    ...(p.loginUrl ? [`Login URL: ${p.loginUrl}`] : []),
    `Support: ${supportEmail}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

export function buildSubscriptionExpiredEmail(p: {
  storeName: string;
  expiredPlan: string;
  planAmount?: string | null;
  expiryDate: string;
  accountStatus: string;
  gracePeriodInfo?: string | null;
  renewalUrl: string;
  loginUrl?: string;
  supportEmail?: string;
}) {
  const subject = `Your CounterCub Subscription Has Expired — ${p.storeName}`;
  const supportEmail = p.supportEmail || "support@countercub.com";
  const rows: Array<[string, string | null | undefined]> = [
    ["Store Name", p.storeName],
    ["Expired Plan", p.expiredPlan],
    ["Plan Amount", p.planAmount || undefined],
    ["Expiry Date", p.expiryDate],
    ["Current Account Status", p.accountStatus],
    ["Grace Period", p.gracePeriodInfo || undefined],
    ["Login URL", p.loginUrl || undefined],
    ["Support Contact", supportEmail],
  ];
  const html = wrapLayout(
    subject,
    "Subscription Expired",
    `<p style="margin:0 0 14px;">Hello,</p>
     <p style="margin:0 0 16px;">Your <strong>${esc(p.expiredPlan)}</strong> subscription for <strong>${esc(p.storeName)}</strong> has expired.</p>
     ${detailTable(rows)}
     <p style="margin:0 0 16px;font-size:13px;color:#475569;">Please sign in to your Store Admin workspace and submit a renewal request, or reply to ${esc(supportEmail)} for assistance.</p>
     <a href="${esc(p.renewalUrl)}" style="display:inline-block;padding:11px 20px;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Renew Subscription Now</a>`
  );
  const text = [
    "Hello,",
    "",
    `Your ${p.expiredPlan} subscription for "${p.storeName}" has expired.`,
    "",
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    `Renew here: ${p.renewalUrl}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");
  return { subject, html, text };
}

