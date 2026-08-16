import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const supa = supabaseAdmin();

    // Delete dependent rows that reference the profile
    await supa.from("salary_entries").delete().eq("user_id", userId);
    await supa.from("leaves").delete().eq("user_id", userId);
    // remove daily_sales rows where this user was the submitter
    await supa.from("daily_sales").delete().or(`cash_submitted_by.eq.${userId},upi_submitted_by.eq.${userId}`);
    await supa.from("attendance").delete().eq("user_id", userId);

    // Remove the profile record
    const { error: profileErr } = await supa.from("profiles").delete().eq("id", userId);
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // Best-effort: attempt to delete auth user, but don't fail if it errors
    try { await supa.auth.admin.deleteUser(userId); } catch (_) { }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
