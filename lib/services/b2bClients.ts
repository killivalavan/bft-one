import { BakerCustomerStore, DEFAULT_BAKER_SAMPLE_STORES, sanitizeBakerStores } from "@/lib/utils/bakerUtils";

export const B2B_CUSTOMERS_UPDATED_EVENT = "bftone_customers_updated";

/**
 * Fetch B2B clients from server, with fallback to local storage cache.
 * Automatically synchronizes any locally-created clients to the cloud.
 */
export async function fetchB2BClients(bizId: string): Promise<BakerCustomerStore[]> {
  if (!bizId || bizId === "default") {
    return DEFAULT_BAKER_SAMPLE_STORES;
  }

  // 1. Read existing local storage cache
  let localList: BakerCustomerStore[] = [];
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(`bftone_customers_${bizId}`) : null;
    if (raw) {
      localList = sanitizeBakerStores(JSON.parse(raw));
    }
  } catch {}

  try {
    const res = await fetch(`/api/b2b/clients?business_id=${bizId}`);
    if (res.ok) {
      const data = await res.json();
      const serverClients: BakerCustomerStore[] = sanitizeBakerStores(data.clients || []);

      if (serverClients.length > 0) {
        // Server has clients: update local cache
        if (typeof window !== "undefined") {
          localStorage.setItem(`bftone_customers_${bizId}`, JSON.stringify(serverClients));
        }
        return serverClients;
      }

      // If server is empty but user had local clients, auto-sync them to the server
      if (localList.length > 0) {
        // Exclude sample stores from being forced if user only had sample stores
        const isOnlySamples =
          localList.length === DEFAULT_BAKER_SAMPLE_STORES.length &&
          localList.every((s) => DEFAULT_BAKER_SAMPLE_STORES.some((d) => d.id === s.id));

        if (!isOnlySamples) {
          // Push local custom clients to server in background
          fetch(`/api/b2b/clients`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              business_id: bizId,
              action: "sync",
              clients: localList,
            }),
          }).catch(() => {});
        }
        return localList;
      }
    }
  } catch (err) {
    console.warn("fetchB2BClients error, using local fallback:", err);
  }

  // Fallback to local or default
  return localList.length > 0 ? localList : DEFAULT_BAKER_SAMPLE_STORES;
}

/**
 * Save a newly added B2B client to server and update local storage.
 */
export async function saveB2BClient(
  bizId: string,
  client: { name: string; phone?: string; address?: string; linked_business_id?: string; id?: string }
): Promise<BakerCustomerStore> {
  const newClient: BakerCustomerStore = {
    id: client.id || `store-${Date.now()}`,
    name: client.name.trim(),
    phone: client.phone || "",
    address: client.address || "",
    business_id: client.linked_business_id || undefined,
  };

  // Immediate optimistic local storage update
  if (typeof window !== "undefined" && bizId && bizId !== "default") {
    try {
      const existingRaw = localStorage.getItem(`bftone_customers_${bizId}`);
      const existing = existingRaw ? sanitizeBakerStores(JSON.parse(existingRaw)) : [];
      const updated = [newClient, ...existing.filter((s) => s.id !== newClient.id)];
      localStorage.setItem(`bftone_customers_${bizId}`, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(B2B_CUSTOMERS_UPDATED_EVENT, { detail: { clients: updated } }));
    } catch {}
  }

  // Persist to server
  try {
    const res = await fetch(`/api/b2b/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: bizId,
        id: newClient.id,
        name: newClient.name,
        phone: newClient.phone,
        address: newClient.address,
        linked_business_id: newClient.business_id,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.client) {
        return data.client;
      }
    }
  } catch (err) {
    console.error("saveB2BClient server persistence error:", err);
  }

  return newClient;
}

/**
 * Update an existing B2B client on server and update local storage.
 */
export async function updateB2BClient(
  bizId: string,
  client: { id: string; name: string; phone?: string; address?: string; linked_business_id?: string }
): Promise<BakerCustomerStore> {
  const updatedClient: BakerCustomerStore = {
    id: client.id,
    name: client.name.trim(),
    phone: client.phone || "",
    address: client.address || "",
    business_id: client.linked_business_id || undefined,
  };

  // Optimistic local storage update
  if (typeof window !== "undefined" && bizId && bizId !== "default") {
    try {
      const existingRaw = localStorage.getItem(`bftone_customers_${bizId}`);
      const existing = existingRaw ? sanitizeBakerStores(JSON.parse(existingRaw)) : [];
      const updated = existing.map((s) => (s.id === updatedClient.id ? updatedClient : s));
      localStorage.setItem(`bftone_customers_${bizId}`, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(B2B_CUSTOMERS_UPDATED_EVENT, { detail: { clients: updated } }));
    } catch {}
  }

  // Persist to server
  try {
    await fetch(`/api/b2b/clients`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: bizId,
        id: updatedClient.id,
        name: updatedClient.name,
        phone: updatedClient.phone,
        address: updatedClient.address,
        linked_business_id: updatedClient.business_id,
      }),
    });
  } catch (err) {
    console.error("updateB2BClient server persistence error:", err);
  }

  return updatedClient;
}

/**
 * Delete a B2B client from server and update local storage.
 */
export async function deleteB2BClient(bizId: string, clientId: string): Promise<void> {
  // Optimistic local storage update
  if (typeof window !== "undefined" && bizId && bizId !== "default") {
    try {
      const existingRaw = localStorage.getItem(`bftone_customers_${bizId}`);
      const existing = existingRaw ? sanitizeBakerStores(JSON.parse(existingRaw)) : [];
      const updated = existing.filter((s) => s.id !== clientId);
      localStorage.setItem(`bftone_customers_${bizId}`, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(B2B_CUSTOMERS_UPDATED_EVENT, { detail: { clients: updated } }));
    } catch {}
  }

  // Persist to server
  try {
    await fetch(`/api/b2b/clients?business_id=${bizId}&id=${clientId}`, {
      method: "DELETE",
    });
  } catch (err) {
    console.error("deleteB2BClient server persistence error:", err);
  }
}
