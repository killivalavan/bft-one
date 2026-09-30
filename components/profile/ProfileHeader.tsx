import { User } from "lucide-react";

interface ProfileHeaderProps {
    email: string | null;
}

export function ProfileHeader({ email }: ProfileHeaderProps) {
    const initial = email ? email[0].toUpperCase() : "?";
    const name = email ? email.split("@")[0] : "User";

    return (
        <div className="flex flex-col items-center justify-center py-8 bg-slate-50 border-b border-[#E2E8F0] animate-in fade-in zoom-in duration-300">
            <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-sm flex items-center justify-center text-4xl font-extrabold text-[#2563EB] mb-4 ring-1 ring-[#E2E8F0]">
                {initial}
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">{name}</h1>
            <p className="text-sm text-[#64748B] font-medium bg-slate-100 px-3 py-1 rounded-md mt-2">
                {email}
            </p>
        </div>
    );
}
