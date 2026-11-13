/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  SEYALPRO_ENTITY_FIELDS,
  type DuplicateHandlingStrategy,
  type ImportEntityType,
  type ParsedWorkbook,
  type SheetMappingConfig,
  type StagedImportRecord,
  type ValidationIssue,
  type ValidationSummary,
} from "./types.ts";

const MONTH_NAME_MAP: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

/**
 * Deterministic fast hash for tenant-prefixed IDs and source fingerprints.
 */
export function simpleHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Generates a store-scoped primary key so two different stores importing the exact same
 * spreadsheet (e.g. INV-001) can NEVER collide in Supabase tables.
 */
export function makeTenantRecordId(
  businessId: string,
  entityType: ImportEntityType | string,
  sourceFingerprint: string
): string {
  const cleanBiz = (businessId || "store").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  const hash = simpleHash(`${businessId}::${entityType}::${sourceFingerprint}`);
  return `si_${cleanBiz}_${entityType.slice(0, 4)}_${hash}`;
}

/**
 * Parses flexible date strings (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD-MMM-YYYY, Excel serials) into YYYY-MM-DD.
 */
export function normalizeFlexibleDate(raw: unknown): { iso: string | null; isValid: boolean } {
  if (raw === null || raw === undefined) return { iso: null, isValid: false };
  const str = String(raw).trim();
  if (!str) return { iso: null, isValid: false };

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return {
        iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        isValid: true,
      };
    }
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY (Indian standard DD/MM/YYYY priority)
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    let p1 = parseInt(dmyMatch[1], 10);
    let p2 = parseInt(dmyMatch[2], 10);
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;

    // If p2 > 12 and p1 <= 12, it was MM/DD/YYYY
    if (p2 > 12 && p1 <= 12) {
      const tmp = p1;
      p1 = p2;
      p2 = tmp;
    }
    if (y >= 1970 && y <= 2100 && p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
      return {
        iso: `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`,
        isValid: true,
      };
    }
  }

  // 3. DD-MMM-YYYY or DD MMM YYYY (e.g. 15-Aug-2025 or 15 Aug 25)
  const namedMonthMatch = str.match(/^(\d{1,2})[\s/-]+([A-Za-z]{3,9})[\s,/-]+(\d{2,4})$/);
  if (namedMonthMatch) {
    const d = parseInt(namedMonthMatch[1], 10);
    const mStr = MONTH_NAME_MAP[namedMonthMatch[2].toLowerCase()];
    let y = parseInt(namedMonthMatch[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (mStr && d >= 1 && d <= 31 && y >= 1970 && y <= 2100) {
      return { iso: `${y}-${mStr}-${String(d).padStart(2, "0")}`, isValid: true };
    }
  }

  // 4. MMM DD, YYYY (e.g. Aug 15, 2025)
  const mdyNamedMatch = str.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (mdyNamedMatch) {
    const mStr = MONTH_NAME_MAP[mdyNamedMatch[1].toLowerCase()];
    const d = parseInt(mdyNamedMatch[2], 10);
    let y = parseInt(mdyNamedMatch[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (mStr && d >= 1 && d <= 31 && y >= 1970 && y <= 2100) {
      return { iso: `${y}-${mStr}-${String(d).padStart(2, "0")}`, isValid: true };
    }
  }

  // 5. Excel serial number (e.g. 45884)
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    if (serial > 25569 && serial < 70000) {
      const utcDays = Math.floor(serial - 25569);
      const dt = new Date(utcDays * 86400 * 1000);
      if (!isNaN(dt.getTime())) {
        return {
          iso: dt.toISOString().split("T")[0],
          isValid: true,
        };
      }
    }
  }

  return { iso: null, isValid: false };
}

/**
 * Parses currency / numeric strings like "₹ 1,25,400.50", "Rs. 450/-", "(300)" into numbers.
 */
export function parseCurrencyNumber(raw: unknown): { value: number | null; isValid: boolean } {
  if (raw === null || raw === undefined) return { value: null, isValid: false };
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { value: raw, isValid: true } : { value: null, isValid: false };
  }
  const str = String(raw).trim();
  if (!str) return { value: null, isValid: false };

  const isAccountingNegative = /^\(.*\)$/.test(str);
  const cleaned = str
    .replace(/^\((.*)\)$/, "$1")
    .replace(/(?:₹|Rs\.?|INR|\$|€|£|\/-|Cr|Dr|,|\s)/gi, "")
    .trim();

  if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return { value: null, isValid: false };
  }

  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return { value: null, isValid: false };
  return {
    value: isAccountingNegative ? -Math.abs(num) : num,
    isValid: true,
  };
}

