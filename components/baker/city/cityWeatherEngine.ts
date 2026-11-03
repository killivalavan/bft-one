/**
 * Live Weather & Seasonal Climate Engine for 3D Supply City.
 *
 * Fetches real-time weather and daylight status for the client store location
 * via Open-Meteo (free, zero API key, no rate limits, HTTPS).
 *
 * Caches results in sessionStorage for 25 minutes so network traffic is near zero.
 * Includes instant graceful offline fallbacks and manual season preview controls.
 */

export type CityWeatherSeason =
  | "clear"
  | "hot"
  | "rain"
  | "monsoon"
  | "thunderstorm"
  | "snow"
  | "cloudy";

export interface CityLiveWeather {
  season: CityWeatherSeason;
  isNight: boolean;
  temperatureC: number;
  weatherCode: number;
  conditionLabel: string;
  cityName: string;
  precipitationMm: number;
  windSpeedKm: number;
  isAuto: boolean;
}

const CACHE_KEY = "b2b_city_live_weather_v1";
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes

interface CachedWeatherEnvelope {
  timestamp: number;
  weather: CityLiveWeather;
}

/**
 * Maps WMO Weather Interpretation Codes (0-99) and temperature to our 3D diorama seasons.
 */
export function mapWmoCodeToSeason(
  code: number,
  tempC: number,
  precipMm: number,
  snowfallCm: number
): { season: CityWeatherSeason; label: string } {
  // 1. Snow & Ice
  if (snowfallCm > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { season: "snow", label: "Winter Snow" };
  }

  // 2. Severe Thunderstorm & Lightning
  if (code >= 95) {
    return { season: "thunderstorm", label: "Thunderstorm" };
  }

  // 3. Heavy Monsoon Storm
  if (precipMm >= 5.0) {
    return { season: "monsoon", label: "Monsoon Storm" };
  }

  // 4. Rain & Showers
  if (precipMm > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { season: "rain", label: "Rain Showers" };
  }

  // 4. Overcast / Fog / Cloudy
  if (code === 1 || code === 2 || code === 3 || code === 45 || code === 48) {
    return { season: "cloudy", label: code === 3 ? "Overcast Sky" : "Partly Cloudy" };
  }

  // 5. Hot Summer / Clear
  if (tempC >= 32) {
    return { season: "hot", label: "Hot & Sunny" };
  }

  return { season: "clear", label: "Clear Sky" };
}

/**
 * Returns a fast, synchronous fallback weather snapshot based on local device time & month.
 */
export function getLocalFallbackWeather(storeCity = "Local Hub"): CityLiveWeather {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth(); // 0 = Jan, 11 = Dec
  const isNight = hour < 6 || hour >= 18;

  // Seasonal estimation by month for South Asia / India
  let season: CityWeatherSeason = "clear";
  let label = "Clear Sky";
  let tempC = 27;

  if (month >= 5 && month <= 8) {
    // Monsoon season (June - Sept)
    season = "rain";
    label = "Seasonal Rain";
    tempC = 29;
  } else if (month >= 3 && month <= 4) {
    // Summer (April - May)
    season = "hot";
    label = "Warm Sunshine";
    tempC = 34;
  } else if (month === 11 || month === 0) {
    // Winter (Dec - Jan)
    season = "clear";
    label = "Cool Breeze";
    tempC = 23;
  }

  return {
    season,
    isNight,
    temperatureC: tempC,
    weatherCode: 0,
    conditionLabel: isNight ? (season === "rain" ? "Rainy Night" : "Clear Night") : label,
    cityName: storeCity,
    precipitationMm: season === "rain" ? 1.5 : 0,
    windSpeedKm: 12,
    isAuto: true,
  };
}

/**
 * Fetches live weather from Open-Meteo based on client browser coordinates.
 * Falls back gracefully to timezone center or store profile if location is blocked.
 */
export async function fetchLiveClientWeather(storeCity = "Local Hub"): Promise<CityLiveWeather> {
  if (typeof window === "undefined") {
    return getLocalFallbackWeather(storeCity);
  }

  // 1. Check Session Storage Cache
  try {
    const cachedRaw = sessionStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      const parsed: CachedWeatherEnvelope = JSON.parse(cachedRaw);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.weather) {
        return parsed.weather;
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  // 2. Resolve Geolocation Coordinates (Fast 2.5s timeout)
  let latitude = 13.0827; // Chennai default (BFT Indian hub)
  let longitude = 80.2707;
  let resolvedCity = storeCity;

  const getPositionPromise = new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), 2500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: 2500, maximumAge: 600000 }
    );
  });

  try {
    const pos = await getPositionPromise;
    if (pos) {
      latitude = pos.lat;
      longitude = pos.lng;
    } else {
      // Approximate from browser timezone
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz.includes("Kolkata") || tz.includes("Calcutta") || tz.includes("India")) {
        latitude = 13.0827;
        longitude = 80.2707;
        resolvedCity = storeCity !== "Local Hub" ? storeCity : "Chennai";
      } else if (tz.includes("London") || tz.includes("Europe/London")) {
        latitude = 51.5072;
        longitude = -0.1276;
        resolvedCity = "London";
      } else if (tz.includes("New_York")) {
        latitude = 40.7128;
        longitude = -74.006;
        resolvedCity = "New York";
      } else if (tz.includes("Dubai")) {
        latitude = 25.2048;
        longitude = 55.2708;
        resolvedCity = "Dubai";
      } else if (tz.includes("Singapore")) {
        latitude = 1.3521;
        longitude = 103.8198;
        resolvedCity = "Singapore";
      }
    }

    // 3. Fetch from Open-Meteo Current API
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(
      4
    )}&longitude=${longitude.toFixed(
      4
    )}&current=temperature_2m,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m&timezone=auto`;

    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) {
      throw new Error(`Open-Meteo response ${res.status}`);
    }

    const data = await res.json();
    const curr = data.current || {};

    const tempC = Math.round(Number(curr.temperature_2m ?? 26));
    const isDay = curr.is_day !== undefined ? Number(curr.is_day) === 1 : true;
    const isNight = !isDay;
    const precipMm = Number(curr.precipitation ?? 0);
    const snowfallCm = Number(curr.snowfall ?? 0);
    const code = Number(curr.weather_code ?? 0);
    const windSpeedKm = Math.round(Number(curr.wind_speed_10m ?? 12));

    const { season, label } = mapWmoCodeToSeason(code, tempC, precipMm, snowfallCm);

    const conditionLabel = isNight
      ? season === "thunderstorm"
        ? "Thunderstorm Night"
        : season === "rain" || season === "monsoon"
        ? "Rainy Night"
        : season === "snow"
        ? "Snowy Night"
        : "Clear Night"
      : label;

    const weatherResult: CityLiveWeather = {
      season,
      isNight,
      temperatureC: tempC,
      weatherCode: code,
      conditionLabel,
      cityName: resolvedCity,
      precipitationMm: precipMm,
      windSpeedKm,
      isAuto: true,
    };

    // Cache to sessionStorage
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ timestamp: Date.now(), weather: weatherResult })
      );
    } catch {
      // Storage quota or disabled
    }

    return weatherResult;
  } catch {
    // If any network/CORS error occurs, return solid local device time fallback
    return getLocalFallbackWeather(resolvedCity);
  }
}

