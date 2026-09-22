import { BlurTargetView } from "expo-blur";
import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { StyleSheet, View } from "react-native";

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

/** Ref do BlurTargetView ancestral — necessário no Android (dimezisBlurView). */
export function useBlurTarget(): RefObject<View | null> | null {
  return useContext(BlurTargetContext);
}

type Props = {
  children: ReactNode;
  /** Conteúdo a ser borrado (ex.: gradiente de fundo). */
  backdrop?: ReactNode;
};

/**
 * Expõe um BlurTargetView para BlurViews filhos (GlassSurface / FAB).
 * No Android, BlurView exige blurTarget quando usa dimezisBlurView.
 */
export function BlurTargetProvider({ children, backdrop }: Props) {
  const targetRef = useRef<View | null>(null);

  return (
    <BlurTargetContext.Provider value={targetRef}>
      <View style={styles.fill}>
        <BlurTargetView
          ref={targetRef}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        >
          {backdrop}
        </BlurTargetView>
        {children}
      </View>
    </BlurTargetContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
