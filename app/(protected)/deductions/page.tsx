"use client";

import Link from "next/link";
import { DeductionsList } from "@/components/deductions/DeductionsList";
import { ChevronLeft, TrendingDown } from "lucide-react";

export default function DeductionsPage() {
    return (
        <main className="min-h-screen bg-[#F8FAFC] py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center gap-2 text-[#2563EB] hover:text-[#1D4ED8] font-medium mb-4 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                        Back to Home
                    </Link>

                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-[#FEF2F2] text-[#DC2626] border border-[#DC2626]/20 flex items-center justify-center">
                            <TrendingDown className="w-6 h-6 text-[#DC2626]" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Late Deductions</h1>
                    </div>
                    <p className="text-slate-500 text-sm">
                        View all employee late coming penalties and deduction details across the team.
                    </p>
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                    <DeductionsList />
                </div>
            </div>
        </main>
    );
}
