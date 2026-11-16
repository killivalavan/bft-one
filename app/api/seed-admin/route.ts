import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { validatePasswordPolicy, validateEmailFormat } from "@/lib/utils/passwordPolicy";
import {
  isValidEmployeeLoginId,
  resolveLoginIdentifierToEmail,
} from "@/lib/utils/storeIdGenerator";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";
import { getEffectiveEntitlements } from "@/lib/subscription/plans";

export const dynamic = "force-dynamic";

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
      employeeLoginId?: string;
      password?: string;
      isAdmin?: boolean;
      isStockManager?: boolean;
      preserveRole?: boolean;
      businessId?: string;
      sendInvite?: boolean;
    };

    // 2. Tenant Scoping: Store Admin is locked to their verified businessId.
    // Cross-tenant provisioning requires Super Admin with MFA AAL2.
    let assignedBusinessId = caller.businessId;
    if (body.businessId && body.businessId !== "default" && body.businessId !== caller.businessId) {
      if (!caller.isSuperAdmin || caller.aal !== "aal2") {
        return NextResponse.json(
          { error: "Forbidden: Cannot create or modify users for another business tenant." },
          { status: 403 }
        );
      }
      assignedBusinessId = body.businessId;
    }

    if (!assignedBusinessId) {
      return NextResponse.json(
        { error: "Verified business context is required to provision users." },
        { status: 400 }
      );
    }

    const rawIdentifier = (body.employeeLoginId || body.email || "").trim();
    let email = "";
    let customEmployeeId: string | undefined;

    if (!rawIdentifier) {
      return NextResponse.json(
        { error: "A valid Employee Login ID (e.g. ck10121997) or email address is required." },
        { status: 400 }
      );
    }

    if (rawIdentifier.includes("@")) {
      if (!validateEmailFormat(rawIdentifier)) {
        return NextResponse.json(
          { error: "A valid email address is required (e.g. employee@shop.com)." },
          { status: 400 }
        );
      }
      email = rawIdentifier.toLowerCase();
    } else {
      if (!isValidEmployeeLoginId(rawIdentifier)) {
        return NextResponse.json(
          { error: "Invalid Employee Login ID. Use letters, numbers, dots, or dashes (e.g. ck10121997)." },
          { status: 400 }
        );
      }
      if (body.sendInvite) {
        return NextResponse.json(
          { error: "Email invitation cannot be sent to a prefix-based Employee ID. Please set a direct password instead." },
          { status: 400 }
        );
      }
      const { data: bizRow } = await supa
        .from("businesses")
        .select("slug")
        .eq("id", assignedBusinessId)
        .maybeSingle();

      const tenantSlug = bizRow?.slug || "default";
      customEmployeeId = rawIdentifier.toLowerCase();
      email = resolveLoginIdentifierToEmail(customEmployeeId, tenantSlug);
    }

    const isAdmin = body.isAdmin ?? false;
    const isStockManager = body.isStockManager ?? false;
    const targetRole = isAdmin ? "admin" : "staff";

    // 3. Check if user already exists (O(1) indexed query instead of O(N) auth.listUsers dump)
    const { data: existingProfile } = await supa
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    let userId = existingProfile?.id;

    // 3b. Enforce Subscription Employee Login Seat Limit for new non-admin employee accounts.
    // Store Admin logins (isAdmin === true) do NOT consume an employee seat.
    if (!userId && !isAdmin) {
      const entitlements = await getEffectiveEntitlements(supa, assignedBusinessId);
      if (entitlements.usage.employeeLogins >= entitlements.maxEmployeeSeats) {
        return NextResponse.json(
          {
            error:
              entitlements.maxEmployeeSeats === 0
                ? `Your ${entitlements.planName} plan includes 1 Store Admin login and 0 employee login seats. Upgrade your plan in Settings > My Subscription to add employee logins.`
                : `Employee login seat limit (${entitlements.usage.employeeLogins}/${entitlements.maxEmployeeSeats} on ${entitlements.planName} plan) reached. Upgrade your plan to add more employee logins.`,
            code: "SUBSCRIPTION_SEAT_LIMIT_REACHED",
          },
          { status: 403 }
        );
      }
    }

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
        .select("business_id, is_super_admin, is_admin, is_stock_manager")
        .eq("id", userId)
        .maybeSingle();

      // Prevent accidental self-demotion or role overwrite during password-only resets
      if (userId === caller.id && !isAdmin) {
        return NextResponse.json(
          { error: "Store Admins cannot demote themselves or change their own password here. Use My Profile." },
          { status: 403 }
        );
      }

      if (body.preserveRole && existingProfile) {
        // Preserve existing role flags when only resetting password
        (body as any)._preservedIsAdmin = Boolean(existingProfile.is_admin);
        (body as any)._preservedIsStockManager = Boolean(existingProfile.is_stock_manager);
      }

      // Protected: Super Admin accounts can never be altered via tenant user management
      if (existingProfile?.is_super_admin) {
        return NextResponse.json(
          { error: "Forbidden: Platform Super Admin accounts cannot be modified." },
          { status: 403 }
        );
      }

      if (!existingProfile?.business_id || existingProfile.business_id !== assignedBusinessId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot modify or reassign users belonging to another business tenant." },
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

    // 4. Upsert profile with proper business_id and role flags (never grant is_super_admin via this endpoint)
    const finalIsAdmin =
      (body as any)._preservedIsAdmin !== undefined ? (body as any)._preservedIsAdmin : isAdmin;
    const finalIsStockManager =
      (body as any)._preservedIsStockManager !== undefined
        ? (body as any)._preservedIsStockManager
        : isStockManager;

    const profilePayload: any = {
      id: userId,
      email,
      is_admin: finalIsAdmin,
      is_stock_manager: finalIsStockManager,
      is_super_admin: false,
      business_id: assignedBusinessId,
    };
    if (customEmployeeId) {
      profilePayload.employee_id = customEmployeeId;
    }

    const { error: e2 } = await supa
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (e2) {
      const isSeatLimit = e2.message?.includes("SUBSCRIPTION_SEAT_LIMIT_REACHED");
      return NextResponse.json(
        {
          error: isSeatLimit
            ? "Employee login seat limit reached for your current subscription plan. Upgrade your plan to add more employee logins."
            : e2.message,
          ...(isSeatLimit ? { code: "SUBSCRIPTION_SEAT_LIMIT_REACHED" } : {}),
        },
        { status: isSeatLimit ? 403 : 500 }
      );
    }

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
