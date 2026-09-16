import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoutePlanMapRef } from "../../components/RoutePlanMap";
import type { RouteListCustomer } from "../../components/molecules/RouteCustomerListItem";
import { useConfirm } from "../../context/ConfirmContext";
import { apiFetch } from "../../lib/api";
import type {
    DirectionsRouteResp,
    NearbyCustomersResp,
    SellerVisit,
} from "../../lib/route/types";
import { formatDurationSeconds } from "../../lib/utils/format-duration";
import { openNavigationApp } from "../../lib/utils/open-navigation";
import {
    getForegroundLocationIfGranted,
    requestLocationPermissions,
} from "../../lib/location-disclosure";
import {
    isLocationTrackingEnabled,
    setLocationTrackingEnabled,
    subscribePrivacyPreferences,
} from "../../lib/privacy-preferences";

const RADIUS_OPTIONS = [30, 60, 120] as const;
export type RouteRadiusKm = (typeof RADIUS_OPTIONS)[number];

export function useRoutePlanScreen() {
  const router = useRouter();
  const { alert, confirm, choose } = useConfirm();
  const qc = useQueryClient();
  const mapRef = useRef<RoutePlanMapRef>(null);

  const [perm, setPerm] = useState<Location.PermissionStatus | null>(null);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [optimized, setOptimized] = useState<DirectionsRouteResp | null>(null);
  const [radiusKm, setRadiusKm] = useState<RouteRadiusKm>(30);
  const [myClientsOnly, setMyClientsOnly] = useState(false);
  const [checkInModal, setCheckInModal] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [locPending, setLocPending] = useState(false);
  const [locationTrackingEnabled, setLocationTrackingState] = useState(false);
  const locPendingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void isLocationTrackingEnabled().then((enabled) => {
        if (mounted) setLocationTrackingState(enabled);
      });
    };
    refresh();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribePrivacyPreferences(() => {
      void isLocationTrackingEnabled().then(setLocationTrackingState);
    });
  }, []);

  const setLocationTracking = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        // Disclosure in-app imediatamente antes dos prompts FG/BG do SO.
        const result = await requestLocationPermissions({
          purpose: "background_tracking",
          confirm,
        });
        if (!result.granted) {
          if (!result.declinedDisclosure) {
            setLocErr(
              "Permissão de localização em segundo plano necessária para o rastreamento.",
            );
          }
          return;
        }
        setPerm(result.foreground);
      }
      await setLocationTrackingEnabled(enabled);
    },
    [confirm],
  );

  const applyGrantedCoords = useCallback(
    async (opts: { requestIfNeeded: boolean }) => {
      if (locPendingRef.current) return;
      locPendingRef.current = true;
      setLocPending(true);
      setLocErr(null);
      try {
        if (opts.requestIfNeeded) {
          const result = await requestLocationPermissions({
            purpose: "foreground_map",
            confirm,
          });
          setPerm(result.foreground);
          if (!result.granted) {
            if (!result.declinedDisclosure) {
              setLocErr("Sem permissão de localização.");
            }
            return;
          }
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setMyLat(pos.coords.latitude);
          setMyLng(pos.coords.longitude);
          return;
        }

        const { status, coords } = await getForegroundLocationIfGranted();
        setPerm(status);
        if (!coords) {
          setLocErr(
            "Toque em \"Atualizar GPS\" para permitir a localização e ver o mapa.",
          );
          return;
        }
        setMyLat(coords.latitude);
        setMyLng(coords.longitude);
      } catch (e) {
        setLocErr(e instanceof Error ? e.message : "Falha ao obter GPS.");
      } finally {
        locPendingRef.current = false;
        setLocPending(false);
      }
    },
    [confirm],
  );

  const refreshLocation = useCallback(async () => {
    await applyGrantedCoords({ requestIfNeeded: true });
  }, [applyGrantedCoords]);

  useEffect(() => {
    // Mount: nunca chama request*Permissions — só usa se já concedida.
    void applyGrantedCoords({ requestIfNeeded: false });
  }, [applyGrantedCoords]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const nearbyQuery = useQuery({
    queryKey: ["seller", "route-nearby", myLat, myLng, radiusKm],
    enabled: myLat != null && myLng != null,
    queryFn: () =>
      apiFetch<NearbyCustomersResp>(
        `/seller/route-plan/nearby?lat=${encodeURIComponent(String(myLat))}&lng=${encodeURIComponent(String(myLng))}&radiusKm=${radiusKm}`,
      ),
  });

  const filteredCustomers = useMemo(() => {
    const list = nearbyQuery.data?.customers ?? [];
    if (!myClientsOnly) return list;
    return list.filter((c) => c.assignedToMe);
  }, [nearbyQuery.data?.customers, myClientsOnly]);

  const activeVisitQuery = useQuery({
    queryKey: ["seller", "visit-active"],
    queryFn: () => apiFetch<SellerVisit | null>("/seller/visits/active"),
    refetchInterval: 20_000,
  });

  const recentVisitsQuery = useQuery({
    queryKey: ["seller", "visits-recent"],
    queryFn: () => apiFetch<SellerVisit[]>("/seller/visits/recent?limit=25"),
  });

  const checkIn = useMutation({
    mutationFn: (payload: {
      customerId: string;
      latitude?: number;
      longitude?: number;
      notes?: string;
    }) =>
      apiFetch<SellerVisit>("/seller/visits/check-in", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setCheckInModal(null);
      void qc.invalidateQueries({ queryKey: ["seller", "visit-active"] });
      void qc.invalidateQueries({ queryKey: ["seller", "visits-recent"] });
    },
  });

  const checkOut = useMutation({
    mutationFn: (payload: {
      id: string;
      latitude?: number;
      longitude?: number;
      notes?: string;
    }) =>
      apiFetch<SellerVisit>(`/seller/visits/${payload.id}/check-out`, {
        method: "PATCH",
        body: JSON.stringify({
          latitude: payload.latitude,
          longitude: payload.longitude,
          notes: payload.notes,
        }),
      }),
    onSuccess: () => {
      setCheckOutModalOpen(false);
      void qc.invalidateQueries({ queryKey: ["seller", "visit-active"] });
      void qc.invalidateQueries({ queryKey: ["seller", "visits-recent"] });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      if (myLat == null || myLng == null) throw new Error("Sem localização");
      const withPins = filteredCustomers.filter(
        (c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
      );
      const ids = withPins.slice(0, 14).map((c) => c.id);
      if (ids.length === 0)
        throw new Error("Nenhum cliente com GPS por perto.");
      return apiFetch<DirectionsRouteResp>("/seller/route-plan/directions", {
        method: "POST",
        body: JSON.stringify({
          originLat: myLat,
          originLng: myLng,
          customerIds: ids,
        }),
      });
    },
    onSuccess: (data) => {
      setOptimized(data);
      const fit =
        data.routePolyline.length >= 2
          ? data.routePolyline
          : [
              { latitude: myLat!, longitude: myLng! },
              ...data.orderedCustomers.map((c) => ({
                latitude: c.latitude,
                longitude: c.longitude,
              })),
            ];
      requestAnimationFrame(() => mapRef.current?.fitRoute(fit));
      if (data.source === "air_fallback") {
        void alert({
          title: "Rota em linha reta",
          description: __DEV__ ? `${data.disclaimer}\n\nPara traçado pelas vias: GOOGLE_MAPS_SERVER_API_KEY em apps/api/.env + Routes API no Google Cloud. Reinicie a API.` : data.disclaimer,
        });
      }
    },
    onError: (e: Error) => {
      void alert({ title: "Rota", description: e.message, tone: "danger" });
    },
  });

  const polyCoords = useMemo(() => {
    if (!optimized) return [];
    if (optimized.routePolyline.length >= 2) return optimized.routePolyline;
    if (myLat == null || myLng == null) return [];
    return [
      { latitude: myLat, longitude: myLng },
      ...optimized.orderedCustomers.map((c) => ({
        latitude: c.latitude,
        longitude: c.longitude,
      })),
    ];
  }, [optimized, myLat, myLng]);

  const region = useMemo(() => {
    const lat = myLat ?? -14.235;
    const lng = myLng ?? -51.9253;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    };
  }, [myLat, myLng]);

  const activeVisit = activeVisitQuery.data;
  const hasOpenVisit = !!activeVisit && activeVisit.checkedOutAt == null;

  const displayElapsed =
    hasOpenVisit && activeVisit
      ? formatDurationSeconds(
          Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(activeVisit.checkedInAt).getTime()) / 1000,
            ),
          ),
        )
      : null;

  const routeOrderIndex = useMemo(() => {
    if (!optimized) return new Map<string, number>();
    return new Map(optimized.orderedCustomers.map((c, i) => [c.id, i + 1]));
  }, [optimized]);

  const openCustomer = useCallback(
    (customerId: string) => {
      router.push(`/customer/${customerId}`);
    },
    [router],
  );

  const navigateToCustomer = useCallback(
    async (c: RouteListCustomer, app: "google" | "waze") => {
      try {
        await openNavigationApp(app, c.latitude, c.longitude, c.name);
      } catch (e) {
        await alert({
          title: "Navegação",
          description:
            e instanceof Error ? e.message : "Não foi possível abrir o app.",
          tone: "danger",
        });
      }
    },
    [alert],
  );

  const submitCheckIn = useCallback(
    (customerId: string, notes?: string) => {
      if (myLat == null || myLng == null) {
        void alert({
          title: "GPS",
          description: "Atualize a sua localização antes do check-in.",
        });
        return;
      }
      checkIn.mutate(
        { customerId, latitude: myLat, longitude: myLng, notes },
        {
          onError: (err: Error) => {
            void alert({
              title: "Check-in",
              description: err.message,
              tone: "danger",
            });
          },
        },
      );
    },
    [alert, checkIn, myLat, myLng],
  );

  const requestCheckIn = useCallback(
    (c: RouteListCustomer) => {
      if (hasOpenVisit) {
        void alert({
          title: "Visita em curso",
          description: `Termine o check-out em ${activeVisit?.customerName} antes de iniciar outra visita.`,
        });
        return;
      }
      setCheckInModal({ id: c.id, name: c.name });
    },
    [activeVisit?.customerName, alert, hasOpenVisit],
  );

  const submitCheckOut = useCallback(
    (notes?: string) => {
      if (!activeVisit) return;
      const finish = () =>
        checkOut.mutate(
          {
            id: activeVisit.id,
            ...(myLat != null && myLng != null
              ? { latitude: myLat, longitude: myLng }
              : {}),
            notes,
          },
          {
            onError: (e: Error) => {
              void alert({
                title: "Check-out",
                description: e.message,
                tone: "danger",
              });
            },
          },
        );

      if (myLat == null || myLng == null) {
        void (async () => {
          const ok = await confirm({
            title: "GPS",
            description: "Encerrar sem gravar coordenadas de saída?",
            confirmLabel: "Encerrar",
            cancelLabel: "Cancelar",
            tone: "default",
          });
          if (ok) finish();
        })();
        return;
      }
      finish();
    },
    [activeVisit, alert, checkOut, confirm, myLat, myLng],
  );

  const requestCheckOut = useCallback(() => {
    setCheckOutModalOpen(true);
  }, []);

  const openCustomerFromMap = useCallback(
    (c: Pick<RouteListCustomer, "id" | "name" | "latitude" | "longitude">) => {
      const full: RouteListCustomer = filteredCustomers.find(
        (x) => x.id === c.id,
      ) ?? {
        ...c,
        addressNote: null,
        distanceKm: 0,
        assignedToMe: false,
        hasSeller: false,
      };
      const isActive = activeVisit?.customerId === full.id && hasOpenVisit;
      void (async () => {
        const action = await choose({
          title: full.name,
          options: [
            { id: "view", label: "Ver cliente" },
            { id: "google", label: "Google Maps" },
            { id: "waze", label: "Waze" },
            isActive
              ? { id: "checkin", label: "Visita em curso", disabled: true }
              : hasOpenVisit
                ? {
                    id: "checkin",
                    label: "Check-in (visita aberta)",
                    disabled: true,
                  }
                : { id: "checkin", label: "Check-in" },
          ],
          cancelLabel: "Fechar",
        });
        if (action === "view") openCustomer(full.id);
        else if (action === "google") void navigateToCustomer(full, "google");
        else if (action === "waze") void navigateToCustomer(full, "waze");
        else if (action === "checkin" && !isActive && !hasOpenVisit) {
          requestCheckIn(full);
        }
      })();
    },
    [
      activeVisit?.customerId,
      choose,
      filteredCustomers,
      hasOpenVisit,
      navigateToCustomer,
      openCustomer,
      requestCheckIn,
    ],
  );

  const goQuickSaleWithCustomer = useCallback(
    (customerId: string) => {
      router.push({ pathname: "/quick-sale", params: { customerId } });
    },
    [router],
  );

  const clearOptimized = useCallback(() => setOptimized(null), []);

  return {
    mapRef,
    perm,
    locErr,
    myLat,
    myLng,
    refreshLocation,
    locPending,
    locationTrackingEnabled,
    setLocationTracking,
    nearbyQuery,
    filteredCustomers,
    radiusKm,
    setRadiusKm,
    radiusOptions: RADIUS_OPTIONS,
    myClientsOnly,
    setMyClientsOnly,
    activeVisit,
    hasOpenVisit,
    displayElapsed,
    recentVisits: recentVisitsQuery.data ?? [],
    checkIn,
    checkOut,
    optimizeMutation,
    polyCoords,
    region,
    optimized,
    routeOrderIndex,
    openCustomer,
    navigateToCustomer,
    requestCheckIn,
    submitCheckIn,
    requestCheckOut,
    submitCheckOut,
    openCustomerFromMap,
    goQuickSaleWithCustomer,
    clearOptimized,
    formatVisitDuration: formatDurationSeconds,
    checkInModal,
    setCheckInModal,
    checkOutModalOpen,
    setCheckOutModalOpen,
  };
}
