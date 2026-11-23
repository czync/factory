import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  constructSortFn,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { EmptyState } from './Primitives';

export type { RowData, SortingState };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const sortFn_collator = constructSortFn({
  sort: (a: unknown, b: unknown) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return Number(a) - Number(b);
    }
    return collator.compare(String(a), String(b));
  },
});

const TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    collator: sortFn_collator,
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
  },
});

type TableFeaturesType = typeof TABLE_FEATURES;

export interface DataTableColumn<TData extends RowData> {
  /** Unique column id */
  id: string;
  /** Visible column header text (also injected as responsive `data-label` and announced in sort status) */
  header: string;
  /** Optional custom header label node (wrapped inside `<button>` automatically when sortable) */
  headerRender?: () => React.ReactNode;
  /** Value extractor for sorting (and default text render when `cell` is omitted) */
  accessor?: (row: TData) => string | number | boolean | null | undefined;
  /** Custom cell renderer */
  cell?: (row: TData) => React.ReactNode;
  /** Enable sorting on this column (defaults to `true` when `accessor` or `sortFn` is provided) */
  sortable?: boolean;
  /** Optional custom row-level comparator (ascending order) */
  sortFn?: (a: TData, b: TData) => number;
  /** Text alignment */
  align?: 'left' | 'right' | 'center';
  /** Optional CSS width/min-width hint, e.g. '120px' */
  width?: string;
  /** Render cell with monospace tabular numerals */
  mono?: boolean;
  /** Render as sticky `<th scope="row">` (defaults to column 0 when none specified) */
  isRowHeader?: boolean;
  /** Extra classes on header/body cell */
  className?: string;
}

export interface DataTableProps<TData extends RowData> {
  /** Accessible caption naming the table (sr-only unless `showCaption` is true) */
  caption: string;
  showCaption?: boolean;
  data: readonly TData[];
  columns: readonly DataTableColumn<TData>[];
  /** Stable unique row key extractor (preserves DOM identity across sorts) */
  getRowId: (row: TData, index: number) => string;
  /** Active/selected row ID for highlight */
  activeRowId?: string | null;
  /** Row click / Enter activation handler */
  onRowClick?: (row: TData) => void;
  /** Initial uncontrolled sorting */
  initialSorting?: SortingState;
  /** Controlled sorting */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Max block size for sticky-header scrollport, e.g. 'min(620px, 72vh)' or 'none' */
  maxHeight?: string;
  /** Row vertical padding density ('dense' = ~40px, 'comfortable' = ~44px) */
  density?: 'dense' | 'comfortable';
  /** Empty state copy */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  className?: string;
}

function formatDefaultCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

const ALIGN_CLASS: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

const JUSTIFY_CLASS: Record<'left' | 'right' | 'center', string> = {
  left: 'justify-start',
  right: 'justify-end',
  center: 'justify-center',
};

/**
 * Dense sortable & responsive data table powered by `@tanstack/react-table` v9.
 * Follows modern-web-guidance (`responsive-table` + `sortable-table`):
 * - `tabIndex={0}` + `role="region"` + `aria-labelledby` scroll container.
 * - Sticky `<thead>` + sticky `<th scope="row">` primary column + `@container (width < 640px)` stacked cards.
 * - `<button type="button">` inside sortable `<th scope="col">`; `aria-sort="ascending" | "descending"`
 *   ONLY on the active sorted `<th>` (omitted otherwise, never `"none"`, never on the button).
 * - Decorative sort chevrons (`aria-hidden="true"`) driven strictly from `th[aria-sort]` in CSS.
 * - Single visually-hidden `role="status"` live region announcing sort changes (never `aria-live` on `<table>`).
 * - Keyboard `ArrowUp` / `ArrowDown` / `Home` / `End` / `Enter` row navigation.
 */
