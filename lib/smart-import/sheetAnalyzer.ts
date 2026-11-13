import {
  SEYALPRO_ENTITY_FIELDS,
  type ColumnProfile,
  type DetectedDataType,
  type ImportEntityType,
  type ParsedWorkbook,
  type SheetAnalysis,
} from "./types.ts";

const DATE_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /^\d{4}-\d{2}-\d{2}$/, label: "YYYY-MM-DD" },
  { regex: /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, label: "DD/MM/YYYY" },
  { regex: /^\d{1,2}-\d{1,2}-\d{2,4}$/, label: "DD-MM-YYYY" },
  { regex: /^\d{1,2}[\s-][A-Za-z]{3,9}[\s,-]+\d{2,4}$/, label: "DD-MMM-YYYY" },
  { regex: /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/, label: "MMM DD, YYYY" },
];

const CURRENCY_REGEX = /^(?:[₹$€£]|Rs\.?|INR)\s*-?[\d,]+(?:\.\d{1,2})?$|^[\d,]+(?:\.\d{1,2})?\s*(?:\/-|Cr|Dr|INR)$/i;
const NUMBER_REGEX = /^-?[\d,]+(?:\.\d+)?$/;
const PHONE_REGEX = /^(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const STATUS_WORDS = new Set([
  "paid", "unpaid", "pending", "partial", "settled", "overdue", "cancelled", "delivered", "dispatched", "returned",
]);

/**
 * Profiles a single column across sample rows to determine its data type, format hints, and fill rate.
 */
export function profileColumn(columnName: string, rows: Record<string, string>[]): ColumnProfile {
  let nonEmptyCount = 0;
  let emptyCount = 0;
  const sampleValues: string[] = [];

  let dateHits = 0;
  let currencyHits = 0;
  let numberHits = 0;
  let phoneHits = 0;
  let gstinHits = 0;
  let statusHits = 0;

  let dateFormatHint: string | undefined;
  let currencySymbolHint: string | undefined;

  for (const row of rows) {
    const raw = (row[columnName] ?? "").trim();
    if (!raw) {
      emptyCount++;
      continue;
    }
    nonEmptyCount++;
    if (sampleValues.length < 4 && !sampleValues.includes(raw)) {
      sampleValues.push(raw);
    }

    const matchedDate = DATE_PATTERNS.find((p) => p.regex.test(raw));
    if (matchedDate) {
      dateHits++;
      if (!dateFormatHint) dateFormatHint = matchedDate.label;
      continue;
    }

    if (GSTIN_REGEX.test(raw)) {
      gstinHits++;
      continue;
    }

    if (PHONE_REGEX.test(raw)) {
      phoneHits++;
      continue;
    }

    if (CURRENCY_REGEX.test(raw)) {
      currencyHits++;
      if (!currencySymbolHint) {
        if (raw.includes("₹") || /rs\.?|inr/i.test(raw)) currencySymbolHint = "INR (₹)";
        else if (raw.includes("$")) currencySymbolHint = "USD ($)";
      }
      continue;
    }

    if (STATUS_WORDS.has(raw.toLowerCase())) {
      statusHits++;
      continue;
    }

    if (NUMBER_REGEX.test(raw)) {
      numberHits++;
    }
  }

  let inferredType: DetectedDataType = "string";
  if (nonEmptyCount === 0) {
    inferredType = "empty";
  } else {
    const threshold = Math.max(1, Math.floor(nonEmptyCount * 0.55));
    const lowerHeader = columnName.toLowerCase();

    if (dateHits >= threshold) {
      inferredType = "date";
    } else if (gstinHits >= threshold) {
      inferredType = "gstin";
    } else if (phoneHits >= threshold && (lowerHeader.includes("phone") || lowerHeader.includes("mobile") || lowerHeader.includes("contact") || !lowerHeader.includes("amount"))) {
      inferredType = "phone";
    } else if (currencyHits >= threshold) {
      inferredType = "currency";
    } else if (numberHits + currencyHits >= threshold) {
      const isMoneyHeader =
        /amount|amt|total|price|rate|cost|paid|received|balance|due|pending|value|tax|discount|mrp|spend/.test(
          lowerHeader
        );
      inferredType = isMoneyHeader ? "currency" : "number";
    } else if (statusHits >= threshold) {
      inferredType = "status";
    }
  }

  return {
    columnName,
    inferredType,
    sampleValues,
    nonEmptyCount,
    emptyCount,
    dateFormatHint,
    currencySymbolHint,
  };
}

/**
 * Classifies a sheet into one of the 10 supported business entity types based on sheet name and column headers.
 */
export function classifySheetEntity(
  sheetName: string,
  headers: string[]
): { entity: ImportEntityType; confidence: number } {
  // Treat "_", "-" and "." as spaces so names like "Invoice_Items" or "line-items" match
  const lowerSheet = sheetName.toLowerCase().replace(/[_\-.]+/g, " ");
  const normalizedHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim());

  const scores: Record<ImportEntityType, number> = {
    invoices: 0,
    invoice_items: 0,
    customers: 0,
    products: 0,
    payments: 0,
    expenses: 0,
    returns: 0,
    inventory: 0,
    purchases: 0,
    suppliers: 0,
  };

  // 1. Sheet name strong signals
  if (/return|credit\s*note|refund/.test(lowerSheet)) scores.returns += 45;
  if (/invoice\s*item|line\s*item|bill\s*item/.test(lowerSheet)) scores.invoice_items += 45;
  else if (/invoice|bill|sales|dispatch|slip|order/.test(lowerSheet)) scores.invoices += 40;
  if (/customer|client|party|buyer|store|ledger/.test(lowerSheet)) scores.customers += 40;
  if (/product|catalog|menu|rate\s*card|price\s*list/.test(lowerSheet)) scores.products += 40;
  if (/payment|collection|receipt|settlement/.test(lowerSheet)) scores.payments += 40;
  if (/expense|spend|overhead|petty\s*cash/.test(lowerSheet)) scores.expenses += 40;
  if (/inventory|stock|raw\s*material/.test(lowerSheet)) scores.inventory += 40;
  if (/purchase|inward|po\b/.test(lowerSheet)) scores.purchases += 40;
  if (/supplier|vendor/.test(lowerSheet)) scores.suppliers += 40;

  // 2. Column header alias matching across all entities
  (Object.keys(SEYALPRO_ENTITY_FIELDS) as ImportEntityType[]).forEach((entity) => {
    const fields = SEYALPRO_ENTITY_FIELDS[entity];
    for (const field of fields) {
      const matched = normalizedHeaders.some(
        (h) =>
          h === field.key.replace(/_/g, " ") ||
          field.aliases.some((alias) => h === alias || h.includes(alias))
      );
      if (matched) {
        scores[entity] += field.required ? 18 : 8;
      }
    }
  });

  // Disambiguation rules
  const hasInvoiceNo = normalizedHeaders.some((h) => /invoice|bill\s*no|slip\s*no|ref\s*id/.test(h));
  const hasCustomer = normalizedHeaders.some((h) => /customer|client|buyer|party|store/.test(h));
  const hasTotal = normalizedHeaders.some((h) => /total|grand\s*amt|bill\s*amount|net\s*amount/.test(h));

  if (hasInvoiceNo && hasCustomer && hasTotal && scores.returns < 40) {
    scores.invoices += 25;
  }

  // Line-item sheets: item + qty columns with an invoice link but no customer column
  const hasItem = normalizedHeaders.some((h) => /item|product|particulars/.test(h));
  const hasQty = normalizedHeaders.some((h) => /qty|quantity|pcs|units/.test(h));
  if (hasInvoiceNo && hasItem && hasQty && !hasCustomer) {
    scores.invoice_items += 30;
  }

  let bestEntity: ImportEntityType = "invoices";
  let bestScore = -1;
  for (const [entity, sc] of Object.entries(scores) as Array<[ImportEntityType, number]>) {
    if (sc > bestScore) {
      bestScore = sc;
      bestEntity = entity;
    }
  }

  const confidence = Math.min(98, Math.max(45, Math.round(bestScore)));
  return { entity: bestEntity, confidence };
}

