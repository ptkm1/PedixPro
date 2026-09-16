import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pedixpro_home_section_order_v1";

export const HOME_SECTION_IDS = [
  "stats",
  "goal",
  "top_suppliers",
  "sales_period",
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

const DEFAULT_ORDER: HomeSectionId[] = [
  "stats",
  "goal",
  "top_suppliers",
  "sales_period",
];

function normalizeOrder(raw: unknown): HomeSectionId[] {
  const allowed = new Set<string>(HOME_SECTION_IDS);
  const fromStorage = Array.isArray(raw)
    ? raw.filter(
        (id): id is HomeSectionId =>
          typeof id === "string" && allowed.has(id),
      )
    : [];
  const missing = DEFAULT_ORDER.filter((id) => !fromStorage.includes(id));
  return [...fromStorage, ...missing];
}

/** Ordem das seções da home (cards + gráficos), persistida. */
export function useHomeSectionOrder() {
  const fallback = useMemo(() => DEFAULT_ORDER, []);
  const [order, setOrderState] = useState<HomeSectionId[]>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          setOrderState(normalizeOrder(JSON.parse(raw)));
        } catch {
          setOrderState(DEFAULT_ORDER);
        }
      } else {
        setOrderState(DEFAULT_ORDER);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const swap = useCallback((fromId: HomeSectionId, toId: HomeSectionId) => {
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

  return { order, swap, ready };
}
