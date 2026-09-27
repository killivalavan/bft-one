import { NextRequest, NextResponse } from "next/server";
import { auditExpenses, ExpenseRecord, PriceListItem } from "@/lib/ai/expense-agent";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            expenses = [] as ExpenseRecord[],
            priceList = [] as PriceListItem[],
            periodLabel = "Selected Period",
            userQuery = "",
            conversationHistory = [],
        } = body;

        // Perform statistical audit of the store's expenses
        const audit = auditExpenses(expenses, priceList, periodLabel);

        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

        // If user provided a specific conversational query and we have a Gemini API key:
        if (apiKey) {
            try {
                const systemInstruction = `You are "SeyalPro Expense AI Agent", an expert financial controller and store cost-optimization consultant for retail stores and businesses.
Your goal is to actively monitor store expenses, detect spend leaks, pinpoint where and how to cut costs, suggest vendor negotiation strategies, and recommend realistic cost-reduction actions.

Store Expense Snapshot:
- Active Period: ${periodLabel}
- Total Spend: ₹${(audit.totalSpendCents / 100).toFixed(2)} across ${audit.totalTransactions} transactions (${audit.distinctItems} distinct items).
- Store Spend Efficiency Score: ${audit.efficiencyScore}/100
- Identified Monthly Savings Potential: ₹${(audit.potentialMonthlySavingsCents / 100).toFixed(2)}
- Key Statistical Insights: ${audit.keyInsights.join("; ")}

Top Cost Reduction Opportunities:
${audit.topCutOpportunities.map((o, idx) => `${idx + 1}. **${o.itemName}**: Total spend ₹${(o.totalSpendCents / 100).toFixed(2)} (${o.shareOfTotalSpendPercent}% of total). Action: ${o.actionableAdvice} (Est. Monthly Savings: ₹${(o.suggestedSavingsCents / 100).toFixed(2)})`).join("\n") || "No immediate high-priority leaks detected."}

Price Inflation Alerts:
${audit.inflationAlerts.map(i => `- **${i.itemName}**: +${i.priceInflationPercent}% increase (From ₹${(i.firstUnitCostCents / 100).toFixed(2)} to ₹${(i.currentUnitCostCents / 100).toFixed(2)}/unit)`).join("\n") || "No sudden inflation spikes detected."}

Tone & Rules:
1. Be direct, commercially savvy, encouraging, and highly specific with rupee (₹) figures and percentages.
2. Structure answers with clean headings, bullet points, and high-impact action steps.
3. If asked for a negotiation script or email for a supplier, provide a ready-to-use polite yet firm message template.
4. Always ground your answers in the provided store numbers.`;

                const prompt = userQuery || "Analyze our store's current expense trends and give 3 high-impact strategies to cut costs immediately.";

                const geminiPayload = {
                    contents: [
                        ...conversationHistory.map((m: any) => ({
                            role: m.role === "assistant" ? "model" : "user",
                            parts: [{ text: m.content }],
                        })),
                        {
                            role: "user",
                            parts: [{ text: prompt }],
                        },
                    ],
                    systemInstruction: {
                        parts: [{ text: systemInstruction }],
                    },
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 1200,
                    },
                };

                // Try gemini-2.5-flash, fallback to gemini-1.5-flash
                let response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(geminiPayload),
                    }
                );

                if (!response.ok) {
                    response = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(geminiPayload),
                        }
                    );
                }

                if (response.ok) {
                    const data = await response.json();
                    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (aiText) {
                        return NextResponse.json({
                            success: true,
                            source: "gemini",
                            audit,
                            message: aiText,
                        });
                    }
                }
            } catch (llmError) {
                console.error("Gemini API call failed, falling back to heuristic advisor:", llmError);
            }
        }

        // Fallback Heuristic Generation (Zero-API Key or Offline Mode)
        let generatedMessage = "";

        if (userQuery.toLowerCase().includes("leak") || userQuery.toLowerCase().includes("where")) {
            generatedMessage = `### 🔍 Spend Leak Analysis for ${periodLabel}\n\n` +
                `Here is where your biggest expenses are concentrated:\n\n` +
                audit.topCutOpportunities.map(o => `* **${o.itemName}** (₹${(o.totalSpendCents / 100).toFixed(2)}): ${o.actionableAdvice}`).join("\n") +
                `\n\n💡 **Total Identified Savings Room**: **₹${(audit.potentialMonthlySavingsCents / 100).toFixed(2)}**`;
        } else if (userQuery.toLowerCase().includes("negotiat") || userQuery.toLowerCase().includes("supplier") || userQuery.toLowerCase().includes("script")) {
            const topItem = audit.topCutOpportunities[0]?.itemName || "Packaging & Raw Supplies";
            generatedMessage = `### 🤝 Supplier Price Negotiation Script\n\n` +
                `Here is a ready-to-send template for **${topItem}**:\n\n` +
                `> *"Hi [Supplier Name], we have been reviewing our monthly purchase volumes for ${topItem}. As a loyal recurring buyer, we'd like to lock in a bulk tier discount of 10-15% or match our baseline rate for the upcoming quarter. Let us know if we can consolidate our weekly orders with you at this rate."*\n\n` +
                `📌 **Strategy Tip:** Offer to pay promptly on delivery in exchange for a 5% instant settlement discount.`;
        } else {
            generatedMessage = `### 📊 Expense Optimization Audit (${periodLabel})\n\n` +
                `**Efficiency Health Score:** ${audit.efficiencyScore}/100\n` +
                `**Potential Monthly Savings:** **₹${(audit.potentialMonthlySavingsCents / 100).toFixed(2)}**\n\n` +
                `#### 🎯 Recommended Action Plan:\n` +
                audit.topCutOpportunities.slice(0, 3).map((o, idx) => `${idx + 1}. **${o.itemName}**: ${o.actionableAdvice}`).join("\n") +
                `\n\n` +
                (audit.inflationAlerts.length > 0 ? `#### ⚠️ Inflation Watchdog:\n` + audit.inflationAlerts.map(i => `- **${i.itemName}** increased by **+${i.priceInflationPercent}%** per unit.`).join("\n") : "");
        }

        return NextResponse.json({
            success: true,
            source: apiKey ? "gemini_fallback" : "heuristic_agent",
            audit,
            message: generatedMessage,
        });
    } catch (error: any) {
        console.error("Expense AI Advisor error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to process expense analysis" },
            { status: 500 }
        );
    }
}
