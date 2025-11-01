import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const supa = supabaseAdmin();
    const { error: delErr } = await supa.auth.admin.deleteUser(userId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    await supa.from("profiles").delete().eq("id", userId);

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
