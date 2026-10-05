import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { numberToIndianRupeesWords } from "./numberToWords";

export type InvoiceItem = {
  name: string;
  qty: number;
  unit?: string;
  rate: number; // in rupees
  amount: number; // in rupees
};

export type BillPdfData = {
  orderId: string;
  items: Array<{
    name: string;
    qty: number;
    price_cents?: number;
    rate?: number;
    amount?: number;
    unit?: string;
  }>;
  subtotalCents?: number;
  subtotal?: number;
  taxCents?: number;
  taxRate?: number;
  taxAmount?: number;
  totalCents?: number;
  totalAmount?: number;
  paymentMode?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  date?: string;
  dueDate?: string;
  invoiceTitle?: string;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessGstin?: string;
  bankDetails?: {
    bankName?: string;
    accountNo?: string;
    ifsc?: string;
    branch?: string;
  };
  upiDetails?: {
    upiId?: string;
    payeeName?: string;
  };
  logoUrl?: string | null;
  signatureUrl?: string | null;
  currencySymbol?: string;
  tdsAmount?: number;
  tdsCents?: number;
  discountAmount?: number;
  additionalCharges?: number;
  customAdjustments?: Array<{
    label: string;
    amount: number;
    type: "deduction" | "addition";
  }>;
};

// In-memory cache for TTF fonts to avoid re-fetching
let cachedRobotoRegular: string | null = null;
let cachedRobotoBold: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

async function fetchFontAsBase64(primaryUrl: string, fallbackUrl: string): Promise<string | null> {
  try {
    const res = await fetch(primaryUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return arrayBufferToBase64(buf);
    }
  } catch {
    // try fallback
  }

  try {
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return arrayBufferToBase64(buf);
    }
  } catch (e) {
    console.warn("Could not fetch font from fallback:", fallbackUrl, e);
  }
  return null;
}

async function loadUnicodeFonts(doc: jsPDF): Promise<boolean> {
  try {
    if (!cachedRobotoRegular) {
      cachedRobotoRegular = await fetchFontAsBase64(
        "/fonts/Roboto-Regular.ttf",
        "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf"
      );
    }
    if (!cachedRobotoBold) {
      cachedRobotoBold = await fetchFontAsBase64(
        "/fonts/Roboto-Bold.ttf",
        "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf"
      );
    }

    if (cachedRobotoRegular) {
      doc.addFileToVFS("Roboto-Regular.ttf", cachedRobotoRegular);
      doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    }
    if (cachedRobotoBold) {
      doc.addFileToVFS("Roboto-Bold.ttf", cachedRobotoBold);
      doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
    }

    return !!(cachedRobotoRegular && cachedRobotoBold);
  } catch (e) {
    console.warn("Unicode font load error in PDF, using fallback:", e);
    return false;
  }
}

// Helper: load image onto canvas and get PNG base64 with natural dimensions
async function loadImageData(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!url) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const nw = img.naturalWidth || img.width || 300;
        const nh = img.naturalHeight || img.height || 300;
        canvas.width = nw;
        canvas.height = nh;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, nw, nh);
          resolve({
            dataUrl: canvas.toDataURL("image/png"),
            width: nw,
            height: nh,
          });
          return;
        }
      } catch (e) {
        console.warn("Canvas export error for", url, e);
      }
      resolve(null);
    };

    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 3000);
  });
}

