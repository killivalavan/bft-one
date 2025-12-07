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
        <div className="sticky top-2 z-10 -mx-4 px-4 md:mx-0 md:px-0 py-2 bg-white/80 backdrop-blur-md md:bg-transparent md:backdrop-blur-none border-b md:border-none border-zinc-100 mb-4 md:mb-0">
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
                                    ? "bg-white border-sky-200 text-sky-700 shadow-sm ring-1 ring-sky-100"
                                    : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                            )}
                        >
                            <span className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase transition-colors",
                                isActive ? "bg-sky-100 text-sky-700" : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200"
                            )}>
                                {c.name.slice(0, 2)}
                            </span>
                            <span className="truncate max-w-[120px] md:max-w-none">{c.name}</span>
                            {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-500 md:block hidden" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
