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
            const hasParam = new URLSearchParams(window.location.search).has("tenant");
            setHasTenantParam(hasParam);
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

        // Check if user is Super Admin -> Require 2FA on Super Admin Portal
        if (normalizedEmail === 'admin@seyalpro.com') {
            window.location.href = "/super-admin/login";
            return;
        }

        if (authData?.user) {
            const { data: prof } = await supabaseClient
                .from('profiles')
                .select('is_super_admin, business_id')
                .eq('id', authData.user.id)
                .maybeSingle();

            if (prof?.is_super_admin) {
                window.location.href = "/super-admin/login";
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
            <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#2563EB] text-white shadow-xs mb-2">
                        <Boxes size={24} />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight">
                        <span className="text-[#0F172A]">Seyal</span><span className="text-[#2563EB]">Pro</span>
                    </h1>
                    {hasTenantParam && business?.name ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                            <span className="text-slate-500">Workspace:</span>
                            <span className="font-bold">{business.name}</span>
                        </div>
                    ) : (
                        <p className="text-xs text-[#1E40AF] font-semibold bg-[#EFF6FF] inline-block px-3 py-1 rounded-md border border-[#BFDBFE]">
                            Enterprise Business Operating System
                        </p>
                    )}
                    <p className="text-[#64748B] text-sm">Enter your credentials to access your workspace</p>
                </div>

                <Card className="border border-[#E2E8F0] shadow-md rounded-xl overflow-hidden bg-white">
                    <CardHeader className="bg-slate-50 border-b border-[#E2E8F0] pb-4">
                        <h2 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider text-center">Sign In</h2>
                    </CardHeader>
                    <CardContent className="p-6 md:p-8">
                        <form onSubmit={onLogin} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-[#0F172A]">Email</label>
                                <Input
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="h-10 bg-white border-[#E2E8F0] focus:border-[#2563EB] transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-[#0F172A]">Password</label>
                                <Input
                                    placeholder="••••••••"
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="h-10 bg-white border-[#E2E8F0] focus:border-[#2563EB] transition-all"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-xs font-medium animate-in slide-in-from-top-1">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                block
                                className="h-10 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="animate-spin" /> : "Access Dashboard"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <div className="text-center space-y-2 text-xs text-slate-400">
                    <p>&copy; {new Date().getFullYear()} {business?.name || "SeyalPro"}. All rights reserved.</p>
                    <a
                        href="/super-admin/login"
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#2563EB] transition-colors"
                    >
                        <span>Platform Root Portal (2FA)</span>
                    </a>
                </div>
            </div>
        </div>
    );
}
