import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";

// GET: Fetch support tickets (Super Admin gets all with business details; Store Admin gets their own)
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get("status");
    const targetBusinessId = searchParams.get("businessId");

    let query = supa
      .from("support_tickets")
      .select("*, businesses(name, slug)")
      .order("created_at", { ascending: false });

    if (!caller.isSuperAdmin) {
      // Store admins/staff are strictly limited to their own business
      query = query.eq("business_id", caller.businessId);
    } else if (targetBusinessId) {
      query = query.eq("business_id", targetBusinessId);
    }

    if (filterStatus && filterStatus !== "all") {
      query = query.eq("status", filterStatus);
    }

    const { data: tickets, error } = await query;

    if (error) {
      // If table is not yet created in Supabase SQL editor, return empty array gracefully
      return NextResponse.json({
        tickets: [],
        warning: "Support tickets table migration pending in Supabase.",
      });
    }

    return NextResponse.json({
      tickets: tickets || [],
      total: (tickets || []).length,
      openCount: (tickets || []).filter((t: any) => t.status === "open" || t.status === "in_progress").length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// POST: Store Admin/Staff raises a new issue / bug report to SeyalPro
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;

    if (!caller.isAdmin && !caller.isSuperAdmin) {
      return NextResponse.json({ error: "Unauthorized. Only store administrators can raise issues to SeyalPro." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      title,
      description,
      category = "bug",
      priority = "medium",
      attachmentUrl,
      creatorName,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Issue title is required." }, { status: 400 });
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: "Issue description is required." }, { status: 400 });
    }

    // Generate readable Ticket ID e.g. SP-49281
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const ticketNumber = `SP-${randomSuffix}`;

    const newTicket = {
      ticket_number: ticketNumber,
      business_id: caller.businessId,
      created_by_user_id: caller.id,
      creator_email: caller.email,
      creator_name: creatorName || caller.email.split("@")[0],
      title: title.trim(),
      description: description.trim(),
      category: category || "bug",
      priority: priority || "medium",
      status: "open",
      attachment_url: attachmentUrl || null,
    };

    const { data: ticket, error: insertErr } = await supa
      .from("support_tickets")
      .insert(newTicket)
      .select("*, businesses(name, slug)")
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: `Failed to create support ticket: ${insertErr.message}` },
        { status: 500 }
      );
    }

    // Log Audit Event
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: caller.businessId,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "USER_UPDATED", // general update action
      targetType: "support_ticket",
      targetId: ticket?.id,
      details: {
        ticketNumber,
        title: title.trim(),
        priority,
        category,
      },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      ticket,
      ticketNumber,
      message: "Your issue has been reported directly to SeyalPro support.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH: Update ticket status or resolution notes (Super Admin or Store Admin)
export async function PATCH(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await request.json().catch(() => ({}));
    const { ticketId, status, resolutionNotes } = body;

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required." }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (resolutionNotes !== undefined) updates.resolution_notes = resolutionNotes;

    let updateQuery = supa
      .from("support_tickets")
      .update(updates)
      .eq("id", ticketId);

    // If not super admin, ensure caller can only touch their own business tickets
    if (!caller.isSuperAdmin) {
      updateQuery = updateQuery.eq("business_id", caller.businessId);
    }

    const { data, error } = await updateQuery.select("*").single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ticket: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
