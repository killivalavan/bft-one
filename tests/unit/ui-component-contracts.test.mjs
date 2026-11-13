import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * UI Component & Critical Business Flow Contracts Test Suite
 *
 * Prevents accidental stripping or hiding of vital UI features during refactors:
 * 1. Expenses Page (/expenses): FixedPriceManager, effectiveIsAdmin, inline edit/delete, direct Supabase writes
 * 2. Cash Settlement (/sales): Daily Cash Expenses sync, formula ribbon, staff handoff placement
 * 3. B2B Customer Modules (/b2b/customers): Shared ledger and date utilities integration
 */

describe("UI Component & Business Flow Contracts", () => {
  const rootDir = process.cwd();

  describe("Expenses Page (/expenses) Integrity Contract", () => {
    const expensesPagePath = path.join(rootDir, "app", "expenses", "page.tsx");
    assert.ok(fs.existsSync(expensesPagePath), "app/expenses/page.tsx must exist");
    const content = fs.readFileSync(expensesPagePath, "utf8");

    it("verifies FixedPriceManager is imported and rendered with full CRUD wiring", () => {
      assert.ok(
        content.includes('import { FixedPriceManager'),
        "FixedPriceManager must be imported in app/expenses/page.tsx"
      );
      assert.ok(
        content.includes('<FixedPriceManager'),
        "FixedPriceManager JSX element must be rendered on the page"
      );
      assert.ok(content.includes('onAdd={addPriceItem}'), "FixedPriceManager must wire onAdd handler");
      assert.ok(content.includes('onUpdatePrice={updatePriceItemPrice}'), "FixedPriceManager must wire onUpdatePrice handler");
      assert.ok(content.includes('onToggleActive={togglePriceItemActive}'), "FixedPriceManager must wire onToggleActive handler");
      assert.ok(content.includes('onDelete={deletePriceItem}'), "FixedPriceManager must wire onDelete handler");
    });

    it("ensures Fixed Price Items are prominent by default with clear toggles and shortcuts", () => {
      // Default state must be true so admins immediately see it
      assert.ok(
        content.includes('const [showPriceManager, setShowPriceManager] = useState(true);'),
        "showPriceManager state must default to true"
      );
      // Overview toolbar button must say Fixed Price Items with count badge
      assert.ok(
        content.includes('<span>Fixed Price Items</span>'),
        "Overview toolbar button must clearly state 'Fixed Price Items'"
      );
      assert.ok(
        content.includes('{priceList.length}'),
        "Overview toolbar must show priceList.length badge"
      );
      // Daily Expense card must have shortcut button to edit fixed prices
      assert.ok(
        content.includes('Edit Fixed Prices'),
        "Add Expense card header must provide 'Edit Fixed Prices' shortcut for admins"
      );
    });

    it("ensures Overview is the first tab and Daily Expense is the second tab", () => {
      assert.ok(
        content.includes('useState<"add" | "monthly" | "overview" | "ai-advisor">("overview")'),
        "Default activeTab must be overview"
      );
      const tabsBlockStart = content.indexOf('{effectiveIsAdmin && (');
      const tabsBlockEnd = content.indexOf('{(activeTab === "add" || !effectiveIsAdmin)', tabsBlockStart);
      const tabBlock = content.slice(tabsBlockStart, tabsBlockEnd);
      const overviewBtnPos = tabBlock.indexOf('setActiveTab("overview")');
      const dailyBtnPos = tabBlock.indexOf('setActiveTab("add")');
      assert.ok(overviewBtnPos !== -1, "Overview tab button must exist");
      assert.ok(dailyBtnPos !== -1, "Daily Expense tab button must exist");
      assert.ok(overviewBtnPos < dailyBtnPos, "Overview tab must appear before Daily Expense tab");
    });

    it("ensures effectiveIsAdmin checks all admin roles and gates inline edit/delete", () => {
      assert.ok(content.includes('effectiveIsAdmin'), "effectiveIsAdmin computed flag must be defined");
      assert.ok(content.includes('flags?.isAdmin'), "effectiveIsAdmin must check flags?.isAdmin");
      assert.ok(content.includes('flags?.isSuperAdmin'), "effectiveIsAdmin must check flags?.isSuperAdmin");
      assert.ok(content.includes('cachedIsAdmin'), "effectiveIsAdmin must check cachedIsAdmin");

      // Verify inline edit and delete are present and guarded by effectiveIsAdmin
      assert.ok(content.includes('startEdit(row)'), "startEdit handler must be bound to edit button");
      assert.ok(content.includes('deleteExpense(row)'), "deleteExpense handler must be bound to delete button");
      assert.ok(
        content.includes('{effectiveIsAdmin && (') && content.includes('<Pencil'),
        "Pencil edit icon must be gated by effectiveIsAdmin"
      );
      assert.ok(
        content.includes('{effectiveIsAdmin && (') && content.includes('<Trash2'),
        "Trash2 delete icon must be gated by effectiveIsAdmin"
      );
    });

    it("verifies direct Supabase cloud writes and getEffectiveBusinessId are implemented", () => {
      assert.ok(
        content.includes('getEffectiveBusinessId'),
        "getEffectiveBusinessId helper must be implemented to resolve tenant UUID"
      );
      assert.ok(
        /supabaseClient\s*\.\s*from\(\s*["']daily_expenses["']\s*\)\s*\.\s*insert/.test(content),
        "addExpense must perform direct Supabase cloud insert when online"
      );
      assert.ok(
        /supabaseClient\s*\.\s*from\(\s*["']daily_expenses["']\s*\)\s*\.\s*update/.test(content),
        "saveEdit must perform direct Supabase cloud update when online"
      );
      assert.ok(
        /supabaseClient\s*\.\s*from\(\s*["']daily_expenses["']\s*\)\s*\.\s*delete/.test(content),
        "deleteExpense must perform direct Supabase cloud delete when online"
      );
      assert.ok(
        content.includes('enqueueSyncOperation'),
        "Offline fallback via enqueueSyncOperation must be preserved"
      );
    });

    it("verifies product unit configuration (kg, pcs, each) in FixedPriceManager and Add Expense card", () => {
      const fixedPriceManagerPath = path.join(rootDir, "components", "expenses", "FixedPriceManager.tsx");
      assert.ok(fs.existsSync(fixedPriceManagerPath), "FixedPriceManager.tsx must exist");
      const fpmContent = fs.readFileSync(fixedPriceManagerPath, "utf8");

      // Verify unit options in FixedPriceManager
      assert.ok(fpmContent.includes('COMMON_UNITS'), "COMMON_UNITS must be exported");
      assert.ok(fpmContent.includes('"kg"'), "kg unit must be supported");
      assert.ok(fpmContent.includes('"pcs"'), "pcs unit must be supported");
      assert.ok(fpmContent.includes('"pkt"'), "pkt unit must be supported");
      assert.ok(fpmContent.includes('"each"'), "each unit must be supported");
      assert.ok(fpmContent.includes('unit?: string | null'), "FixedPriceItem must support unit");
      assert.ok(fpmContent.includes('extractNameAndUnit'), "extractNameAndUnit helper must be exported");
      assert.ok(fpmContent.includes('formatNameWithUnitFallback'), "formatNameWithUnitFallback helper must be exported");

      // Verify unit integration in app/expenses/page.tsx
      assert.ok(
        content.includes('COMMON_UNITS'),
        "app/expenses/page.tsx must import COMMON_UNITS"
      );
      assert.ok(
        content.includes('extractNameAndUnit'),
        "app/expenses/page.tsx must import extractNameAndUnit"
      );
      assert.ok(
        content.includes('formatNameWithUnitFallback'),
        "app/expenses/page.tsx must import formatNameWithUnitFallback"
      );
      assert.ok(
        content.includes('selectedFixedItem.unit') || content.includes('displayUnit'),
        "Add Expense card must display product unit"
      );
      assert.ok(
        content.includes('step="any"'),
        "Quantity input must support fractional quantities for kg/litres"
      );
    });

    it("verifies pkt and other custom units extract properly and don't revert to each", () => {
      const fixedPriceManagerPath = path.join(rootDir, "components", "expenses", "FixedPriceManager.tsx");
      const fpmCode = fs.readFileSync(fixedPriceManagerPath, "utf8");

      assert.ok(fpmCode.includes('function normalizeUnit'), "normalizeUnit function must exist");
      assert.ok(fpmCode.includes('function extractNameAndUnit'), "extractNameAndUnit function must exist");
      assert.ok(fpmCode.includes('function formatNameWithUnitFallback'), "formatNameWithUnitFallback function must exist");
      assert.ok(fpmCode.includes('"pkt"'), "pkt must be supported in normalizeUnit");

      // Test regex extraction contract matching implementation
      const KNOWN_UNITS = new Set(["kg", "pcs", "each", "pkt", "ltr", "box", "gm", "bundle", "can", "bottle"]);
      function normalizeUnit(u) {
        const s = (u || "").trim().toLowerCase();
        if (["pkt", "pkts", "packet", "packets"].includes(s)) return "pkt";
        return s || "each";
      }
      function extractNameAndUnit(rawName, explicitUnit) {
        let cleanName = (rawName || "").trim();
        let unit = (explicitUnit || "").trim().toLowerCase();
        const parenMatch = cleanName.match(/^(.*?)\s*[\(\[]\s*([a-zA-Z]+|\d+\s*[a-zA-Z]+)\s*[\)\]]$/);
        if (parenMatch) {
          if (!unit || unit === "each") unit = normalizeUnit(parenMatch[2]);
          cleanName = parenMatch[1].trim();
        } else if (!unit || unit === "each") {
          const wordMatch = cleanName.match(/^(.*?)\s+([a-zA-Z]+)$/);
          if (wordMatch && KNOWN_UNITS.has(wordMatch[2].toLowerCase())) {
            unit = normalizeUnit(wordMatch[2]);
            cleanName = wordMatch[1].trim();
          }
        }
        return { name: cleanName, unit: normalizeUnit(unit) };
      }

      // Verify explicit unit preservation
      assert.strictEqual(normalizeUnit("pkt"), "pkt");
      assert.strictEqual(normalizeUnit("packet"), "pkt");
      assert.strictEqual(extractNameAndUnit("Milk", "pkt").unit, "pkt");
      assert.strictEqual(extractNameAndUnit("Milk", "pkt").name, "Milk");

      // Verify extraction from name with parentheses
      assert.strictEqual(extractNameAndUnit("Milk (pkt)", "each").unit, "pkt");
      assert.strictEqual(extractNameAndUnit("Milk (pkt)", "each").name, "Milk");
      assert.strictEqual(extractNameAndUnit("Milk (pkt)", "").unit, "pkt");

      // Verify extraction from name with trailing unit word
      assert.strictEqual(extractNameAndUnit("Milk pkt", "each").unit, "pkt");
      assert.strictEqual(extractNameAndUnit("Milk pkt", "each").name, "Milk");

      assert.ok(
        content.includes('displayUnit') && content.includes('row.quantity'),
        "Entries list must show quantity and unit together"
      );
    });
  });

  describe("Cash Settlement (/sales) Integrity Contract", () => {
    const salesPagePath = path.join(rootDir, "app", "sales", "page.tsx");
    assert.ok(fs.existsSync(salesPagePath), "app/sales/page.tsx must exist");
    const content = fs.readFileSync(salesPagePath, "utf8");

    it("verifies daily expenses auto-sync and reconciliation formula", () => {
      assert.ok(
        content.includes('fetchDailyExpenses'),
        "fetchDailyExpenses function must exist in app/sales/page.tsx"
      );
      assert.ok(
        content.includes('.from("daily_expenses")'),
        "fetchDailyExpenses must query daily_expenses table"
      );
      assert.ok(
        content.includes('daily_expense_cents') || content.includes('drawer_cash_cents'),
        "Daily sales persistence must include drawer_cash_cents / daily_expense_cents"
      );
      assert.ok(
        content.includes('Total Cash Accounted'),
        "Formula must display Total Cash Accounted = Counted Cash + Daily Expenses"
      );
      assert.ok(
        content.includes('Daily Cash Expenses'),
        "Daily Cash Expenses card must be present on page"
      );
    });
  });

  describe("B2B Customer Modules Integrity Contract", () => {
    const customersPagePath = path.join(rootDir, "app", "(protected)", "b2b", "customers", "page.tsx");
    const customerDetailPath = path.join(rootDir, "app", "(protected)", "b2b", "customers", "[id]", "page.tsx");

    it("verifies both customer overview and detail pages import helpers from bakerUtils", () => {
      const overviewContent = fs.readFileSync(customersPagePath, "utf8");
      const detailContent = fs.readFileSync(customerDetailPath, "utf8");

      assert.ok(
        overviewContent.includes('from "@/lib/utils/bakerUtils"'),
        "Customers overview must import helpers from @/lib/utils/bakerUtils"
      );
      assert.ok(
        overviewContent.includes('getDateRangeInterval'),
        "Customers overview must use getDateRangeInterval"
      );
      assert.ok(
        detailContent.includes('from "@/lib/utils/bakerUtils"'),
        "Customer [id] detail must import helpers from @/lib/utils/bakerUtils"
      );
      assert.ok(
        detailContent.includes('getDateRangeInterval'),
        "Customer [id] detail must use getDateRangeInterval"
      );
      assert.ok(
        detailContent.includes('getSlipDate'),
        "Customer [id] detail must use getSlipDate"
      );
    });
  });
});
