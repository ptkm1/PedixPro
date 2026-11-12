import type { StyleProp, ViewStyle } from "react-native";

export type RoutePlanMapCustomerPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  assignedToMe: boolean;
  /** Com vendedor atribuído → pin azul; sem → vermelho. */
  hasSeller: boolean;
};

export type RoutePlanMapCoord = { latitude: number; longitude: number };

export type RoutePlanMapProps = {
  style?: StyleProp<ViewStyle>;
  region: RoutePlanMapCoord & { latitudeDelta: number; longitudeDelta: number };
  followUser: boolean;
  /**
   * Só true quando ACCESS_FINE_LOCATION já foi concedida após disclosure in-app.
   * `showsUserLocation` no MapView dispara o prompt do Android no mount se true
   * sem permissão — viola Prominent Disclosure (Play).
   */
  showsUserLocation?: boolean;
  customers: RoutePlanMapCustomerPin[];
  polyCoords: RoutePlanMapCoord[];
  /** Cliente com visita em aberto — marcador destacado. */
  activeVisitCustomerId?: string | null;
  onMarkerPress: (c: RoutePlanMapCustomerPin) => void;
};

export type RoutePlanMapRef = {
  fitRoute: (coords: RoutePlanMapCoord[]) => void;
};
