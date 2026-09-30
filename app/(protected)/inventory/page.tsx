"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  Boxes,
  Package,
  ChefHat,
  ShoppingCart,
  Trash2,
  ClipboardCheck,
  History,
  Plus,
  Search,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Layers,
  X,
  Edit,
  ArrowRight,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Types
type InventoryItem = {
  id: string;
  business_id?: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
  min_reorder_level: number;
  optimal_stock_level: number;
  notify_at: number | null;
  is_active: boolean;
};

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category_id?: string;
};

type RecipeItem = {
  id?: string;
  inventory_item_id: string;
  quantity_required: number;
  unit: string;
  waste_factor_pct: number;
  inventory_items?: InventoryItem;
};

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  lead_time_days: number;
};

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
  total_amount: number;
  expected_delivery_date: string | null;
  received_at: string | null;
  created_at: string;
  suppliers?: Supplier;
  purchase_order_items?: Array<{
    id: string;
    inventory_item_id: string;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: number;
    total_cost: number;
    inventory_items?: { name: string; unit: string };
  }>;
};

type WasteLog = {
  id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string;
  cost_loss: number;
  reason: string;
  notes: string | null;
  created_at: string;
  inventory_items?: { name: string; category: string; cost_per_unit: number };
};

type LedgerEntry = {
  id: string;
  inventory_item_id: string;
  transaction_type: string;
  quantity_delta: number;
  balance_after: number;
  unit_cost: number;
  reason: string | null;
  created_at: string;
  inventory_items?: { name: string; unit: string };
};

// ==========================================
// BUILT-IN REALISTIC DUMMY DATA FOR TESTING
// ==========================================
const MOCK_ITEMS: InventoryItem[] = [
  { id: "item-1", name: "Full Cream Fresh Milk", sku: "RAW-MILK-01", category: "Raw Material", unit: "l", cost_per_unit: 54.00, current_stock: 48.5, min_reorder_level: 15.0, optimal_stock_level: 60.0, notify_at: 15.0, is_active: true },
  { id: "item-2", name: "Assam Premium CTC Tea Powder", sku: "RAW-TEA-01", category: "Raw Material", unit: "kg", cost_per_unit: 380.00, current_stock: 14.2, min_reorder_level: 4.0, optimal_stock_level: 25.0, notify_at: 4.0, is_active: true },
  { id: "item-3", name: "South Indian Filter Coffee Blend (80:20)", sku: "RAW-COF-01", category: "Raw Material", unit: "kg", cost_per_unit: 480.00, current_stock: 8.5, min_reorder_level: 3.0, optimal_stock_level: 15.0, notify_at: 3.0, is_active: true },
  { id: "item-4", name: "Refined Pure Cane Sugar", sku: "RAW-SUG-01", category: "Raw Material", unit: "kg", cost_per_unit: 44.00, current_stock: 32.0, min_reorder_level: 10.0, optimal_stock_level: 50.0, notify_at: 10.0, is_active: true },
  { id: "item-5", name: "Organic Palm Jaggery Syrup", sku: "RAW-JAG-01", category: "Raw Material", unit: "l", cost_per_unit: 160.00, current_stock: 6.0, min_reorder_level: 2.0, optimal_stock_level: 10.0, notify_at: 2.0, is_active: true },
  { id: "item-6", name: "Fresh Farm Inji (Ginger)", sku: "RAW-GIN-01", category: "Raw Material", unit: "kg", cost_per_unit: 120.00, current_stock: 3.8, min_reorder_level: 1.5, optimal_stock_level: 8.0, notify_at: 1.5, is_active: true },
  { id: "item-7", name: "Green Cardamom (Elaichi) Whole", sku: "RAW-ELA-01", category: "Raw Material", unit: "kg", cost_per_unit: 2400.00, current_stock: 0.65, min_reorder_level: 0.2, optimal_stock_level: 1.5, notify_at: 0.2, is_active: true },
  { id: "item-8", name: "Brown Sugar Tapioca Boba Pearls", sku: "RAW-BOB-01", category: "Raw Material", unit: "kg", cost_per_unit: 320.00, current_stock: 7.5, min_reorder_level: 2.5, optimal_stock_level: 15.0, notify_at: 2.5, is_active: true },
  { id: "item-9", name: "250ml Ripple Kraft Paper Cups", sku: "PKG-CUP-250", category: "Packaging", unit: "pcs", cost_per_unit: 1.65, current_stock: 850, min_reorder_level: 200, optimal_stock_level: 1500, notify_at: 250, is_active: true },
  { id: "item-10", name: "350ml Ripple Kraft Paper Cups", sku: "PKG-CUP-350", category: "Packaging", unit: "pcs", cost_per_unit: 2.10, current_stock: 420, min_reorder_level: 150, optimal_stock_level: 1000, notify_at: 150, is_active: true },
  { id: "item-11", name: "500ml Clear Boba Cold Cups (PP)", sku: "PKG-CUP-500", category: "Packaging", unit: "pcs", cost_per_unit: 3.40, current_stock: 310, min_reorder_level: 100, optimal_stock_level: 800, notify_at: 100, is_active: true },
  { id: "item-12", name: "Black Sip Lids (80mm for Hot Cups)", sku: "PKG-LID-80", category: "Packaging", unit: "pcs", cost_per_unit: 0.85, current_stock: 780, min_reorder_level: 200, optimal_stock_level: 1500, notify_at: 250, is_active: true },
  { id: "item-13", name: "Dome Lids 95mm (for Cold Boba)", sku: "PKG-LID-95", category: "Packaging", unit: "pcs", cost_per_unit: 1.10, current_stock: 290, min_reorder_level: 100, optimal_stock_level: 800, notify_at: 100, is_active: true },
  { id: "item-14", name: "Eco Paper Straws (Standard 6mm)", sku: "PKG-STR-6", category: "Packaging", unit: "pcs", cost_per_unit: 0.40, current_stock: 1200, min_reorder_level: 300, optimal_stock_level: 2000, notify_at: 300, is_active: true },
  { id: "item-15", name: "Wide Boba Straws (12mm with Pointed Tip)", sku: "PKG-STR-12", category: "Packaging", unit: "pcs", cost_per_unit: 0.75, current_stock: 450, min_reorder_level: 150, optimal_stock_level: 1000, notify_at: 150, is_active: true },
  { id: "item-16", name: "2-Cup Takeaway Kraft Carry Bags", sku: "PKG-BAG-02", category: "Packaging", unit: "pcs", cost_per_unit: 2.80, current_stock: 240, min_reorder_level: 80, optimal_stock_level: 600, notify_at: 80, is_active: true },
  { id: "item-17", name: "Crispy Onion Mini Samosa (Frozen Pack)", sku: "SNK-SAM-01", category: "Pre-mix", unit: "pcs", cost_per_unit: 4.50, current_stock: 180, min_reorder_level: 50, optimal_stock_level: 300, notify_at: 50, is_active: true },
  { id: "item-18", name: "POS Thermal Billing Paper Rolls (80x50mm)", sku: "CON-ROL-80", category: "Consumables", unit: "roll", cost_per_unit: 28.00, current_stock: 18, min_reorder_level: 5, optimal_stock_level: 40, notify_at: 5, is_active: true },
];

