"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pencil, Trash2, Check, X, Plus, Tag, Scale } from "lucide-react";

export interface FixedPriceItem {
    id: string;
    item_name: string;
    price_cents: number;
    unit?: string | null;
    active: boolean;
}

interface FixedPriceManagerProps {
    items: FixedPriceItem[];
    onAdd: (name: string, priceRupees: number, unit?: string) => Promise<boolean>;
    onUpdatePrice: (id: string, priceRupees: number, unit?: string) => Promise<boolean>;
    onToggleActive: (id: string, active: boolean) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

export const COMMON_UNITS = [
    { value: "kg", label: "kg (Kilogram)" },
    { value: "pcs", label: "pcs (Pieces)" },
    { value: "each", label: "each (Per Item)" },
    { value: "pkt", label: "pkt (Packet)" },
    { value: "ltr", label: "ltr (Litre)" },
    { value: "box", label: "box (Box)" },
] as const;

export function normalizeUnit(unit?: string | null): string {
    if (!unit) return "each";
    const cleaned = unit.trim().toLowerCase();
    return cleaned || "each";
}

export function extractNameAndUnit(rawName: string, rawUnit?: string | null): { name: string; unit: string } {
    if (rawUnit && rawUnit.trim()) {
        return { name: rawName.trim(), unit: normalizeUnit(rawUnit) };
    }
    const match = rawName.match(/^(.*?)\s*[\(\[]([a-zA-Z0-9]+)[\)\]]\s*$/);
    if (match) {
        return { name: match[1].trim(), unit: normalizeUnit(match[2]) };
    }
    return { name: rawName.trim(), unit: "each" };
}

export function formatNameWithUnitFallback(name: string, unit?: string | null): string {
    const norm = normalizeUnit(unit);
    if (norm === "each") return name;
    if (name.toLowerCase().includes(`(${norm})`) || name.toLowerCase().includes(`[${norm}]`)) {
        return name;
    }
    return `${name} (${norm})`;
}

// Admin-only catalog of items with a fixed price and specified unit (kg, pcs, each, etc.)
export function FixedPriceManager({ items, onAdd, onUpdatePrice, onToggleActive, onDelete }: FixedPriceManagerProps) {
    const [newName, setNewName] = useState("");
    const [newPrice, setNewPrice] = useState("");
    const [newUnit, setNewUnit] = useState<string>("each");
    const [customUnit, setCustomUnit] = useState("");
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [adding, setAdding] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editPrice, setEditPrice] = useState("");
    const [editUnit, setEditUnit] = useState("each");
    const [savingId, setSavingId] = useState<string | null>(null);

    async function handleAdd() {
        const name = newName.trim();
        const priceNum = Number(newPrice);
        const resolvedUnit = showCustomInput ? (customUnit.trim().toLowerCase() || "each") : newUnit;

        if (!name || !newPrice || isNaN(priceNum) || priceNum <= 0) return;

        setAdding(true);
        const ok = await onAdd(name, priceNum, resolvedUnit);
        setAdding(false);
        if (ok) {
            setNewName("");
            setNewPrice("");
            setCustomUnit("");
            setShowCustomInput(false);
            setNewUnit("each");
        }
    }

    function startEdit(item: FixedPriceItem) {
        setEditingId(item.id);
        setEditPrice((item.price_cents / 100).toString());
        setEditUnit(item.unit || "each");
    }

