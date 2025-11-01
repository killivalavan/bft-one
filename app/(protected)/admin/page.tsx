"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import SalaryManager from "./SalaryManager";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Profile = { id:string; email:string; is_admin:boolean; is_stock_manager?: boolean|null; in_time?: string|null; base_salary_cents?: number|null; per_day_salary_cents?: number|null; age?: number|null; contact_number?: string|null; emergency_contact_number?: string|null };
type Category = { id:string; name:string; icon_url?: string|null };
type Product = { id:string; name:string; price_cents:number; category_id:string; image_url?: string|null; mrp_cents?: number|null; unit_label?: string|null; subtitle?: string|null; options_json?: any; active?: boolean };

enum AdminView { Loading, NotAdmin, Ready }

export default function AdminPage() {
  const { toast } = useToast();
  const [gate, setGate] = useState<AdminView>(AdminView.Loading);
  const [tab, setTab] = useState<"users"|"products"|"reports">("users");
  const [users,setUsers] = useState<Profile[]>([]);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("123456");
  const [pwByUser, setPwByUser] = useState<Record<string,string>>({});
  const [categories,setCategories] = useState<Category[]>([]);
  const [products,setProducts] = useState<Product[]>([]);
  const [report,setReport] = useState<{name:string; qty:number; revenue:number}[]>([]);

  async function load() {
    const { data: us } = await supabaseClient.from("profiles").select("id,email,is_admin,is_stock_manager,in_time,base_salary_cents,per_day_salary_cents,age,contact_number,emergency_contact_number").order("email");
    setUsers(us||[]);
    const { data: cats } = await supabaseClient.from("categories").select("*").order("name");
    setCategories(cats||[]);
    const { data: prods } = await supabaseClient.from("products").select("*").order("name");
    setProducts(prods||[]);
  }

  async function deactivateProduct(productId:string) {
    if (!confirm("Deactivate this product? It will be hidden from Billing but preserved in reports.")) return;
    const { error } = await supabaseClient.from("products").update({ active: false }).eq("id", productId);
    if (error) { toast({ title: "Failed to deactivate", description: error.message, variant: "error" }); return; }
    await load();
    toast({ title: "Product deactivated", variant: "success" });
  }
  async function activateProduct(productId:string) {
    const { error } = await supabaseClient.from("products").update({ active: true }).eq("id", productId);
    if (error) { toast({ title: "Failed to activate", description: error.message, variant: "error" }); return; }
    await load();
    toast({ title: "Product activated", variant: "success" });
  }
  useEffect(()=>{
    (async()=>{
      const { data:{ user } } = await supabaseClient.auth.getUser();
      if (!user) { setGate(AdminView.NotAdmin); return; }
      const { data: profile } = await supabaseClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (!profile?.is_admin) { setGate(AdminView.NotAdmin); return; }
      setGate(AdminView.Ready);
      await load();
    })();
  },[]);

  async function createUser() {
    const res = await fetch("/api/seed-admin", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ email, password, isAdmin: false }) });
    if (!res.ok) { toast({ title: "Failed to create user", variant: "error" }); return; }
    setEmail(""); setPassword("123456"); await load();
    toast({ title: "User created", variant: "success" });
  }

  async function updatePasswordFor(email:string, newPassword:string) {
    if (!newPassword) { toast({ title: "Enter a password", variant: "error" }); return; }
    const res = await fetch("/api/seed-admin", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ email, password: newPassword, isAdmin: false }) });
    if (!res.ok) { toast({ title: "Failed to update password", variant: "error" }); return; }
    toast({ title: "Password updated", variant: "success" });
  }

  async function removeUser(userId:string) {
    if (!confirm("Remove this user?")) return;
    const res = await fetch("/api/admin-users", { method: "DELETE", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ userId }) });
    if (!res.ok) { toast({ title: "Failed to remove user", variant: "error" }); return; }
    await load();
    toast({ title: "User removed", variant: "success" });
  }

  async function addCategory(name:string) {
    if (!name.trim()) return null as any;
    const { data, error } = await supabaseClient.from("categories").insert({ name }).select("id").single();
    if (error) { toast({ title: "Category failed", description: error.message, variant: "error" }); return null as any; }
    await load();
    toast({ title: "Category created", variant: "success" });
    return data?.id as string;
  }
  async function addProduct(name:string, price:number, category_id:string, file?: File | null, extras?: { mrp?: number; unit?: string; options?: string }) {
    let image_url: string | null = null;
    if (file) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabaseClient.storage.from('product-images').upload(path, file, { upsert: false, cacheControl: '3600' });
      if (upErr) {
        toast({ title: "Image upload failed", description: upErr.message, variant: "error" });
        return;
      }
      const { data: pub } = supabaseClient.storage.from('product-images').getPublicUrl(path);
      image_url = pub.publicUrl;
    }
    const payload:any = { name, price_cents: Math.round(price*100), category_id, image_url, active: true };
    if (extras?.mrp) payload.mrp_cents = Math.round((extras.mrp||0)*100);
    if (typeof extras?.unit === 'string') payload.unit_label = extras.unit;
    if (extras?.options) {
      try { payload.options_json = JSON.parse(extras.options); }
      catch { payload.options_json = extras.options; }
    }
    const { error } = await supabaseClient.from("products").insert(payload);
    if (error) { toast({ title: "Product failed", description: error.message, variant: "error" }); }
    else { await load(); toast({ title: "Product added", variant: "success" }); }
  }

  async function buildReport() {
    const { data: items } = await supabaseClient.from("order_items").select("product_id, qty, price_cents");
    const { data: prods } = await supabaseClient.from("products").select("id,name");
    const nameById = new Map((prods||[]).map(p=>[p.id,p.name]));
    const agg = new Map<string,{qty:number;revenue:number}>();
    (items||[]).forEach((it:any)=>{
      const name = nameById.get(it.product_id) || "Unknown";
      const prev = agg.get(name) || { qty:0, revenue:0 };
      prev.qty += it.qty; prev.revenue += it.qty*it.price_cents; agg.set(name, prev);
    });
    setReport(Array.from(agg.entries()).map(([name,v])=>({ name, qty:v.qty, revenue:v.revenue })).sort((a,b)=>b.revenue-a.revenue));
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.text("Sales Report", 10, 10);
    report.forEach((r, idx)=>{ doc.text(`${idx+1}. ${r.name} - Qty: ${r.qty} - ₹ ${(r.revenue/100).toFixed(2)}`, 10, 20 + idx*8); });
    doc.save("report.pdf");
  }

  if (gate===AdminView.Loading) return <div className="p-4">Loading…</div>;
  if (gate===AdminView.NotAdmin) return <div className="p-4 text-red-600">Admin only</div>;

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {[
          {k:"users", label:"Users"},
          {k:"products", label:"Products"},
          {k:"reports", label:"Reports"},
        ].map(t=> (
          <button key={t.k}
            className={`px-3 py-1.5 rounded-full border ${tab===t.k?'bg-indigo-600 text-white border-indigo-600':'bg-white text-zinc-800'}`}
            onClick={()=>setTab(t.k as any)}>{t.label}</button>
        ))}
      </div>

      {tab==="users" && (
        <Card>
          <CardHeader>
            <div className="font-semibold text-zinc-900">Users</div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex gap-2">
              <Input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
              <Input placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
              <Button onClick={createUser}>Add</Button>
            </div>
            <div className="grid gap-2 text-sm">
              {users.map(u=>(
                <div key={u.id} className="flex flex-col gap-2 rounded-xl border p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-zinc-900">{u.email}</span>
                    <div className="flex items-center gap-2">
                      {u.is_stock_manager ? (
                        <button className="text-[11px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700"
                          onClick={async()=>{ await supabaseClient.from('profiles').update({ is_stock_manager: false }).eq('id', u.id); await load(); }}
                          title="Revoke Stock Manager">
                          Stock manager
                        </button>
                      ) : (
                        <button className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700"
                          onClick={async()=>{ await supabaseClient.from('profiles').update({ is_stock_manager: true }).eq('id', u.id); await load(); }}
                          title="Grant Stock Manager">
                          Make stock manager
                        </button>
                      )}
                      {u.is_admin && <span className="text-emerald-600 text-xs">admin</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input type="text" placeholder="New password" value={pwByUser[u.id]||""} onChange={e=>setPwByUser(prev=>({ ...prev, [u.id]: e.target.value }))} />
                    <Button variant="secondary" onClick={()=>updatePasswordFor(u.email, pwByUser[u.id]||"")}>Update</Button>
                    <Button variant="outline" className="border-red-600 text-red-700 hover:bg-red-50" onClick={()=>removeUser(u.id)}>Remove</Button>
                  </div>
                  {!u.is_admin && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Input placeholder="In time (HH:MM)" defaultValue={u.in_time ?? ''} onBlur={async e=>{ await supabaseClient.from('profiles').update({ in_time: e.target.value || null }).eq('id', u.id); }} />
                        <Input type="number" placeholder="Base salary (₹)" defaultValue={u.base_salary_cents? (u.base_salary_cents/100).toString(): ''} onBlur={async e=>{ const v=e.target.value? Math.round(parseFloat(e.target.value)*100): null; await supabaseClient.from('profiles').update({ base_salary_cents: v }).eq('id', u.id); }} />
                        <Input type="number" placeholder="Per-day salary (₹)" defaultValue={u.per_day_salary_cents? (u.per_day_salary_cents/100).toString(): ''} onBlur={async e=>{ const v=e.target.value? Math.round(parseFloat(e.target.value)*100): null; await supabaseClient.from('profiles').update({ per_day_salary_cents: v }).eq('id', u.id); }} />
                        <Input type="number" placeholder="Age" defaultValue={u.age ?? ''} onBlur={async e=>{ const v=e.target.value? parseInt(e.target.value): null; await supabaseClient.from('profiles').update({ age: v }).eq('id', u.id); }} />
                        <Input placeholder="Contact number" defaultValue={u.contact_number ?? ''} onBlur={async e=>{ await supabaseClient.from('profiles').update({ contact_number: e.target.value || null }).eq('id', u.id); }} />
                        <Input placeholder="Emergency contact" defaultValue={u.emergency_contact_number ?? ''} onBlur={async e=>{ await supabaseClient.from('profiles').update({ emergency_contact_number: e.target.value || null }).eq('id', u.id); }} />
                      </div>
                      <SalaryManager userId={u.id} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab==="products" && (
        <Card className="bg-white">
          <CardHeader><div className="font-semibold text-zinc-900">Products</div></CardHeader>
          <CardContent className="grid gap-3 bg-white text-zinc-900">
            <ProductAdder categories={categories} onAdd={addProduct} onAddCat={addCategory} />
            <div className="grid gap-2 text-sm">
              {products.map(p=> (
                <div key={p.id} className="rounded-xl border p-2 flex items-center gap-2 bg-white text-zinc-900">
                  {/* image */}
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-md object-cover border" />
                  ) : (
                    <div className="w-10 h-10 rounded-md border bg-zinc-50 flex items-center justify-center text-[10px] text-zinc-400">No image</div>
                  )}
                  {/* text */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-900 truncate">{p.name}</div>
                    <div className="text-[11px] text-zinc-700 truncate flex items-center gap-1">
                      {(()=>{ const cat = categories.find(c=>c.id===p.category_id); return (
                        <>
                          {cat?.icon_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cat.icon_url} alt={cat.name} className="w-4 h-4 rounded-full object-cover border" />
                          ) : null}
                          <span className="truncate">{cat?.name || 'Uncategorized'}</span>
                        </>
                      ); })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-zinc-900">₹ {(p.price_cents/100).toFixed(2)}</div>
                    {p.active === false ? (
                      <Button variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50" onClick={()=>activateProduct(p.id)}>Activate</Button>
                    ) : (
                      <Button variant="outline" className="border-amber-600 text-amber-700 hover:bg-amber-50" onClick={()=>deactivateProduct(p.id)}>Deactivate</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab==="reports" && (
        <Card>
          <CardHeader><div className="font-semibold text-zinc-900">Reports</div></CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={buildReport}>Generate</Button>
              <Button onClick={exportPdf}>Export PDF</Button>
            </div>
            <div className="grid gap-2 text-sm">
              {report.map((r,i)=>(
                <div key={i} className="rounded-xl border p-3 flex justify-between">
                  <span>{i+1}. {r.name}</span>
                  <span>Qty: {r.qty} • ₹ {(r.revenue/100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProductAdder({ categories, onAdd, onAddCat }:{ categories:Category[]; onAdd:(name:string, price:number, cat:string, file?:File|null)=>void; onAddCat:(name:string)=>Promise<string|null> }) {
  const { toast } = useToast();
  const [name,setName] = useState("");
  const [price,setPrice] = useState<string>("10");
  const [file, setFile] = useState<File|null>(null);
  const [catMode,setCatMode] = useState<"existing"|"new">("existing");
  const [cat,setCat] = useState<string>("");
  const [newCat,setNewCat] = useState("");
  useEffect(()=>{ if (!cat && categories[0]) setCat(categories[0].id); },[categories]);

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
    onAdd(name.trim(), parsed, categoryId, file);
    setName(""); setPrice("10"); setFile(null);
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Product name" value={name} onChange={e=>setName(e.target.value)} />
        <Input type="number" step="0.5" value={price} onChange={e=>setPrice(e.target.value)} />
        <div className="flex gap-2 items-center sm:col-span-2">
          <label className={`px-3 py-1.5 rounded-full border cursor-pointer ${catMode==='existing'?'bg-brand-50 border-brand-200 text-brand-700':'bg-white'}`} onClick={()=>setCatMode('existing')}>Existing category</label>
          <label className={`px-3 py-1.5 rounded-full border cursor-pointer ${catMode==='new'?'bg-brand-50 border-brand-200 text-brand-700':'bg-white'}`} onClick={()=>setCatMode('new')}>Create new</label>
        </div>
        {catMode==='existing' ? (
          <select className="h-11 px-3 rounded-lg border border-zinc-300 sm:col-span-2" value={cat} onChange={e=>setCat(e.target.value)}>
            {categories.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        ) : (
          <div className="grid gap-2 sm:col-span-2">
            <Input placeholder="New category name" value={newCat} onChange={e=>setNewCat(e.target.value)} />
          </div>
        )}
        <div className="grid gap-1 sm:col-span-2">
          <span className="text-[12px] text-zinc-600">Product image</span>
          <input aria-label="Product image" className="h-11 px-3 rounded-lg border border-zinc-300 text-sm" type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleAdd} className="flex-1">Add product</Button>
      </div>
    </div>
  );
}
