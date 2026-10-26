import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    // Query active businesses on SeyalPro
    const { data: businesses, error } = await supa
      .from("businesses")
      .select("id, name, slug, phone, address, is_active")
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out the caller's own business
    let partnerStores = (businesses || []).filter((b) => b.id !== caller.businessId);

    // If search term provided, filter by name, slug, or phone
    if (query) {
      partnerStores = partnerStores.filter((b) => {
        const nameMatch = (b.name || "").toLowerCase().includes(query);
        const slugMatch = (b.slug || "").toLowerCase().includes(query);
        const cleanQueryPhone = query.replace(/\D/g, "");
        const cleanStorePhone = (b.phone || "").replace(/\D/g, "");
        const phoneMatch = cleanQueryPhone.length >= 4 && cleanStorePhone.includes(cleanQueryPhone);
        return nameMatch || slugMatch || phoneMatch;
      });
    }

    return NextResponse.json({
      ok: true,
      stores: partnerStores.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        phone: b.phone || "",
        address: b.address || "",
      })),
    });
  } catch (err: any) {
    console.error("GET /api/baker/clients/lookup error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
