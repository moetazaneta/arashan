import { useStockForecast, useToday } from "@arashan/client";
import type { Farm, ResourceCard } from "@arashan/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";

import { DataCell, ErrorAlert, HeadCell, NoValue, tableClass } from "@/components/flocks/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import { formatQuantity } from "@/format";
import { cn } from "@/lib/utils";

/** Whole days of Stock. A missing daily need has no forecast. */
export function StockDays({ days }: { days: number | null }) {
  return days === null ? (
    <NoValue />
  ) : (
    <span className={cn("tabular-nums", days < 7 && "text-destructive")}>
      <Plural value={days} one="# день" few="# дня" many="# дней" other="# дня" />
    </span>
  );
}

/** The Farm forecast and how long the same Stock would last for each Flock alone. */
export function ResourceForecast({ farm, resource }: { farm: Farm; resource: ResourceCard }) {
  const { i18n, t } = useLingui();
  const today = useToday(farm.timeZone)!;
  const forecast = useStockForecast(farm.id, today);
  const error = useErrorMessage(forecast.error);
  const row = forecast.data?.find((row) => row.resourceId === resource.id);
  const { unit } = resource;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold tracking-tight">
        <Trans>Прогноз</Trans>
      </h2>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : forecast.isPending ? (
        <Skeleton className="h-5 w-48" />
      ) : row === undefined ? (
        <NoValue />
      ) : (
        <>
          {resource.norms.ram === 0 && resource.norms.ewe === 0 && resource.norms.lamb === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Trans>Задайте нормы, чтобы увидеть прогноз запаса.</Trans>
            </p>
          ) : (
            <p className="text-sm">
              <Trans>
                Хватит на <StockDays days={row.days} />
              </Trans>
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            <Trans>
              Расход в день: {formatQuantity(row.dailyNeed, i18n.locale)} {unit}
            </Trans>
          </p>
          {row.flocks.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                <Trans>Для каждого стада отдельно, если выдавать весь запас только ему.</Trans>
              </p>
              <Table aria-label={t`Прогноз по стадам`} className={tableClass}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <HeadCell>
                      <Trans>Стадо</Trans>
                    </HeadCell>
                    <HeadCell numeric>
                      <Trans>Самцы</Trans>
                    </HeadCell>
                    <HeadCell numeric>
                      <Trans>Самки</Trans>
                    </HeadCell>
                    <HeadCell numeric>
                      <Trans>Ягнята</Trans>
                    </HeadCell>
                    <HeadCell numeric>
                      <Trans>В день, {unit}</Trans>
                    </HeadCell>
                    <HeadCell numeric>
                      <Trans>Хватит на</Trans>
                    </HeadCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.flocks.map((flock) => (
                    <TableRow key={flock.flock.id}>
                      <DataCell>{flock.flock.name}</DataCell>
                      <DataCell numeric>{flock.counts.ram}</DataCell>
                      <DataCell numeric>{flock.counts.ewe}</DataCell>
                      <DataCell numeric>{flock.counts.lamb}</DataCell>
                      <DataCell numeric>{formatQuantity(flock.dailyNeed, i18n.locale)}</DataCell>
                      <DataCell numeric>
                        <StockDays days={flock.days} />
                      </DataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </>
      )}
    </section>
  );
}