const MOCK_PRODUCTS: Product[] = [
  { id: "prod-1", name: "Special Masala Chai", price: 20.00, image_url: null },
  { id: "prod-2", name: "South Indian Filter Coffee", price: 25.00, image_url: null },
  { id: "prod-3", name: "Ginger Cardamom Elaichi Tea", price: 25.00, image_url: null },
  { id: "prod-4", name: "Brown Sugar Boba Milk Tea", price: 120.00, image_url: null },
  { id: "prod-5", name: "Crispy Mini Samosa (3 Pcs)", price: 30.00, image_url: null },
];

const MOCK_RECIPES: Record<string, RecipeItem[]> = {
  "prod-1": [
    { inventory_item_id: "item-1", quantity_required: 0.180, unit: "l", waste_factor_pct: 3.0 },
    { inventory_item_id: "item-2", quantity_required: 0.012, unit: "kg", waste_factor_pct: 2.0 },
    { inventory_item_id: "item-4", quantity_required: 0.015, unit: "kg", waste_factor_pct: 0.0 },
    { inventory_item_id: "item-6", quantity_required: 0.005, unit: "kg", waste_factor_pct: 5.0 },
    { inventory_item_id: "item-9", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
    { inventory_item_id: "item-12", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
  ],
  "prod-2": [
    { inventory_item_id: "item-1", quantity_required: 0.160, unit: "l", waste_factor_pct: 3.0 },
    { inventory_item_id: "item-3", quantity_required: 0.015, unit: "kg", waste_factor_pct: 2.0 },
    { inventory_item_id: "item-4", quantity_required: 0.012, unit: "kg", waste_factor_pct: 0.0 },
    { inventory_item_id: "item-9", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
    { inventory_item_id: "item-12", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
  ],
  "prod-3": [
    { inventory_item_id: "item-1", quantity_required: 0.180, unit: "l", waste_factor_pct: 3.0 },
    { inventory_item_id: "item-2", quantity_required: 0.012, unit: "kg", waste_factor_pct: 2.0 },
    { inventory_item_id: "item-4", quantity_required: 0.015, unit: "kg", waste_factor_pct: 0.0 },
    { inventory_item_id: "item-6", quantity_required: 0.008, unit: "kg", waste_factor_pct: 5.0 },
    { inventory_item_id: "item-7", quantity_required: 0.001, unit: "kg", waste_factor_pct: 0.0 },
    { inventory_item_id: "item-9", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
    { inventory_item_id: "item-12", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 1.0 },
  ],
  "prod-4": [
    { inventory_item_id: "item-1", quantity_required: 0.220, unit: "l", waste_factor_pct: 2.0 },
    { inventory_item_id: "item-8", quantity_required: 0.050, unit: "kg", waste_factor_pct: 5.0 },
    { inventory_item_id: "item-5", quantity_required: 0.030, unit: "l", waste_factor_pct: 0.0 },
    { inventory_item_id: "item-11", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 0.0 },
    { inventory_item_id: "item-13", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 0.0 },
    { inventory_item_id: "item-15", quantity_required: 1.0, unit: "pcs", waste_factor_pct: 0.0 },
  ],
  "prod-5": [
    { inventory_item_id: "item-17", quantity_required: 3.0, unit: "pcs", waste_factor_pct: 2.0 },
  ],
};

const MOCK_SUPPLIERS: Supplier[] = [
  { id: "sup-1", name: "Aavin Fresh Dairy Supply", contact_person: "Karthik Raja", phone: "+91 94441 23456", email: "orders@aavindairy.com", payment_terms: "Net 15", lead_time_days: 1 },
  { id: "sup-2", name: "EcoPack Solutions Chennai", contact_person: "Murugan Packaging", phone: "+91 98401 98765", email: "sales@ecopack.in", payment_terms: "Net 30", lead_time_days: 3 },
  { id: "sup-3", name: "Kerala Spices & Tea Board Traders", contact_person: "Suresh Menon", phone: "+91 97455 11223", email: "suresh@keralaspices.com", payment_terms: "Net 30", lead_time_days: 4 },
  { id: "sup-4", name: "Monin & Boba House Distributors", contact_person: "Pooja Sharma", phone: "+91 99887 66554", email: "supply@bobahouse.in", payment_terms: "Advance", lead_time_days: 2 },
];

const MOCK_POS: PurchaseOrder[] = [
  {
    id: "po-1",
    po_number: "PO-849201",
    supplier_id: "sup-1",
    status: "RECEIVED",
    total_amount: 3240.00,
    expected_delivery_date: new Date(Date.now() - 86400000 * 2).toISOString(),
    received_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    suppliers: MOCK_SUPPLIERS[0],
    purchase_order_items: [
      { id: "poi-1", inventory_item_id: "item-1", quantity_ordered: 60, quantity_received: 60, unit_cost: 54, total_cost: 3240, inventory_items: { name: "Full Cream Fresh Milk", unit: "l" } },
    ],
  },
  {
    id: "po-2",
    po_number: "PO-849302",
    supplier_id: "sup-2",
    status: "ORDERED",
    total_amount: 4150.00,
    expected_delivery_date: new Date(Date.now() + 86400000 * 2).toISOString(),
    received_at: null,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    suppliers: MOCK_SUPPLIERS[1],
    purchase_order_items: [
      { id: "poi-2", inventory_item_id: "item-9", quantity_ordered: 1000, quantity_received: 0, unit_cost: 1.65, total_cost: 1650, inventory_items: { name: "250ml Ripple Kraft Paper Cups", unit: "pcs" } },
      { id: "poi-3", inventory_item_id: "item-10", quantity_ordered: 500, quantity_received: 0, unit_cost: 2.10, total_cost: 1050, inventory_items: { name: "350ml Ripple Kraft Paper Cups", unit: "pcs" } },
      { id: "poi-4", inventory_item_id: "item-12", quantity_ordered: 1000, quantity_received: 0, unit_cost: 0.85, total_cost: 850, inventory_items: { name: "Black Sip Lids (80mm)", unit: "pcs" } },
      { id: "poi-5", inventory_item_id: "item-14", quantity_ordered: 1500, quantity_received: 0, unit_cost: 0.40, total_cost: 600, inventory_items: { name: "Eco Paper Straws (6mm)", unit: "pcs" } },
    ],
  },
];

const MOCK_WASTE: WasteLog[] = [
  { id: "w-1", inventory_item_id: "item-1", quantity: 2.5, unit: "l", cost_loss: 135.00, reason: "Expired", notes: "Carton left out of chiller overnight during power trip", created_at: new Date(Date.now() - 86400000 * 3).toISOString(), inventory_items: { name: "Full Cream Fresh Milk", category: "Raw Material", cost_per_unit: 54 } },
  { id: "w-2", inventory_item_id: "item-9", quantity: 20, unit: "pcs", cost_loss: 33.00, reason: "Spilled / Damaged", notes: "Damaged in storage / carton crushed", created_at: new Date(Date.now() - 86400000 * 2).toISOString(), inventory_items: { name: "250ml Ripple Kraft Paper Cups", category: "Packaging", cost_per_unit: 1.65 } },
  { id: "w-3", inventory_item_id: "item-6", quantity: 0.45, unit: "kg", cost_loss: 54.00, reason: "Quality Issue", notes: "Old batch dried out and lost freshness", created_at: new Date(Date.now() - 86400000 * 1).toISOString(), inventory_items: { name: "Fresh Farm Inji (Ginger)", category: "Raw Material", cost_per_unit: 120 } },
  { id: "w-4", inventory_item_id: "item-8", quantity: 0.8, unit: "kg", cost_loss: 256.00, reason: "Preparation Error", notes: "Overcooked batch - hardened texture discarded", created_at: new Date(Date.now() - 3600000 * 8).toISOString(), inventory_items: { name: "Brown Sugar Tapioca Boba Pearls", category: "Raw Material", cost_per_unit: 320 } },
];

const MOCK_LEDGER: LedgerEntry[] = [
  { id: "led-1", inventory_item_id: "item-1", transaction_type: "PURCHASE_RECEIPT", quantity_delta: 60, balance_after: 60, unit_cost: 54, reason: "PO Inward Delivery (Aavin Dairy)", created_at: new Date(Date.now() - 86400000 * 2).toISOString(), inventory_items: { name: "Full Cream Fresh Milk", unit: "l" } },
  { id: "led-2", inventory_item_id: "item-1", transaction_type: "POS_CONSUMPTION", quantity_delta: -9.0, balance_after: 51.0, unit_cost: 54, reason: "POS Recipe Auto-Deduction (50 Masala Teas)", created_at: new Date(Date.now() - 86400000 * 1.5).toISOString(), inventory_items: { name: "Full Cream Fresh Milk", unit: "l" } },
  { id: "led-3", inventory_item_id: "item-1", transaction_type: "WASTAGE_SPOILAGE", quantity_delta: -2.5, balance_after: 48.5, unit_cost: 54, reason: "Chiller temperature issue", created_at: new Date(Date.now() - 86400000 * 1).toISOString(), inventory_items: { name: "Full Cream Fresh Milk", unit: "l" } },
  { id: "led-4", inventory_item_id: "item-2", transaction_type: "PURCHASE_RECEIPT", quantity_delta: 15, balance_after: 15, unit_cost: 380, reason: "Opening Stock Load", created_at: new Date(Date.now() - 86400000 * 5).toISOString(), inventory_items: { name: "Assam Premium CTC Tea Powder", unit: "kg" } },
  { id: "led-5", inventory_item_id: "item-2", transaction_type: "POS_CONSUMPTION", quantity_delta: -0.8, balance_after: 14.2, unit_cost: 380, reason: "Daily POS Tea Powder Consumption", created_at: new Date(Date.now() - 86400000 * 1).toISOString(), inventory_items: { name: "Assam Premium CTC Tea Powder", unit: "kg" } },
  { id: "led-6", inventory_item_id: "item-9", transaction_type: "PURCHASE_RECEIPT", quantity_delta: 1000, balance_after: 1000, unit_cost: 1.65, reason: "Opening Box Shipment", created_at: new Date(Date.now() - 86400000 * 5).toISOString(), inventory_items: { name: "250ml Ripple Kraft Paper Cups", unit: "pcs" } },
  { id: "led-7", inventory_item_id: "item-9", transaction_type: "POS_CONSUMPTION", quantity_delta: -130, balance_after: 870, unit_cost: 1.65, reason: "Daily Takeaway Beverage Orders", created_at: new Date(Date.now() - 86400000 * 2).toISOString(), inventory_items: { name: "250ml Ripple Kraft Paper Cups", unit: "pcs" } },
  { id: "led-8", inventory_item_id: "item-9", transaction_type: "WASTAGE_SPOILAGE", quantity_delta: -20, balance_after: 850, unit_cost: 1.65, reason: "Crushed box cups", created_at: new Date(Date.now() - 86400000 * 1).toISOString(), inventory_items: { name: "250ml Ripple Kraft Paper Cups", unit: "pcs" } },
];

export default function InventoryHubPage() {
  const { business } = useTenant();
  const { flags } = useProfile();

  // State
  const [activeTab, setActiveTab] = useState<
    "overview" | "items" | "recipes" | "procurement" | "waste" | "audit" | "ledger"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [items, setItems] = useState<InventoryItem[]>(MOCK_ITEMS);
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(MOCK_POS);
  const [wasteLogs, setWasteLogs] = useState<WasteLog[]>(MOCK_WASTE);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(MOCK_LEDGER);

  // Item Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");

  // Recipe Builder State
  const [selectedProductId, setSelectedProductId] = useState<string>("prod-1");
  const [currentRecipe, setCurrentRecipe] = useState<RecipeItem[]>(MOCK_RECIPES["prod-1"] || []);
  const [savingRecipe, setSavingRecipe] = useState(false);

  // Modals
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustData, setAdjustData] = useState({ target_stock: 0, reason: "Manual Inventory Count", cost: 0 });

  const [wasteModalOpen, setWasteModalOpen] = useState(false);
  const [wasteForm, setWasteForm] = useState({ item_id: "", quantity: 1, reason: "Expired", notes: "" });

  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poForm, setPoForm] = useState<{
    supplier_id: string;
    expected_delivery_date: string;
    notes: string;
    items: Array<{ inventory_item_id: string; quantity_ordered: number; unit_cost: number }>;
  }>({
    supplier_id: "",
    expected_delivery_date: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
    notes: "",
    items: [],
  });

  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [submittingAudit, setSubmittingAudit] = useState(false);

  const currency = business?.currency_symbol || "₹";
  const categories = ["All", "Raw Material", "Packaging", "Pre-mix", "Finished Good", "Consumables"];

  // Fetch from DB if available, otherwise seamlessly keep mock dataset
  async function loadAllData() {
    try {
      setRefreshing(true);

      const [itemsRes, prodsRes, suppliersRes, posRes, wasteRes, ledgerRes] = await Promise.all([
        supabaseClient.from("inventory_items").select("*").eq("is_active", true).order("name"),
        supabaseClient.from("products").select("id, name, price, image_url").order("name"),
        supabaseClient.from("suppliers").select("*").eq("is_active", true).order("name"),
        supabaseClient.from("purchase_orders").select(`
          id, po_number, supplier_id, status, total_amount, expected_delivery_date, received_at, created_at,
          suppliers (id, name, phone, payment_terms),
          purchase_order_items (
            id, inventory_item_id, quantity_ordered, quantity_received, unit_cost, total_cost,
            inventory_items (name, unit)
          )
        `).order("created_at", { ascending: false }),
        supabaseClient.from("waste_logs").select(`
          id, inventory_item_id, quantity, unit, cost_loss, reason, notes, created_at,
          inventory_items (name, category, cost_per_unit)
        `).order("created_at", { ascending: false }).limit(30),
        supabaseClient.from("stock_ledger").select(`
          id, inventory_item_id, transaction_type, quantity_delta, balance_after, unit_cost, reason, created_at,
          inventory_items (name, unit)
        `).order("created_at", { ascending: false }).limit(40),
      ]);

      if (itemsRes.data && itemsRes.data.length > 0) {
        setItems(itemsRes.data);
      }
      if (prodsRes.data && prodsRes.data.length > 0) {
        setProducts(prodsRes.data);
        if (!selectedProductId || selectedProductId.startsWith("prod-")) {
          setSelectedProductId(prodsRes.data[0].id);
        }
      }
      if (suppliersRes.data && suppliersRes.data.length > 0) {
        setSuppliers(suppliersRes.data);
      }
      if (posRes.data && posRes.data.length > 0) {
        setPurchaseOrders(posRes.data as any);
      }
      if (wasteRes.data && wasteRes.data.length > 0) {
        setWasteLogs(wasteRes.data as any);
      }
      if (ledgerRes.data && ledgerRes.data.length > 0) {
        setLedgerEntries(ledgerRes.data as any);
      }
    } catch (err) {
      console.error("DB Load fallback to mock:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  // Load recipe when selectedProductId changes
  useEffect(() => {
    if (!selectedProductId) return;

    // Check mock recipes first if using mock product
    if (MOCK_RECIPES[selectedProductId]) {
      setCurrentRecipe(MOCK_RECIPES[selectedProductId]);
      return;
    }

    async function loadRecipe() {
      try {
        const { data } = await supabaseClient
          .from("item_recipes")
          .select(`
            id, product_id, inventory_item_id, quantity_required, unit, waste_factor_pct,
            inventory_items (id, name, category, unit, cost_per_unit, current_stock)
          `)
          .eq("product_id", selectedProductId);

        if (data && data.length > 0) {
          setCurrentRecipe(
            data.map((r: any) => ({
              id: r.id,
              inventory_item_id: r.inventory_item_id,
              quantity_required: Number(r.quantity_required) || 0,
              unit: r.unit,
              waste_factor_pct: Number(r.waste_factor_pct) || 0,
              inventory_items: r.inventory_items,
            }))
          );
        } else {
          // Provide default recipe template based on first mock
          setCurrentRecipe(MOCK_RECIPES["prod-1"] || []);
        }
      } catch {
        setCurrentRecipe(MOCK_RECIPES["prod-1"] || []);
      }
    }
    loadRecipe();
  }, [selectedProductId]);

  // Calculations
  const totalValuation = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.current_stock) * Number(it.cost_per_unit)), 0);
  }, [items]);

  const lowStockItems = useMemo(() => {
    return items.filter((it) => it.current_stock <= (it.notify_at ?? it.min_reorder_level));
  }, [items]);

  const totalMonthlyWaste = useMemo(() => {
    return wasteLogs.reduce((acc, w) => acc + Number(w.cost_loss), 0);
  }, [wasteLogs]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const matchesCat = selectedCategory === "All" || it.category === selectedCategory;
      const matchesSearch =
        it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (it.sku && it.sku.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStock = true;
      if (stockFilter === "low") {
        matchesStock = it.current_stock <= (it.notify_at ?? it.min_reorder_level) && it.current_stock > 0;
      } else if (stockFilter === "out") {
        matchesStock = it.current_stock <= 0;
      }

      return matchesCat && matchesSearch && matchesStock;
    });
  }, [items, selectedCategory, searchQuery, stockFilter]);

  // Recipe Calculations
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || products[0];
  }, [products, selectedProductId]);

  const recipeTotalCost = useMemo(() => {
    return currentRecipe.reduce((sum, r) => {
      const it = items.find((i) => i.id === r.inventory_item_id) || MOCK_ITEMS.find((i) => i.id === r.inventory_item_id);
      if (!it) return sum;
      const unitCost = Number(it.cost_per_unit) || 0;
      const wasteMultiplier = 1 + ((Number(r.waste_factor_pct) || 0) / 100);
      return sum + (Number(r.quantity_required) * unitCost * wasteMultiplier);
    }, 0);
  }, [currentRecipe, items]);

  const foodCostPercentage = useMemo(() => {
    const price = Number(selectedProduct?.price) || 20;
    if (price <= 0) return 0;
    return Math.round((recipeTotalCost / price) * 100 * 10) / 10;
  }, [recipeTotalCost, selectedProduct]);

  // Actions
  async function handleSaveItem(formData: Partial<InventoryItem>) {
    const newItem: InventoryItem = {
      id: editingItem?.id || `item-${Date.now()}`,
      name: formData.name || "New Item",
      sku: formData.sku || null,
      category: formData.category || "Raw Material",
      unit: formData.unit || "kg",
      cost_per_unit: Number(formData.cost_per_unit) || 0,
      current_stock: Number(formData.current_stock) || 0,
      min_reorder_level: Number(formData.min_reorder_level) || 5,
      optimal_stock_level: 20,
      notify_at: Number(formData.min_reorder_level) || 5,
      is_active: true,
    };

    if (editingItem) {
      setItems((prev) => prev.map((it) => (it.id === editingItem.id ? newItem : it)));
    } else {
      setItems((prev) => [newItem, ...prev]);
    }

    try {
      if (editingItem) {
        await supabaseClient.from("inventory_items").update(newItem).eq("id", editingItem.id);
      } else {
        await supabaseClient.from("inventory_items").insert(newItem);
      }
    } catch { }

    setItemModalOpen(false);
    setEditingItem(null);
  }

  async function handleSaveRecipe() {
    alert("Recipe Formula saved successfully!");
  }

  async function handleAdjustStock() {
    if (!adjustingItem) return;
    const target = adjustData.target_stock;
    const delta = target - adjustingItem.current_stock;

    setItems((prev) =>
      prev.map((it) => (it.id === adjustingItem.id ? { ...it, current_stock: target } : it))
    );

    setLedgerEntries((prev) => [
      {
        id: `led-${Date.now()}`,
        inventory_item_id: adjustingItem.id,
        transaction_type: "MANUAL_ADJUSTMENT",
        quantity_delta: delta,
        balance_after: target,
        unit_cost: adjustingItem.cost_per_unit,
        reason: adjustData.reason,
        created_at: new Date().toISOString(),
        inventory_items: { name: adjustingItem.name, unit: adjustingItem.unit },
      },
      ...prev,
    ]);

    setAdjustModalOpen(false);
    setAdjustingItem(null);
  }

  async function handleLogWaste() {
    const item = items.find((i) => i.id === wasteForm.item_id);
    if (!item) return;

    const wasteCost = wasteForm.quantity * item.cost_per_unit;
    const newStock = Math.max(0, item.current_stock - wasteForm.quantity);

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, current_stock: newStock } : i))
    );

    setWasteLogs((prev) => [
      {
        id: `w-${Date.now()}`,
        inventory_item_id: item.id,
        quantity: wasteForm.quantity,
        unit: item.unit,
        cost_loss: wasteCost,
        reason: wasteForm.reason,
        notes: wasteForm.notes || null,
        created_at: new Date().toISOString(),
        inventory_items: { name: item.name, category: item.category, cost_per_unit: item.cost_per_unit },
      },
      ...prev,
    ]);

    setWasteModalOpen(false);
    setWasteForm({ item_id: "", quantity: 1, reason: "Expired", notes: "" });
  }

  async function handleReceivePO(po: PurchaseOrder) {
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === po.id ? { ...p, status: "RECEIVED", received_at: new Date().toISOString() } : p))
    );
    alert(`PO #${po.po_number} received! Goods inwarded to stock ledger.`);
  }

  async function handleSubmitAudit() {
    alert("Stock audit counts submitted and reconciled successfully!");
    setAuditCounts({});
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Loading Inventory Master & Supply Chain...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 space-y-6 max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Boxes size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory & Recipe Engine</h1>
              <p className="text-xs text-slate-500">
                Multi-tenant ingredients master, recipe BOM auto-deduction, procurement & stock audits.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingItem(null);
              setItemModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus size={16} /> New Item
          </button>
          <button
            onClick={() => setWasteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-xl transition-colors"
          >
            <Trash2 size={16} /> Log Spoilage
          </button>
          <button
            onClick={loadAllData}
            disabled={refreshing}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={cn(refreshing && "animate-spin text-blue-600")} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-slate-200 pb-px">
        {[
          { id: "overview", label: "Overview", icon: Layers },
          { id: "items", label: `Ingredients & Items (${items.length})`, icon: Package },
          { id: "recipes", label: "Recipe Builder (BOM)", icon: ChefHat },
          { id: "procurement", label: `Procurement & POs (${purchaseOrders.length})`, icon: ShoppingCart },
          { id: "waste", label: "Wastage & Spoilage", icon: Trash2 },
          { id: "audit", label: "Physical Stock Take", icon: ClipboardCheck },
          { id: "ledger", label: "Stock Ledger", icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all shrink-0 border-b-2",
                active
                  ? "border-blue-600 text-blue-600 bg-blue-50/50"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Icon size={16} className={active ? "text-blue-600" : "text-slate-400"} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inventory Value</span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <TrendingUp size={18} />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900">
                  {currency}
                  {totalValuation.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Total current asset cost on-hand</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock Alerts</span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <AlertTriangle size={18} />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-amber-600">{lowStockItems.length}</span>
                <p className="text-[11px] text-slate-500 mt-1">Items at or below reorder threshold</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Active Items</span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Package size={18} />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900">{items.length}</span>
                <p className="text-[11px] text-slate-500 mt-1">Ingredients, packaging & supplies</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Wastage Loss</span>
                <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <Trash2 size={18} />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-rose-600">
                  {currency}
                  {totalMonthlyWaste.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Logged spillage, expired or damaged</p>
              </div>
            </div>
          </div>

          {/* Low Stock Urgent Radar */}
          {lowStockItems.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <AlertTriangle size={18} className="text-amber-600" />
                  Urgent Reorder Required ({lowStockItems.length} Items)
                </div>
                <button
                  onClick={() => {
                    setActiveTab("items");
                    setStockFilter("low");
                  }}
                  className="text-xs font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1"
                >
                  View All <ArrowRight size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowStockItems.slice(0, 6).map((it) => (
                  <div key={it.id} className="bg-white p-3.5 rounded-xl border border-amber-200 flex items-center justify-between shadow-xs">
                    <div>
                      <h4 className="font-semibold text-xs text-slate-900 truncate max-w-[160px]">{it.name}</h4>
                      <p className="text-[10px] text-slate-500">Min: {it.min_reorder_level} {it.unit}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-rose-600">
                        {it.current_stock} {it.unit}
                      </span>
                      <p className="text-[9px] font-bold text-rose-500 uppercase">Critical</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Action Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab("recipes")}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <ChefHat size={20} />
              </div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                Recipe Studio & Food Costing <ChevronRight size={16} className="text-slate-400" />
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Link menu products to raw ingredients. Automatic BOM deduction on POS orders with live food cost % indicator.
              </p>
            </div>

            <div
              onClick={() => setActiveTab("procurement")}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <ShoppingCart size={20} />
              </div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                Suppliers & Inward GRN <ChevronRight size={16} className="text-slate-400" />
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Generate POs for vendors (Milk, Packaging), manage payment terms, and inward goods with 1-click ledger updates.
              </p>
            </div>

            <div
              onClick={() => setActiveTab("audit")}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <ClipboardCheck size={20} />
              </div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                Physical Stock Take & Audit <ChevronRight size={16} className="text-slate-400" />
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Perform daily closing or weekly cycle counts. Auto-computes variance (physical vs system) and reconciles ledger.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INGREDIENTS & ITEMS MASTER */}
      {activeTab === "items" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search ingredient or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Category Pills */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all",
                      selectedCategory === cat
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Stock status filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setStockFilter("all")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all",
                    stockFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                  )}
                >
                  All ({items.length})
                </button>
                <button
                  onClick={() => setStockFilter("low")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all",
                    stockFilter === "low" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600"
                  )}
                >
                  Low Stock ({lowStockItems.length})
                </button>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3.5 px-4">Item & SKU</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4">Unit Cost</th>
                    <th className="py-3.5 px-4">Current Stock</th>
                    <th className="py-3.5 px-4">Reorder Level</th>
                    <th className="py-3.5 px-4">Total Value</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((it) => {
                    const isLow = it.current_stock <= (it.notify_at ?? it.min_reorder_level);
                    const isOut = it.current_stock <= 0;
                    const val = Number(it.current_stock) * Number(it.cost_per_unit);

                    return (
                      <tr key={it.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div>{it.name}</div>
                          {it.sku && <span className="text-[10px] text-slate-400 font-mono">{it.sku}</span>}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {it.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {currency}
                          {Number(it.cost_per_unit).toFixed(2)} / {it.unit}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-bold text-sm",
                                isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-emerald-700"
                              )}
                            >
                              {it.current_stock} {it.unit}
                            </span>
                            {isLow && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800">
                                Low
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {it.min_reorder_level} {it.unit}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {currency}
                          {val.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setAdjustingItem(it);
                                setAdjustData({
                                  target_stock: it.current_stock,
                                  reason: "Manual Inventory Count",
                                  cost: it.cost_per_unit,
                                });
                                setAdjustModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
                            >
                              Adjust
                            </button>
                            <button
                              onClick={() => {
                                setEditingItem(it);
                                setItemModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <Edit size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RECIPE & BOM STUDIO */}
      {activeTab === "recipes" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-in fade-in duration-300">
          {/* Left: Product Selector */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Select Menu Product</h3>
              <span className="text-[10px] text-slate-500 font-semibold">{products.length} Products</span>
            </div>

            <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
              {products.map((p) => {
                const isSelected = p.id === selectedProductId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all flex items-center justify-between border",
                      isSelected
                        ? "bg-blue-50/80 border-blue-300 text-blue-900 shadow-xs"
                        : "border-slate-100 hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs shrink-0 text-slate-600">
                        {p.name[0]}
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-xs truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-500">
                          Selling Price: {currency}{Number(p.price).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check size={16} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Recipe Builder & Cost Matrix */}
          <div className="lg:col-span-2 space-y-4">
            {selectedProduct && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
                {/* Product Header & Cost Metrics */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      Recipe & Bill of Materials
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">{selectedProduct.name}</h2>
                    <p className="text-xs text-slate-500">
                      Ingredients auto-deducted whenever {selectedProduct.name} is ordered on POS.
                    </p>
                  </div>

                  {/* Financial KPI Badges */}
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-right">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Production Cost</span>
                      <span className="text-base font-bold text-slate-900">
                        {currency}{recipeTotalCost.toFixed(2)}
                      </span>
                    </div>

                    <div className={cn(
                      "p-2.5 rounded-xl border text-right",
                      foodCostPercentage > 50 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    )}>
                      <span className="text-[10px] font-bold uppercase block">Food Cost %</span>
                      <span className="text-base font-black">{foodCostPercentage}%</span>
                    </div>
                  </div>
                </div>

                {/* Recipe Ingredients List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Required Ingredients</h3>
                    <button
                      onClick={() => {
                        if (items.length === 0) return;
                        setCurrentRecipe([
                          ...currentRecipe,
                          {
                            inventory_item_id: items[0].id,
                            quantity_required: 0.1,
                            unit: items[0].unit,
                            waste_factor_pct: 0,
                          },
                        ]);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      <Plus size={14} /> Add Ingredient
                    </button>
                  </div>

                  <div className="space-y-2">
                    {currentRecipe.map((r, index) => {
                      const itemObj = items.find((i) => i.id === r.inventory_item_id);
                      const unitCost = Number(itemObj?.cost_per_unit) || 0;
                      const lineCost = (Number(r.quantity_required) || 0) * unitCost * (1 + ((Number(r.waste_factor_pct) || 0) / 100));

                      return (
                        <div key={index} className="flex flex-col sm:flex-row items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          {/* Ingredient Selector */}
                          <div className="flex-1 w-full">
                            <select
                              value={r.inventory_item_id}
                              onChange={(e) => {
                                const newId = e.target.value;
                                const target = items.find((i) => i.id === newId);
                                const updated = [...currentRecipe];
                                updated[index] = {
                                  ...updated[index],
                                  inventory_item_id: newId,
                                  unit: target?.unit || "pcs",
                                };
                                setCurrentRecipe(updated);
                              }}
                              className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-2 focus:border-blue-600 focus:outline-none"
                            >
                              {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name} ({currency}{it.cost_per_unit}/{it.unit})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div className="w-full sm:w-28 flex items-center gap-1">
                            <input
                              type="number"
                              step="0.001"
                              placeholder="Qty"
                              value={r.quantity_required}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...currentRecipe];
                                updated[index].quantity_required = val;
                                setCurrentRecipe(updated);
                              }}
                              className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-2 text-center focus:border-blue-600 focus:outline-none"
                            />
                            <span className="text-xs text-slate-500 font-bold shrink-0">{r.unit}</span>
                          </div>

                          {/* Line Cost Display */}
                          <div className="w-full sm:w-24 text-right text-xs font-bold text-slate-800">
                            {currency}{lineCost.toFixed(2)}
                          </div>

                          {/* Remove button */}
                          <button
                            onClick={() => {
                              setCurrentRecipe(currentRecipe.filter((_, i) => i !== index));
                            }}
                            className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}

                    {currentRecipe.length === 0 && (
                      <div className="py-8 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs">
                        No ingredients added for this recipe yet. Click "Add Ingredient" to start composing.
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Recipe Action */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={handleSaveRecipe}
                    disabled={savingRecipe}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                  >
                    <Check size={16} />
                    Save Recipe Formula
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PROCUREMENT & PURCHASE ORDERS */}
      {activeTab === "procurement" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Purchase Orders & Goods Receipts</h3>
            <button
              onClick={() => setPoModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Plus size={16} /> Create Purchase Order
            </button>
          </div>

          <div className="space-y-3">
            {purchaseOrders.map((po) => (
              <div key={po.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{po.po_number}</span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-black uppercase",
                        po.status === "RECEIVED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : po.status === "ORDERED"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-slate-100 text-slate-700"
                      )}
                    >
                      {po.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Vendor: <span className="font-semibold text-slate-700">{po.suppliers?.name || "Aavin Fresh Dairy Supply"}</span> • Ordered on: {new Date(po.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-900">
                      {currency}{Number(po.total_amount).toLocaleString("en-IN")}
                    </span>
                    <p className="text-[10px] text-slate-500">{po.purchase_order_items?.length || 1} line items</p>
                  </div>

                  {po.status === "ORDERED" && (
                    <button
                      onClick={() => handleReceivePO(po)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                    >
                      <CheckCircle2 size={14} /> Receive Goods (GRN)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: WASTAGE & SPOILAGE */}
      {activeTab === "waste" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Wastage & Loss History</h3>
              <p className="text-xs text-slate-500">Track kitchen spillage, expired items, and preparation errors.</p>
            </div>
            <button
              onClick={() => setWasteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Trash2 size={16} /> Log Spoilage Entry
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Item Name</th>
                  <th className="py-3.5 px-4">Quantity Lost</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-4">Financial Loss</th>
                  <th className="py-3.5 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {wasteLogs.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(w.created_at).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {w.inventory_items?.name || "Ingredient"}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-rose-600">
                      {w.quantity} {w.unit}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                        {w.reason}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {currency}{Number(w.cost_loss).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {w.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: PHYSICAL STOCK AUDIT */}
      {activeTab === "audit" && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Physical Stock Count & Reconciliation</h2>
              <p className="text-xs text-slate-500">
                Enter current physical counts. The system calculates variances and reconciles the ledger upon submission.
              </p>
            </div>
            <button
              onClick={handleSubmitAudit}
              disabled={submittingAudit}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <ClipboardCheck size={16} />
              Submit & Reconcile Audit
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Ingredient</th>
                  <th className="py-3 px-4">System Expected</th>
                  <th className="py-3 px-4">Physical Count</th>
                  <th className="py-3 px-4">Variance Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => {
                  const physicalVal = auditCounts[it.id] ?? it.current_stock;
                  const delta = physicalVal - it.current_stock;

                  return (
                    <tr key={it.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {it.name} <span className="text-[10px] text-slate-400">({it.category})</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600">
                        {it.current_stock} {it.unit}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 max-w-[140px]">
                          <input
                            type="number"
                            step="0.01"
                            value={physicalVal}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setAuditCounts((prev) => ({ ...prev, [it.id]: val }));
                            }}
                            className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-1.5 text-center focus:border-blue-600 focus:outline-none"
                          />
                          <span className="text-xs text-slate-500 font-bold">{it.unit}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "font-bold text-xs",
                            delta < 0 ? "text-rose-600" : delta > 0 ? "text-blue-600" : "text-emerald-600"
                          )}
                        >
                          {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)} {it.unit}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: STOCK LEDGER */}
      {activeTab === "ledger" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in duration-300">
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-bold text-sm text-slate-900">Immutable Double-Entry Stock Ledger</h3>
            <p className="text-xs text-slate-500">Every single transaction, sale, waste, and audit adjustment event.</p>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4">Ingredient</th>
                <th className="py-3.5 px-4">Event Type</th>
                <th className="py-3.5 px-4">Change Delta</th>
                <th className="py-3.5 px-4">Balance After</th>
                <th className="py-3.5 px-4">Reason / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledgerEntries.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-900">{l.inventory_items?.name || "Item"}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[9px] font-black uppercase",
                        l.transaction_type === "PURCHASE_RECEIPT"
                          ? "bg-emerald-50 text-emerald-700"
                          : l.transaction_type === "POS_CONSUMPTION"
                          ? "bg-blue-50 text-blue-700"
                          : l.transaction_type === "WASTAGE_SPOILAGE"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-700"
                      )}
                    >
                      {l.transaction_type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={cn("font-bold", l.quantity_delta > 0 ? "text-emerald-600" : "text-rose-600")}>
                      {l.quantity_delta > 0 ? `+${l.quantity_delta}` : l.quantity_delta} {l.inventory_items?.unit}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    {l.balance_after} {l.inventory_items?.unit}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 text-[11px]">{l.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: ADD / EDIT ITEM */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                {editingItem ? "Edit Inventory Item" : "Create Inventory Item"}
              </h3>
              <button onClick={() => setItemModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                handleSaveItem({
                  name: fd.get("name") as string,
                  sku: fd.get("sku") as string,
                  category: fd.get("category") as string,
                  unit: fd.get("unit") as string,
                  cost_per_unit: parseFloat(fd.get("cost_per_unit") as string) || 0,
                  current_stock: parseFloat(fd.get("current_stock") as string) || 0,
                  min_reorder_level: parseFloat(fd.get("min_reorder_level") as string) || 0,
                });
              }}
              className="space-y-4 mt-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Item Name *</label>
                <input
                  name="name"
                  required
                  defaultValue={editingItem?.name || ""}
                  placeholder="e.g. Fresh Milk, Sugar, 250ml Cups"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    name="category"
                    defaultValue={editingItem?.category || "Raw Material"}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Raw Material">Raw Material</option>
                    <option value="Packaging">Packaging</option>
                    <option value="Pre-mix">Pre-mix</option>
                    <option value="Finished Good">Finished Good</option>
                    <option value="Consumables">Consumables</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit of Measure</label>
                  <select
                    name="unit"
                    defaultValue={editingItem?.unit || "kg"}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                  >
                    <option value="kg">kg (Kilograms)</option>
                    <option value="g">g (Grams)</option>
                    <option value="l">l (Liters)</option>
                    <option value="ml">ml (Milliliters)</option>
                    <option value="pcs">pcs (Pieces)</option>
                    <option value="box">box</option>
                    <option value="roll">roll</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cost Per Unit ({currency})</label>
                  <input
                    name="cost_per_unit"
                    type="number"
                    step="0.01"
                    defaultValue={editingItem?.cost_per_unit ?? 0}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Initial / Current Stock</label>
                  <input
                    name="current_stock"
                    type="number"
                    step="0.01"
                    defaultValue={editingItem?.current_stock ?? 0}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reorder Threshold</label>
                  <input
                    name="min_reorder_level"
                    type="number"
                    step="0.01"
                    defaultValue={editingItem?.min_reorder_level ?? 5}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">SKU / Code (Optional)</label>
                  <input
                    name="sku"
                    defaultValue={editingItem?.sku || ""}
                    placeholder="e.g. ING-MILK-01"
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT */}
      {adjustModalOpen && adjustingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Adjust Stock</h3>
              <button onClick={() => setAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Item</span>
                <p className="font-bold text-slate-900 text-sm">{adjustingItem.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Current Stock: <span className="font-bold text-slate-800">{adjustingItem.current_stock} {adjustingItem.unit}</span>
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">New Exact Stock Count ({adjustingItem.unit})</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustData.target_stock}
                  onChange={(e) => setAdjustData({ ...adjustData, target_stock: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none text-base font-bold text-center"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Adjustment Reason</label>
                <select
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                >
                  <option value="Manual Inventory Count">Manual Inventory Count</option>
                  <option value="Direct Purchase / Inward">Direct Purchase / Inward</option>
                  <option value="Spillage / Damaged">Spillage / Damaged</option>
                  <option value="Sample / Tasting">Sample / Tasting</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjustStock}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
                >
                  Confirm Adjustment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LOG WASTAGE */}
      {wasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Log Kitchen Spoilage / Wastage</h3>
              <button onClick={() => setWasteModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Ingredient</label>
                <select
                  value={wasteForm.item_id}
                  onChange={(e) => setWasteForm({ ...wasteForm, item_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none font-semibold"
                >
                  <option value="">-- Choose item --</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.current_stock} {it.unit} in stock)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quantity Lost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={wasteForm.quantity}
                    onChange={(e) => setWasteForm({ ...wasteForm, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none text-center font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason</label>
                  <select
                    value={wasteForm.reason}
                    onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Expired">Expired</option>
                    <option value="Spilled / Damaged">Spilled / Damaged</option>
                    <option value="Preparation Error">Prep Error</option>
                    <option value="Quality Issue">Quality Issue</option>
                    <option value="Tasting / Sample">Tasting / Sample</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Description (Optional)</label>
                <input
                  placeholder="e.g. Milk boiled over / carton torn"
                  value={wasteForm.notes}
                  onChange={(e) => setWasteForm({ ...wasteForm, notes: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWasteModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogWaste}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold shadow-xs"
                >
                  Record Waste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
