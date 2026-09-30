import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const { data: pos, error } = await supa
      .from("purchase_orders")
      .select(`
        id,
        po_number,
        supplier_id,
        status,
        total_amount,
        expected_delivery_date,
        received_at,
        notes,
        created_at,
        suppliers (
          id,
          name,
          phone,
          payment_terms
        ),
        purchase_order_items (
          id,
          inventory_item_id,
          quantity_ordered,
          quantity_received,
          unit_cost,
          total_cost,
          inventory_items (
            id,
            name,
            unit
          )
        )
      `)
      .eq("business_id", user.businessId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ purchase_orders: pos || [] });
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

    const { supplier_id, expected_delivery_date, notes, items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required in the PO" }, { status: 400 });
    }

    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    const totalAmount = items.reduce((sum: number, it: any) => sum + (Number(it.quantity_ordered) * Number(it.unit_cost)), 0);

    const { data: po, error: poErr } = await supa
      .from("purchase_orders")
      .insert({
        business_id: user.businessId,
        po_number: poNumber,
        supplier_id: supplier_id || null,
        status: "ORDERED",
        total_amount: totalAmount,
        expected_delivery_date: expected_delivery_date || null,
        notes: notes?.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (poErr || !po) {
      return NextResponse.json({ error: poErr?.message || "Failed to create PO" }, { status: 500 });
    }

    const poItems = items.map((it: any) => ({
      business_id: user.businessId,
      po_id: po.id,
      inventory_item_id: it.inventory_item_id,
      quantity_ordered: Number(it.quantity_ordered) || 0,
      quantity_received: 0,
      unit_cost: Number(it.unit_cost) || 0,
      total_cost: (Number(it.quantity_ordered) || 0) * (Number(it.unit_cost) || 0),
    }));

    const { error: itemErr } = await supa.from("purchase_order_items").insert(poItems);
    if (itemErr) {
      return NextResponse.json({ error: itemErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, po });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

// PUT: Receive Goods Note (GRN Inward Stocking)
export async function PUT(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const body = await req.json();

    const { po_id, received_items } = body; // Array of { item_id, inventory_item_id, received_qty, unit_cost }

    if (!po_id || !Array.isArray(received_items)) {
      return NextResponse.json({ error: "po_id and received_items are required" }, { status: 400 });
    }

    // Process each received item
    for (const r of received_items) {
      const recQty = Number(r.received_qty) || 0;
      if (recQty <= 0) continue;

      // Update PO item
      await supa
        .from("purchase_order_items")
        .update({ quantity_received: recQty })
        .eq("id", r.item_id)
        .eq("business_id", user.businessId);

      // Fetch current stock
      const { data: invItem } = await supa
        .from("inventory_items")
        .select("current_stock, cost_per_unit")
        .eq("id", r.inventory_item_id)
        .eq("business_id", user.businessId)
        .single();

      if (invItem) {
        const curStock = Number(invItem.current_stock) || 0;
        const newStock = curStock + recQty;
        const newUnitCost = r.unit_cost ? Number(r.unit_cost) : invItem.cost_per_unit;

        // Update inventory item stock
        await supa
          .from("inventory_items")
          .update({
            current_stock: newStock,
            cost_per_unit: newUnitCost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.inventory_item_id)
          .eq("business_id", user.businessId);

        // Write Stock Ledger
        await supa.from("stock_ledger").insert({
          business_id: user.businessId,
          inventory_item_id: r.inventory_item_id,
          transaction_type: "PURCHASE_RECEIPT",
          quantity_delta: recQty,
          balance_after: newStock,
          unit_cost: newUnitCost,
          reference_id: po_id,
          reason: `Inward receipt from PO`,
          created_by: user.id,
        });
      }
    }

    // Update PO status to RECEIVED
    await supa
      .from("purchase_orders")
      .update({
        status: "RECEIVED",
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", po_id)
      .eq("business_id", user.businessId);

    return NextResponse.json({ ok: true, message: "Goods received and stock inwarded successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