export function computeSourceFingerprint(
  entityType: ImportEntityType,
  normalized: Record<string, any>
): string {
  const clean = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  switch (entityType) {
    case "invoices":
    case "returns":
      return `${entityType}:${clean(normalized.invoice_number)}:${clean(normalized.date)}:${clean(normalized.customer_name)}`;
    case "invoice_items":
      return `inv_item:${clean(normalized.invoice_number)}:${clean(normalized.item_name)}:${clean(normalized.quantity)}:${clean(normalized.unit_price)}`;
    case "customers":
      return `cust:${clean(normalized.name)}:${clean(normalized.phone).replace(/\D/g, "").slice(-10)}`;
    case "products":
      return `prod:${clean(normalized.name)}`;
    case "payments":
      return `pay:${clean(normalized.date)}:${clean(normalized.customer_name)}:${clean(normalized.amount)}:${clean(normalized.reference_no)}`;
    case "expenses":
      return `exp:${clean(normalized.date)}:${clean(normalized.name)}:${clean(normalized.amount)}`;
    case "inventory":
      return `inv_stock:${clean(normalized.name)}`;
    case "purchases":
      return `po:${clean(normalized.po_number)}:${clean(normalized.supplier_name)}`;
    case "suppliers":
      return `sup:${clean(normalized.name)}`;
  }
}

export interface ExistingStoreDataSnapshot {
  invoices?: any[];
  products?: any[];
  customers?: any[];
  payments?: any[];
  expenses?: any[];
  inventory?: any[];
  suppliers?: any[];
}

/**
 * Stages, normalizes, groups multi-row invoices, and validates all mapped sheets against financial rules and existing store records.
 */
