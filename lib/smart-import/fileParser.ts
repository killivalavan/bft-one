import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import type { ParsedSheet, ParsedWorkbook } from "./types.ts";

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB per file
export const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

const HEADER_HINT_WORDS = new Set([
  "invoice", "bill", "slip", "date", "customer", "client", "buyer", "party",
  "store", "name", "phone", "mobile", "address", "gstin", "gst", "item",
  "product", "qty", "quantity", "rate", "price", "amount", "total", "paid",
  "received", "balance", "due", "pending", "status", "mode", "method",
  "category", "cost", "unit", "stock", "sku", "supplier", "vendor", "expense",
  "reference", "ref", "notes", "remarks", "tax", "discount",
]);

/**
 * Neutralizes spreadsheet formula injection (CSV/Excel DDE payloads) while preserving negative numbers.
 */
export function sanitizeCellValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const str = String(raw).replace(/\r\n/g, "\n").trim();
  if (!str) return "";

  // Allow negative currency/numbers like -450 or -₹450, but strip leading formula triggers (=, +, @, or - followed by letters/formulas)
  if (/^[=+@]/.test(str) || /^-[a-zA-Z_]/.test(str)) {
    return str.replace(/^[=+@-]+/, "").trim();
  }
  return str;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Converts Excel column reference (e.g. "A12" -> 0, "Z1" -> 25, "AA5" -> 26) to 0-based column index.
 */
