import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    let businessId = "a0000000-0000-0000-0000-000000000001";
    let supa = supabaseAdmin();

    if (!("errorResponse" in auth)) {
      businessId = auth.user.businessId;
      supa = auth.supa;
    }

    let query = supa
      .from("salary_entries")
      .select(`
        id,
        entry_date,
        amount_cents,
        reason,
        kind,
        user_id,
        business_id,
        profiles!inner(id, email, business_id)
      `)
      .eq("kind", "deduction");

    // Scope to tenant business if column exists
    try {
      query = query.or(`business_id.eq.${businessId},business_id.is.null`);
    } catch {}

    const { data, error } = await query.order("entry_date", { ascending: false });

    if (error) {
      // Fallback query if business_id not yet created in DB
      const { data: fallbackData, error: fbErr } = await supa
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
        .eq("kind", "deduction")
        .order("entry_date", { ascending: false });

      if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 500 });
      return formatDeductions(fallbackData || []);
    }

    return formatDeductions(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}

function formatDeductions(data: any[]) {
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
}
