import { apiBase } from "../../lib/api";
import { useConfirm } from "../../context/ConfirmContext";
import {
  getPrivacyPreferences,
  PRIVACY_LINKS,
  setPushNotificationsEnabled,
  subscribePrivacyPreferences,
} from "../../lib/privacy-preferences";
import { useLogout } from "../useLogout";
import { useCallback, useEffect, useState } from "react";

export function useSettingsScreen() {
  const { logoutAndGoLogin, logoutPending } = useLogout();
  const { confirm } = useConfirm();
  const [pushNotificationsEnabled, setPushState] = useState(false);

  const refreshPrivacyPreferences = useCallback(async () => {
    const prefs = await getPrivacyPreferences();
    setPushState(prefs.pushNotificationsEnabled);
  }, []);

  useEffect(() => {
    void refreshPrivacyPreferences();
    return subscribePrivacyPreferences(() => {
      void refreshPrivacyPreferences();
    });
  }, [refreshPrivacyPreferences]);

  const setPushNotifications = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const accepted = await confirm({
          title: "Ativar notificações?",
          description:
            "O PedixPro enviará alertas operacionais sobre pedidos, aprovações, estoque, cobrança e comissões. Você pode desativar esta opção depois.",
          confirmLabel: "Ativar",
          cancelLabel: "Cancelar",
        });
        if (!accepted) return;
      }
      setPushState(enabled);
      await setPushNotificationsEnabled(enabled);
    },
    [confirm],
  );

  return {
    apiUrl: apiBase(),
    pushNotificationsEnabled,
    privacyLinks: PRIVACY_LINKS,
    setPushNotifications,
    logoutAndGoLogin,
    logoutPending,
  };
}
