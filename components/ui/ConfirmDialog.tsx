"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  X,
  LucideIcon,
} from "lucide-react";
import { Button } from "./Button";

export type ConfirmVariant = "danger" | "warning" | "info" | "primary" | "success";

export interface ConfirmOptions {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  icon?: LucideIcon;
  type?: "confirm" | "alert";
}

export interface AlertOptions {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  variant?: ConfirmVariant;
  icon?: LucideIcon;
}

export interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

const VARIANT_CONFIG: Record<
  ConfirmVariant,
  {
    icon: LucideIcon;
    badgeBg: string;
    badgeColor: string;
    badgeBorder: string;
    badgeRing: string;
    confirmBtnClass: string;
  }
> = {
  danger: {
    icon: AlertOctagon,
    badgeBg: "bg-red-50",
    badgeColor: "text-red-600",
    badgeBorder: "border-red-100",
    badgeRing: "ring-4 ring-red-50/70",
    confirmBtnClass:
      "bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-xs focus-visible:ring-[#DC2626] border-transparent",
  },
  warning: {
    icon: AlertTriangle,
    badgeBg: "bg-amber-50",
    badgeColor: "text-amber-600",
    badgeBorder: "border-amber-100",
    badgeRing: "ring-4 ring-amber-50/70",
    confirmBtnClass:
      "bg-[#D97706] hover:bg-[#B45309] text-white shadow-xs focus-visible:ring-[#D97706] border-transparent",
  },
  info: {
    icon: Info,
    badgeBg: "bg-blue-50",
    badgeColor: "text-[#2563EB]",
    badgeBorder: "border-blue-100",
    badgeRing: "ring-4 ring-blue-50/70",
    confirmBtnClass:
      "bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xs focus-visible:ring-[#2563EB] border-transparent",
  },
  primary: {
    icon: Info,
    badgeBg: "bg-blue-50",
    badgeColor: "text-[#2563EB]",
    badgeBorder: "border-blue-100",
    badgeRing: "ring-4 ring-blue-50/70",
    confirmBtnClass:
      "bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xs focus-visible:ring-[#2563EB] border-transparent",
  },
  success: {
    icon: CheckCircle2,
    badgeBg: "bg-emerald-50",
    badgeColor: "text-emerald-600",
    badgeBorder: "border-emerald-100",
    badgeRing: "ring-4 ring-emerald-50/70",
    confirmBtnClass:
      "bg-[#16A34A] hover:bg-[#15803D] text-white shadow-xs focus-visible:ring-[#16A34A] border-transparent",
  },
};

// ---------------------------------------------------------------------------
// Standalone Modal Presentation (shared by Declarative & Context modes)
// ---------------------------------------------------------------------------
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  isAlert?: boolean;
  icon?: LucideIcon;
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
  isAlert = false,
  icon: CustomIcon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    // Body scroll lock
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Auto-focus the action button
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    // Keyboard handlers: Escape to cancel, Enter to confirm
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.info;
  const IconComponent = CustomIcon || cfg.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog Card */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/90 animate-in zoom-in-95 fade-in slide-in-from-bottom-3 duration-200 overflow-hidden">
        {/* Subtle decorative top accent bar based on variant */}
        <div
          className={`h-1 w-full ${
            variant === "danger"
              ? "bg-red-500"
              : variant === "warning"
              ? "bg-amber-500"
              : variant === "success"
              ? "bg-emerald-500"
              : "bg-[#2563EB]"
          }`}
        />

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5 sm:gap-4">
            {/* Visual Icon Badge */}
            <div
              className={`shrink-0 flex items-center justify-center w-11 h-11 rounded-xl border ${cfg.badgeBg} ${cfg.badgeColor} ${cfg.badgeBorder} ${cfg.badgeRing}`}
            >
              <IconComponent className="w-5 h-5" aria-hidden="true" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-1">
              <h3
                id="confirm-dialog-title"
                className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug tracking-tight mb-1 break-words"
              >
                {title}
              </h3>
              <div
                id="confirm-dialog-desc"
                className="text-xs sm:text-sm text-[#64748B] leading-relaxed break-words whitespace-pre-line"
              >
                {description}
              </div>
            </div>

            {/* Top-right close button */}
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close dialog"
              className="shrink-0 p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons: balanced full-width on mobile (ergonomic tap targets), right-aligned on desktop */}
          <div className="mt-6 sm:mt-7 flex items-center sm:justify-end gap-2.5 sm:gap-3">
            {!isAlert && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onCancel}
                className="flex-1 sm:flex-none font-medium text-[#0F172A] hover:bg-slate-100 active:bg-slate-200 cursor-pointer justify-center"
              >
                {cancelLabel}
              </Button>
            )}
            <Button
              ref={confirmBtnRef}
              type="button"
              size="md"
              onClick={onConfirm}
              className={`flex-1 sm:flex-none ${cfg.confirmBtnClass} font-semibold cursor-pointer min-w-[84px] sm:min-w-[104px] justify-center`}
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

// ---------------------------------------------------------------------------
// Context Provider for Promise-based `confirm()` & `alert()`
// ---------------------------------------------------------------------------
interface DialogState {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  variant: ConfirmVariant;
  isAlert: boolean;
  icon?: LucideIcon;
  resolve?: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({
    isOpen: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    variant: "primary",
    isAlert: false,
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({
        isOpen: true,
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: options.variant ?? "danger",
        isAlert: options.type === "alert",
        icon: options.icon,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise<void>((resolve) => {
      setState({
        isOpen: true,
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? "OK",
        cancelLabel: "",
        variant: options.variant ?? "info",
        isAlert: true,
        icon: options.icon,
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  }, [state]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  }, [state]);

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      <ConfirmDialog
        open={state.isOpen}
        title={state.title}
        description={state.description}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        variant={state.variant}
        isAlert={state.isAlert}
        icon={state.icon}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside a ConfirmProvider");
  }
  return ctx;
}
