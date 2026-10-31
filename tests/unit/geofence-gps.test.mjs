import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { metersBetween, parseCoordinatesInput, isWithinGeofence } from "../../lib/geofence.ts";

describe("Geofence & GPS Calculation Suite", () => {
  const SHOP_LAT = 12.8439;
  const SHOP_LNG = 80.2268;
  const RADIUS_METERS = 150;

  describe("Haversine Distance Engine (metersBetween)", () => {
    it("calculates 0 meters for identical coordinates", () => {
      const d = metersBetween(SHOP_LAT, SHOP_LNG, SHOP_LAT, SHOP_LNG);
      assert.strictEqual(Math.round(d), 0);
    });

    it("calculates distance accurately for nearby physical locations", () => {
      // 0.001 deg latitude delta is approximately 111 meters
      const offsetLat = SHOP_LAT + 0.001;
      const d = metersBetween(SHOP_LAT, SHOP_LNG, offsetLat, SHOP_LNG);
      assert.ok(d >= 105 && d <= 115, `Expected ~111m, got ${d}m`);
    });

    it("calculates long distances between international coordinates correctly", () => {
      // Chennai (13.0827, 80.2707) to Bangalore (12.9716, 77.5946) is ~290 km
      const d = metersBetween(13.0827, 80.2707, 12.9716, 77.5946);
      const km = d / 1000;
      assert.ok(km >= 280 && km <= 300, `Expected ~290km, got ${km}km`);
    });
  });

  describe("Coordinate Parser (parseCoordinatesInput)", () => {
    it("parses raw comma-separated decimal coordinates", () => {
      const parsed = parseCoordinatesInput("12.8439, 80.2268");
      assert.ok(parsed);
      assert.strictEqual(Math.round(parsed.lat * 10000) / 10000, 12.8439);
      assert.strictEqual(Math.round(parsed.lng * 10000) / 10000, 80.2268);
    });

    it("parses Google Maps !3d / !4d place URLs", () => {
      const url = "https://www.google.com/maps/place/Data/@12.8439,80.2268,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.8439!4d80.2268";
      const parsed = parseCoordinatesInput(url);
      assert.ok(parsed);
      assert.strictEqual(parsed.lat, 12.8439);
      assert.strictEqual(parsed.lng, 80.2268);
    });

    it("parses Google Maps query parameters (?q=lat,lng)", () => {
      const url = "https://maps.google.com/?q=12.8439,80.2268";
      const parsed = parseCoordinatesInput(url);
      assert.ok(parsed);
      assert.strictEqual(parsed.lat, 12.8439);
      assert.strictEqual(parsed.lng, 80.2268);
    });

    it("parses Degrees Minutes Seconds (DMS) format coordinates", () => {
      // 12°50'38.04"N 80°13'36.48"E -> approx 12.8439, 80.2268
      const dms = "12°50'38.04\"N 80°13'36.48\"E";
      const parsed = parseCoordinatesInput(dms);
      assert.ok(parsed);
      assert.ok(Math.abs(parsed.lat - 12.8439) < 0.001);
      assert.ok(Math.abs(parsed.lng - 80.2268) < 0.001);
    });

    it("returns null for invalid strings or out-of-bounds coordinates", () => {
      assert.strictEqual(parseCoordinatesInput(""), null);
      assert.strictEqual(parseCoordinatesInput("invalid-text-only"), null);
      assert.strictEqual(parseCoordinatesInput("150.000, 200.000"), null); // lat > 90, lng > 180
    });
  });

  describe("Geofence Inclusion/Exclusion (isWithinGeofence)", () => {
    it("returns true when staff is exactly at the shop center", () => {
      const inside = isWithinGeofence(SHOP_LAT, SHOP_LNG, SHOP_LAT, SHOP_LNG, RADIUS_METERS);
      assert.strictEqual(inside, true);
    });

    it("returns true when staff is within configured radius (50m away)", () => {
      // ~50m offset: ~0.00045 deg latitude
      const closeLat = SHOP_LAT + 0.00045;
      const inside = isWithinGeofence(closeLat, SHOP_LNG, SHOP_LAT, SHOP_LNG, RADIUS_METERS);
      assert.strictEqual(inside, true);
    });

    it("returns false when staff is outside configured radius (300m away)", () => {
      // ~300m offset: ~0.0027 deg latitude
      const farLat = SHOP_LAT + 0.0027;
      const inside = isWithinGeofence(farLat, SHOP_LNG, SHOP_LAT, SHOP_LNG, RADIUS_METERS);
      assert.strictEqual(inside, false);
    });
  });
});

