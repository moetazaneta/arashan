import {
  dateAt,
  useDeleteMoneyRecord,
  useFlocks,
  useMoneyCategories,
  useMoneyRecords,
} from "@arashan/client";
import type {
  CalendarDate,
  Farm,
  FarmId,
  FlockId,
  MoneyCategoryId,
  MoneyKind,
  MoneyRecordId,
  MoneyRecordRow,
  MoneyScope,
  MoneyScopeRef,
  SheepId,
} from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";

import {
  DataCell,
  EmptyList,
  ErrorAlert,
  HeadCell,
  NoValue,
  ShortText,
  SkeletonRows,
  tableClass,
  useOpenableRows,
} from "@/components/flocks/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import { currencySymbol, formatAmount, formatCalendarDate } from "@/format";

import { categoryName } from "./category-names";
import { kindLabels } from "./labels";
import {
  defaultPeriod,
  FilterSelect,
  type PeriodChoice,
  PeriodFilter,
  periodOf,
} from "./period-filter";
import { RecordDialog } from "./record-dialog";
import { SheepCombobox } from "./sheep-combobox";

// The tab «Записи»: the filters, the table of the records with their total, and the dialogs that
// change and delete a record.

/** What the Member chose for the scope: all records, or the ones of the Farm, a Flock or a Sheep. */
type ScopeChoice =
  | { kind: "all" }
  | { kind: "farm" }
  | { kind: "flock"; flockId: FlockId }
  | { kind: "sheep"; sheepId: SheepId | null };

/** The filters of the table. The page keeps them, so that they stay when the Member changes tabs. */
export interface RecordFilters extends PeriodChoice {
  categoryId: MoneyCategoryId | null;
  scope: ScopeChoice;
}

/** The filters as the page opens: all the records of this year. */
export const defaultFilters: RecordFilters = {
  ...defaultPeriod,
  categoryId: null,
  scope: { kind: "all" },
};

/** True if the filters are the ones of a page that just opened. */
function areDefault(filters: RecordFilters): boolean {
  return (
    filters.period === defaultFilters.period &&
    filters.categoryId === null &&
    filters.scope.kind === "all"
  );
}

/** The scope that the query filters by: none until the Member picks a Sheep. */
function scopeFilterOf(choice: ScopeChoice): MoneyScope | null {
  switch (choice.kind) {
    case "all":
      return null;
    case "farm":
      return { kind: "farm" };
    case "flock":
      return { kind: "flock", flockId: choice.flockId };
    case "sheep":
      return choice.sheepId === null ? null : { kind: "sheep", sheepId: choice.sheepId };
  }
}

