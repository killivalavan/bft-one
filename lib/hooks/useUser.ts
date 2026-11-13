import { useEffect, useState, useRef } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

// Module-level in-memory cache shared across all useUser() hook invocations
// Eliminates loading flickers and full-layout unmounts during client-side navigation
let cachedUser: User | null = null;
let hasResolvedInitialAuth = false;
let handoffPromise: Promise<void> | null = null;

async function consumeSupportHandoffHashOnce(): Promise<void> {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    const match = hash.match(/cc_support_handoff=([^&]+)/);
    if (!match?.[1]) return;

    // Strip the hash immediately so tokens never remain in the address bar or browser history
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    try {
        const decoded = JSON.parse(atob(decodeURIComponent(match[1])));
        const accessToken = typeof decoded?.access_token === 'string' ? decoded.access_token : '';
        const refreshToken = typeof decoded?.refresh_token === 'string' ? decoded.refresh_token : '';
        const sessionId = typeof decoded?.sessionId === 'string' ? decoded.sessionId : '';

        if (accessToken && refreshToken) {
            await supabaseClient.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });
            if (sessionId) {
                await fetch('/api/super-admin/impersonation', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ session_id: sessionId }),
                }).catch(() => {});
            }
        }
    } catch {
        // Ignore malformed handoff payload; normal auth check will handle redirect
    }
}

export function resetUserCache() {
    cachedUser = null;
    hasResolvedInitialAuth = false;
}

export function useUser() {
    const [user, setUser] = useState<User | null>(cachedUser);
    const [loading, setLoading] = useState<boolean>(!hasResolvedInitialAuth);

    // We use a ref to track if we've handled the initial load to avoid flickering
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;

        // 1. Initial Fetch with timeout safeguard
        async function getUser() {
            try {
                if (typeof window !== 'undefined' && window.location.hash.includes('cc_support_handoff=')) {
                    if (!handoffPromise) {
                        handoffPromise = consumeSupportHandoffHashOnce().finally(() => {
                            handoffPromise = null;
                        });
                    }
                    await handoffPromise;
                } else if (handoffPromise) {
                    await handoffPromise;
                }

                const sessionPromise = supabaseClient.auth.getSession();
                const timeoutPromise = new Promise<{ data: { session: null }; error: Error }>((resolve) =>
                    setTimeout(() => resolve({ data: { session: null }, error: new Error('Auth session timeout') }), 5000)
                );
                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                const resolvedUser = session?.user ?? null;
                cachedUser = resolvedUser;
                hasResolvedInitialAuth = true;

                if (mounted.current) {
                    setUser(resolvedUser);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Error fetching session:', error);
                hasResolvedInitialAuth = true;
                if (mounted.current) setLoading(false);
            }
        }

        getUser();

        // 2. Subscribe to auth changes
        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
            // console.log('[useUser] Auth change:', event, session?.user?.email);
            if (session?.user) {
                cachedUser = session.user;
                hasResolvedInitialAuth = true;
            } else if (event === 'SIGNED_OUT') {
                cachedUser = null;
                hasResolvedInitialAuth = true;
            }

            if (!mounted.current) return;

            if (session?.user) {
                setUser((prev) => {
                    if (prev?.id === session.user.id && prev?.email === session.user.email) {
                        return prev;
                    }
                    return session.user;
                });
            } else if (event === 'SIGNED_OUT') {
                // Verify strictly if it's a real sign out by trying to get user again
                // Sometimes on focus/tab switch, state might seemingly clear transiently
                const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
                if (!currentSession) {
                    cachedUser = null;
                    setUser(null);
                } else {
                    cachedUser = currentSession.user;
                    setUser((prev) => {
                        if (prev?.id === currentSession.user.id && prev?.email === currentSession.user.email) {
                            return prev;
                        }
                        return currentSession.user;
                    });
                }
            }
            setLoading(false);
        });

        // 3. Re-validate on focus to handle tab switches returning to this tab
        function onFocus() {
            supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (session?.user) {
                    cachedUser = session.user;
                    hasResolvedInitialAuth = true;
                }
                if (mounted.current && session?.user) {
                    setUser((prev) => {
                        if (prev?.id === session.user.id && prev?.email === session.user.email) {
                            return prev;
                        }
                        return session.user;
                    });
                }
            });
        }

        window.addEventListener('focus', onFocus);
        window.addEventListener('visibilitychange', onFocus);

        return () => {
            mounted.current = false;
            subscription.unsubscribe();
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('visibilitychange', onFocus);
        };
    }, []);

    return { user, loading };
}
