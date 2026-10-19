import { NextResponse } from "next/server";
import { parseCoordinatesInput } from "@/lib/geofence";
import { authenticateRequest } from "@/lib/auth/serverAuth";

function isSafeGoogleMapsUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:") return false;

    const hostname = parsed.hostname.toLowerCase();

    // Whitelist only legitimate Google Maps hosts
    const allowedHosts = [
      "maps.google.com",
      "maps.app.goo.gl",
      "goo.gl",
      "www.google.com",
      "google.com",
    ];

    if (!allowedHosts.includes(hostname)) {
      return false;
    }

    if ((hostname === "google.com" || hostname === "www.google.com" || hostname === "goo.gl") && !parsed.pathname.startsWith("/maps")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const trimmed = url.trim();

    // 1. Direct parse check (e.g. coordinates already in query or path)
    const directParsed = parseCoordinatesInput(trimmed);
    if (directParsed) {
      return NextResponse.json({ success: true, ...directParsed });
    }

    // 2. Fetch with redirect follow strictly for verified Google Maps URLs
    let targetUrl = trimmed;
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }

    // SSRF Prevention: Enforce HTTPS and strict domain whitelisting
    if (!isSafeGoogleMapsUrl(targetUrl)) {
      return NextResponse.json(
        { error: "Invalid link. Please provide a valid Google Maps URL (e.g. https://maps.app.goo.gl/... or https://maps.google.com/...)." },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(targetUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const finalUrl = response.url;
      if (finalUrl) {
        if (!isSafeGoogleMapsUrl(finalUrl)) {
          return NextResponse.json(
            { error: "Resolved URL redirected outside allowed Google Maps domains." },
            { status: 400 }
          );
        }

        const parsedFromFinal = parseCoordinatesInput(finalUrl);
        if (parsedFromFinal) {
          return NextResponse.json({ success: true, ...parsedFromFinal });
        }
      }

      // 3. Inspect response HTML body (capped at 100KB to prevent memory exhaustion)
      const rawText = await response.text();
      const html = rawText.slice(0, 100000);

      // Check meta tags or static map URLs
      // e.g. center=12.8439%2C80.2268 or center=12.8439,80.2268
      const centerMatch = html.match(
        /center=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i
      );
      if (centerMatch) {
        const lat = parseFloat(centerMatch[1]);
        const lng = parseFloat(centerMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
          return NextResponse.json({ success: true, lat, lng });
        }
      }

      // Check APP_INITIALIZATION_STATE coordinates: [null,null,lat,lng]
      const stateMatch = html.match(
        /\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/
      );
      if (stateMatch) {
        const lat = parseFloat(stateMatch[1]);
        const lng = parseFloat(stateMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
          return NextResponse.json({ success: true, lat, lng });
        }
      }

      // Check place coordinates in HTML data
      const placeMatch = html.match(/!3d(-?\d+(?:\.\d+)?)/);
      const placeMatch4d = html.match(/!4d(-?\d+(?:\.\d+)?)/);
      if (placeMatch && placeMatch4d) {
        const lat = parseFloat(placeMatch[1]);
        const lng = parseFloat(placeMatch4d[1]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
          return NextResponse.json({ success: true, lat, lng });
        }
      }

      // Check any @lat,lng in HTML
      const atMatch = html.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
      if (atMatch) {
        const lat = parseFloat(atMatch[1]);
        const lng = parseFloat(atMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
          return NextResponse.json({ success: true, lat, lng });
        }
      }
    } catch (fetchErr) {
      console.warn("Failed to fetch maps URL for redirect resolution:", fetchErr);
    }

    return NextResponse.json(
      { error: "Could not find coordinates in the provided link" },
      { status: 422 }
    );
  } catch (error: any) {
    console.error("resolve-maps-url error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to resolve Google Maps link" },
      { status: 500 }
    );
  }
}
