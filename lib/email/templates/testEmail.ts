export interface SuperAdminTestEmailParams {
  recipientEmail: string;
  timestampIso: string;
  environment: string;
}

export function buildSuperAdminTestEmail(params: SuperAdminTestEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientEmail, timestampIso, environment } = params;
  const subject = "CounterCub Email Integration Verification";

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f172a;padding:20px 28px;">
                <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">CounterCub</span>
                <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:9999px;background-color:#1e293b;color:#cbd5e1;font-size:11px;font-weight:600;text-transform:uppercase;">Platform Ops</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">Transactional Email Verification</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                  This is an authenticated Super Admin verification message confirming that CounterCub&rsquo;s server-side Resend integration is configured and able to dispatch transactional mail.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;line-height:1.7;color:#334155;">
                      <div><strong>Recipient:</strong> ${recipientEmail}</div>
                      <div><strong>Sender:</strong> CounterCub Support &lt;support@countercub.com&gt;</div>
                      <div><strong>Reply-To:</strong> support@countercub.com</div>
                      <div><strong>Environment:</strong> ${environment}</div>
                      <div><strong>Dispatched At (UTC):</strong> ${timestampIso}</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
                  No action is required. If you did not trigger this verification from the CounterCub Super Admin portal, please review your platform audit logs immediately.
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

  const text = [
    "CounterCub — Transactional Email Verification",
    "",
    "This is an authenticated Super Admin verification message confirming that CounterCub's server-side Resend integration is configured and able to dispatch transactional mail.",
    "",
    `Recipient: ${recipientEmail}`,
    "Sender: CounterCub Support <support@countercub.com>",
    "Reply-To: support@countercub.com",
    `Environment: ${environment}`,
    `Dispatched At (UTC): ${timestampIso}`,
    "",
    "No action is required. If you did not trigger this verification from the CounterCub Super Admin portal, please review your platform audit logs immediately.",
  ].join("\n");

  return { subject, html, text };
}

