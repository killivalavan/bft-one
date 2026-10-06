export interface ShopGeofence {
  lat: number;
  lng: number;
  radius: number;
  enabled: boolean;
  name: string;
}

export function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolves the shop's exact physical coordinates with full fallback cascade:
 * 1. Explicit admin configured shop location (bftone_shop_location in localStorage)
 * 2. Active tenant extra cache (bftone_tenant_extra_{id} or bftone_tenant_cache)
 * 3. In-memory business tenant profile
 * 4. Fallback defaults (12.8439, 80.2268)
 */
export function getShopGeofence(business?: any): ShopGeofence {
  let lat: number | null = null;
  let lng: number | null = null;
  let radius: number | null = null;
  let enabled = true;
  let name = business?.name || "Brown Fening Tea - Navalur";

  if (typeof window !== "undefined") {
    try {
      // 1. Explicit shop location set in Admin Store Settings
      const shopLocStr = localStorage.getItem("bftone_shop_location");
      if (shopLocStr) {
        const s = JSON.parse(shopLocStr);
        if (s.lat !== null && s.lat !== undefined && !isNaN(Number(s.lat))) lat = Number(s.lat);
        if (s.lng !== null && s.lng !== undefined && !isNaN(Number(s.lng))) lng = Number(s.lng);
        if (s.radius && !isNaN(Number(s.radius))) radius = Number(s.radius);
        if (s.enabled !== undefined) enabled = !!s.enabled;
        if (s.name) name = s.name;
      }

      // 2. Tenant extra storage
      if ((lat === null || lng === null) && business?.id) {
        const extraStr = localStorage.getItem(`bftone_tenant_extra_${business.id}`);
        if (extraStr) {
          const e = JSON.parse(extraStr);
          if (lat === null && e.geofence_lat !== null && e.geofence_lat !== undefined && !isNaN(Number(e.geofence_lat))) {
            lat = Number(e.geofence_lat);
          }
          if (lng === null && e.geofence_lng !== null && e.geofence_lng !== undefined && !isNaN(Number(e.geofence_lng))) {
            lng = Number(e.geofence_lng);
          }
          if (radius === null && e.geofence_radius_meters && !isNaN(Number(e.geofence_radius_meters))) {
            radius = Number(e.geofence_radius_meters);
          }
          if (e.geofence_enabled !== undefined) enabled = !!e.geofence_enabled;
          if (e.name) name = e.name;
        }
      }

      // 3. Tenant cache storage
      if (lat === null || lng === null) {
        const cacheStr = localStorage.getItem("bftone_tenant_cache");
        if (cacheStr) {
          const c = JSON.parse(cacheStr);
          if (lat === null && c.geofence_lat !== null && c.geofence_lat !== undefined && !isNaN(Number(c.geofence_lat))) {
            lat = Number(c.geofence_lat);
          }
          if (lng === null && c.geofence_lng !== null && c.geofence_lng !== undefined && !isNaN(Number(c.geofence_lng))) {
            lng = Number(c.geofence_lng);
          }
          if (radius === null && c.geofence_radius_meters && !isNaN(Number(c.geofence_radius_meters))) {
            radius = Number(c.geofence_radius_meters);
          }
          if (c.geofence_enabled !== undefined) enabled = !!c.geofence_enabled;
          if (c.name) name = c.name;
        }
      }
    } catch {}
  }

  // 4. In-memory business object from context
  if (lat === null && business?.geofence_lat !== null && business?.geofence_lat !== undefined && !isNaN(Number(business.geofence_lat))) {
    lat = Number(business.geofence_lat);
  }
  if (lng === null && business?.geofence_lng !== null && business?.geofence_lng !== undefined && !isNaN(Number(business.geofence_lng))) {
    lng = Number(business.geofence_lng);
  }
  if (radius === null && business?.geofence_radius_meters && !isNaN(Number(business.geofence_radius_meters))) {
    radius = Number(business.geofence_radius_meters);
  }
  if (business?.geofence_enabled !== undefined) {
    enabled = !!business.geofence_enabled;
  }

  // 5. Environmental fallback or default
  return {
    lat: lat !== null && !isNaN(lat) ? lat : Number(process.env.NEXT_PUBLIC_GEOFENCE_LAT ?? 12.8439),
    lng: lng !== null && !isNaN(lng) ? lng : Number(process.env.NEXT_PUBLIC_GEOFENCE_LNG ?? 80.2268),
    radius: radius !== null && !isNaN(radius) ? radius : Number(process.env.NEXT_PUBLIC_GEOFENCE_RADIUS_METERS ?? 150),
    enabled,
    name,
  };
}

/**
 * Saves and broadcasts new shop coordinates across localStorage, tenant caches, and active views
 */
export function saveShopGeofence(config: {
  lat: number;
  lng: number;
  radius?: number;
  enabled?: boolean;
  name?: string;
  address?: string;
  businessId?: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      lat: Number(config.lat),
      lng: Number(config.lng),
      radius: config.radius ? Number(config.radius) : 150,
      enabled: config.enabled !== undefined ? Boolean(config.enabled) : true,
      name: config.name || "Brown Fening Tea - Navalur",
      address: config.address || "",
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem("bftone_shop_location", JSON.stringify(payload));

    if (config.businessId) {
      const extraKey = `bftone_tenant_extra_${config.businessId}`;
      const existing = localStorage.getItem(extraKey);
      const parsed = existing ? JSON.parse(existing) : {};
      localStorage.setItem(
        extraKey,
        JSON.stringify({
          ...parsed,
          geofence_lat: payload.lat,
          geofence_lng: payload.lng,
          geofence_radius_meters: payload.radius,
          geofence_enabled: payload.enabled,
        })
      );
    }

    const cache = localStorage.getItem("bftone_tenant_cache");
    if (cache) {
      const parsedCache = JSON.parse(cache);
      localStorage.setItem(
        "bftone_tenant_cache",
        JSON.stringify({
          ...parsedCache,
          geofence_lat: payload.lat,
          geofence_lng: payload.lng,
          geofence_radius_meters: payload.radius,
          geofence_enabled: payload.enabled,
        })
      );
    }

    window.dispatchEvent(new CustomEvent("bftone_shop_location_updated", { detail: payload }));
  } catch (err) {
    console.warn("saveShopGeofence error:", err);
  }
}

/**
 * Flexible parser for manual input, Google Maps query URLs, and coordinate pairs
 */
export function parseCoordinatesInput(input: string): { lat: number; lng: number } | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Pattern 1: URL with @lat,lng or ?q=lat,lng or ?q=loc:lat,lng
  const urlMatch = trimmed.match(/[@?&]q?=?loc:?(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lng = parseFloat(urlMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // Pattern 2: Raw comma or whitespace separated "lat, lng" or "lat lng"
  const rawMatch = trimmed.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lng = parseFloat(rawMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export function isWithinGeofence(
  lat: number,
  lng: number,
  customCenterLat?: number | null,
  customCenterLng?: number | null,
  customRadius?: number | null
) {
  const centerLat = Number(
    customCenterLat ?? process.env.NEXT_PUBLIC_GEOFENCE_LAT ?? 12.8439
  );
  const centerLng = Number(
    customCenterLng ?? process.env.NEXT_PUBLIC_GEOFENCE_LNG ?? 80.2268
  );
  const radius = Number(
    customRadius ?? process.env.NEXT_PUBLIC_GEOFENCE_RADIUS_METERS ?? 150
  );
  const d = metersBetween(lat, lng, centerLat, centerLng);
  return d <= radius;
}

