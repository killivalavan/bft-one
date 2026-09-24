import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { validatePasswordPolicy } from "@/lib/utils/passwordPolicy";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";

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
      newPassword?: string;
    };

    const newPassword = body.newPassword || "";
    const userRole = caller.isSuperAdmin ? "super_admin" : caller.isAdmin ? "admin" : "staff";

    // 2. Validate Password Against Role-Based Security Policy
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
