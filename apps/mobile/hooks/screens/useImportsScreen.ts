import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import {
    CUSTOMER_CSV_ADDRESS_FALLBACK,
    CUSTOMER_CSV_BULK_FIELDS,
    CUSTOMER_CSV_HEADERS,
    PRODUCT_CSV_HEADERS,
    customerCsvTemplate,
    peekCsvHeaders,
    productCsvTemplate,
    suggestCsvColumnMap,
    type CsvColumnMap,
    type CsvHeaderPeek,
    type CsvImportRecipe,
} from "@pedidos/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

export type ImportKind = "products" | "customers";

export type CsvImportResult = {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  createdCount?: number;
  rows: Array<{
    line: number;
    status: "ok" | "error";
    errors: Array<{ field: string; message: string }>;
    preview?: Record<string, string>;
  }>;
};

const META: Record<
  ImportKind,
  {
    title: string;
    templateName: string;
    template: () => string;
    previewPath: string;
    commitPath: string;
  }
> = {
  products: {
    title: "Produtos",
    templateName: "produtos-modelo.csv",
    template: productCsvTemplate,
    previewPath: "/admin/imports/products/preview",
    commitPath: "/admin/imports/products/commit",
  },
  customers: {
    title: "Clientes",
    templateName: "clientes-modelo.csv",
    template: customerCsvTemplate,
    previewPath: "/admin/imports/customers/preview",
    commitPath: "/admin/imports/customers/commit",
  },
};

const RECIPE_KEY = (kind: ImportKind) => `pedidos_csv_recipes_${kind}`;

function targetFields(kind: ImportKind): readonly string[] {
  return kind === "customers" ? CUSTOMER_CSV_HEADERS : PRODUCT_CSV_HEADERS;
}

function cleanDefaults(d: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v.trim()) out[k] = v.trim();
  }
  return out;
}

