import type { Hono } from "npm:hono";
import { requireManagerPin, supabaseAdmin } from "./shared.ts";

const PREFIX = "/make-server-3ba8d4df";
export const STORE_RADIUS_M = 200;

export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLng = (lng2 - lng1) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function clockInGeofenceResult(db: any, lat: unknown, lng: unknown, accuracy: unknown) {
  const { data: config, error } = await db.from("tt_geofence_settings")
    .select("enabled, lat, lng").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!config?.enabled) return null;
  // An enabled gate with missing store coordinates fails closed.
  const validPoint = typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  const validAccuracy = typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= STORE_RADIUS_M;
  const hasStore = Number.isFinite(config.lat) && Number.isFinite(config.lng);
  const distance = validPoint && hasStore ? distanceMetres(config.lat, config.lng, lat as number, lng as number) : null;
  if (!validPoint || !validAccuracy || !hasStore || distance === null || distance + (accuracy as number) > STORE_RADIUS_M) {
    return { error: "outside_geofence", message: "Your location could not be verified within 200 m of the store. Ask a manager for an override.", distanceMeters: distance === null ? null : Math.round(distance), radiusMeters: STORE_RADIUS_M };
  }
  return null;
}

export function registerGeofenceRoutes(app: Hono) {
  app.get(`${PREFIX}/square/geofence/status`, async c => {
    try {
      const db = supabaseAdmin();
      const { data, error } = await db.from("tt_geofence_settings").select("enabled").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return c.json({ enabled: !!data?.enabled, radiusMeters: STORE_RADIUS_M });
    } catch (e) { return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.post(`${PREFIX}/manager/geofence/read`, async c => {
    try {
      const db = supabaseAdmin();
      const { pin } = await c.req.json();
      await requireManagerPin(db, pin);
      const { data, error } = await db.from("tt_geofence_settings").select("enabled, lat, lng, updated_at").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return c.json({ enabled: !!data?.enabled, lat: data?.lat ?? null, lng: data?.lng ?? null, radiusMeters: STORE_RADIUS_M, updatedAt: data?.updated_at ?? null });
    } catch (e) { return c.json({ error: String(e instanceof Error ? e.message : e) }, 401); }
  });

  app.put(`${PREFIX}/manager/geofence`, async c => {
    try {
      const { pin, enabled, lat, lng } = await c.req.json();
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      if (typeof enabled !== "boolean") return c.json({ error: "enabled must be true or false" }, 400);
      const { data: current, error: readError } = await db.from("tt_geofence_settings").select("lat, lng").eq("id", 1).maybeSingle();
      if (readError) throw new Error(readError.message);
      const nextLat = lat === undefined ? current?.lat : lat;
      const nextLng = lng === undefined ? current?.lng : lng;
      if (enabled && !(typeof nextLat === "number" && Number.isFinite(nextLat) && nextLat >= -90 && nextLat <= 90 && typeof nextLng === "number" && Number.isFinite(nextLng) && nextLng >= -180 && nextLng <= 180)) {
        return c.json({ error: "Set a valid store location before enabling clock-in location checks." }, 400);
      }
      const { data, error } = await db.from("tt_geofence_settings")
        .upsert({ id: 1, enabled, lat: nextLat ?? null, lng: nextLng ?? null, radius_m: STORE_RADIUS_M, updated_at: new Date().toISOString() }, { onConflict: "id" })
        .select("enabled, lat, lng, updated_at").single();
      if (error) throw new Error(error.message);
      return c.json({ enabled: data.enabled, lat: data.lat, lng: data.lng, radiusMeters: STORE_RADIUS_M, updatedAt: data.updated_at });
    } catch (e) { return c.json({ error: String(e instanceof Error ? e.message : e) }, 401); }
  });
}
