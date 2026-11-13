import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa } = auth;
    const { data: plans, error } = await supa
      .from("subscription_plans")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ plans: plans || [] });
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

    const { supa } = auth;
    const body = await request.json().catch(() => ({}));

    const planKey = String(body.plan_key || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    const planName = String(body.plan_name || "").trim();
    const monthlyPrice = Number(body.monthly_price);
    const maxActiveProducts =
      body.max_active_products === null || body.max_active_products === "" || body.is_unlimited_products
        ? null
        : Number(body.max_active_products);
    const maxEmployeeSeats = Number(body.max_employee_seats ?? 0);
    const supportLevel = body.support_level === "priority" ? "priority" : "standard";
    const isActive = body.is_active !== false;
    const featureEntitlements =
      body.feature_entitlements && typeof body.feature_entitlements === "object"
        ? body.feature_entitlements
        : {};

    if (!planKey) {
      return NextResponse.json({ error: "Plan key is required" }, { status: 400 });
    }
    if (!planName) {
      return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
    }
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
      return NextResponse.json({ error: "Monthly price must be 0 or greater" }, { status: 400 });
    }
    if (maxActiveProducts !== null && (!Number.isInteger(maxActiveProducts) || maxActiveProducts < 0)) {
      return NextResponse.json({ error: "Active product limit must be a non-negative integer or Unlimited" }, { status: 400 });
    }
    if (!Number.isInteger(maxEmployeeSeats) || maxEmployeeSeats < 0) {
      return NextResponse.json({ error: "Employee seat limit must be a non-negative integer" }, { status: 400 });
    }

    const { data: created, error } = await supa
      .from("subscription_plans")
      .insert({
        plan_key: planKey,
        plan_name: planName,
        monthly_price: monthlyPrice,
        currency: String(body.currency || "INR"),
        max_active_products: maxActiveProducts,
        max_employee_seats: maxEmployeeSeats,
        support_level: supportLevel,
        feature_entitlements: featureEntitlements,
        is_active: isActive,
        sort_order: Number(body.sort_order) || 10,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, plan: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa } = auth;
    const body = await request.json().catch(() => ({}));
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.plan_name !== undefined) {
      const name = String(body.plan_name).trim();
      if (!name) return NextResponse.json({ error: "Plan name cannot be empty" }, { status: 400 });
      updates.plan_name = name;
    }

    if (body.monthly_price !== undefined) {
      const price = Number(body.monthly_price);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "Monthly price must be 0 or greater" }, { status: 400 });
      }
      updates.monthly_price = price;
    }

    if (body.is_unlimited_products === true || body.max_active_products === null || body.max_active_products === "") {
      if (body.is_unlimited_products !== undefined || body.max_active_products !== undefined) {
        updates.max_active_products = null;
      }
    } else if (body.max_active_products !== undefined) {
      const limit = Number(body.max_active_products);
      if (!Number.isInteger(limit) || limit < 0) {
        return NextResponse.json({ error: "Active product limit must be a non-negative integer" }, { status: 400 });
      }
      updates.max_active_products = limit;
    }

    if (body.max_employee_seats !== undefined) {
      const seats = Number(body.max_employee_seats);
      if (!Number.isInteger(seats) || seats < 0) {
        return NextResponse.json({ error: "Employee seat limit must be a non-negative integer" }, { status: 400 });
      }
      updates.max_employee_seats = seats;
    }

    if (body.support_level !== undefined) {
      if (!["standard", "priority"].includes(body.support_level)) {
        return NextResponse.json({ error: "Invalid support level" }, { status: 400 });
      }
      updates.support_level = body.support_level;
    }

    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    if (body.feature_entitlements !== undefined && typeof body.feature_entitlements === "object") {
      updates.feature_entitlements = body.feature_entitlements;
    }

    const { data: updated, error } = await supa
      .from("subscription_plans")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, plan: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