export function runValidationAndStaging(
  workbooks: ParsedWorkbook[],
  mappingConfigs: SheetMappingConfig[],
  existingStoreData: ExistingStoreDataSnapshot = {},
  duplicateStrategy: DuplicateHandlingStrategy = "skip"
): {
  stagedRecords: StagedImportRecord[];
  issues: ValidationIssue[];
  summary: ValidationSummary;
} {
  const sheetMap = new Map<string, { fileName: string; sheetName: string; rows: Record<string, string>[] }>();
  for (const wb of workbooks) {
    for (const sh of wb.sheets) {
      sheetMap.set(`${wb.fileId}::${sh.sheetName}`, {
        fileName: wb.fileName,
        sheetName: sh.sheetName,
        rows: sh.rows,
      });
    }
  }

  // Build lookup sets from existing store records (strictly scoped to the active store's snapshot)
  const existingInvoiceNumbers = new Set(
    (existingStoreData.invoices || []).map((i) =>
      String(i.invoiceNumber || i.invoice_number || i.slip_number || "")
        .trim()
        .toLowerCase()
    ).filter(Boolean)
  );
  const existingCustomerNames = new Set(
    (existingStoreData.customers || []).map((c) =>
      String(c.name || "").trim().toLowerCase()
    ).filter(Boolean)
  );
  const existingProductNames = new Set(
    (existingStoreData.products || []).map((p) =>
      String(p.name || "").trim().toLowerCase()
    ).filter(Boolean)
  );
  const existingProductCosts = new Map<string, number>();
  (existingStoreData.products || []).forEach((p) => {
    const key = String(p.name || "").trim().toLowerCase();
    const cost = Number(p.making_cost ?? p.cost_per_unit ?? 0);
    if (key && cost > 0) existingProductCosts.set(key, cost);
  });

  // 1. First pass: collect any standalone `invoice_items` sheets so they can attach to `invoices`
  const externalItemsByInvoiceNo = new Map<
    string,
    Array<{ name: string; qty: number; rate: number; amount: number; unit_cost?: number; unit?: string }>
  >();

  for (const cfg of mappingConfigs) {
    if (!cfg.includeInImport || cfg.entityType !== "invoice_items") continue;
    const sheetData = sheetMap.get(cfg.sheetKey);
    if (!sheetData) continue;

    const fieldToSource = new Map<string, string>();
    for (const m of cfg.mappings) {
      if (m.targetField && m.targetField !== "__ignore__") {
        fieldToSource.set(m.targetField, m.sourceColumn);
      }
    }

    for (const row of sheetData.rows) {
      const invNo = (row[fieldToSource.get("invoice_number") || ""] || "").trim();
      const itemName = (row[fieldToSource.get("item_name") || ""] || "").trim();
      if (!invNo || !itemName) continue;

      const qty = parseCurrencyNumber(row[fieldToSource.get("quantity") || ""]).value ?? 1;
      const rate = parseCurrencyNumber(row[fieldToSource.get("unit_price") || ""]).value ?? 0;
      const lineTotal =
        parseCurrencyNumber(row[fieldToSource.get("line_total") || ""]).value ?? qty * rate;
      const unitCost =
        parseCurrencyNumber(row[fieldToSource.get("unit_cost") || ""]).value ?? undefined;
      const unit = (row[fieldToSource.get("unit") || ""] || "Unit").trim() || "Unit";

      const key = invNo.toLowerCase();
      if (!externalItemsByInvoiceNo.has(key)) externalItemsByInvoiceNo.set(key, []);
      externalItemsByInvoiceNo.get(key)!.push({
        name: itemName,
        qty,
        rate,
        amount: lineTotal,
        unit_cost: unitCost,
        unit,
      });
    }
  }

  const stagedRecords: StagedImportRecord[] = [];
  const allIssues: ValidationIssue[] = [];
  const seenFingerprintsInBatch = new Set<string>();

  for (const cfg of mappingConfigs) {
    if (!cfg.includeInImport) continue;
    const sheetData = sheetMap.get(cfg.sheetKey);
    if (!sheetData) continue;

    const fieldDefs = SEYALPRO_ENTITY_FIELDS[cfg.entityType] || [];
    const fieldToSource = new Map<string, string>();
    for (const m of cfg.mappings) {
      if (m.targetField && m.targetField !== "__ignore__") {
        fieldToSource.set(m.targetField, m.sourceColumn);
      }
    }

    // Group multi-row invoices if the same invoice_number appears on consecutive/multiple rows with item_name
    const hasLineItemCols =
      (cfg.entityType === "invoices" || cfg.entityType === "returns") &&
      fieldToSource.has("invoice_number") &&
      fieldToSource.has("item_name");

    const groupedRows: Array<{
      primaryRow: Record<string, string>;
      rowNumber: number;
      subRows: Record<string, string>[];
    }> = [];

    if (hasLineItemCols) {
      const invCol = fieldToSource.get("invoice_number")!;
      const groupMap = new Map<
        string,
        { primaryRow: Record<string, string>; rowNumber: number; subRows: Record<string, string>[] }
      >();

      sheetData.rows.forEach((row, rIdx) => {
        const invNo = (row[invCol] || "").trim().toLowerCase();
        if (!invNo) {
          groupedRows.push({ primaryRow: row, rowNumber: rIdx + 2, subRows: [row] });
          return;
        }
        if (!groupMap.has(invNo)) {
          const entry = { primaryRow: row, rowNumber: rIdx + 2, subRows: [row] };
          groupMap.set(invNo, entry);
          groupedRows.push(entry);
        } else {
          groupMap.get(invNo)!.subRows.push(row);
        }
      });
    } else {
      sheetData.rows.forEach((row, rIdx) => {
        groupedRows.push({ primaryRow: row, rowNumber: rIdx + 2, subRows: [row] });
      });
    }

    for (const group of groupedRows) {
      const { primaryRow, rowNumber, subRows } = group;
      const rowId = `stg-${cfg.sheetKey}-${rowNumber}`;
      const rowIssues: ValidationIssue[] = [];
      const normalized: Record<string, any> = {};

      // Extract & validate mapped fields
      for (const fieldDef of fieldDefs) {
        const srcCol = fieldToSource.get(fieldDef.key);
        const rawVal = srcCol ? (primaryRow[srcCol] ?? "").trim() : "";

        if (!rawVal) {
          if (fieldDef.required) {
            rowIssues.push({
              id: `iss-${rowId}-${fieldDef.key}`,
              rowId,
              sheetKey: cfg.sheetKey,
              fileName: sheetData.fileName,
              sheetName: sheetData.sheetName,
              rowNumber,
              entityType: cfg.entityType,
              field: fieldDef.key,
              code: "MISSING_REQUIRED",
              severity: "error",
              message: `Required field "${fieldDef.label}" is missing.`,
              originalValue: "",
            });
          }
          continue;
        }

        if (fieldDef.dataType === "date") {
          const parsedDate = normalizeFlexibleDate(rawVal);
          if (!parsedDate.isValid || !parsedDate.iso) {
            rowIssues.push({
              id: `iss-${rowId}-${fieldDef.key}`,
              rowId,
              sheetKey: cfg.sheetKey,
              fileName: sheetData.fileName,
              sheetName: sheetData.sheetName,
              rowNumber,
              entityType: cfg.entityType,
              field: fieldDef.key,
              code: "INVALID_DATE",
              severity: "error",
              message: `Invalid date "${rawVal}" for ${fieldDef.label}. Expected YYYY-MM-DD or DD/MM/YYYY.`,
              originalValue: rawVal,
            });
            normalized[fieldDef.key] = rawVal;
          } else {
            normalized[fieldDef.key] = parsedDate.iso;
          }
        } else if (fieldDef.dataType === "currency" || fieldDef.dataType === "number") {
          const parsedNum = parseCurrencyNumber(rawVal);
          if (!parsedNum.isValid || parsedNum.value === null) {
            rowIssues.push({
              id: `iss-${rowId}-${fieldDef.key}`,
              rowId,
              sheetKey: cfg.sheetKey,
              fileName: sheetData.fileName,
              sheetName: sheetData.sheetName,
              rowNumber,
              entityType: cfg.entityType,
              field: fieldDef.key,
              code: "INVALID_NUMBER",
              severity: "error",
              message: `Invalid numeric value "${rawVal}" for ${fieldDef.label}.`,
              originalValue: rawVal,
            });
            normalized[fieldDef.key] = 0;
          } else {
            if (parsedNum.value < 0 && cfg.entityType !== "returns") {
              rowIssues.push({
                id: `iss-${rowId}-${fieldDef.key}-neg`,
                rowId,
                sheetKey: cfg.sheetKey,
                fileName: sheetData.fileName,
                sheetName: sheetData.sheetName,
                rowNumber,
                entityType: cfg.entityType,
                field: fieldDef.key,
                code: "NEGATIVE_AMOUNT",
                severity: "warning",
                message: `Negative value (${parsedNum.value}) detected in ${fieldDef.label}. Verify if this is a return/credit note.`,
                originalValue: rawVal,
              });
            }
            normalized[fieldDef.key] = parsedNum.value;
          }
        } else {
          normalized[fieldDef.key] = rawVal;
        }
      }

      // Entity-specific financial & relational checks
      if (cfg.entityType === "invoices" || cfg.entityType === "returns") {
        const invKey = String(normalized.invoice_number || "").trim().toLowerCase();
        const items: Array<{
          name: string;
          qty: number;
          rate: number;
          amount: number;
          making_cost?: number;
          has_verified_cost?: boolean;
          unit: string;
        }> = [];

        // Attach items from subRows if item_name was mapped
        if (fieldToSource.has("item_name")) {
          for (const sr of subRows) {
            const itName = (sr[fieldToSource.get("item_name")!] || "").trim();
            if (!itName) continue;
            const qty =
              parseCurrencyNumber(sr[fieldToSource.get("quantity") || ""]).value ?? 1;
            const rate =
              parseCurrencyNumber(sr[fieldToSource.get("unit_price") || ""]).value ??
              Number(normalized.total_amount || 0);
            const unitCostVal = parseCurrencyNumber(
              sr[fieldToSource.get("unit_cost") || ""]
            ).value;
            const catalogCost = existingProductCosts.get(itName.toLowerCase());
            const resolvedCost = unitCostVal ?? catalogCost;

            items.push({
              name: itName,
              qty,
              rate,
              amount: Math.round(qty * rate * 100) / 100,
              making_cost: resolvedCost ?? 0,
              has_verified_cost: resolvedCost !== undefined && resolvedCost > 0,
              unit: "Unit",
            });
          }
        }

        // Also attach items from a separate invoice_items sheet if linked by invoice_number
        if (invKey && externalItemsByInvoiceNo.has(invKey)) {
          for (const extIt of externalItemsByInvoiceNo.get(invKey)!) {
            const catalogCost = existingProductCosts.get(extIt.name.toLowerCase());
            const resolvedCost = extIt.unit_cost ?? catalogCost;
            items.push({
              name: extIt.name,
              qty: extIt.qty,
              rate: extIt.rate,
              amount: extIt.amount,
              making_cost: resolvedCost ?? 0,
              has_verified_cost: resolvedCost !== undefined && resolvedCost > 0,
              unit: extIt.unit || "Unit",
            });
          }
        }

        const totalAmount = Number(normalized.total_amount ?? 0);
        const taxAmount = Number(normalized.tax_amount ?? 0);
        const discountAmount = Number(normalized.discount_amount ?? 0);

        if (items.length > 0) {
          const itemsSum = items.reduce((s, it) => s + it.amount, 0);
          const expectedTotal = itemsSum + taxAmount - discountAmount;
          // If total_amount wasn't provided on summary row, use expectedTotal; if provided and differs by > ₹1.5, flag warning
          if (normalized.total_amount === undefined) {
            normalized.total_amount = expectedTotal;
          } else if (Math.abs( Math.abs(totalAmount) - Math.abs(expectedTotal) ) > 1.5) {
            rowIssues.push({
              id: `iss-${rowId}-math`,
              rowId,
              sheetKey: cfg.sheetKey,
              fileName: sheetData.fileName,
              sheetName: sheetData.sheetName,
              rowNumber,
              entityType: cfg.entityType,
              field: "total_amount",
              code: "MATH_DISCREPANCY",
              severity: "warning",
              message: `Invoice Total (₹${totalAmount}) differs from Line Items + Tax - Discount (₹${expectedTotal.toFixed(2)}). Historical total is preserved unless edited.`,
              originalValue: String(totalAmount),
              suggestedValue: String(expectedTotal),
            });
          }
        } else {
          // Single-row summary invoice without line item breakdown
          items.push({
            name: normalized.item_name || "Historical Billed Items",
            qty: Number(normalized.quantity || 1),
            rate: Number(normalized.unit_price || Math.abs(totalAmount)),
            amount: Math.abs(totalAmount),
            making_cost: Number(normalized.unit_cost || 0),
            has_verified_cost: Boolean(normalized.unit_cost && Number(normalized.unit_cost) > 0),
            unit: "Unit",
          });
        }

        normalized.items = items;
        normalized.has_verified_cost = items.every((i) => i.has_verified_cost);

        if (!normalized.has_verified_cost && cfg.entityType === "invoices") {
          rowIssues.push({
            id: `iss-${rowId}-cost`,
            rowId,
            sheetKey: cfg.sheetKey,
            fileName: sheetData.fileName,
            sheetName: sheetData.sheetName,
            rowNumber,
            entityType: cfg.entityType,
            field: "unit_cost",
            code: "MISSING_COST_DATA",
            severity: "warning",
            message:
              "Unit/making cost is not present for one or more items. Revenue will be recorded accurately; net profit will be marked as lacking historical cost unless product costs are added.",
          });
        }

        // Paid Amount & Balance Due reconciliation
        const finalTotal = Number(normalized.total_amount || 0);
        const hasPaid = normalized.paid_amount !== undefined;
        const hasBalance = normalized.balance_due !== undefined;
        const statusLower = String(normalized.status || "").toLowerCase();

        if (hasPaid && hasBalance) {
          const paid = Number(normalized.paid_amount);
          const due = Number(normalized.balance_due);
          if (Math.abs(Math.abs(finalTotal) - (paid + due)) > 1.5 && cfg.entityType !== "returns") {
            rowIssues.push({
              id: `iss-${rowId}-bal`,
              rowId,
              sheetKey: cfg.sheetKey,
              fileName: sheetData.fileName,
              sheetName: sheetData.sheetName,
              rowNumber,
              entityType: cfg.entityType,
              field: "balance_due",
              code: "BALANCE_MISMATCH",
              severity: "warning",
              message: `Paid (₹${paid}) + Balance Due (₹${due}) does not equal Invoice Total (₹${finalTotal}).`,
              originalValue: String(due),
              suggestedValue: String(Math.max(0, finalTotal - paid)),
            });
          }
        } else if (hasPaid && !hasBalance) {
          normalized.balance_due = Math.max(0, Math.abs(finalTotal) - Number(normalized.paid_amount));
        } else if (!hasPaid && hasBalance) {
          normalized.paid_amount = Math.max(0, Math.abs(finalTotal) - Number(normalized.balance_due));
        } else {
          // Neither paid nor balance column mapped — infer from status or default to paid if status='paid', else pending
          if (statusLower === "paid" || statusLower === "settled") {
            normalized.paid_amount = Math.abs(finalTotal);
            normalized.balance_due = 0;
          } else {
            normalized.paid_amount = 0;
            normalized.balance_due = Math.abs(finalTotal);
          }
        }

        normalized.status =
          Number(normalized.balance_due || 0) <= 0
            ? "paid"
            : Number(normalized.paid_amount || 0) > 0
            ? "partial"
            : "pending";
      }

      if (cfg.entityType === "products") {
        const hasCost =
          normalized.making_cost !== undefined && Number(normalized.making_cost) > 0;
        normalized.has_verified_cost = hasCost;
        if (!hasCost) {
          normalized.making_cost = 0;
          rowIssues.push({
            id: `iss-${rowId}-prodcost`,
            rowId,
            sheetKey: cfg.sheetKey,
            fileName: sheetData.fileName,
            sheetName: sheetData.sheetName,
            rowNumber,
            entityType: cfg.entityType,
            field: "making_cost",
            code: "MISSING_COST_DATA",
            severity: "warning",
            message:
              "Making/Cost price not provided. Product will be imported with ₹0 cost (no invented cost) until updated.",
          });
        }
      }

      // Duplicate detection
      const fingerprint = computeSourceFingerprint(cfg.entityType, normalized);
      let duplicateStatus: StagedImportRecord["duplicateStatus"] = "unique";
      let duplicateMatchInfo: string | undefined;

      if (seenFingerprintsInBatch.has(fingerprint)) {
        duplicateStatus = "file_duplicate";
        duplicateMatchInfo = "Duplicate row inside uploaded spreadsheet";
        rowIssues.push({
          id: `iss-${rowId}-dupfile`,
          rowId,
          sheetKey: cfg.sheetKey,
          fileName: sheetData.fileName,
          sheetName: sheetData.sheetName,
          rowNumber,
          entityType: cfg.entityType,
          field: "id",
          code: "DUPLICATE_IN_FILE",
          severity: "warning",
          message: "Duplicate record found within the uploaded file.",
        });
      } else {
        seenFingerprintsInBatch.add(fingerprint);
        // Check against existing store database records
        if (
          (cfg.entityType === "invoices" || cfg.entityType === "returns") &&
          normalized.invoice_number &&
          existingInvoiceNumbers.has(String(normalized.invoice_number).trim().toLowerCase())
        ) {
          duplicateStatus = "existing_duplicate";
          duplicateMatchInfo = `Invoice "${normalized.invoice_number}" already exists in this store`;
        } else if (
          cfg.entityType === "customers" &&
          normalized.name &&
          existingCustomerNames.has(String(normalized.name).trim().toLowerCase())
        ) {
          duplicateStatus = "existing_duplicate";
          duplicateMatchInfo = `Customer "${normalized.name}" already exists in this store`;
        } else if (
          cfg.entityType === "products" &&
          normalized.name &&
          existingProductNames.has(String(normalized.name).trim().toLowerCase())
        ) {
          duplicateStatus = "existing_duplicate";
          duplicateMatchInfo = `Product "${normalized.name}" already exists in this store`;
        }

        if (duplicateStatus === "existing_duplicate") {
          rowIssues.push({
            id: `iss-${rowId}-dupdb`,
            rowId,
            sheetKey: cfg.sheetKey,
            fileName: sheetData.fileName,
            sheetName: sheetData.sheetName,
            rowNumber,
            entityType: cfg.entityType,
            field: "id",
            code: "DUPLICATE_IN_DB",
            severity: "warning",
            message: duplicateMatchInfo || "Matches an existing record in your store.",
          });
        }
      }

      const hasErrors = rowIssues.some((i) => i.severity === "error");
      const hasWarnings = rowIssues.some((i) => i.severity === "warning");
      const status: StagedImportRecord["status"] = hasErrors
        ? "invalid"
        : hasWarnings
        ? "warning"
        : "valid";

      let action: StagedImportRecord["action"] = "import";
      if (hasErrors) {
        action = "skip";
      } else if (duplicateStatus !== "unique") {
        action =
          duplicateStrategy === "skip"
            ? "skip"
            : duplicateStrategy === "merge"
            ? "merge"
            : "import";
      }

      allIssues.push(...rowIssues);
      stagedRecords.push({
        id: rowId,
        sheetKey: cfg.sheetKey,
        fileName: sheetData.fileName,
        sheetName: sheetData.sheetName,
        rowNumber,
        entityType: cfg.entityType,
        sourceFingerprint: fingerprint,
        rawValues: primaryRow,
        normalized,
        status,
        duplicateStatus,
        duplicateMatchInfo,
        action,
        issues: rowIssues,
      });
    }
  }

  const summary = computeValidationSummary(stagedRecords, allIssues);
  return { stagedRecords, issues: allIssues, summary };
}

