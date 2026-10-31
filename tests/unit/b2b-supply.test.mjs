/**
 * B2B Supply & Wholesale Automation Test Suite
 * 
 * Verifies:
 * 1. Dispatch record normalization, balance arithmetic, and return slip detection (normalizeDispatch)
 * 2. WhatsApp dispatch slip formatting, itemized billing, and phone sanitization (b2bSlipWhatsapp)
 * 3. Store reorder cadence and activity classification (analyzeStoreReorderActivity)
 * 4. Typography, acronym preservation, and store sanitization (bakerUtils)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDispatch,
  formatContactNumber,
  formatSlipDisplayDate,
  generateWhatsAppSlipMessage,
} from "../../lib/utils/b2bSlipWhatsapp.ts";

import {
  formatCafeName,
  capitalizeWords,
  sanitizeBakerStores,
  getSlipDate,
} from "../../lib/utils/bakerUtils.ts";

import { analyzeStoreReorderActivity } from "../../lib/utils/b2bStoreActivity.ts";

describe("B2B Supply & Wholesale Suite", () => {
  describe("Dispatch Normalization & Return Detection", () => {
    it("normalizes standard delivery dispatches with accurate balance and status", () => {
      const raw = {
        id: "disp-101",
        invoiceNumber: "SLIP-8801",
        customerName: "Chai Galli Cafe",
        customerPhone: "9876543210",
        totalAmount: 4500,
        paidAmount: 2000,
        items: [{ name: "Sourdough Bread", qty: 10, rate: 250, amount: 2500 }],
      };

      const normalized = normalizeDispatch(raw);

      assert.equal(normalized.id, "disp-101");
      assert.equal(normalized.invoiceNumber, "SLIP-8801");
      assert.equal(normalized.slip_number, "SLIP-8801");
      assert.equal(normalized.customerName, "Chai Galli Cafe");
      assert.equal(normalized.totalAmount, 4500);
      assert.equal(normalized.paidAmount, 2000);
      assert.equal(normalized.balanceDue, 2500);
      assert.equal(normalized.balance_due, 2500);
      assert.equal(normalized.status, "unpaid");
      assert.equal(normalized.isReturn, false);
      assert.equal(normalized.title, "DELIVERY SLIP");
    });

    it("marks dispatch as paid when balanceDue reaches zero", () => {
      const raw = {
        id: "disp-102",
        slip_number: "SLIP-8802",
        total_amount: 3200,
        paid_amount: 3200,
      };

      const normalized = normalizeDispatch(raw);
      assert.equal(normalized.balanceDue, 0);
      assert.equal(normalized.status, "paid");
    });

    it("classifies return slips correctly via RET- prefix", () => {
      const raw = {
        id: "ret-201",
        invoiceNumber: "RET-9001",
        customerName: "The Corner Roast",
        totalAmount: 1200,
        paidAmount: 0,
      };

      const normalized = normalizeDispatch(raw);
      assert.equal(normalized.isReturn, true);
      assert.equal(normalized.title, "RETURN & CREDIT SLIP");
    });

    it("classifies return slips correctly via negative amount or title", () => {
      const negativeRaw = {
        id: "disp-neg-1",
        invoiceNumber: "SLIP-7711",
        totalAmount: -850,
      };
      assert.equal(normalizeDispatch(negativeRaw).isReturn, true);

      const titleRaw = {
        id: "disp-title-1",
        invoiceNumber: "SLIP-7712",
        title: "DAMAGE RETURN SLIP",
        totalAmount: 500,
      };
      assert.equal(normalizeDispatch(titleRaw).isReturn, true);
    });

    it("gracefully handles nullish and missing fields with safe defaults", () => {
      const normalized = normalizeDispatch({});
      assert.equal(normalized.customerName, "Partner Store");
      assert.equal(normalized.client_name, "Partner Store");
      assert.equal(normalized.totalAmount, 0);
      assert.equal(normalized.paidAmount, 0);
      assert.equal(normalized.balanceDue, 0);
      assert.equal(normalized.status, "paid");
      assert.match(normalized.invoiceNumber, /^SLIP-/);
    });
  });

  describe("WhatsApp Dispatch Slip & Communication Formatter", () => {
    it("formats Indian phone numbers consistently to +91 format", () => {
      assert.equal(formatContactNumber("9876543210"), "+91 98765 43210");
      assert.equal(formatContactNumber("919876543210"), "+91 98765 43210");
      assert.equal(formatContactNumber("+91 98765 43210"), "+91 98765 43210");
      assert.equal(formatContactNumber(""), "+91 98765 43210");
    });

    it("formats slip display dates into readable standard format", () => {
      const formatted = formatSlipDisplayDate("2026-10-31");
      assert.match(formatted, /31\s+Oct\s+2026/);
      assert.equal(formatSlipDisplayDate(""), "");
    });

    it("generates an itemized WhatsApp delivery message with direct API URL", () => {
      const slipParams = {
        slip: {
          invoiceNumber: "SLIP-5541",
          date: "2026-10-31",
          customerName: "bft navalur branch",
          customerPhone: "9876543210",
          totalAmount: 3600,
          status: "pending",
          items: [
            { name: "Butter Croissant", qty: 20, rate: 90, amount: 1800 },
            { name: "Almond Tart", qty: 15, rate: 120, amount: 1800 },
          ],
        },
        business: {
          id: "biz-bakery-1",
          name: "BFT Central Bakehouse",
          phone: "+91 91111 22222",
          upi_id: "bakehouse@okaxis",
        },
        isReturn: false,
      };

      const { message, waUrl } = generateWhatsAppSlipMessage(slipParams);

      assert.match(message, /DELIVERY SLIP – BFT Central Bakehouse/i);
      assert.match(message, /BFT Navalur Branch/);
      assert.match(message, /SLIP-5541/);
      assert.match(message, /Butter Croissant/);
      assert.match(message, /20 × Butter Croissant @ ₹90 = ₹1,800/);
      assert.match(message, /Almond Tart/);
      assert.match(message, /₹3,600/);
      assert.match(message, /bakehouse@okaxis/);
      assert.ok(waUrl.startsWith("https://api.whatsapp.com/send?phone=919876543210&text="));
    });

    it("generates a return & credit slip message with deducted amounts", () => {
      const returnParams = {
        slip: {
          invoiceNumber: "RET-2026-08",
          date: "2026-10-31",
          customerName: "Chai Galli",
          customerPhone: "9876543210",
          totalAmount: 800,
          items: [{ name: "Crushed Muffin Box", qty: 4, rate: 200, amount: 800 }],
        },
        business: { name: "BFT Central" },
        isReturn: true,
      };

      const { message } = generateWhatsAppSlipMessage(returnParams);

      assert.match(message, /RETURN & CREDIT SLIP/);
      assert.match(message, /Total Deducted Amount: -₹800/);
      assert.match(message, /Items successfully received & credited/);
    });
  });

  describe("Baker Typography & Store Utilities", () => {
    it("capitalizes words and preserves corporate acronyms", () => {
      assert.equal(formatCafeName("bft mambakkam cafe"), "BFT Mambakkam Cafe");
      assert.equal(formatCafeName("omr ecr express bakery"), "OMR ECR Express Bakery");
      assert.equal(formatCafeName("b2b wholesale supply"), "B2B Wholesale Supply");
      assert.equal(formatCafeName("tea-navalur branch"), "Tea-Navalur Branch");
    });

    it("filters and sanitizes baker store collections", () => {
      const stores = [
        { id: "s1", name: "Chai Galli" },
        null,
        { id: "", name: "Invalid" },
        { id: "s2", name: "   " },
        { id: "s3", name: "The Corner Roast", phone: "+91 99999 88888" },
      ];

      const clean = sanitizeBakerStores(stores);
      assert.equal(clean.length, 2);
      assert.equal(clean[0].id, "s1");
      assert.equal(clean[1].id, "s3");
    });

    it("parses dates flexibly across different timestamp fields", () => {
      const fromCreated = getSlipDate({ createdAt: "2026-10-25T10:00:00.000Z" });
      assert.equal(fromCreated.getUTCFullYear(), 2026);
      assert.equal(fromCreated.getUTCMonth(), 9); // October is 9

      const fromInvoiceDate = getSlipDate({ invoice_date: "2026-11-01" });
      assert.equal(fromInvoiceDate.getFullYear(), 2026);

      const fromDate = getSlipDate({ date: "2026-12-15" });
      assert.equal(fromDate.getFullYear(), 2026);

      const fallback = getSlipDate({});
      assert.ok(fallback instanceof Date && !isNaN(fallback.getTime()));
    });
  });

  describe("Store Reorder Cadence & Activity Analysis", () => {
    it("identifies active stores and inactive stores based on ordering cadence", () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
      const staleDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(); // 35 days ago

      const stores = [
        { id: "store-active", name: "Active Cafe", phone: "9876543210" },
        { id: "store-stale", name: "Inactive Cafe", phone: "9876543211" },
      ];

      const invoices = [
        // Active store ordered 2 days ago and 8 days ago
        {
          clientId: "store-active",
          customerName: "Active Cafe",
          createdAt: recentDate,
          totalAmount: 2000,
          items: [{ qty: 10 }],
        },
        {
          clientId: "store-active",
          customerName: "Active Cafe",
          createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          totalAmount: 2000,
          items: [{ qty: 10 }],
        },
        // Stale store last ordered 35 days ago
        {
          clientId: "store-stale",
          customerName: "Inactive Cafe",
          createdAt: staleDate,
          totalAmount: 1500,
          items: [{ qty: 5 }],
        },
      ];

      const summary = analyzeStoreReorderActivity(invoices, stores);

      assert.equal(summary.totalStoresCount, 2);
      // store-stale hasn't ordered in > 30 days and should be categorized as notOrdering
      assert.ok(summary.notOrdering.some((s) => s.storeId === "store-stale"));
      // store-active should have recent orders
      assert.ok(summary.normal.some((s) => s.storeId === "store-active"));
    });
  });
});
