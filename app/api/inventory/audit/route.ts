import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const { data: audits, error } = await supa
      .from("stock_audits")
      .select(`
        id,
        audit_number,
        status,
        notes,
        reconciled_at,
        created_at,
        stock_audit_items (
          id,
          inventory_item_id,
          expected_stock,
          actual_stock,
          variance_qty,
          variance_cost,
          notes,
          inventory_items (
            id,
            name,
            unit,
            category
          )
        )
      `)
      .eq("business_id", user.businessId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ audits: audits || [] });
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

    const { counts, notes, auto_reconcile = true } = body; // counts: Array<{ inventory_item_id, actual_stock, notes }>

    if (!Array.isArray(counts) || counts.length === 0) {
      return NextResponse.json({ error: "Audit counts array is required" }, { status: 400 });
    }

    const auditNumber = `AUDIT-${Date.now().toString().slice(-6)}`;

    // 1. Create audit session
    const { data: audit, error: auditErr } = await supa
      .from("stock_audits")
      .insert({
        business_id: user.businessId,
        audit_number: auditNumber,
        status: auto_reconcile ? "COMPLETED" : "IN_PROGRESS",
        notes: notes?.trim() || "Physical Stock Count",
        conducted_by: user.id,
        reconciled_at: auto_reconcile ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (auditErr || !audit) {
      return NextResponse.json({ error: auditErr?.message || "Failed to create audit" }, { status: 500 });
    }

    // 2. Fetch current system stocks
    const itemIds = counts.map((c: any) => c.inventory_item_id);
    const { data: currentItems } = await supa
      .from("inventory_items")
      .select("id, name, unit, cost_per_unit, current_stock")
      .in("id", itemIds)
      .eq("business_id", user.businessId);

    const itemMap = new Map<string, any>((currentItems || []).map((it: any) => [it.id, it]));

    const auditItems: any[] = [];

    for (const c of counts) {
      const item = itemMap.get(c.inventory_item_id);
      if (!item) continue;

      const expected = Number(item.current_stock) || 0;
      const actual = Number(c.actual_stock) || 0;
      const varianceQty = actual - expected;
      const varianceCost = varianceQty * (Number(item.cost_per_unit) || 0);

      auditItems.push({
        audit_id: audit.id,
        inventory_item_id: c.inventory_item_id,
        expected_stock: expected,
        actual_stock: actual,
        variance_qty: varianceQty,
        variance_cost: varianceCost,
        notes: c.notes?.trim() || null,
      });

      // If auto-reconcile is enabled, update stock and write ledger
      if (auto_reconcile && varianceQty !== 0) {
        await supa
          .from("inventory_items")
          .update({
            current_stock: actual,
            updated_at: new Date().toISOString(),
          })
          .eq("id", c.inventory_item_id)
          .eq("business_id", user.businessId);

        await supa.from("stock_ledger").insert({
          business_id: user.businessId,
          inventory_item_id: c.inventory_item_id,
          transaction_type: "AUDIT_RECONCILIATION",
          quantity_delta: varianceQty,
          balance_after: actual,
          unit_cost: item.cost_per_unit,
          reference_id: audit.id,
          reason: `Stock Audit Reconciliation (${varianceQty > 0 ? "+" : ""}${varianceQty} ${item.unit})`,
          created_by: user.id,
        });
      }
    }

    if (auditItems.length > 0) {
      await supa.from("stock_audit_items").insert(auditItems);
    }

    return NextResponse.json({ ok: true, audit_number: auditNumber, items_audited: auditItems.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
