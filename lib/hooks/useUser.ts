import { useEffect, useState, useRef } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

export function useUser() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // We use a ref to track if we've handled the initial load to avoid flickering
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;

        // 1. Initial Fetch
        async function getUser() {
            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (mounted.current) {
                    setUser(session?.user ?? null);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Error fetching session:', error);
                if (mounted.current) setLoading(false);
            }
        }

        getUser();

        // 2. Subscribe to auth changes
        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
            // console.log('[useUser] Auth change:', event, session?.user?.email);
            if (!mounted.current) return;

            if (session?.user) {
                setUser(session.user);
            } else if (event === 'SIGNED_OUT') {
                // Verify strictly if it's a real sign out by trying to get user again
                // Sometimes on focus/tab switch, state might seemingly clear transiently
                const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
                if (!currentSession) {
                    setUser(null);
                } else {
                    setUser(currentSession.user);
                }
            }
            setLoading(false);
        });

        // 3. Re-validate on focus to handle tab switches returning to this tab
        function onFocus() {
            supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (mounted.current && session?.user) {
                    setUser(session.user);
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
