import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { GripVertical } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Pressable,
    StyleSheet,
    Vibration,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";

const LONG_PRESS_MS = 5000;

type CellBox = { pageX: number; pageY: number; width: number; height: number };

type Props<T extends string> = {
  order: T[];
  renderItem: (id: T) => ReactNode;
  onSwap: (fromId: T, toId: T) => void;
  onItemPress?: (id: T) => void;
  /** Modo reordenar ativo (controlado pelo pai — banner flutuante). */
  active: boolean;
  onActiveChange: (active: boolean) => void;
  /** true só enquanto o dedo arrasta um item (pai pode pausar o scroll). */
  onDraggingItemChange?: (dragging: boolean) => void;
  variant?: "grid" | "stack";
  /** Desliga long-press (ex.: outro modo de reorder ativo). */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  gap?: number;
};

/**
 * Reorder por long-press (5s) + arrastar pelo handle.
 * Scroll permanece livre no modo edição; só pausa durante o arraste ativo.
 */
export function ReorderableBlocks<T extends string>({
  order,
  renderItem,
  onSwap,
  onItemPress,
  active,
  onActiveChange,
  onDraggingItemChange,
  variant = "grid",
  enabled = true,
  style,
  gap = 10,
}: Props<T>) {
  const { colors, isDark } = useTheme();
  const [draggingId, setDraggingId] = useState<T | null>(null);
  const [hoverId, setHoverId] = useState<T | null>(null);

  const layouts = useRef<Partial<Record<T, CellBox>>>({});
  const cellRefs = useRef<Partial<Record<T, View | null>>>({});
  const draggingRef = useRef<T | null>(null);
  const hoverRef = useRef<T | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    if (!active) {
      draggingRef.current = null;
      hoverRef.current = null;
      setDraggingId(null);
      setHoverId(null);
      onDraggingItemChange?.(false);
    }
  }, [active, onDraggingItemChange]);

  useEffect(() => {
    if (!enabled && active) onActiveChange(false);
  }, [enabled, active, onActiveChange]);

  const refreshLayouts = useCallback(() => {
    for (const id of orderRef.current) {
      cellRefs.current[id]?.measureInWindow((pageX, pageY, width, height) => {
        layouts.current[id] = { pageX, pageY, width, height };
      });
    }
  }, []);

  const hitTest = useCallback((pageX: number, pageY: number) => {
    for (const id of orderRef.current) {
      const box = layouts.current[id];
      if (!box) continue;
      if (
        pageX >= box.pageX &&
        pageX <= box.pageX + box.width &&
        pageY >= box.pageY &&
        pageY <= box.pageY + box.height
      ) {
        return id;
      }
    }
    return null;
  }, []);

  const enterReorder = useCallback(() => {
    if (!enabled) return;
    refreshLayouts();
    onActiveChange(true);
    Vibration.vibrate(30);
  }, [enabled, onActiveChange, refreshLayouts]);

  const beginDrag = useCallback(
    (id: T) => {
      if (!active) return;
      refreshLayouts();
      draggingRef.current = id;
      hoverRef.current = id;
      setDraggingId(id);
      setHoverId(id);
      onDraggingItemChange?.(true);
    },
    [active, onDraggingItemChange, refreshLayouts],
  );

  const endDrag = useCallback(
    (commit: boolean) => {
      const from = draggingRef.current;
      const to = hoverRef.current;
      if (commit && from && to && from !== to) {
        onSwap(from, to);
      }
      draggingRef.current = null;
      hoverRef.current = null;
      setDraggingId(null);
      setHoverId(null);
      onDraggingItemChange?.(false);
    },
    [onDraggingItemChange, onSwap],
  );

  return (
    <View style={style}>
      <View style={[styles.list, { gap }, variant === "grid" && styles.grid]}>
        {order.map((id) => {
          const isDragging = draggingId === id;
          const isHover =
            hoverId === id && draggingId != null && hoverId !== draggingId;

          return (
            <View
              key={id}
              ref={(node) => {
                cellRefs.current[id] = node;
              }}
              collapsable={false}
              style={[
                variant === "grid" ? styles.cellGrid : styles.cellStack,
                isDragging && styles.cellDragging,
                isHover && styles.cellHover,
              ]}
              onLayout={() => {
                cellRefs.current[id]?.measureInWindow(
                  (pageX, pageY, width, height) => {
                    layouts.current[id] = { pageX, pageY, width, height };
                  },
                );
              }}
            >
              {active ? (
                <View
                  accessibilityLabel="Arrastar para reordenar"
                  style={[
                    styles.dragHandle,
                    variant === "stack"
                      ? styles.dragHandleStack
                      : styles.dragHandleGrid,
                    {
                      backgroundColor: colorWithAlpha(
                        colors.primary,
                        isDark ? 0.22 : 0.14,
                      ),
                      borderColor: colorWithAlpha(colors.primary, 0.4),
                    },
                  ]}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                  onResponderGrant={() => {
                    beginDrag(id);
                  }}
                  onResponderMove={(e) => {
                    if (draggingRef.current !== id) return;
                    refreshLayouts();
                    const { pageX, pageY } = e.nativeEvent;
                    const over = hitTest(pageX, pageY);
                    hoverRef.current = over;
                    setHoverId(over);
                  }}
                  onResponderRelease={() => {
                    endDrag(true);
                  }}
                  onResponderTerminate={() => {
                    endDrag(false);
                  }}
                >
                  <GripVertical
                    color={colors.primary}
                    size={18}
                    strokeWidth={2.5}
                  />
                </View>
              ) : null}

              {variant === "stack" ? (
                <View>
                  {enabled && !active ? (
                    <Pressable
                      accessibilityLabel="Segure para reordenar esta seção"
                      delayLongPress={LONG_PRESS_MS}
                      onLongPress={enterReorder}
                      style={styles.stackLongPressHit}
                    />
                  ) : null}
                  <View
                    pointerEvents={draggingId ? "none" : "auto"}
                    style={[
                      active && styles.reorderIdle,
                      isDragging && styles.lifted,
                    ]}
                  >
                    {renderItem(id)}
                  </View>
                </View>
              ) : (
                <Pressable
                  delayLongPress={LONG_PRESS_MS}
                  onLongPress={enterReorder}
                  onPress={() => {
                    if (!active) onItemPress?.(id);
                  }}
                  disabled={!enabled || active}
                  accessibilityHint="Segure por 5 segundos para reordenar"
                >
                  <View
                    pointerEvents="none"
                    style={[
                      active && styles.reorderIdle,
                      isDragging && styles.lifted,
                    ]}
                  >
                    {renderItem(id)}
                  </View>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export { ReorderableBlocks as ReorderableIndicatorGrid };

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cellGrid: {
    width: "48%",
    position: "relative",
  },
  cellStack: {
    width: "100%",
    position: "relative",
  },
  stackLongPressHit: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    zIndex: 4,
  },
  dragHandle: {
    position: "absolute",
    zIndex: 30,
    elevation: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandleGrid: {
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  dragHandleStack: {
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  cellDragging: {
    zIndex: 20,
    elevation: 8,
  },
  cellHover: {
    opacity: 0.7,
    transform: [{ scale: 0.985 }],
  },
  reorderIdle: {
    opacity: 0.92,
  },
  lifted: {
    opacity: 1,
    transform: [{ scale: 1.02 }],
  },
});
