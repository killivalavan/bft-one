"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/auth/clientAuth";

export interface B2BWorkspaceData {
  invoices: any[];
  products: any[];
  payments: any[];
  expenses: any[];
  broadcasts: any[];
  stores: any[];
  source?: string;
}

export function useB2BWorkspace(bizId: string | undefined) {
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useQuery<B2BWorkspaceData>({
    queryKey: ["b2b", bizId, "workspace"],
    queryFn: async () => {
      if (!isValidBizId) {
        return {
          invoices: [],
          products: [],
          payments: [],
          expenses: [],
          broadcasts: [],
          stores: [],
        };
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/workspace?business_id=${bizId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch B2B workspace: ${res.statusText}`);
      }
      const data = await res.json();
      return {
        invoices: data.invoices || [],
        products: data.products || [],
        payments: data.payments || [],
        expenses: data.expenses || [],
        broadcasts: data.broadcasts || [],
        stores: data.stores || [],
        source: data.source,
      };
    },
    enabled: isValidBizId,
  });
}

export function useB2BDispatches(bizId: string | undefined) {
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useQuery<any[]>({
    queryKey: ["b2b", bizId, "dispatches"],
    queryFn: async () => {
      if (!isValidBizId) return [];
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/dispatches?business_id=${bizId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch dispatches: ${res.statusText}`);
      }
      const data = await res.json();
      return data.dispatches || [];
    },
    enabled: isValidBizId,
  });
}

export function useCreateDispatchMutation(bizId: string | undefined) {
  const queryClient = useQueryClient();
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useMutation({
    mutationFn: async (slip: any) => {
      if (!isValidBizId) {
        throw new Error("Cannot save dispatch: valid business context required");
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/dispatches`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...slip,
          business_id: bizId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save dispatch slip");
      }
      return res.json();
    },
    onSuccess: () => {
      if (bizId) {
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "dispatches"] });
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "workspace"] });
        queryClient.invalidateQueries({ queryKey: ["invoices", bizId] });
      }
    },
  });
}

export function useB2BProducts(bizId: string | undefined) {
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useQuery<any[]>({
    queryKey: ["b2b", bizId, "products"],
    queryFn: async () => {
      if (!isValidBizId) return [];
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/products?business_id=${bizId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch wholesale products: ${res.statusText}`);
      }
      const data = await res.json();
      return data.products || [];
    },
    enabled: isValidBizId,
  });
}

export function useSaveProductMutation(bizId: string | undefined) {
  const queryClient = useQueryClient();
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useMutation({
    mutationFn: async (product: any) => {
      if (!isValidBizId) {
        throw new Error("Cannot save product: valid business context required");
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/products`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...product,
          business_id: bizId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save product");
      }
      return res.json();
    },
    onSuccess: () => {
      if (bizId) {
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "products"] });
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "workspace"] });
      }
    },
  });
}

export function useB2BPayments(bizId: string | undefined) {
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useQuery<any[]>({
    queryKey: ["b2b", bizId, "payments"],
    queryFn: async () => {
      if (!isValidBizId) return [];
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/payments?business_id=${bizId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch payments: ${res.statusText}`);
      }
      const data = await res.json();
      return data.payments || [];
    },
    enabled: isValidBizId,
  });
}

export function useRecordPaymentMutation(bizId: string | undefined) {
  const queryClient = useQueryClient();
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useMutation({
    mutationFn: async (payload: { payment: any; updatedInvoices?: any[] }) => {
      if (!isValidBizId) {
        throw new Error("Cannot record payment: valid business context required");
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/payments`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload.payment,
          updatedInvoices: payload.updatedInvoices,
          business_id: bizId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      if (bizId) {
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "payments"] });
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "dispatches"] });
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "workspace"] });
        queryClient.invalidateQueries({ queryKey: ["invoices", bizId] });
      }
    },
  });
}

export function useB2BExpenses(bizId: string | undefined) {
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useQuery<any[]>({
    queryKey: ["b2b", bizId, "expenses"],
    queryFn: async () => {
      if (!isValidBizId) return [];
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/expenses?business_id=${bizId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch expenses: ${res.statusText}`);
      }
      const data = await res.json();
      return data.expenses || [];
    },
    enabled: isValidBizId,
  });
}

export function useRecordExpenseMutation(bizId: string | undefined) {
  const queryClient = useQueryClient();
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useMutation({
    mutationFn: async (expense: any) => {
      if (!isValidBizId) {
        throw new Error("Cannot save expense: valid business context required");
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/expenses`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...expense,
          business_id: bizId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save expense");
      }
      return res.json();
    },
    onSuccess: () => {
      if (bizId) {
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "expenses"] });
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "workspace"] });
      }
    },
  });
}

export function useB2BBroadcasts(bizId: string | undefined) {
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useQuery<any[]>({
    queryKey: ["b2b", bizId, "broadcasts"],
    queryFn: async () => {
      if (!isValidBizId) return [];
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/broadcasts?business_id=${bizId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch broadcasts: ${res.statusText}`);
      }
      const data = await res.json();
      return data.broadcasts || [];
    },
    enabled: isValidBizId,
  });
}

export function usePublishBroadcastMutation(bizId: string | undefined) {
  const queryClient = useQueryClient();
  const isValidBizId = Boolean(bizId && bizId !== "default" && bizId.trim() !== "");

  return useMutation({
    mutationFn: async (broadcast: any) => {
      if (!isValidBizId) {
        throw new Error("Cannot publish broadcast: valid business context required");
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/b2b/broadcasts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...broadcast,
          business_id: bizId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to publish broadcast");
      }
      return res.json();
    },
    onSuccess: () => {
      if (bizId) {
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "broadcasts"] });
        queryClient.invalidateQueries({ queryKey: ["b2b", bizId, "workspace"] });
      }
    },
  });
}
