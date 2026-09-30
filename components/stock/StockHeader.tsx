import { ChevronLeft, Box, RotateCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface StockHeaderProps {
    itemCount: number;
    categoryName: string;
    onRefresh?: () => void;
}

export function StockHeader({ itemCount, categoryName, onRefresh }: StockHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                    <Link href="/" className="hover:text-[#2563EB] transition-colors flex items-center gap-1">
                        <ChevronLeft size={16} /> Home
                    </Link>
                    <span>/</span>
                    <span className="text-slate-900 font-semibold">Stock</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                    <div className="p-2.5 bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 rounded-xl">
                        <Box size={24} />
                    </div>
                    <span>Stock Manager</span>
                </h1>
                <p className="text-slate-500 text-sm">
                    Managing <strong className="text-slate-900">{itemCount}</strong> items in <span className="text-[#2563EB] font-semibold bg-[#EFF6FF] px-2 py-0.5 rounded-md border border-[#2563EB]/20">{categoryName}</span>
                </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <Link
                    href="/inventory"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                    <Box size={14} /> Full Inventory & Recipes
                </Link>

                {onRefresh && (
                    <Button variant="outline" size="sm" onClick={onRefresh} className="self-start md:self-auto bg-white hover:bg-slate-50 border-slate-200 shadow-2xs text-slate-700">
                        <RotateCw size={14} className="mr-2" /> Refresh
                    </Button>
                )}
            </div>
        </div>
    );
}
