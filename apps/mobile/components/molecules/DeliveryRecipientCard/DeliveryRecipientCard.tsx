import { GlassSurface } from "@/components/atoms/GlassSurface";
import { MiniMapThumb } from "@/components/molecules/MiniMapThumb";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { openGoogleMapsNavigation } from "@/lib/utils/open-navigation";
import { formatStructuredAddress } from "@pedidos/shared";
import { MapPinned } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type DeliveryRecipientCustomer = {
  name: string;
  tradeName?: string | null;
  legalName?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  latitude?: unknown;
  longitude?: unknown;
};

function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const n = Number(value.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object") {
    const dec = value as { toNumber?: () => number; toString?: () => string };
    if (typeof dec.toNumber === "function") {
      const n = dec.toNumber();
      return Number.isFinite(n) ? n : null;
    }
    if (typeof dec.toString === "function") {
      const n = Number(dec.toString());
      return Number.isFinite(n) ? n : null;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addressLines(c: DeliveryRecipientCustomer): string[] {
  const line1 = [c.street?.trim(), c.number?.trim()].filter(Boolean).join(", ");
  const line2 = [
    c.neighborhood?.trim(),
    [c.city?.trim(), c.state?.trim()].filter(Boolean).join("/"),
    c.cep?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");

  if (line1 || line2) {
    return [line1, line2].filter(Boolean);
  }
  const fallback = formatStructuredAddress(c);
  return fallback ? [fallback] : [];
}

export type DeliveryRecipientCardProps = {
  customer: DeliveryRecipientCustomer;
  /** Título da seção acima do card. Default: "Entregar em". */
  sectionTitle?: string;
  /** `flat` = só o conteúdo (quando já está dentro de outro card). */
  variant?: "card" | "flat";
  /** Permite abrir navegação ao tocar no mapa (quando há coords). */
  openMapsOnPress?: boolean;
};

/**
 * Card estilo “Delivery to”: miniatura de mapa + destinatário/endereço.
 */
export function DeliveryRecipientCard({
  customer,
  sectionTitle = "Entregar em",
  variant = "card",
  openMapsOnPress = true,
}: DeliveryRecipientCardProps) {
  const { colors } = useTheme();
  const lat = parseCoord(customer.latitude);
  const lng = parseCoord(customer.longitude);
  const hasCoords = lat != null && lng != null;
  const recipient =
    customer.tradeName?.trim() ||
    customer.legalName?.trim() ||
    customer.name.trim() ||
    "Cliente";
  const lines = addressLines(customer);
  const addressText =
    lines.length > 0 ? lines.join("\n") : "Endereço não cadastrado";

  const onMapPress = () => {
    if (!openMapsOnPress || !hasCoords) return;
    void openGoogleMapsNavigation(lat, lng, recipient).catch(() => {
      /* silencioso — UX do card não depende do Maps */
    });
  };

  const body = (
    <View style={styles.row}>
      {hasCoords ? (
        <Pressable
          onPress={onMapPress}
          disabled={!openMapsOnPress}
          accessibilityLabel={
            openMapsOnPress ? "Abrir mapa de navegação" : "Mapa do endereço"
          }
          style={styles.mapPress}
        >
          <MiniMapThumb latitude={lat} longitude={lng} size={76} />
        </Pressable>
      ) : (
        <View
          style={[
            styles.mapPh,
            {
              backgroundColor: colorWithAlpha(colors.primary, 0.1),
              borderColor: colorWithAlpha(colors.primary, 0.2),
            },
          ]}
        >
          <MapPinned size={26} color={colors.primary} strokeWidth={2} />
        </View>
      )}

      <View style={styles.info}>
        <Text style={[styles.recipientLabel, { color: colors.text }]}>
          Destinatário
        </Text>
        <Text
          style={[styles.recipientName, { color: colors.text }]}
          numberOfLines={1}
        >
          {recipient}
        </Text>
        <Text
          style={[
            styles.address,
            {
              color: lines.length > 0 ? colors.textSecondary : colors.textMuted,
            },
          ]}
          numberOfLines={3}
        >
          {addressText}
        </Text>
      </View>
    </View>
  );

  if (variant === "flat") {
    return <View style={styles.flatRoot}>{body}</View>;
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {sectionTitle}
      </Text>
      <GlassSurface contentStyle={styles.cardInner} radius={16}>
        {body}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  flatRoot: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  cardInner: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  mapPress: {
    borderRadius: 12,
    overflow: "hidden",
  },
  mapPh: {
    width: 76,
    height: 76,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  recipientLabel: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  recipientName: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  address: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    marginTop: 2,
  },
});
