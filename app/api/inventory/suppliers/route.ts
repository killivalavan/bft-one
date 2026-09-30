import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const { data: suppliers, error } = await supa
      .from("suppliers")
      .select("*")
      .eq("business_id", user.businessId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ suppliers: suppliers || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { user, supa } = auth;
    const body = await req.json();

    const { name, contact_person, phone, email, address, gstin, payment_terms, lead_time_days, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
    }

    const { data: supplier, error } = await supa
      .from("suppliers")
      .insert({
        business_id: user.businessId,
        name: name.trim(),
        contact_person: contact_person?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        gstin: gstin?.trim() || null,
        payment_terms: payment_terms || "Net 15",
        lead_time_days: Number(lead_time_days) || 2,
        notes: notes?.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, supplier });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
