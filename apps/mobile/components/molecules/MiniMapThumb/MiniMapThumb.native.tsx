import {
    getMapUnavailableReason,
    getGoogleMapsApiKey,
    isGoogleMapsConfigured,
} from "@/lib/maps/google-maps-config";
import { useTheme } from "@/lib/theme";
import { MapPin } from "lucide-react-native";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { MapErrorBoundary } from "@/components/RoutePlanMap/MapErrorBoundary";
import { MiniMapThumbFallback } from "./MiniMapThumbFallback";
import { MiniMapThumbStatic } from "./MiniMapThumbStatic";
import type { MiniMapThumbProps } from "./MiniMapThumb.types";

const DELTA = 0.004;

/**
 * Miniatura de mapa pinada nas coordenadas.
 * 1) Static Maps (funciona no Expo Go se houver chave)
 * 2) MapView nativo (build EAS / dev client)
 * 3) Placeholder com pin
 */
export function MiniMapThumb(props: MiniMapThumbProps) {
  const { latitude, longitude, style, size = 72 } = props;
  const { colors } = useTheme();
  const [loadFailed, setLoadFailed] = useState(false);

  // Static Maps: funciona mesmo no Expo Go (só HTTP + chave).
  if (getGoogleMapsApiKey()) {
    return <MiniMapThumbStatic {...props} />;
  }

  const useGoogleProvider =
    Platform.OS === "android" && isGoogleMapsConfigured();
  const unavailable = loadFailed
    ? getMapUnavailableReason(true)
    : getMapUnavailableReason();

  if (unavailable) {
    return <MiniMapThumbFallback style={style} size={size} />;
  }

  const radius = Math.max(10, size * 0.16);

  return (
    <View
      style={[
        styles.shell,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <MapErrorBoundary
        fallback={<MiniMapThumbFallback size={size} />}
        onError={() => setLoadFailed(true)}
      >
        <MapView
          style={StyleSheet.absoluteFillObject}
          provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: DELTA,
            longitudeDelta: DELTA,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          pointerEvents="none"
        >
          <Marker
            coordinate={{ latitude, longitude }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.92 }}
          >
            <View style={styles.pinOuter}>
              <MapPin
                size={22}
                color="#ffffff"
                fill={colors.primary}
                strokeWidth={1.5}
              />
            </View>
          </Marker>
        </MapView>
      </MapErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    backgroundColor: "#e8eef2",
  },
  pinOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
});
