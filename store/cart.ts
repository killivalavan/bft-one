"use client";
import { create } from "zustand";

export type CartItem = { product_id: string; name: string; price_cents: number; qty: number; image_url?: string | null; unit_label?: string | null };
type State = {
  items: Record<string, CartItem>;
  increment: (p: CartItem) => void;
  decrement: (product_id: string) => void;
  removeItem: (product_id: string) => void;
  setQty: (product_id: string, qty: number, itemInfo?: Partial<CartItem>) => void;
  clear: () => void;
  loadItems: (items: Record<string, CartItem>) => void;
};

export const useCart = create<State>((set) => ({
  items: {},
  increment: (p) => set((s) => {
    const cur = s.items[p.product_id];
    const qty = (cur?.qty || 0) + 1;
    return { items: { ...s.items, [p.product_id]: { ...p, qty } } };
  }),
  decrement: (product_id) => set((s) => {
    const cur = s.items[product_id];
    if (!cur) return s;
    const qty = Math.max(0, (cur.qty || 0) - 1);
    if (qty === 0) {
      const { [product_id]: _drop, ...rest } = s.items;
      return { items: rest };
    }
    return { items: { ...s.items, [product_id]: { ...cur, qty } } };
  }),
  removeItem: (product_id) => set((s) => {
    const { [product_id]: _drop, ...rest } = s.items;
    return { items: rest };
  }),
  setQty: (product_id, qty, itemInfo) => set((s) => {
    if (qty <= 0) {
      const { [product_id]: _drop, ...rest } = s.items;
      return { items: rest };
    }
    const cur = s.items[product_id] || { product_id, name: "Item", price_cents: 0, qty: 0 };
    return { items: { ...s.items, [product_id]: { ...cur, ...itemInfo, qty } } };
  }),
  clear: () => set({ items: {} }),
  loadItems: (items) => set({ items })
}));

export function totalCents(items: Record<string, CartItem>) {
  return Object.values(items).reduce((sum, i) => sum + i.price_cents * i.qty, 0);
}
