export interface ExpenseItemAnalysis {
    itemName: string;
    totalSpendCents: number;
    totalQuantity: number;
    avgUnitCostCents: number;
    firstUnitCostCents: number;
    currentUnitCostCents: number;
    peakUnitCostCents: number;
    purchaseCount: number;
    priceInflationPercent: number;
    shareOfTotalSpendPercent: number;
    isHighSpend: boolean;
    isFrequentSmallPurchase: boolean;
    suggestedSavingsCents: number;
    recommendationType: "negotiate" | "bulk_order" | "find_alternative" | "monitor" | "fixed_price_lock";
    actionableAdvice: string;
    isMonthlyFixed?: boolean;
    category?: string;
}

export interface MonthlyExpenseRecord {
    id: string;
    expense_month?: string | null;
    category: string;
    item_name: string;
    amount_cents: number;
    previous_amount_cents?: number | null;
    is_active?: boolean;
    notes?: string | null;
    submitted_by?: string | null;
    created_at?: string;
    updated_at?: string | null;
}

export interface DailyRecurringProjectedItem {
    itemName: string;
    totalQuantity: number;
    totalSpendCents: number;
    purchaseDaysCount: number;
    totalDaysSpan: number;
    avgDailyQuantity: number;
    avgUnitCostCents: number;
    avgDailySpendCents: number;
    projectedMonthlyQuantity: number; // 30-day projection
    projectedMonthlySpendCents: number; // 30-day projection
    recurrenceLevel: "daily" | "frequent" | "occasional";
    confidenceScore: number; // 0 to 100
    aiRecommendation: string;
    suggestedSavingsCents: number;
    categorySuggestion: string;
}

export interface ExpenseAuditSummary {
    totalSpendCents: number;
    dailySpendCents: number;
    monthlyFixedSpendCents: number;
    totalTransactions: number;
    distinctItems: number;
    periodLabel: string;
    efficiencyScore: number; // 0 - 100
    potentialMonthlySavingsCents: number;
    topCutOpportunities: ExpenseItemAnalysis[];
    inflationAlerts: ExpenseItemAnalysis[];
    frequentLeakItems: ExpenseItemAnalysis[];
    monthlyCostBreakdown: { category: string; amountCents: number; count: number }[];
    dailyRecurringProjections?: {
        items: DailyRecurringProjectedItem[];
        totalProjectedMonthlyCents: number;
        totalDailyBurnCents: number;
        highRecurrenceCount: number;
    };
    keyInsights: string[];
}

export interface ExpenseRecord {
    id: string;
    expense_date: string;
    item_name: string;
    quantity: number;
    price_cents: number;
    submitted_by?: string | null;
    created_at?: string;
}

export interface PriceListItem {
    id: string;
    item_name: string;
    price_cents: number;
    active: boolean;
}

/**
 * Analyzes store expense records to detect cost leaks, inflation, fixed-cost overheads, and actionable savings.
 */
