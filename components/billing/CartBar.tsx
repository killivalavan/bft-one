import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { ShoppingCart, Trash2, CheckCircle2 } from "lucide-react";

interface CartBarProps {
    itemCount: number;
    totalCents: number;
    onClear: () => void;
    onSubmit: () => void;
}

export function CartBar({ itemCount, totalCents, onClear, onSubmit }: CartBarProps) {
    if (itemCount === 0) return null;

    return (
        <div className="fixed left-0 right-0 bottom-0 z-40 p-3 md:p-4 pointer-events-none">
            <div className="max-w-2xl mx-auto pointer-events-auto">
                <div className="bg-zinc-900/90 backdrop-blur-md text-white rounded-2xl shadow-2xl p-3 flex items-center gap-4 border border-zinc-800/50">

                    {/* Cart Icon & Count */}
                    <div className="relative shrink-0 w-12 h-12 flex items-center justify-center bg-zinc-800 rounded-xl">
                        <ShoppingCart size={20} className="text-zinc-400" />
                        <span className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-emerald-500 text-white textxs font-bold rounded-full shadow-lg border-2 border-zinc-900 animate-pop">
                            {itemCount}
                        </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Total</div>
                        <div className="text-lg font-bold text-white leading-tight">
                            ₹ {(totalCents / 100).toFixed(2)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClear}
                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                            title="Clear Cart"
                        >
                            <Trash2 size={18} />
                        </button>
                        <Button
                            onClick={onSubmit}
                            className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/20 active:translate-y-0.5"
                        >
                            Submit Order
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
