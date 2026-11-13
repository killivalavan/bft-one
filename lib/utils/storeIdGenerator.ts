/**
 * Store Reference ID & Prefix-Based Employee Login ID Utilities
 *
 * Generates brand-derived Store Reference IDs (e.g., BFT32523, CK2342, TW4819)
 * and resolves prefix-based Employee Login IDs (e.g., ck10121997) to store-scoped
 * Supabase Auth identities without exposing long internal email domains.
 */

const FILLER_WORDS = new Set(["the", "and", "of", "for", "in", "at", "by", "to", "a", "an"]);

const COMPOUND_SUFFIXES = [
  "walea",
  "wale",
  "wala",
  "house",
  "world",
  "point",
  "corner",
  "station",
  "palace",
  "garden",
  "express",
  "bakery",
  "bakes",
  "kings",
  "king",
  "queen",
  "court",
  "store",
  "shop",
  "cafe",
  "mart",
  "club",
  "zone",
  "spot",
  "time",
  "land",
  "villa",
  "hub",
  "bar",
  "hut",
  "box",
  "pot",
  "cup",
  "leaf",
  "bean",
  "brew",
];

/**
 * Extracts a concise 2-4 letter uppercase prefix from a store/business name.
 *
 * Examples:
 * - "Brown Fening Tea" -> "BFT"
 * - "Chai Kings"       -> "CK"
 * - "Teawalea"         -> "TW"
 * - "Starbucks"        -> "STB"
 */
export function extractStorePrefix(businessName: string): string {
  const raw = (businessName || "").trim();
  if (!raw) return "ST";

  // 1. Split on whitespace, hyphens, underscores, or camelCase boundaries
  const spaceWords = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (spaceWords.length >= 2) {
    const meaningful = spaceWords.filter((w) => !FILLER_WORDS.has(w.toLowerCase()));
    const words = meaningful.length >= 2 ? meaningful : spaceWords;
    const initials = words
      .slice(0, 4)
      .map((w) => w[0].toUpperCase())
      .join("");
    if (initials.length >= 2) return initials;
  }

  // 2. Single-word name without spaces: check known compound suffixes (e.g. "Teawalea" -> "Tea" + "walea" -> "TW")
  const single = (spaceWords[0] || raw.replace(/[^a-zA-Z0-9]/g, "")).toLowerCase();
  if (!single) return "ST";

  for (const suffix of COMPOUND_SUFFIXES) {
    const idx = single.indexOf(suffix);
    if (idx >= 2) {
      return (single[0] + suffix[0]).toUpperCase();
    }
  }

  // 3. Standard single-word fallback: first letter + next 1-2 consonants
  const lettersOnly = single.replace(/[^a-z]/g, "");
  if (lettersOnly.length <= 3) {
    return lettersOnly.toUpperCase() || "ST";
  }

  const consonants = lettersOnly
    .slice(1)
    .split("")
    .filter((ch) => !"aeiou".includes(ch));

  const prefix = (lettersOnly[0] + consonants.slice(0, 2).join("")).toUpperCase();
  if (prefix.length >= 2) return prefix;

  return lettersOnly.slice(0, 3).toUpperCase();
}

/**
 * Normalizes a custom or generated prefix to 2-5 uppercase alphanumeric characters.
 */
