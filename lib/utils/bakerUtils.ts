/**
 * Baker Mode Shared Helpers & Typography Formatters
 */

/**
 * Smart formatting for Cafe / Store names.
 * Ensures acronyms like BFT, OMR, ECR, GST are uppercase,
 * and all words are capitalized properly with premium typography handling.
 * Example: "bft mambakkam" -> "BFT Mambakkam", "bft omr" -> "BFT OMR"
 */
export function formatCafeName(str: string): string {
  if (!str) return "";
  const acronyms = new Set(["bft", "omr", "ecr", "gst", "pos", "hq", "iit", "tcs", "cts", "b2b"]);
  return str
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      // Check if word or cleaned word matches an acronym
      const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (acronyms.has(clean)) {
        return word.toUpperCase();
      }
      // Handle hyphenated words like "Tea-Navalur"
      if (word.includes("-")) {
        return word
          .split("-")
          .map((w) => {
            const c = w.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (acronyms.has(c)) return w.toUpperCase();
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          })
          .join("-");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Capitalize item / product names cleanly.
 */
export function capitalizeWords(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export interface BakerCustomerStore {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  business_id?: string;
}

/**
 * Default sample B2B customer shops for a bakery business.
 * Distinct from SeyalPro platform accounts.
 */
export const DEFAULT_BAKER_SAMPLE_STORES: BakerCustomerStore[] = [
  { id: "cust-chai", name: "Chai Galli Cafe", phone: "+91 91234 56789", address: "Thoraipakkam, Chennai" },
  { id: "cust-corner", name: "The Corner Roast", phone: "+91 99887 76655", address: "Sholinganallur, Chennai" },
];

/**
 * Validates baker customer store objects and ensures valid name and id.
 * Preserves user-linked stores (including BFT Navalur and other SeyalPro partners).
 */
export function sanitizeBakerStores(stores: any[]): BakerCustomerStore[] {
  if (!Array.isArray(stores)) return [];
  return stores.filter((s) => {
    if (!s || typeof s !== "object") return false;
    if (!s.id || !s.name || !String(s.name).trim()) return false;
    return true;
  });
}

