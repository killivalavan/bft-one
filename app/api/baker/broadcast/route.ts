import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      sender_business_id,
      sender_name = "Central Kitchen",
      target_type = "all",
      target_store_ids = [],
      title,
      message,
      category = "memo",
      product_name,
      quantity,
      discount_rate,
    } = body;

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const supa = supabaseAdmin();

    // Fetch all active businesses
    const { data: allBusinesses, error: bErr } = await supa
      .from("businesses")
      .select("id, name, slug");

    if (bErr) {
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    }

    const businesses = allBusinesses || [];
    const { target_store_names = [] } = body;

    // Target businesses resolution: strictly match only the baker's chosen client store(s)
    let targetBusinesses: { id: string; name: string }[] = [];

    // Filter requested IDs
    const candidateIds: string[] = Array.isArray(target_store_ids) ? target_store_ids : [];

    for (const tId of candidateIds) {
      if (!tId || tId === "all") continue;
      const idLower = String(tId).toLowerCase();
      const matched = businesses.find((b) => {
        if (b.id === tId) return true;
        if (b.slug && b.slug.toLowerCase() === idLower) return true;
        if (b.name && b.name.toLowerCase() === idLower) return true;
        return false;
      });

      if (matched && matched.id !== sender_business_id && !targetBusinesses.some((tb) => tb.id === matched.id)) {
        targetBusinesses.push({ id: matched.id, name: matched.name });
      }
    }

    // Resolve sender's display name
    let senderDisplayName = sender_name;
    if (sender_business_id) {
      const matchedSender = businesses.find((b) => b.id === sender_business_id);
      if (matchedSender?.name) {
        senderDisplayName = matchedSender.name;
      }
    }

    // Capitalize sender business name neatly (e.g. "royal baker" -> "Royal Baker")
    const formattedSenderName = senderDisplayName
      ? senderDisplayName
          .split(" ")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ")
      : "Central Kitchen";

    const topicLabel = category ? category.toUpperCase() : "ADVISORY";

    const formattedMessage = `📢 [${topicLabel}] ${title.trim()}: ${message.trim()}${
      product_name && quantity ? ` (${quantity}x ${product_name}${discount_rate ? ` @ ₹${discount_rate}` : ""})` : ""
    }`;

    const notificationRows = targetBusinesses.map((tb) => ({
      business_id: tb.id,
      kind: "baker_broadcast",
      message: formattedMessage,
      meta: {
        sender_name: formattedSenderName,
        category: category,
        title: title.trim(),
        product_name: product_name || null,
        quantity: quantity || null,
        discount_rate: discount_rate || null,
        sender_business_id: sender_business_id || null,
      },
    }));

    if (notificationRows.length === 0) {
      return NextResponse.json({ ok: true, count: 0, message: "No target businesses found" });
    }

    const { data: inserted, error: iErr } = await supa
      .from("notifications")
      .insert(notificationRows)
      .select("id, business_id, message, kind, meta, created_at");

    if (iErr) {
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      count: inserted?.length || notificationRows.length,
      targets: targetBusinesses.map((t) => t.name),
    });
  } catch (err: any) {
    console.error("API /api/baker/broadcast error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
