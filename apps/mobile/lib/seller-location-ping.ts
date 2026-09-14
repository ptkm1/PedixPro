import * as Location from "expo-location";
import { apiFetch } from "./api";

let lastSentAt = 0;
let lastLat: number | null = null;
let lastLng: number | null = null;

const MIN_INTERVAL_MS = 40_000;
const MIN_MOVE_METERS = 35;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Envia GPS apenas se a permissão foreground já estiver concedida.
 * Nunca chama request*Permissions (política Play / disclosure).
 */
export async function pingSellerLocationIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) return;

  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) return;

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = pos.coords;
  if (
    lastLat != null &&
    lastLng != null &&
    haversineMeters(lastLat, lastLng, latitude, longitude) < MIN_MOVE_METERS &&
    now - lastSentAt < MIN_INTERVAL_MS * 2
  ) {
    return;
  }

  await apiFetch("/seller/location", {
    method: "POST",
    body: JSON.stringify({
      latitude,
      longitude,
      accuracyMeters: pos.coords.accuracy ?? undefined,
    }),
  });

  lastSentAt = now;
  lastLat = latitude;
  lastLng = longitude;
}
