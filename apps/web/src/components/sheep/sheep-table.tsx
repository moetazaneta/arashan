import { arashanShare, type SheepListItem } from "@arashan/client";
import type { Grade, SheepId, SheepStatus } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  type Cell,
  columnVisibilityFeature,
  type ColumnVisibilityState,
  createColumnHelper,
  createSortedRowModel,
  FlexRender,
  type Row,
  rowSortingFeature,
  type SortFn,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, Columns3Icon } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  memo,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { formatCalendarDate, formatKg, formatShareNumber } from "@/format";
import { cn } from "@/lib/utils";

import { gradeLabels, originLabels, sexLabels, statusLabels } from "./labels";

// The table «Бараны»: dense rows, sorting by a click on a header, the columns that a Member chose,
// the selection for the bulk actions, and the keyboard. It must show a few hundred Sheep at once
// without a delay, so the columns, the features and the formatters are made one time, and a row
// renders again only when it changes.

interface SheepColumnMeta {
  /** The header of the column, and its name in the column settings. */
  label: MessageDescriptor;
  /** Numbers align to the right. */
  numeric?: boolean;
}

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as SheepColumnMeta,
});

type SheepTableRow = Row<typeof features, SheepListItem>;

// The order of the Tags is natural: 2 before 10.
const collator = new Intl.Collator("ru", { numeric: true });
const byText: SortFn<typeof features, SheepListItem> = (a, b, columnId) =>
  collator.compare(String(a.getValue(columnId)), String(b.getValue(columnId)));
const byNumber: SortFn<typeof features, SheepListItem> = (a, b, columnId) =>
  Number(a.getValue(columnId)) - Number(b.getValue(columnId));

const statusOrder: Record<SheepStatus, number> = {
  active: 0,
  sold: 1,
  slaughtered: 2,
  dead: 3,
  lost: 4,
};

// The best Grade first.
const gradeOrder: Record<Grade, number> = { elite: 0, first: 1, second: 2 };

const helper = createColumnHelper<typeof features, SheepListItem>();

// An empty value is `undefined`, so that it sorts last in both directions.
const columns = helper.columns([
  helper.accessor((sheep) => sheep.tag ?? undefined, {
    id: "tag",
    meta: { label: msg`Бирка` },
    sortFn: byText,
    sortUndefined: "last",
    enableHiding: false,
    cell: ({ row }) => <TextCell text={row.original.tag} className="font-medium" />,
  }),
  helper.accessor((sheep) => sheep.name ?? undefined, {
    id: "name",
    meta: { label: msg`Кличка` },
    sortFn: byText,
    sortUndefined: "last",
    cell: ({ row }) => <TextCell text={row.original.name} />,
  }),
  helper.accessor((sheep) => sheep.sex, {
    id: "sex",
    meta: { label: msg`Пол` },
    sortFn: byText,
    cell: ({ row }) => <SexCell sheep={row.original} />,
  }),
  helper.accessor((sheep) => sheep.birthDate ?? undefined, {
    id: "birthDate",
    meta: { label: msg`Дата рождения` },
    sortFn: byText,
    sortUndefined: "last",
    cell: ({ row }) => <DateCell date={row.original.birthDate} />,
  }),
  helper.accessor((sheep) => sheep.flock?.name, {
    id: "flock",
    meta: { label: msg`Стадо` },
    sortFn: byText,
    sortUndefined: "last",
    cell: ({ row }) => <TextCell text={row.original.flock?.name ?? null} />,
  }),
  helper.accessor((sheep) => sheep.owner?.name, {
    id: "owner",
    meta: { label: msg`Владелец` },
    sortFn: byText,
    sortUndefined: "last",
    cell: ({ row }) => <TextCell text={row.original.owner?.name ?? null} />,
  }),
  helper.accessor((sheep) => statusOrder[sheep.status], {
    id: "status",
    meta: { label: msg`Статус` },
    sortFn: byNumber,
    cell: ({ row }) => <StatusCell status={row.original.status} />,
  }),
  helper.accessor((sheep) => sheep.origin, {
    id: "origin",
    meta: { label: msg`Происхождение` },
    sortFn: byText,
    cell: ({ row }) => <OriginCell sheep={row.original} />,
  }),
  helper.accessor((sheep) => sheep.weight?.kg, {
    id: "weight",
    meta: { label: msg`Вес, кг`, numeric: true },
    sortFn: byNumber,
    sortUndefined: "last",
    cell: ({ row }) => <WeightCell kg={row.original.weight?.kg ?? null} />,
  }),
  helper.accessor((sheep) => arashanShare(sheep.composition), {
    id: "arashan",
    meta: { label: msg`Арашан, %`, numeric: true },
    sortFn: byNumber,
    cell: ({ row }) => <ShareCell share={arashanShare(row.original.composition)} />,
  }),
  helper.accessor((sheep) => (sheep.grade === null ? undefined : gradeOrder[sheep.grade.grade]), {
    id: "grade",
    meta: { label: msg`Класс` },
    sortFn: byNumber,
    sortUndefined: "last",
    cell: ({ row }) => <GradeCell grade={row.original.grade?.grade ?? null} />,
  }),
  helper.accessor((sheep) => sheep.notes ?? undefined, {
    id: "notes",
    meta: { label: msg`Заметки` },
    sortFn: byText,
    sortUndefined: "last",
    cell: ({ row }) => <TextCell text={row.original.notes} className="block max-w-64 truncate" />,
  }),
]);

