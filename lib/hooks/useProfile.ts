import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { useUser } from './useUser';

export type UserFlags = {
    isAdmin: boolean;
    isStockManager: boolean;
};

export function useProfile() {
    const { user, loading: userLoading } = useUser();
    const [flags, setFlags] = useState<UserFlags | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Try to load from local storage first for immediate UI
        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem('bftone_flags') : null;
            if (raw) {
                const cached = JSON.parse(raw);
                // Map old format to new if necessary, otherwise assume consistent matches
                // Old format in page.tsx was { is_admin, is_stock_manager }
                // We will normalize to camelCase for the hook return, but storage might be snake_case
                // Let's standardize on storing what we return to avoid confusion, 
                // OR handle legacy storage. 
                // The existing code stored: { is_admin: boolean, is_stock_manager: boolean }
                // Let's stick to that structure in storage to avoid breaking existing sessions, 
                // but map it to our nice camelCase return.

                if (cached) {
                    setFlags({
                        isAdmin: !!cached.is_admin,
                        isStockManager: !!cached.is_stock_manager
                    });
                }
            }
        } catch { }
    }, []);

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setFlags(null);
            setLoading(false);
            try { localStorage.removeItem('bftone_flags'); } catch { }
            return;
        }

        async function fetchProfile() {
            try {
                const { data: prof } = await supabaseClient
                    .from('profiles')
                    .select('is_admin,is_stock_manager')
                    .eq('id', user!.id)
                    .maybeSingle();

                const is_admin = !!prof?.is_admin;
                const is_stock_manager = !!prof?.is_stock_manager;

                const newFlags = { isAdmin: is_admin, isStockManager: is_stock_manager };
                setFlags(newFlags);

                // Cache in original format for compatibility if needed, or just standard json
                try {
                    localStorage.setItem('bftone_flags', JSON.stringify({ is_admin, is_stock_manager }));
                } catch { }

            } catch (e) {
                console.error('Error fetching profile', e);
            } finally {
                setLoading(false);
            }
        }

        fetchProfile();
    }, [user, userLoading]);

    return { flags, loading: loading || userLoading };
}
