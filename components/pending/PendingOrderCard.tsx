import { Button } from "@/components/ui/Button";
import { Clock, CheckCircle2, XCircle, ShoppingBag } from "lucide-react";

interface ItemRow {
    order_id: string; product_id: string; qty: number; product_name: string
}

interface PendingOrderCardProps {
    orderId: string;
    totalCents: number;
    createdAt: string;
    items: ItemRow[];
    onCancel: () => void;
    onDeliver: () => void;
}

export function PendingOrderCard({ orderId, totalCents, createdAt, items, onCancel, onDeliver }: PendingOrderCardProps) {
    return (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group">
            {/* Header */}
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 bg-zinc-50/50">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <ShoppingBag size={20} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-zinc-900 text-lg">Order #{orderId.slice(0, 8)}</h3>
                        <div className="flex items-center gap-2 text-sm text-zinc-500 mt-0.5">
                            <Clock size={14} />
                            {new Date(createdAt).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                            })}
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-2xl font-bold text-zinc-900">₹ {(totalCents / 100).toFixed(2)}</div>
                    <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Total Amount</div>
                </div>
            </div>

            {/* Items */}
            <div className="p-5">
                <div className="flex flex-wrap gap-2">
                    {items.length > 0 ? items.map((it, idx) => (
                        <div key={idx} className="inline-flex items-center gap-2 pl-1 pr-3 py-1 bg-white border border-zinc-200 rounded-full text-sm">
                            <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center text-[10px] font-bold border border-zinc-200">
                                {it.qty}
                            </span>
                            <span className="text-zinc-700 max-w-[180px] truncate">{it.product_name}</span>
                        </div>
                    )) : (
                        <span className="text-zinc-400 text-sm italic">No items found</span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
                <Button
                    variant="outline"
                    className="border-zinc-300 text-zinc-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    onClick={onCancel}
                >
                    <XCircle size={16} className="mr-2" /> Cancel
                </Button>
                <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-100"
                    onClick={onDeliver}
                >
                    <CheckCircle2 size={16} className="mr-2" /> Mark Delivered
                </Button>
            </div>
        </div>
    );
}
