import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { validatePasswordPolicy } from "@/lib/utils/passwordPolicy";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supa = supabaseAdmin();
    const clientMeta = extractClientMetadata(request);

    // 1. Authenticate Current User
    const auth = await authenticateRequest(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const caller = auth.user;
    const body = await request.json().catch(() => ({})) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const currentPassword = body.currentPassword || "";
    const newPassword = body.newPassword || "";
    const userRole = caller.isSuperAdmin ? "super_admin" : caller.isAdmin ? "admin" : "staff";

    if (!currentPassword) {
      return NextResponse.json(
        { error: "Current password is required." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from your current password." },
        { status: 400 }
      );
    }

    // 2. Verify Current Password using an ephemeral client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Auth service not configured." }, { status: 500 });
    }
    const verifyClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: verifyErr } = await verifyClient.auth.signInWithPassword({
      email: caller.email,
      password: currentPassword,
    });
    if (verifyErr) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    // 3. Validate Password Against Role-Based Security Policy
    const policy = validatePasswordPolicy(newPassword, userRole);
    if (!policy.valid) {
      return NextResponse.json(
        { error: policy.errors.join(" ") },
        { status: 400 }
      );
    }

    // 3. Update User Password in Supabase Auth
    const { error: updateErr } = await supa.auth.admin.updateUserById(caller.id, {
      password: newPassword,
    });

    if (updateErr) {
      return NextResponse.json(
        { error: `Password update failed: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 4. Record Security Audit Event
    await logAuditEvent({
      businessId: caller.businessId,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "PASSWORD_CHANGED",
      targetType: "user",
      targetId: caller.id,
      details: { email: caller.email, role: userRole },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      message: "Your password has been changed successfully.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "An unexpected error occurred while updating password." },
      { status: 500 }
    );
  }
}
