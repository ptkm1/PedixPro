
import * as React from 'react'

import { cn } from '@/lib/utils'

const MIN_COL_WIDTH = 48
const WIDTHS_STORAGE_PREFIX = 'pedix.table-col-widths.'

type ColumnWidths = Record<string, number>

type TableResizeContextValue = {
  widths: ColumnWidths
  widthsRef: React.MutableRefObject<ColumnWidths>
  captureFromTable: (
    table: HTMLTableElement,
    th: HTMLTableCellElement,
  ) => string
  setColumnWidth: (key: string, width: number) => void
  persist: () => void
}

const TableResizeContext = React.createContext<TableResizeContextValue | null>(
  null,
)

function loadTableColumnWidths(tableId?: string): ColumnWidths {
  if (!tableId) return {}
  try {
    const raw = localStorage.getItem(WIDTHS_STORAGE_PREFIX + tableId)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const out: ColumnWidths = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= MIN_COL_WIDTH) {
        out[key] = Math.round(value)
      }
    }
    return out
  } catch {
    return {}
  }
}

function saveTableColumnWidths(tableId: string | undefined, widths: ColumnWidths) {
  if (!tableId) return
  try {
    localStorage.setItem(WIDTHS_STORAGE_PREFIX + tableId, JSON.stringify(widths))
  } catch {
    /* quota / private mode */
  }
}

function columnKeyFromTh(th: HTMLTableCellElement): string {
  const row = th.parentElement
  if (!row) return '0'
  return String(Array.prototype.indexOf.call(row.children, th))
}

function ColumnResizeHandle() {
  const ctx = React.useContext(TableResizeContext)
  const dragRef = React.useRef<{
    pointerId: number
    key: string
    startX: number
    startW: number
  } | null>(null)

  if (!ctx) return null

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    dragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    ctx.persist()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar coluna"
      className="absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize touch-none select-none hover:bg-primary/30 active:bg-primary/40"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const th = e.currentTarget.closest('th')
        const table = e.currentTarget.closest('table')
        if (!th || !table) return
        e.preventDefault()
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        const key = ctx.captureFromTable(table, th)
        const startW =
          ctx.widthsRef.current[key] ?? Math.round(th.getBoundingClientRect().width)
        dragRef.current = {
          pointerId: e.pointerId,
          key,
          startX: e.clientX,
          startW,
        }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag || e.pointerId !== drag.pointerId) return
        const next = Math.max(
          MIN_COL_WIDTH,
          Math.round(drag.startW + (e.clientX - drag.startX)),
        )
        ctx.setColumnWidth(drag.key, next)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}

function Table({
  className,
  containerClassName,
  tableId,
  style,
  children,
  ...props
}: React.ComponentProps<'table'> & {
  containerClassName?: string
  tableId?: string
}) {
  const [widths, setWidths] = React.useState<ColumnWidths>(() =>
    loadTableColumnWidths(tableId),
  )
  const widthsRef = React.useRef(widths)
  widthsRef.current = widths

  const persist = React.useCallback(() => {
    saveTableColumnWidths(tableId, widthsRef.current)
  }, [tableId])

  const captureFromTable = React.useCallback(
    (table: HTMLTableElement, th: HTMLTableCellElement) => {
      const key = columnKeyFromTh(th)
      if (Object.keys(widthsRef.current).length === 0) {
        const next: ColumnWidths = {}
        table.querySelectorAll('thead th').forEach((el) => {
          const cell = el as HTMLTableCellElement
          next[columnKeyFromTh(cell)] = Math.round(
            cell.getBoundingClientRect().width,
          )
        })
        widthsRef.current = next
        setWidths(next)
      }
      return key
    },
    [],
  )

  const setColumnWidth = React.useCallback((key: string, width: number) => {
    const next = { ...widthsRef.current, [key]: width }
    widthsRef.current = next
    setWidths(next)
  }, [])

  const ctx = React.useMemo(
    () => ({
      widths,
      widthsRef,
      captureFromTable,
      setColumnWidth,
      persist,
    }),
    [widths, captureFromTable, setColumnWidth, persist],
  )

  const hasWidths = Object.keys(widths).length > 0
  const totalWidth = hasWidths
    ? Object.values(widths).reduce((sum, w) => sum + w, 0)
    : 0
  const colIndexes = hasWidths
    ? Object.keys(widths)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0)
    : []
  const colCount = colIndexes.length ? Math.max(...colIndexes) + 1 : 0

  return (
    <TableResizeContext.Provider value={ctx}>
      <div
        data-slot="table-container"
        className={cn('relative w-full overflow-auto', containerClassName)}
      >
        <table
          data-slot="table"
          data-table-id={tableId}
          className={cn(
            'caption-bottom text-sm',
            hasWidths ? 'table-fixed' : 'w-full',
            className,
          )}
          style={
            hasWidths
              ? { ...style, width: totalWidth, minWidth: totalWidth }
              : style
          }
          {...props}
        >
          {hasWidths && colCount > 0 ? (
            <colgroup>
              {Array.from({ length: colCount }, (_, i) => (
                <col
                  key={i}
                  style={
                    widths[String(i)] != null
                      ? { width: widths[String(i)] }
                      : undefined
                  }
                />
              ))}
            </colgroup>
          ) : null}
          {children}
        </table>
      </div>
    </TableResizeContext.Provider>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'bg-muted/50 border-t font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  columnKey,
  resizable = true,
  children,
  ...props
}: React.ComponentProps<'th'> & {
  columnKey?: string
  resizable?: boolean
}) {
  const ctx = React.useContext(TableResizeContext)

  return (
    <th
      data-slot="table-head"
      data-column-key={columnKey}
      className={cn(
        'text-foreground relative h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&_[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    >
      <div className="min-w-0 truncate">{children}</div>
      {ctx && resizable ? <ColumnResizeHandle /> : null}
    </th>
  )
}

function TableCell({
  className,
  title,
  children,
  ...props
}: React.ComponentProps<'td'>) {
  const hint =
    title ??
    (typeof children === 'string' || typeof children === 'number'
      ? String(children)
      : undefined)

  return (
    <td
      data-slot="table-cell"
      title={hint}
      className={cn(
        'p-2 align-middle whitespace-nowrap overflow-hidden text-ellipsis [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted-foreground mt-4 text-sm', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
