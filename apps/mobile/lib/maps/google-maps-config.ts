import Constants from "expo-constants";
import { Platform } from "react-native";

function readGoogleMapsApiKey(): string | undefined {
  const extra = Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined;
  const fromExtra = extra?.googleMapsApiKey;
  if (typeof fromExtra === "string" && fromExtra.trim()) return fromExtra.trim();

  const fromAndroidConfig = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
  if (typeof fromAndroidConfig === "string" && fromAndroidConfig.trim()) return fromAndroidConfig.trim();

  return undefined;
}

/** Chave do Google Maps embutida no build (EAS / app.config). */
export function getGoogleMapsApiKey(): string | undefined {
  return readGoogleMapsApiKey();
}

export function isGoogleMapsConfigured(): boolean {
  return getGoogleMapsApiKey() != null;
}

/**
 * URL do Google Static Maps (miniatura com pin).
 * Funciona no Expo Go / web (só precisa da chave HTTP), ao contrário do MapView nativo.
 */
export function buildGoogleStaticMapUrl(params: {
  latitude: number;
  longitude: number;
  /** Lado do quadrado em px lógicos (o scale=2 dobra a resolução). */
  size?: number;
  zoom?: number;
  markerColor?: string;
}): string | null {
  const key = getGoogleMapsApiKey();
  if (!key) return null;
  const size = Math.max(64, Math.min(640, Math.round(params.size ?? 152)));
  const zoom = params.zoom ?? 15;
  const raw = (params.markerColor ?? "#02445C").replace(/^#/, "").trim();
  const marker = /^[0-9a-fA-F]{6}$/.test(raw) ? `0x${raw}` : "red";
  const { latitude, longitude } = params;
  const q = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: String(zoom),
    size: `${size}x${size}`,
    scale: "2",
    maptype: "roadmap",
    markers: `color:${marker}|${latitude},${longitude}`,
    key,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${q.toString()}`;
}

/** App genérico Expo Go — não leva o manifest Android com a tua chave Maps. */
export function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export type MapUnavailableReason = "expo_go" | "not_configured" | "load_failed";

export function getMapUnavailableReason(loadFailed = false): MapUnavailableReason | null {
  if (Platform.OS === "web") return "not_configured";
  if (isExpoGo()) return "expo_go";
  if (loadFailed) return "load_failed";
  if (Platform.OS === "android" && !isGoogleMapsConfigured()) return "not_configured";
  return null;
}

/**
 * Android com `PROVIDER_GOOGLE` exige chave válida no manifest — sem ela o mapa pode derrubar o app.
 * Expo Go nunca suporta o mapa Google do teu projeto; usa build EAS ou development client.
 * iOS no build próprio usa Apple Maps por defeito.
 */
export function isNativeMapSupported(): boolean {
  return getMapUnavailableReason() === null;
}
