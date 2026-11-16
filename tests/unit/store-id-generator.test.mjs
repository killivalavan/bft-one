import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  extractStorePrefix,
  generateStoreReferenceId,
  getBusinessStoreId,
  formatEmployeeLoginId,
  formatDobDigits,
  resolveLoginIdentifierToEmail,
  formatDisplayUserIdentifier,
  isValidEmployeeLoginId,
} from "../../lib/utils/storeIdGenerator.ts";

test("extractStorePrefix handles multi-word and single-word store names", () => {
  assert.equal(extractStorePrefix("Brown Fening Tea"), "BFT");
  assert.equal(extractStorePrefix("Chai Kings"), "CK");
  assert.equal(extractStorePrefix("Teawalea"), "TW");
  assert.equal(extractStorePrefix("Chaiwala"), "CW");
  assert.equal(extractStorePrefix("Starbucks"), "STR");
});

test("generateStoreReferenceId generates prefixed 5-digit IDs", () => {
  const bft = generateStoreReferenceId("Brown Fening Tea");
  assert.equal(bft.prefix, "BFT");
  assert.match(bft.storeId, /^BFT\d{5}$/);

  const ck = generateStoreReferenceId("Chai Kings");
  assert.equal(ck.prefix, "CK");
  assert.match(ck.storeId, /^CK\d{5}$/);
});

test("getBusinessStoreId reads persisted store_id or deterministically derives one", () => {
  const persisted = getBusinessStoreId({
    id: "biz-1",
    name: "Chai Kings",
    slug: "chai-kings",
    enabled_modules: { store_id: "CK2342", store_prefix: "CK" },
  });
  assert.equal(persisted.storeId, "CK2342");
  assert.equal(persisted.prefix, "CK");
  assert.equal(persisted.employeePrefix, "ck");

  const legacy1 = getBusinessStoreId({
    id: "a0000000-0000-0000-0000-000000000001",
    name: "Brown Fening Tea",
    slug: "bft-navalur",
  });
  const legacy2 = getBusinessStoreId({
    id: "a0000000-0000-0000-0000-000000000001",
    name: "Brown Fening Tea",
    slug: "bft-navalur",
  });
  assert.equal(legacy1.prefix, "BFT");
  assert.equal(legacy1.storeId, legacy2.storeId);
  assert.match(legacy1.storeId, /^BFT\d{5}$/);
});

test("formatEmployeeLoginId & formatDobDigits format prefixed DOB IDs without double-prefixing", () => {
  assert.equal(formatDobDigits("1997-12-10"), "10121997");
  assert.equal(formatEmployeeLoginId("ck", "10121997"), "ck10121997");
  assert.equal(formatEmployeeLoginId("ck", "ck10121997"), "ck10121997");
  assert.equal(formatEmployeeLoginId("bft", "sathish"), "bftsathish");
  assert.equal(isValidEmployeeLoginId("ck10121997"), true);
  assert.equal(isValidEmployeeLoginId("ck@invalid"), false);
});

test("resolveLoginIdentifierToEmail & formatDisplayUserIdentifier round-trip cleanly", () => {
  assert.equal(
    resolveLoginIdentifierToEmail("ck10121997", "chai-kings"),
    "ck10121997@chai-kings.internal"
  );
  assert.equal(
    resolveLoginIdentifierToEmail("owner@chaikings.com", "chai-kings"),
    "owner@chaikings.com"
  );
  assert.equal(
    formatDisplayUserIdentifier("ck10121997@chai-kings.internal", "ck10121997"),
    "ck10121997"
  );
  assert.equal(
    formatDisplayUserIdentifier("owner@chaikings.com", null),
    "owner@chaikings.com"
  );
});

test("onboarding UI, API, and /api/public/login support Store Admin Mail ID and Store Reference ID login", () => {
  const rootDir = process.cwd();
  const saPage = fs.readFileSync(
    path.join(rootDir, "app", "(protected)", "super-admin", "page.tsx"),
    "utf8"
  );
  const bizApi = fs.readFileSync(
    path.join(rootDir, "app", "api", "super-admin", "businesses", "route.ts"),
    "utf8"
  );
  const loginPage = fs.readFileSync(
    path.join(rootDir, "app", "login", "page.tsx"),
    "utf8"
  );
  const loginApi = fs.readFileSync(
    path.join(rootDir, "app", "api", "public", "login", "route.ts"),
    "utf8"
  );

  // Onboarding UI replaces Contact Email with Store Admin Mail ID *
  assert.match(saPage, /Store Admin Mail ID \*/);
  assert.doesNotMatch(saPage, /Store Admin Contact Email/);
  assert.doesNotMatch(saPage, /Store Admin Email or ID/);

  // Business creation API binds adminLoginId to Store Reference ID and sends storeId/storePrefix to welcome email
  assert.match(bizApi, /adminLoginId = finalStoreId/);
  assert.match(bizApi, /storeId:\s*finalStoreId/);
  assert.match(bizApi, /storePrefix:\s*finalStorePrefix/);

  // Store login uses /api/public/login and supports Store Reference ID, Employee ID, or Mail ID
  assert.match(loginPage, /\/api\/public\/login/);
  assert.match(loginPage, /Store Reference ID, Employee ID, or Mail ID/);
  assert.match(loginApi, /verifySameOriginCsrf\(request\)/);
  assert.match(loginApi, /checkRateLimit\(/);
  assert.match(loginApi, /resolveRequestHostname\(request/);
  assert.match(loginApi, /getBusinessStoreId\(biz\)/);
  assert.match(loginApi, /upperIdentifier === storeId/);
  assert.match(loginApi, /contact_email/);
});
