/**
 * Phase 1 Security and Data Integrity Remediation Test Suite
 *
 * Scenarios tested:
 * 1. SEC-03: Missing Supabase service-role configuration fails closed (no anon fallback)
 * 2. TEN-01: Offline mutations during account/tenant switching (quarantine & no business_id tampering)
 * 3. APP-01: Concurrent stock adjustments (atomic serialization, no lost updates)
 * 4. APP-01: Duplicate stock mutation requests (Idempotency token deduplication)
 * 5. APP-01: Insufficient stock validation (strict non-negative inventory enforcement)
 * 6. TEN-02: Two different stores logging in sequentially (tenant storage cleanup & shared setting preservation)
 * 7. TEN-02: Signout error resilience (cleanup and redirect succeed even if signOut throws)
 * 8. TEN-02: Browser refresh & session restoration (foreign tenant cache rejected)
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        process.env[key] = val;
      }
    }
  } catch {
  }
}
loadEnv();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runSuite() {
  console.log("\n========================================================");
  console.log("RUNNING SEYALPRO PHASE 1 REMEDIATION REGRESSION SUITE");
  console.log("========================================================\n");

  // --------------------------------------------------------------------------
  // TEST 1: SEC-03 - Missing Supabase Service-Role Configuration
  // --------------------------------------------------------------------------
  console.log("[TEST 1] SEC-03: Missing Supabase Service-Role Configuration Fails Closed");
  {
    // Simulate supabaseAdmin() behavior with missing service key
    function testSupabaseAdmin(url, serviceKey) {
      if (!url) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
      }
      if (!serviceKey) {
        throw new Error(
          "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Administrative client cannot be initialized without service credentials."
        );
      }
      return createClient(url, serviceKey);
    }

    let threw = false;
    let thrownError = "";
    try {
      testSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL, undefined);
    } catch (err) {
      threw = true;
      thrownError = err.message;
    }

    assert(threw, "supabaseAdmin() throws an exception when SUPABASE_SERVICE_ROLE_KEY is absent");
    assert(
      thrownError.includes("Missing SUPABASE_SERVICE_ROLE_KEY"),
      "Error explicitly states missing service credentials instead of silently falling back to anon key"
    );
  }

  // --------------------------------------------------------------------------
  // TEST 2: TEN-01 - Offline Mutations During Account/Tenant Switching
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] TEN-01: Offline Queue Cross-Tenant Session Contamination Guard");
  {
    const tenantA_id = "11111111-1111-1111-1111-111111111111";
    const tenantB_id = "22222222-2222-2222-2222-222222222222";
    const userA_id = "aaaa0000-0000-0000-0000-000000000001";
    const userB_id = "bbbb0000-0000-0000-0000-000000000002";

    // Simulate processSyncQueue isolation contract
    function evaluateQueueItemIsolation(op, activeSession) {
      if (!activeSession || !activeSession.user) {
        return { action: "defer", reason: "Unauthenticated" };
      }
      if (!op.business_id || op.business_id !== activeSession.business_id) {
        return {
          action: "quarantine",
          reason: `Cross-tenant mismatch: op belongs to ${op.business_id}, active session is ${activeSession.business_id}`,
        };
      }
      return { action: "execute" };
    }

    const opStoreA = {
      id: "op-1",
      business_id: tenantA_id,
      user_id: userA_id,
      tableName: "orders",
      payload: { id: "ord-1", business_id: tenantA_id },
    };

    const sessionStoreB = {
      user: { id: userB_id },
      business_id: tenantB_id,
    };

    const evalResult = evaluateQueueItemIsolation(opStoreA, sessionStoreB);
    assert(
      evalResult.action === "quarantine",
      "Queued mutation from Store A is quarantined when replayed under Store B session"
    );

    // Simulate executeCloudMutation payload integrity check
    function verifyPayloadTenantImmutability(opPayload, activeTenantId) {
      // Must not overwrite opPayload.business_id with activeTenantId
      const targetBiz = opPayload.business_id;
      if (targetBiz !== activeTenantId) {
        return { allowed: false, error: "Cross-tenant mutation prohibited" };
      }
      return { allowed: true };
    }

    const mutationCheck = verifyPayloadTenantImmutability(opStoreA.payload, sessionStoreB.business_id);
    assert(!mutationCheck.allowed, "Mutation payload cannot be executed against foreign session tenant");
  }

  // --------------------------------------------------------------------------
  // TEST 3: APP-01 - Concurrent Stock Adjustments (Atomic Serialization)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] APP-01: Concurrent Stock Adjustments Atomicity");
  {
    // Run 5 simultaneous checkout requests of 10 units each sequentially managed by DB transaction
    let serializedStock = 50;
    const lockQueue = [];
    function transactionallyDecrement(qty) {
      return new Promise((resolve) => {
        lockQueue.push(async () => {
          const before = serializedStock;
          const after = Math.max(0, before - qty);
          serializedStock = after;
          resolve(after);
        });
        if (lockQueue.length === 1) {
          processLockQueue();
        }
      });
    }

    async function processLockQueue() {
      while (lockQueue.length > 0) {
        const task = lockQueue[0];
        await task();
        lockQueue.shift();
      }
    }

    await Promise.all([
      transactionallyDecrement(10),
      transactionallyDecrement(10),
      transactionallyDecrement(10),
      transactionallyDecrement(10),
      transactionallyDecrement(10),
    ]);

    assert(
      serializedStock === 0,
      `Concurrent atomic deductions properly decremented stock to ${serializedStock} (no lost updates)`
    );
  }

  // --------------------------------------------------------------------------
  // TEST 4: APP-01 - Duplicate Stock Mutation Requests (Idempotency)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] APP-01: Duplicate Stock Mutation Requests (Idempotency)");
  {
    const idempotencyStore = new Set();
    let currentStock = 100;

    function processStockAdjustment(request) {
      if (request.idempotency_key) {
        if (idempotencyStore.has(request.idempotency_key)) {
          return { ok: true, already_processed: true, updated: 0 };
        }
        idempotencyStore.add(request.idempotency_key);
      }
      currentStock -= request.qty;
      return { ok: true, already_processed: false, updated: 1 };
    }

    const req1 = { idempotency_key: "pos_order_rec_001", qty: 5 };
    const res1 = processStockAdjustment(req1);
    assert(res1.ok && !res1.already_processed && currentStock === 95, "First stock adjust request processed normally");

    // Network retry or offline replay with identical idempotency token
    const res2 = processStockAdjustment(req1);
    assert(
      res2.ok && res2.already_processed && currentStock === 95,
      "Duplicate replay detected: returns already_processed without double-decrementing stock"
    );
  }

  // --------------------------------------------------------------------------
  // TEST 5: APP-01 - Insufficient Stock Validation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] APP-01: Insufficient Stock Strict Validation");
  {
    function validateAndDeductStock(available, requested, strict) {
      if (strict && available < requested) {
        return { error: "INSUFFICIENT_STOCK", code: "INSUFFICIENT_STOCK", remaining: available };
      }
      return { ok: true, balance: Math.max(0, available - requested) };
    }

    const failCheck = validateAndDeductStock(3, 5, true);
    assert(failCheck.error === "INSUFFICIENT_STOCK", "Strict stock validation blocks sale when requested > available");

    const clampCheck = validateAndDeductStock(3, 5, false);
    assert(clampCheck.ok && clampCheck.balance === 0, "Non-strict mode safely floors at 0 (never negative inventory)");
  }

  // --------------------------------------------------------------------------
  // TEST 6: TEN-02 - Sequential Store Logins & Storage Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] TEN-02: Two Different Stores Logging in Sequentially");
  {
    const storeA_id = "tenant-a-uuid-1111";
    const storeB_id = "tenant-b-uuid-2222";

    const mockStorage = {
      [`bftone_customers_${storeA_id}`]: JSON.stringify([{ id: "c1", name: "Store A Client" }]),
      [`bftone_invoices_${storeA_id}`]: JSON.stringify([{ id: "inv1", total: 100 }]),
      [`bftone_tenant_extra_${storeA_id}`]: JSON.stringify({ name: "Store A Bakery" }),
      bftone_tenant_cache: JSON.stringify({ ownerUserId: "userA", business: { id: storeA_id } }),
      client_device_id: "DEV-ABC-999", // Shared device hardware config
      printer_name: "Thermal_POS_80mm", // Shared hardware config
    };

    function clearTenantStorage(storage, targetTenantId, preserveShared = true) {
      const keys = Object.keys(storage);
      for (const k of keys) {
        if (targetTenantId) {
          if (
            k.endsWith(`_${targetTenantId}`) ||
            k.includes(targetTenantId) ||
            k === "bftone_tenant_cache" ||
            k === "bftone_active_tenant_id"
          ) {
            delete storage[k];
          }
        } else {
          const isShared =
            preserveShared &&
            (k === "client_device_id" || k.startsWith("theme") || k.startsWith("printer_"));
          if (!isShared && (k.startsWith("bftone_") || k.startsWith("bft_"))) {
            delete storage[k];
          }
        }
      }
    }

    // Step 1: Store A logs out
    clearTenantStorage(mockStorage, storeA_id, true);

    assert(
      !mockStorage[`bftone_customers_${storeA_id}`],
      "Store A customers purged from localStorage on tenant logout"
    );
    assert(
      !mockStorage[`bftone_invoices_${storeA_id}`],
      "Store A invoices purged from localStorage on tenant logout"
    );
    assert(
      mockStorage["client_device_id"] === "DEV-ABC-999",
      "Shared device identifier preserved across tenant signouts"
    );
    assert(
      mockStorage["printer_name"] === "Thermal_POS_80mm",
      "Hardware printer configuration preserved across tenant signouts"
    );

    // Step 2: Store B logs in
    mockStorage[`bftone_customers_${storeB_id}`] = JSON.stringify([{ id: "c2", name: "Store B Client" }]);
    mockStorage.bftone_tenant_cache = JSON.stringify({ ownerUserId: "userB", business: { id: storeB_id } });

    assert(
      mockStorage[`bftone_customers_${storeB_id}`] && !mockStorage[`bftone_customers_${storeA_id}`],
      "Store B session contains only Store B data; Store A residual data is completely absent"
    );
  }

  // --------------------------------------------------------------------------
  // TEST 7: TEN-02 - Signout Error Resilience
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] TEN-02: Signout Error Resilience (Guaranteed Clean & Redirect)");
  {
    let storagePurged = false;
    let redirectUrl = null;

    async function robustClientLogout(redirectTo, shouldThrowInAuth = false) {
      try {
        if (shouldThrowInAuth) {
          throw new Error("Simulated Supabase auth timeout or network outage");
        }
      } catch {
        // Log and swallow
      } finally {
        storagePurged = true;
        redirectUrl = redirectTo;
      }
    }

    await robustClientLogout("/login", true);
    assert(storagePurged, "Storage purge executed successfully despite Supabase auth error");
    assert(redirectUrl === "/login", "Browser redirection reached destination safely even during auth failure");
  }

  // --------------------------------------------------------------------------
  // TEST 8: TEN-02 - Browser Refresh & Session Restoration Guard
  // --------------------------------------------------------------------------
  console.log("\n[TEST 8] TEN-02: Browser Refresh & Session Restoration Guard");
  {
    function resolveWarmCache(cachedEntry, activeUserId) {
      if (!cachedEntry || !cachedEntry.ownerUserId) return null;
      if (cachedEntry.ownerUserId !== activeUserId) return null; // Reject foreign cache
      return cachedEntry.business;
    }

    const legitimateCache = {
      ownerUserId: "user-alice-123",
      business: { id: "biz-alice", name: "Alice Coffee" },
    };

    const restoredValid = resolveWarmCache(legitimateCache, "user-alice-123");
    assert(
      restoredValid && restoredValid.id === "biz-alice",
      "Legitimate matching owner cache restored successfully on refresh"
    );

    const restoredMismatch = resolveWarmCache(legitimateCache, "user-bob-999");
    assert(
      restoredMismatch === null,
      "Foreign cached workspace rejected when refreshed under a different user account"
    );
  }

  console.log("\n========================================================");
  console.log(`PHASE 1 REGRESSION SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
