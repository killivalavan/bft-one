import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("activeOnly") !== "false";

    let query = supa
      .from("inventory_items")
      .select("*")
      .eq("business_id", user.businessId)
      .order("name", { ascending: true });

    if (category && category !== "All") {
      query = query.eq("category", category);
    }
    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data: items, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: items || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const body = await req.json();

    const {
      name,
      sku,
      category = "Raw Material",
      unit = "kg",
      cost_per_unit = 0,
      current_stock = 0,
      min_reorder_level = 5,
      optimal_stock_level = 20,
      notify_at = null,
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }

    const { data: newItem, error } = await supa
      .from("inventory_items")
      .insert({
        business_id: user.businessId,
        name: name.trim(),
        sku: sku?.trim() || null,
        category,
        unit,
        cost_per_unit: Number(cost_per_unit) || 0,
        current_stock: Number(current_stock) || 0,
        min_reorder_level: Number(min_reorder_level) || 0,
        optimal_stock_level: Number(optimal_stock_level) || 0,
        notify_at: notify_at ? Number(notify_at) : null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If initial stock was provided, write initial ledger record
    if (Number(current_stock) > 0) {
      await supa.from("stock_ledger").insert({
        business_id: user.businessId,
        inventory_item_id: newItem.id,
        transaction_type: "MANUAL_ADJUSTMENT",
        quantity_delta: Number(current_stock),
        balance_after: Number(current_stock),
        unit_cost: Number(cost_per_unit) || 0,
        reason: "Initial Stock Setup",
        created_by: user.id,
      });
    }

    return NextResponse.json({ ok: true, item: newItem });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Item id is required" }, { status: 400 });
    }

    const { data: updatedItem, error } = await supa
      .from("inventory_items")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", user.businessId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: updatedItem });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Item id is required" }, { status: 400 });
    }

    // Soft-delete or hard-delete
    const { error } = await supa
      .from("inventory_items")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", user.businessId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
