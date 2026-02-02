import jsPDF from "jspdf";

export type PayslipEntry = {
    entry_date: string;
    reason: string;
    amount_cents: number;
    kind?: 'deduction' | 'addition' | 'info' | null;
};

export type PayslipData = {
    userEmail: string;
    monthLabel: string;
    baseSalary: number; // in cents
    totalDeductions: number; // in cents
    totalAdditions: number; // in cents
    netPay: number; // in cents
    entries: PayslipEntry[];
    logoUrl?: string;
    leaveDays?: number;
};

export async function generatePayslipPdf(data: PayslipData) {
    const doc = new jsPDF();
    const { userEmail, monthLabel, baseSalary, totalDeductions, totalAdditions, netPay, entries, logoUrl = "/logo_payslip.jpg" } = data;

    // Load Logo
    try {
        const logoImg = new Image();
        logoImg.src = logoUrl;
        await new Promise((resolve, reject) => {
            logoImg.onload = resolve;
            logoImg.onerror = reject;
        });

        const logoW = 30;
        const logoH = 30 * (logoImg.height / logoImg.width);
        doc.addImage(logoImg, 'JPEG', 170, 10, logoW, logoH);
    } catch (e) {
        console.warn("Logo failed to load for info pdf", e);
    }

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Brown Fening Tea", 10, 20);

    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Payslip - ${monthLabel}`, 10, 28);

    // Line
    doc.setDrawColor(200);
    doc.line(10, 35, 200, 35);

    // Employee Info
    const rawName = userEmail.split('@')[0];
    const empName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    doc.setFontSize(10);
    doc.text(`Employee: ${empName}`, 10, 45);
    doc.text(`Pay Period: ${monthLabel}`, 10, 50);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 10, 55);
    if (data.leaveDays !== undefined) {
        doc.text(`Total Leaves: ${data.leaveDays}`, 150, 45); // Right side roughly
    }

    // Summary Box
    const summaryY = 65;
    doc.setFillColor(245, 247, 250); // neutral-50ish
    doc.rect(10, summaryY, 190, 25, 'F');

    doc.setFontSize(10);
    doc.text("Base Salary", 20, summaryY + 8);
    doc.text("Additions", 70, summaryY + 8);
    doc.text("Deductions", 120, summaryY + 8);
    doc.text("Net Pay", 170, summaryY + 8);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Rs ${(baseSalary / 100).toFixed(2)}`, 20, summaryY + 18);

    doc.setTextColor(22, 163, 74); // green for additions
    doc.text(`Rs ${(totalAdditions / 100).toFixed(2)}`, 70, summaryY + 18);

    doc.setTextColor(220, 38, 38); // red for deductions
    doc.text(`Rs ${(totalDeductions / 100).toFixed(2)}`, 120, summaryY + 18);

    doc.setTextColor(0, 0, 0); // reset
    doc.text(`Rs ${(netPay / 100).toFixed(2)}`, 170, summaryY + 18);

    // Entries Table
    let y = summaryY + 35;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Salary Details", 10, y);
    y += 5;

    // Table Header
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y, 190, 8, 'F');
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Date", 15, y + 5);
    doc.text("Description", 50, y + 5);
    doc.text("Type", 130, y + 5);
    doc.text("Amount", 180, y + 5, { align: 'right' });
    y += 14;

    // Rows
    doc.setFont("helvetica", "normal");
    entries.forEach((e) => {
        if (y > 280) { doc.addPage(); y = 20; }

        // Default flags
        let isNegative = false;
        let isInfo = false;

        // Determine type based on kind or fallback
        if (e.kind === 'deduction') isNegative = true;
        else if (e.kind === 'addition') isNegative = false;
        else if (e.kind === 'info') isInfo = true;
        else {
            // Fallback based on keywords
            const r = e.reason.toLowerCase();
            if (r.includes('deduction') || r.includes('advance') || r.includes('leave') || r.includes('late') || r.includes('half day')) {
                isNegative = true;
            }
        }

        doc.setTextColor(0, 0, 0);
        doc.text(e.entry_date, 15, y);
        doc.text(e.reason, 50, y);

        if (isInfo) {
            doc.setTextColor(100, 116, 139); // Slate-500
            doc.text("Week Off", 130, y);
            doc.text("-", 180, y, { align: 'right' });
        } else if (isNegative) {
            doc.setTextColor(220, 38, 38);
            doc.text("Deduction", 130, y);
            doc.text(`- Rs ${(e.amount_cents / 100).toFixed(2)}`, 180, y, { align: 'right' });
        } else {
            doc.setTextColor(22, 163, 74);
            doc.text("Addition", 130, y);
            doc.text(`+ Rs ${(e.amount_cents / 100).toFixed(2)}`, 180, y, { align: 'right' });
        }

        y += 7;
        // Light separator
        doc.setDrawColor(240);
        doc.line(10, y - 4, 200, y - 4);
    });

    if (entries.length === 0) {
        doc.setTextColor(150);
        doc.text("No salary entries found for this period.", 15, y);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Generated by BFT One System", 105, 290, { align: 'center' });

    doc.save(`Payslip_${monthLabel.replace(' ', '_')}_${empName}.pdf`);
}
