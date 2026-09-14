import { API_PREFIX } from "@pedidos/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { apiBase } from "./api";

export const SELLER_LOCATION_BG_TASK = "seller-location-background";

const ACCESS_KEY = "pedidos_access";

let lastBgSentAt = 0;
const MIN_BG_INTERVAL_MS = 40_000;

/** undefined = ainda não testado; null = dev build sem módulo nativo */
type TaskManagerModule = typeof import("expo-task-manager");
let taskManagerCache: TaskManagerModule | null | undefined;

function getTaskManager(): TaskManagerModule | null {
  if (taskManagerCache !== undefined) return taskManagerCache;
  try {
    taskManagerCache = require("expo-task-manager") as TaskManagerModule;
    return taskManagerCache;
  } catch {
    taskManagerCache = null;
    return null;
  }
}

function ensureTaskDefined(): boolean {
  const TaskManager = getTaskManager();
  if (!TaskManager) return false;

  if (TaskManager.isTaskDefined(SELLER_LOCATION_BG_TASK)) {
    return true;
  }

  TaskManager.defineTask(SELLER_LOCATION_BG_TASK, async ({ data, error }) => {
    if (error) return;
    const payload = data as
      | { locations?: Location.LocationObject[] }
      | undefined;
    const loc = payload?.locations?.[payload.locations.length - 1];
    if (!loc) return;

    const now = Date.now();
    if (now - lastBgSentAt < MIN_BG_INTERVAL_MS) return;

    const token = await AsyncStorage.getItem(ACCESS_KEY);
    if (!token) return;

    const { latitude, longitude } = loc.coords;
    const url = `${apiBase()}${API_PREFIX}/seller/location`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude,
          longitude,
          accuracyMeters: loc.coords.accuracy ?? undefined,
        }),
      });
      if (res.ok) lastBgSentAt = now;
    } catch {
      /* rede indisponível */
    }
  });

  return true;
}

export function isBackgroundLocationNativeAvailable(): boolean {
  return getTaskManager() != null;
}

export async function startSellerBackgroundLocation(): Promise<boolean> {
  if (!ensureTaskDefined()) {
    return false;
  }

  // Não chama request*Permissions aqui — o disclosure + prompt ficam em
  // requestLocationPermissions (toggle de rastreamento) antes de ativar.
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) return false;

  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== Location.PermissionStatus.GRANTED) return false;

  const started = await Location.hasStartedLocationUpdatesAsync(
    SELLER_LOCATION_BG_TASK,
  );
  if (started) return true;

  await Location.startLocationUpdatesAsync(SELLER_LOCATION_BG_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    timeInterval: 60_000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "PedixPro",
      notificationBody: "Rastreio de rota ativo",
      notificationColor: "#02445C",
    },
  });
  return true;
}

export async function stopSellerBackgroundLocation(): Promise<void> {
  if (!getTaskManager()) return;

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      SELLER_LOCATION_BG_TASK,
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(SELLER_LOCATION_BG_TASK);
    }
  } catch {
    /* módulo nativo ausente ou task nunca iniciada */
  }
}
