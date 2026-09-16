import { useTheme } from "@/lib/theme";
import { useEffect, useRef } from "react";
import {
    Animated,
    Pressable,
    StyleSheet,
    type StyleProp,
    type ViewStyle,
} from "react-native";

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TRACK_W = 52;
const TRACK_H = 32;
const THUMB = 26;
const PAD = 3;

/**
 * Switch cross-platform (iOS/Android) — track + thumb animados,
 * sem o visual nativo inconsistente do Android.
 */
export function ThemedSwitch({
  value,
  onValueChange,
  disabled = false,
  style,
}: Props) {
  const { colors, isDark } = useTheme();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      friction: 7,
      tension: 120,
    }).start();
  }, [value, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRACK_W - THUMB - PAD * 2],
  });

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      isDark ? colors.surfaceMuted : colors.border,
      colors.primary,
    ],
  });

  const thumbBg = isDark ? colors.background : "#FFFFFF";

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={[styles.hit, disabled && styles.disabled, style]}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: TRACK_W,
            height: TRACK_H,
            backgroundColor: trackColor,
            borderColor: isDark ? colors.glassBorder : colors.border,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: THUMB,
              height: THUMB,
              backgroundColor: thumbBg,
              transform: [{ translateX }],
              shadowColor: colors.shadow ?? "#000",
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { justifyContent: "center" },
  disabled: { opacity: 0.45 },
  track: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: PAD,
    justifyContent: "center",
  },
  thumb: {
    borderRadius: 999,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.5,
    elevation: 3,
  },
});
