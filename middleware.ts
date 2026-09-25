import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Root domains where subdomains should be extracted.
// Add your custom domain here after setting it up in Vercel.
const ROOT_DOMAINS = [
  "seyalpro.in",
  "www.seyalpro.in",
  "seyalpro.com",
  "www.seyalpro.com",
  "bft-one.vercel.app",
  "bftone.com",
  "www.bftone.com",
  "localhost",
];

function extractSubdomain(hostname: string): string | null {
  // Remove port (e.g. localhost:3000 → localhost)
  const cleanHost = hostname.split(":")[0].toLowerCase();

  // Check each root domain to see if the hostname is a subdomain of it
  for (const root of ROOT_DOMAINS) {
    const rootClean = root.split(":")[0].toLowerCase();

    // E.g. hostname = "navalur.seyalpro.in", root = "seyalpro.in"
    if (cleanHost.endsWith("." + rootClean)) {
      const sub = cleanHost.slice(0, -(rootClean.length + 1)); // "navalur"
      if (sub && sub !== "www" && sub !== "app") {
        return sub;
      }
    }
  }

  return null;
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  // Vercel sets x-forwarded-host in production; fall back to host header
  const hostname = request.headers.get("x-forwarded-host")
    || request.headers.get("host")
    || "";

  const subdomain = extractSubdomain(hostname);
  const queryTenant = url.searchParams.get("tenant");

  // 1. Resolve Tenant Slug (priority: query > cookie > subdomain > default)
  let tenantSlug = "bft-navalur"; // default tenant
  let source: "query" | "cookie" | "subdomain" | "default" = "default";

  // Priority 1: URL query param override (?tenant=mongo-s)
  if (queryTenant) {
    tenantSlug = queryTenant.toLowerCase().trim();
    source = "query";
  } else {
    // Priority 2: Existing cookie
    const cookieTenant = request.cookies.get("tenant_slug")?.value;
    if (cookieTenant) {
      tenantSlug = cookieTenant;
      source = "cookie";
    } else {
      // Priority 3: Extract from subdomain (e.g. navalur.bftone.com → navalur)
      const subdomain = extractSubdomain(hostname);
      if (subdomain) {
        tenantSlug = subdomain;
        source = "subdomain";
      }
    }
  }

  // 2. Clone request headers and inject tenant metadata
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-slug", tenantSlug);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Persist tenant cookie when resolved from query OR subdomain
  // (so subsequent navigations within the same session stay on the right tenant)
  if (source === "query" || source === "subdomain") {
    response.cookies.set("tenant_slug", tenantSlug, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
    });
  }

  // 3. Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("x-tenant-slug", tenantSlug);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (.png, .jpg, .svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
