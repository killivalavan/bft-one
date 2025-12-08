import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
    label: string;
    value: string | number;
    icon?: LucideIcon;
    subtext?: string;
    color?: "sky" | "rose" | "indigo" | "amber" | "emerald";
    className?: string;
}

export function StatCard({ label, value, icon: Icon, subtext, color = "sky", className }: StatCardProps) {
    const colors = {
        sky: "bg-sky-50 border-sky-100 text-sky-700",
        rose: "bg-rose-50 border-rose-100 text-rose-700",
        indigo: "bg-indigo-50 border-indigo-100 text-indigo-700",
        amber: "bg-amber-50 border-amber-100 text-amber-700",
        emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    };

    const iconColors = {
        sky: "bg-sky-100 text-sky-600",
        rose: "bg-rose-100 text-rose-600",
        indigo: "bg-indigo-100 text-indigo-600",
        amber: "bg-amber-100 text-amber-600",
        emerald: "bg-emerald-100 text-emerald-600",
    };

    return (
        <div className={cn("p-4 rounded-2xl border bg-white shadow-sm flex flex-col justify-between", className)}>
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{label}</span>
                    {Icon && (
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", iconColors[color])}>
                            <Icon size={16} />
                        </div>
                    )}
                </div>
                <div className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tight">{value}</div>
            </div>
            {subtext && (
                <div className="mt-2 text-xs text-zinc-500 font-medium">
                    {subtext}
                </div>
            )}
        </div>
    );
}