export function colLettersToIndex(cellRef: string): number {
  const match = cellRef.match(/^([A-Za-z]+)/);
  if (!match) return -1;
  const letters = match[1].toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * Converts Excel 1900 serial date number to YYYY-MM-DD string.
 */
export function excelSerialToIsoDate(serial: number): string {
  // Excel's 1900 leap year bug adjustment (serial 60 = 1900-02-29)
  const adjusted = serial > 60 ? serial - 1 : serial;
  const utcDays = Math.floor(adjusted - 25568);
  const utcMs = utcDays * 86400 * 1000;
  const d = new Date(utcMs);
  if (isNaN(d.getTime())) return String(serial);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * RFC-4180 compliant CSV / TSV parser with delimiter auto-detection.
 */
export function parseCsvGrid(content: string): string[][] {
  const clean = content.replace(/^\uFEFF/, ""); // Strip UTF-8 BOM
  const firstLines = clean.split(/\r?\n/).slice(0, 5).join("\n");

  // Auto-detect delimiter (comma, semicolon, or tab)
  const commaCount = (firstLines.match(/,/g) || []).length;
  const semiCount = (firstLines.match(/;/g) || []).length;
  const tabCount = (firstLines.match(/\t/g) || []).length;
  let delimiter = ",";
  if (tabCount > commaCount && tabCount > semiCount) delimiter = "\t";
  else if (semiCount > commaCount) delimiter = ";";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(sanitizeCellValue(currentField));
        currentField = "";
      } else if (ch === "\r" && next === "\n") {
        currentRow.push(sanitizeCellValue(currentField));
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(sanitizeCellValue(currentField));
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(sanitizeCellValue(currentField));
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parses OpenXML (.xlsx) bytes using fflate.unzipSync without executing formulas or macros.
 */
export function parseXlsxBytes(bytes: Uint8Array): {
  sheets: Array<{ name: string; grid: string[][] }>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const archive = unzipSync(bytes);

  const getXmlText = (path: string): string | null => {
    const entry =
      archive[path] ||
      archive[path.replace(/^\//, "")] ||
      Object.entries(archive).find(([k]) => k.toLowerCase() === path.toLowerCase())?.[1];
    return entry ? strFromU8(entry) : null;
  };

  // 1. Shared Strings (xl/sharedStrings.xml)
  const sharedStrings: string[] = [];
  const sstXml = getXmlText("xl/sharedStrings.xml");
  if (sstXml) {
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(sstXml)) !== null) {
      const siBody = siMatch[1];
      const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      let combined = "";
      while ((tMatch = tRegex.exec(siBody)) !== null) {
        combined += decodeXmlEntities(tMatch[1]);
      }
      sharedStrings.push(combined);
    }
  }

  // 2. Date style indices (xl/styles.xml)
  const dateStyleIndices = new Set<number>();
  const stylesXml = getXmlText("xl/styles.xml");
  if (stylesXml) {
    const customDateFmtIds = new Set<number>();
    const numFmtRegex = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
    let nfMatch: RegExpExecArray | null;
    while ((nfMatch = numFmtRegex.exec(stylesXml)) !== null) {
      const id = parseInt(nfMatch[1], 10);
      const code = nfMatch[2].toLowerCase().replace(/\[[^\]]*\]/g, "");
      if (/[dmy]/.test(code) && !/[#0]/.test(code)) {
        customDateFmtIds.add(id);
      }
    }

    const cellXfsMatch = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (cellXfsMatch) {
      const xfRegex = /<xf\b([^>]*)\/?>/g;
      let xfMatch: RegExpExecArray | null;
      let xfIdx = 0;
      while ((xfMatch = xfRegex.exec(cellXfsMatch[1])) !== null) {
        const attrs = xfMatch[1];
        const numFmtIdMatch = attrs.match(/numFmtId="(\d+)"/);
        if (numFmtIdMatch) {
          const fmtId = parseInt(numFmtIdMatch[1], 10);
          // Built-in Excel date format IDs: 14-22, 27-36, 45-47, 50-58
          const isBuiltInDate =
            (fmtId >= 14 && fmtId <= 22) ||
            (fmtId >= 27 && fmtId <= 36) ||
            (fmtId >= 45 && fmtId <= 47) ||
            (fmtId >= 50 && fmtId <= 58);
          if (isBuiltInDate || customDateFmtIds.has(fmtId)) {
            dateStyleIndices.add(xfIdx);
          }
        }
        xfIdx++;
      }
    }
  }

  // 3. Workbook Relationships (xl/_rels/workbook.xml.rels)
  const relMap = new Map<string, string>();
  const relsXml = getXmlText("xl/_rels/workbook.xml.rels");
  if (relsXml) {
    const relRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let relMatch: RegExpExecArray | null;
    while ((relMatch = relRegex.exec(relsXml)) !== null) {
      let target = relMatch[2].replace(/^\//, "");
      if (!target.startsWith("xl/")) {
        target = `xl/${target.replace(/^\.\//, "")}`;
      }
      relMap.set(relMatch[1], target);
    }
  }

  // 4. Workbook Sheets (xl/workbook.xml)
  const sheetEntries: Array<{ name: string; path: string }> = [];
  const wbXml = getXmlText("xl/workbook.xml");
  if (wbXml) {
    const sheetRegex = /<sheet\b([^>]*)\/?>/g;
    let sMatch: RegExpExecArray | null;
    let idx = 1;
    while ((sMatch = sheetRegex.exec(wbXml)) !== null) {
      const attrs = sMatch[1];
      const nameMatch = attrs.match(/name="([^"]+)"/);
      const rIdMatch = attrs.match(/r:id="([^"]+)"/);
      const name = nameMatch ? decodeXmlEntities(nameMatch[1]) : `Sheet${idx}`;
      const rId = rIdMatch ? rIdMatch[1] : "";
      const path = (rId && relMap.get(rId)) || `xl/worksheets/sheet${idx}.xml`;
      sheetEntries.push({ name, path });
      idx++;
    }
  }

  // Fallback if workbook.xml didn't list sheets explicitly
  if (sheetEntries.length === 0) {
    Object.keys(archive)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort()
      .forEach((path, i) => {
        sheetEntries.push({ name: `Sheet${i + 1}`, path });
      });
  }

  // 5. Parse each worksheet XML
  const sheets: Array<{ name: string; grid: string[][] }> = [];
  for (const entry of sheetEntries) {
    const sheetXml = getXmlText(entry.path);
    if (!sheetXml) continue;

    const grid: string[][] = [];
    const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rMatch: RegExpExecArray | null;

    while ((rMatch = rowRegex.exec(sheetXml)) !== null) {
      const rowBody = rMatch[1];
      const rowCells: string[] = [];
      const cellRegex = /<c\b([^>]*)(?:>([\s\S]*?)<\/c>|\/>)/g;
      let cMatch: RegExpExecArray | null;
      let nextColIdx = 0;

      while ((cMatch = cellRegex.exec(rowBody)) !== null) {
        const attrs = cMatch[1];
        const cellInner = cMatch[2] || "";

        const refMatch = attrs.match(/\br="([A-Za-z]+\d+)"/);
        const typeMatch = attrs.match(/\bt="([^"]+)"/);
        const styleMatch = attrs.match(/\bs="(\d+)"/);

        const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : nextColIdx;
        const targetIdx = colIdx >= 0 ? colIdx : nextColIdx;
        while (rowCells.length < targetIdx) {
          rowCells.push("");
        }

        const cellType = typeMatch ? typeMatch[1] : "n";
        const styleIdx = styleMatch ? parseInt(styleMatch[1], 10) : -1;

        let resolvedValue = "";
        if (cellType === "inlineStr") {
          const tMatch = cellInner.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/);
          resolvedValue = tMatch ? decodeXmlEntities(tMatch[1]) : "";
        } else {
          const vMatch = cellInner.match(/<v>([\s\S]*?)<\/v>/);
          const rawV = vMatch ? decodeXmlEntities(vMatch[1]).trim() : "";

          if (cellType === "s") {
            const sstIdx = parseInt(rawV, 10);
            resolvedValue =
              !isNaN(sstIdx) && sharedStrings[sstIdx] !== undefined
                ? sharedStrings[sstIdx]
                : rawV;
          } else if (cellType === "b") {
            resolvedValue = rawV === "1" ? "TRUE" : "FALSE";
          } else if (cellType === "str" || cellType === "e") {
            resolvedValue = rawV;
          } else {
            // Numeric or date value
            const numVal = Number(rawV);
            if (
              rawV !== "" &&
              Number.isFinite(numVal) &&
              styleIdx >= 0 &&
              dateStyleIndices.has(styleIdx) &&
              numVal > 10000 &&
              numVal < 80000
            ) {
              resolvedValue = excelSerialToIsoDate(numVal);
            } else {
              resolvedValue = rawV;
            }
          }
        }

        rowCells[targetIdx] = sanitizeCellValue(resolvedValue);
        nextColIdx = targetIdx + 1;
      }

      grid.push(rowCells);
    }

    sheets.push({ name: entry.name, grid });
  }

  return { sheets, warnings };
}

