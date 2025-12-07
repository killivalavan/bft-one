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
                <div className="flex items-center gap-2 text-zinc-500 text-sm font-medium">
                    <Link href="/" className="hover:text-sky-700 transition-colors flex items-center gap-1">
                        <ChevronLeft size={16} /> Home
                    </Link>
                    <span>/</span>
                    <span className="text-zinc-900">Stock</span>
                </div>
                <h1 className="text-3xl font-bold text-zinc-900 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                        <Box size={24} />
                    </div>
                    Stock Manager
                </h1>
                <p className="text-zinc-500 text-sm">
                    Managing <strong className="text-zinc-900">{itemCount}</strong> items in <span className="text-sky-700 font-medium bg-sky-50 px-2 py-0.5 rounded-md">{categoryName}</span>
                </p>
            </div>

            {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh} className="self-start md:self-auto bg-white hover:bg-zinc-50 border-zinc-200 shadow-sm text-zinc-700">
                    <RotateCw size={14} className="mr-2" /> Refresh
                </Button>
            )}
        </div>
    );
}
