"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pencil, Trash2, Check, X, Plus, Tag } from "lucide-react";

export interface FixedPriceItem {
    id: string;
    item_name: string;
    price_cents: number;
    active: boolean;
}

interface FixedPriceManagerProps {
    items: FixedPriceItem[];
    onAdd: (name: string, priceRupees: number) => Promise<boolean>;
    onUpdatePrice: (id: string, priceRupees: number) => Promise<boolean>;
    onToggleActive: (id: string, active: boolean) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

// Admin-only catalog of items with a fixed, non-editable-at-entry-time price.
export function FixedPriceManager({ items, onAdd, onUpdatePrice, onToggleActive, onDelete }: FixedPriceManagerProps) {
    const [newName, setNewName] = useState("");
    const [newPrice, setNewPrice] = useState("");
    const [adding, setAdding] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editPrice, setEditPrice] = useState("");
    const [savingId, setSavingId] = useState<string | null>(null);

    async function handleAdd() {
        const name = newName.trim();
        const priceNum = Number(newPrice);
        if (!name || !newPrice || isNaN(priceNum) || priceNum <= 0) return;

        setAdding(true);
        const ok = await onAdd(name, priceNum);
        setAdding(false);
        if (ok) {
            setNewName("");
            setNewPrice("");
        }
    }

    function startEdit(item: FixedPriceItem) {
        setEditingId(item.id);
        setEditPrice((item.price_cents / 100).toString());
    }

    async function saveEdit(item: FixedPriceItem) {
        const priceNum = Number(editPrice);
        if (!editPrice || isNaN(priceNum) || priceNum <= 0) return;

        setSavingId(item.id);
        const ok = await onUpdatePrice(item.id, priceNum);
        setSavingId(null);
        if (ok) setEditingId(null);
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
            <div className="p-5 pb-3 flex items-center gap-2">
                <Tag size={16} className="text-cyan-600" />
                <h2 className="font-semibold text-zinc-900">Fixed Price Items</h2>
            </div>
            <p className="px-5 text-xs text-zinc-400 -mt-2 pb-3">
                These prices are locked when staff log an expense. Only admins can change them here.
            </p>

            {items.length > 0 && (
                <div className="divide-y divide-zinc-50 border-t border-zinc-50">
                    {items.map(item => {
                        const isEditing = editingId === item.id;
                        return (
                            <div key={item.id} className={`px-5 py-3 flex items-center justify-between gap-3 ${!item.active ? "opacity-50" : ""}`}>
                                <span className="font-medium text-zinc-900 truncate">{item.item_name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    {isEditing ? (
                                        <>
                                            <Input
                                                type="number"
                                                autoFocus
                                                className="h-9 w-24 text-sm"
                                                value={editPrice}
                                                onChange={(e) => setEditPrice(e.target.value)}
                                            />
                                            <button
                                                onClick={() => saveEdit(item)}
                                                disabled={savingId === item.id}
                                                className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600"
                                            >
                                                <Check size={15} />
                                            </button>
                                            <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500">
                                                <X size={15} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="font-semibold text-zinc-900">₹{(item.price_cents / 100).toFixed(2)}</span>
                                            <button onClick={() => startEdit(item)} className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500">
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => onToggleActive(item.id, !item.active)}
                                                className="text-[11px] font-medium px-2 py-1 rounded-md hover:bg-zinc-100 text-zinc-500"
                                            >
                                                {item.active ? "Hide" : "Show"}
                                            </button>
                                            <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-500">
                                                <Trash2 size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="p-5 pt-4 border-t border-zinc-100 flex gap-2">
                <Input placeholder="Item name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
                <Input type="number" placeholder="Price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="w-24" />
                <Button size="sm" onClick={handleAdd} disabled={adding} className="gap-1 shrink-0">
                    <Plus size={14} /> Add
                </Button>
            </div>
        </div>
    );
}
