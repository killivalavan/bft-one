/**
 * SeyalPro Smart Import – Automated Unit, Financial Integrity & Tenant Isolation Suite
 *
 * Verifies:
 * 1. CSV & multi-sheet XLSX parsing, decorative banner header skipping, and formula injection sanitization
 * 2. Flexible Indian/ISO/Excel serial date & currency normalization
 * 3. Sheet classification & cross-sheet relationship detection
 * 4. Semantic column mapping & tenant-column injection defense
 * 5. Multi-row invoice grouping, financial math reconciliation, missing cost flagging, and duplicate strategies
 * 6. Strict per-store Supabase record ID isolation (makeTenantRecordId)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeCellValue,
  parseUploadedFile,
  createXlsxBytesFromSheets,
} from "../../lib/smart-import/fileParser.ts";

import { analyzeWorkbooks } from "../../lib/smart-import/sheetAnalyzer.ts";
import { generateDeterministicSheetMapping } from "../../lib/smart-import/aiMapper.ts";
import {
  normalizeFlexibleDate,
  parseCurrencyNumber,
  makeTenantRecordId,
  runValidationAndStaging,
} from "../../lib/smart-import/validationEngine.ts";

describe("SeyalPro Smart Import Suite", () => {
  describe("1. Formula Injection Defense & Cell Sanitization", () => {
    it("neutralizes spreadsheet DDE/formula payloads while preserving negative numbers", () => {
      assert.equal(sanitizeCellValue("=CMD|' /C calc'!A0"), "CMD|' /C calc'!A0");
      assert.equal(sanitizeCellValue("+SUM(A1:A10)"), "SUM(A1:A10)");
      assert.equal(sanitizeCellValue("@HYPERLINK(\"http://evil.tld\")"), "HYPERLINK(\"http://evil.tld\")");
      assert.equal(sanitizeCellValue("-450.50"), "-450.50");
      assert.equal(sanitizeCellValue("  Chai Galli Cafe  "), "Chai Galli Cafe");
    });
  });

  describe("2. CSV & Multi-Sheet XLSX Parsing & Header Detection", () => {
    it("skips decorative title rows and detects the real header row in CSV files", async () => {
      const csv = [
        "SRI KRISHNA ENTERPRISES - ANNUAL BILLING REGISTER,,,",
        "Generated on 01/11/2026,,,",
        "Invoice No,Client Name,Bill Date,Grand Amt,Received,Pending",
        "INV-1001,roma cafe,15/10/2026,\"₹ 4,500.00\",\"2,000\",2500",
        "INV-1002,chai galli,16-10-2026,1800,1800,0",
      ].join("\n");

      const bytes = new TextEncoder().encode(csv);
      const wb = await parseUploadedFile("Sales_Register.csv", bytes.byteLength, bytes);
      const sheet = wb.sheets[0];
      assert.equal(sheet.headerRowIndex, 3);
      assert.deepEqual(sheet.headers, [
        "Invoice No",
        "Client Name",
        "Bill Date",
        "Grand Amt",
        "Received",
        "Pending",
      ]);
      assert.equal(sheet.rows.length, 2);
      assert.equal(sheet.rows[0]["Client Name"], "roma cafe");
      assert.equal(sheet.rows[0]["Grand Amt"], "₹ 4,500.00");
    });

    it("parses multi-sheet .xlsx workbooks losslessly", async () => {
      const bytes = createXlsxBytesFromSheets([
        {
          name: "Invoices",
          rows: [
            ["Ref ID", "Buyer", "Bill Date", "Item Name", "Qty", "Rate", "Total Value", "Paid Amount", "Due"],
            ["INV-901", "Madras Coffee House", "2026-10-12", "Filter Coffee Powder 1kg", 10, 450, 4500, 3000, 1500],
          ],
        },
        {
          name: "Products",
          rows: [
            ["Product Name", "Category", "Selling Price", "Cost Price", "Unit"],
            ["Filter Coffee Powder 1kg", "Beverages", 450, 280, "kg"],
          ],
        },
      ]);

      const wb = await parseUploadedFile("migration.xlsx", bytes.byteLength, bytes);
      assert.equal(wb.sheets.length, 2);
      assert.equal(wb.sheets[0].sheetName, "Invoices");
      assert.equal(wb.sheets[0].rows[0]["Buyer"], "Madras Coffee House");
      assert.equal(wb.sheets[1].sheetName, "Products");
      assert.equal(wb.sheets[1].rows[0]["Cost Price"], "280");
    });
  });

  describe("3. Date & Indian Currency Normalization", () => {
    it("normalizes DD/MM/YYYY, DD-MMM-YYYY, ISO, and Excel serial dates to YYYY-MM-DD", () => {
      assert.equal(normalizeFlexibleDate("15/08/2026").iso, "2026-08-15");
      assert.equal(normalizeFlexibleDate("5-Nov-2026").iso, "2026-11-05");
      assert.equal(normalizeFlexibleDate("2026-11-06").iso, "2026-11-06");
      assert.equal(normalizeFlexibleDate("46000").iso, "2025-12-09");
      assert.equal(normalizeFlexibleDate("not-a-date").isValid, false);
    });

    it("parses Indian comma formatting, currency symbols, and accounting parentheses", () => {
      assert.equal(parseCurrencyNumber("₹ 1,25,450.75").value, 125450.75);
      assert.equal(parseCurrencyNumber("Rs. 4,200/-").value, 4200);
      assert.equal(parseCurrencyNumber("(1,500.00)").value, -1500);
      assert.equal(parseCurrencyNumber("850 Dr").value, 850);
    });
  });

  describe("4. Sheet Analysis, Semantic Mapping & Tenant Spoofing Protection", () => {
    it("maps diverse column synonyms and blocks business_id/tenant_id column injection", async () => {
      const csv = [
        "Buyer,Ref ID,Bill Date,Total Value,Paid Amount,Due,business_id",
        "Blue Tokai Store,BILL-501,10/10/2026,5000,2000,3000,hacked-other-store-id",
        "Third Wave Store,BILL-502,11/10/2026,3200,3200,0,hacked-other-store-id",
      ].join("\n");

      const bytes = new TextEncoder().encode(csv);
      const wb = await parseUploadedFile("client_bills.csv", bytes.byteLength, bytes);
      const sheets = analyzeWorkbooks([wb]);
      assert.equal(sheets.length, 1);
      assert.equal(sheets[0].detectedEntity, "invoices");

      const mappingConfig = generateDeterministicSheetMapping(sheets[0]);
      const colMap = Object.fromEntries(mappingConfig.mappings.map((m) => [m.sourceColumn, m]));

      assert.equal(colMap["Buyer"].targetField, "customer_name");
      assert.equal(colMap["Ref ID"].targetField, "invoice_number");
      assert.equal(colMap["Bill Date"].targetField, "date");
      assert.equal(colMap["Total Value"].targetField, "total_amount");
      assert.equal(colMap["Paid Amount"].targetField, "paid_amount");
      assert.equal(colMap["Due"].targetField, "balance_due");

      // Security invariant: business_id column in spreadsheet MUST be ignored
      assert.equal(colMap["business_id"].targetField, "__ignore__");
    });

    it("classifies an 'Invoice_Items' sheet as line items, not invoices", async () => {
      const bytes = createXlsxBytesFromSheets([
        {
          name: "Invoice_Items",
          rows: [
            ["Invoice No", "Item Name", "Qty", "Rate", "Amount"],
            ["INV-1", "Honey", 2, 500, 1000],
          ],
        },
      ]);
      const wb = await parseUploadedFile("items.xlsx", bytes.byteLength, bytes);
      const sheets = analyzeWorkbooks([wb]);
      assert.equal(sheets[0].detectedEntity, "invoice_items");
      const cfg = generateDeterministicSheetMapping(sheets[0]);
      assert.deepEqual(cfg.missingRequiredFields, []);
    });
  });

  describe("5. Multi-Row Invoice Grouping, Math Discrepancies & Missing Cost Flagging", () => {
    it("groups multi-line invoices, flags balance math discrepancies, and flags unverified product costs", async () => {
      const csv = [
        "Invoice No,Client,Bill Date,Item Name,Qty,Rate,Grand Amt,Received,Pending",
        "INV-700,Green Mart,20/10/2026,Organic Honey,2,500,1500,1000,500",
        "INV-700,Green Mart,20/10/2026,Almond Butter,1,500,1500,1000,500",
        "INV-701,Fresh Basket,21/10/2026,Cold Pressed Oil,2,400,800,300,100",
      ].join("\n");

      const bytes = new TextEncoder().encode(csv);
      const wb = await parseUploadedFile("october_sales.csv", bytes.byteLength, bytes);
      const sheets = analyzeWorkbooks([wb]);
      const mappingConfig = generateDeterministicSheetMapping(sheets[0]);

      const result = runValidationAndStaging([wb], [mappingConfig]);
      assert.equal(result.stagedRecords.length, 2);

      // INV-700 has 2 grouped items totaling 1500 (2*500 + 1*500)
      const inv700 = result.stagedRecords.find((r) => r.normalized.invoice_number === "INV-700");
      assert.ok(inv700);
      assert.equal(inv700.normalized.items.length, 2);
      assert.equal(inv700.normalized.total_amount, 1500);
      assert.ok(inv700.issues.some((i) => i.code === "MISSING_COST_DATA"));

      // INV-701 has Total=800, Paid=300, but Pending=100 (discrepancy: 800 - 300 = 500 != 100)
      const inv701 = result.stagedRecords.find((r) => r.normalized.invoice_number === "INV-701");
      assert.ok(inv701);
      assert.ok(inv701.issues.some((i) => i.code === "BALANCE_MISMATCH"));
    });

    it("detects existing store duplicates and respects duplicate handling strategies", async () => {
      const csv = [
        "Invoice No,Client,Bill Date,Grand Amt,Received,Pending",
        "INV-EXISTING-1,Metro Store,22/10/2026,2400,2400,0",
      ].join("\n");

      const bytes = new TextEncoder().encode(csv);
      const wb = await parseUploadedFile("dup_check.csv", bytes.byteLength, bytes);
      const sheets = analyzeWorkbooks([wb]);
      const mappingConfig = generateDeterministicSheetMapping(sheets[0]);

      const existingStoreData = {
        invoices: [{ id: "existing-inv-id", invoice_number: "INV-EXISTING-1", customer_name: "Metro Store" }],
      };

      // Default strategy 'skip' excludes the duplicate from import
      const skippedResult = runValidationAndStaging([wb], [mappingConfig], existingStoreData, "skip");
      assert.equal(skippedResult.summary.duplicateCount, 1);
      assert.equal(skippedResult.stagedRecords[0].action, "skip");

      // Strategy 'merge' sets action to 'merge'
      const mergedResult = runValidationAndStaging([wb], [mappingConfig], existingStoreData, "merge");
      assert.equal(mergedResult.stagedRecords[0].action, "merge");
      assert.equal(mergedResult.stagedRecords[0].duplicateStatus, "existing_duplicate");
    });
  });

  describe("6. Multi-Store Tenant Isolation Guarantees", () => {
    it("generates strictly isolated primary keys per business_id for identical spreadsheets", () => {
      const idStoreA = makeTenantRecordId("store-alpha-111111", "invoices", "INV-1001");
      const idStoreB = makeTenantRecordId("store-beta-222222", "invoices", "INV-1001");

      assert.notEqual(idStoreA, idStoreB);
      assert.ok(idStoreA.startsWith("si_storealpha_invo_"));
      assert.ok(idStoreB.startsWith("si_storebeta2_invo_"));

      // Deterministic within the same store
      const idStoreARepeat = makeTenantRecordId("store-alpha-111111", "invoices", "INV-1001");
      assert.equal(idStoreA, idStoreARepeat);
    });
  });
});
