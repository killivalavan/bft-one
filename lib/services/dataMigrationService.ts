import { getAuthHeaders } from "@/lib/auth/clientAuth";

export async function runClientDataMigration(bizId: string): Promise<boolean> {
  if (typeof window === "undefined" || !bizId || bizId === "default") {
    return false;
  }

  const migrationKey = `bftone_migrated_${bizId}`;
  if (localStorage.getItem(migrationKey) === "true") {
    return true; // Already migrated
  }

  try {
    // 1. Gather all local data
    const rawInvoices = localStorage.getItem(`bftone_invoices_${bizId}`);
    const rawCustomers = localStorage.getItem(`bftone_customers_${bizId}`);
    const rawProducts = localStorage.getItem(`bftone_baker_products_${bizId}`);
    const rawPayments = localStorage.getItem(`bftone_baker_payments_${bizId}`);
    const rawExpenses = localStorage.getItem(`bftone_baker_expenses_${bizId}`);
    const rawBroadcasts = localStorage.getItem(`bftone_baker_broadcasts_${bizId}`);

    const invoices = rawInvoices ? JSON.parse(rawInvoices) : [];
    const customers = rawCustomers ? JSON.parse(rawCustomers) : [];
    const products = rawProducts ? JSON.parse(rawProducts) : [];
    const payments = rawPayments ? JSON.parse(rawPayments) : [];
    const expenses = rawExpenses ? JSON.parse(rawExpenses) : [];
    const broadcasts = rawBroadcasts ? JSON.parse(rawBroadcasts) : [];

    const hasDataToMigrate =
      invoices.length > 0 ||
      customers.length > 0 ||
      products.length > 0 ||
      payments.length > 0 ||
      expenses.length > 0 ||
      broadcasts.length > 0;

    if (!hasDataToMigrate) {
      localStorage.setItem(migrationKey, "true");
      return true;
    }

    // 2. Create non-destructive local backup
    const backupKey = `bftone_backup_${bizId}_${Date.now()}`;
    localStorage.setItem(
      backupKey,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        invoices,
        customers,
        products,
        payments,
        expenses,
        broadcasts,
      })
    );

    // 3. Send payload to Supabase migration route
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/migrate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        business_id: bizId,
        invoices,
        customers,
        products,
        payments,
        expenses,
        broadcasts,
      }),
    });

    if (res.ok) {
      localStorage.setItem(migrationKey, "true");
      console.log(`[SeyalPro Migration] Successfully migrated local data to Supabase for ${bizId}`);
      return true;
    }
  } catch (err) {
    console.warn("[SeyalPro Migration] Migration failed:", err);
  }

  return false;
}
