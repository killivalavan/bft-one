import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Phase 2 Security Suite — PostgreSQL RLS, Grants, Functions & Versioned Migrations", () => {
  const rootDir = process.cwd();
  const upMigrationPath = path.join(
    rootDir,
    "supabase",
    "migrations",
    "202611120001_zero_trust_rls_and_grants.up.sql"
  );
  const downMigrationPath = path.join(
    rootDir,
    "supabase",
    "migrations",
    "202611120001_zero_trust_rls_and_grants.down.sql"
  );
  const rootHardeningPath = path.join(
    rootDir,
    "supabase_security_hardening.sql"
  );

  it("1. verifies versioned up/down migrations exist and are wrapped in atomic transactions", () => {
    assert.ok(
      fs.existsSync(upMigrationPath),
      "Up migration 202611120001_zero_trust_rls_and_grants.up.sql must exist"
    );
    assert.ok(
      fs.existsSync(downMigrationPath),
      "Down rollback migration 202611120001_zero_trust_rls_and_grants.down.sql must exist"
    );
    assert.ok(
      fs.existsSync(rootHardeningPath),
      "Root supabase_security_hardening.sql must exist"
    );

    const upSql = fs.readFileSync(upMigrationPath, "utf8");
    const downSql = fs.readFileSync(downMigrationPath, "utf8");

    assert.ok(
      upSql.includes("BEGIN;") && upSql.includes("COMMIT;"),
      "Up migration must be transactional (BEGIN ... COMMIT)"
    );
    assert.ok(
      downSql.includes("BEGIN;") && downSql.includes("COMMIT;"),
      "Down migration must be transactional (BEGIN ... COMMIT)"
    );
  });

  it("2. verifies schema remediations: stock_audit_items.business_id, support_impersonation_sessions, and retired_slugs", () => {
    const upSql = fs.readFileSync(upMigrationPath, "utf8");

    // SEC-06: stock_audit_items.business_id
    assert.ok(
      upSql.includes("ALTER TABLE public.stock_audit_items") &&
        upSql.includes(
          "ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id)"
        ),
      "Migration must add business_id column to stock_audit_items"
    );

    // SEC-09: support_impersonation_sessions with 30-min TTL constraint
    assert.ok(
      upSql.includes(
        "CREATE TABLE IF NOT EXISTS public.support_impersonation_sessions"
      ),
      "Migration must create support_impersonation_sessions table"
    );
    assert.ok(
      upSql.includes("INTERVAL '30 minutes'"),
      "support_impersonation_sessions must enforce a 30-minute maximum TTL constraint"
    );

    // SEC-12: retired_slugs + slug governance trigger
    assert.ok(
      upSql.includes("CREATE TABLE IF NOT EXISTS public.retired_slugs"),
      "Migration must create retired_slugs table"
    );
    assert.ok(
      upSql.includes("CREATE TRIGGER trg_enforce_business_slug_governance"),
      "Migration must attach trg_enforce_business_slug_governance trigger to public.businesses"
    );

    // SEC-11: profile security invariant trigger
    assert.ok(
      upSql.includes("CREATE TRIGGER trg_enforce_profile_security_invariants"),
      "Migration must attach trg_enforce_profile_security_invariants trigger to public.profiles"
    );
  });

  it("3. verifies all SECURITY DEFINER functions pin `SET search_path = ''` and enforce caller checks (SEC-01, SEC-02)", () => {
    const upSql = fs.readFileSync(upMigrationPath, "utf8");
    const uncommentedSql = upSql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");

    // Count SECURITY DEFINER occurrences vs SET search_path = '' in executable SQL
    const secDefMatches = uncommentedSql.match(/SECURITY\s+DEFINER/gi) || [];
    const emptySearchPathMatches =
      uncommentedSql.match(/SET\s+search_path\s*=\s*''/gi) || [];

    assert.ok(
      secDefMatches.length >= 7,
      `Expected at least 7 SECURITY DEFINER functions, found ${secDefMatches.length}`
    );
    assert.equal(
      secDefMatches.length,
      emptySearchPathMatches.length,
      "Every SECURITY DEFINER function in the Phase 2 migration must pin SET search_path = ''"
    );

    // SEC-01: get_platform_business_metrics authorization & grant restriction
    assert.ok(
      upSql.includes(
        "FORBIDDEN: Platform business metrics require Super Admin privileges."
      ),
      "get_platform_business_metrics() must verify Super Admin or service_role inside function body"
    );
    assert.ok(
      upSql.includes(
        "REVOKE ALL ON FUNCTION public.get_platform_business_metrics() FROM PUBLIC, anon, authenticated;"
      ),
      "get_platform_business_metrics() must revoke EXECUTE from PUBLIC, anon, and authenticated"
    );

    // SEC-02: adjust_pos_stock_atomic tenant boundary verification
    assert.ok(
      upSql.includes(
        "TENANT_ISOLATION_VIOLATION: Caller cannot adjust stock for foreign business"
      ),
      "adjust_pos_stock_atomic() must verify p_business_id matches get_current_business_id()"
    );
    assert.ok(
      upSql.includes(
        "REVOKE ALL ON FUNCTION public.adjust_pos_stock_atomic(UUID, JSONB, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;"
      ),
      "adjust_pos_stock_atomic() must revoke EXECUTE from PUBLIC and anon"
    );
  });

  it("4. verifies dynamic eradication of legacy permissive policies and creation of operation-specific policies across all tenant tables (SEC-06, SEC-07, SEC-09, SEC-10)", () => {
    const upSql = fs.readFileSync(upMigrationPath, "utf8");

    // Must dynamically drop all existing policies in public schema
    assert.ok(
      upSql.includes("FROM pg_catalog.pg_policies") &&
        upSql.includes("DROP POLICY IF EXISTS %I ON %I.%I"),
      "Migration must dynamically drop all legacy policies in public schema"
    );

    // Zero USING (true) or hardcoded admin@seyalpro.com
    const uncommentedLines = upSql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    assert.equal(
      /USING\s*\(\s*true\s*\)/i.test(uncommentedLines),
      false,
      "Phase 2 migration must contain zero USING (true) permissive policies"
    );
    assert.equal(
      uncommentedLines.includes("admin@seyalpro.com"),
      false,
      "Phase 2 migration must contain zero hardcoded admin@seyalpro.com email checks"
    );

    // Verify all 38 operational + HR/financial tables are covered
    const requiredTenantTables = [
      "categories",
      "products",
      "product_stocks",
      "orders",
      "order_items",
      "daily_sales",
      "pos_stock_idempotency",
      "daily_expenses",
      "expense_price_list",
      "monthly_expenses",
      "invoices",
      "timesheets",
      "leaves",
      "salary_entries",
      "salary_settlements",
      "inventory_items",
      "item_recipes",
      "suppliers",
      "purchase_orders",
      "purchase_order_items",
      "stock_ledger",
      "waste_logs",
      "stock_audits",
      "stock_audit_items",
      "employee_increments",
      "employee_achievements",
      "employee_notices",
      "b2b_clients",
      "b2b_products",
      "b2b_dispatches",
      "b2b_payments",
      "b2b_expenses",
      "external_contacts",
      "notifications",
      "support_tickets",
      "data_import_jobs",
      "data_import_files",
      "data_import_mappings",
      "data_import_staging",
      "data_import_errors",
      "data_import_logs",
    ];

    for (const tbl of requiredTenantTables) {
      assert.ok(
        uncommentedLines.includes(tbl),
        `Expected tenant table '${tbl}' to be explicitly included in Phase 2 RLS policies`
      );
    }

    // Verify operation-specific policy templates (FOR SELECT, FOR INSERT, FOR UPDATE, FOR DELETE)
    assert.ok(
      uncommentedLines.includes("FOR SELECT TO authenticated"),
      "Must define explicit FOR SELECT policies"
    );
    assert.ok(
      uncommentedLines.includes("FOR INSERT TO authenticated"),
      "Must define explicit FOR INSERT policies"
    );
    assert.ok(
      uncommentedLines.includes("FOR UPDATE TO authenticated"),
      "Must define explicit FOR UPDATE policies"
    );
    assert.ok(
      uncommentedLines.includes("FOR DELETE TO authenticated"),
      "Must define explicit FOR DELETE policies"
    );
  });

  it("5. verifies least-privilege SQL grants and private Storage bucket policies (SEC-07, SEC-13)", () => {
    const upSql = fs.readFileSync(upMigrationPath, "utf8");

    assert.ok(
      upSql.includes(
        "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;"
      ),
      "Must revoke all table grants from PUBLIC and anon"
    );
    assert.ok(
      upSql.includes(
        "REVOKE INSERT, UPDATE, DELETE ON public.businesses FROM authenticated;"
      ) && upSql.includes("GRANT UPDATE ("),
      "Must restrict UPDATE on public.businesses to safe profile columns only"
    );
    assert.ok(
      upSql.includes("REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;"),
      "Must make audit_logs append-only for authenticated users"
    );
    assert.ok(
      upSql.includes("VALUES ('payslips', 'payslips', false)") &&
        upSql.includes("(storage.foldername(name))[1] = (public.get_current_business_id())::text"),
      "Must configure payslips bucket as private and scope storage.objects by business_id folder"
    );
  });
});