export function auditExpenses(
    expenses: ExpenseRecord[],
    priceList: PriceListItem[] = [],
    periodLabel: string = "Selected Period",
    monthlyExpenses: MonthlyExpenseRecord[] = []
): ExpenseAuditSummary {
    const hasDaily = expenses && expenses.length > 0;
    const hasMonthly = monthlyExpenses && monthlyExpenses.length > 0;

    if (!hasDaily && !hasMonthly) {
        return {
            totalSpendCents: 0,
            dailySpendCents: 0,
            monthlyFixedSpendCents: 0,
            totalTransactions: 0,
            distinctItems: 0,
            periodLabel,
            efficiencyScore: 100,
            potentialMonthlySavingsCents: 0,
            topCutOpportunities: [],
            inflationAlerts: [],
            frequentLeakItems: [],
            monthlyCostBreakdown: [],
            keyInsights: ["No expense transactions recorded for this period yet."],
        };
    }

    const dailySpendCents = hasDaily ? expenses.reduce((sum, r) => sum + (r.price_cents || 0), 0) : 0;
    const monthlyFixedSpendCents = hasMonthly ? monthlyExpenses.reduce((sum, m) => sum + (m.amount_cents || 0), 0) : 0;
    const totalSpendCents = dailySpendCents + monthlyFixedSpendCents;
    const totalTransactions = (expenses?.length || 0) + (monthlyExpenses?.length || 0);

    // Group expenses by normalized item name
    const itemMap = new Map<string, {
        name: string;
        totalCents: number;
        totalQty: number;
        entries: { date: string; qty: number; cents: number; unitCents: number }[];
    }>();

    for (const exp of expenses) {
        const key = (exp.item_name || "").trim().toLowerCase();
        if (!key) continue;

        const qty = Math.max(1, Number(exp.quantity) || 1);
        const cents = exp.price_cents || 0;
        const unitCents = cents / qty;

        if (!itemMap.has(key)) {
            itemMap.set(key, {
                name: exp.item_name.trim(),
                totalCents: 0,
                totalQty: 0,
                entries: [],
            });
        }

        const group = itemMap.get(key)!;
        group.totalCents += cents;
        group.totalQty += qty;
        group.entries.push({
            date: exp.expense_date,
            qty,
            cents,
            unitCents,
        });
    }

    const fixedPriceMap = new Map<string, number>();
    for (const fp of priceList) {
        if (fp.active) {
            fixedPriceMap.set(fp.item_name.trim().toLowerCase(), fp.price_cents);
        }
    }

    const analyzedItems: ExpenseItemAnalysis[] = [];

    for (const [, group] of itemMap.entries()) {
        const sortedEntries = [...group.entries].sort((a, b) => a.date.localeCompare(b.date));
        const firstEntry = sortedEntries[0];
        const lastEntry = sortedEntries[sortedEntries.length - 1];

        let peakUnit = firstEntry.unitCents;
        for (const e of sortedEntries) {
            if (e.unitCents > peakUnit) peakUnit = e.unitCents;
        }

        const firstUnitCostCents = Math.round(firstEntry.unitCents);
        const currentUnitCostCents = Math.round(lastEntry.unitCents);
        const peakUnitCostCents = Math.round(peakUnit);
        const avgUnitCostCents = group.totalQty > 0 ? Math.round(group.totalCents / group.totalQty) : 0;

        const inflationPct = firstUnitCostCents > 0
            ? Math.round(((currentUnitCostCents - firstUnitCostCents) / firstUnitCostCents) * 100)
            : 0;

        const sharePct = totalSpendCents > 0 ? Math.round((group.totalCents / totalSpendCents) * 100) : 0;
        const isHighSpend = sharePct >= 10 || group.totalCents >= 200000; // >= 10% or >= Rs 2,000
        const isFrequentSmallPurchase = group.entries.length >= 4 && (group.totalCents / group.entries.length) < 50000; // bought >= 4 times with avg < Rs 500

        // Determine savings strategy & recommendation
        let recommendationType: ExpenseItemAnalysis["recommendationType"] = "monitor";
        let actionableAdvice = "Spend is within normal operating threshold.";
        let estimatedSavingsCents = 0;

        const fixedTarget = fixedPriceMap.get(group.name.toLowerCase());

        if (fixedTarget && currentUnitCostCents > fixedTarget) {
            recommendationType = "fixed_price_lock";
            const diffPerUnit = currentUnitCostCents - fixedTarget;
            estimatedSavingsCents = diffPerUnit * group.totalQty;
            actionableAdvice = `Paying ₹${(currentUnitCostCents / 100).toFixed(2)}/unit, which is above fixed catalog price of ₹${(fixedTarget / 100).toFixed(2)}. Re-align purchase price.`;
        } else if (inflationPct >= 15) {
            recommendationType = "negotiate";
            estimatedSavingsCents = Math.round(group.totalCents * 0.12); // target 12% rollback
            actionableAdvice = `Unit price jumped +${inflationPct}% (from ₹${(firstUnitCostCents / 100).toFixed(2)} to ₹${(currentUnitCostCents / 100).toFixed(2)}). Ask vendor for bulk loyalty rate or explore alternative local vendor.`;
        } else if (isFrequentSmallPurchase) {
            recommendationType = "bulk_order";
            estimatedSavingsCents = Math.round(group.totalCents * 0.10); // 10% wholesale savings
            actionableAdvice = `Purchased ${group.entries.length} times in small quantities. Switch to weekly wholesale bulk ordering to cut ~10% off retail pricing.`;
        } else if (isHighSpend) {
            recommendationType = "find_alternative";
            estimatedSavingsCents = Math.round(group.totalCents * 0.08); // 8% strategic cut
            actionableAdvice = `Accounts for ${sharePct}% of total budget. Review consumption rate, negotiate volume discount with primary supplier, or set a daily usage cap.`;
        }

        analyzedItems.push({
            itemName: group.name,
            totalSpendCents: group.totalCents,
            totalQuantity: group.totalQty,
            avgUnitCostCents,
            firstUnitCostCents,
            currentUnitCostCents,
            peakUnitCostCents,
            purchaseCount: group.entries.length,
            priceInflationPercent: inflationPct,
            shareOfTotalSpendPercent: sharePct,
            isHighSpend,
            isFrequentSmallPurchase,
            suggestedSavingsCents: estimatedSavingsCents,
            recommendationType,
            actionableAdvice,
        });
    }

    // Process Monthly Fixed Expenses (Rent, Salary, EB electricity, etc.)
    const categoryMap = new Map<string, { amountCents: number; count: number }>();
    for (const m of monthlyExpenses) {
        const cat = m.category || "Other";
        const current = categoryMap.get(cat) || { amountCents: 0, count: 0 };
        categoryMap.set(cat, {
            amountCents: current.amountCents + (m.amount_cents || 0),
            count: current.count + 1,
        });

        // Add monthly item to analyzedItems for holistic view
        const sharePct = totalSpendCents > 0 ? Math.round(((m.amount_cents || 0) / totalSpendCents) * 100) : 0;
        let advice = `Recurring fixed overhead in category "${m.category}".`;
        let recType: ExpenseItemAnalysis["recommendationType"] = "monitor";
        let suggestedSavings = 0;

        if (cat.toLowerCase().includes("electric") || cat.toLowerCase().includes("eb")) {
            advice = `Electricity / EB bill. Optimize off-peak power usage, service equipment / refrigeration, and audit meter reading for power factor penalties.`;
            suggestedSavings = Math.round(m.amount_cents * 0.08); // 8% power saving
            recType = "find_alternative";
        } else if (cat.toLowerCase().includes("internet") || cat.toLowerCase().includes("broadband")) {
            advice = `Check if business plan speed matches actual bandwidth usage or if promotional loyalty tier is available.`;
            suggestedSavings = Math.round(m.amount_cents * 0.10);
            recType = "negotiate";
        } else if (cat.toLowerCase().includes("rent")) {
            advice = `Fixed property lease. Review annual escalation clauses and long-term lease terms upon renewal.`;
        }

        analyzedItems.push({
            itemName: `${m.item_name} (${m.category})`,
            totalSpendCents: m.amount_cents || 0,
            totalQuantity: 1,
            avgUnitCostCents: m.amount_cents || 0,
            firstUnitCostCents: m.amount_cents || 0,
            currentUnitCostCents: m.amount_cents || 0,
            peakUnitCostCents: m.amount_cents || 0,
            purchaseCount: 1,
            priceInflationPercent: 0,
            shareOfTotalSpendPercent: sharePct,
            isHighSpend: sharePct >= 15,
            isFrequentSmallPurchase: false,
            suggestedSavingsCents: suggestedSavings,
            recommendationType: recType,
            actionableAdvice: advice,
            isMonthlyFixed: true,
            category: m.category,
        });
    }

    const monthlyCostBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        amountCents: data.amountCents,
        count: data.count,
    })).sort((a, b) => b.amountCents - a.amountCents);

    // Sort by potential savings & total spend
    analyzedItems.sort((a, b) => b.totalSpendCents - a.totalSpendCents);

    const topCutOpportunities = analyzedItems
        .filter(item => item.suggestedSavingsCents > 0)
        .sort((a, b) => b.suggestedSavingsCents - a.suggestedSavingsCents)
        .slice(0, 6);

    const inflationAlerts = analyzedItems
        .filter(item => item.priceInflationPercent > 0)
        .sort((a, b) => b.priceInflationPercent - a.priceInflationPercent)
        .slice(0, 5);

    const frequentLeakItems = analyzedItems
        .filter(item => item.isFrequentSmallPurchase)
        .slice(0, 5);

    const totalPotentialSavingsCents = topCutOpportunities.reduce((sum, i) => sum + i.suggestedSavingsCents, 0);

    // Calculate Store Spend Efficiency Score (0-100)
    let score = 95;
    if (inflationAlerts.length > 2) score -= 15;
    else if (inflationAlerts.length > 0) score -= 8;

    if (frequentLeakItems.length > 3) score -= 10;
    else if (frequentLeakItems.length > 0) score -= 5;

    const top3SpendShare = analyzedItems.slice(0, 3).reduce((sum, i) => sum + i.shareOfTotalSpendPercent, 0);
    if (top3SpendShare > 65) score -= 10; // high concentration risk

    // Fixed vs Variable balance check
    if (totalSpendCents > 0 && monthlyFixedSpendCents > 0) {
        const fixedRatio = (monthlyFixedSpendCents / totalSpendCents) * 100;
        if (fixedRatio > 70) score -= 5; // Heavy fixed cost burden
    }

    const efficiencyScore = Math.max(35, Math.min(100, score));

    // Dynamic key insights
    const keyInsights: string[] = [];
    if (analyzedItems.length > 0) {
        const topItem = analyzedItems[0];
        keyInsights.push(`Highest spend driver is **${topItem.itemName}** consuming ₹${(topItem.totalSpendCents / 100).toFixed(2)} (${topItem.shareOfTotalSpendPercent}% of total spend).`);
    }

    if (monthlyFixedSpendCents > 0 && totalSpendCents > 0) {
        const fixedPct = Math.round((monthlyFixedSpendCents / totalSpendCents) * 100);
        const dailyPct = 100 - fixedPct;
        keyInsights.push(`Cost Structure: **${fixedPct}% Fixed Monthly** (₹${(monthlyFixedSpendCents / 100).toFixed(2)}) vs **${dailyPct}% Daily Operational** (₹${(dailySpendCents / 100).toFixed(2)}).`);
    }

    if (inflationAlerts.length > 0) {
        const worstInflation = inflationAlerts[0];
        keyInsights.push(`Price spike detected: **${worstInflation.itemName}** rose by **+${worstInflation.priceInflationPercent}%** compared to its baseline.`);
    }
    if (frequentLeakItems.length > 0) {
        keyInsights.push(`Detected **${frequentLeakItems.length} items** with frequent ad-hoc daily purchases. Grouping into weekly wholesale orders could save an estimated ₹${((totalPotentialSavingsCents * 0.4) / 100).toFixed(2)}.`);
    }
    if (totalPotentialSavingsCents > 0) {
        keyInsights.push(`Total identifiable monthly optimization room is **₹${(totalPotentialSavingsCents / 100).toFixed(2)}** across top opportunities.`);
    }

    const dailyRecurring = calculateDailyRecurringProjections(expenses);

    if (dailyRecurring.highRecurrenceCount > 0) {
        keyInsights.push(`AI detected **${dailyRecurring.highRecurrenceCount} daily recurring consumable items** (e.g. daily water cans, milk/supplies). Their projected 30-day monthly burn is **₹${(dailyRecurring.totalProjectedMonthlyCents / 100).toLocaleString("en-IN")}**.`);
    }

    return {
        totalSpendCents,
        dailySpendCents,
        monthlyFixedSpendCents,
        totalTransactions,
        distinctItems: analyzedItems.length,
        periodLabel,
        efficiencyScore,
        potentialMonthlySavingsCents: totalPotentialSavingsCents,
        topCutOpportunities,
        inflationAlerts,
        frequentLeakItems,
        monthlyCostBreakdown,
        dailyRecurringProjections: dailyRecurring,
        keyInsights,
    };
}

