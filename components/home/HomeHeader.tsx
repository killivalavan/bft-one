import { useEffect, useState } from "react";
import { CloudSun, Sparkles, Activity, ShieldCheck } from "lucide-react";

interface HomeHeaderProps {
    name: string | null;
}

export function HomeHeader({ name }: HomeHeaderProps) {
    const [greeting, setGreeting] = useState("Hello");
    const [dateStr, setDateStr] = useState("");

    useEffect(() => {
        const hours = new Date().getHours();
        if (hours < 12) setGreeting("Good Morning");
        else if (hours < 18) setGreeting("Good Afternoon");
        else setGreeting("Good Evening");

        setDateStr(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }));
    }, []);

    return (
        <div className="relative pt-2 pb-4">
            {/* Ambient Radial Mesh Glow */}
            <div className="absolute -top-16 -left-12 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="absolute -top-10 right-0 w-80 h-80 bg-slate-200/40 rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                    {/* Status Pill & Live Indicator */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-[#E2E8F0] shadow-2xs text-[11px] font-semibold text-[#0F172A]">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
                            </span>
                            <span className="font-medium text-[#64748B]">Live Workspace</span>
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-[#E2E8F0] shadow-2xs text-[11px] font-semibold text-[#64748B]">
                            <CloudSun size={13} className="text-[#2563EB]" />
                            <span>{dateStr}</span>
                        </div>
                    </div>

                    {/* Headline */}
                    <div>
                        <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-[#0F172A] tracking-tight leading-tight">
                            {greeting}, <span className="text-[#2563EB] capitalize">{name ? name.split('@')[0] : 'Workspace'}</span>
                        </h1>
                        <p className="text-[#64748B] text-sm sm:text-base font-normal mt-1 max-w-xl">
                            Enterprise operations overview. Access billing, staff attendance, sales, and analytics below.
                        </p>
                    </div>
                </div>

                {/* Right Badge / Enterprise System Shield */}
                <div className="hidden lg:flex items-center gap-3 bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-xs">
                    <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#2563EB] shrink-0">
                        <ShieldCheck size={22} />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                            SeyalPro Core
                            <span className="px-1.5 py-0.2 rounded bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] text-[10px] font-extrabold uppercase">v2.4</span>
                        </div>
                        <div className="text-[11px] text-[#64748B] font-medium">All services connected & synced</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
