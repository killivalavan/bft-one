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

async function checkConstraints() {
    console.log("Checking Supabase connection...");
    
    // Check businesses
    const { data: businesses, error: bErr } = await supabase.from("businesses").select("id, name, slug");
    console.log("Businesses:", businesses, bErr);

    // Check daily_sales
    const { data: sales, error: sErr } = await supabase.from("daily_sales").select("*").limit(5);
    console.log("Sample daily_sales:", sales, sErr);

    // Let's test if we can run rpc or query
}

checkConstraints();
