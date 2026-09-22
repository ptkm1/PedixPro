import { GlassChip } from "@/components/atoms/GlassChip";
import { MobileHeader, SafeScreen } from "@/components/layout";
import { MOBILE_TAB_SCROLL_BOTTOM } from "@/components/layout/MobileScreen";
import { StatCard } from "@/components/molecules/StatCard";
import * as Location from "expo-location";
import { Link } from "expo-router";
import { Clock, MapPin, Navigation, Users } from "lucide-react-native";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { RoutePlanMap } from "../../components/RoutePlanMap";
import { RouteCustomerListItem } from "../../components/molecules/RouteCustomerListItem";
import { VisitNotesModal } from "../../components/molecules/VisitNotesModal";
import { useRoutePlanScreen } from "../../hooks/screens/useRoutePlanScreen";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import { useTheme } from "../../lib/theme";
import { createRoutePlanStyles } from "@/styles/route-plan.styles";

export default function RoutePlanScreen() {
  const styles = useThemedStyles(createRoutePlanStyles);
  const { colors } = useTheme();
  const s = useRoutePlanScreen();

  return (
    <SafeScreen variant="tab">
      <MobileHeader
        title="Rota"
        subtitle={`Raio ${s.radiusKm} km · clientes no mapa`}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: MOBILE_TAB_SCROLL_BOTTOM },
        ]}
      >
        <View style={{ flexDirection: "row", gap: 6, padding: 10 }}>
          <View style={{ flex: 1 }}>
            <StatCard
              title="Próximos"
              value={s.filteredCustomers.length}
              icon={Users}
            />
          </View>
          <View style={{ flex: 1 }}>
            <StatCard title="Raio" value={`${s.radiusKm} km`} icon={MapPin} />
          </View>
          <View style={{ flex: 1 }}>
            <StatCard
              title="Visita"
              value={s.hasOpenVisit ? "Ativa" : "—"}
              icon={Clock}
            />
          </View>
        </View>

        <Text style={styles.lead}>
          Clientes com GPS cadastrado pelo escritório aparecem no mapa. Toque{" "}
          <Text style={styles.leadStrong}>Rota por estrada</Text> para traçar
          pelas vias (Google Routes).
        </Text>

        <View
          style={[
            styles.trackingCard,
            s.locationTrackingEnabled ? styles.trackingCardActive : undefined,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.trackingTitle}>Rastreamento de rota</Text>
            <Text style={styles.trackingDescription}>
              {s.locationTrackingEnabled
                ? "Ativo: sua localização é atualizada durante a jornada."
                : "Ative para registrar sua rota e visitas durante a jornada."}
            </Text>
          </View>
          <Pressable
            style={[
              styles.trackingButton,
              s.locationTrackingEnabled
                ? styles.trackingButtonStop
                : undefined,
            ]}
            onPress={() => void s.setLocationTracking(!s.locationTrackingEnabled)}
          >
            <Text
              style={[
                styles.trackingButtonText,
                s.locationTrackingEnabled
                  ? styles.trackingButtonStopText
                  : undefined,
              ]}
            >
              {s.locationTrackingEnabled ? "Desativar" : "Ativar"}
            </Text>
          </Pressable>
        </View>

        {__DEV__ && s.nearbyQuery.data?.roadRoutingConfigured === false ? (
          <Text style={styles.warn}>
            Servidor sem GOOGLE_MAPS_SERVER_API_KEY — configure em apps/api/.env
            e reinicie a API para rotas por pista.
          </Text>
        ) : null}

        <View style={styles.filterRow}>
          <GlassChip
            label="Só meus clientes"
            active={s.myClientsOnly}
            onPress={() => s.setMyClientsOnly((v) => !v)}
          />
          {s.radiusOptions.map((km) => (
            <GlassChip
              key={km}
              label={`${km} km`}
              active={s.radiusKm === km}
              onPress={() => s.setRadiusKm(km)}
            />
          ))}
        </View>

        {s.hasOpenVisit && s.activeVisit ? (
          <View style={styles.visitBanner}>
            <View style={styles.visitRow}>
              <Clock color={colors.warning} size={22} />
              <View style={{ flex: 1 }}>
                <Text style={styles.visitTitle}>
                  Visita em curso · {s.activeVisit.customerName}
                </Text>
                <Text style={styles.visitSub}>
                  Tempo no cliente: {s.displayElapsed ?? "…"}
                </Text>
              </View>
            </View>
            <View style={styles.visitActions}>
              <Pressable
                style={[
                  styles.checkOutBtn,
                  s.checkOut.isPending && styles.btnDis,
                ]}
                disabled={s.checkOut.isPending}
                onPress={s.requestCheckOut}
              >
                {s.checkOut.isPending ? (
                  <ActivityIndicator
                    color={colors.primaryForeground}
                    size="small"
                  />
                ) : (
                  <Text style={styles.checkOutTxt}>Check-out</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.saleBtn}
                onPress={() =>
                  s.goQuickSaleWithCustomer(s.activeVisit!.customerId)
                }
              >
                <Text style={styles.saleBtnTxt}>Venda rápida</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.toolbar}>
          <Pressable
            style={[styles.toolBtn, s.locPending && styles.btnDis]}
            disabled={s.locPending}
            onPress={() => void s.refreshLocation()}
          >
            {s.locPending ? (
              <ActivityIndicator color={colors.link} size="small" />
            ) : (
              <Navigation color={colors.link} size={20} />
            )}
            <Text style={styles.toolBtnTxt}>
              {s.locPending ? "Atualizando…" : "Atualizar GPS"}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.toolBtnPrimary,
              s.optimizeMutation.isPending && styles.btnDis,
            ]}
            disabled={
              s.optimizeMutation.isPending ||
              s.myLat == null ||
              s.filteredCustomers.length === 0
            }
            onPress={() => s.optimizeMutation.mutate()}
          >
            {s.optimizeMutation.isPending ? (
              <ActivityIndicator
                color={colors.primaryForeground}
                size="small"
              />
            ) : null}
            <Text style={styles.toolBtnPrimaryTxt}>
              {s.optimizeMutation.isPending
                ? "Calculando rota…"
                : "Rota por estrada"}
            </Text>
          </Pressable>
        </View>

        {s.locErr ? <Text style={styles.err}>{s.locErr}</Text> : null}
        {s.perm === Location.PermissionStatus.DENIED ? (
          <Text style={styles.warn}>
            Ative a localização nas definições do telemóvel para usar o mapa.
          </Text>
        ) : null}

        <RoutePlanMap
          ref={s.mapRef}
          style={styles.map}
          region={s.region}
          followUser={s.myLat != null && s.myLng != null}
          customers={s.filteredCustomers}
          activeVisitCustomerId={s.activeVisit?.customerId}
          polyCoords={s.polyCoords}
          onMarkerPress={(c) => s.openCustomerFromMap(c)}
        />

        <Text style={styles.mapHint}>
          Toque num marcador para Maps, Waze ou check-in.
        </Text>

        {s.optimized ? (
          <View style={styles.routeBox}>
            <Text style={styles.routeTitle}>
              Ordem sugerida · {s.optimized.totalKm.toFixed(1)} km · ~
              {s.optimized.totalMinutes} min
            </Text>
            <Text style={styles.routeDisclaimer}>
              {s.optimized.source === "google_routes"
                ? "Traçado por estrada (Google Routes)"
                : "Linha reta (Google indisponível)"}
            </Text>
            {s.optimized.orderedCustomers.map((c) => {
              const route = s.optimized!;
              const full = s.filteredCustomers.find((x) => x.id === c.id);
              if (!full) return null;
              const idx = s.routeOrderIndex.get(c.id);
              const legI = idx != null ? idx - 1 : -1;
              return (
                <View key={c.id}>
                  {legI >= 0 && route.legKm[legI] != null ? (
                    <Text style={styles.routeLegMeta}>
                      Perna {idx}: {route.legKm[legI]!.toFixed(1)} km
                      {route.legMinutes[legI] != null
                        ? ` · ~${route.legMinutes[legI]} min`
                        : ""}
                    </Text>
                  ) : null}
                  <RouteCustomerListItem
                    customer={full}
                    routeIndex={idx}
                    isActiveVisit={s.activeVisit?.customerId === c.id}
                    canCheckIn={!s.hasOpenVisit}
                    checkInPending={s.checkIn.isPending}
                    onPressCustomer={() => s.openCustomer(c.id)}
                    onCheckIn={() => s.requestCheckIn(full)}
                    onNavigateGoogle={() =>
                      void s.navigateToCustomer(full, "google")
                    }
                    onNavigateWaze={() =>
                      void s.navigateToCustomer(full, "waze")
                    }
                  />
                </View>
              );
            })}
            <Pressable onPress={s.clearOptimized}>
              <Text style={styles.clearRoute}>Limpar traçado</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.section}>
          Próximos ({s.filteredCustomers.length}
          {s.myClientsOnly ? " · meus" : ""} · {s.radiusKm} km)
        </Text>
        {s.nearbyQuery.isFetching ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
        ) : null}
        {s.filteredCustomers.length === 0 && s.nearbyQuery.isFetched ? (
          <Text style={styles.empty}>
            Sem clientes com coordenadas neste raio. Peça ao escritório para
            registar GPS ou aumente o raio.
          </Text>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={s.filteredCustomers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <RouteCustomerListItem
                customer={item}
                routeIndex={s.routeOrderIndex.get(item.id)}
                isActiveVisit={
                  s.activeVisit?.customerId === item.id && s.hasOpenVisit
                }
                canCheckIn={!s.hasOpenVisit}
                checkInPending={
                  s.checkIn.isPending && s.checkInModal?.id === item.id
                }
                onPressCustomer={() => s.openCustomer(item.id)}
                onCheckIn={() => s.requestCheckIn(item)}
                onNavigateGoogle={() =>
                  void s.navigateToCustomer(item, "google")
                }
                onNavigateWaze={() => void s.navigateToCustomer(item, "waze")}
              />
            )}
          />
        )}

        <Text style={styles.section}>Últimas visitas</Text>
        {s.recentVisits.slice(0, 8).map((v) => (
          <View key={v.id} style={styles.visitHist}>
            <Text style={styles.visitHistName}>{v.customerName}</Text>
            <Text style={styles.visitHistMeta}>
              {new Date(v.checkedInAt).toLocaleString("pt-BR")}
              {v.durationSeconds != null
                ? ` · ${s.formatVisitDuration(v.durationSeconds)}`
                : ""}
            </Text>
          </View>
        ))}

        <Link href="/quick-sale" asChild>
          <Pressable style={styles.linkQuickSale}>
            <Text style={styles.linkQuickSaleTxt}>Ir para venda rápida →</Text>
          </Pressable>
        </Link>
      </ScrollView>

      <VisitNotesModal
        visible={s.checkInModal != null}
        title="Check-in"
        subtitle={s.checkInModal ? s.checkInModal.name : undefined}
        confirmLabel="Iniciar visita"
        pending={s.checkIn.isPending}
        onClose={() => s.setCheckInModal(null)}
        onConfirm={(notes) => {
          if (s.checkInModal) s.submitCheckIn(s.checkInModal.id, notes);
        }}
      />

      <VisitNotesModal
        visible={s.checkOutModalOpen}
        title="Check-out"
        subtitle={s.activeVisit?.customerName}
        confirmLabel="Encerrar visita"
        pending={s.checkOut.isPending}
        onClose={() => s.setCheckOutModalOpen(false)}
        onConfirm={(notes) => s.submitCheckOut(notes)}
      />
    </SafeScreen>
  );
}
