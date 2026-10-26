"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/auth/clientAuth";

export interface InvoiceItem {
  id?: string;
  name?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  amount?: number;
}

export interface UniversalInvoice {
  id: string;
  business_id?: string;
  invoiceNumber: string;
  title?: string;
  date: string;
  dueDate?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  tdsAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  paidAmount?: number;
  balanceDue?: number;
  status: "paid" | "pending" | "partial" | "overdue" | "cancelled" | "unpaid";
  paymentMode?: string;
  notes?: string;
  bankDetails?: any;
  upiDetails?: any;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useInvoicesQuery(bizId: string | undefined) {
  const activeBizId = bizId || "default";

  return useQuery<UniversalInvoice[]>({
    queryKey: ["invoices", activeBizId],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/invoices?business_id=${activeBizId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch invoices: ${res.statusText}`);
      }
      const data = await res.json();
      return (data.invoices || []).map((inv: any) => ({
        id: inv.id,
        business_id: inv.business_id,
        invoiceNumber: inv.invoice_number || inv.invoiceNumber || inv.slip_number || "INV-000",
        title: inv.title || "TAX INVOICE",
        date: inv.date || new Date().toISOString().split("T")[0],
        dueDate: inv.due_date || inv.dueDate,
        customerName: inv.customer_name || inv.customerName || "Customer",
        customerPhone: inv.customer_phone || inv.customerPhone || "",
        customerAddress: inv.customer_address || inv.customerAddress || "",
        customerGstin: inv.customer_gstin || inv.customerGstin || "",
        items: Array.isArray(inv.items) ? inv.items : [],
        subtotal: Number(inv.subtotal || 0),
        taxRate: Number(inv.tax_rate || inv.taxRate || 0),
        taxAmount: Number(inv.tax_amount || inv.taxAmount || 0),
        tdsAmount: Number(inv.tds_amount || inv.tdsAmount || 0),
        discountAmount: Number(inv.discount_amount || inv.discountAmount || 0),
        totalAmount: Number(inv.total_amount || inv.totalAmount || 0),
        paidAmount: Number(inv.paid_amount || inv.paidAmount || 0),
        balanceDue: Number(inv.balance_due || inv.balanceDue || 0),
        status: inv.status || "pending",
        paymentMode: inv.payment_mode || inv.paymentMode || "UPI",
        notes: inv.notes || "",
        bankDetails: inv.bank_details || inv.bankDetails,
        upiDetails: inv.upi_details || inv.upiDetails,
        source: inv.source || "cafe_pos",
        createdAt: inv.created_at || inv.createdAt,
      }));
    },
    enabled: Boolean(activeBizId),
  });
}

export function useSaveInvoiceMutation(bizId: string | undefined) {
  const queryClient = useQueryClient();
  const activeBizId = bizId || "default";

  return useMutation({
    mutationFn: async (invoice: Partial<UniversalInvoice>) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/invoices`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...invoice,
          business_id: activeBizId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", activeBizId] });
      queryClient.invalidateQueries({ queryKey: ["b2b", activeBizId, "workspace"] });
    },
  });
}

export function useDeleteInvoiceMutation(bizId: string | undefined) {
  const queryClient = useQueryClient();
  const activeBizId = bizId || "default";

  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/invoices?business_id=${activeBizId}&id=${invoiceId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        throw new Error("Failed to delete invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", activeBizId] });
      queryClient.invalidateQueries({ queryKey: ["b2b", activeBizId, "workspace"] });
    },
  });
}