export function RecordsTab({
  farm,
  kind,
  filters,
  onFiltersChange,
  onAdd,
}: {
  farm: Farm;
  kind: MoneyKind;
  filters: RecordFilters;
  onFiltersChange: (filters: RecordFilters) => void;
  onAdd: () => void;
}) {
  const { i18n } = useLingui();
  const today = dateAt(Date.now(), farm.timeZone);
  const period = periodOf(filters, today);
  const records = useMoneyRecords(farm.id, {
    kind,
    ...period,
    categoryId: filters.categoryId,
    scope: scopeFilterOf(filters.scope),
  });
  // The filters and the form need the categories: a failed lazy seed shows here too.
  const categories = useMoneyCategories(farm.id, kind);
  const error = useErrorMessage(records.error ?? categories.error);
  // The record of a dialog stays as it was when the dialog opened, also while it closes.
  const [editing, setEditing] = useState<MoneyRecordRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<MoneyRecordRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const labels = kindLabels[kind];
  const list = records.data;
  const empty = list?.records.length === 0;
  const addButton = (
    <Button aria-keyshortcuts="N" onClick={onAdd}>
      {i18n._(labels.add)}
      <Kbd aria-hidden className="ml-1 bg-primary-foreground/15 text-primary-foreground">
        N
      </Kbd>
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar
          farm={farm}
          kind={kind}
          filters={filters}
          today={today}
          onChange={onFiltersChange}
        />
        {list !== undefined && !empty && <div className="ml-auto">{addButton}</div>}
      </div>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : empty ? (
        <EmptyList
          title={i18n._(areDefault(filters) ? labels.empty : labels.noneFound)}
          action={addButton}
        />
      ) : (
        <RecordsTable
          farm={farm}
          kind={kind}
          rows={list?.records}
          total={list?.total}
          onEdit={(record) => {
            setEditing(record);
            setEditOpen(true);
          }}
          onDelete={(record) => {
            setDeleting(record);
            setDeleteOpen(true);
          }}
        />
      )}
      {editing !== null && (
        <RecordDialog
          key={editing.id}
          farm={farm}
          kind={kind}
          record={editing}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {deleting !== null && (
        <DeleteRecordDialog
          farm={farm}
          kind={kind}
          record={deleting}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </div>
  );
}

/** The filters of the table: the period, the category and the scope. */
function FilterBar({
  farm,
  kind,
  filters,
  today,
  onChange,
}: {
  farm: Farm;
  kind: MoneyKind;
  filters: RecordFilters;
  today: CalendarDate;
  onChange: (filters: RecordFilters) => void;
}) {
  const { i18n, t } = useLingui();
  const categories = useMoneyCategories(farm.id, kind);
  const flocks = useFlocks(farm.id);

  // The filters show all categories and Flocks: the old records have the Archived ones too.
  const categoryItems: { value: MoneyCategoryId | null; label: string }[] = [
    { value: null, label: t`Все категории` },
    ...(categories.data ?? []).map((category) => {
      const name = categoryName(category, i18n);
      return {
        value: category.id,
        label: category.archived
          ? t`${name} (в архиве)`
          : category.system
            ? t`${name} (системная)`
            : name,
      };
    }),
  ];
  const scopeItems: { value: string; label: string }[] = [
    { value: "all", label: t`Все` },
    { value: "farm", label: t`Ферма` },
    ...(flocks.data ?? []).map((flock) => {
      const { name } = flock;
      return { value: flock.id, label: flock.archived ? t`${name} (в архиве)` : name };
    }),
    { value: "sheep", label: t`Баран…` },
  ];
  const scopeValue = filters.scope.kind === "flock" ? filters.scope.flockId : filters.scope.kind;

  return (
    <>
      <PeriodFilter
        value={filters}
        today={today}
        onChange={(choice) => onChange({ ...filters, ...choice })}
      />
      <FilterSelect
        label={t`Категория`}
        items={categoryItems}
        value={filters.categoryId}
        onChange={(categoryId) => onChange({ ...filters, categoryId })}
      />
      <FilterSelect
        label={t`Относится к`}
        items={scopeItems}
        value={scopeValue}
        onChange={(value) => {
          const scope: ScopeChoice =
            value === "all" || value === "farm"
              ? { kind: value }
              : value === "sheep"
                ? { kind: "sheep", sheepId: null }
                : { kind: "flock", flockId: value as FlockId };
          onChange({ ...filters, scope });
        }}
      />
      {filters.scope.kind === "sheep" && (
        <SheepCombobox
          farmId={farm.id}
          label={t`Баран`}
          value={filters.scope.sheepId}
          className="w-36"
          onChange={(sheepId) => onChange({ ...filters, scope: { kind: "sheep", sheepId } })}
        />
      )}
    </>
  );
}

/**
 * The records, the newest first, and their total in the footer. A click or `Enter` on a row opens
 * the dialog that changes the record; the menu of the row changes or deletes it.
 */
function RecordsTable({
  farm,
  kind,
  rows,
  total,
  onEdit,
  onDelete,
}: {
  farm: Farm;
  kind: MoneyKind;
  rows: MoneyRecordRow[] | undefined;
  total: number | undefined;
  onEdit: (record: MoneyRecordRow) => void;
  onDelete: (record: MoneyRecordRow) => void;
}) {
  const { i18n, t } = useLingui();
  const { bodyProps, rowProps } = useOpenableRows(
    (rows ?? []).map((record) => record.id),
    (id: MoneyRecordId) => {
      const record = rows?.find((one) => one.id === id);
      if (record !== undefined) onEdit(record);
    },
  );
  const expenses = kind === "expense";
  const columns = expenses ? 7 : 6;
  const symbol = currencySymbol(farm.currency, i18n.locale);
  // The amounts of a column show the hundredths all or none, so that the figures line up.
  const hundredths = rows?.some((record) => record.amount % 100 !== 0) ?? false;

  return (
    <Table aria-label={i18n._(kindLabels[kind].title)} className={tableClass}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <HeadCell>
            <Trans>Дата</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Категория</Trans>
          </HeadCell>
          <HeadCell numeric>
            <Trans>Сумма, {symbol}</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Относится к</Trans>
          </HeadCell>
          {expenses && (
            <HeadCell>
              <Trans>Чабан</Trans>
            </HeadCell>
          )}
          <HeadCell>
            <Trans>Примечание</Trans>
          </HeadCell>
          <HeadCell>
            <span className="sr-only">
              <Trans>Действия</Trans>
            </span>
          </HeadCell>
        </TableRow>
      </TableHeader>
      <TableBody {...bodyProps}>
        {rows === undefined ? (
          <SkeletonRows columns={columns} />
        ) : (
          rows.map((record) => (
            <TableRow key={record.id} {...rowProps(record.id)}>
              <DataCell>{formatCalendarDate(record.date, i18n.locale)}</DataCell>
              <DataCell>
                <span className="flex items-center gap-2">
                  {categoryName(record.category, i18n)}
                  {record.source !== null && (
                    <Badge variant="secondary">
                      <Trans context="money record">Авто</Trans>
                    </Badge>
                  )}
                </span>
              </DataCell>
              <DataCell numeric>{formatAmount(record.amount, i18n.locale, hundredths)}</DataCell>
              <DataCell>
                <ScopeName farmId={farm.id} scope={record.scope} />
              </DataCell>
              {expenses && (
                <DataCell>{record.shepherd === null ? <NoValue /> : record.shepherd.name}</DataCell>
              )}
              <DataCell>
                <ShortText text={record.notes} />
              </DataCell>
              <DataCell className="w-10 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label={t`Действия`} />}
                  >
                    <EllipsisIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => onEdit(record)}>
                        <Trans>Изменить</Trans>
                      </DropdownMenuItem>
                      {/* An Automatic record goes away only with its event. */}
                      {record.source === null && (
                        <DropdownMenuItem variant="destructive" onClick={() => onDelete(record)}>
                          <Trans context="money record">Удалить</Trans>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DataCell>
            </TableRow>
          ))
        )}
      </TableBody>
      {total !== undefined && (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2} className="h-9 px-2 py-0">
              <Trans>Итого</Trans>
            </TableCell>
            <TableCell className="h-9 px-2 py-0 text-right">
              {formatAmount(total, i18n.locale, hundredths)}
            </TableCell>
            <TableCell colSpan={columns - 3} />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

/** What a record is about: «Ферма», the name of its Flock, or its Sheep with a link to the card. */
function ScopeName({ farmId, scope }: { farmId: FarmId; scope: MoneyScopeRef }) {
  switch (scope.kind) {
    case "farm":
      return <Trans>Ферма</Trans>;
    case "flock":
      return <>{scope.flock.name}</>;
    case "sheep": {
      const label = scope.sheep.tag ?? scope.sheep.name;
      // A Sheep that became Deleted has no Tag and no name here.
      if (label === null) return <Trans>Баран без бирки</Trans>;
      return (
        <Link
          to="/farms/$farmId/sheep/$sheepId"
          params={{ farmId, sheepId: scope.sheep.id }}
          className="underline-offset-4 hover:underline"
        >
          <Trans>Баран {label}</Trans>
        </Link>
      );
    }
  }
}

/** A Member deletes a record made by mistake, after a confirmation. It becomes Deleted. */
function DeleteRecordDialog({
  farm,
  kind,
  record,
  open,
  onOpenChange,
}: {
  farm: Farm;
  kind: MoneyKind;
  record: MoneyRecordRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n } = useLingui();
  const remove = useDeleteMoneyRecord(farm.id);
  const error = useErrorMessage(remove.error);
  const date = formatCalendarDate(record.date, i18n.locale);
  const category = categoryName(record.category, i18n);
  const amount = formatAmount(record.amount, i18n.locale);
  const symbol = currencySymbol(farm.currency, i18n.locale);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n._(kindLabels[kind].remove)}</AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              {date}, {category}, {amount} {symbol}. Удалите запись, только если её сделали по
              ошибке.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Отмена</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(record.id, { onSuccess: () => onOpenChange(false) })}
          >
            {remove.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans context="money record">Удалить</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
