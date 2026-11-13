/**
 * Builds links between the three CounterCub hosts for the current environment.
 *
 * - Production: www.countercub.com / app.countercub.com / <slug>.countercub.com (https)
 * - Local dev:  localhost:PORT     / app.localhost:PORT / <slug>.localhost:PORT  (http)
 *
 * `location` defaults to `window.location`; pass one explicitly for server code or tests.
 */

import { CANONICAL_ROOT_DOMAIN } from "./hostnameResolver.ts";

export interface HostLocation {
  hostname: string;
  port?: string;
}

function currentLocation(location?: HostLocation): HostLocation | null {
  if (location) return location;
  if (typeof window === "undefined") return null;
  return { hostname: window.location.hostname, port: window.location.port };
}

export function isLocalDevHost(location?: HostLocation): boolean {
  const loc = currentLocation(location);
  if (!loc) return false;
  const host = loc.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

function buildUrl(subdomain: string | null, path: string, location?: HostLocation): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const loc = currentLocation(location);
  if (loc && isLocalDevHost(loc)) {
    const port = loc.port ? `:${loc.port}` : "";
    const host = subdomain ? `${subdomain}.localhost` : "localhost";
    return `http://${host}${port}${normalizedPath}`;
  }
  const host = subdomain
    ? `${subdomain}.${CANONICAL_ROOT_DOMAIN}`
    : `www.${CANONICAL_ROOT_DOMAIN}`;
  return `https://${host}${normalizedPath}`;
}

/** Public landing page: http://localhost:3000 | https://www.countercub.com */
export function getMarketingUrl(path = "/", location?: HostLocation): string {
  return buildUrl(null, path, location);
}

/** Super Admin dashboard: http://app.localhost:3000 | https://app.countercub.com */
export function getPlatformAdminUrl(path = "/", location?: HostLocation): string {
  return buildUrl("app", path, location);
}

/** Shop workspace: http://<slug>.localhost:3000 | https://<slug>.countercub.com */
export function getTenantUrl(slug: string, path = "/", location?: HostLocation): string {
  return buildUrl(slug.trim().toLowerCase(), path, location);
}

