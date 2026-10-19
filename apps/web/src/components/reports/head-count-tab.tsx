import { useHeadCountReport } from "@arashan/client";
import type { Farm, HeadCountReport, HeadCountRow, SheepGroup } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  DataCell,
  ErrorAlert,
  HeadCell,
  NameWithState,
  SkeletonRows,
  tableClass,
} from "@/components/flocks/shared";
import { filterLabels, statusFilters } from "@/components/sheep/status-filter";
import { Table, TableBody, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import { formatCalendarDate } from "@/format";

// The tab «Поголовье»: the number of Sheep by Status, group, Owner, Flock and Location, each in its
// own small table.

const groupLabels: Record<SheepGroup, MessageDescriptor> = {
  ram: msg({ context: "head count", message: "Самцы" }),
  ewe: msg({ context: "head count", message: "Самки" }),
  lamb: msg({ context: "head count", message: "Ягнята" }),
};

const linkClass = "font-medium underline-offset-4 hover:underline";

export function HeadCountTab({ farm }: { farm: Farm }) {
  const { i18n, t } = useLingui();
  const report = useHeadCountReport(farm.id);
  const error = useErrorMessage(report.error);
  if (error !== null) return <ErrorAlert message={error} />;
  const data = report.data;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {data === undefined ? (
          <Trans>Поголовье фермы</Trans>
        ) : (
          <Trans>
            На {formatCalendarDate(data.date, i18n.locale)}. Таблица по статусу считает всех
            баранов, которые были на ферме, а другие таблицы — только тех, кто на ферме сейчас.
          </Trans>
        )}
      </p>
      <div className="grid grid-cols-2 items-start gap-x-8 gap-y-6">
        <CountTable
          label={t`По статусу`}
          head={t`Статус`}
          total={data === undefined ? undefined : statusTotal(data)}
          rows={statusFilters
            .filter((filter) => filter !== "all")
            .map((status) => ({
              key: status,
              name: (
                <Link
                  to="/farms/$farmId/sheep"
                  params={{ farmId: farm.id }}
                  search={status === "active" ? {} : { status }}
                  className={linkClass}
                >
                  {i18n._(filterLabels[status])}
                </Link>
              ),
              count: data?.byStatus[status],
            }))}
          loading={data === undefined}
        />
        <CountTable
          label={t`По группам`}
          head={t`Группа`}
          total={data?.onFarm}
          rows={(["ram", "ewe", "lamb"] as const).map((group) => ({
            key: group,
            name: i18n._(groupLabels[group]),
            count: data?.byGroup[group],
          }))}
          loading={data === undefined}
        />
        <CountTable
          label={t`По владельцам`}
          head={t`Владелец`}
          total={data?.onFarm}
          rows={refRows(data?.byOwner, t`Без владельца`, (owner) => owner.name)}
          loading={data === undefined}
        />
        <CountTable
          label={t`По стадам`}
          head={t`Стадо`}
          total={data?.onFarm}
          rows={refRows(data?.byFlock, t`Без стада`, (flock) => (
            <Link
              to="/farms/$farmId/flocks/$flockId"
              params={{ farmId: farm.id, flockId: flock.id }}
              className={linkClass}
            >
              {flock.name}
            </Link>
          ))}
          loading={data === undefined}
        />
        <CountTable
          label={t`По местам`}
          head={t`Место`}
          total={data?.onFarm}
          rows={refRows(data?.byLocation, t`Без места`, (location) => location.name)}
          loading={data === undefined}
        />
      </div>
    </div>
  );
}

function statusTotal(report: HeadCountReport): number {
  return Object.values(report.byStatus).reduce((sum, count) => sum + count, 0);
}

interface CountRow {
  key: string;
  name: ReactNode;
  count: number | undefined;
}

/** The rows of a part of the report: a record by name, with the mark of an Archived one. */
function refRows<Ref extends { id: string; name: string; archived: boolean }>(
  rows: HeadCountRow<Ref>[] | undefined,
  none: string,
  nameOf: (ref: Ref) => ReactNode,
): CountRow[] {
  return (rows ?? []).map(({ ref, count }) => ({
    key: ref?.id ?? "none",
    name:
      ref === null ? (
        <span className="text-muted-foreground">{none}</span>
      ) : (
        <NameWithState name={nameOf(ref)} archived={ref.archived} />
      ),
    count,
  }));
}

/** A small table of one part of the report: a name and a count on each row, and the total. */
function CountTable({
  label,
  head,
  rows,
  total,
  loading,
}: {
  label: string;
  head: string;
  rows: CountRow[];
  total: number | undefined;
  loading: boolean;
}) {
  const { i18n } = useLingui();
  const count = (value: number | undefined) =>
    value === undefined ? "" : value.toLocaleString(i18n.locale);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{label}</h2>
      <Table aria-label={label} className={tableClass}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <HeadCell>{head}</HeadCell>
            <HeadCell numeric>
              <Trans>Голов</Trans>
            </HeadCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <SkeletonRows columns={2} />
          ) : (
            rows.map((row) => (
              <TableRow key={row.key} className="hover:bg-transparent">
                <DataCell>{row.name}</DataCell>
                <DataCell numeric>{count(row.count)}</DataCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {!loading && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <DataCell>
                <Trans>Всего</Trans>
              </DataCell>
              <DataCell numeric>{count(total)}</DataCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </section>
  );
}
