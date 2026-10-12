import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { MapPin } from "lucide-react-native";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export function MiniMapThumbFallback({
  style,
  size = 72,
}: {
  style?: StyleProp<ViewStyle>;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: Math.max(10, size * 0.16),
          backgroundColor: colorWithAlpha(colors.primary, 0.1),
          borderColor: colorWithAlpha(colors.primary, 0.22),
        },
        style,
      ]}
    >
      <View
        style={[
          styles.pinHalo,
          { backgroundColor: colorWithAlpha(colors.primary, 0.18) },
        ]}
      >
        <MapPin
          size={Math.round(size * 0.36)}
          color={colors.primary}
          fill={colors.primary}
          strokeWidth={1.6}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  pinHalo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