/**
 * Analyzes all parsed workbooks and sheets, detecting column types, duplicates, and cross-sheet relationships.
 */
export function analyzeWorkbooks(workbooks: ParsedWorkbook[]): SheetAnalysis[] {
  const analyses: SheetAnalysis[] = [];

  for (const wb of workbooks) {
    for (const sheet of wb.sheets) {
      const sheetKey = `${wb.fileId}::${sheet.sheetName}`;
      const columnProfiles = sheet.headers.map((h) => profileColumn(h, sheet.rows));
      const { entity, confidence } = classifySheetEntity(sheet.sheetName, sheet.headers);

      const detectedDateFormats = Array.from(
        new Set(columnProfiles.map((c) => c.dateFormatHint).filter(Boolean) as string[])
      );
      const detectedCurrencies = Array.from(
        new Set(columnProfiles.map((c) => c.currencySymbolHint).filter(Boolean) as string[])
      );
      if (
        detectedCurrencies.length === 0 &&
        columnProfiles.some((c) => c.inferredType === "currency")
      ) {
        detectedCurrencies.push("INR (₹)");
      }

      // Estimate duplicate rows inside the sheet
      const seenRowSignatures = new Set<string>();
      let estimatedDuplicatesCount = 0;
      for (const row of sheet.rows) {
        const sig = Object.values(row)
          .map((v) => v.trim().toLowerCase())
          .join("|");
        if (seenRowSignatures.has(sig)) {
          estimatedDuplicatesCount++;
        } else {
          seenRowSignatures.add(sig);
        }
      }

      analyses.push({
        sheetKey,
        fileId: wb.fileId,
        fileName: wb.fileName,
        sheetName: sheet.sheetName,
        rowCount: sheet.rows.length,
        emptyRowsSkipped: sheet.emptyRowsSkipped,
        detectedEntity: entity,
        entityConfidence: confidence,
        columnProfiles,
        detectedDateFormats,
        detectedCurrencies,
        estimatedDuplicatesCount,
        relatedSheetKeys: [],
        includeInImport: sheet.rows.length > 0,
      });
    }
  }

  // Detect relationships between sheets (e.g. invoices <-> invoice_items or invoices <-> customers)
  for (const a of analyses) {
    for (const b of analyses) {
      if (a.sheetKey === b.sheetKey) continue;
      if (
        (a.detectedEntity === "invoices" && b.detectedEntity === "invoice_items") ||
        (a.detectedEntity === "invoice_items" && b.detectedEntity === "invoices") ||
        (a.detectedEntity === "invoices" && b.detectedEntity === "customers") ||
        (a.detectedEntity === "invoices" && b.detectedEntity === "payments")
      ) {
        a.relatedSheetKeys.push(b.sheetKey);
      }
    }
  }

  return analyses;
}
