import { useRestoreFromTrash } from "@arashan/client";
import type { Farm, TrashItem } from "@arashan/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";

import { DataCell, HeadCell, SkeletonRows, tableClass } from "@/components/flocks/shared";
import { categoryName } from "@/components/money/category-names";
import { statusLabels } from "@/components/sheep/labels";
import { useSheepTag } from "@/components/sheep/sheep-ref";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import {
  currencySymbol,
  formatAmount,
  formatCalendarDate,
  formatDateTime,
  formatQuantity,
} from "@/format";

import { trashKindLabel } from "./labels";

/** The records in the Trash, the one deleted last first, each with its button «Восстановить». */
export function TrashTable({ farm, items }: { farm: Farm; items: TrashItem[] | undefined }) {
  const { t } = useLingui();

  return (
    <Table aria-label={t`Корзина`} className={tableClass}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <HeadCell>
            <Trans>Что</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Запись</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Удалено</Trans>
          </HeadCell>
          <HeadCell />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items === undefined ? (
          <SkeletonRows columns={4} />
        ) : (
          items.map((item) => <TrashRow key={`${item.kind}:${item.id}`} farm={farm} item={item} />)
        )}
      </TableBody>
    </Table>
  );
}

/**
 * One record in the Trash. After a restore the list no longer has it, so the row goes away. If a rule
 * stops the restore, for example another Sheep has the Tag now, the row stays and says why.
 */
function TrashRow({ farm, item }: { farm: Farm; item: TrashItem }) {
  const { i18n } = useLingui();
  const restore = useRestoreFromTrash(farm.id);
  const error = useErrorMessage(restore.error);
  // After a success the button stays disabled until the list drops the row.
  const busy = restore.isPending || restore.isSuccess;
  // The buttons of all rows have one name, so each one names its record as its description.
  const recordId = useId();

  return (
    <TableRow className="h-9">
      <DataCell>{i18n._(trashKindLabel(item))}</DataCell>
      <DataCell>
        <span id={recordId} className="block max-w-xl truncate">
          <TrashRecord farm={farm} item={item} />
        </span>
        {error !== null && (
          <p role="alert" className="pb-1.5 text-xs whitespace-normal text-destructive">
            {error}
          </p>
        )}
      </DataCell>
      <DataCell>{formatDateTime(item.deletedAt, farm.timeZone, i18n.locale)}</DataCell>
      <DataCell className="w-0 text-right">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          aria-describedby={recordId}
          onClick={() => restore.mutate({ kind: item.kind, id: item.id })}
        >
          {restore.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Восстановить</Trans>
        </Button>
      </DataCell>
    </TableRow>
  );
}

/** The quiet dot between the parts of a record. */
function Dot() {
  return <span className="text-muted-foreground"> · </span>;
}

/**
 * What the record is, as the other pages show it, but with no links: the page of a Deleted record
 * shows nothing.
 */
function TrashRecord({ farm, item }: { farm: Farm; item: TrashItem }) {
  const { i18n } = useLingui();
  const tag = useSheepTag();
  const date = (value: string) => formatCalendarDate(value, i18n.locale);
  const money = (amount: number) =>
    `${formatAmount(amount, i18n.locale)} ${currencySymbol(farm.currency, i18n.locale)}`;

  switch (item.kind) {
    case "sheep": {
      const sheep = item.record;
      return (
        <>
          <span className="font-medium">{tag(sheep)}</span>
          {sheep.name !== null && ` ${sheep.name}`}
          {sheep.status !== "active" && (
            <>
              <Dot />
              {i18n._(statusLabels[sheep.status])}
            </>
          )}
        </>
      );
    }
    case "deal": {
      const deal = item.record;
      const count = deal.sheepCount;
      const more = count - deal.sheep.length;
      return (
        <>
          {date(deal.date)}
          {deal.price !== null && (
            <>
              <Dot />
              {money(deal.price)}
            </>
          )}
          <Dot />
          <Plural value={count} one="# баран" few="# барана" many="# баранов" other="# барана" />
          {deal.sheep.length > 0 && `: ${deal.sheep.map(tag).join(", ")}`}
          {more > 0 && <span className="text-muted-foreground"> +{more}</span>}
        </>
      );
    }
    case "moneyRecord": {
      const record = item.record;
      return (
        <>
          {date(record.date)}
          <Dot />
          {categoryName(record.category, i18n)}
          <Dot />
          {money(record.amount)}
          {record.notes !== null && (
            <>
              <Dot />
              <span className="text-muted-foreground">{record.notes}</span>
            </>
          )}
        </>
      );
    }
    case "moneyCategory":
      return <>{categoryName(item.record, i18n)}</>;
    case "resourceEvent": {
      const event = item.record;
      const quantity = `${formatQuantity(event.quantity, i18n.locale)} ${event.resource.unit}`;
      return (
        <>
          {date(event.date)}
          <Dot />
          {event.resource.name}
          <Dot />
          {/* The quantity of an Adjustment is what the Member counted, not a change. */}
          {event.kind === "adjustment" ? <Trans>остаток {quantity}</Trans> : quantity}
          {event.flock !== null && (
            <>
              <Dot />
              {event.flock.name}
            </>
          )}
        </>
      );
    }
    case "breed":
      return <>{item.record.name}</>;
    case "shepherdAssignment": {
      const assignment = item.record;
      const from = date(assignment.from);
      const to = assignment.to === null ? null : date(assignment.to);
      return (
        <>
          {assignment.shepherd.name}
          <Dot />
          {assignment.flock.name}
          <Dot />
          {to === null ? (
            <Trans>с {from} по сей день</Trans>
          ) : (
            <Trans>
              с {from} по {to}
            </Trans>
          )}
        </>
      );
    }
  }
}
