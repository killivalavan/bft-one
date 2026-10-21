import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatCafeName } from "./bakerUtils";

export interface StatementPdfData {
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  date: string;
  totalBilled: number;
  totalPaid: number;
  outstandingBalance: number;
  invoices: Array<{
    invoiceNumber: string;
    date: string;
    items?: Array<{ name: string; qty: number; rate: number; amount: number; unit?: string }>;
    totalAmount: number;
    status: string;
  }>;
  payments?: Array<{
    date: string;
    amount: number;
    paymentMode: string;
    notes?: string;
    invoiceNumber?: string;
  }>;
  upiId?: string;
}

export function generateStatementPdf(data: StatementPdfData): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftMargin = 14;
  const rightMargin = 14;
  const contentWidth = pageWidth - leftMargin - rightMargin;
  const fontName = "helvetica";
  const sym = "Rs. ";

  // 1. TOP HEADER - Royal Blue Accent Bar
  doc.setFillColor(37, 99, 235); // #2563EB
  doc.rect(0, 0, pageWidth, 5, "F");

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

  drawBackgroundWatermark();

  let currentY = 14;

  // Header Left: Business Name & Title
  doc.setFont(fontName, "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // #0F172A
  doc.text(formatCafeName(data.businessName || "Royal Baker"), leftMargin, currentY);

  doc.setFont(fontName, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // #64748B
  let bizSubY = currentY + 4.5;
  if (data.businessAddress) {
    const addLines = doc.splitTextToSize(data.businessAddress, contentWidth * 0.55);
    doc.text(addLines, leftMargin, bizSubY);
    bizSubY += addLines.length * 4;
  }
  if (data.businessPhone) {
    doc.text(`Phone: ${data.businessPhone}`, leftMargin, bizSubY);
    bizSubY += 4;
  }

  // Header Right: STATEMENT OF ACCOUNT Badge & Date
  const rightX = pageWidth - rightMargin;
  doc.setFont(fontName, "bold");
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("ACCOUNT STATEMENT", rightX, currentY, { align: "right" });

  doc.setFont(fontName, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated Date: ${data.date}`, rightX, currentY + 5, { align: "right" });

  currentY = Math.max(bizSubY + 3, currentY + 14);

  // 2. CLIENT RECIPIENT BOX
  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.setLineWidth(0.3);
  doc.roundedRect(leftMargin, currentY, contentWidth, 20, 2, 2, "FD");

  doc.setFont(fontName, "bold");
  doc.setFontSize(8);
  doc.setTextColor(37, 99, 235);
  doc.text("STATEMENT FOR / CAFÉ DETAILS", leftMargin + 4, currentY + 5);

  doc.setFont(fontName, "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCafeName(data.customerName), leftMargin + 4, currentY + 11);

  doc.setFont(fontName, "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const clientMeta = [data.customerPhone, data.customerAddress].filter(Boolean).join("  •  ");
  doc.text(clientMeta || "Connected Partner Café", leftMargin + 4, currentY + 16);

  currentY += 25;

  // 3. FINANCIAL SUMMARY METRIC CARDS
  const cardWidth = (contentWidth - 6) / 3;

  // Card 1: Total Billed
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftMargin, currentY, cardWidth, 16, 2, 2, "FD");
  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("LIFETIME BILLED", leftMargin + 3.5, currentY + 5);
  doc.setFont(fontName, "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${sym}${data.totalBilled.toLocaleString("en-IN")}`, leftMargin + 3.5, currentY + 12);

  // Card 2: Total Paid
  const card2X = leftMargin + cardWidth + 3;
  doc.setFillColor(236, 253, 245); // Emerald-50
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(card2X, currentY, cardWidth, 16, 2, 2, "FD");
  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(4, 120, 87);
  doc.text("TOTAL SETTLED / PAID", card2X + 3.5, currentY + 5);
  doc.setFont(fontName, "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(6, 95, 70);
  doc.text(`${sym}${data.totalPaid.toLocaleString("en-IN")}`, card2X + 3.5, currentY + 12);

  // Card 3: Pending Balance
  const card3X = card2X + cardWidth + 3;
  const isDue = data.outstandingBalance > 0;
  if (isDue) {
    doc.setFillColor(255, 241, 242); // Rose-50
    doc.setDrawColor(254, 205, 211);
  } else {
    doc.setFillColor(241, 245, 249); // Slate-100
    doc.setDrawColor(226, 232, 240);
  }
  doc.roundedRect(card3X, currentY, cardWidth, 16, 2, 2, "FD");
  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(isDue ? 190 : 71, isDue ? 18 : 85, isDue ? 60 : 105);
  doc.text("PENDING DUE BALANCE", card3X + 3.5, currentY + 5);
  doc.setFont(fontName, "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(isDue ? 225 : 15, isDue ? 29 : 23, isDue ? 72 : 42);
  doc.text(`${sym}${data.outstandingBalance.toLocaleString("en-IN")}`, card3X + 3.5, currentY + 12);

  currentY += 21;

  // 4. ITEMISED PURCHASE & DELIVERY SLIPS TABLE
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("DELIVERY & PURCHASE HISTORY", leftMargin, currentY);
  currentY += 2.5;

  const tableBody = (data.invoices || []).map((inv, index) => {
    // Format items purchased
    const itemsText = (inv.items || [])
      .map((it) => `${it.qty}x ${it.name} (@ Rs. ${it.rate})`)
      .join("\n");

    return [
      String(index + 1),
      inv.date,
      inv.invoiceNumber,
      itemsText || "Bakery Assorted Items",
      `${sym}${inv.totalAmount.toLocaleString("en-IN")}`,
      inv.status === "paid" ? "PAID" : "PENDING",
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    head: [["#", "Date", "Slip No.", "Items Dispatched & Rates", "Amount (Rs.)", "Status"]],
    body: tableBody.length > 0 ? tableBody : [["-", "-", "-", "No delivery slips recorded", "-", "-"]],
    theme: "grid",
    styles: {
      font: fontName,
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      valign: "middle",
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 24, halign: "center", fontStyle: "bold" },
      3: { cellWidth: contentWidth - 8 - 20 - 24 - 26 - 20, halign: "left" },
      4: { cellWidth: 26, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 20, halign: "center", fontStyle: "bold" },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  let afterTableY = (doc as any).lastAutoTable?.finalY || currentY + 30;

  // 5. PAYMENTS / SETTLEMENTS HISTORY (IF AVAILABLE)
  if (data.payments && data.payments.length > 0) {
    if (afterTableY > pageHeight - 50) {
      doc.addPage();
      afterTableY = 16;
    } else {
      afterTableY += 7;
    }

    doc.setFont(fontName, "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("RECORDED SETTLEMENTS & PAYMENTS RECEIVED", leftMargin, afterTableY);
    afterTableY += 2.5;

    const payRows = data.payments.map((p, idx) => [
      String(idx + 1),
      p.date,
      p.paymentMode,
      p.notes || "Account Payment",
      `${sym}${p.amount.toLocaleString("en-IN")}`,
    ]);

    autoTable(doc, {
      startY: afterTableY,
      margin: { left: leftMargin, right: rightMargin },
      head: [["#", "Payment Date", "Payment Mode", "Notes / Details", "Amount Paid (Rs.)"]],
      body: payRows,
      theme: "grid",
      styles: {
        font: fontName,
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 2,
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: [16, 185, 129], // Emerald
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 24, halign: "center" },
        2: { cellWidth: 32, halign: "center" },
        3: { cellWidth: contentWidth - 8 - 24 - 32 - 28, halign: "left" },
        4: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      },
    });

    afterTableY = (doc as any).lastAutoTable?.finalY || afterTableY + 25;
  }

  // 6. SETTLEMENT NOTE & UPI FOOTER
  if (afterTableY > pageHeight - 40) {
    doc.addPage();
    afterTableY = 16;
  } else {
    afterTableY += 8;
  }

  doc.setFillColor(239, 246, 255); // #EFF6FF
  doc.setDrawColor(219, 234, 254);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftMargin, afterTableY, contentWidth, 18, 2, 2, "FD");

  doc.setFont(fontName, "bold");
  doc.setFontSize(8);
  doc.setTextColor(37, 99, 235);
  doc.text("PAYMENT INSTRUCTIONS", leftMargin + 3.5, afterTableY + 5);

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const upiText = data.upiId
    ? `Please settle pending due balance to UPI ID: ${data.upiId} or via direct cash.`
    : `Please confirm and settle any pending balances with ${data.businessName}.`;
  doc.text(upiText, leftMargin + 3.5, afterTableY + 10);
  doc.text("Thank you for your valued partnership and regular orders!", leftMargin + 3.5, afterTableY + 14.5);

  // Bottom Branding Line
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Generated electronically via SeyalPro • Confidential Account Statement",
    pageWidth / 2,
    pageHeight - 6,
    { align: "center" }
  );

  // Save the PDF
  const safeCustomerName = data.customerName.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Statement_${safeCustomerName}_${format(new Date(), "yyyyMMdd")}.pdf`);
}
