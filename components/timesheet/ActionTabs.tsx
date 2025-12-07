import { cn } from "@/lib/utils/cn";
import { CheckCircle2, Coffee } from "lucide-react";

interface ActionTabsProps {
    activeTab: "timesheet" | "leave";
    onChange: (tab: "timesheet" | "leave") => void;
}

export function ActionTabs({ activeTab, onChange }: ActionTabsProps) {
    return (
        <div className="flex bg-zinc-100/80 p-1 rounded-xl shadow-inner border border-zinc-200/50 relative">
            {/* Animated Background Pill */}
            <div
                className={cn(
                    "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-all duration-300 ease-spring",
                    activeTab === "timesheet" ? "left-1" : "left-[calc(50%+0px)]"
                )}
            />

            <button
                onClick={() => onChange("timesheet")}
                className={cn(
                    "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors",
                    activeTab === "timesheet" ? "text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                )}
            >
                <CheckCircle2 size={16} className={cn("transition-transform", activeTab === "timesheet" && "scale-110")} />
                Mark Attendance
            </button>
            <button
                onClick={() => onChange("leave")}
                className={cn(
                    "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors",
                    activeTab === "leave" ? "text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                )}
            >
                <Coffee size={16} className={cn("transition-transform", activeTab === "leave" && "scale-110")} />
                Apply Leave
            </button>
        </div>
    );
}
