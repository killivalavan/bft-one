import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Offline Queue & Synchronization Engine Suite", () => {
  const TABLE_PRIORITY = {
    external_contacts: 10,
    customers: 10,
    suppliers: 15,
    categories: 20,
    products: 25,
    inventory_items: 30,
    item_recipes: 35,
    purchase_orders: 40,
    purchase_order_items: 45,
    orders: 50,
    order_items: 55,
    stock_ledger: 60,
    product_stocks: 65,
    daily_expenses: 70,
    monthly_expenses: 75,
    timesheets: 80,
    leaves: 85,
    invoices: 90,
  };

  function sortQueueItems(items) {
    return [...items].sort((a, b) => {
      const prioA = TABLE_PRIORITY[a.table_name] || 100;
      const prioB = TABLE_PRIORITY[b.table_name] || 100;
      if (prioA !== prioB) return prioA - prioB;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  function filterEligibleOps(allOps, activeTenantId) {
    return allOps.filter(
      (o) =>
        o.business_id === activeTenantId &&
        (o.status === "pending" || o.status === "failed") &&
        (o.retry_count || 0) < 5
    );
  }

  function quarantineInvalidOps(allOps) {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return allOps.map((op) => {
      if ((!op.business_id || op.business_id === "default" || !UUID_REGEX.test(op.business_id)) && op.status !== "rejected") {
        return {
          ...op,
          status: "rejected",
          last_error: "Quarantined: Mutation has no valid tenant business ID.",
        };
      }
      return op;
    });
  }

  describe("Dependency Ordering & Relational Sorting", () => {
    it("sorts master parent tables before dependent transaction tables", () => {
      const queue = [
        { id: "1", table_name: "orders", created_at: "2026-10-31T10:00:00Z" },
        { id: "2", table_name: "products", created_at: "2026-10-31T10:00:00Z" },
        { id: "3", table_name: "categories", created_at: "2026-10-31T10:00:00Z" },
        { id: "4", table_name: "customers", created_at: "2026-10-31T10:00:00Z" },
      ];

      const sorted = sortQueueItems(queue);
      const tableOrder = sorted.map((i) => i.table_name);
      assert.deepStrictEqual(tableOrder, ["customers", "categories", "products", "orders"]);
    });

    it("sorts same-table operations chronologically by created_at", () => {
      const queue = [
        { id: "order-3", table_name: "orders", created_at: "2026-10-31T10:30:00Z" },
        { id: "order-1", table_name: "orders", created_at: "2026-10-31T10:10:00Z" },
        { id: "order-2", table_name: "orders", created_at: "2026-10-31T10:20:00Z" },
      ];

      const sorted = sortQueueItems(queue);
      assert.deepStrictEqual(
        sorted.map((i) => i.id),
        ["order-1", "order-2", "order-3"]
      );
    });
  });

  describe("Multi-Tenant Session Isolation & Quarantining (TEN-01)", () => {
    const TENANT_A = "11111111-1111-1111-1111-111111111111";
    const TENANT_B = "22222222-2222-2222-2222-222222222222";

    it("strictly excludes mutations belonging to other tenants", () => {
      const queue = [
        { id: "op-a1", business_id: TENANT_A, table_name: "orders", status: "pending", retry_count: 0 },
        { id: "op-b1", business_id: TENANT_B, table_name: "orders", status: "pending", retry_count: 0 },
        { id: "op-a2", business_id: TENANT_A, table_name: "orders", status: "failed", retry_count: 1 },
      ];

      const eligibleForA = filterEligibleOps(queue, TENANT_A);
      assert.strictEqual(eligibleForA.length, 2);
      assert.deepStrictEqual(
        eligibleForA.map((o) => o.id),
        ["op-a1", "op-a2"]
      );
      assert.ok(!eligibleForA.some((o) => o.business_id === TENANT_B));
    });

    it("quarantines operations with missing, default, or unassigned business_id", () => {
      const queue = [
        { id: "op-valid", business_id: TENANT_A, status: "pending" },
        { id: "op-default", business_id: "default", status: "pending" },
        { id: "op-empty", business_id: "", status: "pending" },
        { id: "op-null", business_id: null, status: "pending" },
      ];

      const quarantined = quarantineInvalidOps(queue);
      assert.strictEqual(quarantined.find((o) => o.id === "op-valid").status, "pending");
      assert.strictEqual(quarantined.find((o) => o.id === "op-default").status, "rejected");
      assert.strictEqual(quarantined.find((o) => o.id === "op-empty").status, "rejected");
      assert.strictEqual(quarantined.find((o) => o.id === "op-null").status, "rejected");
    });
  });

  describe("Dead-Letter Queue (DLQ) & Retry Cap", () => {
    const TENANT_A = "11111111-1111-1111-1111-111111111111";

    it("stops replaying operations that exceeded retry limit (>= 5 retries)", () => {
      const queue = [
        { id: "op-normal", business_id: TENANT_A, status: "failed", retry_count: 4 },
        { id: "op-dead", business_id: TENANT_A, status: "failed", retry_count: 5 },
        { id: "op-dead2", business_id: TENANT_A, status: "failed", retry_count: 8 },
      ];

      const eligible = filterEligibleOps(queue, TENANT_A);
      assert.strictEqual(eligible.length, 1);
      assert.strictEqual(eligible[0].id, "op-normal");
    });
  });
});

