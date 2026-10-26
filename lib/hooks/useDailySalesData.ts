"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabaseClient";

export function useDailySalesQuery(bizId: string | undefined, dateStr: string) {
  const activeBizId = bizId || "default";

  return useQuery({
    queryKey: ["daily_sales", activeBizId, dateStr],
    queryFn: async () => {
      const dayStart = `${dateStr}T00:00:00.000Z`;
      const dayEnd = `${dateStr}T23:59:59.999Z`;

      let query = supabaseClient
        .from("orders")
        .select(`
          id,
          user_id,
          business_id,
          total_cents,
          subtotal_cents,
          tax_cents,
          discount_cents,
          status,
          payment_mode,
          customer_name,
          customer_phone,
          table_number,
          created_at,
          order_items (
            id,
            order_id,
            product_id,
            qty,
            price_cents,
            products (
              id,
              name,
              category_id,
              unit_label,
              categories (
                id,
                name,
                icon_emoji
              )
            )
          )
        `)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false });

      if (activeBizId && activeBizId !== "default") {
        query = query.eq("business_id", activeBizId);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to load sales: ${error.message}`);
      }
      return data || [];
    },
    enabled: Boolean(activeBizId && dateStr),
  });
}