/**
 * Parses legacy .xls files (supports HTML-table .xls exports, XML SpreadsheetML .xls exports, and text/CSV fallbacks).
 */
export function parseXlsContent(bytes: Uint8Array): {
  sheets: Array<{ name: string; grid: string[][] }>;
  warnings: string[];
} {
  const warnings: string[] = [];

  // If the file actually has PK ZIP magic bytes (0x50, 0x4B), it is an .xlsx saved with .xls extension
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return parseXlsxBytes(bytes);
  }

  const text = strFromU8(bytes);

  // 1. Check for XML Spreadsheet 2003 (<Worksheet ss:Name="...">)
  if (text.includes("<Worksheet") && text.includes("<Row")) {
    const sheets: Array<{ name: string; grid: string[][] }> = [];
    const wsRegex = /<Worksheet\b[^>]*ss:Name="([^"]+)"[^>]*>([\s\S]*?)<\/Worksheet>/gi;
    let wsMatch: RegExpExecArray | null;
    while ((wsMatch = wsRegex.exec(text)) !== null) {
      const name = decodeXmlEntities(wsMatch[1]);
      const body = wsMatch[2];
      const grid: string[][] = [];
      const rowRegex = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = rowRegex.exec(body)) !== null) {
        const rowCells: string[] = [];
        const dataRegex = /<Data\b[^>]*>([\s\S]*?)<\/Data>/gi;
        let dMatch: RegExpExecArray | null;
        while ((dMatch = dataRegex.exec(rMatch[1])) !== null) {
          rowCells.push(sanitizeCellValue(decodeXmlEntities(dMatch[1].replace(/<[^>]+>/g, ""))));
        }
        grid.push(rowCells);
      }
      sheets.push({ name, grid });
    }
    if (sheets.length > 0) return { sheets, warnings };
  }

  // 2. Check for HTML table .xls export (used by Tally, Busy, Vyapar, web ERP exports)
  if (/<table\b/i.test(text) && /<tr\b/i.test(text)) {
    const grid: string[][] = [];
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(text)) !== null) {
      const cells: string[] = [];
      const tdRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const stripped = decodeXmlEntities(tdMatch[1].replace(/<[^>]+>/g, " "));
        cells.push(sanitizeCellValue(stripped));
      }
      if (cells.length > 0) grid.push(cells);
    }
    return { sheets: [{ name: "Sheet1", grid }], warnings };
  }

  // 3. Check if OLE2 binary compound document (0xD0 0xCF 0x11 0xE0)
  if (bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    warnings.push(
      "Legacy binary BIFF8 (.xls) detected. For richest multi-sheet formatting, saving as .xlsx or .csv is recommended."
    );
    // Extract readable ASCII/UTF-16 string runs as fallback rows if present, or prompt user
    const cleanText = text.replace(/[^\x20-\x7E\r\n\t]/g, " ");
    const lines = cleanText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 3);
    if (lines.length > 0) {
      return {
        sheets: [{ name: "Sheet1", grid: lines.slice(0, 200).map((l) => l.split(/\s{2,}|\t/)) }],
        warnings,
      };
    }
  }

  // 4. Fallback: parse as CSV/TSV text
  return {
    sheets: [{ name: "Sheet1", grid: parseCsvGrid(text) }],
    warnings,
  };
}

