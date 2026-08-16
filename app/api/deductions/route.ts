import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const supa = supabaseAdmin();

    let query = supa
      .from("salary_entries")
      .select(`
        id,
        entry_date,
        amount_cents,
        reason,
        kind,
        user_id,
        profiles!inner(id, email)
      `)
      .eq("kind", "deduction");

    const { data, error } = await query.order("entry_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deductions = (data || [])
      .map((entry: any) => ({
        id: entry.id,
        user_email: entry.profiles?.email || "Unknown",
        user_id: entry.user_id,
        reason: entry.reason,
        amount_cents: entry.amount_cents,
        entry_date: entry.entry_date,
      }))
      .filter((record) => typeof record.reason === "string" && record.reason.toLowerCase().includes("late"));

    return NextResponse.json({ deductions });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}
