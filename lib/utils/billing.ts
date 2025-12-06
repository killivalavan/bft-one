import { SupabaseClient } from '@supabase/supabase-js';

export async function preloadBillingCache(supabase: SupabaseClient) {
    try {
        const ts = Number(sessionStorage.getItem('billing_cache_at') || '0');
        // Cache for 5 minutes
        if (!ts || (Date.now() - ts) > 5 * 60 * 1000) {
            const [catsRes, prodsRes, stkRes] = await Promise.all([
                supabase.from("categories").select("*").order("name"),
                supabase.from("products").select("*").eq("active", true).order("name"),
                supabase.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count')
            ]);

            if (!catsRes.error && catsRes.data) {
                sessionStorage.setItem('billing_categories', JSON.stringify(catsRes.data));
            }
            if (!prodsRes.error && prodsRes.data) {
                sessionStorage.setItem('billing_products', JSON.stringify(prodsRes.data));
            }
            if (!stkRes.error && stkRes.data) {
                sessionStorage.setItem('billing_stocks', JSON.stringify(stkRes.data));
            }
            sessionStorage.setItem('billing_cache_at', String(Date.now()));
        }
    } catch (e) {
        console.error('Failed to preload billing cache', e);
    }
}
