import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    formatProductStockLabel,
    formatProductUnitLabel,
    isProductSaleBlockedByStock,
} from "@pedidos/shared";
import { Copy, Package, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

export type ProductCardItem = {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  description: string | null;
  imageUrl?: string | null;
  basePrice: unknown;
  stockQty?: number;
  blockSaleWhenOutOfStock?: boolean;
  attributes?: Record<string, unknown>;
  category?: { id: string; code: string; name: string } | null;
  supplier?: { id: string; code: string; tradeName: string } | null;
};

type Props = {
  product: ProductCardItem;
  onDelete: () => void;
  onDuplicate: () => void;
  className?: string;
};

export function ProductCard({
  product,
  onDelete,
  onDuplicate,
  className,
}: Props) {
  const price = Number(product.basePrice);
  const imageUrl = product.imageUrl?.trim();
  const stockQty = product.stockQty ?? 0;
  const unitLabel = formatProductUnitLabel(product.attributes);
  const outOfStock = isProductSaleBlockedByStock(
    stockQty,
    product.blockSaleWhenOutOfStock ?? false,
  );

  return (
    <article
      className={cn(
        "surface-card-glass group flex h-full flex-col overflow-hidden transition-all hover:border-primary/35",
        className,
      )}
    >
      <div className="relative h-24 shrink-0 overflow-hidden bg-muted/80 sm:h-28">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/5">
            <Package className="h-7 w-7 text-primary/40" strokeWidth={1.5} />
          </div>
        )}
        {product.category ? (
          <Badge
            variant="secondary"
            className="absolute left-1.5 top-1.5 max-w-[85%] truncate border-0 bg-card/90 px-1.5 py-0 text-[10px] text-primary backdrop-blur-sm"
          >
            {product.category.name}
          </Badge>
        ) : null}
        {product.supplier ? (
          <Badge
            variant="outline"
            className="absolute right-1.5 top-1.5 max-w-[85%] truncate border-0 bg-card/90 px-1.5 py-0 text-[10px] text-muted-foreground backdrop-blur-sm"
          >
            {product.supplier.tradeName}
          </Badge>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">
            {product.name}
          </h3>
          {product.sku ? (
            <p className="truncate text-[10px] text-muted-foreground">
              SKU {product.sku}
            </p>
          ) : null}
          {product.barcode ? (
            <p className="truncate text-[10px] text-muted-foreground">
              EAN {product.barcode}
            </p>
          ) : null}

          <p className="text-sm font-bold text-success">
            R$ {Number.isFinite(price) ? price.toFixed(2) : "—"}
          </p>
          {unitLabel ? (
            <p className="text-[10px] text-muted-foreground">{unitLabel}</p>
          ) : null}
          <p
            className={cn(
              "text-[10px] font-medium",
              outOfStock ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {formatProductStockLabel(stockQty)}
          </p>
        </div>

        <div className="mt-2 flex shrink-0 gap-1.5 border-t border-border/60 pt-2">
          <Button variant="outline" size="xs" className="h-7 flex-1" asChild>
            <Link to={`/produtos/${product.id}/editar`}>
              <Pencil className="h-3 w-3" />
              Editar
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-7 w-8 shrink-0 px-0"
            onClick={onDuplicate}
            aria-label="Duplicar produto"
            title="Duplicar produto"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="xs"
            className="h-7 w-8 shrink-0 px-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            aria-label="Excluir produto"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </article>
  );
}
