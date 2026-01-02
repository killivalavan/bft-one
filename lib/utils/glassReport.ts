import jsPDF from "jspdf";

type GlassLog = {
    id: string;
    created_at: string;
    log_date: string;
    shift: "morning" | "night";
    small_count: number;
    large_count: number;
    broken_count: number;
    user_id?: string | null;
    broken_reasons?: string[] | null;
    submitter_name?: string; // We'll inject this before passing to report
};

export async function generateGlassReportPdf(logs: GlassLog[]) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // --- Data Aggregation ---
    const logsByDate = new Map<string, { m?: GlassLog, n?: GlassLog }>();
    logs.forEach(l => {
        const entry = logsByDate.get(l.log_date) || {};
        if (l.shift === 'morning') entry.m = l; else entry.n = l;
        logsByDate.set(l.log_date, entry);
    });

    // Compute Daily Broken
    const dailyData: { date: string, broken: number }[] = [];
    logsByDate.forEach((v, k) => {
        const bSmall = Math.max((v.m?.small_count || 0) - (v.n?.small_count || 0), 0);
        const bLarge = Math.max((v.m?.large_count || 0) - (v.n?.large_count || 0), 0);
        if (v.n) dailyData.push({ date: k, broken: bSmall + bLarge });
    });
    // Sort Date Ascending for charts
    dailyData.sort((a, b) => a.date.localeCompare(b.date));

    // Monthly Aggregation
    const monthlyData = new Map<string, number>();
    dailyData.forEach(d => {
        const key = d.date.slice(0, 7); // YYYY-MM
        monthlyData.set(key, (monthlyData.get(key) || 0) + d.broken);
    });
    const monthlyArr = Array.from(monthlyData.entries()).map(([k, v]) => ({ key: k, val: v })).sort((a, b) => a.key.localeCompare(b.key));

    // Yearly Aggregation
    const yearlyData = new Map<string, number>();
    dailyData.forEach(d => {
        const key = d.date.slice(0, 4); // YYYY
        yearlyData.set(key, (yearlyData.get(key) || 0) + d.broken);
    });
    const yearlyArr = Array.from(yearlyData.entries()).map(([k, v]) => ({ key: k, val: v })).sort((a, b) => a.key.localeCompare(b.key));

    // --- PDF Generation Helpers ---
    let y = 20;

    const addTitle = (text: string) => {
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(text, 14, y);
        y += 10;
    };

    const addSection = (text: string) => {
        if (y > pageHeight - 40) { doc.addPage(); y = 20; }
        y += 5;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(text, 14, y);
        y += 8;
        doc.setDrawColor(200);
        doc.line(14, y - 3, pageWidth - 14, y - 3);
    };

    // --- Chart Drawing Function ---
    const drawBarChart = (title: string, data: { key: string, val: number }[]) => {
        if (y > pageHeight - 80 && data.length > 0) { doc.addPage(); y = 20; }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(title, 14, y);
        y += 10;

        if (data.length === 0) {
            doc.setFont("helvetica", "normal");
            doc.text("No data available.", 14, y);
            y += 10;
            return;
        }

        const chartH = 50;
        const startX = 20;
        const maxVal = Math.max(...data.map(d => d.val), 5); // min scale 5
        const scale = chartH / maxVal;
        const barWidth = Math.min(15, (pageWidth - 40) / data.length - 2);

        // Draw Axis
        doc.setDrawColor(150);
        doc.line(startX, y, startX, y + chartH); // Y-Axis
        doc.line(startX, y + chartH, pageWidth - 14, y + chartH); // X-Axis

        // Draw Bars
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");

        data.forEach((d, i) => {
            const barH = d.val * scale;
            const x = startX + 5 + (i * (barWidth + 2));

            if (barH > 0) {
                // Determine color based on intensity? Or just one color.
                // Lets use a nice blue
                doc.setFillColor(59, 130, 246); // sky-500
                doc.rect(x, y + chartH - barH, barWidth, barH, "F");

                // Value Label
                doc.setTextColor(0, 0, 0);
                doc.text(d.val.toString(), x + (barWidth / 2), y + chartH - barH - 2, { align: "center" });
            }

            // X Label
            doc.text(d.key, x + (barWidth / 2), y + chartH + 4, { align: "center", angle: 45 });
        });

        y += chartH + 20; // Space after chart
    };

    // --- Page 1: Summary & Charts ---
    addTitle("Glass Broken Report");

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, y);
    y += 10;

    // 1. Yearly Chart
    drawBarChart("Yearly Broken Glass", yearlyArr);

    // 2. Monthly Chart (Last 12 months if too many?) - Let's show all for now or slice
    drawBarChart("Monthly Broken Glass", monthlyArr.slice(-12)); // Show last 12 months to fit

    // 3. Daily Chart (Last 14-30 days)
    drawBarChart("Daily Broken Glass (Last 14 Days)", dailyData.slice(-14).map(d => ({ key: d.date.slice(5), val: d.broken })));

    // --- Page 2+: Detailed Data Table ---
    doc.addPage();
    y = 20;
    addTitle("Detailed Logs");

    // Table Header
    const headers = ["Date", "Shift", "Small", "Large", "Broken", "Submitter"];
    const colX = [14, 45, 70, 90, 110, 135];

    const drawHeader = () => {
        doc.setFillColor(240, 240, 240);
        doc.rect(14, y, pageWidth - 28, 8, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        headers.forEach((h, i) => doc.text(h, colX[i], y + 6));
        y += 12;
    };

    drawHeader();

    // Rows
    doc.setFont("helvetica", "normal");
    logsByDate.forEach((v, date) => {
        // Calculate daily broken to show in a row, or show M/N rows?
        // Let's show M and N rows separately if they exist, or merged?
        // Table implies "Data", so raw logs might be better.
        // But user asked for broken stats.
        // Let's list the shift entries.
    });

    // Sort logs by Date desc, Shift
    const sortedLogs = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date) || (a.shift === 'morning' ? -1 : 1));

    sortedLogs.forEach(l => {
        if (y > pageHeight - 20) {
            doc.addPage();
            y = 20;
            drawHeader();
        }

        // Row Content
        doc.text(l.log_date, colX[0], y);
        doc.text(l.shift === "morning" ? "Morning" : "Night", colX[1], y); // Capitalize first letter?
        doc.text(l.small_count.toString(), colX[2], y);
        doc.text(l.large_count.toString(), colX[3], y);
        doc.text(l.broken_count.toString(), colX[4], y); // This is usually 0 for morning, computed for night? Wait.
        // Base log only has 'broken_count' stored in DB?
        // In DB Schema: morning usually O, night has broken.
        // Actually the logic is computed on client. 
        // But let's show what is in DB.

        let submitter = l.submitter_name || "Unknown";
        // Truncate submitter if too long
        if (submitter.length > 20) submitter = submitter.slice(0, 18) + "..";
        doc.text(submitter, colX[5], y);

        // Render Reasons
        if (l.broken_reasons && Array.isArray(l.broken_reasons) && l.broken_reasons.length > 0) {
            y += 5;
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(80, 80, 80);

            l.broken_reasons.forEach((r, idx) => {
                // If r is empty string, skip?
                if (!r) return;

                const rText = `• ${r}`;
                // Simple wrap or truncate?
                // doc.text(rText, colX[5], y);
                // Ideally span from "Broken" col (110) to end?
                doc.text(rText, colX[5] - 15, y);
                y += 3;
            });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
        }

        y += 7;
        doc.setDrawColor(230);
        doc.line(14, y - 4, pageWidth - 14, y - 4);
    });

    // Footer
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    doc.save("glass_report_full.pdf");
}