export function normalizeStorePrefix(prefix: string): string {
  const cleaned = (prefix || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
  return cleaned || "ST";
}

/**
 * Generates a Store Reference ID (e.g. "BFT32523", "CK2342").
 */
export function generateStoreReferenceId(
  businessName: string,
  customPrefix?: string
): { prefix: string; storeId: string } {
  const prefix = customPrefix
    ? normalizeStorePrefix(customPrefix)
    : extractStorePrefix(businessName);

  // 5-digit random number between 10000 and 99999
  const num = Math.floor(10000 + Math.random() * 90000);
  return {
    prefix,
    storeId: `${prefix}${num}`,
  };
}

/**
 * Deterministic 5-digit fallback code from a UUID/string for legacy businesses
 * that were created before `store_id` was persisted.
 */
function deterministicNumericSuffix(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const num = 10000 + (hash % 90000);
  return String(num);
}

/**
 * Resolves the Store Reference ID and lowercase employee prefix for any business object.
 */
export function getBusinessStoreId(
  business:
    | {
        id?: string | null;
        name?: string | null;
        slug?: string | null;
        store_id?: string | null;
        store_prefix?: string | null;
        enabled_modules?: Record<string, any> | null;
      }
    | null
    | undefined
): { storeId: string; prefix: string; employeePrefix: string } {
  if (!business) {
    return { storeId: "", prefix: "", employeePrefix: "" };
  }

  const storedPrefix =
    business.store_prefix || business.enabled_modules?.store_prefix || "";
  const storedId =
    business.store_id || business.enabled_modules?.store_id || "";

  const prefix = storedPrefix
    ? normalizeStorePrefix(String(storedPrefix))
    : extractStorePrefix(business.name || business.slug || "Store");

  const storeId = storedId
    ? String(storedId).toUpperCase().trim()
    : `${prefix}${deterministicNumericSuffix(business.id || business.slug || business.name || "default")}`;

  return {
    storeId,
    prefix,
    employeePrefix: prefix.toLowerCase(),
  };
}

/**
 * Formats an employee login ID with the store prefix (e.g. prefix "ck" + "10121997" -> "ck10121997").
 * Avoids double-prefixing if the user already typed the prefix.
 */
export function formatEmployeeLoginId(prefix: string, suffixOrFullId: string): string {
  const cleanPrefix = (prefix || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanInput = (suffixOrFullId || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");

  if (!cleanInput) return cleanPrefix;
  if (!cleanPrefix) return cleanInput;

  if (cleanInput.startsWith(cleanPrefix)) {
    return cleanInput;
  }
  return `${cleanPrefix}${cleanInput}`;
}

/**
 * Converts a DOB string (YYYY-MM-DD from <input type="date"> or DD/MM/YYYY)
 * into DDMMYYYY digits (e.g., "1997-12-10" -> "10121997").
 */
export function formatDobDigits(dob: string): string {
  const trimmed = (dob || "").trim();
  if (!trimmed) return "";

  // Handle YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[3]}${isoMatch[2]}${isoMatch[1]}`;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    return `${dmyMatch[1]}${dmyMatch[2]}${dmyMatch[3]}`;
  }

  return trimmed.replace(/[^0-9]/g, "");
}

/**
 * Checks whether an email is an internal synthetic tenant auth email.
 */
export function isInternalTenantEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim().endsWith(".internal");
}

/**
 * Validates a username / employee login ID (no @ symbol, alphanumeric + . _ -).
 */
export function isValidEmployeeLoginId(id: string): boolean {
  const trimmed = (id || "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,48}$/.test(trimmed);
}

/**
 * Resolves a login identifier (either a full email OR a prefixed employee ID like "ck10121997")
 * into the Supabase Auth email for the current tenant workspace.
 */
export function resolveLoginIdentifierToEmail(
  identifier: string,
  tenantSlug?: string | null
): string {
  const trimmed = (identifier || "").toLowerCase().trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed;

  const cleanSlug = (tenantSlug || "default")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "");

  return `${trimmed}@${cleanSlug || "default"}.internal`;
}

/**
 * Formats a user identifier for display in UI lists, sidebars, and payslips.
 * Strips internal synthetic domain suffixes (e.g., "ck10121997@chai-kings.internal" -> "ck10121997").
 */
export function formatDisplayUserIdentifier(
  email?: string | null,
  employeeId?: string | null
): string {
  if (email && isInternalTenantEmail(email)) {
    return email.split("@")[0];
  }
  if (employeeId?.trim()) {
    return employeeId.trim();
  }
  return email || "";
}

