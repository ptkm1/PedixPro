import L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const DEFAULT_CENTER: L.LatLngExpression = [-14.235, -51.9253];
const DEFAULT_ZOOM = 4;
const PIN_ZOOM = 16;

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;margin-left:-11px;margin-top:-22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function parseCoord(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatCoord(n: number): string {
  return String(Number(n.toFixed(8)));
}

/** Aceita "lat,lng", "lat lng" ou dois números grudados com sinais (-12.8-38.4). */
export function splitLatLngPaste(raw: string): { lat: string; lng: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const comma = t.match(
    /^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/,
  );
  if (comma) {
    return {
      lat: comma[1]!.replace(",", "."),
      lng: comma[2]!.replace(",", "."),
    };
  }
  const glued = t.match(/^(-?\d+(?:[.,]\d+)?)(-?\d+(?:[.,]\d+)?)$/);
  if (glued) {
    return {
      lat: glued[1]!.replace(",", "."),
      lng: glued[2]!.replace(",", "."),
    };
  }
  return null;
}

type LocationPinMapProps = {
  latitude: string;
  longitude: string;
  onChange: (latitude: string, longitude: string) => void;
  className?: string;
  /** Remonta o mapa (ex.: ao abrir o sheet). */
  active?: boolean;
};

/**
 * Mapa OpenStreetMap: clique para pinar e preencher lat/lng.
 * Funciona sem chave Google (mesmo fallback do rastreio de vendedores).
 */
export function LocationPinMap({
  latitude,
  longitude,
  onChange,
  className,
  active = true,
}: LocationPinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lat = parseCoord(latitude);
  const lng = parseCoord(longitude);
  const hasPin =
    lat != null &&
    lng != null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  useEffect(() => {
    if (!active || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current(formatCoord(e.latlng.lat), formatCoord(e.latlng.lng));
    });

    mapRef.current = map;

    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 80);

    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active) return;

    if (!hasPin || lat == null || lng == null) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }

    const pos = L.latLng(lat, lng);
    if (!markerRef.current) {
      markerRef.current = L.marker(pos, {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current?.getLatLng();
        if (p) onChangeRef.current(formatCoord(p.lat), formatCoord(p.lng));
      });
      map.setView(pos, Math.max(map.getZoom(), PIN_ZOOM));
    } else {
      const cur = markerRef.current.getLatLng();
      if (Math.abs(cur.lat - lat) > 1e-8 || Math.abs(cur.lng - lng) > 1e-8) {
        markerRef.current.setLatLng(pos);
      }
    }

    window.setTimeout(() => map.invalidateSize(), 40);
  }, [active, hasPin, lat, lng]);

  if (!active) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div
        ref={containerRef}
        className="h-56 w-full overflow-hidden rounded-lg border border-border z-0"
        role="application"
        aria-label="Mapa para marcar a localização do cliente"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Clique no mapa para marcar o ponto, ou arraste o pin. Os campos de
          latitude e longitude são atualizados automaticamente.
        </p>
        {hasPin ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange("", "")}
          >
            Limpar pin
          </Button>
        ) : null}
      </div>
    </div>
  );
}
