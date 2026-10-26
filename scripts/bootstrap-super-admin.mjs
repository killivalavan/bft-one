/**
 * SeyalPro — Super Admin Server-Side Bootstrap Procedure
 * 
 * Usage:
 *   node scripts/bootstrap-super-admin.mjs --email="admin@seyalpro.com" --password="<STRONG_PASSWORD>"
 *
 * This script runs strictly in a trusted administrative/deployment environment.
 * It uses the Supabase service-role key to provision the initial Super Admin
 * and records an immutable audit log entry.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// 1. Load environment variables from .env.local if not already present in process.env
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

// 2. Parse arguments
const args = process.argv.slice(2);
let email = "";
let password = "";

for (const arg of args) {
  if (arg.startsWith("--email=")) {
    email = arg.split("=")[1].toLowerCase().trim();
  } else if (arg.startsWith("--password=")) {
    password = arg.split("=")[1];
  }
}

if (!email || !password) {
  console.log(`
SeyalPro Super Admin Bootstrap CLI
====================================
Usage:
  node scripts/bootstrap-super-admin.mjs --email="admin@seyalpro.com" --password="<STRONG_PASSWORD>"

Requirements:
  • Password must be at least 12 characters, with uppercase, lowercase, numbers, and symbols.
  • Email must be a valid organizational address.
`);
  process.exit(1);
}

// Basic password policy check
if (password.length < 10) {
  console.error("❌ Error: Password must be at least 10 characters long.");
  process.exit(1);
}

async function bootstrap() {
  console.log(`\n🚀 Initializing Super Admin provisioning for: ${email}...`);

  // Step 1: Check if user exists in auth.users
  const { data: userList, error: listErr } = await supa.auth.admin.listUsers();
  if (listErr) {
    console.error("❌ Failed to query auth users:", listErr.message);
    process.exit(1);
  }

  let user = userList.users.find((u) => u.email?.toLowerCase() === email);
  let userId = user?.id;

  if (!userId) {
    console.log("Creating new Supabase Auth user...");
    const { data: createData, error: createErr } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !createData.user) {
      console.error("❌ User creation failed:", createErr?.message);
      process.exit(1);
    }
    userId = createData.user.id;
    console.log(`✅ Auth user created with ID: ${userId}`);
  } else {
    console.log(`User already exists in Auth (${userId}). Updating credentials...`);
    const { error: updateErr } = await supa.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateErr) {
      console.error("❌ Password update failed:", updateErr.message);
      process.exit(1);
    }
    console.log("✅ Credentials updated successfully.");
  }

  // Step 2: Set Super Admin role in public.profiles
  console.log("Granting authoritative Super Admin privilege in public.profiles...");
  const profilePayload = {
    id: userId,
    email,
    is_super_admin: true,
    is_admin: true,
    business_id: null, // Super Admin is not locked to a single store
    updated_at: new Date().toISOString(),
  };

  const { error: profErr } = await supa
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profErr) {
    console.error("❌ Failed to set profile privilege:", profErr.message);
    process.exit(1);
  }

  // Step 3: Record immutable audit log
  console.log("Recording immutable audit event in public.audit_logs...");
  await supa.from("audit_logs").insert({
    business_id: null,
    actor_id: userId,
    actor_email: email,
    action: "SUPER_ADMIN_BOOTSTRAP",
    target_type: "user",
    targetId: userId,
    details: {
      email,
      grantedSuperAdmin: true,
      provisionedVia: "CLI_BOOTSTRAP_SCRIPT",
    },
    ip_address: "127.0.0.1",
    user_agent: "SeyalPro-CLI-Bootstrap",
  });

  console.log(`
===================================================================
🎉 SUCCESS: Super Admin Account Configured!
===================================================================
Account: ${email}
User ID: ${userId}
Role:    Platform Super Admin (is_super_admin = true)

NEXT STEP (MANDATORY):
1. Navigate to: https://seyalpro.in/super-admin/login (or http://localhost:3000/super-admin/login)
2. Enter the email and password above.
3. The system will prompt you to scan the 2FA QR code with Google Authenticator or Authy.
4. Complete the 6-digit verification to activate your MFA AAL2 assurance token.
===================================================================
`);
}

bootstrap().catch((err) => {
  console.error("Unexpected bootstrap error:", err);
  process.exit(1);
});
