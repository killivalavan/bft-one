import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { validatePasswordPolicy, validateEmailFormat } from "@/lib/utils/passwordPolicy";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";

export async function POST(request: Request) {
  try {
    const supa = supabaseAdmin();
    const clientMeta = extractClientMetadata(request);

    // 1. Authenticate Caller — Must be at least a Store Admin or Platform Super Admin
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const caller = auth.user;
    const body = await request.json().catch(() => ({})) as {
      email?: string;
      password?: string;
      isAdmin?: boolean;
      isStockManager?: boolean;
      businessId?: string;
      sendInvite?: boolean;
    };

    const rawEmail = body.email || "";
    if (!validateEmailFormat(rawEmail)) {
      return NextResponse.json(
        { error: "A valid email address is required (e.g. employee@shop.com)." },
        { status: 400 }
      );
    }
    const email = rawEmail.toLowerCase().trim();

    // 2. Tenant Scoping: Super Admin can target any shop, Store Admin is locked to their shop
    let assignedBusinessId = caller.businessId;
    if (caller.isSuperAdmin && body.businessId) {
      assignedBusinessId = body.businessId;
    }

    const isAdmin = body.isAdmin ?? false;
    const isStockManager = body.isStockManager ?? false;
    const targetRole = isAdmin ? "admin" : "staff";

    // 3. Check if user already exists
    const { data: list } = await supa.auth.admin.listUsers();
    const found = list?.users.find((u) => u.email?.toLowerCase() === email);
    let userId = found?.id;

    if (!userId) {
      // Option A: Send Email Invite
      if (body.sendInvite) {
        const { data: inviteData, error: inviteErr } = await supa.auth.admin.inviteUserByEmail(email);
        if (inviteErr) {
          return NextResponse.json({ error: `Invite failed: ${inviteErr.message}` }, { status: 500 });
        }
        userId = inviteData.user?.id!;

        await logAuditEvent({
          businessId: assignedBusinessId,
          actorId: caller.id,
          actorEmail: caller.email,
          action: "USER_INVITED",
          targetType: "user",
          targetId: userId,
          details: { email, role: targetRole, assignedBusinessId },
          ...clientMeta,
        });
      } else {
        // Option B: Direct Password Creation
        const rawPassword = body.password || "";
        const policy = validatePasswordPolicy(rawPassword, targetRole);
        if (!policy.valid) {
          return NextResponse.json(
            { error: policy.errors.join(" ") },
            { status: 400 }
          );
        }

        const { data: createData, error: createErr } = await supa.auth.admin.createUser({
          email,
          password: rawPassword,
          email_confirm: true,
        });

        if (createErr) {
          return NextResponse.json({ error: createErr.message }, { status: 500 });
        }
        userId = createData.user?.id!;

        await logAuditEvent({
          businessId: assignedBusinessId,
          actorId: caller.id,
          actorEmail: caller.email,
          action: "USER_CREATED",
          targetType: "user",
          targetId: userId,
          details: { email, role: targetRole, assignedBusinessId },
          ...clientMeta,
        });
      }
    } else {
      // User exists: verify tenant permission before modifying
      const { data: existingProfile } = await supa
        .from("profiles")
        .select("business_id")
        .eq("id", userId)
        .maybeSingle();

      if (!caller.isSuperAdmin && existingProfile?.business_id && existingProfile.business_id !== assignedBusinessId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot modify users of another business tenant." },
          { status: 403 }
        );
      }

      // If updating password
      if (body.password) {
        const policy = validatePasswordPolicy(body.password, targetRole);
        if (!policy.valid) {
          return NextResponse.json(
            { error: policy.errors.join(" ") },
            { status: 400 }
          );
        }

        const { error: upErr } = await supa.auth.admin.updateUserById(userId, {
          password: body.password,
          email_confirm: true,
        });

        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

        await logAuditEvent({
          businessId: assignedBusinessId,
          actorId: caller.id,
          actorEmail: caller.email,
          action: "PASSWORD_RESET",
          targetType: "user",
          targetId: userId,
          details: { email, resetBy: caller.email },
          ...clientMeta,
        });
      }
    }

    // 4. Upsert profile with proper business_id and role flags
    const profilePayload: any = {
      id: userId,
      email,
      is_admin: isAdmin,
      is_stock_manager: isStockManager,
      business_id: assignedBusinessId,
    };

    const { error: e2 } = await supa.from("profiles").upsert(profilePayload, { onConflict: "id" });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      userId,
      businessId: assignedBusinessId,
      message: body.sendInvite ? "Invitation email sent successfully." : "User account created successfully."
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error occurred" }, { status: 500 });
  }
}
