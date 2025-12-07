import { User } from "lucide-react";

interface ProfileHeaderProps {
    email: string | null;
}

export function ProfileHeader({ email }: ProfileHeaderProps) {
    const initial = email ? email[0].toUpperCase() : "?";
    const name = email ? email.split("@")[0] : "User";

    return (
        <div className="flex flex-col items-center justify-center py-8 bg-zinc-50 border-b border-zinc-100 animate-in fade-in zoom-in duration-500">
            <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center text-4xl font-bold text-sky-600 mb-4 ring-1 ring-zinc-200">
                {initial}
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{name}</h1>
            <p className="text-sm text-zinc-500 font-medium bg-zinc-200/50 px-3 py-1 rounded-full mt-2">
                {email}
            </p>
        </div>
    );
}
