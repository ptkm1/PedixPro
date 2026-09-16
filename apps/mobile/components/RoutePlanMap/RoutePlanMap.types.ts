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
  customers: RoutePlanMapCustomerPin[];
  polyCoords: RoutePlanMapCoord[];
  /** Cliente com visita em aberto — marcador destacado. */
  activeVisitCustomerId?: string | null;
  onMarkerPress: (c: RoutePlanMapCustomerPin) => void;
};

export type RoutePlanMapRef = {
  fitRoute: (coords: RoutePlanMapCoord[]) => void;
};
