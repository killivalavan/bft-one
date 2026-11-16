import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { checkRateLimit } from "@/lib/security/csrf";
import { notifyPaymentEvent } from "@/lib/email/subscriptionNotificationService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa, user: caller } = auth;
    const rate = checkRateLimit(`super_admin_payment_email:${caller.id}`, 10, 10 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const status = body?.status === "succeeded" || body?.status === "failed" ? body.status : null;
    const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
    const transactionRef = typeof body?.transactionRef === "string" ? body.transactionRef.trim() : "";
    const amount = Number(body?.amount);

    if (!status || !businessId || !transactionRef || Number.isNaN(amount) || amount < 0) {
      return NextResponse.json(
        { error: "status ('succeeded'|'failed'), businessId, transactionRef, and valid amount are required." },
        { status: 400 }
      );
    }

    const { data: currentSub } = await supa
      .from("tenant_subscriptions")
      .select("plan_name_snapshot, subscription_status")
      .eq("business_id", businessId)
      .eq("is_current", true)
      .maybeSingle();

    const result = await notifyPaymentEvent(supa, {
      status,
      businessId,
      planName: currentSub?.plan_name_snapshot || String(body?.planName || "CounterCub Plan"),
      amount,
      transactionRef,
      subscriptionStatus: currentSub?.subscription_status || "active",
      failureSummary: typeof body?.failureSummary === "string" ? body.failureSummary : undefined,
      failureCycleKey: typeof body?.failureCycleKey === "string" ? body.failureCycleKey : undefined,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

