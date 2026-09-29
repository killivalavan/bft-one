"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useCart, totalCents, CartItem } from "@/store/cart";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { useTenant } from "@/lib/context/TenantContext";
import {
  Search, X, Plus, Minus, Trash2, ShoppingBag, Receipt,
  CreditCard, QrCode, Banknote, Printer, Download, FileText,
  Grid, List, ArrowRight,
  Hash, Coffee, Zap, CheckCircle2, Phone, MessageCircle, Copy, Check, ExternalLink
} from "lucide-react";
import { generateBillPdf } from "@/lib/utils/billPdf";
import { InvoiceDetailsModal } from "@/components/billing/InvoiceDetailsModal";

// ==========================================
// Types
// ==========================================
type Category = {
  id: string;
  name: string;
  icon_url?: string | null;
  icon_emoji?: string;
};

type Product = {
  id: string;
  name: string;
  price_cents: number;
  image_url: string | null;
  category_id: string;
  unit_label?: string | null;
  subtitle?: string | null;
};

type Stock = {
  product_id: string;
  max_qty: number;
  available_qty: number;
  notify_at_count?: number | null;
};

type CompletedOrder = {
  orderId: string;
  items: CartItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMode: string;
  customerName: string;
  customerPhone?: string;
  tableNumber?: string;
  date: string;
};

// ==========================================
// Demo / Fallback Data (Clean Cafe & Retail)
// ==========================================
const DUMMY_CATEGORIES: Category[] = [
  { id: "cat-all", name: "All Items", icon_emoji: "✨" },
  { id: "cat-tea", name: "Teas & Chai", icon_emoji: "☕" },
  { id: "cat-coffee", name: "Coffee", icon_emoji: "🧋" },
  { id: "cat-snacks", name: "Snacks & Chaat", icon_emoji: "🥟" },
  { id: "cat-coolers", name: "Beverages", icon_emoji: "🍹" },
  { id: "cat-bakery", name: "Bakery & Desserts", icon_emoji: "🥐" },
  { id: "cat-combos", name: "Combos & Meals", icon_emoji: "🍱" },
];

const DUMMY_PRODUCTS: Product[] = [
  // Teas
  {
    id: "demo-t1",
    name: "Special Dum Chai",
    subtitle: "Fresh brewed spiced milk tea",
    price_cents: 2500,
    category_id: "cat-tea",
    unit_label: "200 ml",
    image_url: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-t2",
    name: "Masala Ginger Tea",
    subtitle: "Crushed ginger & cardamom",
    price_cents: 3000,
    category_id: "cat-tea",
    unit_label: "200 ml",
    image_url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-t3",
    name: "Irani Zafrani Chai",
    subtitle: "Rich creamy saffron tea",
    price_cents: 4500,
    category_id: "cat-tea",
    unit_label: "200 ml",
    image_url: "https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-t4",
    name: "Sulaimani Lemon Mint",
    subtitle: "Black tea with lemon & mint",
    price_cents: 2500,
    category_id: "cat-tea",
    unit_label: "200 ml",
    image_url: "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=500&auto=format&fit=crop&q=80",
  },

  // Coffee
  {
    id: "demo-c1",
    name: "Madras Filter Coffee",
    subtitle: "Traditional decoction brew",
    price_cents: 3500,
    category_id: "cat-coffee",
    unit_label: "180 ml",
    image_url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-c2",
    name: "Hazelnut Iced Coffee",
    subtitle: "Chilled espresso with roasted hazelnut",
    price_cents: 9900,
    category_id: "cat-coffee",
    unit_label: "350 ml",
    image_url: "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-c3",
    name: "Dark Mocha Frappe",
    subtitle: "Blended Belgian chocolate espresso",
    price_cents: 11000,
    category_id: "cat-coffee",
    unit_label: "350 ml",
    image_url: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop&q=80",
  },

  // Snacks
  {
    id: "demo-s1",
    name: "Bun Maska Butter Jam",
    subtitle: "Toasted bun with fresh butter",
    price_cents: 4500,
    category_id: "cat-snacks",
    unit_label: "1 plate",
    image_url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-s2",
    name: "Crispy Osmania Biscuits",
    subtitle: "Sweet & salty tea biscuits",
    price_cents: 3000,
    category_id: "cat-snacks",
    unit_label: "4 pcs",
    image_url: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-s3",
    name: "Paneer Tikka Puff",
    subtitle: "Flaky pastry with spiced paneer",
    price_cents: 4000,
    category_id: "cat-snacks",
    unit_label: "1 pc",
    image_url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-s4",
    name: "Cheese Corn Samosa",
    subtitle: "Crispy crust with melted cheese",
    price_cents: 5000,
    category_id: "cat-snacks",
    unit_label: "2 pcs",
    image_url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=80",
  },

  // Coolers
  {
    id: "demo-k1",
    name: "Fresh Mint Lime Mojito",
    subtitle: "Sparkling soda with fresh lime",
    price_cents: 8900,
    category_id: "cat-coolers",
    unit_label: "350 ml",
    image_url: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-k2",
    name: "Alphonso Mango Shake",
    subtitle: "Mango pulp with vanilla ice cream",
    price_cents: 12000,
    category_id: "cat-coolers",
    unit_label: "350 ml",
    image_url: "https://images.unsplash.com/photo-1546173159-315724a31696?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-k3",
    name: "Belgian Chocolate Shake",
    subtitle: "Thick chocolate shake with chips",
    price_cents: 13000,
    category_id: "cat-coolers",
    unit_label: "350 ml",
    image_url: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop&q=80",
  },

  // Bakery
  {
    id: "demo-b1",
    name: "Warm Chocolate Brownie",
    subtitle: "Dark chocolate fudge slice",
    price_cents: 8000,
    category_id: "cat-bakery",
    unit_label: "1 slice",
    image_url: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-b2",
    name: "Blueberry Crumb Muffin",
    subtitle: "Fresh baked blueberry muffin",
    price_cents: 6500,
    category_id: "cat-bakery",
    unit_label: "1 pc",
    image_url: "https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=500&auto=format&fit=crop&q=80",
  },

  // Combos
  {
    id: "demo-x1",
    name: "Morning Fuel Combo",
    subtitle: "Filter Coffee + Bun Maska",
    price_cents: 7000,
    category_id: "cat-combos",
    unit_label: "Combo",
    image_url: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=500&auto=format&fit=crop&q=80",
  },
  {
    id: "demo-x2",
    name: "Evening High Tea Combo",
    subtitle: "2 Dum Chais + 2 Paneer Puffs",
    price_cents: 12000,
    category_id: "cat-combos",
    unit_label: "Serves 2",
    image_url: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&auto=format&fit=crop&q=80",
  },
];

