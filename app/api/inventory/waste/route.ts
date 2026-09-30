import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit")) || 50;

    const { data: logs, error } = await supa
      .from("waste_logs")
      .select(`
        id,
        inventory_item_id,
        quantity,
        unit,
        cost_loss,
        reason,
        notes,
        created_at,
        inventory_items (
          id,
          name,
          category,
          cost_per_unit
        )
      `)
      .eq("business_id", user.businessId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: logs || [] });
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

    const { inventory_item_id, quantity, reason = "Expired", notes } = body;

    const wasteQty = Number(quantity);
    if (!inventory_item_id || !wasteQty || wasteQty <= 0) {
      return NextResponse.json(
        { error: "Valid inventory_item_id and positive quantity are required" },
        { status: 400 }
      );
    }

    // Fetch item
    const { data: item, error: itemErr } = await supa
      .from("inventory_items")
      .select("id, name, unit, cost_per_unit, current_stock")
      .eq("id", inventory_item_id)
      .eq("business_id", user.businessId)
      .single();

    if (itemErr || !item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const currentStock = Number(item.current_stock) || 0;
    const unitCost = Number(item.cost_per_unit) || 0;
    const costLoss = wasteQty * unitCost;
    const newStock = Math.max(0, currentStock - wasteQty);

    // Insert waste log
    const { data: wasteEntry, error: wasteErr } = await supa
      .from("waste_logs")
      .insert({
        business_id: user.businessId,
        inventory_item_id,
        quantity: wasteQty,
        unit: item.unit,
        cost_loss: costLoss,
        reason,
        notes: notes?.trim() || null,
        logged_by: user.id,
      })
      .select()
      .single();

    if (wasteErr) {
      return NextResponse.json({ error: wasteErr.message }, { status: 500 });
    }

    // Update stock quantity
    await supa
      .from("inventory_items")
      .update({
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inventory_item_id)
      .eq("business_id", user.businessId);

    // Write Stock Ledger
    await supa.from("stock_ledger").insert({
      business_id: user.businessId,
      inventory_item_id,
      transaction_type: "WASTAGE_SPOILAGE",
      quantity_delta: -wasteQty,
      balance_after: newStock,
      unit_cost: unitCost,
      reference_id: wasteEntry.id,
      reason: `Wastage (${reason}): ${notes || ""}`.trim(),
      created_by: user.id,
    });

    return NextResponse.json({
      ok: true,
      log: wasteEntry,
      new_stock: newStock,
      cost_loss: costLoss,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
