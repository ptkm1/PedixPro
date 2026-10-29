import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fieldControlClass } from "@/lib/field-styles";
import { cn } from "@/lib/utils";
import { matchesCustomerQuery } from "@pedidos/shared";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

export type CustomerComboboxItem = {
  id: string;
  name: string;
  tradeName?: string | null;
  legalName?: string | null;
  city?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  code?: number | null;
};

type Props = Readonly<{
  id?: string;
  value: string;
  onValueChange: (customerId: string) => void;
  customers: CustomerComboboxItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}>;

export function customerComboboxLabel(c: CustomerComboboxItem): string {
  const title = c.tradeName?.trim() || c.name;
  const extra = [
    c.legalName?.trim() && c.legalName !== title ? c.legalName : null,
    c.city?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  return extra ? `${title} — ${extra}` : title;
}

const MODAL_HOST_SELECTOR =
  '[data-slot="sheet-content"], [data-slot="dialog-content"]';

export function CustomerCombobox({
  id,
  value,
  onValueChange,
  customers,
  placeholder = "Buscar cliente…",
  searchPlaceholder = "Nome, fantasia, razão, cidade ou documento…",
  disabled,
  invalid,
  className,
}: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );

  const selected = useMemo(
    () => customers.find((c) => c.id === value) ?? null,
    [customers, value],
  );

  const filtered = useMemo(() => {
    const list = customers.filter((c) => matchesCustomerQuery(c, query));
    if (selected && !list.some((c) => c.id === selected.id)) {
      return [selected, ...list];
    }
    return list;
  }, [customers, query, selected]);

  function select(next: string) {
    onValueChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const host = triggerRef.current?.closest(MODAL_HOST_SELECTOR);
          setPortalContainer(host instanceof HTMLElement ? host : null);
        } else {
          setPortalContainer(null);
          setQuery("");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            fieldControlClass,
            "flex h-auto min-h-9 items-center gap-2 py-1.5 text-left",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? customerComboboxLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        className="pointer-events-auto z-[100] w-(--radix-popover-trigger-width) min-w-[280px] p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5 border-b border-border p-2">
          <label
            htmlFor={`${listId}-search`}
            className="px-0.5 text-[11px] font-medium text-muted-foreground"
          >
            Buscar cliente
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              id={`${listId}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8"
              aria-label="Buscar cliente por nome, fantasia, razão, cidade ou documento"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Clientes"
          className="max-h-64 overflow-y-auto overscroll-contain p-1"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </p>
          ) : (
            filtered.map((customer) => {
              const isSelected = customer.id === value;
              return (
                <button
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent/70",
                  )}
                  onClick={() => select(customer.id)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {customerComboboxLabel(customer)}
                  </span>
                  <Check
                    className={cn(
                      "ml-auto size-4 shrink-0 text-primary",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>
              );
            })
          )}
        </div>
        {customers.length > 0 ? (
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-[11px] text-muted-foreground">
              {filtered.length} de {customers.length} cliente
              {customers.length === 1 ? "" : "s"}
            </p>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
