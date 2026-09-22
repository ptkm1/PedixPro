import { FormSheet } from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifyError, notifySuccess } from "@/lib/app-notifications";
import { apiFetch, downloadPdf } from "@/lib/api";
import { getErrorMessage } from "@/lib/api-error";
import {
  CUSTOMER_CSV_ADDRESS_FALLBACK,
  CUSTOMER_CSV_BULK_FIELDS,
  CUSTOMER_CSV_HEADERS,
  PRODUCT_CSV_HEADERS,
  csvFieldLabel,
  peekCsvHeaders,
  suggestCsvColumnMap,
  type CsvColumnMap,
  type CsvHeaderPeek,
  type CsvImportKind,
  type CsvImportRecipe,
} from "@pedidos/shared";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export type CsvImportResult = {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  createdCount?: number;
  rows: Array<{
    line: number;
    status: "ok" | "error";
    errors: Array<{ field: string; message: string }>;
    warnings?: string[];
    preview?: Record<string, string>;
  }>;
};

type CsvImportSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CsvImportKind;
  title: string;
  description?: string;
  templatePath: string;
  templateFilename: string;
  previewPath: string;
  commitPath: string;
  onImported?: () => void;
};

const RECIPE_PREFIX = "pedidos_csv_recipes_";

const BULK_QUICK: Record<string, string> = {
  telefone: "0000000000",
  email: "",
  numero: "S/N",
  complemento: "não possui",
  bairro: "não possui",
  logradouro: "não possui",
  inscricao_estadual: "indisponível",
  comprador: "não possui",
};

