import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

// GET: List all registered customer businesses
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa } = auth;

    // Fetch businesses
    const { data: businesses, error } = await supa
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch sales, expenses, and orders for cross-tenant combined analytics
    const [salesRes, expensesRes, ordersRes] = await Promise.all([
      supa.from("daily_sales").select("business_id, total_cash_cents, upi_amount_cents"),
      supa.from("daily_expenses").select("business_id, price_cents"),
      supa.from("orders").select("business_id, total_amount, status"),
    ]);

    // Financial totals by tenant
    const salesByBiz: Record<string, number> = {};
    let platformTotalSales = 0;
    (salesRes.data || []).forEach((s: any) => {
      const bId = s.business_id || "a0000000-0000-0000-0000-000000000001";
      const amount = ((s.total_cash_cents || 0) + (s.upi_amount_cents || 0)) / 100;
      salesByBiz[bId] = (salesByBiz[bId] || 0) + amount;
      platformTotalSales += amount;
    });

    const expensesByBiz: Record<string, number> = {};
    let platformTotalExpenses = 0;
    (expensesRes.data || []).forEach((e: any) => {
      const bId = e.business_id || "a0000000-0000-0000-0000-000000000001";
      const amount = (e.price_cents || 0) / 100;
      expensesByBiz[bId] = (expensesByBiz[bId] || 0) + amount;
      platformTotalExpenses += amount;
    });

    const ordersByBiz: Record<string, number> = {};
    let platformTotalOrders = 0;
    (ordersRes.data || []).forEach((o: any) => {
      const bId = o.business_id || "a0000000-0000-0000-0000-000000000001";
      ordersByBiz[bId] = (ordersByBiz[bId] || 0) + 1;
      platformTotalOrders += 1;
    });

    // Fetch user counts per business
    const { data: profiles } = await supa
      .from("profiles")
      .select("id, email, is_admin, business_id");

    const countsByBiz: Record<string, { totalUsers: number; adminEmail?: string }> = {};
    let platformTotalUsers = 0;
    (profiles || []).forEach((p: any) => {
      const bId = p.business_id || "a0000000-0000-0000-0000-000000000001";
      if (!countsByBiz[bId]) countsByBiz[bId] = { totalUsers: 0 };
      countsByBiz[bId].totalUsers += 1;
      platformTotalUsers += 1;
      if (p.is_admin && !countsByBiz[bId].adminEmail) {
        countsByBiz[bId].adminEmail = p.email;
      }
    });

    const enriched = (businesses || []).map((b: any) => {
      const totalSales = salesByBiz[b.id] || 0;
      const totalExpenses = expensesByBiz[b.id] || 0;
      return {
        ...b,
        user_count: countsByBiz[b.id]?.totalUsers || 0,
        admin_email: countsByBiz[b.id]?.adminEmail || "None",
        total_sales: totalSales,
        total_expenses: totalExpenses,
        net_profit: totalSales - totalExpenses,
        order_count: ordersByBiz[b.id] || 0,
      };
    });

    return NextResponse.json({
      businesses: enriched,
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
      adminEmail,
      adminPassword,
      planType = "pro",
      maxUsers = 25,
      currencySymbol = "₹",
      timezone = "Asia/Kolkata",
      geofenceLat,
      geofenceLng,
      geofenceRadiusMeters = 150,
      geofenceEnabled = true,
      enabledModules = {
        billing: true,
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

    const normalizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
    const normalizedEmail = adminEmail.toLowerCase().trim();

    // Enforce Industry Standard Password Policy for Shop Admin
    const { validatePasswordPolicy } = await import("@/lib/utils/passwordPolicy");
    const policy = validatePasswordPolicy(adminPassword, "admin");
    if (!policy.valid) {
      return NextResponse.json({ error: policy.errors.join(" ") }, { status: 400 });
    }

    // 1. Create Business Record
    const { data: newBiz, error: bizErr } = await supa
      .from("businesses")
      .insert({
        name: name.trim(),
        slug: normalizedSlug,
        plan_type: planType,
        max_users: Number(maxUsers) || 25,
        currency_symbol: currencySymbol,
        timezone: timezone,
        geofence_lat: geofenceLat ? Number(geofenceLat) : null,
        geofence_lng: geofenceLng ? Number(geofenceLng) : null,
        geofence_radius_meters: Number(geofenceRadiusMeters) || 150,
        geofence_enabled: !!geofenceEnabled,
        enabled_modules: enabledModules,
        is_active: true,
      })
      .select("*")
      .single();

    if (bizErr) {
      return NextResponse.json({ error: `Failed to create business: ${bizErr.message}` }, { status: 500 });
    }

    const businessId = newBiz.id;

    // 2. Create Initial Owner Auth User
    const { data: userAuth, error: authErr } = await supa.auth.admin.createUser({
      email: normalizedEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (authErr) {
      // Rollback business if auth creation fails
      await supa.from("businesses").delete().eq("id", businessId);
      return NextResponse.json({ error: `Failed to create admin user: ${authErr.message}` }, { status: 500 });
    }

    const newUserId = userAuth.user.id;

    // 3. Create Admin Profile in profiles table with business_id
    const { error: profErr } = await supa.from("profiles").upsert({
      id: newUserId,
      email: normalizedEmail,
      is_admin: true,
      is_stock_manager: true,
      business_id: businessId,
    });

    if (profErr) {
      return NextResponse.json({ error: `Failed to set profile: ${profErr.message}` }, { status: 500 });
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
      subdomainUrl: `https://${normalizedSlug}.seyalpro.com`,
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

    const updates: any = { updated_at: new Date().toISOString() };
    if (name?.trim()) updates.name = name.trim();
    if (slug?.trim()) updates.slug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Log Audit Event
    const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: id,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "BUSINESS_UPDATED",
      targetType: "business",
      targetId: id,
      details: { updates },
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
      .select("id, name, slug")
      .eq("id", businessId)
      .maybeSingle();

    if (findErr || !targetBiz) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    // 2. Fetch all user profile IDs belonging to this business
    const { data: profiles } = await supa
      .from("profiles")
      .select("id, email, is_super_admin")
      .eq("business_id", businessId);

    const userIds = (profiles || [])
      .filter((p) => !p.is_super_admin && p.id !== caller.id)
      .map((p) => p.id);

    // 3. Cascade wipe tenant operational records
    await Promise.allSettled([
      supa.from("salary_entries").delete().eq("business_id", businessId),
      supa.from("salary_settlements").delete().eq("business_id", businessId),
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

    // 6. Log Audit Event
    const { logAuditEvent, extractClientMetadata } = await import("@/lib/services/auditLogger");
    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "BUSINESS_DELETED",
      targetType: "business",
      targetId: businessId,
      details: {
        businessName: targetBiz.name,
        slug: targetBiz.slug,
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
