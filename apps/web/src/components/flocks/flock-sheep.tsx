import type { Farm, FlockCard } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId } from "react";

import { sexLabels } from "@/components/sheep/labels";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/format";

import { DataCell, EmptyList, HeadCell, linkRowProps, NoValue, tableClass } from "./shared";

/** The section «Бараны» of a Flock card: the Sheep in the Flock now, by Tag. */
export function FlockSheep({ farm, flock }: { farm: Farm; flock: FlockCard }) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center gap-3">
        <h2 id={headingId} className="text-base font-semibold">
          <Trans>Бараны</Trans>
        </h2>
      </div>
      {flock.sheep.length === 0 ? (
        <EmptyList
          title={<Trans>В стаде нет баранов.</Trans>}
          // Sheep move into a Flock from the table «Бараны»; an Archived Flock takes none.
          action={
            flock.archived ? undefined : (
              <Link
                to="/farms/$farmId/sheep"
                params={{ farmId: farm.id }}
                className={buttonVariants({ variant: "outline" })}
              >
                <Trans>Перевести из таблицы «Бараны»</Trans>
              </Link>
            )
          }
        />
      ) : (
        <Table aria-label={t`Бараны стада`} className={tableClass}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <HeadCell>
                <Trans>Бирка</Trans>
              </HeadCell>
              <HeadCell>
                <Trans>Кличка</Trans>
              </HeadCell>
              <HeadCell>
                <Trans>Пол</Trans>
              </HeadCell>
              <HeadCell>
                <Trans>Дата рождения</Trans>
              </HeadCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flock.sheep.map((sheep) => (
              <TableRow
                key={sheep.id}
                {...linkRowProps(
                  () =>
                    void navigate({
                      to: "/farms/$farmId/sheep/$sheepId",
                      params: { farmId: farm.id, sheepId: sheep.id },
                    }),
                )}
              >
                <DataCell>
                  <Link
                    to="/farms/$farmId/sheep/$sheepId"
                    params={{ farmId: farm.id, sheepId: sheep.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {sheep.tag ?? <Trans>Без бирки</Trans>}
                  </Link>
                </DataCell>
                <DataCell>{sheep.name ?? <NoValue />}</DataCell>
                <DataCell>{i18n._(sexLabels[sheep.sex])}</DataCell>
                <DataCell>
                  {sheep.birthDate === null ? (
                    <NoValue />
                  ) : (
                    formatCalendarDate(sheep.birthDate, i18n.locale)
                  )}
                </DataCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