function loadRecipes(kind: CsvImportKind): CsvImportRecipe[] {
  try {
    const raw = localStorage.getItem(`${RECIPE_PREFIX}${kind}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CsvImportRecipe[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecipes(kind: CsvImportKind, recipes: CsvImportRecipe[]) {
  localStorage.setItem(`${RECIPE_PREFIX}${kind}`, JSON.stringify(recipes));
}

function targetFields(kind: CsvImportKind): readonly string[] {
  return kind === "customers" ? CUSTOMER_CSV_HEADERS : PRODUCT_CSV_HEADERS;
}

function cleanDefaults(d: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v.trim()) out[k] = v.trim();
  }
  return out;
}

export function CsvImportSheet({
  open,
  onOpenChange,
  kind,
  title,
  description,
  templatePath,
  templateFilename,
  previewPath,
  commitPath,
  onImported,
}: CsvImportSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<CsvHeaderPeek[]>([]);
  const [columnMap, setColumnMap] = useState<CsvColumnMap>({});
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [committed, setCommitted] = useState(false);
  const [recipes, setRecipes] = useState<CsvImportRecipe[]>(() =>
    loadRecipes(kind),
  );
  const [recipeId, setRecipeId] = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [fieldDefaults, setFieldDefaults] = useState<Record<string, string>>(
    {},
  );

  const fields = useMemo(() => targetFields(kind), [kind]);

  const reset = () => {
    setFileName(null);
    setCsvText(null);
    setHeaders([]);
    setColumnMap({});
    setResult(null);
    setCommitted(false);
    setRecipeId("");
    setRecipeName("");
    setFieldDefaults({});
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    else setRecipes(loadRecipes(kind));
    onOpenChange(next);
  };

  const preview = useMutation({
    mutationFn: (payload: {
      text: string;
      map: CsvColumnMap;
      defaults: Record<string, string>;
    }) =>
      apiFetch<CsvImportResult>(previewPath, {
        method: "POST",
        body: JSON.stringify({
          csvText: payload.text,
          columnMap: payload.map,
          fieldDefaults: cleanDefaults(payload.defaults),
        }),
      }),
    onSuccess: (data) => {
      setResult(data);
      setCommitted(false);
    },
    onError: (err) => {
      notifyError(getErrorMessage(err), "Validação falhou");
    },
  });

  const commit = useMutation({
    mutationFn: (payload: {
      text: string;
      map: CsvColumnMap;
      defaults: Record<string, string>;
    }) =>
      apiFetch<CsvImportResult>(commitPath, {
        method: "POST",
        body: JSON.stringify({
          csvText: payload.text,
          columnMap: payload.map,
          fieldDefaults: cleanDefaults(payload.defaults),
        }),
      }),
    onSuccess: (data) => {
      setResult(data);
      setCommitted(true);
      const n = data.createdCount ?? data.validCount;
      notifySuccess(
        n > 0
          ? `${n} registro(s) importado(s).`
          : "Nenhuma linha válida para importar.",
      );
      onImported?.();
    },
    onError: (err) => {
      notifyError(getErrorMessage(err), "Importação falhou");
    },
  });

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setCommitted(false);
    setFieldDefaults({});
    const text = await file.text();
    setCsvText(text);
    const peeked = peekCsvHeaders(text);
    setHeaders(peeked);
    const suggested = suggestCsvColumnMap(
      kind,
      peeked.map((h) => h.key),
    );
    setColumnMap(suggested);
    setRecipeId("");
  };

  const applyRecipe = (id: string) => {
    setRecipeId(id);
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    setColumnMap({ ...r.columnMap });
    setRecipeName(r.name);
    setResult(null);
    setCommitted(false);
  };

  const persistRecipe = () => {
    const name = recipeName.trim();
    if (!name) {
      notifyError("Informe um nome para a receita.", "Receita");
      return;
    }
    const next: CsvImportRecipe = {
      id: recipeId || `r_${Date.now()}`,
      name,
      kind,
      columnMap: { ...columnMap },
      createdAt: new Date().toISOString(),
    };
    const list = [
      next,
      ...recipes.filter((r) => r.id !== next.id && r.name !== name),
    ].slice(0, 20);
    saveRecipes(kind, list);
    setRecipes(list);
    setRecipeId(next.id);
    notifySuccess(`Receita “${name}” salva neste navegador.`);
  };

  const errorRows = result?.rows.filter((r) => r.status === "error") ?? [];
  const okRows = result?.rows.filter((r) => r.status === "ok") ?? [];
  const validCount = result?.validCount ?? 0;
  const busy = preview.isPending || commit.isPending;
  const mappedCount = Object.values(columnMap).filter((v) => v?.trim()).length;

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

  const runPreview = () => {
    if (!csvText) return;
    preview.mutate({
      text: csvText,
      map: columnMap,
      defaults: fieldDefaults,
    });
  };

  const applyAddressFallback = () => {
    setFieldDefaults((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(CUSTOMER_CSV_ADDRESS_FALLBACK).filter(([, v]) =>
          Boolean(v),
        ),
      ),
    }));
    setCommitted(false);
  };

  const sourceOptions = headers.map((h) => ({
    value: h.key,
    label: h.raw || h.key,
  }));

  return (
    <FormSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={
        description ??
        "Mapeie as colunas do seu CSV (qualquer sistema), valide e importe só as linhas válidas."
      }
      contentClassName="max-h-[92vh]"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={commit.isPending}
          >
            Fechar
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!csvText || validCount === 0) return;
              commit.mutate({
                text: csvText,
                map: columnMap,
                defaults: fieldDefaults,
              });
            }}
            disabled={!csvText || validCount === 0 || busy || committed}
          >
            {commit.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importando…
              </>
            ) : (
              `Importar ${validCount} válido(s)`
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void downloadPdf(templatePath, templateFilename).catch((err) =>
                notifyError(getErrorMessage(err), "Download falhou"),
              )
            }
          >
            Baixar modelo Pedix
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Selecionar arquivo
          </Button>
          <Button
            type="button"
            disabled={!csvText || busy || mappedCount === 0}
            onClick={runPreview}
          >
            {preview.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Validando…
              </>
            ) : (
              "Validar"
            )}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {fileName ? (
          <p className="text-sm text-muted-foreground">
            Arquivo:{" "}
            <span className="font-medium text-foreground">{fileName}</span>
            {headers.length
              ? ` · ${headers.length} coluna(s) · ${mappedCount} mapeada(s)`
              : null}
          </p>
        ) : null}

        {headers.length > 0 ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-[12rem] flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Receita salva
                </p>
                <AppSelect
                  value={recipeId}
                  onValueChange={applyRecipe}
                  emptyLabel="Nenhuma (usar sugestão)"
                  options={recipes.map((r) => ({
                    value: r.id,
                    label: r.name,
                  }))}
                />
              </div>
              <div className="flex flex-1 gap-2">
                <Input
                  placeholder="Nome da receita (ex.: Softvar)"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={persistRecipe}
                  disabled={busy}
                >
                  Salvar mapa
                </Button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Coluna do arquivo → campo Pedix. Ajuste se a sugestão automática
              errar. E-mail/telefone vazios e IBGE (cidade+UF) são preenchidos
              automaticamente no servidor quando possível.
            </p>
            {kind === "customers" ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Caso o <strong>código IBGE</strong> não seja informado, o Pedix
                Pro tentará identificá-lo automaticamente através do CEP, CNPJ
                ou município/UF. O mapeamento desse campo é opcional.
              </p>
            ) : null}

            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campo Pedix</TableHead>
                    <TableHead>Coluna do CSV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field) => (
                    <TableRow key={field}>
                      <TableCell className="text-sm">
                        <span className="font-medium">
                          {csvFieldLabel(kind, field)}
                        </span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {field}
                        </span>
                      </TableCell>
                      <TableCell>
                        <AppSelect
                          value={columnMap[field] ?? ""}
                          onValueChange={(v) => {
                            setColumnMap((prev) => ({ ...prev, [field]: v }));
                            setResult(null);
                            setCommitted(false);
                          }}
                          emptyLabel="— não mapear —"
                          options={sourceOptions.filter(
                            (o) =>
                              o.value === (columnMap[field] ?? "") ||
                              !Object.entries(columnMap).some(
                                ([t, s]) => t !== field && s === o.value,
                              ),
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              {result.totalRows} linha(s) · {result.validCount} válida(s) ·{" "}
              {result.invalidCount} com erro
              {committed && result.createdCount != null
                ? ` · ${result.createdCount} criada(s)`
                : null}
            </p>

            {kind === "customers" &&
            !committed &&
            (errorFieldCounts.length > 0 ||
              Object.keys(fieldDefaults).length > 0) ? (
              <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Correção em massa (opcional)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Valores abaixo preenchem só células vazias (ou telefone
                      inválido). Depois clique em Validar de novo.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={applyAddressFallback}
                    >
                      Pacote endereço mínimo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || !csvText}
                      onClick={runPreview}
                    >
                      {preview.isPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Revalidando…
                        </>
                      ) : (
                        "Revalidar com correções"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {(errorFieldCounts.length
                    ? errorFieldCounts.map(([f]) => f)
                    : CUSTOMER_CSV_BULK_FIELDS.filter(
                        (f) => fieldDefaults[f],
                      )
                  )
                    .filter(
                      (f, i, arr) =>
                        arr.indexOf(f) === i &&
                        (CUSTOMER_CSV_BULK_FIELDS as readonly string[]).includes(
                          f,
                        ),
                    )
                    .map((field) => {
                      const count =
                        errorFieldCounts.find(([f]) => f === field)?.[1] ?? 0;
                      const quick = BULK_QUICK[field];
                      return (
                        <div key={field} className="space-y-1">
                          <label className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
                            <span>
                              {csvFieldLabel(kind, field)}
                              {count > 0 ? (
                                <span className="ml-1 text-muted-foreground">
                                  ({count} linha
                                  {count === 1 ? "" : "s"})
                                </span>
                              ) : null}
                            </span>
                            {quick != null && quick !== "" ? (
                              <button
                                type="button"
                                className="text-xs text-primary underline-offset-2 hover:underline"
                                onClick={() =>
                                  setFieldDefaults((prev) => ({
                                    ...prev,
                                    [field]: quick,
                                  }))
                                }
                              >
                                Usar “{quick}”
                              </button>
                            ) : null}
                          </label>
                          <Input
                            value={fieldDefaults[field] ?? ""}
                            placeholder={`Valor padrão para ${field}`}
                            onChange={(e) =>
                              setFieldDefaults((prev) => ({
                                ...prev,
                                [field]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                </div>

                {errorFieldCounts.some(([f]) => f === "cidade" || f === "uf") ? (
                  <p className="text-xs text-muted-foreground">
                    Dica: preencha <strong>cidade</strong> e <strong>UF</strong>{" "}
                    juntas (ex.: Salvador + BA) para o IBGE resolver sozinho.
                  </p>
                ) : null}
              </div>
            ) : null}

            {kind === "customers" && okRows.length > 0 ? (
              <div className="max-h-48 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>IBGE</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {okRows.slice(0, 50).map((row) => (
                      <TableRow key={`ok-${row.line}`}>
                        <TableCell>{row.line}</TableCell>
                        <TableCell className="max-w-[10rem] truncate">
                          {row.preview?.nome || "—"}
                          {row.preview?.documento
                            ? ` · ${row.preview.documento}`
                            : ""}
                        </TableCell>
                        <TableCell>
                          {[row.preview?.cidade, row.preview?.uf]
                            .filter(Boolean)
                            .join("/")}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.preview?.codigo_ibge || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.preview?.ibge_status || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {okRows.length > 50 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Mostrando 50 de {okRows.length} linhas válidas.
                  </p>
                ) : null}
              </div>
            ) : null}

            {errorRows.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead>Erro</TableHead>
                      <TableHead>Prévia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errorRows.flatMap((row) =>
                      (row.errors.length
                        ? row.errors
                        : [{ field: "_", message: "Erro" }]
                      ).map((err, i) => (
                        <TableRow key={`${row.line}-${err.field}-${i}`}>
                          <TableCell>{row.line}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {err.field === "_" ? "—" : err.field}
                          </TableCell>
                          <TableCell>{err.message}</TableCell>
                          <TableCell className="max-w-[12rem] truncate text-muted-foreground">
                            {row.preview
                              ? Object.values(row.preview)
                                  .filter(Boolean)
                                  .join(" · ")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Todas as linhas estão válidas.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </FormSheet>
  );
}