    async function saveEdit(item: FixedPriceItem) {
        const priceNum = Number(editPrice);
        if (!editPrice || isNaN(priceNum) || priceNum <= 0) return;

        setSavingId(item.id);
        const ok = await onUpdatePrice(item.id, priceNum, editUnit);
        setSavingId(null);
        if (ok) setEditingId(null);
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
            <div className="p-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Tag size={16} className="text-[#2563EB]" />
                    <h2 className="font-semibold text-zinc-900">Fixed Price Items</h2>
                </div>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    {items.length} {items.length === 1 ? "Product" : "Products"}
                </span>
            </div>
            <p className="px-5 text-xs text-zinc-400 -mt-2 pb-3">
                Configure standard products with locked prices and units (kg, pcs, each). Staff see these units automatically when logging daily expenses.
            </p>

            {items.length > 0 && (
                <div className="divide-y divide-zinc-50 border-t border-zinc-50 max-h-[380px] overflow-y-auto">
                    {items.map(item => {
                        const isEditing = editingId === item.id;
                        const displayUnit = item.unit || "each";
                        return (
                            <div key={item.id} className={`px-5 py-3 flex items-center justify-between gap-3 ${!item.active ? "opacity-50" : ""}`}>
                                <div className="min-w-0 flex items-center gap-2">
                                    <span className="font-medium text-zinc-900 truncate">{item.item_name}</span>
                                    {!isEditing && (
                                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                            {displayUnit}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-zinc-400">₹</span>
                                                <Input
                                                    type="number"
                                                    value={editPrice}
                                                    onChange={(e) => setEditPrice(e.target.value)}
                                                    className="w-20 h-8 text-sm"
                                                    autoFocus
                                                />
                                            </div>
                                            <select
                                                value={editUnit}
                                                onChange={(e) => setEditUnit(e.target.value)}
                                                className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            >
                                                {COMMON_UNITS.map(u => (
                                                    <option key={u.value} value={u.value}>{u.value}</option>
                                                ))}
                                                {!COMMON_UNITS.some(u => u.value === editUnit) && (
                                                    <option value={editUnit}>{editUnit}</option>
                                                )}
                                            </select>
                                            <button
                                                onClick={() => saveEdit(item)}
                                                disabled={savingId === item.id}
                                                className="p-1.5 rounded-md hover:bg-blue-50 text-[#2563EB]"
                                                title="Save"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-400"
                                                title="Cancel"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-right">
                                                <span className="font-semibold text-zinc-900">₹{(item.price_cents / 100).toFixed(2)}</span>
                                                <span className="text-xs text-zinc-400 font-normal ml-0.5">/{displayUnit}</span>
                                            </div>
                                            <button
                                                onClick={() => startEdit(item)}
                                                className="p-1.5 rounded-md hover:bg-blue-50 text-[#2563EB]"
                                                title="Edit Price & Unit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => onToggleActive(item.id, !item.active)}
                                                className="text-[11px] font-medium px-2 py-1 rounded-md hover:bg-zinc-100 text-zinc-500"
                                            >
                                                {item.active ? "Hide" : "Show"}
                                            </button>
                                            <button
                                                onClick={() => onDelete(item.id)}
                                                className="p-1.5 rounded-md hover:bg-red-50 text-red-500"
                                                title="Delete"
                                            >
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

            {/* Add Fixed Price Item Form */}
            <div className="p-5 pt-4 border-t border-zinc-100 space-y-3 bg-zinc-50/50">
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                        placeholder="Item name (e.g. Sugar, Paper Cups, Milk)"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="flex-1 bg-white text-sm"
                    />
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            placeholder="Price (₹)"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            className="w-28 bg-white text-sm"
                        />
                        <Button
                            size="sm"
                            onClick={handleAdd}
                            disabled={adding || !newName.trim() || !newPrice}
                            className="gap-1.5 shrink-0 px-4 bg-[#2563EB] hover:bg-blue-700 text-white"
                        >
                            <Plus size={14} /> Add Product
                        </Button>
                    </div>
                </div>

                {/* Quick Unit Selector */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-xs font-medium text-zinc-500 flex items-center gap-1 mr-1">
                        <Scale size={12} className="text-zinc-400" /> Unit:
                    </span>
                    {COMMON_UNITS.map(u => {
                        const isSelected = !showCustomInput && newUnit === u.value;
                        return (
                            <button
                                key={u.value}
                                type="button"
                                onClick={() => {
                                    setNewUnit(u.value);
                                    setShowCustomInput(false);
                                }}
                                className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-all ${isSelected
                                        ? "bg-[#2563EB] border-[#2563EB] text-white shadow-xs"
                                        : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                                    }`}
                            >
                                {u.value}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setShowCustomInput(!showCustomInput)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${showCustomInput
                                ? "bg-[#2563EB] border-[#2563EB] text-white"
                                : "bg-white border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400"
                            }`}
                    >
                        {showCustomInput ? "Custom Unit" : "+ Other Unit"}
                    </button>
                    {showCustomInput && (
                        <input
                            type="text"
                            placeholder="e.g. bundle, tray"
                            value={customUnit}
                            onChange={(e) => setCustomUnit(e.target.value)}
                            className="h-7 w-28 rounded-lg border border-blue-300 bg-white px-2 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