/**
 * Automatically locates the header row within the first 15 rows and normalizes rows into key-value records.
 */
export function buildParsedSheet(
  fileId: string,
  fileName: string,
  sheetName: string,
  grid: string[][]
): ParsedSheet {
  const totalRawRows = grid.length;
  let emptyRowsSkipped = 0;

  // Filter out completely empty rows while tracking original indices
  const nonEmptyRows: Array<{ rawIndex: number; cells: string[] }> = [];
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    const hasValue = row.some((c) => c && c.trim() !== "");
    if (!hasValue) {
      emptyRowsSkipped++;
    } else {
      nonEmptyRows.push({ rawIndex: i, cells: row });
    }
  }

  if (nonEmptyRows.length === 0) {
    return {
      fileId,
      fileName,
      sheetName,
      headers: [],
      headerRowIndex: 0,
      rows: [],
      totalRawRows,
      emptyRowsSkipped,
    };
  }

  // Score candidate header rows among the first 12 non-empty rows
  let bestCandidateIdx = 0;
  let bestScore = -1;
  const maxScan = Math.min(12, nonEmptyRows.length);

  for (let i = 0; i < maxScan; i++) {
    const cells = nonEmptyRows[i].cells;
    const filledCells = cells.filter((c) => c && c.trim() !== "");
    if (filledCells.length <= 1 && nonEmptyRows.length > 1) {
      // Likely a title banner row like "SALES REPORT 2025"
      continue;
    }

    let score = filledCells.length * 2;
    for (const cell of filledCells) {
      const lower = cell.toLowerCase().trim();
      // Header cells are usually short text labels, not pure numbers
      if (!/^-?\d+(\.\d+)?$/.test(lower) && lower.length <= 45) {
        score += 3;
      }
      const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
      if (tokens.some((t) => HEADER_HINT_WORDS.has(t))) {
        score += 6;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidateIdx = i;
    }
  }

  const headerEntry = nonEmptyRows[bestCandidateIdx];
  const dataEntries = nonEmptyRows.slice(bestCandidateIdx + 1);

  // Determine maximum column width across header and data rows
  let maxCols = headerEntry.cells.length;
  for (const d of dataEntries) {
    if (d.cells.length > maxCols) maxCols = d.cells.length;
  }

  // Construct unique, clean column headers
  const usedHeaders = new Map<string, number>();
  const headers: string[] = [];
  for (let col = 0; col < maxCols; col++) {
    const rawHeader = (headerEntry.cells[col] || "").trim();
    const baseName = rawHeader || `Column_${col + 1}`;
    const count = usedHeaders.get(baseName.toLowerCase()) || 0;
    usedHeaders.set(baseName.toLowerCase(), count + 1);
    headers.push(count === 0 ? baseName : `${baseName}_${count + 1}`);
  }

  // Convert data rows into key-value objects
  const rows: Record<string, string>[] = [];
  for (const d of dataEntries) {
    const record: Record<string, string> = {};
    let nonBlankCount = 0;
    for (let col = 0; col < headers.length; col++) {
      const val = sanitizeCellValue(d.cells[col] ?? "");
      record[headers[col]] = val;
      if (val !== "") nonBlankCount++;
    }
    if (nonBlankCount > 0) {
      rows.push(record);
    } else {
      emptyRowsSkipped++;
    }
  }

  return {
    fileId,
    fileName,
    sheetName,
    headers,
    headerRowIndex: headerEntry.rawIndex + 1,
    rows,
    totalRawRows,
    emptyRowsSkipped,
  };
}

