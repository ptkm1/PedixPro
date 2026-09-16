import { ThemedText } from "@/components/atoms/ThemedText";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { BlurView } from "expo-blur";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  message: string;
  onDone: () => void;
};

/** Banner flutuante no topo — não rola com o conteúdo. */
export function ReorderFloatingBanner({ visible, message, onDone }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { paddingTop: Math.max(insets.top, 8) + 6 }]}
    >
      <View
        style={[
          styles.banner,
          {
            borderColor: colorWithAlpha(colors.primary, 0.45),
            backgroundColor:
              Platform.OS === "android"
                ? colorWithAlpha(isDark ? "#0d2438" : "#ffffff", 0.92)
                : "transparent",
            shadowColor: "#000",
          },
        ]}
      >
        {Platform.OS === "ios" ? (
          <BlurView
            intensity={55}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: colorWithAlpha(
                colors.primary,
                isDark ? 0.18 : 0.12,
              ),
            },
          ]}
        />
        <ThemedText
          variant="bodySm"
          style={{ color: colors.primary, flex: 1, zIndex: 1 }}
        >
          {message}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Concluir reordenação"
          onPress={onDone}
          hitSlop={8}
          style={[
            styles.doneBtn,
            { backgroundColor: colorWithAlpha(colors.primary, 0.28), zIndex: 1 },
          ]}
        >
          <ThemedText
            variant="caption"
            style={{ color: colors.primary, fontWeight: "700" }}
          >
            Concluir
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    elevation: 20,
    paddingHorizontal: 16,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
});
