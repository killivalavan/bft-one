import { useEffect, useState, useRef } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

// Module-level in-memory cache shared across all useUser() hook invocations
// Eliminates loading flickers and full-layout unmounts during client-side navigation
let cachedUser: User | null = null;
let hasResolvedInitialAuth = false;

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
