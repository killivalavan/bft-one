import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { format, addDays } from "date-fns";
import { Timer, FileText, Send } from "lucide-react";

interface LogFormProps {
    mode: "timesheet" | "leave";
    // Timesheet props
    dateChoice: "today" | "yesterday";
    onDateChoiceChange: (val: "today" | "yesterday") => void;
    onSubmitTimesheet: () => void;
    // Leave props
    leaveDate: string;
    onLeaveDateChange: (val: string) => void;
    reason: string;
    onReasonChange: (val: string) => void;
    onSubmitLeave: () => void;
}

export function LogForm({
    mode,
    dateChoice,
    onDateChoiceChange,
    onSubmitTimesheet,
    leaveDate,
    onLeaveDateChange,
    reason,
    onReasonChange,
    onSubmitLeave,
}: LogFormProps) {

    const todayStr = format(new Date(), "MMM d");
    const yestStr = format(addDays(new Date(), -1), "MMM d");

    return (
        <Card className="border-slate-200 shadow-xs overflow-hidden bg-white">
            <CardContent className="p-5 md:p-6 space-y-4">
                {mode === "timesheet" ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <Timer size={14} className="text-[#2563EB]" />
                                Select Date
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => onDateChoiceChange("today")}
                                    className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${dateChoice === "today"
                                            ? "bg-[#EFF6FF] border-[#2563EB]/40 text-[#2563EB] ring-1 ring-[#2563EB]/20 font-semibold"
                                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                        }`}
                                >
                                    <span className="block text-xs opacity-70 mb-0.5">Today</span>
                                    {todayStr}
                                </button>
                                <button
                                    onClick={() => onDateChoiceChange("yesterday")}
                                    className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${dateChoice === "yesterday"
                                            ? "bg-[#EFF6FF] border-[#2563EB]/40 text-[#2563EB] ring-1 ring-[#2563EB]/20 font-semibold"
                                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                        }`}
                                >
                                    <span className="block text-xs opacity-70 mb-0.5">Yesterday</span>
                                    {yestStr}
                                </button>
                            </div>
                        </div>

                        <Button
                            onClick={onSubmitTimesheet}
                            className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white h-11 text-sm font-semibold shadow-xs rounded-xl transition-all cursor-pointer"
                        >
                            <CheckCircleIcon className="w-4 h-4 mr-2" />
                            Confirm &amp; Submit
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <Timer size={14} className="text-[#2563EB]" />
                                Date
                            </label>
                            <input
                                type="date"
                                value={leaveDate}
                                onChange={(e) => onLeaveDateChange(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#EFF6FF] focus:border-[#2563EB] transition-all text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <FileText size={14} className="text-[#2563EB]" />
                                Reason
                            </label>
                            <input
                                type="text"
                                value={reason}
                                placeholder="Sick, vacation, personal..."
                                onChange={(e) => onReasonChange(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#EFF6FF] focus:border-[#2563EB] transition-all text-sm"
                            />
                        </div>
                        <Button
                            onClick={onSubmitLeave}
                            className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white h-11 text-sm font-semibold shadow-xs rounded-xl transition-all cursor-pointer"
                        >
                            <Send size={16} className="mr-2" />
                            Submit Leave Application
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function CheckCircleIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
    )
}
