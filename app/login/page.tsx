"use client";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Boxes, Loader2 } from "lucide-react";
import { useTenant } from "@/lib/context/TenantContext";

export default function LoginPage() {
    const { business } = useTenant();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [hasTenantParam, setHasTenantParam] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (typeof window !== "undefined") {
            setHasTenantParam(new URLSearchParams(window.location.search).has("tenant"));
        }
    }, []);

    async function onLogin(e: React.FormEvent) {
        e.preventDefault();
        setError(undefined);
        setLoading(true);

        const normalizedEmail = email.toLowerCase().trim();
        const { data: authData, error } = await supabaseClient.auth.signInWithPassword({
            email: normalizedEmail,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        try { localStorage.setItem('bftone_display_email', normalizedEmail); } catch { }
        try { localStorage.removeItem('bftone_tenant_cache'); } catch { }

        // Check if user is Super Admin
        if (normalizedEmail === 'admin@seyalpro.com') {
            window.location.href = "/super-admin";
            return;
        }

        if (authData?.user) {
            const { data: prof } = await supabaseClient
                .from('profiles')
                .select('is_super_admin, business_id')
                .eq('id', authData.user.id)
                .maybeSingle();

            if (prof?.is_super_admin) {
                window.location.href = "/super-admin";
                return;
            }

            if (prof?.business_id) {
                const { data: biz } = await supabaseClient
                    .from('businesses')
                    .select('slug')
                    .eq('id', prof.business_id)
                    .maybeSingle();

                if (biz?.slug) {
                    document.cookie = `tenant_slug=${biz.slug}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
                }
            }
        }

        // Standard shop user/admin redirect to shop dashboard
        window.location.href = "/";
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-600 text-white shadow-lg shadow-sky-200 mb-2">
                        <Boxes size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
                        SeyalPro
                    </h1>
                    {hasTenantParam && business?.name ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-100">
                            <span className="text-zinc-400">Workspace:</span>
                            <span className="font-bold">{business.name}</span>
                        </div>
                    ) : (
                        <p className="text-xs text-sky-700 font-medium bg-sky-50 inline-block px-3 py-1 rounded-full border border-sky-100">
                            Business Operating System
                        </p>
                    )}
                    <p className="text-zinc-500 text-sm">Enter your credentials to access your workspace</p>
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
                    &copy; {new Date().getFullYear()} {business?.name || "SeyalPro"}. All rights reserved.
                </p>
            </div>
        </div>
    );
}
