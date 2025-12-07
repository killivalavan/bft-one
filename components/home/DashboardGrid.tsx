import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { LucideIcon } from "lucide-react";

interface DashboardItem {
    label: string;
    href: string;
    icon: LucideIcon;
    colorClass: string;
    bgClass: string;
    description?: string;
}

interface DashboardGridProps {
    items: DashboardItem[];
}

export function DashboardGrid({ items }: DashboardGridProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            {items.map((item, idx) => (
                <Link key={idx} href={item.href} className="group block">
                    <div className="relative h-full bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-zinc-300 hover:-translate-y-1 flex flex-col items-center text-center gap-3">
                        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300", item.bgClass)}>
                            <item.icon size={28} className={item.colorClass} />
                        </div>
                        <div>
                            <div className="font-semibold text-zinc-900 text-lg group-hover:text-indigo-600 transition-colors">
                                {item.label}
                            </div>

                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}
