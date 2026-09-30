import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supa = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const auth = await authenticateRequest(req);

    let businessId = body.business_id;

    if (!("errorResponse" in auth)) {
      businessId = businessId || auth.user.businessId;
    }

    if (!businessId) {
      const { data: firstBiz } = await supa.from("businesses").select("id").limit(1).maybeSingle();
      businessId = firstBiz?.id || "a0000000-0000-0000-0000-000000000001";
    }

    // Clean up existing records for this business so clean seed applies
    await Promise.all([
      supa.from("item_recipes").delete().eq("business_id", businessId),
      supa.from("purchase_order_items").delete().eq("business_id", businessId),
      supa.from("purchase_orders").delete().eq("business_id", businessId),
      supa.from("waste_logs").delete().eq("business_id", businessId),
      supa.from("stock_ledger").delete().eq("business_id", businessId),
      supa.from("inventory_items").delete().eq("business_id", businessId),
      supa.from("suppliers").delete().eq("business_id", businessId),
    ]);

    // 1. Ensure Categories & Menu Products exist for this business
    let { data: existingProducts } = await supa
      .from("products")
      .select("id, name, price")
      .eq("business_id", businessId);

    if (!existingProducts || existingProducts.length === 0) {
      // Create Categories
      let { data: catHot } = await supa
        .from("categories")
        .insert({ business_id: businessId, name: "Hot Beverages" })
        .select()
        .single();

      let { data: catCold } = await supa
        .from("categories")
        .insert({ business_id: businessId, name: "Cold Beverages" })
        .select()
        .single();

      let { data: catSnacks } = await supa
        .from("categories")
        .insert({ business_id: businessId, name: "Snacks & Quick Bites" })
        .select()
        .single();

      const hotCatId = catHot?.id;
      const coldCatId = catCold?.id;
      const snacksCatId = catSnacks?.id;

      // Create Products
      const prodsToInsert = [
        { business_id: businessId, name: "Special Masala Chai", price: 20.00, category_id: hotCatId },
        { business_id: businessId, name: "South Indian Filter Coffee", price: 25.00, category_id: hotCatId },
        { business_id: businessId, name: "Brown Sugar Boba Milk Tea", price: 120.00, category_id: coldCatId },
        { business_id: businessId, name: "Crispy Mini Samosa (3 Pcs)", price: 30.00, category_id: snacksCatId },
      ];

      const { data: createdProds } = await supa
        .from("products")
        .insert(prodsToInsert)
        .select();

      existingProducts = createdProds || [];
    }

    // 2. Seed Suppliers
    const suppliersData = [
      { business_id: businessId, name: "Aavin Fresh Dairy Supply", contact_person: "Karthik Raja", phone: "+91 94441 23456", email: "orders@aavindairy.com", address: "Sholinganallur Dairy Plant, Chennai", payment_terms: "Net 15", lead_time_days: 1, is_active: true },
      { business_id: businessId, name: "EcoPack Solutions Chennai", contact_person: "Murugan Packaging", phone: "+91 98401 98765", email: "sales@ecopack.in", address: "Ambattur Industrial Estate, Chennai", payment_terms: "Net 30", lead_time_days: 3, is_active: true },
      { business_id: businessId, name: "Kerala Spices & Tea Board Traders", contact_person: "Suresh Menon", phone: "+91 97455 11223", email: "suresh@keralaspices.com", address: "Munnar Tea Estate Office, Kochi", payment_terms: "Net 30", lead_time_days: 4, is_active: true },
      { business_id: businessId, name: "Monin & Boba House Distributors", contact_person: "Pooja Sharma", phone: "+91 99887 66554", email: "supply@bobahouse.in", address: "T. Nagar, Chennai", payment_terms: "Advance", lead_time_days: 2, is_active: true }
    ];

    const { data: insertedSuppliers } = await supa
      .from("suppliers")
      .insert(suppliersData)
      .select();

    const supDairyId = insertedSuppliers?.find(s => s.name.includes("Dairy"))?.id;
    const supPackId = insertedSuppliers?.find(s => s.name.includes("EcoPack"))?.id;

    // 3. Seed Inventory Items
    const itemsData = [
      { business_id: businessId, name: "Full Cream Fresh Milk", sku: "RAW-MILK-01", category: "Raw Material", unit: "l", cost_per_unit: 54.00, current_stock: 48.500, min_reorder_level: 15.000, optimal_stock_level: 60.000, notify_at: 15.000, is_active: true },
      { business_id: businessId, name: "Assam Premium CTC Tea Powder", sku: "RAW-TEA-01", category: "Raw Material", unit: "kg", cost_per_unit: 380.00, current_stock: 14.200, min_reorder_level: 4.000, optimal_stock_level: 25.000, notify_at: 4.000, is_active: true },
      { business_id: businessId, name: "South Indian Filter Coffee Blend (80:20)", sku: "RAW-COF-01", category: "Raw Material", unit: "kg", cost_per_unit: 480.00, current_stock: 8.500, min_reorder_level: 3.000, optimal_stock_level: 15.000, notify_at: 3.000, is_active: true },
      { business_id: businessId, name: "Refined Pure Cane Sugar", sku: "RAW-SUG-01", category: "Raw Material", unit: "kg", cost_per_unit: 44.00, current_stock: 32.000, min_reorder_level: 10.000, optimal_stock_level: 50.000, notify_at: 10.000, is_active: true },
      { business_id: businessId, name: "Organic Palm Jaggery Syrup", sku: "RAW-JAG-01", category: "Raw Material", unit: "l", cost_per_unit: 160.00, current_stock: 6.000, min_reorder_level: 2.000, optimal_stock_level: 10.000, notify_at: 2.000, is_active: true },
      { business_id: businessId, name: "Fresh Farm Inji (Ginger)", sku: "RAW-GIN-01", category: "Raw Material", unit: "kg", cost_per_unit: 120.00, current_stock: 3.800, min_reorder_level: 1.500, optimal_stock_level: 8.000, notify_at: 1.500, is_active: true },
      { business_id: businessId, name: "Green Cardamom (Elaichi) Whole", sku: "RAW-ELA-01", category: "Raw Material", unit: "kg", cost_per_unit: 2400.00, current_stock: 0.650, min_reorder_level: 0.200, optimal_stock_level: 1.500, notify_at: 0.200, is_active: true },
      { business_id: businessId, name: "Brown Sugar Tapioca Boba Pearls", sku: "RAW-BOB-01", category: "Raw Material", unit: "kg", cost_per_unit: 320.00, current_stock: 7.500, min_reorder_level: 2.500, optimal_stock_level: 15.000, notify_at: 2.500, is_active: true },
      { business_id: businessId, name: "250ml Ripple Kraft Paper Cups", sku: "PKG-CUP-250", category: "Packaging", unit: "pcs", cost_per_unit: 1.65, current_stock: 850.000, min_reorder_level: 200.000, optimal_stock_level: 1500.000, notify_at: 250.000, is_active: true },
      { business_id: businessId, name: "350ml Ripple Kraft Paper Cups", sku: "PKG-CUP-350", category: "Packaging", unit: "pcs", cost_per_unit: 2.10, current_stock: 420.000, min_reorder_level: 150.000, optimal_stock_level: 1000.000, notify_at: 150.000, is_active: true },
      { business_id: businessId, name: "500ml Clear Boba Cold Cups (PP)", sku: "PKG-CUP-500", category: "Packaging", unit: "pcs", cost_per_unit: 3.40, current_stock: 310.000, min_reorder_level: 100.000, optimal_stock_level: 800.000, notify_at: 100.000, is_active: true },
      { business_id: businessId, name: "Black Sip Lids (80mm for Hot Cups)", sku: "PKG-LID-80", category: "Packaging", unit: "pcs", cost_per_unit: 0.85, current_stock: 780.000, min_reorder_level: 200.000, optimal_stock_level: 1500.000, notify_at: 250.000, is_active: true },
      { business_id: businessId, name: "Dome Lids 95mm (for Cold Boba)", sku: "PKG-LID-95", category: "Packaging", unit: "pcs", cost_per_unit: 1.10, current_stock: 290.000, min_reorder_level: 100.000, optimal_stock_level: 800.000, notify_at: 100.000, is_active: true },
      { business_id: businessId, name: "Eco Paper Straws (Standard 6mm)", sku: "PKG-STR-6", category: "Packaging", unit: "pcs", cost_per_unit: 0.40, current_stock: 1200.000, min_reorder_level: 300.000, optimal_stock_level: 2000.000, notify_at: 300.000, is_active: true },
      { business_id: businessId, name: "Wide Boba Straws (12mm with Pointed Tip)", sku: "PKG-STR-12", category: "Packaging", unit: "pcs", cost_per_unit: 0.75, current_stock: 450.000, min_reorder_level: 150.000, optimal_stock_level: 1000.000, notify_at: 150.000, is_active: true },
      { business_id: businessId, name: "2-Cup Takeaway Kraft Carry Bags", sku: "PKG-BAG-02", category: "Packaging", unit: "pcs", cost_per_unit: 2.80, current_stock: 240.000, min_reorder_level: 80.000, optimal_stock_level: 600.000, notify_at: 80.000, is_active: true },
      { business_id: businessId, name: "Crispy Onion Mini Samosa (Frozen Pack)", sku: "SNK-SAM-01", category: "Pre-mix", unit: "pcs", cost_per_unit: 4.50, current_stock: 180.000, min_reorder_level: 50.000, optimal_stock_level: 300.000, notify_at: 50.000, is_active: true },
      { business_id: businessId, name: "POS Thermal Billing Paper Rolls (80x50mm)", sku: "CON-ROL-80", category: "Consumables", unit: "roll", cost_per_unit: 28.00, current_stock: 18.000, min_reorder_level: 5.000, optimal_stock_level: 40.000, notify_at: 5.000, is_active: true }
    ];

    const { data: insertedItems } = await supa
      .from("inventory_items")
      .insert(itemsData)
      .select();

    const milkItem = insertedItems?.find(i => i.name.includes("Milk"));
    const teaItem = insertedItems?.find(i => i.name.includes("Tea"));
    const coffeeItem = insertedItems?.find(i => i.name.includes("Coffee"));
    const sugarItem = insertedItems?.find(i => i.name.includes("Sugar"));
    const bobaItem = insertedItems?.find(i => i.name.includes("Boba"));
    const jaggeryItem = insertedItems?.find(i => i.name.includes("Jaggery"));
    const cup250 = insertedItems?.find(i => i.name.includes("250ml"));
    const cupBoba = insertedItems?.find(i => i.name.includes("500ml"));
    const lid80 = insertedItems?.find(i => i.name.includes("80mm"));
    const lidDome = insertedItems?.find(i => i.name.includes("95mm"));
    const strawBoba = insertedItems?.find(i => i.name.includes("Wide Boba"));
    const gingerItem = insertedItems?.find(i => i.name.includes("Ginger"));
    const samosaItem = insertedItems?.find(i => i.name.includes("Samosa"));

    // 4. Link Recipes to Products
    const recipeRows: any[] = [];
    for (const prod of (existingProducts || [])) {
      const pName = prod.name.toLowerCase();
      if (pName.includes("chai") || pName.includes("tea")) {
        if (milkItem && teaItem && cup250 && lid80) {
          recipeRows.push(
            { business_id: businessId, product_id: prod.id, inventory_item_id: milkItem.id, quantity_required: 0.180, unit: "l", waste_factor_pct: 3.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: teaItem.id, quantity_required: 0.012, unit: "kg", waste_factor_pct: 2.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: sugarItem?.id || teaItem.id, quantity_required: 0.015, unit: "kg", waste_factor_pct: 0.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: gingerItem?.id || teaItem.id, quantity_required: 0.005, unit: "kg", waste_factor_pct: 5.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: cup250.id, quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: lid80.id, quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 }
          );
        }
      } else if (pName.includes("coffee")) {
        if (milkItem && coffeeItem && cup250 && lid80) {
          recipeRows.push(
            { business_id: businessId, product_id: prod.id, inventory_item_id: milkItem.id, quantity_required: 0.160, unit: "l", waste_factor_pct: 3.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: coffeeItem.id, quantity_required: 0.015, unit: "kg", waste_factor_pct: 2.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: sugarItem?.id || coffeeItem.id, quantity_required: 0.012, unit: "kg", waste_factor_pct: 0.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: cup250.id, quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: lid80.id, quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 }
          );
        }
      } else if (pName.includes("boba")) {
        if (milkItem && bobaItem && cupBoba && lidDome && strawBoba) {
          recipeRows.push(
            { business_id: businessId, product_id: prod.id, inventory_item_id: milkItem.id, quantity_required: 0.220, unit: "l", waste_factor_pct: 2.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: bobaItem.id, quantity_required: 0.050, unit: "kg", waste_factor_pct: 5.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: jaggeryItem?.id || bobaItem.id, quantity_required: 0.030, unit: "l", waste_factor_pct: 0.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: cupBoba.id, quantity_required: 1.0, unit: "pcs", waste_factor_pct: 0.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: lidDome.id, quantity_required: 1.0, unit: "pcs", waste_factor_pct: 0.0 },
            { business_id: businessId, product_id: prod.id, inventory_item_id: strawBoba.id, quantity_required: 1.0, unit: "pcs", waste_factor_pct: 0.0 }
          );
        }
      } else if (pName.includes("samosa")) {
        if (samosaItem) {
          recipeRows.push(
            { business_id: businessId, product_id: prod.id, inventory_item_id: samosaItem.id, quantity_required: 3.0, unit: "pcs", waste_factor_pct: 2.0 }
          );
        }
      }
    }

    if (recipeRows.length > 0) {
      await supa.from("item_recipes").insert(recipeRows);
    }

    // 5. Seed Purchase Orders
    if (supDairyId && milkItem) {
      const { data: po1 } = await supa.from("purchase_orders").insert({
        business_id: businessId,
        po_number: "PO-849201",
        supplier_id: supDairyId,
        status: "RECEIVED",
        total_amount: 3240.00,
        expected_delivery_date: new Date(Date.now() - 86400000 * 2).toISOString().split("T")[0],
        received_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        notes: "Weekly fresh dairy supply delivered successfully",
      }).select().single();

      if (po1) {
        await supa.from("purchase_order_items").insert({
          business_id: businessId,
          po_id: po1.id,
          inventory_item_id: milkItem.id,
          quantity_ordered: 60.000,
          quantity_received: 60.000,
          unit_cost: 54.00,
          total_cost: 3240.00,
        });
      }
    }

    if (supPackId && cup250) {
      const { data: po2 } = await supa.from("purchase_orders").insert({
        business_id: businessId,
        po_number: "PO-849302",
        supplier_id: supPackId,
        status: "ORDERED",
        total_amount: 4150.00,
        expected_delivery_date: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        notes: "Restocking 250ml kraft cups and sip lids",
      }).select().single();

      if (po2) {
        await supa.from("purchase_order_items").insert({
          business_id: businessId,
          po_id: po2.id,
          inventory_item_id: cup250.id,
          quantity_ordered: 1000.000,
          quantity_received: 0.000,
          unit_cost: 1.65,
          total_cost: 1650.00,
        });
      }
    }

    // 6. Seed Waste Logs
    if (milkItem) {
      await supa.from("waste_logs").insert({
        business_id: businessId,
        inventory_item_id: milkItem.id,
        quantity: 2.500,
        unit: "l",
        cost_loss: 135.00,
        reason: "Expired",
        notes: "Carton left out of chiller overnight during power trip",
      });
    }

    // 7. Seed Ledger Entries
    if (milkItem) {
      await supa.from("stock_ledger").insert([
        { business_id: businessId, inventory_item_id: milkItem.id, transaction_type: "PURCHASE_RECEIPT", quantity_delta: 60.000, balance_after: 60.000, unit_cost: 54.00, reason: "PO Inward Delivery (Aavin Dairy)" },
        { business_id: businessId, inventory_item_id: milkItem.id, transaction_type: "POS_CONSUMPTION", quantity_delta: -9.000, balance_after: 51.000, unit_cost: 54.00, reason: "POS Recipe Auto-Deduction (50 Masala Teas)" },
        { business_id: businessId, inventory_item_id: milkItem.id, transaction_type: "WASTAGE_SPOILAGE", quantity_delta: -2.500, balance_after: 48.500, unit_cost: 54.00, reason: "Chiller temperature issue" },
      ]);
    }

    return NextResponse.json({
      ok: true,
      products_count: existingProducts.length,
      recipes_count: recipeRows.length,
      items_count: insertedItems?.length || 0,
      message: "Demo menu products, recipes, and inventory seeded successfully!"
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
