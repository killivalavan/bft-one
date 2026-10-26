import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;

    // Only store admins or super admin can delete/clear notifications
    if (!caller.isAdmin && !caller.isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Only store admins have permission to delete or clear notifications." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { id, clear_all, filter } = body;

    const business_id = caller.isSuperAdmin && body.business_id
      ? body.business_id
      : caller.businessId;

    if (id) {
      // Delete single notification strictly matching this store's business_id
      const { error } = await supa
        .from("notifications")
        .delete()
        .eq("id", id)
        .eq("business_id", business_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, deleted: 1 });
    }

    if (clear_all) {
      // Clear all notifications for this store
      let query = supa.from("notifications").delete().eq("business_id", business_id);

      if (filter === "baker") {
        query = query.or("kind.eq.baker_broadcast,kind.like.%baker%");
      } else if (filter === "stock") {
        query = query.eq("kind", "stock");
      }

      const { error } = await query;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, cleared_all: true });
    }

    return NextResponse.json({ error: "Either id or clear_all is required" }, { status: 400 });
  } catch (err: any) {
    console.error("API /api/notifications DELETE error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));
    const { id, mark_all, status = "read" } = body;

    const user_id = caller.id;
    const business_id = caller.isSuperAdmin && body.business_id
      ? body.business_id
      : caller.businessId;

    if (id) {
      // Mark single notification as read or unread for this specific user
      const { data: notif, error: fErr } = await supa
        .from("notifications")
        .select("id, meta")
        .eq("id", id)
        .eq("business_id", business_id)
        .maybeSingle();

      if (fErr || !notif) {
        return NextResponse.json({ error: fErr?.message || "Notification not found" }, { status: 404 });
      }

      const currentMeta = (notif.meta && typeof notif.meta === "object") ? notif.meta : {};
      const currentReadBy: string[] = Array.isArray(currentMeta.read_by) ? [...currentMeta.read_by] : [];

      let updatedReadBy: string[];
      if (status === "unread") {
        updatedReadBy = currentReadBy.filter((uid) => uid !== user_id);
      } else {
        updatedReadBy = currentReadBy.includes(user_id) ? currentReadBy : [...currentReadBy, user_id];
      }

      const updatedMeta = { ...currentMeta, read_by: updatedReadBy };

      const { error: uErr } = await supa
        .from("notifications")
        .update({ meta: updatedMeta })
        .eq("id", id)
        .eq("business_id", business_id);

      if (uErr) {
        return NextResponse.json({ error: uErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, is_read: updatedReadBy.includes(user_id) });
    }

    if (mark_all) {
      // Mark all notifications for this store as read for this specific user
      const { data: notifs, error: lErr } = await supa
        .from("notifications")
        .select("id, meta")
        .eq("business_id", business_id);

      if (lErr) {
        return NextResponse.json({ error: lErr.message }, { status: 500 });
      }

      for (const n of notifs || []) {
        const currentMeta = (n.meta && typeof n.meta === "object") ? n.meta : {};
        const currentReadBy: string[] = Array.isArray(currentMeta.read_by) ? [...currentMeta.read_by] : [];
        if (!currentReadBy.includes(user_id)) {
          const updatedMeta = { ...currentMeta, read_by: [...currentReadBy, user_id] };
          await supa.from("notifications").update({ meta: updatedMeta }).eq("id", n.id).eq("business_id", business_id);
        }
      }

      return NextResponse.json({ ok: true, marked_all: true });
    }

    return NextResponse.json({ error: "Either id or mark_all is required" }, { status: 400 });
  } catch (err: any) {
    console.error("API /api/notifications PATCH error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