export function toKebabCase(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getInvoicePdfFilename(orderId?: string, businessName?: string, customerName?: string): string {
  const parts = [
    "invoice",
    toKebabCase(orderId || ""),
    toKebabCase(businessName || ""),
    toKebabCase(customerName || ""),
  ].filter(Boolean);

  const cleanParts: string[] = [];
  for (const part of parts) {
    if (part === "invoice" && cleanParts.length > 0) continue;
    cleanParts.push(part);
  }
  return (cleanParts.length > 0 ? cleanParts.join("-") : "invoice") + ".pdf";
}

export async function generateBillPdf(data: BillPdfData) {
  const {
    orderId,
    items = [],
    customerName = "Protechsoft Technologies Pvt Ltd",
    customerPhone = "",
    customerAddress = "PACIFICA TECH PARK, Survey No.76, No.23, 2nd Floor, Block-1, Module No.2E, Core-3, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130",
    customerGstin = "",
    date = new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
    dueDate,
    invoiceTitle,
    businessName = "Brown fening tea",
    businessAddress = "255, Rajiv Gandhi Salai (OMR), Navalur,\nChennai,\nTamil Nadu, India - 600130",
    businessPhone = "+91 98765 43210",
    businessGstin = "",
    bankDetails,
    upiDetails,
    logoUrl = null,
    signatureUrl = "/default-signature.svg",
  } = data;

  // Compute values in Rupees
  const rawSubtotal = data.subtotal !== undefined
    ? data.subtotal
    : (data.subtotalCents !== undefined ? data.subtotalCents / 100 : 0);

  const rawTax = data.taxAmount !== undefined
    ? data.taxAmount
    : (data.taxCents !== undefined ? data.taxCents / 100 : 0);

  const rawTds = data.tdsAmount !== undefined
    ? data.tdsAmount
    : (data.tdsCents !== undefined ? data.tdsCents / 100 : 0);

  const rawDiscount = data.discountAmount || 0;
  const rawAdditional = data.additionalCharges || 0;

  const rawTotal = data.totalAmount !== undefined
    ? data.totalAmount
    : (data.totalCents !== undefined ? data.totalCents / 100 : (rawSubtotal + rawTax - rawTds - rawDiscount + rawAdditional));

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Load and register Unicode font for native Rupee symbol support
  const hasUnicode = await loadUnicodeFonts(doc);
  const fontName = hasUnicode ? "Roboto" : "helvetica";
  const sym = hasUnicode ? "₹" : "Rs. ";

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftMargin = 14;
  const rightMargin = 14;
  const contentWidth = pageWidth - leftMargin - rightMargin;

  // Title string (e.g. INVOICE AUG 2026)
  const now = new Date();
  const monthYearStr = now.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
  const titleText = invoiceTitle || `INVOICE ${monthYearStr}`;
  const dueText = dueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  let currentY = 16;

  // Background Watermark: "Powered by SeyalPro"
  const drawBackgroundWatermark = () => {
    doc.setFont(fontName, "bold");
    doc.setFontSize(32);
    doc.setTextColor(242, 246, 253); // Very faint subtle tint
    doc.text("Powered by SeyalPro", pageWidth / 2, pageHeight / 2 + 10, {
      align: "center",
      angle: 28,
    });
  };

  drawBackgroundWatermark();

  // ========================================================
  // 1. TOP HEADER: INVOICE TITLE + METADATA & RIGHT LOGO
  // ========================================================
  doc.setFont(fontName, "bold");
  doc.setFontSize(22);
  doc.setTextColor(37, 99, 235); // #2563EB Brand Blue (Matches UI)
  doc.text(titleText, leftMargin, currentY);

  currentY += 8;

  // Invoice No #
  doc.setFontSize(9);
  doc.setFont(fontName, "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Invoice No #", leftMargin, currentY);
  doc.setFont(fontName, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(orderId, leftMargin + 26, currentY);
  currentY += 5;

  // Invoice Date
  doc.setFont(fontName, "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Invoice Date", leftMargin, currentY);
  doc.setFont(fontName, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(date, leftMargin + 26, currentY);
  currentY += 5;

  // Due Date
  doc.setFont(fontName, "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Due Date", leftMargin, currentY);
  doc.setFont(fontName, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(dueText, leftMargin + 26, currentY);

  // Logo with perfect aspect-ratio preserving fit (No pressing/stretching)
  if (logoUrl) {
    try {
      const logoData = await loadImageData(logoUrl);
      if (logoData) {
        const maxW = 34;
        const maxH = 26;
        const imgAspect = logoData.width / logoData.height;

        let drawW = maxW;
        let drawH = drawW / imgAspect;
        if (drawH > maxH) {
          drawH = maxH;
          drawW = drawH * imgAspect;
        }

        const logoX = pageWidth - rightMargin - drawW;
        const logoY = 14 + (maxH - drawH) / 2;
        doc.addImage(logoData.dataUrl, "PNG", logoX, logoY, drawW, drawH);
      }
    } catch (e) {
      console.warn("Logo rendering skipped in PDF:", e);
    }
  }

  currentY += 12;

  // ========================================================
  // 2. BILLED BY & BILLED TO (Same Soft Blue Background, No Border)
  // ========================================================
  const cardGap = 8;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 36;
  const cardY = currentY;

  // --- Left Card: Billed By (Soft Blue, No Border) ---
  doc.setFillColor(239, 246, 255); // #EFF6FF Soft Blue
  doc.roundedRect(leftMargin, cardY, cardWidth, cardHeight, 2.5, 2.5, "F");

  doc.setFont(fontName, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(37, 99, 235); // #2563EB Brand Blue
  doc.text("Billed By", leftMargin + 4, cardY + 5.5);

  doc.setFont(fontName, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("STORE / MERCHANT", leftMargin + 21, cardY + 5.5);

  doc.setFontSize(8.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(businessName, leftMargin + 4, cardY + 11);

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const bizAddrText = businessAddress + (businessPhone ? `\nPhone: ${businessPhone}` : "") + (businessGstin ? `\nGSTIN: ${businessGstin}` : "");
  const bizAddrLines = doc.splitTextToSize(bizAddrText, cardWidth - 8);
  doc.text(bizAddrLines, leftMargin + 4, cardY + 15.5);

  // --- Right Card: Billed To (Same Soft Blue, No Border) ---
  const rightCardX = leftMargin + cardWidth + cardGap;
  doc.setFillColor(239, 246, 255); // #EFF6FF Same Soft Blue as Billed By
  doc.roundedRect(rightCardX, cardY, cardWidth, cardHeight, 2.5, 2.5, "F");

  doc.setFont(fontName, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(37, 99, 235); // #2563EB Brand Blue
  doc.text("Billed To", rightCardX + 4, cardY + 5.5);

  doc.setFont(fontName, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("CLIENT / RECIPIENT", rightCardX + 21, cardY + 5.5);

  doc.setFontSize(8.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(customerName, rightCardX + 4, cardY + 11);

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const custAddrFormatted = customerAddress + (customerPhone ? `\nPhone: ${customerPhone}` : "") + (customerGstin ? `\nGSTIN: ${customerGstin}` : "");
  const custAddrLines = doc.splitTextToSize(custAddrFormatted, cardWidth - 8);
  doc.text(custAddrLines, rightCardX + 4, cardY + 15.5);

  currentY = cardY + cardHeight + 8;

  // ========================================================
  // 3. TABLE: ITEMS, QUANTITY, RATE, AMOUNT (Centered Alignment & ₹)
  // ========================================================
  const tableBody = items.map((it, idx) => {
    const rateVal = it.rate !== undefined ? it.rate : (it.price_cents ? it.price_cents / 100 : 0);
    const amtVal = it.amount !== undefined ? it.amount : rateVal * it.qty;

    return [
      `${idx + 1}.   ${it.name}${it.unit ? ` (${it.unit})` : ""}`,
      it.qty.toLocaleString("en-IN"),
      `${sym}${rateVal.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      `${sym}${amtVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [[
      { content: "Item", styles: { halign: "left" } },
      { content: "Quantity", styles: { halign: "center" } },
      { content: `Rate (${sym})`, styles: { halign: "center" } },
      { content: `Amount (${sym})`, styles: { halign: "center" } },
    ]],
    body: tableBody,
    margin: { left: leftMargin, right: rightMargin },
    tableWidth: contentWidth,
    theme: "striped",
    headStyles: {
      fillColor: [37, 99, 235], // #2563EB Theme Blue
      textColor: [255, 255, 255], // White
      font: fontName,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 4,
      lineWidth: 0,
    },
    styles: {
      font: fontName,
      fontSize: 8.5,
      cellPadding: 4,
      textColor: [15, 23, 42],
      lineWidth: 0,
      overflow: "linebreak",
    },
    alternateRowStyles: {
      fillColor: [239, 246, 255], // #EFF6FF (Same soft blue as Billed By & Billed To)
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 28 - 38 - 42, halign: "left" },
      1: { cellWidth: 28, halign: "center" },
      2: { cellWidth: 38, halign: "center" },
      3: { cellWidth: 42, halign: "center", font: fontName, fontStyle: "bold" },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || currentY + 45;
  currentY = finalY + 7;

  // Prevent page break collision
  if (currentY > pageHeight - 75) {
    doc.addPage();
    drawBackgroundWatermark();
    currentY = 18;
  }

  // ========================================================
  // 4. TOTALS (IN WORDS) & FINANCIAL BREAKDOWN
  // ========================================================
  const totalsY = currentY;
  const wordsWidth = contentWidth * 0.52;
  const summaryX = leftMargin + wordsWidth + 6;
  const summaryValX = pageWidth - rightMargin;

  // --- Left: Total in words & Optional Bank/UPI Details ---
  const wordsText = numberToIndianRupeesWords(rawTotal);

  doc.setFontSize(8.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Total (in words) : ", leftMargin, totalsY + 4);

  doc.setFont(fontName, "normal");
  doc.setTextColor(71, 85, 105);
  const wordsLines = doc.splitTextToSize(wordsText, wordsWidth - 6);
  doc.text(wordsLines, leftMargin, totalsY + 9);

  // Bank / UPI details box under words if available
  let leftBottomY = totalsY + 12 + wordsLines.length * 4;
  if (bankDetails?.bankName || upiDetails?.upiId) {
    doc.setFillColor(239, 246, 255); // #EFF6FF
    doc.setDrawColor(219, 234, 254); // #DBEAFE
    doc.setLineWidth(0.35);
    doc.roundedRect(leftMargin, leftBottomY, wordsWidth - 4, 22, 2, 2, "FD");

    doc.setFont(fontName, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(37, 99, 235); // #2563EB Brand Blue (matches UI)
    doc.text("Payment Information", leftMargin + 3, leftBottomY + 4.5);

    doc.setFont(fontName, "normal");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    let bankStr = "";
    if (bankDetails?.bankName) bankStr += `Bank: ${bankDetails.bankName} | A/C: ${bankDetails.accountNo || "-"} | IFSC: ${bankDetails.ifsc || "-"}\n`;
    if (upiDetails?.upiId) bankStr += `UPI ID: ${upiDetails.upiId} (${upiDetails.payeeName || businessName})`;
    const bLines = doc.splitTextToSize(bankStr.trim(), wordsWidth - 10);
    doc.text(bLines, leftMargin + 3, leftBottomY + 9);
  }

  // --- Right: Amount Calculation Breakdown ---
  let rightCalcY = totalsY;
  doc.setFontSize(8.5);
  doc.setFont(fontName, "normal");
  doc.setTextColor(71, 85, 105);

  // Subtotal / Amount
  doc.text("Amount", summaryX, rightCalcY + 4);
  doc.text(`${sym}${rawSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, summaryValX, rightCalcY + 4, { align: "right" });
  rightCalcY += 5.5;

  // GST (Optional)
  if (rawTax > 0) {
    doc.text(`GST (${data.taxRate || 5}%)`, summaryX, rightCalcY + 4);
    doc.text(`${sym}${rawTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, summaryValX, rightCalcY + 4, { align: "right" });
    rightCalcY += 5.5;
  }

  // Render Custom Adjustments (or default TDS / Discount)
  if (data.customAdjustments && data.customAdjustments.length > 0) {
    data.customAdjustments.forEach(adj => {
      if (adj.amount > 0) {
        doc.text(adj.label || (adj.type === "deduction" ? "Deduction" : "Charge"), summaryX, rightCalcY + 4);
        const formatted = adj.type === "deduction"
          ? `(${sym}${adj.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })})`
          : `${sym}${adj.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        doc.text(formatted, summaryValX, rightCalcY + 4, { align: "right" });
        rightCalcY += 5.5;
      }
    });
  } else {
    // TDS (Optional)
    if (rawTds > 0) {
      doc.text("TDS", summaryX, rightCalcY + 4);
      doc.text(`(${sym}${rawTds.toLocaleString("en-IN", { minimumFractionDigits: 2 })})`, summaryValX, rightCalcY + 4, { align: "right" });
      rightCalcY += 5.5;
    }

    // Discount
    if (rawDiscount > 0) {
      doc.text("Discount", summaryX, rightCalcY + 4);
      doc.text(`(${sym}${rawDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })})`, summaryValX, rightCalcY + 4, { align: "right" });
      rightCalcY += 5.5;
    }
  }

  // Divider Line before Total
  rightCalcY += 2;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(summaryX, rightCalcY, summaryValX, rightCalcY);
  rightCalcY += 6;

  // Total Amount (Bold Black)
  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0); // Bold Black
  doc.text("Total Amount", summaryX, rightCalcY);
  doc.setFontSize(11.5);
  doc.text(`${sym}${rawTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, summaryValX, rightCalcY, { align: "right" });

  // Bottom underline
  rightCalcY += 2;
  doc.setLineWidth(0.4);
  doc.line(summaryX, rightCalcY, summaryValX, rightCalcY);

  // ========================================================
  // 5. SIGNATURE & AUTHORISED SIGNATORY (Crisp & Tight Spacing)
  // ========================================================
  const signatureY = rightCalcY + 4;
  const signatureMaxW = 56; 
  const signatureMaxH = 32; 
  const sigCenterX = summaryValX - (signatureMaxW / 2);
  let actualSigHeight = 24; // default height if image fails

  try {
    const sigData = await loadImageData(signatureUrl || "/default-signature.svg");
    if (sigData) {
      const sigAspect = sigData.width / sigData.height;
      let drawSigW = signatureMaxW;
      let drawSigH = drawSigW / sigAspect;
      if (drawSigH > signatureMaxH) {
        drawSigH = signatureMaxH;
        drawSigW = drawSigH * sigAspect;
      }
      actualSigHeight = drawSigH;
      doc.addImage(sigData.dataUrl, "PNG", sigCenterX - drawSigW / 2, signatureY, drawSigW, drawSigH);
    }
  } catch (e) {
    console.warn("Signature render error in PDF:", e);
  }

  // Authorised Signatory Text positioned right below signature image
  doc.setFont(fontName, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // #64748B (matches UI uppercase signatory)
  doc.text("AUTHORISED SIGNATORY", sigCenterX, signatureY + actualSigHeight + 4, { align: "center" });

  // --- Watermark & Branding Footer: "Powered by SeyalPro" ---
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(fontName, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // #94A3B8 Subtle slate
    doc.text("Powered by SeyalPro", pageWidth / 2, pageHeight - 7, { align: "center" });
  }

  // Download PDF file with kebab-case filename (e.g. invoice-a00018-brown-fening-tea-protechsoft-technologies-pvt-ltd.pdf)
  const finalFileName = getInvoicePdfFilename(orderId, businessName, customerName);
  doc.save(finalFileName);
  return finalFileName;
}
