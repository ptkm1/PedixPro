import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { ExternalLink, LogOut } from "lucide-react-native";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { ThemePreferencePicker } from "../components/molecules/ThemePreferencePicker";
import { useSettingsScreen } from "../hooks/screens/useSettingsScreen";
import { useProfileScreen } from "../hooks/screens/useProfileScreen";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useTheme } from "../lib/theme";
import type { AppColors } from "../lib/theme/types";

export default function SettingsScreen() {
  const styles = useThemedStyles(createSettingsStyles);
  const { colors } = useTheme();
  const {
    apiUrl,
    pushNotificationsEnabled,
    privacyLinks,
    setPushNotifications,
    logoutAndGoLogin,
    logoutPending,
  } = useSettingsScreen();
  const { name, setName, saveName, savePending } = useProfileScreen();

  return (
    <SafeScreen>
      <MobileHeader title="Configurações" showBack />
      <MobileScreen
        scroll
        noBottomInset
        contentContainerStyle={styles.container}
      >
        <Text style={styles.section}>Aparência</Text>
        <Text style={styles.hint}>
          Escolha o tema do app ou siga o do sistema.
        </Text>
        <ThemePreferencePicker />

        <Text style={styles.section}>Privacidade</Text>
        <Text style={styles.hint}>
          Você controla os recursos sensíveis do aparelho. O rastreamento de
          rota é ativado na tela Rota, no momento em que você inicia a jornada.
        </Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceText}>
            <Text style={styles.preferenceTitle}>Notificações</Text>
            <Text style={styles.preferenceHint}>
              Receba alertas operacionais de pedidos, aprovações, estoque e
              comissão.
            </Text>
          </View>
          <Switch
            value={pushNotificationsEnabled}
            onValueChange={(value) => void setPushNotifications(value)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.primaryForeground}
          />
        </View>
        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(privacyLinks.privacyPolicy)}
        >
          <Text style={styles.linkText}>Política de Privacidade</Text>
          <ExternalLink color={colors.primary} size={18} />
        </Pressable>
        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(privacyLinks.terms)}
        >
          <Text style={styles.linkText}>Termos de Uso</Text>
          <ExternalLink color={colors.primary} size={18} />
        </Pressable>
        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(privacyLinks.accountDeletion)}
        >
          <Text style={styles.linkText}>Solicitar exclusão da conta e dados</Text>
          <ExternalLink color={colors.primary} size={18} />
        </Pressable>

        <Text style={styles.section}>Conta</Text>
        <Text style={styles.hint}>Nome de exibição</Text>
        <ThemedTextInput value={name} onChangeText={setName} />
        <ThemedButton
          size="lg"
          loading={savePending}
          loadingLabel="Salvando…"
          onPress={saveName}
        >
          Salvar nome
        </ThemedButton>

        <Text style={styles.section}>API</Text>
        <Text style={styles.hint}>
          URL atual: {apiUrl}
          {"\n\n"}
          Para dispositivo físico ou emulador Android, defina
          EXPO_PUBLIC_API_URL (ex.: IP da sua máquina:4000).
        </Text>
        <Pressable
          style={[styles.danger, logoutPending && styles.dangerBusy]}
          disabled={logoutPending}
          onPress={() => void logoutAndGoLogin()}
        >
          <View style={styles.dangerInner}>
            {logoutPending ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <LogOut color={colors.danger} size={20} strokeWidth={2} />
            )}
            <Text style={styles.dangerText}>
              {logoutPending ? "Saindo…" : "Sair"}
            </Text>
          </View>
        </Pressable>
      </MobileScreen>
    </SafeScreen>
  );
}

function createSettingsStyles(c: AppColors) {
  return StyleSheet.create({
    container: { padding: 0, gap: 8 },
    section: {
      marginTop: 16,
      fontSize: 13,
      fontWeight: "700",
      color: c.textSecondary,
      textTransform: "uppercase",
    },
    hint: {
      marginTop: 8,
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 22,
    },
    preferenceCard: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    preferenceText: { flex: 1, minWidth: 0, gap: 4 },
    preferenceTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    preferenceHint: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
    },
    linkRow: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    linkText: {
      flex: 1,
      color: c.primary,
      fontSize: 14,
      fontWeight: "700",
    },
    danger: {
      marginTop: 12,
      borderWidth: 1,
      borderColor: c.dangerBorder,
      backgroundColor: c.dangerSurface,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: "center",
    },
    dangerBusy: { opacity: 0.6 },
    dangerInner: { flexDirection: "row", alignItems: "center", gap: 10 },
    dangerText: { color: c.danger, fontWeight: "700" },
  });
}
import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
