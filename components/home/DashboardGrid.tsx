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
    disabled?: boolean;
    blur?: boolean;
}

interface DashboardGridProps {
    items: DashboardItem[];
}

export function DashboardGrid({ items }: DashboardGridProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            {items.map((item, idx) => {
                const Content = () => (
                    <div className={cn(
                        "relative h-full bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm transition-all duration-300 flex flex-col items-center text-center gap-3 overflow-hidden",
                        !item.disabled && "hover:shadow-lg hover:border-zinc-300 hover:-translate-y-1 cursor-pointer",
                        item.blur && "pointer-events-none select-none"
                    )}>
                        <div className={cn("flex flex-col items-center gap-3 w-full transition-all duration-300", item.blur && "blur-[3px] opacity-40 grayscale")}>
                            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300", !item.disabled && "group-hover:scale-110", item.bgClass)}>
                                <item.icon size={28} className={item.colorClass} />
                            </div>
                            <div>
                                <div className={cn("font-semibold text-zinc-900 text-lg transition-colors", !item.disabled && "group-hover:text-sky-600")}>
                                    {item.label}
                                </div>
                                {item.description && (
                                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{item.description}</p>
                                )}
                            </div>
                        </div>

                        {item.blur && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center">
                                <span className="bg-zinc-900/10 backdrop-blur-md border border-white/20 text-zinc-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm transform -rotate-6">
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
                    <Link key={idx} href={item.href} className="group block h-full">
                        <Content />
                    </Link>
                );
            })}
        </div>
    );
}
