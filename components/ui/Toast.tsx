"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import { twMerge } from "tailwind-merge";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export type ToastCtx = {
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id?: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

const VARIANT_CONFIG: Record<
  ToastVariant | "default",
  {
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    borderColor: string;
    glowColor: string;
    progressColor: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconBg: "bg-emerald-500/15 border-emerald-500/30",
    iconColor: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    glowColor: "shadow-[0_0_20px_rgba(16,185,129,0.18)]",
    progressColor: "bg-emerald-400",
  },
  error: {
    icon: AlertCircle,
    iconBg: "bg-rose-500/15 border-rose-500/30",
    iconColor: "text-rose-400",
    borderColor: "border-rose-500/30",
    glowColor: "shadow-[0_0_20px_rgba(244,63,94,0.18)]",
    progressColor: "bg-rose-400",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/15 border-amber-500/30",
    iconColor: "text-amber-400",
    borderColor: "border-amber-500/30",
    glowColor: "shadow-[0_0_20px_rgba(245,158,11,0.18)]",
    progressColor: "bg-amber-400",
  },
  info: {
    icon: Info,
    iconBg: "bg-sky-500/15 border-sky-500/30",
    iconColor: "text-sky-400",
    borderColor: "border-sky-500/30",
    glowColor: "shadow-[0_0_20px_rgba(14,165,233,0.18)]",
    progressColor: "bg-sky-400",
  },
  default: {
    icon: Sparkles,
    iconBg: "bg-indigo-500/15 border-indigo-500/30",
    iconColor: "text-indigo-400",
    borderColor: "border-indigo-500/30",
    glowColor: "shadow-[0_0_20px_rgba(99,102,241,0.18)]",
    progressColor: "bg-indigo-400",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const duration = toast.duration ?? (toast.variant === "error" ? 4500 : 3500);

  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(duration);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Touch gesture state for swipe-to-dismiss
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const triggerDismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 220);
  }, [isExiting, onDismiss, toast.id]);

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      remainingTimeRef.current -= Date.now() - startTimeRef.current;
    } else {
      startTimeRef.current = Date.now();
      const timeToWait = Math.max(remainingTimeRef.current, 0);
      timerRef.current = setTimeout(() => {
        triggerDismiss();
      }, timeToWait);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPaused, triggerDismiss]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current !== null && touchStartX.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      // On mobile (top positioned), swipe UP (deltaY < -30) or swipe horizontal (abs(deltaX) > 60) dismisses
      if (deltaY < -30 || Math.abs(deltaX) > 60) {
        triggerDismiss();
        return;
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
    setIsPaused(false);
  };

  const config = VARIANT_CONFIG[toast.variant || "default"];
  const Icon = config.icon;

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={twMerge(
        "pointer-events-auto relative w-full overflow-hidden select-none",
        "rounded-2xl bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl",
        "text-slate-100 border border-slate-700/60",
        "shadow-[0_16px_40px_-8px_rgba(0,0,0,0.45),0_6px_16px_-4px_rgba(0,0,0,0.25)]",
        config.glowColor,
        "transition-all duration-200 ease-out",
        isExiting
          ? "opacity-0 scale-95 -translate-y-3 sm:translate-y-3 pointer-events-none"
          : "opacity-100 scale-100 translate-y-0 animate-in fade-in zoom-in-95 slide-in-from-top-3 sm:slide-in-from-bottom-3 duration-250"
      )}
    >
      <div className="flex items-start gap-3.5 p-3.5 sm:p-4">
        {/* Variant Icon Badge with ambient glow */}
        <div
          className={twMerge(
            "shrink-0 flex items-center justify-center w-8 h-8 rounded-xl border mt-0.5",
            config.iconBg,
            config.iconColor
          )}
        >
          <Icon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="text-[13px] sm:text-sm font-semibold tracking-tight text-white leading-snug break-words">
            {toast.title}
          </div>
          {toast.description && (
            <div className="text-xs text-slate-300/90 leading-relaxed mt-0.5 break-words line-clamp-3">
              {toast.description}
            </div>
          )}

          {/* Action button if provided */}
          {toast.action && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  triggerDismiss();
                }}
                className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white border border-white/10 transition-colors cursor-pointer"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={triggerDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress countdown bar */}
      <div className="h-[2.5px] w-full bg-white/5 overflow-hidden">
        <div
          className={twMerge("h-full transition-colors", config.progressColor)}
          style={{
            animation: `toast-progress ${duration}ms linear forwards`,
            animationPlayState: isPaused ? "paused" : "running",
          }}
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id?: string) => {
    if (id) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    } else {
      setToasts([]);
    }
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    // Keep up to 3 active toasts (newest at front/end)
    setToasts((prev) => {
      const filtered = prev.slice(-2);
      return [...filtered, { id, ...t }];
    });
  }, []);

  return (
    <Ctx.Provider value={{ toast, dismiss }}>
      {children}

      {/* 
        Responsive Toaster Container:
        - Small Viewports (sv / mobile): Top-center pill location, padding for safe area,
          preventing collisions with bottom navigation, floating checkout buttons, or virtual keyboard.
        - Large Viewports (lv / desktop): Bottom-right floating stack, leaving top headers,
          profile menu, store switchers, and central tables clear.
      */}
      <div
        aria-live="polite"
        role="region"
        className={twMerge(
          "pointer-events-none fixed z-[120] flex flex-col gap-2.5",
          // Mobile (SV): Top-center with safe area inset
          "top-[max(0.75rem,env(safe-area-inset-top,0.75rem))] left-3 right-3 items-center max-w-md mx-auto",
          // Desktop (LV): Bottom-right stack
          "sm:top-auto sm:left-auto sm:right-6 sm:bottom-6 sm:items-end sm:max-w-sm sm:w-full sm:mx-0"
        )}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
