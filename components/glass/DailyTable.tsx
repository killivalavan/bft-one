import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface DailyRow {
    date: string;
    bSmall: number;
    bLarge: number;
    broken: number;
}

interface DailyTableProps {
    rows: DailyRow[];
}

export function DailyTable({ rows }: DailyTableProps) {
    if (rows.length === 0) {
        return <div className="p-8 text-center text-zinc-500 italic">No daily records found.</div>
    }

    return (
        <div className="rounded-xl border border-zinc-200 overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-zinc-600">Date</th>
                            <th className="px-4 py-3 text-right font-semibold text-zinc-600">Small</th>
                            <th className="px-4 py-3 text-right font-semibold text-zinc-600">Large</th>
                            <th className="px-4 py-3 text-right font-semibold text-zinc-900">Total Broken</th>
                            <th className="px-4 py-3 text-right font-semibold text-zinc-600">Daily Δ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {rows.map((row, idx) => {
                            const prev = rows[idx + 1];
                            const delta = prev ? (row.broken - prev.broken) : 0;

                            return (
                                <tr key={row.date} className="hover:bg-zinc-50/50 transition-colors group">
                                    <td className="px-4 py-3 font-medium text-zinc-900">{row.date}</td>
                                    <td className="px-4 py-3 text-right text-zinc-600 tabular-nums">{row.bSmall}</td>
                                    <td className="px-4 py-3 text-right text-zinc-600 tabular-nums">{row.bLarge}</td>
                                    <td className="px-4 py-3 text-right font-bold text-zinc-900 tabular-nums">
                                        <span className="inline-block py-0.5 px-2 bg-zinc-100 rounded-md">
                                            {row.broken}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {delta !== 0 ? (
                                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${delta > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                                                {delta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                                                {Math.abs(delta)}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-300">
                                                <Minus size={12} className="inline" />
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
