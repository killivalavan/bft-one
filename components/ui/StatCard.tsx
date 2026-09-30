import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
    label: string;
    value: string | number | React.ReactNode;
    icon?: LucideIcon;
    subtext?: string;
    color?: "sky" | "rose" | "indigo" | "amber" | "emerald" | "zinc" | "slate";
    className?: string;
}

export function StatCard({ label, value, icon: Icon, subtext, color = "sky", className }: StatCardProps) {
    const iconColors = {
        sky: "bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]",
        blue: "bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]",
        rose: "bg-[#FEF2F2] text-[#DC2626] border border-[#FEE2E2]",
        indigo: "bg-[#F5F3FF] text-[#7C3AED] border border-[#EDE9FE]",
        amber: "bg-[#FFFBEB] text-[#D97706] border border-[#FEF3C7]",
        emerald: "bg-[#F0FDF4] text-[#16A34A] border border-[#DCFCE7]",
        zinc: "bg-slate-100 text-slate-700 border border-slate-200",
        slate: "bg-slate-100 text-slate-700 border border-slate-200",
    };

    return (
        <div className={cn("p-4 sm:p-5 rounded-xl border border-[#E2E8F0] bg-white shadow-xs flex flex-col justify-between transition-all hover:border-slate-300", className)}>
            <div>
                <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">{label}</span>
                    {Icon && (
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shadow-2xs", (iconColors as any)[color] || iconColors.sky)}>
                            <Icon size={17} />
                        </div>
                    )}
                </div>
                <div className="text-2xl font-bold text-[#0F172A] tabular-nums tracking-tight">{value}</div>
            </div>
            {subtext && (
                <div className="mt-2 text-xs text-[#64748B] font-normal">
                    {subtext}
                </div>
            )}
        </div>
    );
}
