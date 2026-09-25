import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { validatePasswordPolicy } from "@/lib/utils/passwordPolicy";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa, user: caller } = auth;
    const body = await request.json().catch(() => ({}));
    const { businessId, newPassword } = body;

    if (!businessId || !newPassword) {
      return NextResponse.json(
        { error: "businessId and newPassword are required." },
        { status: 400 }
      );
    }

    // Validate Password Policy
    const policy = validatePasswordPolicy(newPassword, "admin");
    if (!policy.valid) {
      return NextResponse.json({ error: policy.errors.join(" ") }, { status: 400 });
    }

    // 1. Find the primary admin profile for this business
    const { data: adminProfile, error: profErr } = await supa
      .from("profiles")
      .select("id, email, business_id")
      .eq("business_id", businessId)
      .eq("is_admin", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (profErr || !adminProfile) {
      return NextResponse.json(
        { error: "No admin user found for this business to reset." },
        { status: 404 }
      );
    }

    // 2. Update Auth User Password
    const { error: authErr } = await supa.auth.admin.updateUserById(adminProfile.id, {
      password: newPassword,
    });

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    // 3. Log Audit Event
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "PASSWORD_RESET",
      targetType: "user",
      targetId: adminProfile.id,
      details: {
        targetEmail: adminProfile.email,
        resetBy: caller.email,
        reason: "Super Admin Direct Reset",
      },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully reset password for ${adminProfile.email}`,
      adminEmail: adminProfile.email,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
