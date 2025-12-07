import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { AlertCircle, Package } from "lucide-react";

interface StockCardProps {
    name: string;
    imageUrl?: string | null;
    available: number;
    notifyAt: number | null;
    onUpdateAvailable: (val: number) => void;
    onUpdateNotify: (val: number) => void;
}

export function StockCard({ name, imageUrl, available, notifyAt, onUpdateAvailable, onUpdateNotify }: StockCardProps) {
    const isLow = notifyAt !== null && available <= notifyAt;

    return (
        <div className={cn(
            "group relative flex flex-col sm:flex-row gap-4 p-4 rounded-2xl border transition-all duration-300",
            isLow ? "bg-rose-50/50 border-rose-200 shadow-sm" : "bg-white border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300"
        )}>
            {/* Image Area */}
            <div className="shrink-0">
                <div className={cn(
                    "w-20 h-20 sm:w-24 sm:h-24 rounded-xl border flex items-center justify-center overflow-hidden bg-white",
                    isLow ? "border-rose-100" : "border-zinc-100"
                )}>
                    {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <Package className="text-zinc-300" size={32} />
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-zinc-900 text-lg leading-tight truncate pr-2">{name}</h3>
                    {isLow && (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] uppercase font-bold text-rose-600 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">
                            <AlertCircle size={12} /> Low Stock
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 mt-auto pt-2">
                    <div className="flex-1 max-w-[140px]">
                        <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block pl-1">Available</label>
                        <div className="relative">
                            <Input
                                type="number"
                                defaultValue={available}
                                onBlur={(e) => onUpdateAvailable(parseInt(e.target.value) || 0)}
                                className={cn(
                                    "h-10 text-base font-semibold text-center border-zinc-200 focus:border-sky-500 focus:ring-sky-500",
                                    isLow && "text-rose-700 bg-white border-rose-200 focus:border-rose-500 focus:ring-rose-500"
                                )}
                            />
                        </div>
                    </div>
                    <div className="flex-1 max-w-[140px]">
                        <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block pl-1">Notify At</label>
                        <div className="relative">
                            <Input
                                type="number"
                                defaultValue={notifyAt ?? ""}
                                placeholder="-"
                                onBlur={(e) => onUpdateNotify(parseInt(e.target.value) || 0)}
                                className="h-10 text-center border-zinc-200 text-zinc-600 focus:text-zinc-900"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
