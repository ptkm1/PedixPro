import { GlassSurface } from "@/components/atoms/GlassSurface";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
};

export function ThemedCard({ children, style, padded = true }: Props) {
  return (
    <GlassSurface style={style} padded={padded}>
      {children}
    </GlassSurface>
  );
}
