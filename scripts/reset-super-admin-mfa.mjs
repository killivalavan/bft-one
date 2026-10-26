/**
 * SeyalPro — Super Admin MFA Factor Recovery & Un-Enrollment
 * 
 * Usage:
 *   node scripts/reset-super-admin-mfa.mjs --email="admin@seyalpro.com"
 *
 * This administrative script allows an authorized system operator to unenroll
 * an MFA factor in the event of a lost authenticator device.
 * It records an immutable audit event in public.audit_logs.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = process.argv.slice(2);
let email = "";

for (const arg of args) {
  if (arg.startsWith("--email=")) {
    email = arg.split("=")[1].toLowerCase().trim();
  }
}

if (!email) {
  console.log(`
Usage:
  node scripts/reset-super-admin-mfa.mjs --email="admin@seyalpro.com"
`);
  process.exit(1);
}

async function resetMfa() {
  console.log(`\n🔍 Looking up user: ${email}...`);

  const { data: userList, error: listErr } = await supa.auth.admin.listUsers();
  if (listErr) {
    console.error("❌ Failed to query auth users:", listErr.message);
    process.exit(1);
  }

  const user = userList.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    console.error(`❌ User ${email} not found.`);
    process.exit(1);
  }

  const userId = user.id;

  // Query factors via admin API
  const { data: factors, error: factErr } = await supa.auth.admin.mfa.listFactors({
    userId,
  });

  if (factErr) {
    console.error("❌ Failed to list factors:", factErr.message);
    process.exit(1);
  }

  if (!factors?.factors || factors.factors.length === 0) {
    console.log(`ℹ️ User ${email} has no registered MFA factors.`);
    process.exit(0);
  }

  console.log(`Found ${factors.factors.length} MFA factor(s). Un-enrolling...`);

  for (const factor of factors.factors) {
    const { error: delErr } = await supa.auth.admin.mfa.deleteFactor({
      userId,
      id: factor.id,
    });
    if (delErr) {
      console.warn(`⚠️ Warning: could not delete factor ${factor.id}:`, delErr.message);
    } else {
      console.log(`✅ Factor ${factor.id} (${factor.friendly_name || factor.factor_type}) deleted.`);
    }
  }

  // Record audit log
  await supa.from("audit_logs").insert({
    business_id: null,
    actor_id: userId,
    actor_email: email,
    action: "USER_UPDATED",
    target_type: "user",
    target_id: userId,
    details: {
      email,
      action: "SUPER_ADMIN_MFA_RESET",
      resetBy: "CLI_ADMIN_RECOVERY",
    },
    ip_address: "127.0.0.1",
    user_agent: "SeyalPro-CLI-Recovery",
  });

  console.log(`
✅ Successfully reset MFA factors for ${email}.
The administrator will be prompted to register a new TOTP factor on their next sign-in at /super-admin/login.
`);
}

resetMfa().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
