import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

const EMAIL_AUDIT_ACTIONS = [
  "SUPER_ADMIN_TEST_EMAIL_SENT",
  "STORE_WELCOME_EMAIL_SENT",
  "STORE_WELCOME_EMAIL_FAILED",
  "EMAIL_TEMPLATE_MODIFIED",
  "EMAIL_SETTINGS_UPDATED",
  "EMAIL_MANUAL_CANCELLED",
  "EMAIL_CAMPAIGN_CREATED",
  "EMAIL_CAMPAIGN_SCHEDULED",
  "EMAIL_CAMPAIGN_SENT",
  "EMAIL_CAMPAIGN_CANCELLED",
];

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa } = auth;
    const { data, error } = await supa
      .from("audit_logs")
      .select("id, business_id, actor_id, actor_email, action, target_type, target_id, details, created_at")
      .in("action", EMAIL_AUDIT_ACTIONS)
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ auditLogs: data || [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

