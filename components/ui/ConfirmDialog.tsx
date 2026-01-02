import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "info";
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "danger",
    onConfirm,
    onCancel
}: ConfirmDialogProps) {
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
                onClick={onCancel}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-100 animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-200 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full shrink-0 ${variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'}`}>
                            <AlertTriangle size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-zinc-900 leading-tight mb-1">
                                {title}
                            </h3>
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                {description}
                            </p>
                        </div>
                        <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="mt-8 flex items-center justify-end gap-3">
                        <Button variant="ghost" onClick={onCancel} className="font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100">
                            {cancelLabel}
                        </Button>
                        <Button
                            onClick={onConfirm}
                            className={`${variant === 'danger'
                                ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-100'
                                : 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-100'} shadow-lg`}
                        >
                            {confirmLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