/**
 * Agentic AI calculation: takes all daily expense records, computes daily consumption velocity
 * (e.g. 10 water cans/day), and projects the 30-day recurring monthly spend and vendor optimization strategy.
 */
export function calculateDailyRecurringProjections(
    expenses: ExpenseRecord[],
    daysInMonth: number = 30
): {
    items: DailyRecurringProjectedItem[];
    totalProjectedMonthlyCents: number;
    totalDailyBurnCents: number;
    highRecurrenceCount: number;
} {
    if (!expenses || expenses.length === 0) {
        return {
            items: [],
            totalProjectedMonthlyCents: 0,
            totalDailyBurnCents: 0,
            highRecurrenceCount: 0,
        };
    }

    // 1. Determine unique purchase dates to calculate accurate daily velocity
    const dates = expenses.map(e => e.expense_date).filter(Boolean).sort();
    const uniqueDates = Array.from(new Set(dates));
    const effectiveDays = Math.max(1, uniqueDates.length);

    // 2. Group expenses by normalized item name
    const grouped = new Map<string, {
        name: string;
        totalQty: number;
        totalCents: number;
        entries: { date: string; qty: number; cents: number }[];
        distinctDates: Set<string>;
    }>();

    for (const exp of expenses) {
        const rawName = (exp.item_name || "").trim();
        if (!rawName) continue;
        const key = rawName.toLowerCase();
        const qty = Math.max(1, Number(exp.quantity) || 1);
        const cents = Number(exp.price_cents) || 0;

        if (!grouped.has(key)) {
            grouped.set(key, {
                name: rawName,
                totalQty: 0,
                totalCents: 0,
                entries: [],
                distinctDates: new Set(),
            });
        }

        const g = grouped.get(key)!;
        g.totalQty += qty;
        g.totalCents += cents;
        g.entries.push({ date: exp.expense_date, qty, cents });
        if (exp.expense_date) g.distinctDates.add(exp.expense_date);
    }

    const items: DailyRecurringProjectedItem[] = [];

    for (const [, g] of grouped.entries()) {
        const purchaseDays = g.distinctDates.size;
        const totalQty = g.totalQty;
        const totalCents = g.totalCents;

        // Daily average consumption
        const avgDailyQty = totalQty / effectiveDays;
        const avgUnitCostCents = totalQty > 0 ? Math.round(totalCents / totalQty) : 0;
        const avgDailySpendCents = Math.round(avgDailyQty * avgUnitCostCents);

        // 30-Day Monthly Projection
        const projectedMonthlyQty = Math.round(avgDailyQty * daysInMonth * 10) / 10;
        const projectedMonthlySpendCents = Math.round(avgDailySpendCents * daysInMonth);

        // Recurrence classification
        const purchaseFrequencyRatio = purchaseDays / effectiveDays;
        let recurrenceLevel: DailyRecurringProjectedItem["recurrenceLevel"] = "occasional";
        let confidenceScore = Math.min(100, Math.round(purchaseFrequencyRatio * 100));

        if (purchaseFrequencyRatio >= 0.4 || purchaseDays >= 3) {
            recurrenceLevel = "daily";
            confidenceScore = Math.min(99, Math.max(80, Math.round(purchaseFrequencyRatio * 100)));
        } else if (purchaseFrequencyRatio >= 0.2 || purchaseDays >= 2) {
            recurrenceLevel = "frequent";
            confidenceScore = Math.min(85, Math.max(60, Math.round(purchaseFrequencyRatio * 100)));
        }

        // Smart Category inference
        const lower = g.name.toLowerCase();
        let categorySuggestion = "Daily Consumables";
        if (lower.includes("water") || lower.includes("can") || lower.includes("aqua")) categorySuggestion = "Water";
        else if (lower.includes("milk") || lower.includes("tea") || lower.includes("coffee") || lower.includes("sugar") || lower.includes("egg") || lower.includes("veg") || lower.includes("oil") || lower.includes("bread")) categorySuggestion = "Supplies & Raw Materials";
        else if (lower.includes("clean") || lower.includes("soap") || lower.includes("detergent") || lower.includes("phenyl") || lower.includes("mop")) categorySuggestion = "Maintenance";
        else if (lower.includes("diesel") || lower.includes("petrol") || lower.includes("fuel") || lower.includes("auto")) categorySuggestion = "Transport & Fuel";
        else if (lower.includes("box") || lower.includes("cover") || lower.includes("bag") || lower.includes("cup")) categorySuggestion = "Packaging";

        // AI Advice & optimization
        let aiRecommendation = `Daily run rate: ${avgDailyQty.toFixed(1)} units/day @ ₹${(avgUnitCostCents / 100).toFixed(2)}. 30-day projection: ₹${(projectedMonthlySpendCents / 100).toLocaleString("en-IN")}.`;
        let suggestedSavingsCents = 0;

        if (recurrenceLevel === "daily") {
            suggestedSavingsCents = Math.round(projectedMonthlySpendCents * 0.15); // 15% wholesale contract discount
            aiRecommendation = `High daily recurrence (${avgDailyQty.toFixed(1)} units/day · ~${Math.round(projectedMonthlyQty)} units/mo). Setting a fixed monthly wholesale supplier contract could save ~15% (₹${(suggestedSavingsCents / 100).toLocaleString("en-IN")}/mo).`;
        } else if (recurrenceLevel === "frequent") {
            suggestedSavingsCents = Math.round(projectedMonthlySpendCents * 0.10);
            aiRecommendation = `Regular consumable (${purchaseDays} purchase days). Consolidate into weekly bulk purchase to unlock wholesale rates (save ~₹${(suggestedSavingsCents / 100).toLocaleString("en-IN")}/mo).`;
        }

        items.push({
            itemName: g.name,
            totalQuantity: totalQty,
            totalSpendCents: totalCents,
            purchaseDaysCount: purchaseDays,
            totalDaysSpan: effectiveDays,
            avgDailyQuantity: avgDailyQty,
            avgUnitCostCents,
            avgDailySpendCents,
            projectedMonthlyQuantity: projectedMonthlyQty,
            projectedMonthlySpendCents,
            recurrenceLevel,
            confidenceScore,
            aiRecommendation,
            suggestedSavingsCents,
            categorySuggestion,
        });
    }

    // Sort by projected monthly spend descending
    items.sort((a, b) => b.projectedMonthlySpendCents - a.projectedMonthlySpendCents);

    const totalProjectedMonthlyCents = items.reduce((sum, i) => sum + i.projectedMonthlySpendCents, 0);
    const totalDailyBurnCents = items.reduce((sum, i) => sum + i.avgDailySpendCents, 0);
    const highRecurrenceCount = items.filter(i => i.recurrenceLevel === "daily").length;

    return {
        items,
        totalProjectedMonthlyCents,
        totalDailyBurnCents,
        highRecurrenceCount,
    };
}
