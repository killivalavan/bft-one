import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { HostnameResolutionOptions } from "./lib/tenant/hostnameResolver.ts";
import { evaluateWildcardTenantRoute } from "./lib/tenant/wildcardRouter.ts";

function applyDecisionHeadersAndCookies(
  response: NextResponse,
  responseHeaders: Record<string, string>,
  deleteLegacyTenantCookie: boolean
): NextResponse {
  for (const [key, value] of Object.entries(responseHeaders)) {
    response.headers.set(key, value);
  }
  if (deleteLegacyTenantCookie) {
    response.cookies.delete("tenant_slug");
  }
  return response;
}

export function middleware(
  request: NextRequest,
  options?: HostnameResolutionOptions
) {
  const decision = evaluateWildcardTenantRoute({
    url: request.nextUrl,
    headers: request.headers,
    hasLegacyTenantCookie: request.cookies.has("tenant_slug"),
    options,
  });

  if (decision.action === "redirect" && decision.location) {
    const redirectRes = NextResponse.redirect(
      decision.location,
      decision.status
    );
    return applyDecisionHeadersAndCookies(
      redirectRes,
      decision.responseHeaders,
      decision.deleteLegacyTenantCookie
    );
  }

  if (decision.action === "rewrite" && decision.rewritePathname) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = decision.rewritePathname;
    rewriteUrl.search = "";
    const rewriteRes = NextResponse.rewrite(rewriteUrl, {
      status: decision.status,
      request: {
        headers: decision.sanitizedRequestHeaders,
      },
    });
    return applyDecisionHeadersAndCookies(
      rewriteRes,
      decision.responseHeaders,
      decision.deleteLegacyTenantCookie
    );
  }

  if (decision.action === "json_error" && decision.jsonBody) {
    const jsonRes = NextResponse.json(decision.jsonBody, {
      status: decision.status,
    });
    return applyDecisionHeadersAndCookies(
      jsonRes,
      decision.responseHeaders,
      decision.deleteLegacyTenantCookie
    );
  }

  const nextRes = NextResponse.next({
    request: {
      headers: decision.sanitizedRequestHeaders,
    },
  });

  return applyDecisionHeadersAndCookies(
    nextRes,
    decision.responseHeaders,
    decision.deleteLegacyTenantCookie
  );
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
