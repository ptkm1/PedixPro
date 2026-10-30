import { SELECT_EMPTY } from "@/components/ui/app-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { situationDotClass, stageBadgeClass } from "@/lib/order-kanban";
import { cn } from "@/lib/utils";

export type OrderStageOption = {
  id: string;
  code: string;
  name: string;
  mapsToCancel?: boolean;
  disabled?: boolean;
};

function StageDot({
  code,
  mapsToCancel,
}: {
  code: string;
  mapsToCancel?: boolean;
}) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        situationDotClass(code, mapsToCancel),
      )}
      aria-hidden
    />
  );
}

type OrderStageSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: OrderStageOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  triggerClassName?: string;
  /** Aplica as cores da etapa no trigger (lista de pedidos). */
  colored?: boolean;
};

export function OrderStageSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Selecione…",
  emptyLabel,
  disabled,
  triggerClassName,
  colored = false,
}: OrderStageSelectProps) {
  const selectValue = value === "" ? SELECT_EMPTY : value;
  const current = options.find((s) => s.id === value);

  return (
    <Select
      value={selectValue}
      disabled={disabled}
      onValueChange={(next) => {
        onValueChange(next === SELECT_EMPTY ? "" : next);
      }}
    >
      <SelectTrigger
        id={id}
        className={cn(
          "w-full",
          colored && current
            ? stageBadgeClass(current.code, current.mapsToCancel)
            : null,
          triggerClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel != null ? (
          <SelectItem value={SELECT_EMPTY}>{emptyLabel}</SelectItem>
        ) : null}
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id} disabled={opt.disabled}>
            <span className="flex min-w-0 items-center gap-2">
              <StageDot code={opt.code} mapsToCancel={opt.mapsToCancel} />
              <span className="truncate">{opt.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
