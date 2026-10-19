import { useDeals, useFarm } from "@arashan/client";
import type { DealId, DealKind, DealRow, Farm, FarmId } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { BuySheepSheet } from "@/components/deals/purchase-sheet";
import { dealKindLabels } from "@/components/deals/labels";
import {
  DataCell,
  EmptyList,
  ErrorAlert,
  HeadCell,
  NoValue,
  SkeletonRows,
  tableClass,
  useOpenableRows,
} from "@/components/flocks/shared";
import { useSheepTag } from "@/components/sheep/sheep-ref";
import { buttonVariants, Button } from "@/components/ui/button";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useErrorMessage } from "@/errors";
import { currencySymbol, formatAmount, formatCalendarDate } from "@/format";

/** The kinds of deals that the list shows, or all of them. All is the default. */
const kindFilters = ["all", "sale", "purchase"] as const;
type KindFilter = (typeof kindFilters)[number];

const filterLabels: Record<KindFilter, MessageDescriptor> = {
  all: msg({ context: "deals", message: "Все" }),
  sale: msg`Продажи`,
  purchase: msg`Покупки`,
};

interface DealsSearch {
  kind?: DealKind;
}

export const Route = createFileRoute("/farms/$farmId/deals/")({
  validateSearch: (search: Record<string, unknown>): DealsSearch =>
    search.kind === "sale" || search.kind === "purchase" ? { kind: search.kind } : {},
  component: DealsPage,
});

/**
 * The page «Сделки»: the Sales and the Purchases of the Farm, the newest first, and the panel of a
 * new Purchase. A Sale starts in the table «Бараны», with the Sheep that the Farm sells.
 */
function DealsPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const kind = Route.useSearch().kind ?? null;
  const deals = useDeals(farmId, kind);
  const error = useErrorMessage(deals.error);
  const navigate = useNavigate();
  const { i18n, t } = useLingui();
  const [buying, setBuying] = useState(false);

  if (farm === undefined) return null;
  const openDeal = (dealId: DealId) =>
    void navigate({ to: "/farms/$farmId/deals/$dealId", params: { farmId, dealId } });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          <Trans>Сделки</Trans>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/farms/$farmId/sheep"
            params={{ farmId }}
            className={buttonVariants({ variant: "outline" })}
          >
            <Trans>Продать баранов</Trans>
          </Link>
          <Button onClick={() => setBuying(true)}>
            <Trans>Купить баранов</Trans>
          </Button>
        </div>
      </div>
      <ToggleGroup
        aria-label={t`Вид сделки`}
        variant="outline"
        size="sm"
        spacing={0}
        className="w-fit"
        value={[kind ?? "all"]}
        onValueChange={(value) => {
          const [next] = value;
          if (next === undefined) return;
          void navigate({
            to: "/farms/$farmId/deals",
            params: { farmId },
            search: next === "sale" || next === "purchase" ? { kind: next } : {},
            replace: true,
          });
        }}
      >
        {kindFilters.map((filter) => (
          <ToggleGroupItem key={filter} value={filter} className="px-2.5">
            {i18n._(filterLabels[filter])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : deals.data?.length === 0 ? (
        <EmptyList
          title={
            kind === null ? (
              <Trans>
                Здесь будут продажи и покупки баранов. Чтобы продать баранов, выберите их в таблице
                «Бараны».
              </Trans>
            ) : (
              <Trans>Нет сделок этого вида.</Trans>
            )
          }
        />
      ) : (
        <DealsTable farm={farm} rows={deals.data} onOpen={openDeal} />
      )}
      <BuySheepSheet farm={farm} open={buying} onOpenChange={setBuying} onBought={openDeal} />
    </div>
  );
}

/** The deals, the newest first. A click or `Enter` on a row opens the card of the deal. */
function DealsTable({
  farm,
  rows,
  onOpen,
}: {
  farm: Farm;
  rows: DealRow[] | undefined;
  onOpen: (dealId: DealId) => void;
}) {
  const { i18n, t } = useLingui();
  const tag = useSheepTag();
  const { bodyProps, rowProps } = useOpenableRows(
    (rows ?? []).map((deal) => deal.id),
    onOpen,
  );
  const symbol = currencySymbol(farm.currency, i18n.locale);
  // The amounts of a column show the hundredths all or none, so that the figures line up.
  const hundredths = rows?.some((deal) => deal.price % 100 !== 0) ?? false;

  return (
    <Table aria-label={t`Сделки`} className={tableClass}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <HeadCell>
            <Trans>Дата</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Сделка</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Бараны</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Стадо</Trans>
          </HeadCell>
          <HeadCell numeric>
            <Trans>Сумма, {symbol}</Trans>
          </HeadCell>
        </TableRow>
      </TableHeader>
      <TableBody {...bodyProps}>
        {rows === undefined ? (
          <SkeletonRows columns={5} />
        ) : (
          rows.map((deal) => {
            const more = deal.sheepCount - deal.sheep.length;
            return (
              <TableRow key={deal.id} {...rowProps(deal.id)}>
                <DataCell>{formatCalendarDate(deal.date, i18n.locale)}</DataCell>
                <DataCell>{i18n._(dealKindLabels[deal.kind])}</DataCell>
                <DataCell>
                  <span className="block max-w-96 truncate">
                    {deal.sheep.map(tag).join(", ")}
                    {more > 0 && <span className="text-muted-foreground"> +{more}</span>}
                  </span>
                </DataCell>
                <DataCell>{deal.flock === null ? <NoValue /> : deal.flock.name}</DataCell>
                <DataCell numeric>{formatAmount(deal.price, i18n.locale, hundredths)}</DataCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
