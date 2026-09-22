import { MapPin } from "lucide-react-native";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Platform, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { getMapUnavailableReason, isGoogleMapsConfigured } from "../../lib/maps/google-maps-config";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { RoutePlanMapUnavailable } from "./RoutePlanMapUnavailable";
import type { RoutePlanMapCoord, RoutePlanMapProps, RoutePlanMapRef } from "./RoutePlanMap.types";
import {
    PIN_WITHOUT_SELLER,
    PIN_WITH_SELLER,
    useRoutePlanMapNativeStyles,
} from "./RoutePlanMap.native.styles";

export const RoutePlanMap = forwardRef<RoutePlanMapRef, RoutePlanMapProps>(function RoutePlanMap(
  { style, region, followUser, customers, polyCoords, activeVisitCustomerId, onMarkerPress },
  ref,
) {
  const { styles, routeStrokeColor } = useRoutePlanMapNativeStyles();
  const inner = useRef<MapView>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const useGoogleProvider = Platform.OS === "android" && isGoogleMapsConfigured();
  const unavailableReason = loadFailed ? getMapUnavailableReason(true) : getMapUnavailableReason();

  useImperativeHandle(ref, () => ({
    fitRoute(coords: RoutePlanMapCoord[]) {
      inner.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 40, bottom: 180, left: 40 },
        animated: true,
      });
    },
  }));

  if (unavailableReason) {
    return <RoutePlanMapUnavailable style={style} reason={unavailableReason} />;
  }

  return (
    <MapErrorBoundary
      fallback={<RoutePlanMapUnavailable style={style} reason="load_failed" />}
      onError={() => setLoadFailed(true)}
    >
      <MapView
        ref={inner}
        style={style}
        provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        region={followUser ? region : undefined}
        showsUserLocation
      >
        {customers.map((c) => {
          const isActive = c.id === activeVisitCustomerId;
          const pinFill = c.hasSeller ? PIN_WITH_SELLER : PIN_WITHOUT_SELLER;
          return (
            <Marker
              key={c.id}
              coordinate={{ latitude: c.latitude, longitude: c.longitude }}
              title={c.name}
              description={isActive ? "Visita em curso" : `≈ ${c.distanceKm} km`}
              onPress={() => onMarkerPress(c)}
              zIndex={isActive ? 10 : 1}
              tracksViewChanges={false}
            >
              <View style={isActive ? styles.pinOuterActive : styles.pinOuter}>
                <View style={styles.pinShadow}>
                  <MapPin
                    color="#ffffff"
                    fill={pinFill}
                    size={isActive ? 34 : 30}
                    strokeWidth={1.5}
                  />
                </View>
              </View>
            </Marker>
          );
        })}
        {polyCoords.length >= 2 ? (
          <Polyline coordinates={polyCoords} strokeColor={routeStrokeColor} strokeWidth={3} />
        ) : null}
      </MapView>
    </MapErrorBoundary>
  );
});
