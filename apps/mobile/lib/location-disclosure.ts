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
      "O PedixPro coleta a sua localização precisa para mostrar o mapa de rota, clientes próximos e check-in de visitas enquanto o app estiver em uso. Os dados são usados só para a operação comercial da sua organização e não são vendidos. Detalhes: " +
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
      "O PedixPro coleta e transmite a sua localização precisa para a gestão da sua organização acompanhar rotas e visitas de trabalho. A coleta pode continuar em segundo plano, quando o app estiver fechado ou não estiver em uso, até você desativar este recurso. Em seguida o sistema pedirá a permissão de localização. Detalhes: " +
      PRIVACY_LINKS.privacyPolicy,
    confirmLabel: "Ativar rastreamento",
  },
};

/** Disclosure específico imediatamente antes do prompt de background do SO. */
const BACKGROUND_RUNTIME_DISCLOSURE = {
  title: "Permitir localização em segundo plano?",
  description:
    "O PedixPro coleta localização precisa mesmo quando o app está fechado ou não está em uso, para o rastreamento de rota continuar ativo. As coordenadas serão enviadas à gestão da sua organização até você desativar o rastreamento. Em seguida o Android pedirá \"Permitir o tempo todo\". Detalhes: " +
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
        // Margem extra: Modal RN + animação Android costumam > 300ms.
        setTimeout(resolve, 500);
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
 * Único ponto que chama requestForeground/BackgroundPermissions.
 * Ordem obrigatória (Play Prominent Disclosure):
 * 1) disclosure in-app → 2) aceite explícito → 3) modal some → 4) runtime.
 * Background: disclosure próprio imediatamente antes de requestBackground.
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
  // o diálogo FG do SO não pode quebrar a cadeia disclosure→BG.
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
