import { ConfirmModal } from "@/components/molecules/ConfirmModal";
import type {
  AlertOptions,
  ChooseOptions,
  ConfirmDialogState,
  ConfirmOptions,
} from "@/components/molecules/ConfirmModal";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { InteractionManager, StyleSheet, View } from "react-native";

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
  /** Lista de ações (substitui Alert multi-botão / action sheet). */
  choose: (options: ChooseOptions) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type ResolveFn = (value: boolean | string | null) => void;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmDialogState | null>(null);
  const resolveRef = useRef<ResolveFn | null>(null);

  const close = useCallback((result: boolean | string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setState(null);
    // Deferir o resolve para o Modal desmontar antes de callers (ex.:
    // request*Permissions) abrirem o diálogo do SO por cima do disclosure.
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        resolve?.(result);
      });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = (value) => resolve(Boolean(value));
      setState({
        mode: "confirm",
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? "Confirmar",
        cancelLabel: options.cancelLabel ?? "Cancelar",
        tone: options.tone ?? "default",
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = () => resolve();
      setState({
        mode: "alert",
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? "OK",
        cancelLabel: "Cancelar",
        tone: options.tone ?? "default",
      });
    });
  }, []);

  const choose = useCallback((options: ChooseOptions) => {
    return new Promise<string | null>((resolve) => {
      resolveRef.current = (value) => {
        if (typeof value === "string") resolve(value);
        else resolve(null);
      };
      setState({
        mode: "choose",
        title: options.title,
        description: options.description,
        confirmLabel: "OK",
        cancelLabel: options.cancelLabel ?? "Fechar",
        tone: "default",
        options: options.options,
      });
    });
  }, []);

  const value = useMemo(
    () => ({ confirm, alert, choose }),
    [confirm, alert, choose],
  );

  return (
    <ConfirmContext.Provider value={value}>
      <View style={styles.root} pointerEvents="box-none">
        {children}
        {state ? (
          <ConfirmModal
            visible
            mode={state.mode}
            title={state.title}
            description={state.description}
            confirmLabel={state.confirmLabel}
            cancelLabel={state.cancelLabel}
            tone={state.tone}
            options={state.options}
            onConfirm={() => close(true)}
            onCancel={() => {
              if (state.mode === "confirm") close(false);
              else if (state.mode === "choose") close(null);
              else close(true);
            }}
            onChoose={(id) => close(id)}
          />
        ) : null}
      </View>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm deve ser usado dentro de ConfirmProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
