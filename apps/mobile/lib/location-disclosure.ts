import * as Location from "expo-location";
import { InteractionManager } from "react-native";
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
      "O PedixPro coletará sua localização precisa e enviará as coordenadas para a gestão da sua organização, para acompanhar rotas e visitas de trabalho. A coleta pode continuar em segundo plano, quando o app estiver fechado ou não estiver em uso, até você desativar este recurso. Em seguida o Android pedirá permissão de localização (incluindo o tempo todo / segundo plano). Detalhes: " +
      PRIVACY_LINKS.privacyPolicy,
    confirmLabel: "Ativar rastreamento",
  },
};

/** Disclosure específico imediatamente antes do prompt de background do SO. */
const BACKGROUND_RUNTIME_DISCLOSURE = {
  title: "Permitir localização em segundo plano?",
  description:
    "Para o rastreamento continuar com o app fechado ou fora de uso, o PedixPro precisa da permissão de localização em segundo plano (\"Permitir o tempo todo\"). As coordenadas precisas serão enviadas à gestão da sua organização até você desativar o rastreamento. Detalhes: " +
    PRIVACY_LINKS.privacyPolicy,
  confirmLabel: "Permitir em segundo plano",
};

export type LocationPermissionResult = {
  granted: boolean;
  foreground: Location.PermissionStatus;
  background?: Location.PermissionStatus;
  /** Usuário recusou o disclosure in-app (não chegou ao prompt do SO). */
  declinedDisclosure?: boolean;
};

/**
 * Garante que o modal in-app sumiu antes do prompt do SO.
 * Sem isso o diálogo do Android pode abrir por cima do disclosure
 * (setState do Confirm é assíncrono) e o Play rejeita por falta de
 * declaração "imediatamente precedente".
 */
function waitForInAppDisclosureDismiss(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(resolve, 350);
      });
    });
  });
}

async function confirmDisclosure(
  confirm: LocationConfirmFn,
  copy: { title: string; description: string; confirmLabel: string },
): Promise<boolean> {
  const accepted = await confirm({
    title: copy.title,
    description: copy.description,
    confirmLabel: copy.confirmLabel,
    cancelLabel: "Agora não",
  });
  if (accepted) {
    await waitForInAppDisclosureDismiss();
  }
  return accepted;
}

/**
 * Declaração em destaque imediatamente antes de qualquer
 * requestForeground/BackgroundPermissions (política Google Play).
 *
 * Ordem obrigatória:
 * 1) disclosure in-app → 2) consentimento → 3) modal some → 4) runtime permission.
 * Background: sempre um disclosure próprio imediatamente antes do
 * requestBackgroundPermissions (o diálogo FG do SO não pode interromper
 * a cadeia disclosure→BG).
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
  const accepted = await confirmDisclosure(input.confirm, copy);

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
  if (background === Location.PermissionStatus.GRANTED) {
    return { granted: true, foreground, background };
  }

  // Sempre reexibir disclosure imediatamente antes do prompt BG do SO —
  // política Play exige declaração imediatamente precedente a CADA request.
  const acceptedBg = await confirmDisclosure(
    input.confirm,
    BACKGROUND_RUNTIME_DISCLOSURE,
  );
  if (!acceptedBg) {
    return {
      granted: false,
      foreground,
      background,
      declinedDisclosure: true,
    };
  }

  const reqBg = await Location.requestBackgroundPermissionsAsync();
  background = reqBg.status;

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