export default function BillingPage() {
  const { toast } = useToast();
  const { business } = useTenant();

  // State
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Record<string, Stock>>({});
  const [activeCat, setActiveCat] = useState<string>("cat-all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "compact">("grid");

  // Cart & Order State
  const items = useCart(s => s.items);
  const increment = useCart(s => s.increment);
  const decrement = useCart(s => s.decrement);
  const removeItem = useCart(s => s.removeItem);
  const clear = useCart(s => s.clear);

  // Customer & Billing Configuration
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [paymentMode, setPaymentMode] = useState<"upi" | "cash" | "card">("upi");
  const [cashTendered, setCashTendered] = useState<string>("");
  const [applyGst, setApplyGst] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Modals & Receipts
  const [showQrModal, setShowQrModal] = useState(false);
  const [showMobileCartSheet, setShowMobileCartSheet] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [modalPhone, setModalPhone] = useState("");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceModalData, setInvoiceModalData] = useState<CompletedOrder | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch DB data or fallback to mock data
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        let catsQuery = supabaseClient.from("categories").select("*").order("name");
        if (business?.id) catsQuery = catsQuery.eq("business_id", business.id);

        let prodsQuery = supabaseClient.from("products").select("*").eq("active", true).order("name");
        if (business?.id) prodsQuery = prodsQuery.eq("business_id", business.id);

        let stkQuery = supabaseClient.from("product_stocks").select("product_id,max_qty,available_qty,notify_at_count");
        if (business?.id) stkQuery = stkQuery.eq("business_id", business.id);

        const [catsRes, prodsRes, stkRes] = await Promise.all([
          catsQuery,
          prodsQuery,
          stkQuery
        ]);

        if (!isMounted) return;

        const dbCats = catsRes.data || [];
        const dbProds = prodsRes.data || [];

        if (dbProds.length > 0) {
          const formattedCats: Category[] = [
            { id: "cat-all", name: "All Items", icon_emoji: "✨" },
            ...dbCats.map((c: any) => ({
              id: c.id,
              name: c.name,
              icon_url: c.icon_url,
              icon_emoji: "📦"
            }))
          ];
          setCategories(formattedCats);
          setProducts(dbProds);
        } else {
          setCategories(DUMMY_CATEGORIES);
          setProducts(DUMMY_PRODUCTS);
        }

        const map: Record<string, Stock> = {};
        (stkRes.data || []).forEach((s: any) => { map[s.product_id] = s; });

        DUMMY_PRODUCTS.forEach(p => {
          if (!map[p.id]) {
            map[p.id] = {
              product_id: p.id,
              max_qty: 100,
              available_qty: p.id === "demo-t4" ? 3 : 50,
              notify_at_count: 5
            };
          }
        });

        setStocks(map);
      } catch (e: any) {
        if (!isMounted) return;
        setCategories(DUMMY_CATEGORIES);
        setProducts(DUMMY_PRODUCTS);
      }
    })();

    return () => { isMounted = false; };
  }, [business?.id]);

  // Keyboard shortcut listener ('/' to search, 'Escape' to clear search)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
        setSearchQuery("");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Stock status helper
  function statusFor(pid: string) {
    const s = stocks[pid];
    if (!s) return { low: false, oos: false, available: 99 };
    const low = (s.notify_at_count ?? 0) > 0 && s.available_qty <= (s.notify_at_count as number) && s.available_qty > 0;
    const oos = s.available_qty <= 0;
    return { low, oos, s, available: Math.max(0, s.available_qty) };
  }

  // Filtered Products (by Category & Search)
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Category match
      if (activeCat !== "cat-all" && p.category_id !== activeCat) {
        return false;
      }
      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSub = p.subtitle?.toLowerCase().includes(q) || false;
        if (!matchesName && !matchesSub) return false;
      }
      return true;
    });
  }, [products, activeCat, searchQuery]);

  // Cart Calculations
  const cartList = useMemo(() => Object.values(items), [items]);
  const rawSubtotalCents = useMemo(() => totalCents(items), [items]);
  const cartCount = useMemo(() => cartList.reduce((sum, i) => sum + i.qty, 0), [cartList]);

  const taxCents = applyGst ? Math.round(rawSubtotalCents * 0.05) : 0;
  const finalTotalCents = rawSubtotalCents + taxCents;

  // Cash change calculator
  const cashNum = parseFloat(cashTendered || "0") * 100;
  const changeDueCents = Math.max(0, cashNum - finalTotalCents);

  // Format Bill Receipt Text
  function generateBillText(order: CompletedOrder): string {
    const itemsList = order.items
      .map(it => `• ${it.qty}x ${it.name} - ₹${((it.price_cents * it.qty) / 100).toFixed(2)}`)
      .join("\n");

    const businessTitle = (business?.name || "SeyalPro POS").toUpperCase();

    return `🧾 *${businessTitle}*
━━━━━━━━━━━━━━━━━━━━
📅 *Date:* ${order.date}
🏷️ *Invoice #:* ${order.orderId}
👤 *Customer:* ${order.customerName || "Guest"}
${order.tableNumber ? `🪑 *Table/Token:* #${order.tableNumber}\n` : ""}━━━━━━━━━━━━━━━━━━━━
*ITEMS ORDERED:*
${itemsList}
━━━━━━━━━━━━━━━━━━━━
💰 *Subtotal:* ₹${(order.subtotalCents / 100).toFixed(2)}
${order.taxCents > 0 ? `🏛️ *GST (5%):* ₹${(order.taxCents / 100).toFixed(2)}\n` : ""}💵 *Total Paid:* ₹${(order.totalCents / 100).toFixed(2)} (${order.paymentMode})
━━━━━━━━━━━━━━━━━━━━
✨ *Thank you for your visit! Have a great day!* ✨`;
  }

  // Quick Copy Bill to Clipboard
  async function copyBillToClipboard(order: CompletedOrder | null) {
    if (!order) return;
    const msg = generateBillText(order);
    try {
      await navigator.clipboard.writeText(msg);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast({ title: "Receipt Copied! 📋", description: "You can paste directly into WhatsApp", variant: "success" });
    } catch {
      toast({ title: "Copy failed", description: "Please manually copy text", variant: "error" });
    }
  }

  // Open Directly in WhatsApp Web
  function sendWhatsAppBill(order: CompletedOrder | null, targetPhone?: string) {
    if (!order) return;
    const rawPhone = targetPhone !== undefined ? targetPhone : (order.customerPhone || customerPhone || "");
    const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const msg = generateBillText(order);
    const encoded = encodeURIComponent(msg);

    // Copy to clipboard silently so the cashier can paste if needed
    try { navigator.clipboard.writeText(msg); } catch { }

    // Direct WhatsApp Web URL
    const webUrl = formattedPhone
      ? `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encoded}`
      : `https://web.whatsapp.com/send?text=${encoded}`;

    window.open(webUrl, "_blank");

    toast({
      title: "Opening WhatsApp Web 💬",
      description: formattedPhone ? `Opened chat for +${formattedPhone}` : "Receipt loaded into WhatsApp Web",
      variant: "info"
    });
  }

  // Submit and Complete Order Directly
  async function submitOrder() {
    if (cartList.length === 0) {
      toast({ title: "Cart is empty", description: "Add products before checkout", variant: "error" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();

      let orderRecordId = "ORD-" + Math.floor(100000 + Math.random() * 900000);

      if (user && business?.id) {
        const { data: order, error } = await supabaseClient.from("orders")
          .insert({
            user_id: user.id,
            total_cents: finalTotalCents,
            status: "completed",
            business_id: business.id
          })
          .select("*").single();

        if (!error && order?.id) {
          orderRecordId = order.id;
          const rows = cartList.map(i => ({
            order_id: order.id,
            product_id: i.product_id,
            qty: i.qty,
            price_cents: i.price_cents,
            business_id: business.id
          }));
          await supabaseClient.from("order_items").insert(rows);

          // Stock adjustment
          try {
            await fetch('/api/stock/adjust', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: rows })
            });
          } catch { }
        }
      }

      // Prepare completed receipt
      const receiptData: CompletedOrder = {
        orderId: orderRecordId.slice(0, 10).toUpperCase(),
        items: [...cartList],
        subtotalCents: rawSubtotalCents,
        taxCents,
        totalCents: finalTotalCents,
        paymentMode: paymentMode.toUpperCase(),
        customerName: customerName || "Walk-in Guest",
        customerPhone: customerPhone || "",
        tableNumber: tableNumber || "",
        date: new Date().toLocaleString()
      };

      setCompletedOrder(receiptData);
      setModalPhone(customerPhone || "");

      // Clear current cart & inputs
      clear();
      setCustomerName("");
      setCustomerPhone("");
      setTableNumber("");
      setCashTendered("");
      setShowMobileCartSheet(false);

      toast({ title: "Order Completed! 🎉", description: `Paid ₹${(finalTotalCents / 100).toFixed(2)} via ${paymentMode.toUpperCase()}`, variant: "success" });
    } catch (e: any) {
      toast({ title: "Checkout Error", description: e?.message || "Failed to process order", variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="-mx-3 sm:-mx-6 lg:-mx-8 -my-2 sm:-my-4 min-h-[calc(100vh-5rem)] bg-zinc-100 flex flex-col">
      {/* ======================================================== */}
      {/* 1. TOP RESPONSIVE POS HEADER BAR                         */}
      {/* ======================================================== */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-30 px-3 sm:px-6 py-2.5 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Terminal & Business Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-zinc-900 leading-tight truncate">
                  {business?.name || "SeyalPro POS Terminal"}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-zinc-500 hidden sm:block">
                Express Billing Counter • Currency: ₹ (INR)
              </p>
            </div>
          </div>

          {/* Center: Search bar */}
          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products by name... (Press '/' to focus)"
                className="w-full pl-9 pr-8 py-2 bg-zinc-50 hover:bg-zinc-100/80 focus:bg-white text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 rounded-xl border border-zinc-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-zinc-200 text-zinc-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* View Mode Toggle */}
            <div className="hidden lg:flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  viewMode === "grid" ? "bg-white text-emerald-700 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                )}
                title="Grid View"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("compact")}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  viewMode === "compact" ? "bg-white text-emerald-700 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                )}
                title="Compact List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Cart Trigger */}
            <button
              onClick={() => setShowMobileCartSheet(true)}
              className="lg:hidden relative flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-sm hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>₹{(finalTotalCents / 100).toFixed(2)}</span>
              {cartCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-white text-emerald-700 text-[11px] font-black flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Search Input */}
        <div className="mt-2.5 md:hidden">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-8 py-2 bg-zinc-50 text-xs text-zinc-900 placeholder:text-zinc-400 rounded-xl border border-zinc-200 focus:border-emerald-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. MAIN FULL-WIDTH TWO-COLUMN POS WORKSPACE              */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
        {/* ========================================== */}
        {/* LEFT COLUMN: Catalog & Categories         */}
        {/* ========================================== */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 flex flex-col gap-3.5">
          {/* Categories Horizontal Carousel */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 pt-0.5">
            {categories.map(cat => {
              const active = activeCat === cat.id;
              const count = cat.id === "cat-all"
                ? products.length
                : products.filter(p => p.category_id === cat.id).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0 cursor-pointer",
                    active
                      ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300 ring-offset-1 font-bold scale-[1.02]"
                      : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-300"
                  )}
                >
                  <span className="text-base leading-none">{cat.icon_emoji || "☕"}</span>
                  <span>{cat.name}</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-md text-[10px] font-bold",
                      active ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-500"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ========================================== */}
          {/* PRODUCT CARDS GRID                        */}
          {/* ========================================== */}
          {filteredProducts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-zinc-200 text-center">
              <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-zinc-900">No products found</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                Try searching with another keyword or select &quot;All Items&quot; from the categories list.
              </p>
              <button
                onClick={() => { setActiveCat("cat-all"); setSearchQuery(""); }}
                className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
              {filteredProducts.map(p => {
                const st = statusFor(p.id);
                const qInCart = (items[p.id]?.qty || 0);

                return (
                  <div
                    key={p.id}
                    className={cn(
                      "group bg-white rounded-2xl border transition-all duration-200 flex flex-col overflow-hidden relative",
                      qInCart > 0
                        ? "border-emerald-500 ring-2 ring-emerald-100 shadow-md"
                        : "border-zinc-200/90 hover:border-emerald-300 hover:shadow-md"
                    )}
                  >
                    {/* Top Image area */}
                    <div className="relative aspect-4/3 bg-zinc-100 overflow-hidden">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-emerald-50/50 text-emerald-700">
                          <Coffee className="w-8 h-8 opacity-40 mb-1" />
                          <span className="text-[11px] font-semibold">{p.name.slice(0, 14)}</span>
                        </div>
                      )}

                      {/* Stock Indicators */}
                      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                        {st.oos ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-md bg-zinc-900/90 text-white shadow-xs">
                            Sold Out
                          </span>
                        ) : st.low ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-amber-500 text-white shadow-xs">
                            Low: {st.available}
                          </span>
                        ) : null}

                        {qInCart > 0 && (
                          <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black shadow-md flex items-center justify-center ring-2 ring-white animate-pop">
                            {qInCart}
                          </span>
                        )}
                      </div>

                      {p.unit_label && (
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-medium">
                          {p.unit_label}
                        </span>
                      )}
                    </div>

                    {/* Product Details */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-zinc-900 leading-snug line-clamp-2">
                          {p.name}
                        </h3>
                        {p.subtitle && (
                          <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                            {p.subtitle}
                          </p>
                        )}
                      </div>

                      <div className="pt-1 border-t border-zinc-100 flex items-center justify-between">
                        <div>
                          <span className="text-sm sm:text-base font-black text-zinc-900">
                            ₹{(p.price_cents / 100).toFixed(2)}
                          </span>
                        </div>

                        {/* Interactive Add / Stepper Button */}
                        <div>
                          {st.oos ? (
                            <button
                              disabled
                              className="px-3 py-1.5 bg-zinc-100 text-zinc-400 rounded-xl text-xs font-bold cursor-not-allowed"
                            >
                              Unavailable
                            </button>
                          ) : qInCart === 0 ? (
                            <button
                              onClick={() => increment({
                                product_id: p.id,
                                name: p.name,
                                price_cents: p.price_cents,
                                qty: 1,
                                image_url: p.image_url,
                                unit_label: p.unit_label
                              })}
                              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition-all duration-200 flex items-center gap-1 active:scale-90 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> ADD
                            </button>
                          ) : (
                            <div className="flex items-center bg-emerald-600 text-white rounded-xl p-0.5 shadow-sm">
                              <button
                                onClick={() => decrement(p.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center text-xs font-black">
                                {qInCart}
                              </span>
                              <button
                                onClick={() => increment({
                                  product_id: p.id,
                                  name: p.name,
                                  price_cents: p.price_cents,
                                  qty: 1,
                                  image_url: p.image_url,
                                  unit_label: p.unit_label
                                })}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Compact List View */
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
              {filteredProducts.map(p => {
                const st = statusFor(p.id);
                const qInCart = (items[p.id]?.qty || 0);

                return (
                  <div key={p.id} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-zinc-100 overflow-hidden shrink-0">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-300">
                            <Coffee className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-zinc-900 truncate">{p.name}</h4>
                          {p.unit_label && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                              {p.unit_label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 truncate">{p.subtitle || "Standard variant"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-black text-zinc-900">₹{(p.price_cents / 100).toFixed(2)}</p>
                      </div>

                      {st.oos ? (
                        <span className="text-xs font-bold text-zinc-400 px-2 py-1 bg-zinc-100 rounded-lg">Out of stock</span>
                      ) : qInCart === 0 ? (
                        <button
                          onClick={() => increment({
                            product_id: p.id,
                            name: p.name,
                            price_cents: p.price_cents,
                            qty: 1,
                            image_url: p.image_url,
                            unit_label: p.unit_label
                          })}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-xs font-bold transition-all cursor-pointer"
                        >
                          + ADD
                        </button>
                      ) : (
                        <div className="flex items-center bg-emerald-600 text-white rounded-xl p-0.5">
                          <button onClick={() => decrement(p.id)} className="w-6 h-6 flex items-center justify-center hover:bg-emerald-700 rounded-lg cursor-pointer">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-black">{qInCart}</span>
                          <button onClick={() => increment({
                            product_id: p.id,
                            name: p.name,
                            price_cents: p.price_cents,
                            qty: 1,
                            image_url: p.image_url,
                            unit_label: p.unit_label
                          })} className="w-6 h-6 flex items-center justify-center hover:bg-emerald-700 rounded-lg cursor-pointer">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: DESKTOP CHECKOUT & BILLING TERMINAL PANEL  */}
        {/* ======================================================== */}
        <aside className="hidden lg:flex w-[380px] xl:w-[420px] 2xl:w-[460px] bg-white border-l border-zinc-200 flex-col shrink-0 shadow-lg">
          {/* Terminal Header */}
          <div className="p-4 border-b border-zinc-200 bg-zinc-50/70 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-zinc-900">Current Order</h2>
              </div>
              <div className="flex items-center gap-1.5">
                {cartCount > 0 && (
                  <button
                    onClick={clear}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    title="Clear All Items"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                  {cartCount} {cartCount === 1 ? "item" : "items"}
                </span>
              </div>
            </div>

            {/* Quick Customer & Table Selectors */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Hash className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Token / Table #"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs bg-white rounded-lg border border-zinc-200 focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-zinc-200 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Customer WhatsApp / Phone Field */}
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                placeholder="WhatsApp Number (to send bill)"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-white rounded-lg border border-zinc-200 focus:border-emerald-500 outline-none font-medium"
              />
            </div>
          </div>

          {/* Cart Items Scrollable List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[calc(100vh-25rem)]">
            {cartList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-300 mb-3">
                  <ShoppingBag className="w-8 h-8 stroke-1" />
                </div>
                <h4 className="text-sm font-bold text-zinc-700">Receipt is empty</h4>
                <p className="text-xs text-zinc-400 mt-1 max-w-[200px]">
                  Click on any item in the catalog to add to bill
                </p>
              </div>
            ) : (
              cartList.map(item => (
                <div
                  key={item.product_id}
                  className="group flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100 hover:border-zinc-200 transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-zinc-200 overflow-hidden shrink-0">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-400">
                          {item.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-900 truncate">{item.name}</h4>
                      <p className="text-[11px] text-zinc-500">
                        ₹{(item.price_cents / 100).toFixed(2)} each
                      </p>
                    </div>
                  </div>

                  {/* Stepper & Line Total */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center bg-white border border-zinc-200 rounded-lg p-0.5">
                      <button
                        onClick={() => decrement(item.product_id)}
                        className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 rounded cursor-pointer"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-zinc-900">{item.qty}</span>
                      <button
                        onClick={() => increment(item)}
                        className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 rounded cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    <div className="text-right min-w-[55px]">
                      <span className="text-xs font-black text-zinc-900">
                        ₹{((item.price_cents * item.qty) / 100).toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => removeItem(item.product_id)}
                      className="text-zinc-300 hover:text-rose-500 p-1 transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Terminal Bottom Controls & Payment */}
          <div className="p-4 border-t border-zinc-200 bg-zinc-50/50 space-y-3">
            {/* Payment Method Selector */}
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold mb-1.5">
                <span>Payment Mode</span>
                {paymentMode === "upi" && (
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="text-emerald-600 font-bold text-[11px] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <QrCode className="w-3 h-3" /> Show QR
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                <button
                  onClick={() => setPaymentMode("upi")}
                  className={cn(
                    "py-2 rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    paymentMode === "upi"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                  )}
                >
                  <QrCode className="w-3.5 h-3.5" /> UPI / QR
                </button>
                <button
                  onClick={() => setPaymentMode("cash")}
                  className={cn(
                    "py-2 rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    paymentMode === "cash"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                  )}
                >
                  <Banknote className="w-3.5 h-3.5" /> Cash
                </button>
                <button
                  onClick={() => setPaymentMode("card")}
                  className={cn(
                    "py-2 rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    paymentMode === "card"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                  )}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Card
                </button>
              </div>

              {/* Cash Tendered Helper Input */}
              {paymentMode === "cash" && (
                <div className="mt-2 p-2 bg-white rounded-xl border border-zinc-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 font-medium">Cash Tendered:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-zinc-400">₹</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={cashTendered}
                        onChange={e => setCashTendered(e.target.value)}
                        className="w-24 text-right font-bold text-zinc-900 border-b border-zinc-300 focus:border-emerald-500 outline-none text-xs"
                      />
                    </div>
                  </div>
                  {cashNum > finalTotalCents && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed border-zinc-200 font-bold text-emerald-700">
                      <span>Change Due:</span>
                      <span>₹{(changeDueCents / 100).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bill Summary Breakdown */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-500">
                <span>Subtotal ({cartCount} items)</span>
                <span className="font-medium text-zinc-900">₹{(rawSubtotalCents / 100).toFixed(2)}</span>
              </div>
              {taxCents > 0 && (
                <div className="flex justify-between text-zinc-500">
                  <span>GST (5%)</span>
                  <span>₹{(taxCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-zinc-200 flex justify-between items-baseline">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Payable</p>
                  <p className="text-2xl font-black text-emerald-700">
                    ₹{(finalTotalCents / 100).toFixed(2)}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-zinc-400">Net Bill</span>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-1">
              <button
                disabled={cartList.length === 0 || isSubmitting}
                onClick={submitOrder}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Complete Payment &amp; Print • ₹{(finalTotalCents / 100).toFixed(2)}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ======================================================== */}
      {/* 3. MOBILE BOTTOM FLOATING CART BAR                       */}
      {/* ======================================================== */}
      <div className="lg:hidden fixed bottom-3 left-3 right-3 z-40">
        <div
          onClick={() => setShowMobileCartSheet(true)}
          className="bg-zinc-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between ring-1 ring-white/10 active:scale-[0.99] transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingBag className="w-6 h-6 text-emerald-400" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                {cartCount} {cartCount === 1 ? "Item" : "Items"} in Cart
              </p>
              <p className="text-base font-black text-white leading-tight">
                ₹{(finalTotalCents / 100).toFixed(2)}
              </p>
            </div>
          </div>

          <button className="px-4 py-2 bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm">
            <span>View &amp; Pay</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. MOBILE SLIDE-UP CHECKOUT DRAWER                       */}
      {/* ======================================================== */}
      {showMobileCartSheet && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Drawer Handle & Header */}
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-zinc-900">Current Order ({cartCount} items)</h3>
              </div>
              <button
                onClick={() => setShowMobileCartSheet(false)}
                className="p-1.5 rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Customer Fields */}
            <div className="p-3 bg-zinc-50 border-b border-zinc-200 grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Token / Table #"
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white rounded-lg border border-zinc-200 focus:border-emerald-500 outline-none"
              />
              <input
                type="tel"
                placeholder="Customer WhatsApp"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white rounded-lg border border-zinc-200 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Mobile Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[40vh]">
              {cartList.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <p className="text-sm font-bold text-zinc-600">Your cart is empty</p>
                  <p className="text-xs text-zinc-400 mt-1">Tap items in the menu to add to bill</p>
                </div>
              ) : (
                cartList.map(item => (
                  <div key={item.product_id} className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-zinc-900 truncate">{item.name}</h4>
                      <p className="text-[11px] text-zinc-500">₹{(item.price_cents / 100).toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-white border border-zinc-200 rounded-lg p-0.5">
                        <button onClick={() => decrement(item.product_id)} className="w-6 h-6 flex items-center justify-center cursor-pointer">
                          <Minus className="w-3 h-3 text-zinc-600" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
                        <button onClick={() => increment(item)} className="w-6 h-6 flex items-center justify-center cursor-pointer">
                          <Plus className="w-3 h-3 text-zinc-600" />
                        </button>
                      </div>
                      <span className="text-xs font-black text-zinc-900 min-w-[50px] text-right">
                        ₹{((item.price_cents * item.qty) / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Mobile Summary & Action */}
            <div className="p-4 border-t border-zinc-200 bg-zinc-50 space-y-3">
              {/* Payment selector */}
              <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                <button
                  onClick={() => setPaymentMode("upi")}
                  className={cn("py-2 rounded-xl border flex items-center justify-center gap-1 cursor-pointer", paymentMode === "upi" ? "bg-emerald-600 text-white" : "bg-white text-zinc-700")}
                >
                  <QrCode className="w-3.5 h-3.5" /> UPI
                </button>
                <button
                  onClick={() => setPaymentMode("cash")}
                  className={cn("py-2 rounded-xl border flex items-center justify-center gap-1 cursor-pointer", paymentMode === "cash" ? "bg-emerald-600 text-white" : "bg-white text-zinc-700")}
                >
                  <Banknote className="w-3.5 h-3.5" /> Cash
                </button>
                <button
                  onClick={() => setPaymentMode("card")}
                  className={cn("py-2 rounded-xl border flex items-center justify-center gap-1 cursor-pointer", paymentMode === "card" ? "bg-emerald-600 text-white" : "bg-white text-zinc-700")}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Card
                </button>
              </div>

              <div className="flex justify-between items-center text-sm font-bold text-zinc-900 pt-1">
                <span>Total Amount</span>
                <span className="text-xl font-black text-emerald-700">₹{(finalTotalCents / 100).toFixed(2)}</span>
              </div>

              <button
                disabled={cartList.length === 0 || isSubmitting}
                onClick={submitOrder}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  `Complete Payment & Print Slip`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. INSTANT UPI QR CODE MODAL                             */}
      {/* ======================================================== */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-zinc-200 p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-zinc-900">Scan &amp; Pay UPI</h3>
              </div>
              <button onClick={() => setShowQrModal(false)} className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 inline-block mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=bftone.pos@upi%26pn=SeyalPro%26am=${(finalTotalCents / 100).toFixed(2)}%26cu=INR`}
                alt="UPI QR Code"
                className="w-44 h-44 rounded-lg mix-blend-multiply mx-auto"
              />
            </div>

            <p className="text-base font-black text-zinc-900">₹{(finalTotalCents / 100).toFixed(2)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Scan via GooglePay, PhonePe, Paytm, or BHIM</p>

            <button
              onClick={() => setShowQrModal(false)}
              className="mt-5 w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer"
            >
              Done Scanning
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. ORDER SUCCESS RECEIPT & WHATSAPP WEB MODAL            */}
      {/* ======================================================== */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-zinc-200">
            {/* Green Header */}
            <div className="bg-emerald-600 p-6 text-white text-center relative">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center mx-auto mb-2 text-white">
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-black">Payment Successful!</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Invoice #{completedOrder.orderId} • {completedOrder.date}
              </p>
            </div>

            {/* Receipt Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="flex justify-between items-center pb-3 border-b border-zinc-100 text-zinc-500 font-medium">
                <span>Customer: <strong className="text-zinc-900">{completedOrder.customerName}</strong></span>
                <span>Mode: <strong className="text-emerald-700 font-bold">{completedOrder.paymentMode}</strong></span>
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {completedOrder.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-zinc-700">
                    <span className="truncate max-w-[220px]">{it.qty}x {it.name}</span>
                    <span className="font-bold text-zinc-900">₹{((it.price_cents * it.qty) / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-dashed border-zinc-200 space-y-1 text-zinc-500">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{(completedOrder.subtotalCents / 100).toFixed(2)}</span>
                </div>
                {completedOrder.taxCents > 0 && (
                  <div className="flex justify-between">
                    <span>GST (5%)</span>
                    <span>₹{(completedOrder.taxCents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-zinc-200 text-sm font-black text-zinc-900">
                  <span>Total Paid</span>
                  <span className="text-lg text-emerald-700">₹{(completedOrder.totalCents / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* ======================================================== */}
              {/* WhatsApp Web Direct Card                                */}
              {/* ======================================================== */}
              <div className="p-3 bg-emerald-50/90 rounded-2xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp Bill
                  </span>
                  <button
                    onClick={() => copyBillToClipboard(completedOrder)}
                    className="text-[10px] text-emerald-800 hover:text-emerald-950 font-bold px-2 py-0.5 rounded-md bg-emerald-200/60 hover:bg-emerald-200 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Copy receipt text to clipboard"
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopied ? "Copied" : "Copy Text"}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      value={modalPhone}
                      onChange={e => setModalPhone(e.target.value)}
                      className="w-full pl-8 pr-2 py-2 text-xs bg-white rounded-xl border border-emerald-200 focus:border-emerald-600 outline-none font-semibold text-zinc-900"
                    />
                  </div>
                  <button
                    onClick={() => sendWhatsAppBill(completedOrder, modalPhone)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
                  >
                    <span>Open WhatsApp</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Action Buttons: PDF Download, Print Slip, New Sale */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!completedOrder) return;
                      setInvoiceModalData(completedOrder);
                      setShowInvoiceModal(true);
                    }}
                    className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs text-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" /> Download PDF
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-zinc-700" /> Print Slip
                  </button>
                </div>

                <button
                  onClick={() => setCompletedOrder(null)}
                  className="w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer text-xs"
                >
                  <span>Start New Sale</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. CUSTOMER DETAILS & INVOICE OPTIONS MODAL              */}
      {/* ======================================================== */}
      <InvoiceDetailsModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        orderData={invoiceModalData}
      />

      {/* ======================================================== */}
      {/* 8. DEDICATED THERMAL & DESKTOP PRINTABLE RECEIPT SLIP   */}
      {/* ======================================================== */}
      {completedOrder && (
        <div id="printable-receipt-wrapper" className="hidden print:block">
          <div id="printable-receipt" className="text-black bg-white">
            <div className="text-center pb-2 border-b border-dashed border-black">
              {/* Store Logo */}
              {(business?.logo_url || "/dummy-logo.svg") && (
                <div className="flex justify-center mb-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={business?.logo_url || "/dummy-logo.svg"}
                    alt="Store Logo"
                    className="h-10 w-auto max-w-[120px] object-contain mx-auto filter grayscale contrast-125"
                  />
                </div>
              )}
              <h2 className="text-sm font-bold tracking-tight uppercase leading-tight">
                {business?.name || "Brown fening tea"}
              </h2>
              <p className="text-[10px] text-zinc-600 mt-0.5 font-medium">
                TAX INVOICE / BILL RECEIPT
              </p>
            </div>

            {/* Metadata */}
            <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>Invoice #: <strong>{completedOrder.orderId}</strong></span>
                <span>{completedOrder.date}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer: {completedOrder.customerName || "Walk-in Guest"}</span>
                {completedOrder.tableNumber && (
                  <span>Table/Token: <strong>#{completedOrder.tableNumber}</strong></span>
                )}
              </div>
              {completedOrder.customerPhone && (
                <div>Phone: {completedOrder.customerPhone}</div>
              )}
            </div>

            {/* Itemized Table */}
            <div className="py-2 border-b border-dashed border-black">
              <table className="w-full text-left text-[10px]">
                <thead>
                  <tr className="border-b border-black font-bold">
                    <th className="py-1">Item</th>
                    <th className="py-1 text-center">Qty</th>
                    <th className="py-1 text-right">Rate</th>
                    <th className="py-1 text-right">Amt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dotted divide-zinc-300">
                  {completedOrder.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-1 pr-1 font-medium leading-tight">{it.name}</td>
                      <td className="py-1 text-center font-bold">{it.qty}</td>
                      <td className="py-1 text-right">₹{(it.price_cents / 100).toFixed(2)}</td>
                      <td className="py-1 text-right font-bold">₹{((it.price_cents * it.qty) / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Calculation */}
            <div className="py-2 border-b border-dashed border-black text-[10px] space-y-1">
              <div className="flex justify-between">
                <span>Subtotal ({completedOrder.items.reduce((s, i) => s + i.qty, 0)} items)</span>
                <span>₹{(completedOrder.subtotalCents / 100).toFixed(2)}</span>
              </div>
              {completedOrder.taxCents > 0 && (
                <div className="flex justify-between">
                  <span>GST (5%)</span>
                  <span>₹{(completedOrder.taxCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-1 border-t border-black text-xs font-black">
                <span>NET TOTAL</span>
                <span className="text-sm font-black">₹{(completedOrder.totalCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] pt-0.5 text-zinc-700">
                <span>Payment Mode:</span>
                <span className="font-bold uppercase">{completedOrder.paymentMode}</span>
              </div>
            </div>

            {/* Token & Footer Message */}
            <div className="pt-2 text-center text-[9px] text-zinc-700 space-y-1">
              {completedOrder.tableNumber && (
                <div className="py-1 px-3 border border-black inline-block rounded font-bold text-xs my-1">
                  TOKEN #{completedOrder.tableNumber}
                </div>
              )}
              <p className="font-semibold">Thank you for your visit!</p>
              <p>Please visit again.</p>
            </div>
          </div>
        </div>
      )}

      {/* Strict 1-Page Global Print CSS for 58mm / 80mm POS Thermal & Desktop Printers */}
      <style jsx global>{`
        @media print {
          html, body {
            height: auto !important;
            min-height: 0 !important;
            max-height: 100% !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          /* Hide normal UI */
          body > * {
            visibility: hidden !important;
          }
          /* Only display the printable wrapper */
          #printable-receipt-wrapper,
          #printable-receipt-wrapper *,
          #printable-receipt,
          #printable-receipt * {
            visibility: visible !important;
          }
          #printable-receipt-wrapper {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          #printable-receipt {
            position: relative !important;
            display: block !important;
            width: 100% !important;
            max-width: 78mm !important;
            margin: 0 auto !important;
            padding: 4px 8px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-sizing: border-box !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          @page {
            margin: 0;
            size: auto;
          }
        }
      `}</style>
    </div>
  );
}
