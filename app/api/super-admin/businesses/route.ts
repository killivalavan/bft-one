import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { formatCafeName } from "@/lib/utils/bakerUtils";
import { validateTenantSlug } from "@/lib/utils/slugValidator";
import {
  generateStoreReferenceId,
  normalizeStorePrefix,
  resolveLoginIdentifierToEmail,
} from "@/lib/utils/storeIdGenerator";
import { addCalendarMonths, normalizeLegacyPlanKey } from "@/lib/subscription/plans";

export const dynamic = "force-dynamic";

// GET: List all registered customer businesses
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa } = auth;

    // Fetch businesses, deleted store archive, current subscriptions, and product counts
    const [
      { data: businesses, error },
      { data: deletedLogs },
      { data: currentSubs },
      { data: posProductsRows },
      { data: b2bProductsRows },
      { data: nonAdminProfiles },
    ] = await Promise.all([
      supa.from("businesses").select("*").order("created_at", { ascending: false }),
      supa
        .from("audit_logs")
        .select("id, target_id, details, actor_email, created_at")
        .eq("action", "BUSINESS_DELETED")
        .order("created_at", { ascending: false })
        .limit(100),
      supa.from("tenant_subscriptions").select("*").eq("is_current", true),
      supa.from("products").select("business_id").or("active.is.null,active.eq.true"),
      supa.from("b2b_products").select("business_id").or("is_active.is.null,is_active.eq.true"),
      supa
        .from("profiles")
        .select("business_id")
        .eq("is_admin", false)
        .or("is_super_admin.is.null,is_super_admin.eq.false"),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Prefer server-side SQL aggregation RPC to avoid PostgREST 1,000-row truncation and memory dumps
    const salesByBiz: Record<string, number> = {};
    const expensesByBiz: Record<string, number> = {};
    const ordersByBiz: Record<string, number> = {};
    const countsByBiz: Record<string, { totalUsers: number; adminEmail?: string }> = {};
    let platformTotalSales = 0;
    let platformTotalExpenses = 0;
    let platformTotalOrders = 0;
    let platformTotalUsers = 0;

    const { data: rpcMetrics, error: rpcErr } = await supa.rpc("get_platform_business_metrics");
    if (!rpcErr && Array.isArray(rpcMetrics)) {
      for (const m of rpcMetrics) {
        if (!m?.business_id) continue;
        const bId = m.business_id;
        const sales = Number(m.total_sales) || 0;
        const expenses = Number(m.total_expenses) || 0;
        const orders = Number(m.order_count) || 0;
        const users = Number(m.user_count) || 0;
        salesByBiz[bId] = sales;
        expensesByBiz[bId] = expenses;
        ordersByBiz[bId] = orders;
        countsByBiz[bId] = { totalUsers: users, adminEmail: m.admin_email || undefined };
        platformTotalSales += sales;
        platformTotalExpenses += expenses;
        platformTotalOrders += orders;
        platformTotalUsers += users;
      }
    } else {
      const [salesRes, expensesRes, ordersRes, profilesRes] = await Promise.all([
        supa.from("daily_sales").select("business_id, total_cash_cents, upi_amount_cents"),
        supa.from("daily_expenses").select("business_id, price_cents"),
        supa.from("orders").select("business_id"),
        supa.from("profiles").select("id, email, is_admin, business_id"),
      ]);

      for (const s of salesRes.data || []) {
        if (!s.business_id) continue;
        const amount = ((s.total_cash_cents || 0) + (s.upi_amount_cents || 0)) / 100;
        salesByBiz[s.business_id] = (salesByBiz[s.business_id] || 0) + amount;
        platformTotalSales += amount;
      }
      for (const e of expensesRes.data || []) {
        if (!e.business_id) continue;
        const amount = (e.price_cents || 0) / 100;
        expensesByBiz[e.business_id] = (expensesByBiz[e.business_id] || 0) + amount;
        platformTotalExpenses += amount;
      }
      for (const o of ordersRes.data || []) {
        if (!o.business_id) continue;
        ordersByBiz[o.business_id] = (ordersByBiz[o.business_id] || 0) + 1;
        platformTotalOrders += 1;
      }
      for (const p of profilesRes.data || []) {
        if (!p.business_id) continue;
        if (!countsByBiz[p.business_id]) countsByBiz[p.business_id] = { totalUsers: 0 };
        countsByBiz[p.business_id].totalUsers += 1;
        platformTotalUsers += 1;
        if (p.is_admin && !countsByBiz[p.business_id].adminEmail) {
          countsByBiz[p.business_id].adminEmail = p.email;
        }
      }
    }

    const subByBiz: Record<string, any> = {};
    for (const s of currentSubs || []) {
      if (s?.business_id) subByBiz[s.business_id] = s;
    }
    const posProductsByBiz: Record<string, number> = {};
    for (const p of posProductsRows || []) {
      if (p?.business_id) posProductsByBiz[p.business_id] = (posProductsByBiz[p.business_id] || 0) + 1;
    }
    const b2bProductsByBiz: Record<string, number> = {};
    for (const bp of b2bProductsRows || []) {
      if (bp?.business_id) b2bProductsByBiz[bp.business_id] = (b2bProductsByBiz[bp.business_id] || 0) + 1;
    }
    const employeeSeatsByBiz: Record<string, number> = {};
    for (const pr of nonAdminProfiles || []) {
      if (pr?.business_id) employeeSeatsByBiz[pr.business_id] = (employeeSeatsByBiz[pr.business_id] || 0) + 1;
    }

    const enriched = (businesses || []).map((b: any) => {
      const totalSales = salesByBiz[b.id] || 0;
      const totalExpenses = expensesByBiz[b.id] || 0;
      let b2bCount = b2bProductsByBiz[b.id] || 0;
      if (b2bCount === 0 && Array.isArray(b?.enabled_modules?._b2b_data?.products)) {
        b2bCount = b.enabled_modules._b2b_data.products.filter(
          (p: any) => p?.is_active !== false
        ).length;
      }
      return {
        ...b,
        user_count: countsByBiz[b.id]?.totalUsers || 0,
        admin_email: countsByBiz[b.id]?.adminEmail || "None",
        total_sales: totalSales,
        total_expenses: totalExpenses,
        net_profit: totalSales - totalExpenses,
        order_count: ordersByBiz[b.id] || 0,
        subscription: subByBiz[b.id] || null,
        active_products_count: (posProductsByBiz[b.id] || 0) + b2bCount,
        employee_seats_count: employeeSeatsByBiz[b.id] || 0,
      };
    });

    const deletedBusinesses = (deletedLogs || []).map((log: any) => ({
      id: log.target_id || log.id,
      name: log.details?.businessName || "Deleted Store",
      slug: log.details?.slug || "",
      store_id: log.details?.storeId || "",
      admin_email: log.details?.adminEmail || "N/A",
      plan_type: log.details?.planType || "pro",
      deleted_by: log.details?.deletedBy || log.actor_email || "Super Admin",
      deleted_at: log.created_at,
    }));

    return NextResponse.json({
      businesses: enriched,
      deletedBusinesses,
      analytics: {
        totalSales: platformTotalSales,
        totalExpenses: platformTotalExpenses,
        netProfit: platformTotalSales - platformTotalExpenses,
        totalOrders: platformTotalOrders,
        totalUsers: platformTotalUsers,
        totalBusinesses: (businesses || []).length,
        activeTenants: (businesses || []).filter((b: any) => b.is_active).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// POST: Onboard a new business tenant and create their initial Admin account
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa } = auth;
    const body = await request.json().catch(() => ({}));
    const {
      name,
      slug,
      storeId: rawStoreId,
      storePrefix: rawStorePrefix,
      adminEmail,
      adminPassword,
      planId,
      planType = "pro",
      maxUsers = 25,
      billingDurationMonths = 1,
      startDate,
      expiryDate,
      subscriptionStatus = "active",
      customOverrides,
      currencySymbol = "₹",
      timezone = "Asia/Kolkata",
      geofenceLat,
      geofenceLng,
      geofenceRadiusMeters = 150,
      geofenceEnabled = true,
      enabledModules = {
        billing: true,
        invoices: true,
        sales: true,
        expenses: true,
        timesheet: true,
        stock: true,
        salary: true,
        contacts: true,
      },
    } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    if (!slug?.trim()) return NextResponse.json({ error: "Subdomain slug is required" }, { status: 400 });
    if (!adminEmail?.trim()) return NextResponse.json({ error: "Owner/Admin email is required" }, { status: 400 });
    if (!adminPassword || adminPassword.length < 6) {
      return NextResponse.json({ error: "Admin password must be at least 6 characters" }, { status: 400 });
    }

    // Authoritative DNS-safe & reserved subdomain validation (SEC-12)
    const slugValidation = validateTenantSlug(slug);
    if (!slugValidation.valid) {
      return NextResponse.json(
        {
          error: slugValidation.error || "Invalid subdomain slug.",
          code: slugValidation.code,
        },
        { status: 400 }
      );
    }

    const normalizedSlug = slugValidation.normalizedSlug;
    const normalizedEmail = resolveLoginIdentifierToEmail(adminEmail, normalizedSlug);

    // Resolve & validate Store Reference ID and Prefix (e.g., BFT32523, CK2342)
    const generatedRef = generateStoreReferenceId(name.trim(), rawStorePrefix?.trim() || undefined);
    const finalStorePrefix = rawStorePrefix?.trim()
      ? normalizeStorePrefix(rawStorePrefix)
      : generatedRef.prefix;
    let finalStoreId = rawStoreId?.trim()
      ? rawStoreId.toUpperCase().replace(/[^A-Z0-9]/g, "")
      : generatedRef.storeId;

    // Check active businesses & retired_slugs for conflicts before insert
    const [{ data: existingBiz }, { data: retiredSlug }, { data: allBizIds }] = await Promise.all([
      supa.from("businesses").select("id").eq("slug", normalizedSlug).maybeSingle(),
      supa.from("retired_slugs").select("slug").eq("slug", normalizedSlug).maybeSingle(),
      supa.from("businesses").select("id, enabled_modules"),
    ]);

    const usedStoreIds = new Set(
      (allBizIds || [])
        .map((b: any) => String(b?.enabled_modules?.store_id || "").toUpperCase())
        .filter(Boolean)
    );
    if (usedStoreIds.has(finalStoreId)) {
      // Regenerate if there is an accidental collision
      let attempts = 0;
      while (usedStoreIds.has(finalStoreId) && attempts < 10) {
        finalStoreId = generateStoreReferenceId(name.trim(), finalStorePrefix).storeId;
        attempts++;
      }
    }

    if (existingBiz) {
      return NextResponse.json(
        {
          error: `Subdomain slug '${normalizedSlug}' is already registered by an active store.`,
          code: "SLUG_CONFLICT",
        },
        { status: 409 }
      );
    }

    // Allow Super Admin to re-provision a slug from a previously deleted store
    if (retiredSlug) {
      await supa.from("retired_slugs").delete().eq("slug", normalizedSlug);
    }

    // Enforce Industry Standard Password Policy for Shop Admin
    const { validatePasswordPolicy } = await import("@/lib/utils/passwordPolicy");
    const policy = validatePasswordPolicy(adminPassword, "admin");
    if (!policy.valid) {
      return NextResponse.json({ error: policy.errors.join(" ") }, { status: 400 });
    }

    const enrichedModules = {
      ...(enabledModules || {}),
      store_id: finalStoreId,
      store_prefix: finalStorePrefix,
    };

    const normalizedPlanKey = normalizeLegacyPlanKey(planType);
    const { data: selectedPlan } = await supa
      .from("subscription_plans")
      .select("*")
      .eq(planId ? "id" : "plan_key", planId || normalizedPlanKey)
      .maybeSingle();

    const effectivePlanKey = selectedPlan?.plan_key || normalizedPlanKey;
    const effectiveEmployeeLimit =
      customOverrides?.max_employee_seats !== undefined && customOverrides?.max_employee_seats !== ""
        ? Math.max(0, Number(customOverrides.max_employee_seats))
        : effectivePlanKey === "free"
          ? 0
          : maxUsers !== undefined && maxUsers !== null
            ? Math.max(0, Number(maxUsers))
            : (selectedPlan?.max_employee_seats ?? 25);

    const effectiveProductLimit =
      customOverrides?.is_unlimited_products === true
        ? null
        : customOverrides?.max_active_products !== undefined && customOverrides?.max_active_products !== ""
          ? Math.max(0, Number(customOverrides.max_active_products))
          : (selectedPlan ? selectedPlan.max_active_products : 250);

    const effectivePrice =
      customOverrides?.monthly_price !== undefined && customOverrides?.monthly_price !== ""
        ? Math.max(0, Number(customOverrides.monthly_price))
        : Number(selectedPlan?.monthly_price ?? 0);

    const effectiveSupportLevel =
      customOverrides?.support_level === "priority" || customOverrides?.support_level === "standard"
        ? customOverrides.support_level
        : (selectedPlan?.support_level || "standard");

    // 1. Create Business Record
    const { data: newBiz, error: bizErr } = await supa
      .from("businesses")
      .insert({
        name: name.trim(),
        slug: normalizedSlug,
        plan_type: effectivePlanKey,
        max_users: effectiveEmployeeLimit,
        currency_symbol: currencySymbol,
        timezone: timezone,
        geofence_lat: geofenceLat ? Number(geofenceLat) : null,
        geofence_lng: geofenceLng ? Number(geofenceLng) : null,
        geofence_radius_meters: Number(geofenceRadiusMeters) || 150,
        geofence_enabled: !!geofenceEnabled,
        enabled_modules: enrichedModules,
        is_active: true,
      })
      .select("*")
      .single();

    if (bizErr) {
      const isConflict =
        bizErr.code === "23505" ||
        bizErr.message?.toLowerCase().includes("duplicate") ||
        bizErr.message?.toLowerCase().includes("retired");
      if (isConflict) {
        return NextResponse.json(
          { error: `Subdomain slug '${normalizedSlug}' is already taken or retired.`, code: "SLUG_CONFLICT" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: `Failed to create business: ${bizErr.message}` }, { status: 500 });
    }

    const businessId = newBiz.id;

    // 2. Create Initial Owner Auth User (or reclaim orphaned auth account from a deleted store)
    let newUserId: string | undefined;
    const { data: userAuth, error: authErr } = await supa.auth.admin.createUser({
      email: normalizedEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (authErr) {
      const alreadyExists =
        authErr.message?.toLowerCase().includes("already") ||
        authErr.message?.toLowerCase().includes("exists");

      if (alreadyExists) {
        const { data: existingProf } = await supa
          .from("profiles")
          .select("id, business_id, is_super_admin")
          .eq("email", normalizedEmail)
          .maybeSingle();

        let belongsToActiveBiz = false;
        if (existingProf?.is_super_admin) {
          belongsToActiveBiz = true;
        } else if (existingProf?.business_id) {
          const { data: activeOwnerBiz } = await supa
            .from("businesses")
            .select("id")
            .eq("id", existingProf.business_id)
            .maybeSingle();
          belongsToActiveBiz = Boolean(activeOwnerBiz);
        }

        if (belongsToActiveBiz) {
          await supa.from("businesses").delete().eq("id", businessId);
          return NextResponse.json(
            { error: `Admin email '${normalizedEmail}' is already assigned to an active store.` },
            { status: 409 }
          );
        }

        // Reclaim orphaned auth user (from a previously deleted store or failed onboarding)
        const { data: listData } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const orphanAuth = (listData?.users || []).find(
          (u: any) => u.email?.toLowerCase() === normalizedEmail
        );
        if (orphanAuth) {
          const { error: upErr } = await supa.auth.admin.updateUserById(orphanAuth.id, {
            password: adminPassword,
            email_confirm: true,
          });
          if (!upErr) {
            newUserId = orphanAuth.id;
          }
        }
      }

      if (!newUserId) {
        await supa.from("businesses").delete().eq("id", businessId);
        return NextResponse.json({ error: `Failed to create admin user: ${authErr.message}` }, { status: 500 });
      }
    } else {
      newUserId = userAuth.user.id;
    }

    // 3. Create Admin Profile in profiles table with business_id
    const { error: profErr } = await supa.from("profiles").upsert({
      id: newUserId,
      email: normalizedEmail,
      is_admin: true,
      is_stock_manager: true,
      business_id: businessId,
    });

    if (profErr) {
      // Rollback auth user and business record so no orphaned tenant remains
      await supa.auth.admin.deleteUser(newUserId).catch(() => {});
      await supa.from("businesses").delete().eq("id", businessId);
      return NextResponse.json({ error: `Failed to set profile: ${profErr.message}` }, { status: 500 });
    }

    // 3b. Create initial Tenant Subscription snapshot & audit event
    if (selectedPlan) {
      const startDt = startDate ? new Date(startDate) : new Date();
      const validStart = Number.isNaN(startDt.getTime()) ? new Date() : startDt;
      const duration = effectivePlanKey === "free" ? null : (Number(billingDurationMonths) || 1);
      let computedExpiry: string | null = null;
      if (expiryDate) {
        const expDt = new Date(expiryDate);
        if (!Number.isNaN(expDt.getTime())) computedExpiry = expDt.toISOString();
      } else if (effectivePlanKey !== "free" && duration) {
        computedExpiry = addCalendarMonths(validStart, duration).toISOString();
      }

      const validStatus = ["active", "pending", "suspended", "expired"].includes(subscriptionStatus)
        ? subscriptionStatus
        : "active";

      const { data: createdSub } = await supa
        .from("tenant_subscriptions")
        .insert({
          business_id: businessId,
          plan_id: selectedPlan.id,
          plan_key_snapshot: effectivePlanKey,
          plan_name_snapshot: selectedPlan.plan_name,
          subscription_status: validStatus,
          start_date: validStart.toISOString(),
          expiry_date: computedExpiry,
          billing_duration_months: duration,
          price_snapshot: effectivePrice,
          product_limit_snapshot: effectiveProductLimit,
          employee_limit_snapshot: effectiveEmployeeLimit,
          support_level_snapshot: effectiveSupportLevel,
          custom_limit_overrides: customOverrides && typeof customOverrides === "object" ? customOverrides : {},
          is_current: true,
          created_by: auth.user.id,
        })
        .select("*")
        .single();

      if (createdSub) {
        await supa.from("subscription_events").insert({
          business_id: businessId,
          subscription_id: createdSub.id,
          event_type: "SUBSCRIPTION_CREATED",
          previous_values: {},
          new_values: {
            plan_key: effectivePlanKey,
            status: validStatus,
            expiry_date: computedExpiry,
            price: effectivePrice,
            product_limit: effectiveProductLimit,
            employee_limit: effectiveEmployeeLimit,
          },
          admin_id: auth.user.id,
          admin_email: auth.user.email,
          reason: "Initial client onboarding subscription assignment",
        });
      }
    }

    // 4. Audit Log
    const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: "BUSINESS_CREATED",
      targetType: "business",
      targetId: businessId,
      details: { businessName: name, slug: normalizedSlug, adminEmail: normalizedEmail },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      business: newBiz,
      adminUser: { id: newUserId, email: normalizedEmail },
      subdomainUrl: `https://${normalizedSlug}.countercub.com`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH: Update business profile, settings, geofencing, or module feature gates
export async function PATCH(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa, user: caller } = auth;
    const body = await request.json().catch(() => ({}));
    const {
      id,
      name,
      slug,
      is_active,
      plan_type,
      max_users,
      currency_symbol,
      timezone,
      geofence_lat,
      geofence_lng,
      geofence_radius_meters,
      geofence_enabled,
      enabled_modules,
    } = body;

    if (!id) return NextResponse.json({ error: "Business ID required" }, { status: 400 });

    const { data: currentBiz, error: currentBizErr } = await supa
      .from("businesses")
      .select("id, name, slug")
      .eq("id", id)
      .maybeSingle();

    if (currentBizErr || !currentBiz) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (name?.trim()) updates.name = formatCafeName(name.trim());

    let previousSlug: string | null = null;
    if (slug !== undefined && slug !== null && String(slug).trim() !== "") {
      const slugValidation = validateTenantSlug(slug);
      if (!slugValidation.valid) {
        return NextResponse.json(
          {
            error: slugValidation.error || "Invalid subdomain slug.",
            code: slugValidation.code,
          },
          { status: 400 }
        );
      }
      const nextSlug = slugValidation.normalizedSlug;
      if (nextSlug !== currentBiz.slug) {
        const [{ data: conflictBiz }, { data: retiredSlug }] = await Promise.all([
          supa.from("businesses").select("id").eq("slug", nextSlug).neq("id", id).maybeSingle(),
          supa.from("retired_slugs").select("slug").eq("slug", nextSlug).maybeSingle(),
        ]);

        if (conflictBiz || retiredSlug) {
          return NextResponse.json(
            {
              error: `Subdomain slug '${nextSlug}' is already registered or permanently retired.`,
              code: "SLUG_CONFLICT",
            },
            { status: 409 }
          );
        }
        previousSlug = currentBiz.slug;
        updates.slug = nextSlug;
      }
    }

    if (typeof is_active === "boolean") updates.is_active = is_active;
    if (plan_type) updates.plan_type = plan_type;
    if (max_users) updates.max_users = Number(max_users);
    if (currency_symbol) updates.currency_symbol = currency_symbol;
    if (timezone) updates.timezone = timezone;
    if (geofence_lat !== undefined) updates.geofence_lat = geofence_lat !== null ? Number(geofence_lat) : null;
    if (geofence_lng !== undefined) updates.geofence_lng = geofence_lng !== null ? Number(geofence_lng) : null;
    if (geofence_radius_meters !== undefined) updates.geofence_radius_meters = Number(geofence_radius_meters) || 150;
    if (typeof geofence_enabled === "boolean") updates.geofence_enabled = geofence_enabled;
    if (enabled_modules) updates.enabled_modules = enabled_modules;

    const { data, error } = await supa
      .from("businesses")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      const isConflict =
        error.code === "23505" ||
        error.message?.toLowerCase().includes("duplicate") ||
        error.message?.toLowerCase().includes("retired");
      if (isConflict) {
        return NextResponse.json({ error: error.message, code: "SLUG_CONFLICT" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log Audit Event
    const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: id,
      actorId: caller.id,
      actorEmail: caller.email,
      action: previousSlug ? "BUSINESS_SLUG_CHANGED" : "BUSINESS_UPDATED",
      targetType: "business",
      targetId: id,
      details: previousSlug
        ? { previousSlug, newSlug: updates.slug, updates }
        : { updates },
      ...clientMeta,
    });

    return NextResponse.json({ ok: true, business: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE: Offboard and completely delete a client business & clean up all associated data
export async function DELETE(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa, user: caller } = auth;
    const body = await request.json().catch(() => ({}));
    const { businessId } = body;

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    // Safety guard: Protect default template business from accidental deletion
    const protectedIds = [
      "a0000000-0000-0000-0000-000000000001",
    ];
    if (protectedIds.includes(businessId)) {
      return NextResponse.json(
        { error: "This is the primary root business and cannot be deleted." },
        { status: 403 }
      );
    }

    // 1. Fetch business details for audit logging
    const { data: targetBiz, error: findErr } = await supa
      .from("businesses")
      .select("id, name, slug, plan_type, enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    if (findErr || !targetBiz) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    // 2. Fetch all user profile IDs belonging to this business
    const { data: profiles } = await supa
      .from("profiles")
      .select("id, email, is_admin, is_super_admin")
      .eq("business_id", businessId);

    const primaryAdminEmail =
      (profiles || []).find((p: any) => p.is_admin)?.email ||
      (profiles || [])[0]?.email ||
      "None";

    const userIds = (profiles || [])
      .filter((p) => !p.is_super_admin && p.id !== caller.id)
      .map((p) => p.id);

    // 3. Cascade wipe tenant operational records across retail, B2B wholesale, and inventory
    await Promise.allSettled([
      supa.from("salary_entries").delete().eq("business_id", businessId),
      supa.from("salary_settlements").delete().eq("business_id", businessId),
      supa.from("employee_increments").delete().eq("business_id", businessId),
      supa.from("employee_achievements").delete().eq("business_id", businessId),
      supa.from("employee_notices").delete().eq("business_id", businessId),
      supa.from("leaves").delete().eq("business_id", businessId),
      supa.from("timesheets").delete().eq("business_id", businessId),
      supa.from("daily_sales").delete().eq("business_id", businessId),
      supa.from("daily_expenses").delete().eq("business_id", businessId),
      supa.from("expense_price_list").delete().eq("business_id", businessId),
      supa.from("orders").delete().eq("business_id", businessId),
      supa.from("products").delete().eq("business_id", businessId),
      supa.from("product_stocks").delete().eq("business_id", businessId),
      supa.from("categories").delete().eq("business_id", businessId),
      supa.from("external_contacts").delete().eq("business_id", businessId),
      supa.from("shifts").delete().eq("business_id", businessId),
      supa.from("notifications").delete().eq("business_id", businessId),
      supa.from("invoices").delete().eq("business_id", businessId),
      supa.from("b2b_dispatches").delete().eq("business_id", businessId),
      supa.from("b2b_products").delete().eq("business_id", businessId),
      supa.from("b2b_clients").delete().eq("business_id", businessId),
      supa.from("b2b_payments").delete().eq("business_id", businessId),
      supa.from("b2b_expenses").delete().eq("business_id", businessId),
      supa.from("b2b_broadcasts").delete().eq("business_id", businessId),
      supa.from("inventory_items").delete().eq("business_id", businessId),
      supa.from("item_recipes").delete().eq("business_id", businessId),
      supa.from("stock_ledger").delete().eq("business_id", businessId),
      supa.from("suppliers").delete().eq("business_id", businessId),
      supa.from("purchase_orders").delete().eq("business_id", businessId),
      supa.from("audit_logs").delete().eq("business_id", businessId),
    ]);

    // 4. Delete user profiles and auth accounts
    if (userIds.length > 0) {
      await supa.from("profiles").delete().in("id", userIds);
      for (const uid of userIds) {
        try {
          await supa.auth.admin.deleteUser(uid);
        } catch (_) {}
      }
    }

    // 5. Delete the business record itself
    const { error: delBizErr } = await supa
      .from("businesses")
      .delete()
      .eq("id", businessId);

    if (delBizErr) {
      return NextResponse.json({ error: `Failed to remove business: ${delBizErr.message}` }, { status: 500 });
    }

    // Free up the deleted store's slug so Super Admin can re-onboard it if needed
    if (targetBiz.slug) {
      await supa.from("retired_slugs").delete().eq("slug", targetBiz.slug.toLowerCase().trim());
    }

    // 6. Log Audit Event (use null businessId so FK ON DELETE SET NULL does not block archiving)
    const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: null as any,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "BUSINESS_DELETED",
      targetType: "business",
      targetId: businessId,
      details: {
        businessName: targetBiz.name,
        slug: targetBiz.slug,
        storeId: (targetBiz as any)?.enabled_modules?.store_id || "",
        adminEmail: primaryAdminEmail,
        planType: (targetBiz as any)?.plan_type || "pro",
        deletedUserCount: userIds.length,
        deletedBy: caller.email,
      },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully deleted ${targetBiz.name} and purged all associated store records.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
