import { Image, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  /** Opacidade do grão (dark costuma precisar um pouco mais). */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Textura granuladinha sutil — mesma em chips/botões light e dark.
 * pointerEvents none para não roubar toque.
 */
export function GrainOverlay({ opacity = 0.18, style }: Props) {
  return (
    <Image
      pointerEvents="none"
      source={require("../../../assets/noise-grain.png")}
      style={[StyleSheet.absoluteFillObject, { opacity }, style]}
      resizeMode="repeat"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
