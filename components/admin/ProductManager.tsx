import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Eye, EyeOff, Plus, Upload, Image as ImageIcon } from "lucide-react";

type Category = { id: string; name: string; icon_url?: string | null };
type Product = { id: string; name: string; price_cents: number; category_id: string; image_url?: string | null; mrp_cents?: number | null; unit_label?: string | null; subtitle?: string | null; options_json?: any; active?: boolean };

interface ProductManagerProps {
    categories: Category[];
    products: Product[];
    onAddProduct: (name: string, price: number, cat: string, file?: File | null, extra?: any) => Promise<void>;
    onAddCategory: (name: string) => Promise<string | null>;
    onToggleActive: (id: string, active: boolean) => Promise<void>;
}

export function ProductManager({ categories, products, onAddProduct, onAddCategory, onToggleActive }: ProductManagerProps) {
    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-500">
            <ProductAdder categories={categories} onAdd={onAddProduct} onAddCat={onAddCategory} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {products.map(p => (
                    <div key={p.id} className="group relative bg-white border border-zinc-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all flex items-start gap-3">
                        <div className="w-16 h-16 rounded-lg bg-zinc-100 shrink-0 border overflow-hidden flex items-center justify-center">
                            {p.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon className="text-zinc-300" size={24} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                                <h4 className="font-semibold text-zinc-900 truncate pr-2">{p.name}</h4>
                                <button
                                    onClick={() => onToggleActive(p.id, p.active !== false)}
                                    className={`shrink-0 p-1.5 rounded-md transition-colors ${p.active !== false ? 'text-zinc-400 hover:text-amber-600 hover:bg-amber-50' : 'text-zinc-300 bg-zinc-50 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                >
                                    {p.active !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                            </div>
                            <div className="text-xs text-zinc-500 truncate mt-0.5">
                                {categories.find(c => c.id === p.category_id)?.name || 'Uncategorized'}
                            </div>
                            <div className="font-bold text-zinc-900 mt-1">₹ {(p.price_cents / 100).toFixed(2)}</div>
                        </div>

                        {p.active === false && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] rounded-xl flex items-center justify-center">
                                <Button size="sm" variant="outline" className="bg-white border-emerald-200 text-emerald-700 shadow-sm" onClick={() => onToggleActive(p.id, false)}>
                                    Activate
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function ProductAdder({ categories, onAdd, onAddCat }: { categories: Category[]; onAdd: (name: string, price: number, cat: string, file?: File | null) => Promise<void>; onAddCat: (name: string) => Promise<string | null> }) {
    const { toast } = useToast();
    const [name, setName] = useState("");
    const [price, setPrice] = useState<string>("10");
    const [file, setFile] = useState<File | null>(null);
    const [catMode, setCatMode] = useState<"existing" | "new">("existing");
    const [cat, setCat] = useState<string>("");
    const [newCat, setNewCat] = useState("");

    useEffect(() => { if (!cat && categories[0]) setCat(categories[0].id); }, [categories]);

    async function handleAdd() {
        let categoryId = cat;
        if (catMode === "new") {
            categoryId = (await onAddCat(newCat)) || "";
            if (!categoryId) return;
            setNewCat("");
        }
        const parsed = parseFloat(price);
        if (!isFinite(parsed) || parsed <= 0) { toast({ title: "Enter a valid price", variant: "error" }); return; }
        if (!name.trim()) { toast({ title: "Enter a product name", variant: "error" }); return; }
        await onAdd(name.trim(), parsed, categoryId, file);
        setName(""); setPrice("10"); setFile(null);
    }

    return (
        <Card className="border-indigo-100 bg-indigo-50/30">
            <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg"><Plus size={16} /></span>
                    <span className="font-semibold text-indigo-900">Add New Product</span>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <Input placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} className="bg-white" />
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-zinc-400">₹</span>
                            <Input type="number" step="0.5" value={price} onChange={e => setPrice(e.target.value)} className="pl-7 bg-white" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        {catMode === 'existing' ? (
                            <div className="flex gap-2">
                                <select className="flex-1 h-10 px-3 rounded-md border border-zinc-200 bg-white text-sm" value={cat} onChange={e => setCat(e.target.value)}>
                                    {categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                                </select>
                                <Button variant="outline" size="sm" onClick={() => setCatMode('new')} title="New Category" className="px-2"><Plus size={16} /></Button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <Input placeholder="New Category Name" value={newCat} onChange={e => setNewCat(e.target.value)} className="bg-white" />
                                <Button variant="ghost" size="sm" onClick={() => setCatMode('existing')} className="text-xs">Cancel</Button>
                            </div>
                        )}

                        <div className="relative">
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                accept="image/*"
                                onChange={e => setFile(e.target.files?.[0] || null)}
                            />
                            <label htmlFor="file-upload" className="flex items-center justify-center gap-2 w-full h-10 border border-dashed border-zinc-300 rounded-md bg-white text-zinc-500 text-sm cursor-pointer hover:bg-zinc-50 hover:border-zinc-400 transition-colors">
                                <Upload size={14} />
                                {file ? file.name : "Upload Image"}
                            </label>
                        </div>
                    </div>
                </div>

                <Button onClick={handleAdd} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100">
                    Add Product
                </Button>
            </CardContent>
        </Card>
    );
}
