/**
 * SeyalPro Offline-First IndexedDB Engine
 * Multi-Tenant Isolated, High Performance Local Storage Layer
 */

export const DB_NAME = "seyalpro_offline_v1";
export const DB_VERSION = 1;

// ==========================================
// Entity Type Definitions
// ==========================================

export interface LocalProduct {
  id: string;
  business_id: string;
  name: string;
  price_cents: number;
  category_id: string;
  unit_label?: string | null;
  subtitle?: string | null;
  image_url?: string | null;
  active?: boolean;
  updated_at?: string;
}

export interface LocalCategory {
  id: string;
  business_id: string;
  name: string;
  icon_url?: string | null;
  icon_emoji?: string;
  updated_at?: string;
}

export interface LocalProductStock {
  product_id: string;
  business_id: string;
  available_qty: number;
  max_qty: number;
  notify_at_count?: number | null;
  updated_at?: string;
}

export interface LocalOrder {
  id: string;
  business_id: string;
  user_id?: string | null;
  total_cents: number;
  subtotal_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  payment_mode: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  table_number?: string | null;
  status: string;
  notes?: string | null;
  created_at: string;
  is_offline?: boolean;
}

export interface LocalOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  qty: number;
  price_cents: number;
  business_id: string;
}

export interface LocalCustomer {
  id: string;
  business_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  role?: string;
  updated_at?: string;
}

export interface LocalSupplier {
  id: string;
  business_id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  payment_terms?: string | null;
  lead_time_days?: number;
  is_active?: boolean;
  updated_at?: string;
}

export interface LocalInventoryItem {
  id: string;
  business_id: string;
  name: string;
  sku?: string | null;
  category: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
  min_reorder_level?: number;
  optimal_stock_level?: number;
  notify_at?: number | null;
  is_active?: boolean;
  updated_at?: string;
}

export interface LocalPurchaseOrder {
  id: string;
  business_id: string;
  po_number: string;
  supplier_id?: string | null;
  status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
  total_amount: number;
  expected_delivery_date?: string | null;
  received_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  items?: LocalPurchaseOrderItem[];
}

export interface LocalPurchaseOrderItem {
  id: string;
  business_id: string;
  po_id: string;
  inventory_item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  total_cost: number;
  created_at?: string;
}

export interface LocalDailyExpense {
  id: string;
  business_id: string;
  expense_date: string;
  item_name: string;
  quantity: number;
  price_cents: number;
  submitted_by?: string | null;
  created_at: string;
  notes?: string | null;
}

