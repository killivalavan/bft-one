import { useEffect, useState } from "react";
import { CloudSun } from "lucide-react";

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

        setDateStr(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
    }, []);

    return (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 py-4 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-zinc-500 font-medium text-sm uppercase tracking-wider">
                    <CloudSun size={16} className="text-amber-500" />
                    <span>{dateStr}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight">
                    {greeting}, <span className="text-sky-600">{name ? name.split('@')[0] : 'Guest'}</span>
                </h1>
                <p className="text-zinc-500 max-w-md">
                    Welcome back to your dashboard. Here is what is happening today.
                </p>
            </div>
        </div>
    );
}
