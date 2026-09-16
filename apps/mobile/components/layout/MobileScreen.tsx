import type { ReactNode } from "react";
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
    type ScrollViewProps,
} from "react-native";
import { useTheme } from "@/lib/theme";

/** Espaço extra para tab bar + FAB global. */
export const MOBILE_TAB_SCROLL_BOTTOM = 100;

type Props = {
  children: ReactNode;
  scroll?: boolean;
  scrollEnabled?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
  noBottomInset?: boolean;
};

export function MobileScreen({
  children,
  scroll = true,
  scrollEnabled = true,
  refreshing,
  onRefresh,
  contentContainerStyle,
  noBottomInset,
}: Props) {
  const { colors } = useTheme();
  const bottomPad = noBottomInset ? 24 : MOBILE_TAB_SCROLL_BOTTOM;

  if (!scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: "transparent" }]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: "transparent" }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: bottomPad },
        contentContainerStyle,
      ]}
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 20,
  },
});
