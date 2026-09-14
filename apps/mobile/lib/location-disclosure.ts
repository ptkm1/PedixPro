import * as Location from "expo-location";
import { PRIVACY_LINKS } from "./privacy-preferences";

export type LocationDisclosurePurpose =
  | "foreground_map"
  | "foreground_customer"
  | "background_tracking";

export type LocationConfirmFn = (options: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) => Promise<boolean>;

const DISCLOSURES: Record<
  LocationDisclosurePurpose,
  { title: string; description: string; confirmLabel: string }
> = {
  foreground_map: {
    title: "Permitir localização?",
    description:
      "O PedixPro precisa da sua localização precisa para mostrar o mapa de rota, clientes próximos e check-in de visitas enquanto o app estiver em uso. Os dados são usados só para a operação comercial da sua organização. Detalhes: " +
      PRIVACY_LINKS.privacyPolicy,
    confirmLabel: "Continuar",
  },
  foreground_customer: {
    title: "Usar localização do aparelho?",
    description:
      "O PedixPro acessará sua localização precisa uma vez para gravar as coordenadas do endereço do cliente. Não coletamos localização em segundo plano neste fluxo. Detalhes: " +
      PRIVACY_LINKS.privacyPolicy,
    confirmLabel: "Continuar",
  },
  background_tracking: {
    title: "Ativar rastreamento de rota?",
    description:
      "O PedixPro coletará sua localização precisa e enviará as coordenadas para a gestão da sua organização, para acompanhar rotas e visitas de trabalho. A coleta pode continuar em segundo plano, quando o app estiver fechado ou não estiver em uso, até você desativar este recurso. Detalhes: " +
      PRIVACY_LINKS.privacyPolicy,
    confirmLabel: "Ativar rastreamento",
  },
};

export type LocationPermissionResult = {
  granted: boolean;
  foreground: Location.PermissionStatus;
  background?: Location.PermissionStatus;
  /** Usuário recusou o disclosure in-app (não chegou ao prompt do SO). */
  declinedDisclosure?: boolean;
};

/**
 * Declaração em destaque imediatamente antes de qualquer
 * requestForeground/BackgroundPermissions (política Google Play).
 */
export async function requestLocationPermissions(input: {
  purpose: LocationDisclosurePurpose;
  confirm: LocationConfirmFn;
}): Promise<LocationPermissionResult> {
  const fgCurrent = await Location.getForegroundPermissionsAsync();
  const needsBackground = input.purpose === "background_tracking";

  let bgCurrent = needsBackground
    ? await Location.getBackgroundPermissionsAsync()
    : null;

  const fgOk = fgCurrent.status === Location.PermissionStatus.GRANTED;
  const bgOk =
    !needsBackground ||
    bgCurrent?.status === Location.PermissionStatus.GRANTED;

  if (fgOk && bgOk) {
    return {
      granted: true,
      foreground: fgCurrent.status,
      background: bgCurrent?.status,
    };
  }

  const copy = DISCLOSURES[input.purpose];
  const accepted = await input.confirm({
    title: copy.title,
    description: copy.description,
    confirmLabel: copy.confirmLabel,
    cancelLabel: "Agora não",
  });

  if (!accepted) {
    return {
      granted: false,
      foreground: fgCurrent.status,
      background: bgCurrent?.status,
      declinedDisclosure: true,
    };
  }

  let foreground = fgCurrent.status;
  if (foreground !== Location.PermissionStatus.GRANTED) {
    const req = await Location.requestForegroundPermissionsAsync();
    foreground = req.status;
  }

  if (foreground !== Location.PermissionStatus.GRANTED) {
    return { granted: false, foreground };
  }

  if (!needsBackground) {
    return { granted: true, foreground };
  }

  let background = bgCurrent?.status ?? Location.PermissionStatus.UNDETERMINED;
  if (background !== Location.PermissionStatus.GRANTED) {
    const reqBg = await Location.requestBackgroundPermissionsAsync();
    background = reqBg.status;
  }

  return {
    granted: background === Location.PermissionStatus.GRANTED,
    foreground,
    background,
  };
}

/** Só lê o status atual — nunca chama request*Permissions. */
export async function getForegroundLocationIfGranted(): Promise<{
  status: Location.PermissionStatus;
  coords: { latitude: number; longitude: number } | null;
}> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    return { status, coords: null };
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    status,
    coords: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    },
  };
}
