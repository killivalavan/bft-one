import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { checkRateLimit } from "@/lib/security/csrf";
import { validatePasswordPolicy } from "@/lib/utils/passwordPolicy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const rate = checkRateLimit(`public_set_password:${ip}`, 10, 10 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const tokenHash = typeof body?.tokenHash === "string" ? body.tokenHash.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!tokenHash) {
      return NextResponse.json(
        { error: "Missing or invalid password setup token." },
        { status: 400 }
      );
    }

    const policy = validatePasswordPolicy(newPassword, "admin");
    if (!policy.valid) {
      return NextResponse.json(
        { error: policy.errors[0] || "Password does not meet security requirements." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Auth service not configured." }, { status: 500 });
    }

    // Ephemeral server-side client (no browser storage/locks) to consume the one-time token
    const tempSupa = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: otpData, error: otpErr } = await tempSupa.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (otpErr || !otpData?.user?.id) {
      return NextResponse.json(
        { error: "This password setup link has already been used or has expired." },
        { status: 400 }
      );
    }

    const adminSupa = supabaseAdmin();
    const { error: updateErr } = await adminSupa.auth.admin.updateUserById(otpData.user.id, {
      password: newPassword,
      email_confirm: true,
    });

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message || "Unable to save your password." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set password." },
      { status: 500 }
    );
  }
}

