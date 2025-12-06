import { cn } from "@/lib/utils/cn";

type Category = { id: string; name: string; icon_url?: string | null };

interface CategorySelectorProps {
    categories: Category[];
    activeId?: string;
    onSelect: (id: string) => void;
}

export function CategorySelector({ categories, activeId, onSelect }: CategorySelectorProps) {
    return (
        <div className="relative">
            <div className="sticky top-2 flex flex-row md:flex-col overflow-x-auto md:overflow-visible gap-2 md:gap-1.5 pb-2 md:pb-0 no-scrollbar items-start">
                {categories.map((c) => {
                    const isActive = activeId === c.id;
                    return (
                        <button
                            key={c.id}
                            onClick={() => onSelect(c.id)}
                            className={cn(
                                "shrink-0 relative transition-all duration-200 ease-out",
                                "h-10 md:h-auto md:w-full md:aspect-square",
                                "px-4 md:px-2 py-1 md:py-2",
                                "rounded-full md:rounded-xl",
                                "border text-sm font-medium flex md:flex-col items-center justify-center gap-1.5 md:gap-2",
                                isActive
                                    ? "bg-emerald-600 border-emerald-600 text-white shadow-md transform md:scale-[1.02]"
                                    : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300"
                            )}
                        >
                            <span className="text-center leading-tight line-clamp-1 md:line-clamp-2">
                                {c.name}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