export function useImportsScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [kind, setKind] = useState<ImportKind>("customers");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<CsvHeaderPeek[]>([]);
  const [columnMap, setColumnMap] = useState<CsvColumnMap>({});
  const [fieldDefaults, setFieldDefaults] = useState<Record<string, string>>(
    {},
  );
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [committed, setCommitted] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [commitPending, setCommitPending] = useState(false);
  const [recipes, setRecipes] = useState<CsvImportRecipe[]>([]);
  const [recipeName, setRecipeName] = useState("");

  const meta = META[kind];
  const fields = useMemo(() => targetFields(kind), [kind]);

  const errorRows = useMemo(
    () => result?.rows.filter((r) => r.status === "error") ?? [],
    [result],
  );

  const errorFieldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of errorRows) {
      const seen = new Set<string>();
      for (const err of row.errors) {
        if (!err.field || err.field === "_" || seen.has(err.field)) continue;
        seen.add(err.field);
        counts.set(err.field, (counts.get(err.field) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([field]) =>
        (CUSTOMER_CSV_BULK_FIELDS as readonly string[]).includes(field),
      )
      .sort((a, b) => b[1] - a[1]);
  }, [errorRows]);

  const mappedCount = useMemo(
    () => Object.values(columnMap).filter((v) => v?.trim()).length,
    [columnMap],
  );

  const loadRecipes = useCallback(async (k: ImportKind) => {
    try {
      const raw = await AsyncStorage.getItem(RECIPE_KEY(k));
      if (!raw) {
        setRecipes([]);
        return;
      }
      const parsed = JSON.parse(raw) as CsvImportRecipe[];
      setRecipes(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRecipes([]);
    }
  }, []);

  useEffect(() => {
    void loadRecipes(kind);
  }, [kind, loadRecipes]);

  const resetFile = useCallback(() => {
    setFileName(null);
    setCsvText(null);
    setHeaders([]);
    setColumnMap({});
    setFieldDefaults({});
    setResult(null);
    setCommitted(false);
    setRecipeName("");
  }, []);

  const selectKind = useCallback(
    (next: ImportKind) => {
      setKind(next);
      resetFile();
    },
    [resetFile],
  );

  const setFieldMap = useCallback((field: string, sourceKey: string) => {
    setColumnMap((prev) => ({ ...prev, [field]: sourceKey }));
    setResult(null);
    setCommitted(false);
  }, []);

  const setDefaultField = useCallback((field: string, value: string) => {
    setFieldDefaults((prev) => ({ ...prev, [field]: value }));
    setCommitted(false);
  }, []);

  const applyAddressFallback = useCallback(() => {
    setFieldDefaults((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(CUSTOMER_CSV_ADDRESS_FALLBACK).filter(([, v]) =>
          Boolean(v),
        ),
      ),
    }));
    setCommitted(false);
  }, []);

  const applyRecipe = useCallback((recipe: CsvImportRecipe) => {
    setColumnMap({ ...recipe.columnMap });
    setRecipeName(recipe.name);
    setResult(null);
    setCommitted(false);
  }, []);

  const saveRecipe = useCallback(async () => {
    const name = recipeName.trim();
    if (!name) {
      Alert.alert("Receita", "Informe um nome (ex.: Softvar).");
      return;
    }
    const next: CsvImportRecipe = {
      id: `r_${Date.now()}`,
      name,
      kind,
      columnMap: { ...columnMap },
      createdAt: new Date().toISOString(),
    };
    const list = [
      next,
      ...recipes.filter((r) => r.name !== name),
    ].slice(0, 20);
    await AsyncStorage.setItem(RECIPE_KEY(kind), JSON.stringify(list));
    setRecipes(list);
    Alert.alert("Receita", `“${name}” salva neste aparelho.`);
  }, [columnMap, kind, recipeName, recipes]);

  const pickFile = useCallback(async () => {
    try {
      const DocumentPicker = await import("expo-document-picker");
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      const FileSystem = await import("expo-file-system/legacy");
      const text = await FileSystem.readAsStringAsync(asset.uri);
      setFileName(asset.name || "arquivo.csv");
      setCsvText(text);
      const peeked = peekCsvHeaders(text);
      setHeaders(peeked);
      setColumnMap(suggestCsvColumnMap(kind, peeked.map((h) => h.key)));
      setFieldDefaults({});
      setResult(null);
      setCommitted(false);
    } catch (e) {
      Alert.alert(
        "Arquivo",
        e instanceof Error ? e.message : "Não foi possível ler o CSV.",
      );
    }
  }, [kind]);

  const shareTemplate = useCallback(async () => {
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const dest = `${FileSystem.cacheDirectory ?? ""}${meta.templateName}`;
      await FileSystem.writeAsStringAsync(dest, meta.template(), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Compartilhar", "Compartilhamento indisponível neste aparelho.");
        return;
      }
      await Sharing.shareAsync(dest, {
        mimeType: "text/csv",
        dialogTitle: meta.templateName,
      });
    } catch (e) {
      Alert.alert(
        "Modelo",
        e instanceof Error ? e.message : "Falha ao gerar o modelo CSV.",
      );
    }
  }, [meta]);

  const runPreview = useCallback(async () => {
    if (!csvText) return;
    setPreviewPending(true);
    try {
      const data = await apiFetch<CsvImportResult>(meta.previewPath, {
        method: "POST",
        body: JSON.stringify({
          csvText,
          columnMap,
          fieldDefaults: cleanDefaults(fieldDefaults),
        }),
      });
      setResult(data);
      setCommitted(false);
    } catch (e) {
      Alert.alert(
        "Validação",
        e instanceof Error ? e.message : "Falha ao validar o CSV.",
      );
    } finally {
      setPreviewPending(false);
    }
  }, [columnMap, csvText, fieldDefaults, meta.previewPath]);

  const runCommit = useCallback(async () => {
    if (!csvText || !result || result.validCount === 0) return;
    setCommitPending(true);
    try {
      const data = await apiFetch<CsvImportResult>(meta.commitPath, {
        method: "POST",
        body: JSON.stringify({
          csvText,
          columnMap,
          fieldDefaults: cleanDefaults(fieldDefaults),
        }),
      });
      setResult(data);
      setCommitted(true);
      const n = data.createdCount ?? 0;
      Alert.alert(
        "Importação",
        n > 0
          ? `${n} registro(s) criado(s). Linhas inválidas ficaram listadas.`
          : "Nenhuma linha válida foi importada.",
      );
    } catch (e) {
      Alert.alert(
        "Importação",
        e instanceof Error ? e.message : "Falha ao importar.",
      );
    } finally {
      setCommitPending(false);
    }
  }, [columnMap, csvText, fieldDefaults, meta.commitPath, result]);

  return {
    isAdmin,
    kind,
    selectKind,
    meta,
    fields,
    fileName,
    csvText,
    headers,
    columnMap,
    setFieldMap,
    fieldDefaults,
    setDefaultField,
    applyAddressFallback,
    errorFieldCounts,
    mappedCount,
    result,
    errorRows,
    committed,
    busy: previewPending || commitPending,
    previewPending,
    commitPending,
    recipes,
    recipeName,
    setRecipeName,
    applyRecipe,
    saveRecipe,
    pickFile,
    shareTemplate,
    runPreview,
    runCommit,
  };
}
