"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

interface SalaryChartProps {
    base: number;
    deductions: number;
    net: number;
}

export function SalaryChart({ base, deductions, net }: SalaryChartProps) {
    const [animatedNet, setAnimatedNet] = useState(0);

    useEffect(() => {
        // Animate the percentage on mount/change
        const timer = setTimeout(() => {
            setAnimatedNet(net);
        }, 100);
        return () => clearTimeout(timer);
    }, [net]);

    // Calculate percentages
    const netPercent = base > 0 ? (animatedNet / base) * 100 : 0;

    return (
        <div className="relative w-48 h-48 mx-auto group cursor-default">
            {/* Ring Background (Shadow) */}
            <div className="absolute inset-0 rounded-full bg-zinc-100 shadow-inner"></div>

            {/* The Chart Ring */}
            <div
                className="absolute inset-0 rounded-full transition-all duration-1000 ease-out"
                style={{
                    background: `conic-gradient(
                        #10b981 0% ${netPercent}%, 
                        #f43f5e ${netPercent}% 100%
                    )`
                }}
            ></div>

            {/* Inner Cutout (Donut) */}
            <div className="absolute inset-3 rounded-full bg-white flex flex-col items-center justify-center shadow-sm z-10">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1">Net Pay</div>
                <div className="text-2xl font-bold text-zinc-900 transition-all duration-500 scale-100 group-hover:scale-110">
                    <AnimatedNumber value={net / 100} prefix="₹" />
                </div>
            </div>

            {/* Hover Tooltip Overlay (Optional aesthetic glow) */}
            <div className="absolute inset-0 rounded-full ring-4 ring-white/50 pointer-events-none"></div>
        </div>
    );
}


