"use client";
import { create } from "zustand";

type Item = { product_id:string; name:string; price_cents:number; qty:number };
type State = {
  items: Record<string, Item>;
  increment: (p:Item)=>void;
  decrement: (product_id:string)=>void;
  clear: ()=>void;
};

export const useCart = create<State>((set)=>({
  items: {},
  increment: (p)=>set((s)=>{
    const cur = s.items[p.product_id];
    const qty = (cur?.qty || 0) + 1;
    return { items: { ...s.items, [p.product_id]: { ...p, qty } } };
  }),
  decrement: (product_id)=>set((s)=>{
    const cur = s.items[product_id];
    if (!cur) return s;
    const qty = Math.max(0, (cur.qty || 0) - 1);
    if (qty === 0) {
      const { [product_id]: _drop, ...rest } = s.items;
      return { items: rest } as any;
    }
    return { items: { ...s.items, [product_id]: { ...cur, qty } } };
  }),
  clear: ()=>set({ items: {} })
}));

export function totalCents(items:Record<string,Item>) {
  return Object.values(items).reduce((sum, i)=>sum + i.price_cents*i.qty, 0);
}