const getRowId = (sheep: SheepListItem) => sheep.id;
const noSheep: SheepListItem[] = [];

/** No Sheep selected. */
export const noSelection: ReadonlySet<SheepId> = new Set();

/** Only an Active Sheep can be selected for a bulk action. */
export function canSelectSheep(sheep: SheepListItem): boolean {
  return sheep.status === "active";
}

// The visible columns. The other columns are in the column settings. A Member's choice stays in this
// browser.
const columnsKey = "arashan.sheepColumns";
const defaultVisibility: ColumnVisibilityState = {
  origin: false,
  weight: false,
  arashan: false,
  grade: false,
  notes: false,
};

function savedVisibility(): ColumnVisibilityState {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(columnsKey) ?? "null");
    if (typeof saved !== "object" || saved === null) return defaultVisibility;
    const visibility = { ...defaultVisibility };
    for (const [id, visible] of Object.entries(saved)) {
      if (typeof visible === "boolean") visibility[id] = visible;
    }
    return visibility;
  } catch {
    return defaultVisibility;
  }
}

/** The columns that the table shows, from the column settings, saved in this browser. */
export function useSheepColumns() {
  const [visibility, setVisibility] = useState(savedVisibility);
  useEffect(() => {
    localStorage.setItem(columnsKey, JSON.stringify(visibility));
  }, [visibility]);
  return [visibility, setVisibility] as const;
}

