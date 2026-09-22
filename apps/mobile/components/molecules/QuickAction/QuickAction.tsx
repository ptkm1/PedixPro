import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { ThemedText } from "@/components/atoms/ThemedText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { GlowIcon } from "@/components/atoms/GlowIcon";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";

type Variant = "default" | "primary" | "warning";

type QuickActionProps = {
  icon: LucideIcon;
  label: string;
  description?: string;
  onPress?: () => void;
  badge?: string | number;
  variant?: Variant;
};

export function QuickAction({
  icon: Icon,
  label,
  description,
  onPress,
  badge,
  variant = "default",
}: QuickActionProps) {
  const { colors } = useTheme();
  const accent =
    variant === "primary"
      ? colors.primary
      : variant === "warning"
        ? colors.warning
        : colors.primary;
  const borderColor =
    variant === "default" ? colors.glassBorder : colorWithAlpha(accent, 0.45);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
    >
      <GlassSurface style={{ borderColor }} padded={false}>
        <View style={styles.wrap}>
          <GlowIcon Icon={Icon} size={22} glowSize={68} color={accent} />
          <View style={styles.text}>
            <ThemedText
              variant="body"
              style={{ fontWeight: "600" }}
              numberOfLines={1}
            >
              {label}
            </ThemedText>
            {description ? (
              <ThemedText variant="bodySm" muted numberOfLines={1}>
                {description}
              </ThemedText>
            ) : null}
          </View>
          {badge !== undefined ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    variant === "primary"
                      ? colors.primary
                      : colors.surfaceMuted,
                },
              ]}
            >
              <ThemedText
                variant="caption"
                style={{
                  fontWeight: "700",
                  color:
                    variant === "primary"
                      ? colors.primaryForeground
                      : colors.text,
                }}
              >
                {badge}
              </ThemedText>
            </View>
          ) : null}
          <ChevronRight color={colors.iconMuted} size={20} />
        </View>
      </GlassSurface>
    </Pressable>
  );
}

type ClienteCardProps = {
  nome: string;
  endereco: string;
  ultimaCompra?: string;
  inadimplente?: boolean;
  favorito?: boolean;
  curvaABC?: "A" | "B" | "C";
  statusLabel?: string | null;
  statusTone?: "warning" | "danger" | null;
  onPress?: () => void;
};

export function ClienteCard({
  nome,
  endereco,
  ultimaCompra,
  inadimplente,
  favorito,
  curvaABC,
  statusLabel,
  statusTone,
  onPress,
}: ClienteCardProps) {
  const { colors } = useTheme();
  const initial = nome.charAt(0).toUpperCase();
  const avatarBg =
    curvaABC === "A"
      ? colorWithAlpha(colors.primary, 0.2)
      : curvaABC === "B"
        ? colorWithAlpha(colors.primary, 0.1)
        : colors.surfaceMuted;
  const statusColor =
    statusTone === "danger"
      ? colors.danger
      : statusTone === "warning"
        ? colors.warning
        : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
    >
      <GlassSurface
        style={{
          borderColor: inadimplente
            ? colorWithAlpha(colors.danger, 0.45)
            : colors.glassBorder,
        }}
        padded={false}
      >
        <View style={styles.wrap}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            <ThemedText
              variant="titleSm"
              style={{ color: colors.primary, fontWeight: "700" }}
            >
              {initial}
            </ThemedText>
          </View>
          <View style={styles.text}>
            <ThemedText
              variant="body"
              style={{ fontWeight: "600" }}
              numberOfLines={1}
            >
              {nome}
              {favorito ? " ★" : ""}
              {inadimplente ? " ⚠" : ""}
            </ThemedText>
            <ThemedText variant="bodySm" muted numberOfLines={1}>
              {endereco}
            </ThemedText>
            {statusLabel ? (
              <ThemedText
                variant="caption"
                style={{ marginTop: 4, fontWeight: "600", color: statusColor }}
              >
                {statusLabel}
              </ThemedText>
            ) : null}
            {ultimaCompra ? (
              <ThemedText variant="caption" muted style={{ marginTop: 4 }}>
                Última compra: {ultimaCompra}
              </ThemedText>
            ) : null}
          </View>
          {curvaABC ? (
            <View style={[styles.abcBadge, { backgroundColor: avatarBg }]}>
              <ThemedText
                variant="caption"
                style={{ fontWeight: "700", color: colors.primary }}
              >
                {curvaABC}
              </ThemedText>
            </View>
          ) : null}
          <ChevronRight color={colors.iconMuted} size={20} />
        </View>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  text: { flex: 1, minWidth: 0 },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radiiPx.md,
    alignItems: "center",
    justifyContent: "center",
  },
  abcBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
