import { useDeal, useFarm } from "@arashan/client";
import type { DealCard, DealId, Farm, FarmId } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, SearchXIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

import { CancelDealDialog, ChangePriceDialog } from "@/components/deals/deal-dialogs";
import { dealKindLabels } from "@/components/deals/labels";
import { DataCell, HeadCell, NoValue, tableClass } from "@/components/flocks/shared";
import { Loading } from "@/components/loading";
import { sexLabels } from "@/components/sheep/labels";
import { SheepLink } from "@/components/sheep/sheep-ref";
import { StatusCell } from "@/components/sheep/sheep-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import { currencySymbol, formatAmount, formatCalendarDate } from "@/format";

export const Route = createFileRoute("/farms/$farmId/deals/$dealId")({
  component: DealCardPage,
});

/**
 * The card of a Sale or a Purchase: its date, its total price, its Automatic record and its Sheep,
 * and what a Member can do to it: change the price, or cancel it.
 */
function DealCardPage() {
  const { farmId, dealId } = Route.useParams() as { farmId: FarmId; dealId: DealId };
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const deal = useDeal(farmId, dealId);
  const error = useErrorMessage(deal.error);

  if (farm === undefined) return null;
  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/farms/$farmId/deals"
        params={{ farmId }}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2.5 w-fit" })}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        <Trans>Сделки</Trans>
      </Link>
      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : deal.data === undefined ? (
        <Loading />
      ) : deal.data === null ? (
        <Gone farmId={farmId} />
      ) : (
        <Card farm={farm} deal={deal.data} />
      )}
    </div>
  );
}

/** A cancelled deal, or one that the Farm never had. */
function Gone({ farmId }: { farmId: FarmId }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Этой сделки нет: её отменили.</Trans>
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/farms/$farmId/deals" params={{ farmId }} className={buttonVariants()}>
          <Trans>К списку сделок</Trans>
        </Link>
      </EmptyContent>
    </Empty>
  );
}

function Card({ farm, deal }: { farm: Farm; deal: DealCard }) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const sheepId = useId();
  const kind = i18n._(dealKindLabels[deal.kind]);
  const date = formatCalendarDate(deal.date, i18n.locale);
  const price = `${formatAmount(deal.price, i18n.locale)} ${currencySymbol(farm.currency, i18n.locale)}`;
  const sale = deal.kind === "sale";

  return (
    <>
      <header className="flex flex-wrap items-start gap-4">
        <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
          <Trans>
            {kind} от {date}
          </Trans>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <ChangePriceDialog farm={farm} deal={deal} />
          <CancelDealDialog
            farm={farm}
            deal={deal}
            onCancelled={() =>
              void navigate({ to: "/farms/$farmId/deals", params: { farmId: farm.id } })
            }
          />
        </div>
      </header>
      <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        <Row label={<Trans>Дата</Trans>}>{date}</Row>
        <Row label={<Trans>Сумма</Trans>}>
          <span className="font-medium tabular-nums">{price}</span>
        </Row>
        <Row label={sale ? <Trans>Доход</Trans> : <Trans>Расход</Trans>}>
          <Link
            to={sale ? "/farms/$farmId/incomes" : "/farms/$farmId/expenses"}
            params={{ farmId: farm.id }}
            className="underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            {sale ? <Trans>«Продажа баранов»</Trans> : <Trans>«Покупка баранов»</Trans>}
          </Link>
        </Row>
        {!sale && (
          <Row label={<Trans>Стадо</Trans>}>
            {deal.flock === null ? (
              <NoValue />
            ) : (
              <Link
                to="/farms/$farmId/flocks/$flockId"
                params={{ farmId: farm.id, flockId: deal.flock.id }}
                className="underline-offset-4 hover:underline"
              >
                {deal.flock.name}
              </Link>
            )}
          </Row>
        )}
      </dl>
      <section aria-labelledby={sheepId} className="flex flex-col gap-3">
        <h2 id={sheepId} className="text-base font-semibold">
          <Trans>Бараны</Trans>{" "}
          <span className="font-normal text-muted-foreground tabular-nums">{deal.sheepCount}</span>
        </h2>
        <Table aria-label={t`Бараны`} className={tableClass}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <HeadCell>
                <Trans>Бирка</Trans>
              </HeadCell>
              <HeadCell>
                <Trans>Пол</Trans>
              </HeadCell>
              <HeadCell>
                <Trans>Владелец</Trans>
              </HeadCell>
              <HeadCell>
                <Trans>Статус</Trans>
              </HeadCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deal.sheep.map((sheep) => (
              <TableRow key={sheep.id} className="h-9">
                <DataCell>
                  <SheepLink farmId={farm.id} sheep={sheep} />
                </DataCell>
                <DataCell>{i18n._(sexLabels[sheep.sex])}</DataCell>
                <DataCell>{sheep.owner?.name ?? <NoValue />}</DataCell>
                <DataCell>
                  <StatusCell status={sheep.status} />
                </DataCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
