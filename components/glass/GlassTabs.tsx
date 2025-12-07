import { cn } from "@/lib/utils/cn";
import { PenTool, FileText, Table } from "lucide-react";

interface GlassTabsProps {
    activeTab: "entry" | "logs" | "daily";
    onChange: (tab: "entry" | "logs" | "daily") => void;
}

export function GlassTabs({ activeTab, onChange }: GlassTabsProps) {
    const tabs = [
        { id: "entry", label: "Entry", icon: PenTool },
        { id: "logs", label: "Recent Logs", icon: FileText },
        { id: "daily", label: "Daily Report", icon: Table },
    ] as const;

    return (
        <div className="flex bg-zinc-100/80 p-1 rounded-xl shadow-inner border border-zinc-200/50 relative">
            {/* Animated Pill */}
            <div
                className={cn(
                    "absolute top-1 bottom-1 w-[calc(33.33%-4px)] rounded-lg bg-white shadow-sm transition-all duration-300 ease-spring",
                    activeTab === "entry" ? "left-1" :
                        activeTab === "logs" ? "left-[calc(33.33%+2px)]" : "left-[calc(66.66%+0px)]"
                )}
            />

            {tabs.map((t) => (
                <button
                    key={t.id}
                    onClick={() => onChange(t.id)}
                    className={cn(
                        "flex-1 relative z-10 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors",
                        activeTab === t.id ? "text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                    )}
                >
                    <t.icon size={16} className={cn("transition-transform", activeTab === t.id && "scale-110")} />
                    <span>{t.label}</span>
                </button>
            ))}
        </div>
    );
}
