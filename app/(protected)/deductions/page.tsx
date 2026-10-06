"use client";

import { DeductionsList } from "@/components/deductions/DeductionsList";
import { TrendingDown } from "lucide-react";

export default function DeductionsPage() {
    return (
        <main className="min-h-screen bg-[#F8FAFC] py-6 sm:py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Header */}
                <div className="mb-6 sm:mb-8">
                    <div className="flex items-center gap-3.5 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-[#FEF2F2] text-[#DC2626] border border-[#DC2626]/20 flex items-center justify-center shadow-2xs shrink-0">
                            <TrendingDown className="w-6 h-6 text-[#DC2626]" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Late Deductions</h1>
                            <p className="text-slate-500 text-xs sm:text-sm">
                                View employee late arrival penalties and payroll deduction details across the team.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                    <DeductionsList />
                </div>
            </div>
        </main>
    );
}
