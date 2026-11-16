import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Scheduled Email Processing is deferred for the current release.
 * This endpoint is intentionally inactive and does not require CRON_SECRET
 * or dispatch any scheduled reminders.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    disabled: true,
    message: "Scheduled email processing is deferred for the current release.",
  });
}
