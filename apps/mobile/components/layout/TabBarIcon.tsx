import { GlowIcon } from "@/components/atoms/GlowIcon";
import { useTheme } from "@/lib/theme";
import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

type Props = {
  Icon: LucideIcon;
  color: string;
  focused: boolean;
};

export function TabBarIcon({ Icon, color, focused }: Props) {
  const { colors } = useTheme();

  if (focused) {
    return (
      <GlowIcon
        Icon={Icon}
        size={20}
        glowSize={36}
        color={colors.primary}
        strokeWidth={2}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Icon color={color} size={20} strokeWidth={1.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
    minHeight: 40,
  },
});