export function computeValidationSummary(
  stagedRecords: StagedImportRecord[],
  issues: ValidationIssue[]
): ValidationSummary {
  const byEntity = {
    invoices: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    invoice_items: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    customers: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    products: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    payments: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    expenses: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    returns: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    inventory: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    purchases: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
    suppliers: { total: 0, toImport: 0, toMerge: 0, toSkip: 0, invalid: 0 },
  };

  let validCount = 0;
  let warningCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const rec of stagedRecords) {
    const bucket = byEntity[rec.entityType];
    if (bucket) {
      bucket.total++;
      if (rec.status === "invalid") bucket.invalid++;
      if (rec.action === "import") bucket.toImport++;
      else if (rec.action === "merge") bucket.toMerge++;
      else bucket.toSkip++;
    }

    if (rec.status === "valid") validCount++;
    else if (rec.status === "warning") warningCount++;
    else invalidCount++;

    if (rec.duplicateStatus !== "unique") duplicateCount++;
  }

  return {
    totalStaged: stagedRecords.length,
    validCount,
    warningCount,
    invalidCount,
    duplicateCount,
    missingFieldsCount: issues.filter((i) => i.code === "MISSING_REQUIRED").length,
    mathDiscrepancyCount: issues.filter(
      (i) => i.code === "MATH_DISCREPANCY" || i.code === "BALANCE_MISMATCH"
    ).length,
    missingCostCount: issues.filter((i) => i.code === "MISSING_COST_DATA").length,
    byEntity,
  };
}
