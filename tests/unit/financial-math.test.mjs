import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Financial & POS Math Suite", () => {
  describe("POS Cart Arithmetic (totalCents & precision)", () => {
    function totalCents(items) {
      return Object.values(items).reduce((sum, i) => sum + i.price_cents * i.qty, 0);
    }

    function calculateCartTotals(items, discountPct = 0, taxRatePct = 5) {
      const subtotalCents = totalCents(items);
      const discountCents = Math.round(subtotalCents * (discountPct / 100));
      const taxableCents = Math.max(0, subtotalCents - discountCents);
      const taxCents = Math.round(taxableCents * (taxRatePct / 100));
      const grandTotalCents = taxableCents + taxCents;

      return {
        subtotalCents,
        discountCents,
        taxableCents,
        taxCents,
        grandTotalCents,
        grandTotalRupees: grandTotalCents / 100,
      };
    }

    it("calculates empty cart subtotal as 0", () => {
      assert.strictEqual(totalCents({}), 0);
    });

    it("calculates multiple items correctly in integer cents without float drift", () => {
      const items = {
        "p-1": { product_id: "p-1", name: "Masala Chai", price_cents: 1500, qty: 3 }, // 4500
        "p-2": { product_id: "p-2", name: "Samosa", price_cents: 2000, qty: 2 },     // 4000
        "p-3": { product_id: "p-3", name: "Bun Butter Jam", price_cents: 4500, qty: 1 } // 4500
      };
      assert.strictEqual(totalCents(items), 13000);
    });

    it("computes 5% GST and rounding accurately", () => {
      const items = {
        "p-1": { product_id: "p-1", name: "Beverage", price_cents: 1050, qty: 3 } // 3150 cents = ₹31.50
      };
      const totals = calculateCartTotals(items, 0, 5);
      // 5% of 3150 is 157.5, rounds to 158 cents (₹1.58)
      assert.strictEqual(totals.subtotalCents, 3150);
      assert.strictEqual(totals.taxCents, 158);
      assert.strictEqual(totals.grandTotalCents, 3308);
      assert.strictEqual(totals.grandTotalRupees, 33.08);
    });

    it("handles discounts correctly before applying tax", () => {
      const items = {
        "p-1": { product_id: "p-1", name: "Party Order", price_cents: 100000, qty: 1 } // ₹1,000
      };
      // 10% discount: ₹100 discount, ₹900 taxable, 5% GST = ₹45
      const totals = calculateCartTotals(items, 10, 5);
      assert.strictEqual(totals.discountCents, 10000);
      assert.strictEqual(totals.taxableCents, 90000);
      assert.strictEqual(totals.taxCents, 4500);
      assert.strictEqual(totals.grandTotalCents, 94500);
    });
  });

  describe("B2B Wholesale Ledger & Balance Arithmetic", () => {
    function reconcileLedger(slips) {
      let totalBilled = 0;
      let totalCredits = 0;
      let totalPaid = 0;

      for (const slip of slips) {
        const total = Number(slip.total_amount || slip.totalAmount || 0);
        const paid = Number(slip.paid_amount || slip.paidAmount || 0);

        if (total < 0 || String(slip.slip_number || "").startsWith("RET-") || slip.isReturn) {
          totalCredits += Math.abs(total);
        } else {
          totalBilled += total;
        }
        totalPaid += paid;
      }

      const netDeliveries = totalBilled - totalCredits;
      const outstandingBalance = Math.max(0, netDeliveries - totalPaid);

      return {
        totalBilled,
        totalCredits,
        netDeliveries,
        totalPaid,
        outstandingBalance,
      };
    }

    it("properly credits return slips (RET-*) against client outstanding dues", () => {
      const slips = [
        { id: "s-1", slip_number: "DISP-101", total_amount: 5000, paid_amount: 0 },
        { id: "s-2", slip_number: "DISP-102", total_amount: 3000, paid_amount: 0 },
        { id: "s-3", slip_number: "RET-101", total_amount: -500, paid_amount: 0, isReturn: true },
      ];

      const ledger = reconcileLedger(slips);
      assert.strictEqual(ledger.totalBilled, 8000);
      assert.strictEqual(ledger.totalCredits, 500);
      assert.strictEqual(ledger.netDeliveries, 7500);
      assert.strictEqual(ledger.outstandingBalance, 7500);
    });

    it("correctly calculates balance due after partial payment allocations", () => {
      const slips = [
        { id: "s-1", slip_number: "DISP-101", total_amount: 5000, paid_amount: 5000 },
        { id: "s-2", slip_number: "DISP-102", total_amount: 4000, paid_amount: 2500 },
      ];

      const ledger = reconcileLedger(slips);
      assert.strictEqual(ledger.totalBilled, 9000);
      assert.strictEqual(ledger.totalPaid, 7500);
      assert.strictEqual(ledger.outstandingBalance, 1500);
    });
  });

  describe("Staff Salary Calculations (Base + Fixed + Allowances - Deductions)", () => {
    function computeNetSalary(baseCents, fixedAllowanceCents, entries) {
      let additions = 0;
      let deductions = 0;

      for (const e of entries) {
        const amt = Number(e.amount_cents) || 0;
        if (["allowance", "bonus", "addition"].includes(e.kind)) {
          additions += amt;
        } else {
          deductions += amt;
        }
      }

      const netCents = Math.max(0, (baseCents || 0) + (fixedAllowanceCents || 0) + additions - deductions);
      return {
        baseCents,
        fixedAllowanceCents,
        additionsCents: additions,
        deductionsCents: deductions,
        netCents,
        netRupees: netCents / 100,
      };
    }

    it("computes net salary with bonuses and advance deductions", () => {
      const base = 2500000; // ₹25,000
      const fixed = 200000; // ₹2,000
      const entries = [
        { id: "1", amount_cents: 300000, kind: "bonus" },     // + ₹3,000
        { id: "2", amount_cents: 500000, kind: "deduction" }, // - ₹5,000 (advance)
      ];

      const salary = computeNetSalary(base, fixed, entries);
      assert.strictEqual(salary.additionsCents, 300000);
      assert.strictEqual(salary.deductionsCents, 500000);
      assert.strictEqual(salary.netCents, 2500000); // 25000 + 2000 + 3000 - 5000 = 25000
      assert.strictEqual(salary.netRupees, 25000);
    });

    it("safely floors net salary at zero to prevent negative balances", () => {
      const base = 500000; // ₹5,000
      const fixed = 0;
      const entries = [{ id: "1", amount_cents: 800000, kind: "deduction" }]; // - ₹8,000

      const salary = computeNetSalary(base, fixed, entries);
      assert.strictEqual(salary.netCents, 0);
      assert.strictEqual(salary.netRupees, 0);
    });
  });
});

