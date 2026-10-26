import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const url = new URL(request.url);
    const requestedUserId = url.searchParams.get("userId");

    const businessId = caller.businessId;
    if (!caller.isSuperAdmin && !businessId) {
      return NextResponse.json({ deductions: [] });
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

    // Optional employee filter if explicitly requested
    if (requestedUserId) {
      query = query.eq("user_id", requestedUserId);
    }

    // Tenant scoping (Store users see team deductions within their store)
    if (!caller.isSuperAdmin) {
      query = query.eq("business_id", businessId);
    }

    const { data, error } = await query.order("entry_date", { ascending: false });

    if (error) {
      // Fallback query scoped strictly to caller's tenant business
      let fallbackQuery = supa
        .from("salary_entries")
        .select(`
          id,
          entry_date,
          amount_cents,
          reason,
          kind,
          user_id,
          business_id,
          profiles!inner(id, email)
        `)
        .eq("kind", "deduction");

      if (!caller.isSuperAdmin) {
        fallbackQuery = fallbackQuery.eq("business_id", businessId);
      }

      if (requestedUserId) {
        fallbackQuery = fallbackQuery.eq("user_id", requestedUserId);
      }

      const { data: fallbackData, error: fbErr } = await fallbackQuery.order("entry_date", { ascending: false });

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
      user_email: entry.profiles?.email || (Array.isArray(entry.profiles) ? entry.profiles[0]?.email : null) || "Unknown",
      user_id: entry.user_id,
      reason: entry.reason,
      amount_cents: entry.amount_cents,
      entry_date: entry.entry_date,
    }))
    .filter((record) => typeof record.reason === "string" && record.reason.toLowerCase().includes("late"));

  return NextResponse.json({ deductions });
}
