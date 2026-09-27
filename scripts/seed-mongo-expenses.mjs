import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
    const envPath = path.resolve(process.cwd(), ".env.local");
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) process.env[match[1]] = match[2];
    }
}
loadEnvLocal();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

const MONGO_BUSINESS_ID = "223e2673-1fb6-4f20-8570-3d11b8198842";
const MONGO_ADMIN_ID = "44d8181a-814d-4ae2-bb7f-2b2f36c1e543";

async function seedMongoStore() {
    console.log("Seeding data for store: mongo's (" + MONGO_BUSINESS_ID + ")...");

    // 1. Clean existing expenses and price list for mongo's
    await supabase.from("daily_expenses").delete().eq("business_id", MONGO_BUSINESS_ID);
    await supabase.from("expense_price_list").delete().eq("business_id", MONGO_BUSINESS_ID);
    console.log("Cleaned existing records for mongo's.");

    // 2. Insert Fixed Price List Catalog
    const priceListItems = [
        { item_name: "Milk Packet (500ml)", price_cents: 3000, active: true },
        { item_name: "Water Can (20L)", price_cents: 5000, active: true },
        { item_name: "Sugar (5kg)", price_cents: 20000, active: true },
        { item_name: "Special Tea Powder (1kg)", price_cents: 32000, active: true },
        { item_name: "Paper Cups (100pcs)", price_cents: 7500, active: true },
        { item_name: "Delivery Packaging Box", price_cents: 1500, active: true },
    ];

    const { error: plError } = await supabase.from("expense_price_list").insert(
        priceListItems.map(p => ({
            ...p,
            business_id: MONGO_BUSINESS_ID,
            updated_by: MONGO_ADMIN_ID,
        }))
    );

    if (plError) {
        console.error("Failed to seed price list:", plError.message);
    } else {
        console.log(`Inserted ${priceListItems.length} fixed price catalog items.`);
    }

    // 3. Seed Realistic Daily Expenses with clear AI Optimization Signals:
    // - Milk: High Spend Driver (~35% of spend)
    // - Packaging Box: Severe Inflation Spike (₹15 -> ₹24, +60%)
    // - Cooking Oil: Price Hike (₹1,200 -> ₹1,550, +29%)
    // - Paper Napkins & Paper Cups: Frequent Micro-Purchases (bought 6-8 times in tiny amounts)
    // - Sugar: Fixed price catalog breach (Bought at ₹235 vs ₹200 fixed list)
    const expenseRows = [
        // --- September 2026 (Current Month) ---
        // Today & recent days
        { expense_date: "2026-09-25", item_name: "Milk Packet (500ml)", quantity: 20, price_cents: 60000 },
        { expense_date: "2026-09-25", item_name: "Water Can (20L)", quantity: 3, price_cents: 15000 },
        { expense_date: "2026-09-24", item_name: "Milk Packet (500ml)", quantity: 18, price_cents: 54000 },
        { expense_date: "2026-09-24", item_name: "Delivery Packaging Box", quantity: 50, price_cents: 120000 }, // Spiked to Rs 24/unit
        { expense_date: "2026-09-23", item_name: "Milk Packet (500ml)", quantity: 20, price_cents: 60000 },
        { expense_date: "2026-09-23", item_name: "Paper Napkins", quantity: 2, price_cents: 16000 }, // Micro-purchase
        { expense_date: "2026-09-22", item_name: "Special Tea Powder (1kg)", quantity: 3, price_cents: 96000 },
        { expense_date: "2026-09-22", item_name: "Paper Cups (100pcs)", quantity: 2, price_cents: 18000 }, // Micro-purchase
        { expense_date: "2026-09-21", item_name: "Milk Packet (500ml)", quantity: 22, price_cents: 66000 },
        { expense_date: "2026-09-21", item_name: "Water Can (20L)", quantity: 2, price_cents: 10000 },
        { expense_date: "2026-09-20", item_name: "Cooking Oil Can (15L)", quantity: 2, price_cents: 310000 }, // Spiked to Rs 1,550/can
        { expense_date: "2026-09-19", item_name: "Milk Packet (500ml)", quantity: 19, price_cents: 57000 },
        { expense_date: "2026-09-18", item_name: "Sugar (5kg)", quantity: 3, price_cents: 70500 }, // Rs 235/bag (breaches Rs 200 catalog price)
        { expense_date: "2026-09-17", item_name: "Paper Napkins", quantity: 2, price_cents: 16000 }, // Micro-purchase
        { expense_date: "2026-09-16", item_name: "Milk Packet (500ml)", quantity: 20, price_cents: 60000 },
        { expense_date: "2026-09-15", item_name: "Water Can (20L)", quantity: 3, price_cents: 15000 },
        { expense_date: "2026-09-14", item_name: "Delivery Packaging Box", quantity: 40, price_cents: 88000 }, // Rs 22/unit
        { expense_date: "2026-09-12", item_name: "Paper Cups (100pcs)", quantity: 2, price_cents: 18000 }, // Micro-purchase
        { expense_date: "2026-09-10", item_name: "Milk Packet (500ml)", quantity: 25, price_cents: 75000 },
        { expense_date: "2026-09-08", item_name: "Cleaning Liquid & Sponges", quantity: 1, price_cents: 14500 }, // Micro-purchase
        { expense_date: "2026-09-05", item_name: "Milk Packet (500ml)", quantity: 20, price_cents: 60000 },
        { expense_date: "2026-09-04", item_name: "Paper Napkins", quantity: 3, price_cents: 24000 }, // Micro-purchase
        { expense_date: "2026-09-02", item_name: "Special Tea Powder (1kg)", quantity: 4, price_cents: 128000 },
        { expense_date: "2026-09-01", item_name: "Milk Packet (500ml)", quantity: 20, price_cents: 60000 },
        { expense_date: "2026-09-01", item_name: "Water Can (20L)", quantity: 3, price_cents: 15000 },

        // --- August 2026 (Last Month Baseline) ---
        { expense_date: "2026-08-28", item_name: "Milk Packet (500ml)", quantity: 20, price_cents: 60000 },
        { expense_date: "2026-08-25", item_name: "Delivery Packaging Box", quantity: 50, price_cents: 85000 }, // Rs 17/unit
        { expense_date: "2026-08-20", item_name: "Cooking Oil Can (15L)", quantity: 2, price_cents: 260000 }, // Rs 1,300/can
        { expense_date: "2026-08-15", item_name: "Milk Packet (500ml)", quantity: 22, price_cents: 66000 },
        { expense_date: "2026-08-12", item_name: "Sugar (5kg)", quantity: 4, price_cents: 80000 }, // Rs 200/bag
        { expense_date: "2026-08-10", item_name: "Special Tea Powder (1kg)", quantity: 4, price_cents: 128000 },
        { expense_date: "2026-08-05", item_name: "Water Can (20L)", quantity: 3, price_cents: 15000 },
        { expense_date: "2026-08-01", item_name: "Delivery Packaging Box", quantity: 50, price_cents: 75000 }, // Started at Rs 15/unit

        // --- July 2026 (Older Historical Baseline) ---
        { expense_date: "2026-07-25", item_name: "Milk Packet (500ml)", quantity: 20, price_cents: 60000 },
        { expense_date: "2026-07-20", item_name: "Cooking Oil Can (15L)", quantity: 2, price_cents: 240000 }, // Started at Rs 1,200/can
        { expense_date: "2026-07-15", item_name: "Special Tea Powder (1kg)", quantity: 4, price_cents: 128000 },
        { expense_date: "2026-07-10", item_name: "Delivery Packaging Box", quantity: 50, price_cents: 75000 }, // Started at Rs 15/unit
        { expense_date: "2026-07-05", item_name: "Sugar (5kg)", quantity: 4, price_cents: 80000 },
        { expense_date: "2026-07-01", item_name: "Water Can (20L)", quantity: 3, price_cents: 15000 },
    ];

    const payload = expenseRows.map(r => ({
        ...r,
        business_id: MONGO_BUSINESS_ID,
        submitted_by: MONGO_ADMIN_ID,
    }));

    const { data: expData, error: expError } = await supabase.from("daily_expenses").insert(payload).select("id");
    if (expError) {
        console.error("Failed to seed expenses:", expError.message);
    } else {
        console.log(`Successfully seeded ${expData.length} expense rows for mongo's store.`);
    }
}

seedMongoStore();
