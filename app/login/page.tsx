"use client";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Boxes, Loader2 } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function onLogin(e: React.FormEvent) {
        e.preventDefault();
        setError(undefined);
        setLoading(true);

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        try { localStorage.setItem('bftone_display_email', email); } catch { }

        // Hard redirect to home to ensure state reads correctly on load
        window.location.href = "/";
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-600 text-white shadow-lg shadow-sky-200 mb-2">
                        <Boxes size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Welcome to BFTOne</h1>
                    <p className="text-zinc-500">Enter your credentials to access the workspace</p>
                </div>

                <Card className="border-0 shadow-2xl shadow-zinc-200/50 ring-1 ring-zinc-100 overflow-hidden bg-white/80 backdrop-blur-sm">
                    <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 pb-4">
                        <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider text-center">Sign In</h2>
                    </CardHeader>
                    <CardContent className="p-6 md:p-8">
                        <form onSubmit={onLogin} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-500 ml-1">Email</label>
                                <Input
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-500 ml-1">Password</label>
                                <Input
                                    placeholder="••••••••"
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white transition-all"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm font-medium animate-in slide-in-from-top-1">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                block
                                className="h-10 bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-md shadow-sky-100 active:scale-[0.98] transition-all"
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="animate-spin" /> : "Access Dashboard"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-center text-xs text-zinc-400">
                    &copy; {new Date().getFullYear()} Brown Fening Tea. All rights reserved.
                </p>
            </div>
        </div>
    );
}
