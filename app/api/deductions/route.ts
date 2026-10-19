import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

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

    // Non-admin staff users can strictly access only their own deductions
    if (!caller.isAdmin && !caller.isSuperAdmin) {
      query = query.eq("user_id", caller.id);
    } else if (requestedUserId) {
      query = query.eq("user_id", requestedUserId);
    }

    // Tenant scoping
    if (!caller.isSuperAdmin) {
      query = query.or(`business_id.eq.${businessId},business_id.is.null`);
    }

    const { data, error } = await query.order("entry_date", { ascending: false });

    if (error) {
      // Fallback query scoped strictly to caller's identity/business
      let fallbackQuery = supa
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

      if (!caller.isAdmin && !caller.isSuperAdmin) {
        fallbackQuery = fallbackQuery.eq("user_id", caller.id);
      } else if (requestedUserId) {
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
      user_email: entry.profiles?.email || "Unknown",
      user_id: entry.user_id,
      reason: entry.reason,
      amount_cents: entry.amount_cents,
      entry_date: entry.entry_date,
    }))
    .filter((record) => typeof record.reason === "string" && record.reason.toLowerCase().includes("late"));

  return NextResponse.json({ deductions });
}