/** The menu «Столбцы»: the columns to show. The Tag is always visible. */
export function ColumnSettings({
  visibility,
  onChange,
}: {
  visibility: ColumnVisibilityState;
  onChange: (visibility: ColumnVisibilityState) => void;
}) {
  const { i18n } = useLingui();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Columns3Icon data-icon="inline-start" />
        <Trans>Столбцы</Trans>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <Trans>Показывать столбцы</Trans>
          </DropdownMenuLabel>
          {columns
            .filter((column) => column.enableHiding !== false)
            .map((column) => {
              const id = column.id ?? "";
              return (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={visibility[id] !== false}
                  onCheckedChange={(checked) => onChange({ ...visibility, [id]: checked })}
                >
                  {column.meta === undefined ? id : i18n._(column.meta.label)}
                </DropdownMenuCheckboxItem>
              );
            })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Sheep of the Farm, one per row. A click or `Enter` on a row opens its card. The arrows move
 * between the rows, `Home` and `End` go to the first and the last one, `PageUp` and `PageDown` move
 * by 10 rows. Only one row is in the tab order: the one that had the focus last.
 *
 * The checkbox of a row, or `Space` on the row, selects the Sheep for a bulk action; the checkbox in
 * the header selects all the Sheep that can be selected. The page keeps the selection, and the table
 * drops from it each Sheep that leaves the data or stops being Active.
 */
export function SheepTable({
  data,
  columnVisibility,
  onOpen,
  selection,
  onSelectionChange,
}: {
  /** The Sheep, or undefined while they load. */
  data: SheepListItem[] | undefined;
  columnVisibility: ColumnVisibilityState;
  onOpen: (sheepId: SheepId) => void;
  /** The selected Sheep. */
  selection: ReadonlySet<SheepId>;
  onSelectionChange: (selection: ReadonlySet<SheepId>) => void;
}) {
  const { t, i18n } = useLingui();
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useTable({
    features,
    columns,
    data: data ?? noSheep,
    getRowId,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
  });
  const rows = table.getRowModel().rows;
  const visibleColumns = table
    .getVisibleLeafColumns()
    .map((column) => column.id)
    .join(" ");

  // The Sheep that can be selected. The selection keeps only them, also when the data changes.
  const selectable = useMemo(
    () => new Set((data ?? noSheep).filter(canSelectSheep).map((sheep) => sheep.id)),
    [data],
  );
  useLayoutEffect(() => {
    if (data === undefined) return;
    const kept = [...selection].filter((id) => selectable.has(id));
    if (kept.length !== selection.size) onSelectionChange(new Set(kept));
  }, [data, selectable, selection, onSelectionChange]);
  const selectedCount = [...selection].filter((id) => selectable.has(id)).length;
  const allSelected = selectable.size > 0 && selectedCount === selectable.size;

  // A row toggles its Sheep with the latest selection, so that the rows need no new callback when
  // the selection changes, and render again only when their own state changes.
  const latestSelection = useRef({ selection, onSelectionChange });
  useLayoutEffect(() => {
    latestSelection.current = { selection, onSelectionChange };
  });
  const toggle = useCallback((id: SheepId) => {
    const { selection, onSelectionChange } = latestSelection.current;
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }, []);

  // The row with the focus, by the id of its Sheep: a change of the data keeps it.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activeId = rows.some((row) => row.id === focusedId) ? focusedId : (rows[0]?.id ?? null);
  const rowElements = useRef(new Map<string, HTMLTableRowElement>());
  const registerRow = useCallback((id: string, element: HTMLTableRowElement | null) => {
    if (element === null) rowElements.current.delete(id);
    else rowElements.current.set(id, element);
  }, []);

  function focusRow(index: number) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (row === undefined) return;
    setFocusedId(row.id);
    rowElements.current.get(row.id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // `Enter` and `Space` on a checkbox are the checkbox's own.
    const onRow = event.target instanceof HTMLTableRowElement;
    const index = rows.findIndex((row) => row.id === activeId);
    switch (event.key) {
      case "ArrowDown":
        focusRow(index + 1);
        break;
      case "ArrowUp":
        focusRow(index - 1);
        break;
      case "Home":
        focusRow(0);
        break;
      case "End":
        focusRow(rows.length - 1);
        break;
      case "PageDown":
        focusRow(index + pageRows);
        break;
      case "PageUp":
        focusRow(index - pageRows);
        break;
      case "Enter":
        if (!onRow) return;
        if (activeId !== null) onOpen(activeId as SheepId);
        break;
      case " ":
        if (!onRow) return;
        if (activeId !== null && selectable.has(activeId as SheepId)) toggle(activeId as SheepId);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function onFocus(event: FocusEvent<HTMLTableSectionElement>) {
    const id = rowIdOf(event.target);
    if (id !== null) setFocusedId(id);
  }

  function onClick(event: MouseEvent<HTMLTableSectionElement>) {
    // A click in the cell of the checkbox selects the Sheep, and does not open its card.
    if (event.target instanceof Element && event.target.closest("[data-select-cell]") !== null) {
      return;
    }
    const id = rowIdOf(event.target);
    if (id !== null) onOpen(id as SheepId);
  }

  return (
    <table aria-label={t`Бараны`} className="w-full caption-bottom text-[13px] tabular-nums">
      {/* No rule on the header row: the sticky cells draw it, so it stays when the page scrolls. */}
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            <TableHead className={cn(stickyHead, "w-8")}>
              <Checkbox
                aria-label={t`Выбрать всех баранов`}
                checked={allSelected}
                indeterminate={selectedCount > 0 && !allSelected}
                disabled={selectable.size === 0}
                onCheckedChange={() => onSelectionChange(allSelected ? noSelection : selectable)}
              />
            </TableHead>
            {group.headers.map((header) => {
              const { column } = header;
              const meta = column.columnDef.meta;
              const label = meta === undefined ? column.id : i18n._(meta.label);
              const sorted = column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  aria-sort={
                    sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                  }
                  className={cn(stickyHead, meta?.numeric === true && "text-right")}
                >
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                      meta?.numeric === true && "flex-row-reverse",
                    )}
                    onClick={column.getToggleSortingHandler()}
                  >
                    {label}
                    {sorted === "asc" && <ArrowUpIcon aria-hidden className="size-3" />}
                    {sorted === "desc" && <ArrowDownIcon aria-hidden className="size-3" />}
                  </button>
                </TableHead>
              );
            })}
          </tr>
        ))}
      </thead>
      <TableBody onKeyDown={onKeyDown} onFocus={onFocus} onClick={onClick}>
        {data === undefined
          ? skeletonRows.map((key) => (
              <TableRow key={key} className="h-9 hover:bg-transparent">
                <TableCell className="px-2 py-0" />
                {table.getVisibleLeafColumns().map((column) => (
                  <TableCell key={column.id} className="px-2 py-0">
                    <Skeleton className="h-3.5 w-16" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : rows.map((row) => (
              <SheepRow
                key={row.id}
                row={row}
                active={row.id === activeId}
                selected={selectable.has(row.original.id) && selection.has(row.original.id)}
                selectable={selectable.has(row.original.id)}
                onToggle={toggle}
                visibleColumns={visibleColumns}
                register={registerRow}
              />
            ))}
      </TableBody>
    </table>
  );
}

/** How many rows `PageUp` and `PageDown` move. */
const pageRows = 10;

/** A cell of the header: it stays at the top when the page scrolls, and draws the rule under it. */
const stickyHead =
  "sticky top-0 z-10 h-9 bg-background text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--color-border)]";

const skeletonRows = ["1", "2", "3", "4", "5", "6", "7", "8"];

/** The id of the Sheep of the row that contains the element, or null. */
function rowIdOf(target: EventTarget): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("tr[data-sheep-id]")?.dataset.sheepId ?? null;
}

/**
 * One Sheep. It renders again only when its data, its focus, its selection or the visible columns
 * change, not when the focus or the selection of other rows changes.
 */
const SheepRow = memo(function SheepRow({
  row,
  active,
  selected,
  selectable,
  onToggle,
  register,
}: {
  row: SheepTableRow;
  active: boolean;
  selected: boolean;
  selectable: boolean;
  onToggle: (sheepId: SheepId) => void;
  /** The ids of the visible columns: a new value renders the row again. */
  visibleColumns: string;
  register: (id: string, element: HTMLTableRowElement | null) => void;
}) {
  const { t } = useLingui();
  const tag = row.original.tag;

  return (
    <TableRow
      ref={(element) => register(row.id, element)}
      data-sheep-id={row.id}
      data-state={selected ? "selected" : undefined}
      tabIndex={active ? 0 : -1}
      // `outline-hidden` keeps the style of the outline, so that the ring of the keyboard focus shows.
      className="h-9 scroll-mt-9 cursor-pointer outline-hidden focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid data-[state=selected]:bg-selection data-[state=selected]:hover:bg-selection data-[state=selected]:focus-visible:bg-selection"
    >
      {/* The row has the focus, not its checkbox: `Space` on the row toggles it. */}
      <TableCell data-select-cell className="w-8 cursor-default px-2 py-0">
        <Checkbox
          tabIndex={-1}
          aria-label={tag === null ? t`Выбрать барана без бирки` : t`Выбрать барана ${tag}`}
          checked={selected}
          disabled={!selectable}
          onCheckedChange={() => onToggle(row.original.id)}
        />
      </TableCell>
      {row.getVisibleCells().map((cell) => (
        <SheepCell key={cell.id} cell={cell} />
      ))}
    </TableRow>
  );
});

function SheepCell({ cell }: { cell: Cell<typeof features, SheepListItem, unknown> }) {
  const numeric = cell.column.columnDef.meta?.numeric === true;
  return (
    <TableCell className={cn("px-2 py-0", numeric && "text-right")}>
      <FlexRender cell={cell} />
    </TableCell>
  );
}

/** An empty value: a muted dash. */
export function NoValue() {
  return <span className="text-muted-foreground">—</span>;
}

function TextCell({ text, className }: { text: string | null; className?: string }) {
  if (text === null) return <NoValue />;
  return <span className={className}>{text}</span>;
}

function SexCell({ sheep }: { sheep: SheepListItem }) {
  const { i18n } = useLingui();
  return (
    <>
      {i18n._(sexLabels[sheep.sex])}
      {sheep.lamb && (
        <span className="text-muted-foreground">
          {" · "}
          <Trans>ягнёнок</Trans>
        </span>
      )}
    </>
  );
}

function DateCell({ date }: { date: string | null }) {
  const { i18n } = useLingui();
  if (date === null) return <NoValue />;
  return <>{formatCalendarDate(date, i18n.locale)}</>;
}

/** An Active Sheep is the normal state, so it has no badge; the other Statuses have one. */
export function StatusCell({ status }: { status: SheepStatus }) {
  const { i18n } = useLingui();
  const label = i18n._(statusLabels[status]);
  if (status === "active") return <span className="text-muted-foreground">{label}</span>;
  return <Badge variant="secondary">{label}</Badge>;
}

function OriginCell({ sheep }: { sheep: SheepListItem }) {
  const { i18n } = useLingui();
  return (
    <>
      {i18n._(originLabels[sheep.origin])}
      {sheep.initialEntry && (
        <span className="text-muted-foreground">
          {" · "}
          <Trans>начальный ввод</Trans>
        </span>
      )}
    </>
  );
}

function WeightCell({ kg }: { kg: number | null }) {
  const { i18n } = useLingui();
  if (kg === null) return <NoValue />;
  return <>{formatKg(kg, i18n.locale)}</>;
}

function ShareCell({ share }: { share: number }) {
  const { i18n } = useLingui();
  return <>{formatShareNumber(share, i18n.locale)}</>;
}

function GradeCell({ grade }: { grade: Grade | null }) {
  const { i18n } = useLingui();
  if (grade === null) return <NoValue />;
  return <>{i18n._(gradeLabels[grade])}</>;
}
