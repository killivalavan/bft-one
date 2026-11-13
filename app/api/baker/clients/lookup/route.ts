import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    // SEC-14: Never enumerate other tenants from public.businesses!
    // Scope client directory lookup strictly to the caller's own b2b_clients.
    const { data: clients, error } = await supa
      .from("b2b_clients")
      .select("id, name, phone, address, linked_business_id")
      .eq("business_id", caller.businessId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let partnerStores = clients || [];

    // If search term provided, filter by name or phone
    if (query) {
      partnerStores = partnerStores.filter((c) => {
        const nameMatch = (c.name || "").toLowerCase().includes(query);
        const cleanQueryPhone = query.replace(/\D/g, "");
        const cleanStorePhone = (c.phone || "").replace(/\D/g, "");
        const phoneMatch = cleanQueryPhone.length >= 4 && cleanStorePhone.includes(cleanQueryPhone);
        return nameMatch || phoneMatch;
      });
    }

    return NextResponse.json({
      ok: true,
      stores: partnerStores.map((c) => ({
        id: c.id,
        name: c.name,
        slug: null,
        phone: c.phone || "",
        address: c.address || "",
        business_id: c.linked_business_id || undefined,
      })),
    });
  } catch (err: any) {
    console.error("GET /api/baker/clients/lookup error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
