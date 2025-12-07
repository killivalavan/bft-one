import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { FileDown, RefreshCw, TrendingUp } from "lucide-react";

interface SalesReportsProps {
    report: { name: string; qty: number; revenue: number }[];
    onGenerate: () => Promise<void>;
    onExport: () => void;
}

export function SalesReports({ report, onGenerate, onExport }: SalesReportsProps) {
    const totalRev = report.reduce((acc, r) => acc + r.revenue, 0);

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-500">
            {/* Actions */}
            <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <div className="text-sm font-medium text-zinc-500">Total Revenue</div>
                        <div className="text-xl font-bold text-zinc-900">₹ {(totalRev / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onGenerate}>
                        <RefreshCw size={16} className="mr-2" /> Refresh
                    </Button>
                    <Button onClick={onExport} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                        <FileDown size={16} className="mr-2" /> Export PDF
                    </Button>
                </div>
            </div>

            {/* Report List */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 bg-zinc-50 border-b border-zinc-100 text-xs font-semibold text-zinc-500 uppercase">
                    <div className="w-6 text-center">#</div>
                    <div>Product</div>
                    <div className="text-right">Revenue</div>
                </div>
                <div className="divide-y divide-zinc-100">
                    {report.map((r, i) => (
                        <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 text-sm hover:bg-zinc-50/50 transition-colors">
                            <div className="w-6 text-center text-zinc-400 font-medium">{i + 1}</div>
                            <div>
                                <div className="font-medium text-zinc-900">{r.name}</div>
                                <div className="text-xs text-zinc-500">Qty: {r.qty}</div>
                            </div>
                            <div className="text-right font-medium text-zinc-900">
                                ₹ {(r.revenue / 100).toFixed(2)}
                            </div>
                        </div>
                    ))}
                    {report.length === 0 && (
                        <div className="p-8 text-center text-zinc-400 italic">
                            No data generated. Click Refresh found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
