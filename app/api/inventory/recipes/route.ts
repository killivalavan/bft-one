import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("product_id");

    let query = supa
      .from("item_recipes")
      .select(`
        id,
        product_id,
        inventory_item_id,
        quantity_required,
        unit,
        waste_factor_pct,
        created_at,
        inventory_items (
          id,
          name,
          sku,
          category,
          unit,
          cost_per_unit,
          current_stock
        )
      `)
      .eq("business_id", user.businessId);

    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data: recipes, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recipes: recipes || [] });
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

    const { product_id, ingredients } = body;

    if (!product_id || !Array.isArray(ingredients)) {
      return NextResponse.json(
        { error: "Product ID and ingredients array are required" },
        { status: 400 }
      );
    }

    // First remove old recipe ingredients for this product
    await supa
      .from("item_recipes")
      .delete()
      .eq("product_id", product_id)
      .eq("business_id", user.businessId);

    if (ingredients.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const insertRows = ingredients.map((ing: any) => ({
      business_id: user.businessId,
      product_id,
      inventory_item_id: ing.inventory_item_id,
      quantity_required: Number(ing.quantity_required) || 0,
      unit: ing.unit || "pcs",
      waste_factor_pct: Number(ing.waste_factor_pct) || 0,
    }));

    const { data, error } = await supa
      .from("item_recipes")
      .insert(insertRows)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: data?.length || 0, recipes: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
