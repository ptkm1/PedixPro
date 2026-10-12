import type { StyleProp, ViewStyle } from "react-native";

export type MiniMapThumbProps = {
  latitude: number;
  longitude: number;
  style?: StyleProp<ViewStyle>;
  /** Tamanho do quadrado em px. Default 72. */
  size?: number;
};
