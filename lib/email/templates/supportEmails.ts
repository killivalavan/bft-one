function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSupportResolvedEmail(p: {
  ticketId: string;
  storeName: string;
  issueTitle: string;
  resolutionSummary: string;
  resolvedDate: string;
  supportEmail: string;
}) {
  const subject = "Your CounterCub Support Request Has Been Resolved!";

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f172a;padding:20px 28px;">
                <span style="font-size:18px;font-weight:700;color:#ffffff;">CounterCub</span>
                <span style="display:inline-block;margin-left:10px;padding:2px 8px;border-radius:9999px;background-color:#065f46;color:#d1fae5;font-size:11px;font-weight:600;text-transform:uppercase;">Support Resolved</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:14px;line-height:1.65;color:#1e293b;">
                <p style="margin:0 0 14px;">Hello,</p>
                <p style="margin:0 0 16px;">
                  Your support request for <strong>${esc(p.storeName)}</strong> has been marked as <strong>Resolved</strong>.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;padding:14px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;">
                  <tr><td style="padding:5px 0;color:#64748b;width:165px;">Ticket ID</td><td style="padding:5px 0;color:#0f172a;font-weight:600;font-family:monospace;">${esc(p.ticketId)}</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b;">Store Name</td><td style="padding:5px 0;color:#0f172a;font-weight:600;">${esc(p.storeName)}</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b;">Issue Title</td><td style="padding:5px 0;color:#0f172a;font-weight:600;">${esc(p.issueTitle)}</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b;">Resolved Date</td><td style="padding:5px 0;color:#0f172a;font-weight:600;">${esc(p.resolvedDate)}</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b;">Support Email</td><td style="padding:5px 0;color:#0f172a;font-weight:600;">${esc(p.supportEmail)}</td></tr>
                </table>
                <div style="margin:16px 0;padding:14px 16px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;font-size:13px;color:#14532d;">
                  <div style="font-weight:700;margin-bottom:4px;">Resolution Summary</div>
                  <div>${esc(p.resolutionSummary)}</div>
                </div>
                <p style="margin:20px 0 0;font-size:13px;color:#475569;">
                  If the issue persists, you can reply to this email or reopen the ticket from your CounterCub dashboard.<br /><br />
                  Regards,<br />
                  CounterCub Support Team
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                CounterCub Platform &bull; ${esc(p.supportEmail)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Hello,",
    "",
    `Your support request for "${p.storeName}" has been resolved.`,
    "",
    `Ticket ID: ${p.ticketId}`,
    `Store Name: ${p.storeName}`,
    `Issue Title: ${p.issueTitle}`,
    `Resolution Summary: ${p.resolutionSummary}`,
    `Resolved Date: ${p.resolvedDate}`,
    `Support Email: ${p.supportEmail}`,
    "",
    "Regards,",
    "CounterCub Support Team",
  ].join("\n");

  return { subject, html, text };
}

