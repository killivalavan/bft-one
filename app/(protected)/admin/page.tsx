"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import jsPDF from "jspdf";
import { useToast } from "@/components/ui/Toast";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { UserList } from "@/components/admin/UserList";
import { ProductManager } from "@/components/admin/ProductManager";
import { SalesReports } from "@/components/admin/SalesReports";
import { generatePayslipPdf } from "@/lib/utils/payslip";
import { Loader2, ShieldAlert } from "lucide-react";

type Profile = { id: string; email: string; is_admin: boolean; is_stock_manager?: boolean | null; in_time?: string | null; base_salary_cents?: number | null; per_day_salary_cents?: number | null; age?: number | null; dob?: string | null; contact_number?: string | null; emergency_contact_number?: string | null };
type Category = { id: string; name: string; icon_url?: string | null };
type Product = { id: string; name: string; price_cents: number; category_id: string; image_url?: string | null; mrp_cents?: number | null; unit_label?: string | null; subtitle?: string | null; options_json?: any; active?: boolean };

enum AdminView { Loading, NotAdmin, Ready }

export default function AdminPage() {
  const { toast } = useToast();
  const [gate, setGate] = useState<AdminView>(AdminView.Loading);
  const [tab, setTab] = useState<"users" | "products" | "reports">("users");

  const [users, setUsers] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [report, setReport] = useState<{ name: string; qty: number; revenue: number }[]>([]);

  async function load() {
    // Try fetching with new 'dob' column
    let { data: us, error } = await supabaseClient.from("profiles").select("id,email,is_admin,is_stock_manager,in_time,base_salary_cents,per_day_salary_cents,age,dob,contact_number,emergency_contact_number").order("email");

    if (error) {
      console.warn("Full fetch failed, trying fallback...", error);
      // Fallback: Fetch without 'dob' in case column is missing
      const { data: usFallback, error: errFallback } = await supabaseClient.from("profiles").select("id,email,is_admin,is_stock_manager,in_time,base_salary_cents,per_day_salary_cents,age,contact_number,emergency_contact_number").order("email");

      if (errFallback) {
        console.error("Fallback fetch failed", errFallback);
        toast({ title: "Error loading users", description: errFallback.message, variant: "error" });
        setUsers([]);
      } else {
        us = usFallback;
        toast({ title: "Schema Mismatch", description: "Missing 'dob' column. Please add it to Supabase.", variant: "warning" });
      }
    }

    setUsers(us || []);
    const { data: cats } = await supabaseClient.from("categories").select("*").order("name");
    setCategories(cats || []);
    const { data: prods } = await supabaseClient.from("products").select("*").order("name");
    setProducts(prods || []);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { setGate(AdminView.NotAdmin); return; }
      const { data: profile } = await supabaseClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (!profile?.is_admin) { setGate(AdminView.NotAdmin); return; }
      setGate(AdminView.Ready);
      await load();
    })();
  }, []);

  // User Actions
  async function createUser(email: string, password: string) {
    const res = await fetch("/api/seed-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, isAdmin: false }) });
    if (!res.ok) { toast({ title: "Failed to create user", variant: "error" }); return; }
    await load();
    toast({ title: "User created", variant: "success" });
  }

  async function updatePasswordFor(email: string, newPassword: string) {
    if (!newPassword) { toast({ title: "Enter a password", variant: "error" }); return; }
    const res = await fetch("/api/seed-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: newPassword, isAdmin: false }) });
    if (!res.ok) { toast({ title: "Failed to update password", variant: "error" }); return; }
    toast({ title: "Password updated", variant: "success" });
  }

  async function removeUser(userId: string) {
    if (!confirm("Remove this user?")) return;
    const res = await fetch("/api/admin-users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    if (!res.ok) { toast({ title: "Failed to remove user", variant: "error" }); return; }
    await load();
    toast({ title: "User removed", variant: "success" });
  }

  async function toggleStockManager(userId: string, current: boolean) {
    await supabaseClient.from('profiles').update({ is_stock_manager: !current }).eq('id', userId);
    await load();
    toast({ title: !current ? "Granted Stock Manager" : "Revoked Stock Manager", variant: "success" });
  }

  async function updateMeta(id: string, field: string, val: any) {
    await supabaseClient.from('profiles').update({ [field]: val }).eq('id', id);
  }

  async function updateFullProfile(id: string, updates: any) {
    const { error } = await supabaseClient.from('profiles').update(updates).eq('id', id);
    if (error) {
      console.warn("Update failed, trying fallback...", error.message);
      // Fallback: Try updating without dob/age in case column missing
      const { dob, age, ...safeUpdates } = updates;
      const { error: errFallback } = await supabaseClient.from('profiles').update(safeUpdates).eq('id', id);

      if (errFallback) {
        toast({ title: "Update failed", description: errFallback.message, variant: "error" });
      } else {
        toast({ title: "Updated (Partial)", description: "Saved details, but DOB failed (missing DB column)", variant: "warning" });
        await load();
      }
      return;
    }
    toast({ title: "Profile updated", variant: "success" });
    await load();
  }

  async function handleDownloadPayslip(userId: string, targetDate: Date) {
    try {
      const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const monthLabel = start.toLocaleString(undefined, { month: 'long', year: 'numeric' });

      const { data: prof, error: profErr } = await supabaseClient.from('profiles').select('email, base_salary_cents').eq('id', userId).single();
      if (profErr || !prof) throw new Error("Profile not found");

      const { data: ents, error: entsErr } = await supabaseClient.from('salary_entries').select('entry_date, amount_cents, reason').eq('user_id', userId).gte('entry_date', startStr).lte('entry_date', endStr).order('entry_date', { ascending: false });
      if (entsErr) throw new Error("Failed to load entries");

      const entries = ents || [];
      const deductions = entries.reduce((s, e) => s + (e.amount_cents || 0), 0);
      const baseSalary = prof.base_salary_cents || 0;
      const netPay = Math.max(0, baseSalary - deductions);

      await generatePayslipPdf({ userEmail: prof.email, monthLabel, baseSalary, deductions, netPay, entries: entries as any });
      toast({ title: `Payslip downloaded for ${prof.email}`, variant: "success" });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Payslip failed", description: e.message, variant: "error" });
    }
  }

  // Product Actions
  async function addCategory(name: string) {
    if (!name.trim()) return null;
    const { data, error } = await supabaseClient.from("categories").insert({ name }).select("id").single();
    if (error) { toast({ title: "Category failed", description: error.message, variant: "error" }); return null; }
    await load();
    toast({ title: "Category created", variant: "success" });
    return data?.id as string;
  }

  async function addProduct(name: string, price: number, category_id: string, file?: File | null, extras?: any) {
    let image_url: string | null = null;
    if (file) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabaseClient.storage.from('product-images').upload(path, file, { upsert: false, cacheControl: '3600' });
      if (upErr) { toast({ title: "Image upload failed", description: upErr.message, variant: "error" }); return; }
      const { data: pub } = supabaseClient.storage.from('product-images').getPublicUrl(path);
      image_url = pub.publicUrl;
    }
    const payload: any = { name, price_cents: Math.round(price * 100), category_id, image_url, active: true };
    const { error } = await supabaseClient.from("products").insert(payload);
    if (error) { toast({ title: "Product failed", description: error.message, variant: "error" }); }
    else { await load(); toast({ title: "Product added", variant: "success" }); }
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabaseClient.from("products").update({ active }).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "error" }); return; }
    await load();
    toast({ title: active ? "Product Activated" : "Product Deactivated", variant: "success" });
  }

  // Reports
  async function buildReport() {
    const { data: items } = await supabaseClient.from("order_items").select("product_id, qty, price_cents");
    const { data: prods } = await supabaseClient.from("products").select("id,name");
    const nameById = new Map((prods || []).map(p => [p.id, p.name]));
    const agg = new Map<string, { qty: number; revenue: number }>();
    (items || []).forEach((it: any) => {
      const name = nameById.get(it.product_id) || "Unknown";
      const prev = agg.get(name) || { qty: 0, revenue: 0 };
      prev.qty += it.qty; prev.revenue += it.qty * it.price_cents; agg.set(name, prev);
    });
    setReport(Array.from(agg.entries()).map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue })).sort((a, b) => b.revenue - a.revenue));
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.text("Sales Report", 10, 10);
    report.forEach((r, idx) => { doc.text(`${idx + 1}. ${r.name} - Qty: ${r.qty} - ₹ ${(r.revenue / 100).toFixed(2)}`, 10, 20 + idx * 8); });
    doc.save("report.pdf");
  }

  if (gate === AdminView.Loading) return <div className="min-h-[50vh] flex items-center justify-center gap-2 text-zinc-500"><Loader2 className="animate-spin" /> Loading Admin...</div>;
  if (gate === AdminView.NotAdmin) return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4">
        <ShieldAlert size={32} />
      </div>
      <h2 className="text-xl font-bold text-zinc-900">Restricted Area</h2>
      <p className="text-zinc-500 mt-2">Only administrators can access this dashboard.</p>
    </div>
  );

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Admin Dashboard</h1>
        </div>

        <AdminTabs activeTab={tab} onChange={setTab} />

        {tab === 'users' && (
          <UserList
            users={users}
            onAddUser={createUser}
            onRemoveUser={removeUser}
            onUpdatePass={updatePasswordFor}
            onToggleStockManager={toggleStockManager}
            onUpdateFullProfile={updateFullProfile}
            onDownloadPayslip={handleDownloadPayslip}
          />
        )}

        {tab === 'products' && (
          <ProductManager
            categories={categories}
            products={products}
            onAddProduct={addProduct}
            onAddCategory={addCategory}
            onToggleActive={toggleActive}
          />
        )}

        {tab === 'reports' && (
          <SalesReports
            report={report}
            onGenerate={buildReport}
            onExport={exportPdf}
          />
        )}
      </div>
    </div>
  );
}
