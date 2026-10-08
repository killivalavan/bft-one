import { NextResponse } from "next/server";
import { parseCoordinatesInput } from "@/lib/geofence";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const trimmed = url.trim();

    // 1. Direct parse check
    const directParsed = parseCoordinatesInput(trimmed);
    if (directParsed) {
      return NextResponse.json({ success: true, ...directParsed });
    }

    // 2. Fetch with redirect follow
    let targetUrl = trimmed;
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      const response = await fetch(targetUrl, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const finalUrl = response.url;
      if (finalUrl) {
        const parsedFromFinal = parseCoordinatesInput(finalUrl);
        if (parsedFromFinal) {
          return NextResponse.json({ success: true, ...parsedFromFinal });
        }
      }

      // 3. Inspect response HTML body
      const html = await response.text();

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
