// Temporary test-data helper for the Daily Expenses feature.
// Usage:
//   node scripts/seed-expenses.mjs           -> insert test rows
//   node scripts/seed-expenses.mjs --clean   -> remove exactly the rows this script inserted
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

// Deterministic test rows spread across this week/month/year and prior months/years
// so every "Spending Overview" filter (Today, Week, Month, Year, All Time) has data.
const rows = [
    // September 2026 (this month)
    { expense_date: "2026-09-01", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-09-01", item_name: "Milk Packet", quantity: 2, price_cents: 6000 },
    { expense_date: "2026-09-02", item_name: "Paper Plates", quantity: 1, price_cents: 10000 },
    { expense_date: "2026-09-03", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-09-04", item_name: "Tea Powder", quantity: 1, price_cents: 12000 },
    { expense_date: "2026-09-04", item_name: "Sugar", quantity: 1, price_cents: 4500 },
    { expense_date: "2026-09-05", item_name: "Puff", quantity: 4, price_cents: 16000 },
    { expense_date: "2026-09-05", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-09-06", item_name: "Paper Cups", quantity: 2, price_cents: 8000 },
    { expense_date: "2026-09-06", item_name: "Water Can", quantity: 1, price_cents: 5000 },

    // August 2026 (last month)
    { expense_date: "2026-08-03", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-08-10", item_name: "Milk Packet", quantity: 3, price_cents: 9000 },
    { expense_date: "2026-08-15", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-08-20", item_name: "Paper Plates", quantity: 2, price_cents: 20000 },
    { expense_date: "2026-08-25", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-08-28", item_name: "Tea Powder", quantity: 1, price_cents: 12000 },

    // July 2026 (two months ago)
    { expense_date: "2026-07-05", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-07-12", item_name: "Sugar", quantity: 1, price_cents: 4500 },
    { expense_date: "2026-07-18", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-07-22", item_name: "Puff", quantity: 3, price_cents: 12000 },
    { expense_date: "2026-07-29", item_name: "Water Can", quantity: 1, price_cents: 5000 },

    // Earlier this year
    { expense_date: "2026-03-10", item_name: "Water Can", quantity: 1, price_cents: 5000 },
    { expense_date: "2026-03-15", item_name: "Milk Packet", quantity: 2, price_cents: 6000 },

    // Last year (for the "All Time" filter)
    { expense_date: "2025-11-20", item_name: "Water Can", quantity: 1, price_cents: 4500 },
    { expense_date: "2025-12-15", item_name: "Paper Plates", quantity: 1, price_cents: 9000 },
];

async function insert() {
    const { data: admin } = await supabase.from("profiles").select("id").eq("is_admin", true).limit(1).maybeSingle();
    const submitted_by = admin?.id ?? null;

    const payload = rows.map(r => ({ ...r, submitted_by }));
    const { data, error } = await supabase.from("daily_expenses").insert(payload).select("id");
    if (error) {
        console.error("Insert failed:", error.message);
        process.exit(1);
    }
    console.log(`Inserted ${data.length} test expense rows.`);
}

async function clean() {
    let deleted = 0;
    for (const r of rows) {
        const { error, count } = await supabase
            .from("daily_expenses")
            .delete({ count: "exact" })
            .eq("expense_date", r.expense_date)
            .eq("item_name", r.item_name)
            .eq("price_cents", r.price_cents)
            .eq("quantity", r.quantity);
        if (error) {
            console.error("Delete failed:", error.message);
            process.exit(1);
        }
        deleted += count || 0;
    }
    console.log(`Deleted ${deleted} test expense rows.`);
}

const mode = process.argv.includes("--clean") ? "clean" : "insert";
(mode === "clean" ? clean() : insert());
