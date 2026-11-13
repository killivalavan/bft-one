/**
 * CounterCub — Authoritative Tenant Slug Validation Module
 *
 * Enforces strict RFC 1123 / DNS-safe subdomain label rules, prevents IDN/Punycode
 * spoofing (`xn--`), blocks reserved platform/infrastructure subdomains, and keeps
 * API validation aligned with PostgreSQL constraints (`businesses_slug_format_chk`).
 */

export const MIN_TENANT_SLUG_LENGTH = 3;
export const MAX_TENANT_SLUG_LENGTH = 63;

/**
 * Matches lowercase ASCII alphanumeric labels of 3..63 chars that start and end
 * with an alphanumeric character and contain only `[a-z0-9-]` in between.
 */
export const TENANT_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * Authoritative list of reserved system, infrastructure, protocol, and brand
 * subdomains that can never be registered or resolved as a customer workspace.
 */
export const RESERVED_TENANT_SLUGS: ReadonlySet<string> = new Set([
  // Core routing & platform subdomains
  "www",
  "app",
  "api",
  "admin",
  "super-admin",
  "superadmin",
  "platform",
  "console",
  "manage",
  "management",
  "control",
  "hq",

  // Auth & account lifecycle
  "auth",
  "login",
  "logout",
  "signin",
  "signup",
  "register",
  "onboarding",
  "verify",
  "reset",
  "password",
  "mfa",
  "sso",
  "oauth",
  "id",
  "identity",
  "session",

  // Application functional paths / modules
  "dashboard",
  "pos",
  "billing",
  "invoices",
  "inventory",
  "expenses",
  "analytics",
  "reports",
  "b2b",
  "baker",
  "employees",
  "payroll",
  "payslips",
  "settings",
  "profile",
  "profiles",
  "user",
  "users",
  "account",
  "accounts",
  "workspace",
  "workspaces",
  "tenant",
  "tenants",
  "shop",
  "shops",
  "store",
  "stores",
  "client",
  "clients",
  "customer",
  "customers",
  "vendor",
  "vendors",
  "supplier",
  "suppliers",
  "portal",

  // Support, docs, marketing & legal
  "support",
  "help",
  "helpdesk",
  "status",
  "docs",
  "documentation",
  "developer",
  "developers",
  "blog",
  "news",
  "press",
  "careers",
  "jobs",
  "about",
  "contact",
  "pricing",
  "plans",
  "enterprise",
  "partner",
  "partners",
  "affiliate",
  "affiliates",
  "legal",
  "terms",
  "privacy",
  "security",
  "compliance",
  "trust",

  // Infrastructure, networking, email & protocols
  "mail",
  "email",
  "webmail",
  "smtp",
  "imap",
  "pop",
  "pop3",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "ns3",
  "ns4",
  "dns",
  "ftp",
  "sftp",
  "ssh",
  "vpn",
  "proxy",
  "gateway",
  "edge",
  "cdn",
  "assets",
  "static",
  "media",
  "images",
  "img",
  "files",
  "storage",
  "uploads",
  "downloads",
  "backup",
  "backups",
  "webhook",
  "webhooks",
  "ws",
  "wss",
  "realtime",
  "socket",
  "graphql",
  "rest",
  "rpc",
  "health",
  "metrics",
  "monitor",
  "monitoring",
  "telemetry",
  "logs",
  "audit",
  "autoconfig",
  "autodiscover",
  "cpanel",
  "whm",
  "localhost",
  "local",
  "internal",
  "intranet",
  "system",
  "root",

  // Programming / sentinel tokens
  "null",
  "undefined",
  "none",
  "nil",
  "true",
  "false",
  "default",
  "unknown",
  "anonymous",
  "public",
  "private",

  // Environments
  "prod",
  "production",
  "stage",
  "staging",
  "uat",
  "qa",
  "dev",
  "development",
  "test",
  "testing",
  "demo",
  "sandbox",
  "preview",
  "beta",
  "alpha",
  "canary",

  // Brand & vendor names
  "countercub",
  "counter-cub",
  "seyalpro",
  "seyal-pro",
  "seyal",
  "bftone",
  "bft-one",
  "vercel",
  "supabase",
  "postgres",
  "postgresql",
  "stripe",
  "razorpay",
]);

export type SlugValidationErrorCode =
  | "SLUG_REQUIRED"
  | "SLUG_TOO_SHORT"
  | "SLUG_TOO_LONG"
  | "SLUG_CONSECUTIVE_HYPHENS"
  | "SLUG_NUMERIC_ONLY"
  | "SLUG_INVALID_FORMAT"
  | "SLUG_RESERVED";

export interface SlugValidationResult {
  valid: boolean;
  normalizedSlug: string;
  code?: SlugValidationErrorCode;
  error?: string;
}

/**
 * Normalizes case and outer whitespace without silently masking invalid characters.
 */
export function normalizeTenantSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

/**
 * Converts a display business name or rough input into a DNS-safe candidate slug
 * for UI suggestions. Call `validateTenantSlug` on the final value before persisting.
 */
export function sanitizeSlugCandidate(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TENANT_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * Checks whether a normalized slug is in the reserved system subdomain set.
 */
export function isReservedTenantSlug(slug: string): boolean {
  const normalized = normalizeTenantSlug(slug);
  return RESERVED_TENANT_SLUGS.has(normalized);
}

/**
 * Authoritative validation for tenant workspace slugs.
 */
export function validateTenantSlug(raw: unknown): SlugValidationResult {
  const normalizedSlug = normalizeTenantSlug(raw);

  if (!normalizedSlug) {
    return {
      valid: false,
      normalizedSlug: "",
      code: "SLUG_REQUIRED",
      error: "Shop subdomain slug is required.",
    };
  }

  if (normalizedSlug.length < MIN_TENANT_SLUG_LENGTH) {
    return {
      valid: false,
      normalizedSlug,
      code: "SLUG_TOO_SHORT",
      error: `Shop subdomain slug must be at least ${MIN_TENANT_SLUG_LENGTH} characters long.`,
    };
  }

  if (normalizedSlug.length > MAX_TENANT_SLUG_LENGTH) {
    return {
      valid: false,
      normalizedSlug,
      code: "SLUG_TOO_LONG",
      error: `Shop subdomain slug cannot exceed ${MAX_TENANT_SLUG_LENGTH} characters.`,
    };
  }

  if (normalizedSlug.includes("--")) {
    return {
      valid: false,
      normalizedSlug,
      code: "SLUG_CONSECUTIVE_HYPHENS",
      error: "Shop subdomain slug cannot contain consecutive hyphens ('--').",
    };
  }

  if (/^\d+$/.test(normalizedSlug)) {
    return {
      valid: false,
      normalizedSlug,
      code: "SLUG_NUMERIC_ONLY",
      error: "Shop subdomain slug must include at least one letter.",
    };
  }

  if (!TENANT_SLUG_REGEX.test(normalizedSlug)) {
    return {
      valid: false,
      normalizedSlug,
      code: "SLUG_INVALID_FORMAT",
      error:
        "Shop subdomain slug may only contain lowercase letters (a-z), numbers (0-9), and single internal hyphens (-), and must start and end with a letter or number.",
    };
  }

  if (RESERVED_TENANT_SLUGS.has(normalizedSlug)) {
    return {
      valid: false,
      normalizedSlug,
      code: "SLUG_RESERVED",
      error: `The subdomain '${normalizedSlug}' is reserved for system use and cannot be assigned to a shop.`,
    };
  }

  return {
    valid: true,
    normalizedSlug,
  };
}

