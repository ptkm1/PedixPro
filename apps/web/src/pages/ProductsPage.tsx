import { ProductCard, type ProductCardItem } from "@/components/ProductCard";
import { CsvImportSheet } from "@/components/CsvImportSheet";
import { ProductsHubNav } from "@/components/products/ProductsHubNav";
import { useConfirm } from "@/components/confirm";
import { FormField } from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type Category = { id: string; name: string };
type Supplier = { id: string; tradeName: string; legalName: string };

export function ProductsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (supplierId) p.set("supplierId", supplierId);
    if (categoryId) p.set("categoryId", categoryId);
    if (q.trim()) p.set("q", q.trim());
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [supplierId, categoryId, q]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "products", supplierId, categoryId, q],
    queryFn: () => apiFetch<ProductCardItem[]>(`/admin/products${queryParams}`),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "product-categories"],
    queryFn: () => apiFetch<Category[]>("/admin/product-categories"),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin", "suppliers"],
    queryFn: () => apiFetch<Supplier[]>("/admin/suppliers"),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/products/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/admin/products/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: (copy) => {
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
      navigate(`/produtos/${copy.id}/editar`);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <ProductsHubNav />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Produtos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading
                ? "Carregando…"
                : `${products.length} produto(s) no catálogo`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/estoque">Estoque</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/produtos/categorias">Grupos</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/fornecedores">Fornecedores</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            Importar CSV
          </Button>
          <Button asChild>
            <Link to="/produtos/novo">Novo produto</Link>
          </Button>
        </div>
      </div>

      <CsvImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="products"
        title="Importar produtos (CSV)"
        templatePath="/admin/imports/products/template.csv"
        templateFilename="produtos-modelo.csv"
        previewPath="/admin/imports/products/preview"
        commitPath="/admin/imports/products/commit"
        onImported={() =>
          void qc.invalidateQueries({ queryKey: ["admin", "products"] })
        }
      />

      <div className="surface-card grid gap-3 p-4 sm:grid-cols-3">
        <FormField label="Fornecedor" htmlFor="prod-filter-supplier">
          <AppSelect
            id="prod-filter-supplier"
            value={supplierId}
            onValueChange={setSupplierId}
            emptyLabel="Todos"
            options={suppliers.map((s) => ({
              value: s.id,
              label: s.tradeName || s.legalName,
            }))}
          />
        </FormField>
        <FormField label="Grupo" htmlFor="prod-filter-category">
          <AppSelect
            id="prod-filter-category"
            value={categoryId}
            onValueChange={setCategoryId}
            emptyLabel="Todos"
            options={categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </FormField>
        <FormField label="Buscar" htmlFor="prod-filter-q">
          <Input
            id="prod-filter-q"
            placeholder="Nome, SKU ou código de barras"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </FormField>
      </div>

      {duplicate.isError ? (
        <p className="text-sm text-destructive">
          {duplicate.error instanceof Error
            ? duplicate.error.message
            : "Não foi possível duplicar o produto."}
        </p>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="surface-card h-44 animate-pulse bg-muted/50"
            />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="surface-card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Package className="h-12 w-12 text-primary/40" />
          <p className="text-muted-foreground">Nenhum produto cadastrado.</p>
          <Button asChild>
            <Link to="/produtos/novo">Criar primeiro produto</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onDuplicate={() => {
                void confirm({
                  title: "Duplicar produto?",
                  description:
                    "Cria uma cópia com os mesmos dados comerciais e tributários. SKU, código de barras e estoque ficam vazios para você ajustar.",
                  confirmLabel: "Duplicar",
                }).then((ok) => {
                  if (ok) duplicate.mutate(p.id);
                });
              }}
              onDelete={() => {
                void confirm({
                  title: "Excluir produto?",
                  description:
                    "Esta ação não pode ser desfeita. O produto será removido permanentemente.",
                  confirmLabel: "Excluir",
                  tone: "destructive",
                }).then((ok) => {
                  if (ok) remove.mutate(p.id);
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
