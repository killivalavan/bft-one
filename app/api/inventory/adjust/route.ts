import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const body = await req.json();

    const {
      inventory_item_id,
      transaction_type = "MANUAL_ADJUSTMENT", // 'PURCHASE_RECEIPT', 'MANUAL_ADJUSTMENT', 'WASTAGE_SPOILAGE', 'AUDIT_RECONCILIATION'
      quantity_delta, // can be positive or negative, or absolute
      set_exact_stock, // optional: if provided, sets stock to this number and computes delta
      unit_cost,
      reference_id,
      reason,
    } = body;

    if (!inventory_item_id) {
      return NextResponse.json({ error: "inventory_item_id is required" }, { status: 400 });
    }

    // Fetch current item
    const { data: item, error: itemErr } = await supa
      .from("inventory_items")
      .select("id, current_stock, cost_per_unit, name")
      .eq("id", inventory_item_id)
      .eq("business_id", user.businessId)
      .single();

    if (itemErr || !item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const currentStock = Number(item.current_stock) || 0;
    let delta = Number(quantity_delta) || 0;
    let newBalance = currentStock + delta;

    if (set_exact_stock !== undefined && set_exact_stock !== null) {
      const target = Math.max(0, Number(set_exact_stock));
      delta = target - currentStock;
      newBalance = target;
    }

    newBalance = Math.max(0, newBalance);

    // Update item stock
    const { error: upErr } = await supa
      .from("inventory_items")
      .update({
        current_stock: newBalance,
        ...(unit_cost ? { cost_per_unit: Number(unit_cost) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", inventory_item_id)
      .eq("business_id", user.businessId);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // Insert Stock Ledger record
    const { data: ledgerEntry, error: ledErr } = await supa
      .from("stock_ledger")
      .insert({
        business_id: user.businessId,
        inventory_item_id,
        transaction_type,
        quantity_delta: delta,
        balance_after: newBalance,
        unit_cost: unit_cost ? Number(unit_cost) : item.cost_per_unit,
        reference_id: reference_id || null,
        reason: reason || "Manual stock adjustment",
        created_by: user.id,
      })
      .select()
      .single();

    if (ledErr) {
      console.error("Ledger insertion error:", ledErr);
    }

    return NextResponse.json({
      ok: true,
      previous_stock: currentStock,
      new_stock: newBalance,
      delta,
      ledger: ledgerEntry,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
