export interface ShopGeofence {
  lat: number;
  lng: number;
  radius: number;
  enabled: boolean;
  name: string;
  configured: boolean;
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
 * Resolves the shop's exact physical coordinates strictly scoped to the active tenant/business:
 * 1. Primary Source of Truth: Active database profile for this business (`business.geofence_lat`, `business.geofence_lng`)
 * 2. Tenant-scoped offline storage (`bftone_shop_location_${business.id}` or `bftone_tenant_extra_${business.id}`)
 * 3. Default fallback only for root template business (Navalur)
 */
export function getShopGeofence(business?: any): ShopGeofence {
  const bizId = business?.id;
  let lat: number | null = null;
  let lng: number | null = null;
  let radius: number | null = null;
  let enabled = business?.geofence_enabled !== false;
  let name = business?.name || "Store";
  let configured = false;

  // 1. Direct from business record in DB (Primary source of truth)
  if (
    business?.geofence_lat !== null &&
    business?.geofence_lat !== undefined &&
    !isNaN(Number(business.geofence_lat))
  ) {
    lat = Number(business.geofence_lat);
    configured = true;
  }
  if (
    business?.geofence_lng !== null &&
    business?.geofence_lng !== undefined &&
    !isNaN(Number(business.geofence_lng))
  ) {
    lng = Number(business.geofence_lng);
  }
  if (
    business?.geofence_radius_meters !== null &&
    business?.geofence_radius_meters !== undefined &&
    !isNaN(Number(business.geofence_radius_meters))
  ) {
    radius = Number(business.geofence_radius_meters);
  }

  // 2. Tenant-scoped local storage check if not yet loaded into business memory
  if ((lat === null || lng === null) && typeof window !== "undefined" && bizId) {
    try {
      // Scoped shop location for this exact business
      const scopedLocStr = localStorage.getItem(`bftone_shop_location_${bizId}`);
      if (scopedLocStr) {
        const s = JSON.parse(scopedLocStr);
        if (s.lat !== null && s.lat !== undefined && !isNaN(Number(s.lat))) {
          lat = Number(s.lat);
          configured = true;
        }
        if (s.lng !== null && s.lng !== undefined && !isNaN(Number(s.lng))) lng = Number(s.lng);
        if (s.radius && !isNaN(Number(s.radius))) radius = Number(s.radius);
        if (s.enabled !== undefined) enabled = !!s.enabled;
        if (s.name) name = s.name;
      }

      // Scoped tenant extra
      if (lat === null || lng === null) {
        const extraStr = localStorage.getItem(`bftone_tenant_extra_${bizId}`);
        if (extraStr) {
          const e = JSON.parse(extraStr);
          if (e.geofence_lat !== null && e.geofence_lat !== undefined && !isNaN(Number(e.geofence_lat))) {
            lat = Number(e.geofence_lat);
            configured = true;
          }
          if (e.geofence_lng !== null && e.geofence_lng !== undefined && !isNaN(Number(e.geofence_lng))) lng = Number(e.geofence_lng);
          if (e.geofence_radius_meters && !isNaN(Number(e.geofence_radius_meters))) radius = Number(e.geofence_radius_meters);
          if (e.geofence_enabled !== undefined) enabled = !!e.geofence_enabled;
          if (e.name) name = e.name;
        }
      }

      // Legacy global check ONLY if businessId explicitly matches this business
      if (lat === null || lng === null) {
        const legacyStr = localStorage.getItem("bftone_shop_location");
        if (legacyStr) {
          const l = JSON.parse(legacyStr);
          if (l.businessId && l.businessId === bizId) {
            if (l.lat !== null && l.lat !== undefined && !isNaN(Number(l.lat))) {
              lat = Number(l.lat);
              configured = true;
            }
            if (l.lng !== null && l.lng !== undefined && !isNaN(Number(l.lng))) lng = Number(l.lng);
            if (l.radius && !isNaN(Number(l.radius))) radius = Number(l.radius);
            if (l.enabled !== undefined) enabled = !!l.enabled;
            if (l.name) name = l.name;
          }
        }
      }
    } catch {}
  }

  // 3. Fallback resolution:
  // Root BFT template business defaults to Navalur, Chennai (12.8439, 80.2268)
  const isDefaultRootTenant = !bizId || bizId === "a0000000-0000-0000-0000-000000000001";
  const hasValidCoords = lat !== null && !isNaN(lat) && lng !== null && !isNaN(lng);

  const finalLat = hasValidCoords ? lat! : (isDefaultRootTenant ? 12.8439 : 0);
  const finalLng = hasValidCoords ? lng! : (isDefaultRootTenant ? 80.2268 : 0);
  const finalRadius = radius !== null && !isNaN(radius) ? radius : 150;
  const isConfigured = hasValidCoords || (isDefaultRootTenant && configured);

  return {
    lat: finalLat,
    lng: finalLng,
    radius: finalRadius,
    enabled,
    name,
    configured: isConfigured,
  };
}

/**
 * Saves and broadcasts new shop coordinates scoped to the specific business
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
      name: config.name || "Store",
      address: config.address || "",
      businessId: config.businessId,
      updatedAt: new Date().toISOString(),
    };

    if (config.businessId) {
      // 1. Scoped to this business
      localStorage.setItem(`bftone_shop_location_${config.businessId}`, JSON.stringify(payload));
      localStorage.setItem("bftone_shop_location", JSON.stringify(payload));

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

