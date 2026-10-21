import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatCafeName, capitalizeWords } from "./bakerUtils";
import { loadImageData } from "./billPdf";

export interface CombinedLedgerTransaction {
  date: string;
  slipNumber: string;
  isReturn: boolean;
  storeName?: string;
  productName: string;
  qty: number;
  unit?: string;
  rate: number;
  amount: number;
  notes?: string;
}

export interface CombinedLedgerPdfData {
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  upiId?: string;
  logoUrl?: string | null;
  mode?: "client" | "store" | "consolidated";
  entityName: string;
  parentClientName?: string;
  phone?: string;
  address?: string;
  periodLabel: string;
  exportDate: string;
  totalDeliveredSlips: number;
  totalDeliveredQty: number;
  totalDeliveryValue: number;
  totalReturnedSlips: number;
  totalReturnedQty: number;
  totalReturnValue: number;
  netPeriodValue: number;
  outstandingBalance?: number;
  linkedStores?: string[];
  transactions: CombinedLedgerTransaction[];
}

export async function generateCombinedLedgerPdf(data: CombinedLedgerPdfData): Promise<void> {
  // Resolve business logo from data or tenant profile cache
  let resolvedLogoUrl = data.logoUrl;
  if (!resolvedLogoUrl && typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem("bftone_tenant_cache");
      if (cached) {
        const p = JSON.parse(cached);
        if (p?.logo_url) resolvedLogoUrl = p.logo_url;
      }
      if (!resolvedLogoUrl) {
        const activeId = localStorage.getItem("bftone_active_tenant_id");
        if (activeId) {
          const extra = localStorage.getItem(`bftone_tenant_extra_${activeId}`);
          if (extra) {
            const p = JSON.parse(extra);
            if (p?.logo_url) resolvedLogoUrl = p.logo_url;
          }
        }
      }
    } catch {}
  }
  if (!resolvedLogoUrl) {
    resolvedLogoUrl = "/dummy-logo.svg?v=5";
  } else if (resolvedLogoUrl.startsWith("/dummy-logo.svg") && !resolvedLogoUrl.includes("?")) {
    resolvedLogoUrl = "/dummy-logo.svg?v=5";
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftMargin = 12;
  const rightMargin = 12;
  const contentWidth = pageWidth - leftMargin - rightMargin;
  const fontName = "helvetica";
  const sym = "Rs. ";

  // 1. TOP ACCENT BAR - SeyalPro Royal Blue
  doc.setFillColor(37, 99, 235); // #2563EB
  doc.rect(0, 0, pageWidth, 4.5, "F");

  // Background Watermark: "SeyalPro" - Prominently & elegantly branded
  const drawBackgroundWatermark = () => {
    try {
      if (typeof (doc as any).saveGraphicsState === "function") {
        (doc as any).saveGraphicsState();
      }
      doc.setFont(fontName, "bold");
      doc.setFontSize(48);
      doc.setTextColor(226, 234, 246); // Clean slate-blue tint (#E2EAF6), visible and legible
      doc.text("SeyalPro", pageWidth / 2, pageHeight / 2 - 2, {
        align: "center",
        angle: 30,
      });

      doc.setFontSize(11);
      doc.setFont(fontName, "bold");
      doc.setTextColor(230, 238, 248);
      doc.text("B2B STORE & DISPATCH INTELLIGENCE", pageWidth / 2, pageHeight / 2 + 13, {
        align: "center",
        angle: 30,
      });
      if (typeof (doc as any).restoreGraphicsState === "function") {
        (doc as any).restoreGraphicsState();
      }
    } catch (e) {
      console.warn("Watermark render error:", e);
    }
  };

  // Draw watermark on Page 1
  drawBackgroundWatermark();

  let currentY = 13;

  // Header Left: Business Name & Details
  doc.setFont(fontName, "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // #0F172A
  doc.text(formatCafeName(data.businessName || "SeyalPro Dispatch"), leftMargin, currentY);

  doc.setFont(fontName, "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // #64748B
  let bizSubY = currentY + 4;
  if (data.businessAddress) {
    const addLines = doc.splitTextToSize(data.businessAddress, contentWidth * 0.45);
    doc.text(addLines, leftMargin, bizSubY);
    bizSubY += addLines.length * 3.5;
  }
  if (data.businessPhone) {
    doc.text(`Phone: ${data.businessPhone}`, leftMargin, bizSubY);
    bizSubY += 3.5;
  }

  // Header Right: Logo & Statement Title
  let logoData: { dataUrl: string; width: number; height: number } | null = null;
  if (resolvedLogoUrl) {
    try {
      logoData = await loadImageData(resolvedLogoUrl);
    } catch (e) {
      console.warn("Ledger logo load warning:", e);
    }
  }

  const maxLogoW = 28;
  const maxLogoH = 20;
  let drawW = 0;
  let drawH = 0;
  let logoX = pageWidth - rightMargin;
  let logoY = 7;

  if (logoData) {
    const aspect = logoData.width / logoData.height;
    drawW = maxLogoW;
    drawH = drawW / aspect;
    if (drawH > maxLogoH) {
      drawH = maxLogoH;
      drawW = drawH * aspect;
    }
    logoX = pageWidth - rightMargin - drawW;
    logoY = 7 + (maxLogoH - drawH) / 2;
    doc.addImage(logoData.dataUrl, "PNG", logoX, logoY, drawW, drawH);
  } else if (data.businessName) {
    // Fallback monogram badge if image can't be fetched
    const badgeSize = 18;
    drawW = badgeSize;
    logoX = pageWidth - rightMargin - badgeSize;
    logoY = 8;
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(logoX, logoY, badgeSize, badgeSize, 3, 3, "F");
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.3);
    doc.roundedRect(logoX, logoY, badgeSize, badgeSize, 3, 3, "S");
    doc.setFont(fontName, "bold");
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235);
    const initials = data.businessName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "SP";
    doc.text(initials, logoX + badgeSize / 2, logoY + badgeSize / 2 + 3, { align: "center" });
  }

  const rightTextX = logoX - 4;
  doc.setFont(fontName, "bold");
  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235);
  doc.text("CLIENT LEDGER STATEMENT", rightTextX, currentY, { align: "right" });

  doc.setFont(fontName, "bold");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Period: ${data.periodLabel}`, rightTextX, currentY + 4.5, { align: "right" });

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Exported: ${data.exportDate}`, rightTextX, currentY + 8.5, { align: "right" });

  currentY = Math.max(bizSubY + 3, currentY + 14, (logoY + (drawH || 18)) + 3);

  // 2. RECIPIENT ENTITY DETAILS BOX
  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.setLineWidth(0.3);
  doc.roundedRect(leftMargin, currentY, contentWidth, 18, 2, 2, "FD");

  doc.setFont(fontName, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(37, 99, 235);
  doc.text("CLIENT / ACCOUNT DETAILS", leftMargin + 3.5, currentY + 4.5);

  doc.setFont(fontName, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCafeName(data.entityName), leftMargin + 3.5, currentY + 10);

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const metaParts = [data.phone, data.address].filter(Boolean);
  doc.text(metaParts.join("   •   ") || "Commercial Partner Client", leftMargin + 3.5, currentY + 14.5);

  currentY += 22;

  // 3. FINANCIAL & VOLUME SUMMARY CARDS (4 Cards Grid)
  const gap = 2.5;
  const cardW = (contentWidth - gap * 3) / 4;
  const cardH = 14;

  // Card 1: Deliveries
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftMargin, currentY, cardW, cardH, 1.5, 1.5, "FD");
  doc.setFont(fontName, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text("DELIVERIES (SLIPS / UNITS)", leftMargin + 2.5, currentY + 4);
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`${data.totalDeliveredSlips} Slips • ${data.totalDeliveredQty} pcs`, leftMargin + 2.5, currentY + 10);

  // Card 2: Returns
  const c2X = leftMargin + cardW + gap;
  doc.setFillColor(254, 243, 199); // amber-50
  doc.setDrawColor(253, 230, 138); // amber-200
  doc.roundedRect(c2X, currentY, cardW, cardH, 1.5, 1.5, "FD");
  doc.setFont(fontName, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(180, 83, 9); // amber-700
  doc.text("RETURNS (SLIPS / UNITS)", c2X + 2.5, currentY + 4);
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(146, 64, 14); // amber-800
  doc.text(`${data.totalReturnedSlips} Slips • ${data.totalReturnedQty} pcs`, c2X + 2.5, currentY + 10);

  // Card 3: Gross Delivery Value
  const c3X = c2X + cardW + gap;
  doc.setFillColor(239, 246, 255); // blue-50
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(c3X, currentY, cardW, cardH, 1.5, 1.5, "FD");
  doc.setFont(fontName, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(29, 78, 216);
  doc.text("GROSS DISPATCH VALUE", c3X + 2.5, currentY + 4);
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 58, 138);
  doc.text(`${sym}${data.totalDeliveryValue.toLocaleString("en-IN")}`, c3X + 2.5, currentY + 10);

  // Card 4: Net Value for Period
  const c4X = c3X + cardW + gap;
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(c4X, currentY, cardW, cardH, 1.5, 1.5, "FD");
  doc.setFont(fontName, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(4, 120, 87);
  doc.text("NET DISPATCH (LESS RETURNS)", c4X + 2.5, currentY + 4);
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(6, 95, 70);
  doc.text(`${sym}${data.netPeriodValue.toLocaleString("en-IN")}`, c4X + 2.5, currentY + 10);

  currentY += cardH + 4;

  // Outstanding Balance Banner (if present)
  if (typeof data.outstandingBalance === "number") {
    const isDue = data.outstandingBalance > 0;
    doc.setFillColor(isDue ? 255 : 248, isDue ? 241 : 250, isDue ? 242 : 252);
    doc.setDrawColor(isDue ? 254 : 226, isDue ? 205 : 232, isDue ? 211 : 240);
    doc.roundedRect(leftMargin, currentY, contentWidth, 7, 1.5, 1.5, "FD");

    doc.setFont(fontName, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(isDue ? 190 : 71, isDue ? 18 : 85, isDue ? 60 : 105);
    const balanceText = isDue
      ? `CURRENT TOTAL OUTSTANDING BALANCE DUE:  ${sym}${data.outstandingBalance.toLocaleString("en-IN")}`
      : "ACCOUNT STATUS: ALL DUES SETTLED / CLEAR";
    doc.text(balanceText, leftMargin + 3.5, currentY + 4.5);
    currentY += 10;
  }

  // 4. CHRONOLOGICAL TRANSACTION TABLE
  const tableHeaders = [["#", "Date", "Slip Ref", "Type", "Item & Rate", "Qty", "Amount (Rs.)", "Notes"]];

  const tableBody = data.transactions.map((tx, idx) => {
    const typeLabel = tx.isReturn ? "RETURN" : "DELIVERY";
    const qtyLabel = `${tx.qty} ${tx.unit || "pcs"}`;
    const amountStr = `${tx.isReturn ? "-" : ""}${sym}${Math.abs(tx.amount).toLocaleString("en-IN")}`;
    const rateStr = tx.rate > 0 ? `@ ${sym}${tx.rate}` : "";
    const itemFull = `${capitalizeWords(tx.productName)} ${rateStr}`.trim();
    const notesStr = tx.notes || (tx.isReturn ? "Return Credit" : "Delivered");

    return [
      String(idx + 1),
      tx.date,
      tx.slipNumber,
      typeLabel,
      itemFull,
      qtyLabel,
      amountStr,
      notesStr,
    ];
  });

  const colStyles = {
    0: { cellWidth: 8, halign: "center" as const },
    1: { cellWidth: 20, halign: "center" as const },
    2: { cellWidth: 25, halign: "center" as const, fontStyle: "bold" as const },
    3: { cellWidth: 18, halign: "center" as const, fontStyle: "bold" as const },
    4: { cellWidth: contentWidth - 8 - 20 - 25 - 18 - 18 - 24 - 26, halign: "left" as const },
    5: { cellWidth: 18, halign: "center" as const },
    6: { cellWidth: 24, halign: "right" as const, fontStyle: "bold" as const },
    7: { cellWidth: 26, halign: "left" as const },
  };

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    head: tableHeaders,
    body: tableBody.length > 0 ? tableBody : [["-", "-", "-", "-", "No delivery or return records found in selected period", "-", "-", "-"]],
    theme: "grid",
    showHead: "everyPage",
    styles: {
      font: fontName,
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: "middle",
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.2,
      halign: "center",
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    willDrawPage: (hookData) => {
      if (hookData.pageNumber > 1) {
        drawBackgroundWatermark();
      }
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body") {
        const isRetRow = hookData.row.raw && (hookData.row.raw as any)[3] === "RETURN";
        if (isRetRow) {
          if (hookData.column.index === 3) {
            hookData.cell.styles.textColor = [180, 83, 9]; // Amber
          }
          if (hookData.column.index === 6) {
            hookData.cell.styles.textColor = [180, 83, 9]; // Amber for deducted amount
          }
        }
      }
    },
  });

  let afterTableY = (doc as any).lastAutoTable?.finalY || currentY + 30;

  // 5. PAYMENT / UPI FOOTER
  if (afterTableY > pageHeight - 35) {
    doc.addPage();
    drawBackgroundWatermark();
    afterTableY = 16;
  } else {
    afterTableY += 6;
  }

  doc.setFillColor(239, 246, 255); // #EFF6FF
  doc.setDrawColor(219, 234, 254);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftMargin, afterTableY, contentWidth, 15, 2, 2, "FD");

  doc.setFont(fontName, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(37, 99, 235);
  doc.text("ACCOUNT & SETTLEMENT TERMS", leftMargin + 3.5, afterTableY + 4.5);

  doc.setFont(fontName, "normal");
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  const upiLine = data.upiId
    ? `Bank / UPI Payments: Settle outstanding dues to UPI ID: ${data.upiId} or registered bank account.`
    : `Please confirm ledger adjustments with ${data.businessName}.`;
  doc.text(upiLine, leftMargin + 3.5, afterTableY + 8.5);
  doc.text("Generated via SeyalPro App • Instant B2B Store Stock Inward & Settlement Tracking.", leftMargin + 3.5, afterTableY + 12);

  // 6. MULTI-PAGE PAGE NUMBERING FOOTER
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${pageCount}   •   Powered by SeyalPro App (seyalpro.com)   •   B2B Store & Dispatch Intelligence`,
      pageWidth / 2,
      pageHeight - 5,
      { align: "center" }
    );
  }

  // 7. SAVE DOCUMENT
  const safeName = data.entityName.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Statement_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`;
  doc.save(filename);
}
