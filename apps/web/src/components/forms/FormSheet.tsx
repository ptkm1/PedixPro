import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type FormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Botões de ação (Salvar / Cancelar). Ficam fixos no rodapé do sheet. */
  footer?: ReactNode;
  /** Classes extras no conteúdo (altura, etc.). */
  contentClassName?: string;
};

/**
 * Sheet padrão para criar/editar entidades no admin.
 * Abre pela parte inferior, conteúdo scrollável, footer opcional fixo.
 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
}: FormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "glass !bg-[color:var(--glass-fill)] flex max-h-[90vh] w-full flex-col gap-0 rounded-t-2xl border-[color:var(--glass-border)] p-0",
          contentClassName,
        )}
      >
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div
          data-form-sheet-scroll
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          {children}
        </div>
        {footer ? (
          <SheetFooter className="border-t border-border sm:flex-row sm:justify-end">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type FormSheetActionsProps = {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  disabled?: boolean;
};

export function FormSheetActions({
  onCancel,
  onSubmit,
  submitLabel = "Salvar",
  cancelLabel = "Cancelar",
  pending,
  disabled,
}: FormSheetActionsProps) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={pending}
      >
        {cancelLabel}
      </Button>
      <Button type="button" onClick={onSubmit} disabled={disabled || pending}>
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </>
  );
}
