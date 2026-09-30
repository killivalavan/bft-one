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
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-200 overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="bg-[#EFF6FF] px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                    <div>
                        <div className="text-xs font-semibold text-[#1E40AF] uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Calendar size={12} />
                            Leaves
                        </div>
                        <h3 className="text-lg font-bold text-[#0F172A]">
                            {date ? format(new Date(date), "MMMM d, yyyy") : ""}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 max-h-[60vh] overflow-y-auto">
                    {(!names || names.length === 0) ? (
                        <div className="text-center py-8 text-slate-400">
                            <p>No leaves recorded for this day.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {names.map((name, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                                    <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#1E40AF] font-bold flex items-center justify-center shrink-0 border border-[#BFDBFE]">
                                        {name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-[#0F172A] truncate">{name}</p>
                                        <p className="text-xs text-[#64748B]">On Leave</p>
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
