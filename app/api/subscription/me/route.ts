import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { getEffectiveEntitlements } from "@/lib/subscription/plans";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user, supa } = auth;
    const businessId = user.businessId;

    const [entitlements, plansRes, requestsRes] = await Promise.all([
      getEffectiveEntitlements(supa, businessId),
      supa
        .from("subscription_plans")
        .select("id, plan_key, plan_name, monthly_price, currency, max_active_products, max_employee_seats, support_level, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supa
        .from("subscription_requests")
        .select("*, requested_plan:subscription_plans(plan_key, plan_name, monthly_price)")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      entitlements,
      availablePlans: plansRes.data || [],
      requests: requestsRes.data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user, supa } = auth;
    const businessId = user.businessId;
    const body = await request.json().catch(() => ({}));

    const requestedPlanId = String(body.requestedPlanId || "").trim();
    const requestedDurationMonths = Number(body.requestedDurationMonths);
    const requestNote = String(body.requestNote || "").trim().slice(0, 500);

    if (!requestedPlanId) {
      return NextResponse.json({ error: "Please select a plan to request" }, { status: 400 });
    }
    if (![1, 3, 6, 12].includes(requestedDurationMonths)) {
      return NextResponse.json({ error: "Duration must be 1, 3, 6, or 12 months" }, { status: 400 });
    }

    const [{ data: plan }, { data: currentSub }] = await Promise.all([
      supa
        .from("subscription_plans")
        .select("id, plan_key, is_active")
        .eq("id", requestedPlanId)
        .eq("is_active", true)
        .maybeSingle(),
      supa
        .from("tenant_subscriptions")
        .select("id, plan_key_snapshot, expiry_date")
        .eq("business_id", businessId)
        .eq("is_current", true)
        .maybeSingle(),
    ]);

    if (!plan) {
      return NextResponse.json({ error: "Selected plan is not available" }, { status: 400 });
    }

    const { data: created, error } = await supa
      .from("subscription_requests")
      .insert({
        business_id: businessId,
        current_subscription_id: currentSub?.id || null,
        current_plan_key: currentSub?.plan_key_snapshot || "free",
        requested_plan_id: plan.id,
        requested_duration_months: requestedDurationMonths,
        current_expiry_date: currentSub?.expiry_date || null,
        request_note: requestNote || null,
        request_status: "pending",
      })
      .select("*, requested_plan:subscription_plans(plan_key, plan_name, monthly_price)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, request: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

