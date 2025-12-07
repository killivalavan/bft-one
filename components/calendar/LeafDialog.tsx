import { format } from "date-fns";
import { X, Calendar } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface LeafDialogProps {
    open: boolean;
    date?: string;
    names?: string[];
    onClose: () => void;
}

export function LeafDialog({ open, date, names, onClose }: LeafDialogProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    if (!mounted || !open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-zinc-900/30 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-200 overflow-hidden">
                {/* Header */}
                <div className="bg-sky-50/50 px-5 py-4 border-b border-sky-100 flex items-center justify-between">
                    <div>
                        <div className="text-xs font-semibold text-sky-600 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                            <Calendar size={12} />
                            Leaves
                        </div>
                        <h3 className="text-lg font-bold text-zinc-900">
                            {date ? format(new Date(date), "MMMM d, yyyy") : ""}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 max-h-[60vh] overflow-y-auto">
                    {(!names || names.length === 0) ? (
                        <div className="text-center py-8 text-zinc-400">
                            <p>No leaves recorded for this day.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {names.map((name, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                                        {name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-zinc-900 truncate">{name}</p>
                                        <p className="text-xs text-zinc-500">On Leave</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
