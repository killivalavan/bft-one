import { cn } from "@/lib/utils/cn";
import { CheckCircle2, Coffee } from "lucide-react";

interface ActionTabsProps {
    activeTab: "timesheet" | "leave";
    onChange: (tab: "timesheet" | "leave") => void;
}

export function ActionTabs({ activeTab, onChange }: ActionTabsProps) {
    return (
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 relative">
            {/* Animated Background Pill */}
            <div
                className={cn(
                    "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-xs transition-all duration-300 ease-spring",
                    activeTab === "timesheet" ? "left-1" : "left-[calc(50%+0px)]"
                )}
            />

            <button
                onClick={() => onChange("timesheet")}
                className={cn(
                    "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer",
                    activeTab === "timesheet" ? "text-[#2563EB]" : "text-slate-500 hover:text-slate-800"
                )}
            >
                <CheckCircle2 size={16} className={cn("transition-transform", activeTab === "timesheet" && "scale-110")} />
                <span>Mark Attendance</span>
            </button>
            <button
                onClick={() => onChange("leave")}
                className={cn(
                    "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer",
                    activeTab === "leave" ? "text-[#2563EB]" : "text-slate-500 hover:text-slate-800"
                )}
            >
                <Coffee size={16} className={cn("transition-transform", activeTab === "leave" && "scale-110")} />
                <span>Apply Leave</span>
            </button>
        </div>
    );
}
