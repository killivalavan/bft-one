import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePasswordPolicy } from "../../lib/utils/passwordPolicy.ts";

describe("Security Policies Suite", () => {
  describe("Password Policy & Complexity Engine (validatePasswordPolicy)", () => {
    it("rejects empty or whitespace-only passwords for any role", () => {
      const emptyRes = validatePasswordPolicy("");
      assert.strictEqual(emptyRes.valid, false);
      assert.strictEqual(emptyRes.strength, "weak");
      assert.strictEqual(emptyRes.score, 0);

      const wsRes = validatePasswordPolicy("   ");
      assert.strictEqual(wsRes.valid, false);
    });

    it("enforces Super Admin strict complexity (>=10 chars, upper, lower, digit, special)", () => {
      // Short (<10 chars)
      const shortRes = validatePasswordPolicy("Ab1!cdefg", "super_admin");
      assert.strictEqual(shortRes.valid, false);
      assert.ok(shortRes.errors.some((e) => e.includes("at least 10 characters")));

      // Missing special char
      const noSpecial = validatePasswordPolicy("SuperAdminPass123", "super_admin");
      assert.strictEqual(noSpecial.valid, false);
      assert.ok(noSpecial.errors.some((e) => e.includes("special character")));

      // Missing digit
      const noDigit = validatePasswordPolicy("SuperAdminPass!@#", "super_admin");
      assert.strictEqual(noDigit.valid, false);
      assert.ok(noDigit.errors.some((e) => e.includes("number")));

      // Valid Super Admin password
      const validAdmin = validatePasswordPolicy("SeyalPro#2026Secure", "super_admin");
      assert.strictEqual(validAdmin.valid, true);
      assert.strictEqual(validAdmin.errors.length, 0);
      assert.strictEqual(validAdmin.strength, "strong");
      assert.strictEqual(validAdmin.score, 4);
    });

    it("enforces Store Admin complexity (>=8 chars, upper, lower, digit or special)", () => {
      // Short (<8 chars)
      const shortAdmin = validatePasswordPolicy("Admin1!", "admin");
      assert.strictEqual(shortAdmin.valid, false);

      // Valid Store Admin password
      const validStoreAdmin = validatePasswordPolicy("ShopManager99", "admin");
      assert.strictEqual(validStoreAdmin.valid, true);
      assert.strictEqual(validStoreAdmin.errors.length, 0);
    });

    it("permits Staff flexible onboarding passwords (>=6 chars)", () => {
      // Too short (<6 chars)
      const shortStaff = validatePasswordPolicy("pass", "staff");
      assert.strictEqual(shortStaff.valid, false);

      // Valid simple staff PIN/alphanumeric
      const validStaff = validatePasswordPolicy("staff123", "staff");
      assert.strictEqual(validStaff.valid, true);
      assert.strictEqual(validStaff.errors.length, 0);
    });
  });

  describe("Partner Directory Search Filtering Logic", () => {
    function filterPartnerStores(businesses, callerBusinessId, query = "") {
      let partnerStores = (businesses || []).filter((b) => b.id !== callerBusinessId);
      const cleanQuery = query.trim().toLowerCase();

      if (cleanQuery) {
        partnerStores = partnerStores.filter((b) => {
          const nameMatch = (b.name || "").toLowerCase().includes(cleanQuery);
          const slugMatch = (b.slug || "").toLowerCase().includes(cleanQuery);
          const cleanQueryPhone = cleanQuery.replace(/\D/g, "");
          const cleanStorePhone = (b.phone || "").replace(/\D/g, "");
          const phoneMatch = cleanQueryPhone.length >= 4 && cleanStorePhone.includes(cleanQueryPhone);
          return nameMatch || slugMatch || phoneMatch;
        });
      }

      return partnerStores;
    }

    const mockStores = [
      { id: "store-caller", name: "Central Bakehouse", slug: "central-bake", phone: "9876543210" },
      { id: "store-partner-1", name: "Killi Club Cafe", slug: "killi-club", phone: "9123456780" },
      { id: "store-partner-2", name: "Chai Express", slug: "chai-express", phone: "9988776655" },
    ];

    it("strictly excludes the caller's own business from directory results", () => {
      const results = filterPartnerStores(mockStores, "store-caller", "");
      assert.strictEqual(results.length, 2);
      assert.ok(!results.some((r) => r.id === "store-caller"));
    });

    it("matches stores by name substring", () => {
      const results = filterPartnerStores(mockStores, "store-caller", "killi");
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, "store-partner-1");
    });

    it("matches stores by slug", () => {
      const results = filterPartnerStores(mockStores, "store-caller", "chai-express");
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, "store-partner-2");
    });

    it("matches stores by phone number substring with 4+ digits", () => {
      const results = filterPartnerStores(mockStores, "store-caller", "9123");
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].name, "Killi Club Cafe");
    });
  });
});

