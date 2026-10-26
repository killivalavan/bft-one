import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));
    const {
      sender_name = "Central Kitchen",
      target_store_ids = [],
      title,
      message,
      category = "memo",
      product_name,
      quantity,
      discount_rate,
    } = body;

    // Enforce authenticated caller's businessId to prevent sender impersonation
    const sender_business_id = caller.isSuperAdmin && body.sender_business_id
      ? body.sender_business_id
      : caller.businessId;

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    // Fetch all active businesses
    const { data: allBusinesses, error: bErr } = await supa
      .from("businesses")
      .select("id, name, slug");

    if (bErr) {
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    }

    const businesses = allBusinesses || [];

    // Target businesses resolution: strictly match only the chosen client store(s)
    let targetBusinesses: { id: string; name: string }[] = [];
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
