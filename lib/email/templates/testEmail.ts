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
  const { environment } = params;
  const envLabel =
    environment.toLowerCase() === "production" ? "Production" : environment;
  const subject = "CounterCub - Resend Integration Test";

  const text = [
    "Hello,",
    "",
    "This is a test email from CounterCub.",
    "",
    "Your Resend email integration is working.",
    "",
    "Sender: support@countercub.com",
    "Application: CounterCub",
    `Environment: ${envLabel}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");

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
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:14px;line-height:1.65;color:#1e293b;">
                <p style="margin:0 0 14px;">Hello,</p>
                <p style="margin:0 0 14px;">This is a test email from CounterCub.</p>
                <p style="margin:0 0 18px;">Your Resend email integration is working.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;line-height:1.7;color:#334155;">
                      <div><strong>Sender:</strong> support@countercub.com</div>
                      <div><strong>Application:</strong> CounterCub</div>
                      <div><strong>Environment:</strong> ${envLabel}</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;">Regards,<br />CounterCub Support Team</p>
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
