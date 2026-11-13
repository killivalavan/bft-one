import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import {
  addCalendarMonths,
  calculateExtensionExpiry,
  deriveSubscriptionState,
  getTenantUsageCounts,
} from "@/lib/subscription/plans";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa } = auth;
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (businessId) {
      const [subRes, eventsRes, reqsRes, usage] = await Promise.all([
        supa
          .from("tenant_subscriptions")
          .select("*")
          .eq("business_id", businessId)
          .eq("is_current", true)
          .maybeSingle(),
        supa
          .from("subscription_events")
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(50),
        supa
          .from("subscription_requests")
          .select("*, requested_plan:subscription_plans(plan_key, plan_name, monthly_price)")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(30),
        getTenantUsageCounts(supa, businessId),
      ]);

      return NextResponse.json({
        subscription: subRes.data || null,
        derived: subRes.data ? deriveSubscriptionState(subRes.data) : null,
        events: eventsRes.data || [],
        requests: reqsRes.data || [],
        usage,
      });
    }

    // Platform-wide pending requests & recent events
    const [reqsRes, eventsRes] = await Promise.all([
      supa
        .from("subscription_requests")
        .select(
          "*, requested_plan:subscription_plans(plan_key, plan_name, monthly_price), businesses(id, name, slug, enabled_modules)"
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supa
        .from("subscription_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return NextResponse.json({
      requests: reqsRes.data || [],
      events: eventsRes.data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa, user: caller } = auth;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const businessId = String(body.businessId || "").trim();
    const reason = String(body.reason || "").trim();

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    // Review renewal / upgrade request
    if (action === "review_request") {
      const requestId = String(body.requestId || "").trim();
      const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
      if (!requestId || !decision) {
        return NextResponse.json({ error: "requestId and valid decision (approved/rejected) are required" }, { status: 400 });
      }
      if (!reason) {
        return NextResponse.json({ error: "An administrative note is required" }, { status: 400 });
      }

      const { data: reqRow, error: reqErr } = await supa
        .from("subscription_requests")
        .select("*, requested_plan:subscription_plans(*)")
        .eq("id", requestId)
        .maybeSingle();

      if (reqErr || !reqRow) {
        return NextResponse.json({ error: "Subscription request not found" }, { status: 404 });
      }
      if (reqRow.request_status !== "pending") {
        return NextResponse.json({ error: "This request has already been reviewed" }, { status: 409 });
      }

      const nowIso = new Date().toISOString();

      if (decision === "rejected") {
        await supa
          .from("subscription_requests")
          .update({
            request_status: "rejected",
            admin_note: reason,
            reviewed_by: caller.id,
            reviewed_at: nowIso,
          })
          .eq("id", requestId);

        await supa.from("subscription_events").insert({
          business_id: reqRow.business_id,
          subscription_id: reqRow.current_subscription_id,
          event_type: "RENEWAL_REQUEST_REJECTED",
          previous_values: { request_id: requestId, status: "pending" },
          new_values: { request_id: requestId, status: "rejected" },
          admin_id: caller.id,
          admin_email: caller.email,
          reason,
        });

        return NextResponse.json({ ok: true, status: "rejected" });
      }

      // Approved: activate or extend requested plan
      const targetPlan = reqRow.requested_plan;
      if (!targetPlan) {
        return NextResponse.json({ error: "Requested plan no longer exists" }, { status: 400 });
      }

      const { data: currentSub } = await supa
        .from("tenant_subscriptions")
        .select("*")
        .eq("business_id", reqRow.business_id)
        .eq("is_current", true)
        .maybeSingle();

      const now = new Date();
      const durationMonths = Number(reqRow.requested_duration_months) || 1;
      const isSamePlanRenewal = currentSub && currentSub.plan_id === targetPlan.id;
      const newExpiry =
        targetPlan.plan_key === "free"
          ? null
          : isSamePlanRenewal
            ? calculateExtensionExpiry(currentSub.expiry_date, durationMonths, now).toISOString()
            : addCalendarMonths(now, durationMonths).toISOString();

      if (currentSub) {
        await supa
          .from("tenant_subscriptions")
          .update({ is_current: false, updated_at: nowIso })
          .eq("id", currentSub.id);
      }

      const { data: newSub, error: newSubErr } = await supa
        .from("tenant_subscriptions")
        .insert({
          business_id: reqRow.business_id,
          plan_id: targetPlan.id,
          plan_key_snapshot: targetPlan.plan_key,
          plan_name_snapshot: targetPlan.plan_name,
          subscription_status: "active",
          start_date: nowIso,
          expiry_date: newExpiry,
          billing_duration_months: targetPlan.plan_key === "free" ? null : durationMonths,
          price_snapshot: targetPlan.monthly_price,
          product_limit_snapshot: targetPlan.max_active_products,
          employee_limit_snapshot: targetPlan.max_employee_seats,
          support_level_snapshot: targetPlan.support_level,
          custom_limit_overrides: {},
          is_current: true,
          created_by: caller.id,
        })
        .select("*")
        .single();

      if (newSubErr) {
        return NextResponse.json({ error: newSubErr.message }, { status: 500 });
      }

      await Promise.all([
        supa
          .from("businesses")
          .update({
            plan_type: targetPlan.plan_key,
            max_users: targetPlan.max_employee_seats,
            is_active: true,
            updated_at: nowIso,
          })
          .eq("id", reqRow.business_id),
        supa
          .from("subscription_requests")
          .update({
            request_status: "approved",
            admin_note: reason,
            reviewed_by: caller.id,
            reviewed_at: nowIso,
          })
          .eq("id", requestId),
        supa.from("subscription_events").insert({
          business_id: reqRow.business_id,
          subscription_id: newSub.id,
          event_type: "RENEWAL_REQUEST_APPROVED",
          previous_values: currentSub
            ? {
                plan_key: currentSub.plan_key_snapshot,
                status: currentSub.subscription_status,
                expiry_date: currentSub.expiry_date,
              }
            : {},
          new_values: {
            plan_key: targetPlan.plan_key,
            status: "active",
            expiry_date: newExpiry,
            duration_months: durationMonths,
          },
          admin_id: caller.id,
          admin_email: caller.email,
          reason,
        }),
      ]);

      return NextResponse.json({ ok: true, status: "approved", subscription: newSub });
    }

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "An administrative note/reason is required for subscription changes" }, { status: 400 });
    }

    const { data: currentSub } = await supa
      .from("tenant_subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_current", true)
      .maybeSingle();

    const now = new Date();
    const nowIso = now.toISOString();

    if (action === "change_plan") {
      const planId = String(body.planId || "").trim();
      const { data: plan, error: planErr } = await supa
        .from("subscription_plans")
        .select("*")
        .eq("id", planId)
        .maybeSingle();

      if (planErr || !plan) {
        return NextResponse.json({ error: "Selected subscription plan not found" }, { status: 404 });
      }

      const overrides = body.customOverrides && typeof body.customOverrides === "object" ? body.customOverrides : {};
      const customPrice =
        overrides.monthly_price !== undefined && overrides.monthly_price !== ""
          ? Number(overrides.monthly_price)
          : Number(plan.monthly_price);
      const customProducts =
        overrides.is_unlimited_products === true
          ? null
          : overrides.max_active_products !== undefined && overrides.max_active_products !== ""
            ? Number(overrides.max_active_products)
            : plan.max_active_products;
      const customSeats =
        overrides.max_employee_seats !== undefined && overrides.max_employee_seats !== ""
          ? Number(overrides.max_employee_seats)
          : plan.max_employee_seats;
      const customSupport =
        overrides.support_level === "priority" || overrides.support_level === "standard"
          ? overrides.support_level
          : plan.support_level;

      const durationMonths = plan.plan_key === "free" ? null : Number(body.billingDurationMonths) || 1;
      let nextExpiry: string | null = null;
      if (body.expiryDate) {
        nextExpiry = new Date(body.expiryDate).toISOString();
      } else if (plan.plan_key !== "free" && durationMonths) {
        nextExpiry = addCalendarMonths(now, durationMonths).toISOString();
      }

      if (currentSub) {
        await supa
          .from("tenant_subscriptions")
          .update({ is_current: false, updated_at: nowIso })
          .eq("id", currentSub.id);
      }

      const { data: newSub, error: insertErr } = await supa
        .from("tenant_subscriptions")
        .insert({
          business_id: businessId,
          plan_id: plan.id,
          plan_key_snapshot: plan.plan_key,
          plan_name_snapshot: plan.plan_name,
          subscription_status: "active",
          start_date: nowIso,
          expiry_date: nextExpiry,
          billing_duration_months: durationMonths,
          price_snapshot: customPrice,
          product_limit_snapshot: customProducts,
          employee_limit_snapshot: customSeats,
          support_level_snapshot: customSupport,
          custom_limit_overrides: overrides,
          is_current: true,
          created_by: caller.id,
        })
        .select("*")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      await Promise.all([
        supa
          .from("businesses")
          .update({
            plan_type: plan.plan_key,
            max_users: customSeats,
            is_active: true,
            updated_at: nowIso,
          })
          .eq("id", businessId),
        supa.from("subscription_events").insert({
          business_id: businessId,
          subscription_id: newSub.id,
          event_type: "PLAN_CHANGED",
          previous_values: currentSub
            ? {
                plan_key: currentSub.plan_key_snapshot,
                status: currentSub.subscription_status,
                expiry_date: currentSub.expiry_date,
                price: currentSub.price_snapshot,
                product_limit: currentSub.product_limit_snapshot,
                employee_limit: currentSub.employee_limit_snapshot,
              }
            : {},
          new_values: {
            plan_key: plan.plan_key,
            status: "active",
            expiry_date: nextExpiry,
            price: customPrice,
            product_limit: customProducts,
            employee_limit: customSeats,
          },
          admin_id: caller.id,
          admin_email: caller.email,
          reason,
        }),
      ]);

      return NextResponse.json({ ok: true, subscription: newSub });
    }

    if (!currentSub) {
      return NextResponse.json({ error: "No active subscription record found for this store" }, { status: 404 });
    }

    if (action === "extend") {
      let newExpiryDate: Date;
      if (body.customExpiryDate) {
        newExpiryDate = new Date(body.customExpiryDate);
        if (Number.isNaN(newExpiryDate.getTime())) {
          return NextResponse.json({ error: "Invalid custom expiry date" }, { status: 400 });
        }
        // Never remove remaining subscription period
        if (currentSub.expiry_date) {
          const existingExp = new Date(currentSub.expiry_date);
          if (existingExp.getTime() > now.getTime() && newExpiryDate.getTime() < existingExp.getTime()) {
            return NextResponse.json(
              { error: "Extension cannot be earlier than the current active expiry date. Use Edit Expiry Date if you intend to shorten it." },
              { status: 400 }
            );
          }
        }
      } else {
        const months = Number(body.durationMonths);
        if (![1, 3, 6, 12].includes(months)) {
          return NextResponse.json({ error: "Extension duration must be 1, 3, 6, or 12 months" }, { status: 400 });
        }
        newExpiryDate = calculateExtensionExpiry(currentSub.expiry_date, months, now);
      }

      const newExpiryIso = newExpiryDate.toISOString();
      const { data: updated, error: upErr } = await supa
        .from("tenant_subscriptions")
        .update({
          expiry_date: newExpiryIso,
          subscription_status: "active",
          updated_at: nowIso,
        })
        .eq("id", currentSub.id)
        .select("*")
        .single();

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      await Promise.all([
        supa.from("businesses").update({ is_active: true, updated_at: nowIso }).eq("id", businessId),
        supa.from("subscription_events").insert({
          business_id: businessId,
          subscription_id: currentSub.id,
          event_type: "SUBSCRIPTION_EXTENDED",
          previous_values: {
            plan_key: currentSub.plan_key_snapshot,
            status: currentSub.subscription_status,
            expiry_date: currentSub.expiry_date,
          },
          new_values: {
            plan_key: currentSub.plan_key_snapshot,
            status: "active",
            expiry_date: newExpiryIso,
          },
          admin_id: caller.id,
          admin_email: caller.email,
          reason,
        }),
      ]);

      return NextResponse.json({ ok: true, subscription: updated });
    }

    if (action === "edit_expiry") {
      const nextExpiryIso = body.expiryDate ? new Date(body.expiryDate).toISOString() : null;
      const nextStatus =
        nextExpiryIso && new Date(nextExpiryIso).getTime() <= now.getTime()
          ? "expired"
          : currentSub.subscription_status === "expired"
            ? "active"
            : currentSub.subscription_status;

      const { data: updated, error: upErr } = await supa
        .from("tenant_subscriptions")
        .update({
          expiry_date: nextExpiryIso,
          subscription_status: nextStatus,
          updated_at: nowIso,
        })
        .eq("id", currentSub.id)
        .select("*")
        .single();

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      await supa.from("subscription_events").insert({
        business_id: businessId,
        subscription_id: currentSub.id,
        event_type: "EXPIRY_EDITED",
        previous_values: {
          plan_key: currentSub.plan_key_snapshot,
          status: currentSub.subscription_status,
          expiry_date: currentSub.expiry_date,
        },
        new_values: {
          plan_key: currentSub.plan_key_snapshot,
          status: nextStatus,
          expiry_date: nextExpiryIso,
        },
        admin_id: caller.id,
        admin_email: caller.email,
        reason,
      });

      return NextResponse.json({ ok: true, subscription: updated });
    }

    if (action === "suspend" || action === "reactivate") {
      const nextStatus = action === "suspend" ? "suspended" : "active";
      const { data: updated, error: upErr } = await supa
        .from("tenant_subscriptions")
        .update({
          subscription_status: nextStatus,
          updated_at: nowIso,
        })
        .eq("id", currentSub.id)
        .select("*")
        .single();

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      await Promise.all([
        supa
          .from("businesses")
          .update({ is_active: action === "reactivate", updated_at: nowIso })
          .eq("id", businessId),
        supa.from("subscription_events").insert({
          business_id: businessId,
          subscription_id: currentSub.id,
          event_type: action === "suspend" ? "SUBSCRIPTION_SUSPENDED" : "SUBSCRIPTION_REACTIVATED",
          previous_values: {
            plan_key: currentSub.plan_key_snapshot,
            status: currentSub.subscription_status,
            expiry_date: currentSub.expiry_date,
          },
          new_values: {
            plan_key: currentSub.plan_key_snapshot,
            status: nextStatus,
            expiry_date: currentSub.expiry_date,
          },
          admin_id: caller.id,
          admin_email: caller.email,
          reason,
        }),
      ]);

      return NextResponse.json({ ok: true, subscription: updated });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

