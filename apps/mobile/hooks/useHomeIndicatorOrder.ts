import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pedixpro_home_indicator_order_v1";

export const HOME_INDICATOR_IDS = [
  "sales_today",
  "orders",
  "commission",
  "ranking",
  "pending_sync",
  "sales_month",
  "avg_ticket",
] as const;

export type HomeIndicatorId = (typeof HOME_INDICATOR_IDS)[number];

const DEFAULT_SELLER: HomeIndicatorId[] = [
  "sales_today",
  "orders",
  "commission",
  "pending_sync",
  "sales_month",
  "avg_ticket",
];

const DEFAULT_ADMIN: HomeIndicatorId[] = [
  "sales_today",
  "orders",
  "ranking",
  "pending_sync",
  "sales_month",
  "avg_ticket",
];

const DEFAULT_BASE: HomeIndicatorId[] = [
  "sales_today",
  "orders",
  "pending_sync",
  "sales_month",
  "avg_ticket",
];

function defaultsForRole(role?: string | null): HomeIndicatorId[] {
  if (role === "SELLER") return DEFAULT_SELLER;
  if (role === "ADMIN") return DEFAULT_ADMIN;
  return DEFAULT_BASE;
}

function normalizeOrder(
  raw: unknown,
  role?: string | null,
): HomeIndicatorId[] {
  const allowed = new Set(defaultsForRole(role));
  const fromStorage = Array.isArray(raw)
    ? raw.filter(
        (id): id is HomeIndicatorId =>
          typeof id === "string" && allowed.has(id as HomeIndicatorId),
      )
    : [];
  const missing = defaultsForRole(role).filter((id) => !fromStorage.includes(id));
  return [...fromStorage, ...missing];
}

/** Ordem dos cards de indicadores da home (persistida). */
export function useHomeIndicatorOrder(role?: string | null) {
  const fallback = useMemo(() => defaultsForRole(role), [role]);
  const [order, setOrderState] = useState<HomeIndicatorId[]>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          setOrderState(normalizeOrder(JSON.parse(raw), role));
        } catch {
          setOrderState(defaultsForRole(role));
        }
      } else {
        setOrderState(defaultsForRole(role));
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const setOrder = useCallback((next: HomeIndicatorId[]) => {
    setOrderState(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const swap = useCallback((fromId: HomeIndicatorId, toId: HomeIndicatorId) => {
    if (fromId === toId) return;
    setOrderState((prev) => {
      const a = prev.indexOf(fromId);
      const b = prev.indexOf(toId);
      if (a < 0 || b < 0) return prev;
      const next = [...prev];
      next[a] = toId;
      next[b] = fromId;
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { order, setOrder, swap, ready };
}
