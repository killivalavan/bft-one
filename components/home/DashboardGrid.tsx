import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { LucideIcon, ArrowUpRight } from "lucide-react";

export type SemanticColor = 'blue' | 'navy' | 'green' | 'amber' | 'red' | 'purple' | 'cyan' | 'slate';

export interface DashboardItem {
    label: string;
    href: string;
    icon: LucideIcon;
    category?: string;
    description?: string;
    badge?: string;
    colorTheme?: SemanticColor;
    isPrimary?: boolean;
    disabled?: boolean;
    blur?: boolean;
}

interface DashboardGridProps {
    items: DashboardItem[];
}

const colorStyles: Record<SemanticColor, { iconBg: string; iconText: string; iconBorder: string; badgeBg: string; badgeText: string; badgeBorder: string; hoverBorder: string }> = {
    blue: {
        iconBg: "bg-[#EFF6FF]",
        iconText: "text-[#2563EB]",
        iconBorder: "border-[#DBEAFE]",
        badgeBg: "bg-[#EFF6FF]",
        badgeText: "text-[#1E40AF]",
        badgeBorder: "border-[#BFDBFE]",
        hoverBorder: "hover:border-blue-300 hover:shadow-blue-500/5",
    },
    navy: {
        iconBg: "bg-[#EFF6FF]",
        iconText: "text-[#1E3A8A]",
        iconBorder: "border-[#DBEAFE]",
        badgeBg: "bg-[#EFF6FF]",
        badgeText: "text-[#1E3A8A]",
        badgeBorder: "border-[#BFDBFE]",
        hoverBorder: "hover:border-blue-300 hover:shadow-blue-500/5",
    },
    green: {
        iconBg: "bg-[#F0FDF4]",
        iconText: "text-[#16A34A]",
        iconBorder: "border-[#DCFCE7]",
        badgeBg: "bg-[#F0FDF4]",
        badgeText: "text-[#15803D]",
        badgeBorder: "border-[#BBF7D0]",
        hoverBorder: "hover:border-emerald-300 hover:shadow-emerald-500/5",
    },
    amber: {
        iconBg: "bg-[#FFFBEB]",
        iconText: "text-[#D97706]",
        iconBorder: "border-[#FEF3C7]",
        badgeBg: "bg-[#FFFBEB]",
        badgeText: "text-[#B45309]",
        badgeBorder: "border-[#FDE68A]",
        hoverBorder: "hover:border-amber-300 hover:shadow-amber-500/5",
    },
    red: {
        iconBg: "bg-[#FEF2F2]",
        iconText: "text-[#DC2626]",
        iconBorder: "border-[#FEE2E2]",
        badgeBg: "bg-[#FEF2F2]",
        badgeText: "text-[#B91C1C]",
        badgeBorder: "border-[#FECACA]",
        hoverBorder: "hover:border-red-300 hover:shadow-red-500/5",
    },
    purple: {
        iconBg: "bg-[#F5F3FF]",
        iconText: "text-[#7C3AED]",
        iconBorder: "border-[#EDE9FE]",
        badgeBg: "bg-[#F5F3FF]",
        badgeText: "text-[#6D28D9]",
        badgeBorder: "border-[#DDD6FE]",
        hoverBorder: "hover:border-purple-300 hover:shadow-purple-500/5",
    },
    cyan: {
        iconBg: "bg-[#ECFEFF]",
        iconText: "text-[#0891B2]",
        iconBorder: "border-[#CFFAFE]",
        badgeBg: "bg-[#ECFEFF]",
        badgeText: "text-[#0E7490]",
        badgeBorder: "border-[#A5F3FC]",
        hoverBorder: "hover:border-cyan-300 hover:shadow-cyan-500/5",
    },
    slate: {
        iconBg: "bg-slate-100",
        iconText: "text-slate-700",
        iconBorder: "border-slate-200",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-700",
        badgeBorder: "border-slate-200",
        hoverBorder: "hover:border-slate-300 hover:shadow-slate-500/5",
    },
};

export function DashboardGrid({ items }: DashboardGridProps) {
    const [selectedCategory, setSelectedCategory] = useState<string>("All");

    // Extract unique categories
    const categories = ["All", ...Array.from(new Set(items.map(i => i.category || "General")))];

    const filteredItems = selectedCategory === "All"
        ? items
        : items.filter(i => (i.category || "General") === selectedCategory);

    return (
        <div className="space-y-6">
            {/* Category Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                            "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 border",
                            selectedCategory === cat
                                ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                                : "bg-white text-[#64748B] border-[#E2E8F0] hover:border-slate-300 hover:text-[#0F172A] hover:bg-slate-50"
                        )}
                    >
                        {cat}
                        {cat === "All" && <span className="ml-1.5 opacity-80 text-[10px]">({items.length})</span>}
                    </button>
                ))}
            </div>

            {/* Dashboard Cards Grid - Premium White SaaS Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
                {filteredItems.map((item, idx) => {
                    const themeKey: SemanticColor = item.colorTheme || (item.isPrimary ? 'blue' : 'slate');
                    const style = colorStyles[themeKey] || colorStyles.blue;

                    const Content = () => (
                        <div className={cn(
                            "relative h-full rounded-xl p-5 bg-white border border-[#E2E8F0] text-[#0F172A] shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-4 overflow-hidden group cursor-pointer hover:-translate-y-0.5",
                            style.hoverBorder,
                            item.blur && "pointer-events-none select-none opacity-60"
                        )}>
                            {/* Top Row: Semantic Icon Box + Category Badge + Hover Arrow */}
                            <div className="flex items-start justify-between gap-3 relative z-10">
                                {/* Semantic Icon Container (10-12px rounded, soft background) */}
                                <div className={cn(
                                    "w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 shrink-0 border",
                                    style.iconBg,
                                    style.iconText,
                                    style.iconBorder,
                                    "group-hover:scale-105"
                                )}>
                                    <item.icon size={22} className="stroke-[2]" />
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {item.badge ? (
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                                            style.badgeBg,
                                            style.badgeText,
                                            style.badgeBorder
                                        )}>
                                            {item.badge}
                                        </span>
                                    ) : item.category ? (
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border",
                                            style.badgeBg,
                                            style.badgeText,
                                            style.badgeBorder
                                        )}>
                                            {item.category}
                                        </span>
                                    ) : null}

                                    {/* Subtle Action Hover Arrow */}
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 group-hover:text-[#2563EB] group-hover:bg-[#EFF6FF] transition-all duration-150">
                                        <ArrowUpRight size={15} className="transform transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                    </div>
                                </div>
                            </div>

                            {/* Middle: Title & Description */}
                            <div className="space-y-1 relative z-10">
                                <div className="font-semibold text-[16px] text-[#0F172A] tracking-tight group-hover:text-[#2563EB] transition-colors">
                                    {item.label}
                                </div>
                                {item.description && (
                                    <p className="text-xs font-normal text-[#64748B] leading-relaxed line-clamp-2">
                                        {item.description}
                                    </p>
                                )}
                            </div>

                            {item.blur && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-xs">
                                    <span className="bg-[#0F172A] text-white px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider shadow-sm">
                                        Coming Soon
                                    </span>
                                </div>
                            )}
                        </div>
                    );

                    if (item.disabled) {
                        return <div key={idx} className="block h-full"><Content /></div>;
                    }

                    return (
                        <Link key={idx} href={item.href} className="block h-full">
                            <Content />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
