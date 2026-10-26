import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log("--- BUSINESSES ---");
  const { data: businesses, error: bizErr } = await supa.from("businesses").select("id, name, slug, plan_type, is_active");
  if (bizErr) console.error("Error fetching businesses:", bizErr);
  else console.table(businesses);

  console.log("\n--- PROFILES (USERS & ASSIGNED BUSINESSES) ---");
  const { data: profiles, error: profErr } = await supa.from("profiles").select("id, email, full_name, is_admin, is_super_admin, business_id");
  if (profErr) console.error("Error fetching profiles:", profErr);
  else console.table(profiles);
}

inspect();
