import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import { Button } from "./Button";

interface ReasonsModalProps {
    open: boolean;
    onClose: () => void;
    reasons?: string[] | null;
    date: string;
}

export function ReasonsModal({ open, onClose, reasons, date }: ReasonsModalProps) {
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-100 animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-200 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-full shrink-0 bg-amber-50 text-amber-600">
                            <FileText size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-zinc-900 leading-tight mb-1">
                                Broken Glass Reasons
                            </h3>
                            <p className="text-sm text-zinc-500">
                                Date: <span className="font-medium text-zinc-700">{date}</span>
                            </p>
                        </div>
                        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="mt-6">
                        {!reasons || reasons.length === 0 ? (
                            <p className="text-sm text-zinc-500 italic text-center py-4 bg-zinc-50 rounded-lg">
                                No reasons recorded.
                            </p>
                        ) : (
                            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                                {reasons.map((reason, idx) => (
                                    <li key={idx} className="flex gap-3 text-sm group">
                                        <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-xs mt-0.5 group-hover:bg-amber-200 transition-colors">
                                            {idx + 1}
                                        </span>
                                        <span className="text-zinc-700 leading-relaxed py-0.5">
                                            {reason || <span className="text-zinc-400 italic">No reason provided</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="mt-8 flex justify-end">
                        <Button onClick={onClose} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
                            Close
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
