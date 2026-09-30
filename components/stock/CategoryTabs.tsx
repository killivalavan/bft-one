import { cn } from "@/lib/utils/cn";

interface Category {
    id: string;
    name: string;
}

interface CategoryTabsProps {
    categories: Category[];
    activeId?: string;
    onChange: (id: string) => void;
}

export function CategoryTabs({ categories, activeId, onChange }: CategoryTabsProps) {
    return (
        <div className="sticky top-2 z-10 -mx-4 px-4 md:mx-0 md:px-0 py-2 bg-white/80 backdrop-blur-md md:bg-transparent md:backdrop-blur-none border-b md:border-none border-slate-100 mb-4 md:mb-0">
            <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible no-scrollbar">
                {categories.map(c => {
                    const isActive = activeId === c.id;
                    return (
                        <button
                            key={c.id}
                            onClick={() => onChange(c.id)}
                            className={cn(
                                "group shrink-0 flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 border",
                                isActive
                                    ? "bg-white border-[#2563EB]/40 text-[#2563EB] shadow-xs ring-1 ring-[#2563EB]/20 font-semibold"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                            )}
                        >
                            <span className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase transition-colors",
                                isActive ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                            )}>
                                {c.name.slice(0, 2)}
                            </span>
                            <span className="truncate max-w-[120px] md:max-w-none">{c.name}</span>
                            {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#2563EB] md:block hidden" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