/**
 * High-level workbook parser accepting a File or raw Uint8Array + filename.
 */
export async function parseUploadedFile(
  fileName: string,
  fileSize: number,
  bytes: Uint8Array,
  fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
): Promise<ParsedWorkbook> {
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File "${fileName}" exceeds the 15 MB maximum size limit.`);
  }
  if (fileSize === 0 || bytes.length === 0) {
    throw new Error(`File "${fileName}" is empty.`);
  }

  const lower = fileName.toLowerCase().trim();
  const ext = ALLOWED_EXTENSIONS.find((e) => lower.endsWith(e));
  if (!ext) {
    throw new Error(
      `Unsupported file format for "${fileName}". Please upload .xlsx, .xls, or .csv files.`
    );
  }

  if (ext === ".csv") {
    const text = strFromU8(bytes);
    const grid = parseCsvGrid(text);
    const baseSheetName = fileName.replace(/\.[^.]+$/, "") || "CSV_Import";
    const parsedSheet = buildParsedSheet(fileId, fileName, baseSheetName, grid);
    return {
      fileId,
      fileName,
      fileSize,
      fileType: "csv",
      sheets: [parsedSheet],
      parseWarnings: [],
    };
  }

  if (ext === ".xlsx") {
    const { sheets, warnings } = parseXlsxBytes(bytes);
    const parsedSheets = sheets
      .map((s) => buildParsedSheet(fileId, fileName, s.name, s.grid))
      .filter((s) => s.headers.length > 0);
    return {
      fileId,
      fileName,
      fileSize,
      fileType: "xlsx",
      sheets: parsedSheets,
      parseWarnings: warnings,
    };
  }

  // .xls
  const { sheets, warnings } = parseXlsContent(bytes);
  const parsedSheets = sheets
    .map((s) => buildParsedSheet(fileId, fileName, s.name, s.grid))
    .filter((s) => s.headers.length > 0);
  return {
    fileId,
    fileName,
    fileSize,
    fileType: "xls",
    sheets: parsedSheets,
    parseWarnings: warnings,
  };
}

/**
 * Generates a real multi-sheet OpenXML (.xlsx) archive using fflate.zipSync.
 * Used for sample business migration downloads and automated tests.
 */
export function createXlsxBytesFromSheets(
  sheets: Array<{ name: string; rows: Array<Array<string | number>> }>
): Uint8Array {
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const colIndexToLetters = (idx: number): string => {
    let n = idx + 1;
    let str = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      str = String.fromCharCode(65 + rem) + str;
      n = Math.floor((n - 1) / 26);
    }
    return str;
  };

  const files: Record<string, Uint8Array> = {};

  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join("") +
      `</Types>`
  );

  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );

  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>` +
      sheets
        .map(
          (s, i) =>
            `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
        )
        .join("") +
      `</sheets>` +
      `</workbook>`
  );

  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join("") +
      `</Relationships>`
  );

  sheets.forEach((sheet, idx) => {
    const rowsXml = sheet.rows
      .map((row, rIdx) => {
        const cellsXml = row
          .map((cell, cIdx) => {
            const ref = `${colIndexToLetters(cIdx)}${rIdx + 1}`;
            if (typeof cell === "number" && Number.isFinite(cell)) {
              return `<c r="${ref}" t="n"><v>${cell}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(cell ?? ""))}</t></is></c>`;
          })
          .join("");
        return `<row r="${rIdx + 1}">${cellsXml}</row>`;
      })
      .join("");

    files[`xl/worksheets/sheet${idx + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${rowsXml}</sheetData>` +
        `</worksheet>`
    );
  });

  return zipSync(files);
}
