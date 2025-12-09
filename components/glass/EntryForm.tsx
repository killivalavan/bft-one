import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Sun, Moon, Calendar, Save } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface EntryFormProps {
    date: string;
    onDateChange: (d: string) => void;
    // Morning
    mSmall: string; setMSmall: (v: string) => void;
    mLarge: string; setMLarge: (v: string) => void;
    onSaveMorning: () => void;
    // Night
    nSmall: string; setNSmall: (v: string) => void;
    nLarge: string; setNLarge: (v: string) => void;
    onSaveNight: () => void;

    // State
    isMorningSaved: boolean;
    isNightSaved: boolean;

    // Submitter Info
    mSubmittedBy?: string | null;
    nSubmittedBy?: string | null;

    showWarning?: boolean;
}

export function EntryForm(props: EntryFormProps) {
    return (
        <div className="space-y-6">
            {/* Date Picker */}
            <Card className="border-0 shadow-sm ring-1 ring-zinc-200">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Calendar size={20} />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block mb-1">Entry Date</label>
                        <input
                            type="date"
                            value={props.date}
                            onChange={(e) => props.onDateChange(e.target.value)}
                            className="w-full font-medium text-zinc-900 bg-transparent border-0 p-0 focus:ring-0"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
                {/* Morning Section */}
                <Card className="border-0 shadow-sm ring-1 ring-zinc-200 overflow-hidden">
                    <div className="bg-amber-50/50 px-4 py-3 border-b border-amber-100 flex items-center gap-2">
                        <Sun size={18} className="text-amber-500" />
                        <span className="font-semibold text-zinc-900">Morning Shift</span>
                    </div>
                    <CardContent className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-zinc-500">Small Count</label>
                                <Input
                                    type="number"
                                    value={props.mSmall}
                                    onChange={(e) => props.setMSmall(e.target.value)}
                                    disabled={props.isMorningSaved || props.isNightSaved}
                                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-zinc-500">Large Count</label>
                                <Input
                                    type="number"
                                    value={props.mLarge}
                                    onChange={(e) => props.setMLarge(e.target.value)}
                                    disabled={props.isMorningSaved || props.isNightSaved}
                                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                        <div>
                            <Button
                                onClick={props.onSaveMorning}
                                disabled={props.isMorningSaved || props.isNightSaved}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 shadow-md disabled:bg-zinc-300 disabled:shadow-none disabled:text-zinc-500"
                            >
                                <Save size={16} className="mr-2" />
                                {props.isMorningSaved ? "Saved" : "Save Morning"}
                            </Button>
                            {props.mSubmittedBy && (
                                <p className="text-xs text-center text-zinc-400 mt-2 animate-in fade-in">
                                    Submitted by <span className="font-medium text-zinc-600">{props.mSubmittedBy}</span>
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Night Section */}
                <Card className="border-0 shadow-sm ring-1 ring-zinc-200 overflow-hidden">
                    <div className="bg-indigo-50/50 px-4 py-3 border-b border-indigo-100 flex items-center gap-2">
                        <Moon size={18} className="text-indigo-500" />
                        <span className="font-semibold text-zinc-900">Night Shift</span>
                    </div>
                    <CardContent className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-zinc-500">Small Count</label>
                                <Input
                                    type="number"
                                    value={props.nSmall}
                                    onChange={(e) => props.setNSmall(e.target.value)}
                                    disabled={props.isNightSaved}
                                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-zinc-500">Large Count</label>
                                <Input
                                    type="number"
                                    value={props.nLarge}
                                    onChange={(e) => props.setNLarge(e.target.value)}
                                    disabled={props.isNightSaved}
                                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                        <div>
                            <Button
                                onClick={props.onSaveNight}
                                disabled={props.isNightSaved}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 shadow-md disabled:bg-zinc-300 disabled:shadow-none disabled:text-zinc-500"
                            >
                                <Save size={16} className="mr-2" />
                                {props.isNightSaved ? "Saved" : "Save Night"}
                            </Button>
                            {props.nSubmittedBy && (
                                <p className="text-xs text-center text-zinc-400 mt-2 animate-in fade-in">
                                    Submitted by <span className="font-medium text-zinc-600">{props.nSubmittedBy}</span>
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {props.showWarning && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-sm">
                    <span className="text-lg">⚠️</span>
                    <p>Please ensure you save <strong>both</strong> Morning and Night shifts to correctly compute and record the 'Broken' count for the day.</p>
                </div>
            )}
        </div>
    );
}
