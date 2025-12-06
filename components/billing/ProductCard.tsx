import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { Plus, Minus } from "lucide-react";

type Product = {
    id: string;
    name: string;
    price_cents: number;
    image_url: string | null;
    category_id: string;
    mrp_cents?: number | null;
    unit_label?: string | null;
    subtitle?: string | null;
    options_json?: any;
};

type StockStatus = {
    low: boolean;
    oos: boolean;
    s?: { available_qty: number };
};

interface ProductCardProps {
    product: Product;
    qty: number;
    stockStatus: StockStatus;
    onIncrement: () => void;
    onDecrement: () => void;
    onAdd: () => void;
}

export function ProductCard({
    product,
    qty,
    stockStatus,
    onIncrement,
    onDecrement,
    onAdd,
}: ProductCardProps) {
    const { low, oos, s } = stockStatus;
    const atLimit = s ? qty >= Math.max(0, s.available_qty) : false;
    const hasOptions = Array.isArray(product.options_json) && product.options_json.length > 1;

    // Badge logic
    let badge = null;
    if (oos) {
        badge = <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-600 text-white shadow-sm uppercase tracking-wide">Out of Stock</span>;
    } else if (low) {
        badge = <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500 text-white shadow-sm uppercase tracking-wide">Low Stock</span>;
    } else if (qty > 0) {
        badge = (
            <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold shadow-sm animate-pop">
                {qty}
            </span>
        );
    }

    return (
        <Card className="group overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-zinc-200/60 bg-white">
            <CardContent className="p-0">
                <div className="p-3 pb-0">
                    {/* Image Area */}
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-50 border border-zinc-100">
                        {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={product.image_url}
                                alt={product.name}
                                className={cn(
                                    "w-full h-full object-cover transition-transform duration-500 group-hover:scale-110",
                                    oos && "opacity-50 grayscale"
                                )}
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 gap-2">
                                <div className="w-8 h-8 rounded-full border-2 border-dashed border-zinc-200" />
                                <span className="text-[10px] font-medium">No Image</span>
                            </div>
                        )}
                        {badge}
                    </div>

                    {/* Details */}
                    <div className="mt-3 space-y-0.5">
                        <h3 className="text-sm font-semibold text-zinc-900 leading-tight line-clamp-2 min-h-[2.5em]">
                            {product.name}
                        </h3>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-bold text-emerald-700">
                                ₹ {(product.price_cents / 100).toFixed(2)}
                            </span>
                            {product.mrp_cents && product.mrp_cents > product.price_cents && (
                                <span className="text-xs text-zinc-400 line-through">
                                    ₹ {(product.mrp_cents / 100).toFixed(2)}
                                </span>
                            )}
                        </div>
                        {product.subtitle && (
                            <p className="text-[11px] text-zinc-500 truncate">{product.subtitle}</p>
                        )}
                        {/* Available count info */}
                        {!oos && s && (
                            <div className="text-[10px] text-zinc-400 pt-1">
                                Available: {Math.max(0, s.available_qty - qty)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Area */}
                <div className="p-3 pt-3">
                    {hasOptions ? (
                        <Button
                            variant="outline"
                            className="w-full h-10 border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 font-medium text-xs lg:text-sm"
                        >
                            {product.options_json.length} Options
                        </Button>
                    ) : (
                        qty === 0 ? (
                            <Button
                                onClick={onAdd}
                                disabled={oos || atLimit}
                                className={cn(
                                    "w-full h-10 font-medium text-sm transition-all shadow-sm active:scale-[0.98]",
                                    oos || atLimit
                                        ? "bg-zinc-100 text-zinc-400 border border-zinc-200 hover:bg-zinc-100 cursor-not-allowed shadow-none"
                                        : "bg-white border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-700"
                                )}
                            >
                                ADD
                            </Button>
                        ) : (
                            <div className="flex items-center justify-between h-10 bg-emerald-50/50 rounded-lg p-1 gap-1 border border-emerald-100">
                                <button
                                    onClick={onDecrement}
                                    className="w-8 h-full flex items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-200/50 transition-colors active:scale-90"
                                >
                                    <Minus size={16} strokeWidth={2.5} />
                                </button>
                                <span className="font-bold text-emerald-800 text-sm min-w-[20px] text-center animate-pop">
                                    {qty}
                                </span>
                                <button
                                    onClick={onIncrement}
                                    disabled={atLimit || oos}
                                    className={cn(
                                        "w-8 h-full flex items-center justify-center rounded-md transition-colors active:scale-90",
                                        atLimit || oos
                                            ? "text-zinc-400 cursor-not-allowed"
                                            : "text-emerald-700 hover:bg-emerald-200/50"
                                    )}
                                >
                                    <Plus size={16} strokeWidth={2.5} />
                                </button>
                            </div>
                        )
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
