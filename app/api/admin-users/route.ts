import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    // Verify target user belongs to caller's business (unless caller is Super Admin)
    const { data: targetProfile, error: targetErr } = await supa
      .from("profiles")
      .select("id, business_id, is_super_admin")
      .eq("id", userId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    if (!caller.isSuperAdmin && targetProfile.business_id && targetProfile.business_id !== caller.businessId) {
      return NextResponse.json({ error: "Unauthorized: Cannot delete users belonging to another business." }, { status: 403 });
    }

    // Delete dependent rows that reference the profile
    await supa.from("salary_entries").delete().eq("user_id", userId);
    await supa.from("leaves").delete().eq("user_id", userId);
    await supa.from("daily_sales").delete().or(`cash_submitted_by.eq.${userId},upi_submitted_by.eq.${userId}`);
    await supa.from("timesheets").delete().eq("user_id", userId);

    // Remove the profile record
    const { error: profileErr } = await supa.from("profiles").delete().eq("id", userId);
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // Best-effort: attempt to delete auth user, but don't fail if it errors
    try { await supa.auth.admin.deleteUser(userId); } catch (_) { }

    // Log Audit Event
    const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: targetProfile.business_id || caller.businessId,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "USER_DELETED",
      targetType: "user",
      targetId: userId,
      details: { deletedUserId: userId, deletedBy: caller.email },
      ...clientMeta,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