export interface LocalMonthlyExpense {
  id: string;
  business_id: string;
  expense_month?: string | null;
  category: string;
  item_name: string;
  amount_cents: number;
  previous_amount_cents?: number | null;
  is_active?: boolean;
  notes?: string | null;
  submitted_by?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface LocalTimesheet {
  id: string;
  business_id: string;
  user_id: string;
  work_date: string;
  check_in?: string | null;
  minutes_late?: number;
  extra_hours?: number;
  created_at?: string;
}

export interface LocalLeave {
  id: string;
  business_id: string;
  user_id: string;
  leave_date: string;
  reason?: string | null;
  created_at?: string;
}

export interface LocalInvoice {
  id: string;
  business_id: string;
  invoice_number: string;
  title: string;
  invoice_date: string;
  due_date: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  items: Array<{
    id: string;
    name: string;
    qty: number;
    unit: string;
    rate: number;
    amount: number;
  }>;
  subtotal_cents: number;
  tax_rate: number;
  tax_cents: number;
  tds_cents: number;
  discount_cents: number;
  additional_cents: number;
  total_cents: number;
  status: "paid" | "unpaid" | "overdue" | "cancelled";
  payment_mode: string;
  notes?: string;
  bank_details?: any;
  upi_details?: any;
  created_at: string;
  updated_at?: string;
}

export interface LocalStockLedger {
  id: string;
  business_id: string;
  inventory_item_id?: string | null;
  product_id?: string | null;
  transaction_type: string; // 'POS_CONSUMPTION' | 'PURCHASE_RECEIPT' | 'MANUAL_ADJUSTMENT' | 'WASTAGE'
  quantity_delta: number;
  balance_after?: number;
  unit_cost?: number;
  reference_id?: string | null;
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface SyncQueueItem {
  id: string; // unique UUID for operation
  client_operation_id: string; // Idempotency token
  business_id: string;
  table_name: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "RPC";
  payload: any;
  // "failed"   = transient error (network/server), retried automatically
  // "rejected" = server permanently refused (RLS, invalid data); needs user review, not auto-retried
  status: "pending" | "syncing" | "failed" | "rejected" | "synced";
  retry_count: number;
  last_error?: string | null;
  created_at: string;
  synced_at?: string | null;
}

export interface LocalMetaItem {
  key: string;
  value: any;
  updated_at: string;
}

// Stores Configuration Map
export const STORES = {
  products: "products",
  categories: "categories",
  product_stocks: "product_stocks",
  orders: "orders",
  order_items: "order_items",
  customers: "customers",
  suppliers: "suppliers",
  inventory_items: "inventory_items",
  purchase_orders: "purchase_orders",
  purchase_order_items: "purchase_order_items",
  daily_expenses: "daily_expenses",
  monthly_expenses: "monthly_expenses",
  timesheets: "timesheets",
  leaves: "leaves",
  invoices: "invoices",
  stock_ledger: "stock_ledger",
  sync_queue: "sync_queue",
  meta: "meta",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

// ==========================================
// Database Initialization
// ==========================================

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

export function getIndexedDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in browser"));
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Products Store
      if (!db.objectStoreNames.contains(STORES.products)) {
        const s = db.createObjectStore(STORES.products, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("category_id", "category_id", { unique: false });
      }

      // 2. Categories Store
      if (!db.objectStoreNames.contains(STORES.categories)) {
        const s = db.createObjectStore(STORES.categories, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
      }

      // 3. Product Stocks Store
      if (!db.objectStoreNames.contains(STORES.product_stocks)) {
        const s = db.createObjectStore(STORES.product_stocks, { keyPath: "product_id" });
        s.createIndex("business_id", "business_id", { unique: false });
      }

      // 4. Orders Store
      if (!db.objectStoreNames.contains(STORES.orders)) {
        const s = db.createObjectStore(STORES.orders, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("created_at", "created_at", { unique: false });
      }

      // 5. Order Items Store
      if (!db.objectStoreNames.contains(STORES.order_items)) {
        const s = db.createObjectStore(STORES.order_items, { keyPath: "id" });
        s.createIndex("order_id", "order_id", { unique: false });
        s.createIndex("business_id", "business_id", { unique: false });
      }

      // 6. Customers Store
      if (!db.objectStoreNames.contains(STORES.customers)) {
        const s = db.createObjectStore(STORES.customers, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("phone", "phone", { unique: false });
      }

      // 7. Suppliers Store
      if (!db.objectStoreNames.contains(STORES.suppliers)) {
        const s = db.createObjectStore(STORES.suppliers, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
      }

      // 8. Inventory Items Store
      if (!db.objectStoreNames.contains(STORES.inventory_items)) {
        const s = db.createObjectStore(STORES.inventory_items, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("category", "category", { unique: false });
      }

      // 9. Purchase Orders Store
      if (!db.objectStoreNames.contains(STORES.purchase_orders)) {
        const s = db.createObjectStore(STORES.purchase_orders, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("status", "status", { unique: false });
      }

      // 10. Purchase Order Items Store
      if (!db.objectStoreNames.contains(STORES.purchase_order_items)) {
        const s = db.createObjectStore(STORES.purchase_order_items, { keyPath: "id" });
        s.createIndex("po_id", "po_id", { unique: false });
        s.createIndex("business_id", "business_id", { unique: false });
      }

      // 11. Daily Expenses Store
      if (!db.objectStoreNames.contains(STORES.daily_expenses)) {
        const s = db.createObjectStore(STORES.daily_expenses, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("expense_date", "expense_date", { unique: false });
      }

      // 12. Monthly Expenses Store
      if (!db.objectStoreNames.contains(STORES.monthly_expenses)) {
        const s = db.createObjectStore(STORES.monthly_expenses, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
      }

      // 13. Timesheets Store
      if (!db.objectStoreNames.contains(STORES.timesheets)) {
        const s = db.createObjectStore(STORES.timesheets, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("work_date", "work_date", { unique: false });
        s.createIndex("user_id", "user_id", { unique: false });
      }

      // 14. Leaves Store
      if (!db.objectStoreNames.contains(STORES.leaves)) {
        const s = db.createObjectStore(STORES.leaves, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("user_id", "user_id", { unique: false });
      }

      // 15. Invoices Store
      if (!db.objectStoreNames.contains(STORES.invoices)) {
        const s = db.createObjectStore(STORES.invoices, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("invoice_number", "invoice_number", { unique: false });
      }

      // 16. Stock Ledger Store
      if (!db.objectStoreNames.contains(STORES.stock_ledger)) {
        const s = db.createObjectStore(STORES.stock_ledger, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("inventory_item_id", "inventory_item_id", { unique: false });
      }

      // 17. Sync Queue Store (Critical for offline persistence)
      if (!db.objectStoreNames.contains(STORES.sync_queue)) {
        const s = db.createObjectStore(STORES.sync_queue, { keyPath: "id" });
        s.createIndex("business_id", "business_id", { unique: false });
        s.createIndex("status", "status", { unique: false });
        s.createIndex("created_at", "created_at", { unique: false });
        s.createIndex("client_operation_id", "client_operation_id", { unique: true });
      }

      // 18. Meta Store
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error("IndexedDB Open Error:", (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

// ==========================================
// High-Level Generic Storage Operations
// ==========================================

export async function putItem<T>(storeName: StoreName, item: T): Promise<T> {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(item);

    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

export async function bulkPutItems<T>(storeName: StoreName, items: T[]): Promise<void> {
  if (!items || items.length === 0) return;
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    for (const item of items) {
      store.put(item);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getItem<T>(storeName: StoreName, key: IDBValidKey): Promise<T | null> {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);

    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteItem(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllItems<T>(storeName: StoreName): Promise<T[]> {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();

    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getItemsByTenant<T extends { business_id?: string }>(
  storeName: StoreName,
  businessId: string
): Promise<T[]> {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);

    if (store.indexNames.contains("business_id")) {
      const index = store.index("business_id");
      const req = index.getAll(businessId);
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    } else {
      // Fallback filter
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as T[]) || [];
        resolve(all.filter((i) => !i.business_id || i.business_id === businessId));
      };
      req.onerror = () => reject(req.error);
    }
  });
}

export async function clearTenantData(businessId: string): Promise<void> {
  const allStores = Object.values(STORES);
  for (const s of allStores) {
    if (s === STORES.meta) continue;
    try {
      const items = await getItemsByTenant<{ id?: string; product_id?: string; business_id?: string }>(s, businessId);
      for (const it of items) {
        const k = it.id || it.product_id;
        if (k) await deleteItem(s, k);
      }
    } catch {}
  }
}

// ==========================================
// Meta Store Helpers
// ==========================================

export async function getMeta<T = any>(key: string): Promise<T | null> {
  const item = await getItem<LocalMetaItem>(STORES.meta, key);
  return item ? item.value : null;
}

export async function setMeta(key: string, value: any): Promise<void> {
  await putItem<LocalMetaItem>(STORES.meta, {
    key,
    value,
    updated_at: new Date().toISOString(),
  });
}

// Client Device ID generator for trace audit trail
export async function getClientDeviceId(): Promise<string> {
  let devId = await getMeta<string>("client_device_id");
  if (!devId) {
    devId = "DEV-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await setMeta("client_device_id", devId);
  }
  return devId;
}
