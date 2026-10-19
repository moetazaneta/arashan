import { normGroups, useCancelResourceEvent } from "@arashan/client";
import type { Farm, ResourceCard, ResourceEventKind, ResourceEventRow } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";

import {
  ArchivedBadge,
  DataCell,
  EmptyList,
  ErrorAlert,
  HeadCell,
  NoValue,
  ShortText,
  tableClass,
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
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import { currencySymbol, formatAmount, formatCalendarDate, formatQuantity } from "@/format";

import { EventDialog } from "./event-dialog";
import { ResourceDialog } from "./resource-dialog";
import { Stock } from "./stock";
import { NormsDialog, normLabels } from "./norms-dialog";
import { ResourceForecast } from "./forecast";

/** The name of each kind of event, as the list of events shows it. */
const kindLabels: Record<ResourceEventKind, MessageDescriptor> = {
  restock: msg({ context: "resource event", message: "Пополнение" }),
  usage: msg({ context: "resource event", message: "Выдача" }),
  adjustment: msg({ context: "resource event", message: "Корректировка" }),
};

/** The card of a Resource: its Stock now, the actions that record an event, and the events. */
export function ResourceCardView({ farm, resource }: { farm: Farm; resource: ResourceCard }) {
  const [editing, setEditing] = useState(false);
  const [normsOpen, setNormsOpen] = useState(false);
  const { i18n } = useLingui();
  const [recording, setRecording] = useState<ResourceEventKind | null>(null);
  // The last kind stays while the dialog closes, so that its title does not change, and each
  // opening gets a new form with empty fields.
  const [lastKind, setLastKind] = useState<ResourceEventKind>("restock");
  const [openings, setOpenings] = useState(0);
  const record = (kind: ResourceEventKind) => {
    setLastKind(kind);
    setRecording(kind);
    setOpenings((count) => count + 1);
  };

  return (
    <>
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {resource.name}
            {resource.archived && <ArchivedBadge />}
          </h1>
          <p className="text-sm text-muted-foreground">
            <Trans>Запас</Trans>
          </p>
          <Stock
            quantity={resource.stock}
            unit={resource.unit}
            className="text-3xl font-semibold tracking-tight"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!resource.archived && (
            <>
              <Button onClick={() => record("restock")}>
                <Trans>Пополнить</Trans>
              </Button>
              <Button variant="outline" onClick={() => record("usage")}>
                <Trans>Выдать стаду</Trans>
              </Button>
              <Button variant="outline" onClick={() => record("adjustment")}>
                <Trans>Пересчитать</Trans>
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Trans>Изменить</Trans>
          </Button>
        </div>
      </header>
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold tracking-tight">
            <Trans>Нормы</Trans>
          </h2>
          {!resource.archived && (
            <Button variant="outline" size="sm" onClick={() => setNormsOpen(true)}>
              <Trans>Изменить нормы</Trans>
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <Trans>На одного барана в день</Trans>
        </p>
        <dl className="flex flex-wrap gap-6 text-sm">
          {normGroups.map((group) => (
            <div key={group} className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">{i18n._(normLabels[group])}</dt>
              <dd>
                {resource.norms[group] === 0 ? (
                  <NoValue />
                ) : (
                  <Stock quantity={resource.norms[group]} unit={resource.unit} />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {!resource.archived && <ResourceForecast farm={farm} resource={resource} />}
      <EventsTable farm={farm} resource={resource} />
      <NormsDialog
        farmId={farm.id}
        resource={resource}
        open={normsOpen}
        onOpenChange={setNormsOpen}
      />
      <ResourceDialog
        farmId={farm.id}
        resource={resource}
        open={editing}
        onOpenChange={setEditing}
      />
      <EventDialog
        key={openings}
        farm={farm}
        resource={resource}
        kind={lastKind}
        open={recording !== null}
        onOpenChange={(open) => {
          if (!open) setRecording(null);
        }}
      />
    </>
  );
}

/** The events of the Resource, the newest first, each with the Stock after it. */
function EventsTable({ farm, resource }: { farm: Farm; resource: ResourceCard }) {
  const { i18n, t } = useLingui();
  const [cancelling, setCancelling] = useState<ResourceEventRow | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const symbol = currencySymbol(farm.currency, i18n.locale);
  const { unit } = resource;

  if (resource.events.length === 0) {
    return (
      <EmptyList
        title={
          <Trans>Здесь будут пополнения, выдачи стадам и корректировки после пересчёта.</Trans>
        }
      />
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold tracking-tight">
        <Trans>Записи</Trans>
      </h2>
      <Table aria-label={t`Записи ресурса`} className={tableClass}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <HeadCell>
              <Trans>Дата</Trans>
            </HeadCell>
            <HeadCell>
              <Trans>Событие</Trans>
            </HeadCell>
            <HeadCell numeric>
              <Trans>Количество, {unit}</Trans>
            </HeadCell>
            <HeadCell numeric>
              <Trans>Запас после</Trans>
            </HeadCell>
            <HeadCell>
              <Trans>Подробности</Trans>
            </HeadCell>
            <HeadCell />
          </TableRow>
        </TableHeader>
        <TableBody>
          {resource.events.map((event) => (
            <TableRow key={event.id} className="h-9">
              <DataCell>{formatCalendarDate(event.date, i18n.locale)}</DataCell>
              <DataCell>{i18n._(kindLabels[event.kind])}</DataCell>
              <DataCell numeric>{formatQuantity(event.change, i18n.locale, true)}</DataCell>
              <DataCell numeric>
                <Stock quantity={event.stockAfter} unit={resource.unit} />
              </DataCell>
              <DataCell>
                <EventDetails farm={farm} event={event} symbol={symbol} />
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
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setCancelling(event);
                          setCancelOpen(true);
                        }}
                      >
                        <Trans context="resource event">Отменить</Trans>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DataCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {cancelling !== null && (
        <CancelEventDialog
          farm={farm}
          resource={resource}
          event={cancelling}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
        />
      )}
    </section>
  );
}

/** The Flock of a Usage, the reason of an Adjustment, or the price of a Restock. */
function EventDetails({
  farm,
  event,
  symbol,
}: {
  farm: Farm;
  event: ResourceEventRow;
  symbol: string;
}) {
  const { i18n } = useLingui();
  if (event.flock !== null) {
    return (
      <Link
        to="/farms/$farmId/flocks/$flockId"
        params={{ farmId: farm.id, flockId: event.flock.id }}
        className="underline-offset-4 hover:underline"
      >
        {event.flock.name}
      </Link>
    );
  }
  if (event.reason !== null) return <ShortText text={event.reason} />;
  if (event.expense !== null) {
    const amount = formatAmount(event.expense.amount, i18n.locale);
    return (
      <span className="flex items-center gap-2">
        <span className="tabular-nums">
          {amount} {symbol}
        </span>
        <Badge variant="secondary">
          <Trans context="resource event">Расход</Trans>
        </Badge>
      </span>
    );
  }
  if (event.kind === "restock") {
    return (
      <span className="text-muted-foreground">
        <Trans>Без цены</Trans>
      </span>
    );
  }
  return <NoValue />;
}

/**
 * A Member cancels an event made by mistake, after a confirmation. The Stock changes back, and the
 * Expense of a Restock goes away with it.
 */
function CancelEventDialog({
  farm,
  resource,
  event,
  open,
  onOpenChange,
}: {
  farm: Farm;
  resource: ResourceCard;
  event: ResourceEventRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n } = useLingui();
  const cancel = useCancelResourceEvent(farm.id);
  const error = useErrorMessage(cancel.error);
  const date = formatCalendarDate(event.date, i18n.locale);
  const kind = i18n._(kindLabels[event.kind]);
  const quantity = formatQuantity(event.change, i18n.locale, true);
  const { unit } = resource;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) cancel.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Отменить запись?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              {kind}, {date}, {quantity} {unit}. Отмените запись, только если её сделали по ошибке:
              запас пересчитается.
            </Trans>
            {event.expense !== null && (
              <>
                {" "}
                <Trans>Расход этого пополнения тоже удалится.</Trans>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Назад</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(event.id, { onSuccess: () => onOpenChange(false) })}
          >
            {cancel.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans context="resource event">Отменить запись</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
