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
    const requestedBizId = searchParams.get("business_id");

    const businessId = requestedBizId && requestedBizId !== "default"
      ? requestedBizId
      : caller.businessId;

    // Tenant boundary check: only Super Admin can inspect another business's clients
    if (!caller.isSuperAdmin && businessId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot access clients belonging to another business." },
        { status: 403 }
      );
    }

    // 1. Try dedicated b2b_clients table
    const { data: tableData, error: tableError } = await supa
      .from("b2b_clients")
      .select("id, name, phone, address, linked_business_id, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (!tableError && tableData) {
      const mapped = tableData.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        address: c.address || "",
        business_id: c.linked_business_id || undefined,
      }));
      return NextResponse.json({ ok: true, clients: mapped, source: "table" });
    }

    // 2. Fallback: read from businesses.enabled_modules._b2b_clients
    const { data: biz, error: bizError } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    if (bizError) {
      return NextResponse.json({ error: bizError.message }, { status: 500 });
    }

    const clients = Array.isArray(biz?.enabled_modules?._b2b_clients)
      ? biz.enabled_modules._b2b_clients
      : [];

    return NextResponse.json({ ok: true, clients, source: "modules_fallback" });
  } catch (err: any) {
    console.error("GET /api/b2b/clients error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const targetBizId = body.business_id && body.business_id !== "default"
      ? body.business_id
      : caller.businessId;

    if (!caller.isSuperAdmin && targetBizId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot modify clients for another business." },
        { status: 403 }
      );
    }

    const business_id = targetBizId;

    // Handle bulk sync
    if (action === "sync" && Array.isArray(body.clients)) {
      const incomingList = body.clients.filter((c: any) => c && c.name && c.name.trim());

      // Try table upsert
      const { error: upsertError } = await supa.from("b2b_clients").upsert(
        incomingList.map((c: any) => ({
          id: c.id || `store-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          business_id,
          name: c.name.trim(),
          phone: c.phone || "",
          address: c.address || "",
          linked_business_id: c.business_id || null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "id" }
      );

      if (!upsertError) {
        return NextResponse.json({ ok: true, count: incomingList.length, source: "table" });
      }

      // Fallback: merge into businesses.enabled_modules._b2b_clients
      const { data: biz } = await supa
        .from("businesses")
        .select("enabled_modules")
        .eq("id", business_id)
        .maybeSingle();

      const existing: any[] = Array.isArray(biz?.enabled_modules?._b2b_clients)
        ? biz.enabled_modules._b2b_clients
        : [];

      const map = new Map<string, any>();
      // Preserve existing
      existing.forEach((item) => {
        if (item?.name) map.set(item.name.toLowerCase().trim(), item);
      });
      // Incoming items override/add
      incomingList.forEach((item: any) => {
        if (item?.name) {
          const key = item.name.toLowerCase().trim();
          map.set(key, {
            id: item.id || `store-${Date.now()}`,
            name: item.name.trim(),
            phone: item.phone || "",
            address: item.address || "",
            business_id: item.business_id || undefined,
          });
        }
      });

      const merged = Array.from(map.values());
      const nextModules = {
        ...(biz?.enabled_modules || {}),
        _b2b_clients: merged,
      };

      await supa
        .from("businesses")
        .update({ enabled_modules: nextModules })
        .eq("id", business_id);

      return NextResponse.json({ ok: true, clients: merged, source: "modules_fallback" });
    }

    // Single client add
    const { name, phone, address, linked_business_id, id } = body;
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Store/Client name is required" }, { status: 400 });
    }

    const clientId = id || `store-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newClient = {
      id: clientId,
      name: name.trim(),
      phone: phone?.trim() || "",
      address: address?.trim() || "",
      business_id: linked_business_id || undefined,
    };

    // 1. Try table insert
    const { error: insertError } = await supa
      .from("b2b_clients")
      .insert({
        id: clientId,
        business_id,
        name: newClient.name,
        phone: newClient.phone,
        address: newClient.address,
        linked_business_id: linked_business_id || null,
      })
      .select()
      .maybeSingle();

    if (!insertError) {
      return NextResponse.json({ ok: true, client: newClient, source: "table" });
    }

    // 2. Fallback: save to businesses.enabled_modules._b2b_clients
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", business_id)
      .maybeSingle();

    const existing: any[] = Array.isArray(biz?.enabled_modules?._b2b_clients)
      ? biz.enabled_modules._b2b_clients
      : [];

    const updated = [
      newClient,
      ...existing.filter((c) => c.name.toLowerCase().trim() !== newClient.name.toLowerCase().trim()),
    ];

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_clients: updated,
    };

    const { error: updateError } = await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", business_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, client: newClient, clients: updated, source: "modules_fallback" });
  } catch (err: any) {
    console.error("POST /api/b2b/clients error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));
    const { id, name, phone, address, linked_business_id } = body;

    const targetBizId = body.business_id && body.business_id !== "default"
      ? body.business_id
      : caller.businessId;

    if (!caller.isSuperAdmin && targetBizId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot update clients for another business." },
        { status: 403 }
      );
    }

    const business_id = targetBizId;

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const updatedClient = {
      id,
      name: name.trim(),
      phone: phone?.trim() || "",
      address: address?.trim() || "",
      business_id: linked_business_id || undefined,
    };

    // 1. Try table update
    const { error: tableError } = await supa
      .from("b2b_clients")
      .update({
        name: updatedClient.name,
        phone: updatedClient.phone,
        address: updatedClient.address,
        linked_business_id: linked_business_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", business_id);

    if (!tableError) {
      return NextResponse.json({ ok: true, client: updatedClient, source: "table" });
    }

    // 2. Fallback: businesses.enabled_modules._b2b_clients
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", business_id)
      .maybeSingle();

    const existing: any[] = Array.isArray(biz?.enabled_modules?._b2b_clients)
      ? biz.enabled_modules._b2b_clients
      : [];

    const updatedList = existing.map((c) => (c.id === id ? updatedClient : c));

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_clients: updatedList,
    };

    const { error: updateError } = await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", business_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, client: updatedClient, clients: updatedList, source: "modules_fallback" });
  } catch (err: any) {
    console.error("PUT /api/b2b/clients error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(req.url);
    const requestedBizId = searchParams.get("business_id");
    const id = searchParams.get("id");

    const businessId = requestedBizId && requestedBizId !== "default"
      ? requestedBizId
      : caller.businessId;

    if (!caller.isSuperAdmin && businessId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot delete clients of another business." },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // 1. Try table delete
    const { error: tableError } = await supa
      .from("b2b_clients")
      .delete()
      .eq("id", id)
      .eq("business_id", businessId);

    if (!tableError) {
      return NextResponse.json({ ok: true, deletedId: id, source: "table" });
    }

    // 2. Fallback: businesses.enabled_modules._b2b_clients
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const existing: any[] = Array.isArray(biz?.enabled_modules?._b2b_clients)
      ? biz.enabled_modules._b2b_clients
      : [];

    const filtered = existing.filter((c) => c.id !== id);

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_clients: filtered,
    };

    const { error: updateError } = await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, clients: filtered, source: "modules_fallback" });
  } catch (err: any) {
    console.error("DELETE /api/b2b/clients error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
