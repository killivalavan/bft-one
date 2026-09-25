import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { useUser } from './useUser';

export type UserFlags = {
    isAdmin: boolean;
    isStockManager: boolean;
    isSuperAdmin: boolean;
    businessId: string;
};

const DEFAULT_BUSINESS_ID = "a0000000-0000-0000-0000-000000000001";

export function useProfile() {
    const { user, loading: userLoading } = useUser();
    const [flags, setFlags] = useState<UserFlags | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setFlags(null);
            setLoading(false);
            try { localStorage.removeItem('bftone_flags'); } catch { }
            return;
        }

        // Try user-scoped cache first
        const emailLower = user.email?.toLowerCase() || '';
        const isRootOwnerEmail = emailLower === 'admin@seyalpro.com';

        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(`bftone_flags_${user.id}`) : null;
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && cached.userId === user.id) {
                    setFlags({
                        isAdmin: !!cached.is_admin,
                        isStockManager: !!cached.is_stock_manager,
                        isSuperAdmin: isRootOwnerEmail || (!!cached.is_super_admin && !cached.business_id),
                        businessId: cached.business_id || DEFAULT_BUSINESS_ID,
                    });
                }
            }
        } catch { }

        async function fetchProfile() {
            try {
                // Super Admin is strictly for the platform owner (admin@seyalpro.com or is_super_admin: true with no store bound)
                let is_admin = false;
                let is_stock_manager = false;
                let is_super_admin = isRootOwnerEmail;
                let business_id = DEFAULT_BUSINESS_ID;

                const { data: prof, error } = await supabaseClient
                    .from('profiles')
                    .select('is_admin,is_stock_manager,is_super_admin,business_id')
                    .eq('id', user!.id)
                    .maybeSingle();

                if (error) {
                    // Fallback to legacy columns if migration not yet applied
                    const { data: legacyProf } = await supabaseClient
                        .from('profiles')
                        .select('is_admin,is_stock_manager')
                        .eq('id', user!.id)
                        .maybeSingle();

                    if (legacyProf) {
                        is_admin = !!legacyProf.is_admin;
                        is_stock_manager = !!legacyProf.is_stock_manager;
                        is_super_admin = isRootOwnerEmail;
                    }
                } else if (prof) {
                    is_admin = !!prof.is_admin;
                    is_stock_manager = !!prof.is_stock_manager;
                    is_super_admin = isRootOwnerEmail || (!!prof.is_super_admin && !prof.business_id);
                    business_id = prof.business_id || DEFAULT_BUSINESS_ID;
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

