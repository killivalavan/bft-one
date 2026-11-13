import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    if (userId === caller.id) {
      return NextResponse.json({ error: "Cannot delete your own active account." }, { status: 400 });
    }

    // Verify target user belongs to caller's verified business context (fail closed on null business_id)
    const { data: targetProfile, error: targetErr } = await supa
      .from("profiles")
      .select("id, business_id, is_super_admin")
      .eq("id", userId)
      .eq("business_id", caller.businessId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: "Target user not found in this business" }, { status: 404 });
    }

    if (targetProfile.is_super_admin) {
      return NextResponse.json({ error: "Forbidden: Platform Super Admin accounts cannot be deleted." }, { status: 403 });
    }

    if (!targetProfile.business_id || targetProfile.business_id !== caller.businessId) {
      return NextResponse.json({ error: "Unauthorized: Cannot delete users belonging to another business." }, { status: 403 });
    }

    const targetBizId = caller.businessId;

    // Delete dependent operational rows strictly scoped by both user_id and business_id
    await supa.from("salary_entries").delete().eq("user_id", userId).eq("business_id", targetBizId);
    await supa.from("leaves").delete().eq("user_id", userId).eq("business_id", targetBizId);
    
    // CRITICAL (SEC-07): Do NOT delete financial ledger records in daily_sales!
    // Nullify submitter references instead of destroying historical financial entries, scoped to business_id.
    await supa
      .from("daily_sales")
      .update({ cash_submitted_by: null })
      .eq("cash_submitted_by", userId)
      .eq("business_id", targetBizId);
    await supa
      .from("daily_sales")
      .update({ upi_submitted_by: null })
      .eq("upi_submitted_by", userId)
      .eq("business_id", targetBizId);
    
    await supa.from("timesheets").delete().eq("user_id", userId).eq("business_id", targetBizId);

    // Remove the profile record strictly scoped to business_id
    const { error: profileErr } = await supa
      .from("profiles")
      .delete()
      .eq("id", userId)
      .eq("business_id", targetBizId);
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // Best-effort: delete the underlying Supabase Auth user now that the tenant profile is verified & removed
    try { await supabaseAdmin().auth.admin.deleteUser(userId); } catch (_) { }

    // Log Audit Event
    const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: targetBizId,
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