export function DataTable<TData extends RowData>({
  caption,
  showCaption = false,
  data,
  columns,
  getRowId,
  activeRowId = null,
  onRowClick,
  initialSorting = [],
  sorting: controlledSorting,
  onSortingChange,
  maxHeight,
  density = 'dense',
  emptyTitle = '暂无匹配记录',
  emptyDescription = '调整筛选条件或切换视图范围后重试。',
  emptyAction,
  className = '',
}: DataTableProps<TData>) {
  const captionId = useId();
  const [internalSorting, setInternalSorting] = useState<SortingState>(initialSorting);
  const [sortAnnouncement, setSortAnnouncement] = useState('');
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const sorting = controlledSorting ?? internalSorting;

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (controlledSorting === undefined) {
        setInternalSorting(next);
      }
      onSortingChange?.(next);
    },
    [controlledSorting, onSortingChange, sorting],
  );

  const stableData = useMemo(() => [...data], [data]);

  const colMap = useMemo(() => {
    const map = new Map<string, DataTableColumn<TData>>();
    for (const col of columns) {
      map.set(col.id, col);
    }
    return map;
  }, [columns]);

  const rowHeaderColIndex = useMemo(() => {
    const explicit = columns.findIndex((c) => c.isRowHeader);
    return explicit >= 0 ? explicit : 0;
  }, [columns]);

  const tanstackColumns = useMemo<ColumnDef<TableFeaturesType, TData>[]>(() => {
    return columns.map((col) => {
      const isSortable = col.sortable ?? Boolean(col.accessor || col.sortFn);
      const customSort = col.sortFn;

      return {
        id: col.id,
        header: col.header,
        accessorFn: (row: TData) => (col.accessor ? col.accessor(row) : ''),
        enableSorting: isSortable,
        sortFn: customSort
          ? (rowA, rowB) => customSort(rowA.original, rowB.original)
          : 'collator',
        cell: (info) =>
          col.cell ? col.cell(info.row.original) : formatDefaultCell(info.getValue()),
      };
    });
  }, [columns]);

  const table = useTable({
    features: TABLE_FEATURES,
    data: stableData,
    columns: tanstackColumns,
    getRowId,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
    state: {
      sorting,
    },
    onSortingChange: handleSortingChange,
  });

  const rows = table.getRowModel().rows;

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>, rowIndex: number, rowData: TData) => {
      if (!onRowClick) return;
      // Do not intercept keyboard actions targeting interactive controls inside a cell
      if (e.target !== e.currentTarget) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(rowIndex + 1, rows.length - 1);
        setFocusedRowIndex(nextIdx);
        rowRefs.current[nextIdx]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(rowIndex - 1, 0);
        setFocusedRowIndex(prevIdx);
        rowRefs.current[prevIdx]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedRowIndex(0);
        rowRefs.current[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const lastIdx = rows.length - 1;
        setFocusedRowIndex(lastIdx);
        rowRefs.current[lastIdx]?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRowClick(rowData);
      }
    },
    [onRowClick, rows.length],
  );

  const handleRowClick = useCallback(
    (e: React.MouseEvent<HTMLTableRowElement>, rowIndex: number, rowData: TData) => {
      if (!onRowClick) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select, textarea, summary, [data-row-ignore]')) {
        return;
      }
      setFocusedRowIndex(rowIndex);
      onRowClick(rowData);
    },
    [onRowClick],
  );

  const activeIndex = useMemo(() => {
    if (!activeRowId) return -1;
    return rows.findIndex((r) => r.id === activeRowId);
  }, [activeRowId, rows]);

  const rovingTabIndexTarget =
    activeIndex >= 0
      ? activeIndex
      : Math.min(focusedRowIndex, Math.max(rows.length - 1, 0));

  return (
    <div
      tabIndex={0}
      role="region"
      aria-labelledby={captionId}
      className={`mcp-table-region ${className}`.trim()}
      style={maxHeight ? { maxBlockSize: maxHeight } : undefined}
    >
      {/* Single always-mounted status region for sort announcements (never aria-live on <table>) */}
      <div role="status" className="mcp-sr-only">
        {sortAnnouncement}
      </div>

      {rows.length === 0 ? (
        <>
          <span id={captionId} className="mcp-sr-only">
            {caption}
          </span>
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        </>
      ) : (
        <table className="mcp-table" data-density={density}>
          <caption
            id={captionId}
            className={
              showCaption
                ? 'px-3 py-2 text-left text-[12px] font-medium'
                : 'mcp-sr-only'
            }
            style={showCaption ? { color: 'var(--ink-muted)' } : undefined}
          >
            {caption}
          </caption>

          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colMeta = colMap.get(header.column.id);
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const ariaSort: 'ascending' | 'descending' | undefined =
                    sorted === 'asc'
                      ? 'ascending'
                      : sorted === 'desc'
                        ? 'descending'
                        : undefined;
                  const align = colMeta?.align ?? 'left';

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      className={`${ALIGN_CLASS[align]} ${colMeta?.className ?? ''}`.trim()}
                      style={colMeta?.width ? { width: colMeta.width } : undefined}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className={`mcp-sort-btn ${JUSTIFY_CLASS[align]}`}
                          onClick={() => {
                            const nextDesc = sorted === 'asc';
                            header.column.toggleSorting(nextDesc, false);
                            const label = colMeta?.header ?? header.column.id;
                            const dirText = nextDesc ? '降序' : '升序';
                            setSortAnnouncement(
                              `已按「${label}」${dirText}排列，共 ${rows.length} 行`,
                            );
                          }}
                        >
                          <span>
                            {colMeta?.headerRender
                              ? colMeta.headerRender()
                              : colMeta?.header ?? header.column.id}
                          </span>
                          <svg
                            className="mcp-sort-icon"
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              className="mcp-sort-asc"
                              d="M6 2.25L8.75 5.25H3.25L6 2.25Z"
                              fill="currentColor"
                            />
                            <path
                              className="mcp-sort-desc"
                              d="M6 9.75L3.25 6.75H8.75L6 9.75Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      ) : colMeta?.headerRender ? (
                        colMeta.headerRender()
                      ) : (
                        colMeta?.header ?? header.column.id
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              const isActive = activeRowId !== null && row.id === activeRowId;
              const isClickable = Boolean(onRowClick);

              return (
                <tr
                  key={row.id}
                  ref={(el) => {
                    rowRefs.current[rowIndex] = el;
                  }}
                  tabIndex={isClickable ? (rowIndex === rovingTabIndexTarget ? 0 : -1) : undefined}
                  data-clickable={isClickable ? 'true' : undefined}
                  data-active={isActive ? 'true' : undefined}
                  aria-current={isClickable && isActive ? 'true' : undefined}
                  onClick={(e) => handleRowClick(e, rowIndex, row.original)}
                  onKeyDown={(e) => handleRowKeyDown(e, rowIndex, row.original)}
                >
                  {row.getAllCells().map((cell, cellIndex) => {
                    const colMeta = colMap.get(cell.column.id);
                    const align = colMeta?.align ?? 'left';
                    const monoClass = colMeta?.mono ? 'font-mono-tabular text-[12px]' : '';
                    const cellClass = `${ALIGN_CLASS[align]} ${monoClass} ${colMeta?.className ?? ''}`.trim();

                    if (cellIndex === rowHeaderColIndex) {
                      return (
                        <th key={cell.id} scope="row" className={cellClass}>
                          <table.FlexRender cell={cell} />
                        </th>
                      );
                    }

                    return (
                      <td
                        key={cell.id}
                        data-label={colMeta?.header ?? cell.column.id}
                        className={cellClass}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
