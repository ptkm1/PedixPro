import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { useTheme } from "../../lib/theme";

/** Azul sólido — clientes com vendedor (visível no mapa escuro). */
export const PIN_WITH_SELLER = "#2563eb";
/** Vermelho sólido — clientes sem vendedor. */
export const PIN_WITHOUT_SELLER = "#dc2626";
/** Dot do vendedor (substitui MapView.showsUserLocation). */
export const USER_LOCATION_FILL = "#0284c7";

export type RoutePlanMapNativeStylesParams = {
  routeStrokeColor?: string;
};

export function useRoutePlanMapNativeStyles(
  params: RoutePlanMapNativeStylesParams = {},
) {
  const { colors } = useTheme();
  const { routeStrokeColor = colors.primary } = params;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        pinOuter: {
          alignItems: "center",
          justifyContent: "center",
        },
        pinOuterActive: {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.92)",
          borderRadius: 22,
          padding: 5,
          borderWidth: 2,
          borderColor: colors.warning,
        },
        pinShadow: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.45,
          shadowRadius: 3,
          elevation: 4,
        },
        userDotOuter: {
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "rgba(2, 132, 199, 0.25)",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: "#ffffff",
        },
        userDotInner: {
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: USER_LOCATION_FILL,
        },
      }),
    [colors],
  );

  return {
    styles,
    routeStrokeColor,
    activeRingColor: colors.warning,
  };
}
