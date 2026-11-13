import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { useUser } from './useUser';

export type UserFlags = {
    isAdmin: boolean;
    isStockManager: boolean;
    isSuperAdmin: boolean;
    businessId: string | null;
};

// Module-level in-memory cache shared across all useProfile() hook invocations
// Scoped strictly to the userId that was verified from the server/database in this session.
let cachedProfileFlags: UserFlags | null = null;
let cachedProfileUserId: string | null = null;

export function resetProfileCache() {
    cachedProfileFlags = null;
    cachedProfileUserId = null;
}

export function setVerifiedProfileCache(userId: string, flags: UserFlags) {
    cachedProfileUserId = userId;
    cachedProfileFlags = flags;
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(
                `bftone_flags_${userId}`,
                JSON.stringify({
                    userId,
                    is_admin: flags.isAdmin,
                    is_stock_manager: flags.isStockManager,
                    is_super_admin: flags.isSuperAdmin,
                    business_id: flags.businessId,
                })
            );
        } catch {}
    }
}

export function useProfile() {
    const { user, loading: userLoading } = useUser();
    const [flags, setFlags] = useState<UserFlags | null>(() => {
        if (user?.id && cachedProfileUserId === user.id && cachedProfileFlags) {
            return cachedProfileFlags;
        }
        return null;
    });
    const [resolvedForUserId, setResolvedForUserId] = useState<string | null>(() => {
        if (user?.id && cachedProfileUserId === user.id && cachedProfileFlags) {
            return user.id;
        }
        return null;
    });

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            cachedProfileFlags = null;
            cachedProfileUserId = null;
            setFlags(null);
            setResolvedForUserId(null);
            try {
                if (typeof window !== 'undefined') {
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith('bftone_flags')) {
                            localStorage.removeItem(k);
                        }
                    }
                }
            } catch {}
            return;
        }

        const currentUserId = user.id;

        // If already resolved in memory for this exact user, sync immediately
        if (cachedProfileUserId === currentUserId && cachedProfileFlags) {
            setFlags(cachedProfileFlags);
            setResolvedForUserId(currentUserId);
        }

        let isCancelled = false;

        async function fetchProfile() {
            try {
                // Priority 1: Call server endpoint /api/user/me (uses service_role, immune to client RLS)
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    const token = session?.access_token;
                    if (token) {
                        const res = await fetch('/api/user/me', {
                            headers: { Authorization: `Bearer ${token}` },
                            cache: 'no-store',
                        });
                        if (res.ok) {
                            const payload = await res.json();
                            if (payload?.flags && !isCancelled) {
                                const apiFlags: UserFlags = {
                                    isAdmin: Boolean(payload.flags.isAdmin),
                                    isStockManager: Boolean(payload.flags.isStockManager),
                                    isSuperAdmin: Boolean(payload.flags.isSuperAdmin),
                                    businessId: payload.flags.businessId || null,
                                };
                                setVerifiedProfileCache(currentUserId, apiFlags);
                                setFlags(apiFlags);
                                setResolvedForUserId(currentUserId);
                                return;
                            }
                        }
                    }
                } catch (apiErr) {
                    console.warn('/api/user/me query failed, falling back to client query:', apiErr);
                }

                // Priority 2: Direct Supabase client query
                const fetchPromise = supabaseClient
                    .from('profiles')
                    .select('is_admin,is_stock_manager,is_super_admin,business_id')
                    .eq('id', currentUserId)
                    .maybeSingle();

                const timeoutPromise = new Promise<{ data: any; error: Error }>((resolve) =>
                    setTimeout(() => resolve({ data: null, error: new Error('Profile query timeout') }), 5000)
                );

                const { data: prof, error } = await Promise.race([fetchPromise, timeoutPromise]);

                if (!error && prof && !isCancelled) {
                    const dbFlags: UserFlags = {
                        isAdmin: Boolean(prof.is_admin),
                        isStockManager: Boolean(prof.is_stock_manager),
                        isSuperAdmin: Boolean(prof.is_super_admin),
                        businessId: prof.business_id || null,
                    };
                    setVerifiedProfileCache(currentUserId, dbFlags);
                    setFlags(dbFlags);
                    setResolvedForUserId(currentUserId);
                    return;
                }

                // Priority 3: Last-resort fallback to user-scoped localStorage cache if network/RLS failed
                try {
                    const raw = typeof window !== 'undefined' ? localStorage.getItem(`bftone_flags_${currentUserId}`) : null;
                    if (raw && !isCancelled) {
                        const cached = JSON.parse(raw);
                        if (cached && cached.userId === currentUserId) {
                            const parsed: UserFlags = {
                                isAdmin: Boolean(cached.is_admin),
                                isStockManager: Boolean(cached.is_stock_manager),
                                isSuperAdmin: Boolean(cached.is_super_admin),
                                businessId: cached.business_id || null,
                            };
                            cachedProfileUserId = currentUserId;
                            cachedProfileFlags = parsed;
                            setFlags(parsed);
                            setResolvedForUserId(currentUserId);
                            return;
                        }
                    }
                } catch {}

                if (!isCancelled) {
                    const emptyFlags: UserFlags = {
                        isAdmin: false,
                        isStockManager: false,
                        isSuperAdmin: false,
                        businessId: null,
                    };
                    setFlags(emptyFlags);
                    setResolvedForUserId(currentUserId);
                }
            } catch (e) {
                console.error('Error fetching profile', e);
                if (!isCancelled) {
                    setResolvedForUserId(currentUserId);
                }
            }
        }

        fetchProfile();

        return () => {
            isCancelled = true;
        };
    }, [user, userLoading]);

    // Loading is true while user auth is loading OR while the current user's profile has not yet resolved
    const isProfileLoading = userLoading || Boolean(user && resolvedForUserId !== user.id);

    return { flags, loading: isProfileLoading };
}
