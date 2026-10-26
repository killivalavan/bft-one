import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { useUser } from './useUser';

export type UserFlags = {
    isAdmin: boolean;
    isStockManager: boolean;
    isSuperAdmin: boolean;
    businessId: string | null;
};

export function useProfile() {
    const { user, loading: userLoading } = useUser();
    const [flags, setFlags] = useState<UserFlags | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('bftone_flags') || key === 'bftone_flags')) {
                    const cached = JSON.parse(localStorage.getItem(key) || '{}');
                    if (cached && (cached.is_admin !== undefined || cached.isAdmin !== undefined)) {
                        return {
                            isAdmin: !!(cached.is_admin ?? cached.isAdmin),
                            isStockManager: !!(cached.is_stock_manager ?? cached.isStockManager),
                            isSuperAdmin: !!(cached.is_super_admin ?? cached.isSuperAdmin),
                            businessId: cached.business_id || cached.businessId || null,
                        };
                    }
                }
            }
        } catch { }
        return null;
    });
    const [loading, setLoading] = useState(true);

    // Global fail-safe: never allow profile loading state to be stuck for > 6 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            setLoading(false);
        }, 6000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setFlags(null);
            setLoading(false);
            try { localStorage.removeItem('bftone_flags'); } catch { }
            return;
        }

        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(`bftone_flags_${user.id}`) : null;
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && cached.userId === user.id) {
                    setFlags({
                        isAdmin: !!cached.is_admin,
                        isStockManager: !!cached.is_stock_manager,
                        isSuperAdmin: !!cached.is_super_admin,
                        businessId: cached.business_id || null,
                    });
                }
            }
        } catch { }

        async function fetchProfile() {
            try {
                let is_admin = false;
                let is_stock_manager = false;
                let is_super_admin = false;
                let business_id: string | null = null;

                const fetchPromise = supabaseClient
                    .from('profiles')
                    .select('is_admin,is_stock_manager,is_super_admin,business_id')
                    .eq('id', user!.id)
                    .maybeSingle();

                const timeoutPromise = new Promise<{ data: any; error: Error }>((resolve) =>
                    setTimeout(() => resolve({ data: null, error: new Error('Profile query timeout') }), 5000)
                );

                const { data: prof, error } = await Promise.race([fetchPromise, timeoutPromise]);

                if (error) {
                    // Fallback to legacy columns if migration not yet applied
                    const legacyFetch = supabaseClient
                        .from('profiles')
                        .select('is_admin,is_stock_manager')
                        .eq('id', user!.id)
                        .maybeSingle();

                    const { data: legacyProf } = await Promise.race([legacyFetch, timeoutPromise]);

                    if (legacyProf) {
                        is_admin = !!legacyProf.is_admin;
                        is_stock_manager = !!legacyProf.is_stock_manager;
                        is_super_admin = false;
                    }
                } else if (prof) {
                    is_admin = !!prof.is_admin;
                    is_stock_manager = !!prof.is_stock_manager;
                    is_super_admin = !!prof.is_super_admin;
                    business_id = prof.business_id || null;
                }

                const newFlags: UserFlags = {
                    isAdmin: is_admin,
                    isStockManager: is_stock_manager,
                    isSuperAdmin: is_super_admin,
                    businessId: business_id,
                };
                setFlags((prev) => {
                    if (
                        prev &&
                        prev.isAdmin === is_admin &&
                        prev.isStockManager === is_stock_manager &&
                        prev.isSuperAdmin === is_super_admin &&
                        prev.businessId === business_id
                    ) {
                        return prev;
                    }
                    return newFlags;
                });

                try {
                    localStorage.setItem(`bftone_flags_${user!.id}`, JSON.stringify({
                        userId: user!.id,
                        is_admin,
                        is_stock_manager,
                        is_super_admin,
                        business_id
                    }));
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

