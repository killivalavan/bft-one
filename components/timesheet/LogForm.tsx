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
        <Card className="border-zinc-200 shadow-sm overflow-hidden">
            <CardContent className="p-5 md:p-6 space-y-4">
                {mode === "timesheet" ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                <Timer size={14} />
                                Select Date
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => onDateChoiceChange("today")}
                                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${dateChoice === "today"
                                            ? "bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-200"
                                            : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                                        }`}
                                >
                                    <span className="block text-xs opacity-70 mb-0.5">Today</span>
                                    {todayStr}
                                </button>
                                <button
                                    onClick={() => onDateChoiceChange("yesterday")}
                                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${dateChoice === "yesterday"
                                            ? "bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-200"
                                            : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                                        }`}
                                >
                                    <span className="block text-xs opacity-70 mb-0.5">Yesterday</span>
                                    {yestStr}
                                </button>
                            </div>
                        </div>

                        <Button
                            onClick={onSubmitTimesheet}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 text-base shadow-md shadow-indigo-200 active:translate-y-0.5 transition-all"
                        >
                            <CheckCircleIcon className="w-4 h-4 mr-2" />
                            Confrm & Submit
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                <Timer size={14} />
                                Date
                            </label>
                            <input
                                type="date"
                                value={leaveDate}
                                onChange={(e) => onLeaveDateChange(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-shadow"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                <FileText size={14} />
                                Reason
                            </label>
                            <input
                                type="text"
                                value={reason}
                                placeholder="Sick, vacation, personal..."
                                onChange={(e) => onReasonChange(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-shadow"
                            />
                        </div>
                        <Button
                            onClick={onSubmitLeave}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 text-base shadow-md shadow-indigo-200 active:translate-y-0.5 transition-all"
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
