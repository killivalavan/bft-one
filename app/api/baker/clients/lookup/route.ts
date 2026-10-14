import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const senderBusinessId = searchParams.get("sender_business_id") || "";
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    const supa = supabaseAdmin();

    // Query active businesses on SeyalPro
    const { data: businesses, error } = await supa
      .from("businesses")
      .select("id, name, slug, phone, address, is_active")
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out the baker's own business
    let partnerStores = (businesses || []).filter((b) => b.id !== senderBusinessId);

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
