import { dateAt, useMoneyReport, useToday } from "@arashan/client";
import type { Farm, MoneyKind, MoneyReportPart } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";

import {
  ArchivedBadge,
  DataCell,
  ErrorAlert,
  HeadCell,
  SkeletonRows,
  tableClass,
} from "@/components/flocks/shared";
import { categoryName } from "@/components/money/category-names";
import { type PeriodChoice, PeriodFilter, periodOf } from "@/components/money/period-filter";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import { currencyLabel, currencySymbol, formatAmount } from "@/format";
import { cn } from "@/lib/utils";

// The tab «Деньги»: the Incomes and the Expenses of the period by category, and the Incomes minus
// the Expenses. The Automatic records of a Sale, a Purchase or a Restock count as any record.

export function MoneyTab({
  farm,
  period,
  onPeriodChange,
}: {
  farm: Farm;
  period: PeriodChoice;
  onPeriodChange: (period: PeriodChoice) => void;
}) {
  const { i18n, t } = useLingui();
  // Today changes at midnight in the Farm, also on a page that stays open.
  const today = useToday(farm.timeZone) ?? dateAt(Date.now(), farm.timeZone);
  const report = useMoneyReport(farm.id, periodOf(period, today));
  const error = useErrorMessage(report.error);
  const data = report.data;
  const symbol = currencySymbol(farm.currency, i18n.locale);
  // The amounts of the column show the hundredths all or none, so that the figures line up.
  const hundredths =
    data !== undefined &&
    [data.income, data.expense].some((part) =>
      part.categories.some((row) => row.total % 100 !== 0),
    );
  const amount = (value: number) => formatAmount(value, i18n.locale, hundredths);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodFilter value={period} today={today} onChange={onPeriodChange} />
        <span className="ml-auto text-sm text-muted-foreground">
          {currencyLabel(farm.currency, i18n.locale)}
        </span>
      </div>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : (
        <Table aria-label={t`Деньги за период`} className={cn(tableClass, "max-w-3xl")}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <HeadCell>
                <Trans>Категория</Trans>
              </HeadCell>
              <HeadCell numeric>
                <Trans>Записей</Trans>
              </HeadCell>
              <HeadCell numeric>
                <Trans>Сумма, {symbol}</Trans>
              </HeadCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data === undefined ? (
              <SkeletonRows columns={3} />
            ) : (
              <>
                <PartRows kind="income" part={data.income} amount={amount} />
                <PartRows kind="expense" part={data.expense} amount={amount} />
              </>
            )}
          </TableBody>
          {data !== undefined && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <DataCell colSpan={2} className="font-semibold">
                  <Trans>Доходы минус расходы</Trans>
                </DataCell>
                <DataCell
                  numeric
                  className={cn("font-semibold", data.balance < 0 && "text-destructive")}
                >
                  {amount(data.balance)}
                </DataCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      )}
    </div>
  );
}

/** The rows of the Incomes or the Expenses: the total of the kind, then each category. */
function PartRows({
  kind,
  part,
  amount,
}: {
  kind: MoneyKind;
  part: MoneyReportPart;
  amount: (value: number) => string;
}) {
  const { i18n } = useLingui();
  const records = part.categories.reduce((sum, row) => sum + row.count, 0);
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <DataCell className="font-semibold">
          {kind === "income" ? <Trans>Доходы</Trans> : <Trans>Расходы</Trans>}
        </DataCell>
        <DataCell numeric className="font-semibold">
          {records.toLocaleString(i18n.locale)}
        </DataCell>
        <DataCell numeric className="font-semibold">
          {amount(part.total)}
        </DataCell>
      </TableRow>
      {part.categories.length === 0 ? (
        <TableRow className="hover:bg-transparent">
          <DataCell colSpan={3} className="pl-6 text-muted-foreground">
            {kind === "income" ? (
              <Trans>Нет доходов за этот период.</Trans>
            ) : (
              <Trans>Нет расходов за этот период.</Trans>
            )}
          </DataCell>
        </TableRow>
      ) : (
        part.categories.map((row) => (
          <TableRow key={row.category.id} className="hover:bg-transparent">
            <DataCell className="pl-6">
              <span className="flex items-center gap-2">
                {categoryName(row.category, i18n)}
                {row.category.system && (
                  <Badge variant="secondary">
                    <Trans context="money record">Авто</Trans>
                  </Badge>
                )}
                {row.category.archived && <ArchivedBadge />}
              </span>
            </DataCell>
            <DataCell numeric>{row.count.toLocaleString(i18n.locale)}</DataCell>
            <DataCell numeric>{amount(row.total)}</DataCell>
          </TableRow>
        ))
      )}
    </>
  );
}
