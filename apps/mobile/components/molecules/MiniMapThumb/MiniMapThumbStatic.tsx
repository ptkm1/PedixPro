import { buildGoogleStaticMapUrl } from "@/lib/maps/google-maps-config";
import { useTheme } from "@/lib/theme";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { MiniMapThumbFallback } from "./MiniMapThumbFallback";
import type { MiniMapThumbProps } from "./MiniMapThumb.types";

/**
 * Miniatura via Google Static Maps (imagem).
 * Preferível no Expo Go e em qualquer lugar com chave configurada.
 */
export function MiniMapThumbStatic({
  latitude,
  longitude,
  style,
  size = 72,
}: MiniMapThumbProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = buildGoogleStaticMapUrl({
    latitude,
    longitude,
    size: Math.round(size * 2),
    markerColor: colors.primary,
  });
  const radius = Math.max(10, size * 0.16);

  if (!uri || failed) {
    return <MiniMapThumbFallback style={style} size={size} />;
  }

  return (
    <View
      style={[
        styles.shell,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={styles.img}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    backgroundColor: "#e8eef2",
  },
  img: {
    width: "100%",
    height: "100%",
  },
});
