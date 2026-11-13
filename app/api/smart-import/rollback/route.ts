/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));

    const requestedBizId = body.business_id;
    if (
      requestedBizId &&
      requestedBizId !== "default" &&
      requestedBizId !== caller.businessId
    ) {
      return NextResponse.json(
        { error: "Forbidden: Cannot roll back imports belonging to another store." },
        { status: 403 }
      );
    }

    const businessId = caller.businessId;

    const jobId = String(body.jobId || "").trim();
    if (!businessId || !jobId) {
      return NextResponse.json(
        { error: "Both business_id and jobId are required for rollback." },
        { status: 400 }
      );
    }

    // 1. Load job from table or businesses.enabled_modules._smart_imports strictly for businessId
    const { data: bizRow } = await supa
      .from("businesses")
      .select("id, enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const currentModules = bizRow?.enabled_modules || {};
    const smartImports: any[] = Array.isArray(currentModules._smart_imports)
      ? currentModules._smart_imports
      : [];

    let jobRecord = smartImports.find((j) => j.id === jobId && j.business_id === businessId);

    if (!jobRecord) {
      const { data: dbJob } = await supa
        .from("data_import_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("business_id", businessId)
        .maybeSingle();
      jobRecord = dbJob;
    }

    if (!jobRecord) {
      return NextResponse.json(
        { error: "Import job not found for this store." },
        { status: 404 }
      );
    }

    if (jobRecord.status === "rolled_back") {
      return NextResponse.json(
        { error: "This import job has already been rolled back." },
        { status: 400 }
      );
    }

    const provenance = jobRecord.provenance || {};
    const createdIds: Record<string, string[]> = provenance.createdIds || {};
    const updatedSnapshots: Record<string, any[]> = provenance.updatedSnapshots || {};

    // 2. Check for post-import modifications on created dispatches/invoices to prevent unsafe data loss
    const createdDispatchIds: string[] = Array.isArray(createdIds.b2b_dispatches)
      ? createdIds.b2b_dispatches
      : [];
    const protectedDispatchIds = new Set<string>();
    const conflicts: string[] = [];

    if (createdDispatchIds.length > 0) {
      const { data: currentDispatches } = await supa
        .from("b2b_dispatches")
        .select("id, slip_number, paid_amount, updated_at")
        .eq("business_id", businessId)
        .in("id", createdDispatchIds);

      const jobCompletedTime = jobRecord.completed_at
        ? new Date(jobRecord.completed_at).getTime() + 5000
        : Date.now();

      for (const d of currentDispatches || []) {
        const updatedTime = d.updated_at ? new Date(d.updated_at).getTime() : 0;
        if (updatedTime > jobCompletedTime) {
          protectedDispatchIds.add(d.id);
          conflicts.push(
            `Invoice/Slip ${d.slip_number} was modified after import and was preserved to protect subsequent transactions.`
          );
        }
      }
    }

    const safeToDeleteDispatches = createdDispatchIds.filter(
      (id) => !protectedDispatchIds.has(id)
    );

    // 3. Delete unmodified created records strictly scoped to businessId
    const deleteFromTable = async (table: string, ids?: string[]) => {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      await supa.from(table).delete().eq("business_id", businessId).in("id", ids);
      return ids.length;
    };

    const [
      deletedDispatches,
      deletedInvoices,
      deletedClients,
      deletedProducts,
      deletedPayments,
      deletedExpenses,
      deletedInventory,
      deletedSuppliers,
      deletedPurchases,
    ] = await Promise.all([
      deleteFromTable("b2b_dispatches", safeToDeleteDispatches),
      deleteFromTable("invoices", createdIds.invoices),
      deleteFromTable("b2b_clients", createdIds.b2b_clients),
      deleteFromTable("b2b_products", createdIds.b2b_products),
      deleteFromTable("b2b_payments", createdIds.b2b_payments),
      deleteFromTable("b2b_expenses", createdIds.b2b_expenses),
      deleteFromTable("inventory_items", createdIds.inventory_items),
      deleteFromTable("suppliers", createdIds.suppliers),
      deleteFromTable("purchase_orders", createdIds.purchase_orders),
    ]);

    if (Array.isArray(createdIds.b2b_expenses) && createdIds.b2b_expenses.length > 0) {
      await supa
        .from("daily_expenses")
        .delete()
        .eq("business_id", businessId)
        .in("id", createdIds.b2b_expenses);
    }

    // 4. Restore pre-merge snapshots if any records were merged
    for (const [table, snapshots] of Object.entries(updatedSnapshots)) {
      if (Array.isArray(snapshots) && snapshots.length > 0) {
        await supa.from(table).upsert(snapshots, { onConflict: "id" });
      }
    }

    // 5. Update Dual-Engine Fallback in businesses.enabled_modules for this store
    const rolledBackAt = new Date().toISOString();
    const b2bData = currentModules._b2b_data || {};

    const deletedDispSet = new Set(safeToDeleteDispatches);
    const deletedInvSet = new Set(createdIds.invoices || []);
    const deletedClientSet = new Set(createdIds.b2b_clients || []);
    const deletedProdSet = new Set(createdIds.b2b_products || []);
    const deletedPaySet = new Set(createdIds.b2b_payments || []);
    const deletedExpSet = new Set(createdIds.b2b_expenses || []);

    const nextSmartImports = smartImports.map((j) =>
      j.id === jobId
        ? {
            ...j,
            status: "rolled_back",
            rolled_back_at: rolledBackAt,
            updated_at: rolledBackAt,
          }
        : j
    );

    const nextModules = {
      ...currentModules,
      _invoices: (currentModules._invoices || []).filter(
        (inv: any) => !deletedInvSet.has(inv.id)
      ),
      _b2b_clients: (currentModules._b2b_clients || []).filter(
        (c: any) => !deletedClientSet.has(c.id)
      ),
      _b2b_data: {
        ...b2bData,
        invoices: (b2bData.invoices || []).filter((i: any) => !deletedDispSet.has(i.id)),
        products: (b2bData.products || []).filter((p: any) => !deletedProdSet.has(p.id)),
        payments: (b2bData.payments || []).filter((p: any) => !deletedPaySet.has(p.id)),
        expenses: (b2bData.expenses || []).filter((e: any) => !deletedExpSet.has(e.id)),
        lastUpdated: rolledBackAt,
      },
      _smart_imports: nextSmartImports,
    };

    await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    try {
      await supa
        .from("data_import_jobs")
        .update({
          status: "rolled_back",
          rolled_back_at: rolledBackAt,
          updated_at: rolledBackAt,
        })
        .eq("id", jobId)
        .eq("business_id", businessId);

      await supa.from("data_import_logs").insert({
        id: `${jobId}_log_rollback_${Date.now()}`,
        job_id: jobId,
        business_id: businessId,
        actor_id: caller.id,
        actor_email: caller.email,
        event_type: "IMPORT_ROLLED_BACK",
        details: {
          deletedDispatches,
          deletedInvoices,
          deletedClients,
          deletedProducts,
          deletedPayments,
          deletedExpenses,
          conflicts,
        },
      });
    } catch {}

    const { ipAddress, userAgent } = extractClientMetadata(req);
    await logAuditEvent({
      businessId,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "SMART_IMPORT_ROLLED_BACK",
      targetType: "data_import_job",
      targetId: jobId,
      details: {
        deletedDispatches,
        deletedClients,
        deletedProducts,
        conflictsCount: conflicts.length,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      jobId,
      status: "rolled_back",
      rolledBackAt,
      removedCounts: {
        invoices: deletedDispatches,
        customers: deletedClients,
        products: deletedProducts,
        payments: deletedPayments,
        expenses: deletedExpenses,
        inventory: deletedInventory,
        suppliers: deletedSuppliers,
        purchases: deletedPurchases,
      },
      RemovedRecordIds: {
        invoices: safeToDeleteDispatches,
        customers: createdIds.b2b_clients || [],
        products: createdIds.b2b_products || [],
        payments: createdIds.b2b_payments || [],
        expenses: createdIds.b2b_expenses || [],
      },
      conflicts,
    });
  } catch (err: any) {
    console.error("POST /api/smart-import/rollback error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to roll back import job" },
      { status: 500 }
    );
  }
}

