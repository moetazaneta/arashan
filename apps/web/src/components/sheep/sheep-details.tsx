import type { SheepCardData } from "@arashan/client";
import type { Farm, OwnerPeriod, Weighing } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { formatCalendarDate, formatDateAt, formatKg } from "@/format";

import { originLabels, sexLabels } from "./labels";
import { NoValue, StatusCell } from "./sheep-table";

/**
 * The tab «Карточка»: the main fields of a Sheep, the history of its Owners, and the block
 * «Дополнительно» with the fields that a Member needs less often. Later slices add the parents, the
 * Passport and the Grade to that block.
 */
export function SheepDetails({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const { i18n } = useLingui();
  const date = (value: string | null) =>
    value === null ? <NoValue /> : formatCalendarDate(value, i18n.locale);
  const hasMore = sheep.weight !== null || sheep.notes !== null;
  const ownersId = useId();

  return (
    <div className="flex flex-col gap-8">
      <Fields>
        <FieldRow label={<Trans>Бирка</Trans>}>{sheep.tag ?? <NoValue />}</FieldRow>
        <FieldRow label={<Trans>Кличка</Trans>}>{sheep.name ?? <NoValue />}</FieldRow>
        <FieldRow label={<Trans>Пол</Trans>}>
          {i18n._(sexLabels[sheep.sex])}
          {sheep.lamb && (
            <span className="text-muted-foreground">
              {" · "}
              <Trans>ягнёнок</Trans>
            </span>
          )}
        </FieldRow>
        <FieldRow label={<Trans>Дата рождения</Trans>}>{date(sheep.birthDate)}</FieldRow>
        <FieldRow label={<Trans>Стадо</Trans>}>
          {sheep.flock === null ? (
            <NoValue />
          ) : (
            <Link
              to="/farms/$farmId/flocks/$flockId"
              params={{ farmId: farm.id, flockId: sheep.flock.id }}
              className="underline-offset-4 hover:underline"
            >
              {sheep.flock.name}
            </Link>
          )}
        </FieldRow>
        <FieldRow label={<Trans>Владелец</Trans>}>{sheep.owner?.name ?? <NoValue />}</FieldRow>
        <FieldRow label={<Trans>Статус</Trans>}>
          <StatusCell status={sheep.status} />
        </FieldRow>
        <FieldRow label={<Trans>Происхождение</Trans>}>
          {i18n._(originLabels[sheep.origin])}
        </FieldRow>
      </Fields>

      <section aria-labelledby={ownersId} className="flex flex-col gap-3">
        <h2 id={ownersId} className="text-base font-semibold">
          <Trans>Владельцы</Trans>
        </h2>
        <ol className="flex flex-col gap-1.5 text-sm">
          {sheep.owners.map((period, index) => (
            <OwnerPeriodItem
              key={`${period.owner.id} ${period.since ?? ""} ${index}`}
              period={period}
            />
          ))}
        </ol>
      </section>

      <Separator />

      <Collapsible defaultOpen={hasMore} className="flex flex-col gap-3">
        <CollapsibleTrigger
          render={<Button variant="ghost" size="sm" className="group/more -ml-2.5 w-fit" />}
        >
          <Trans>Дополнительно</Trans>
          <ChevronDownIcon
            data-icon="inline-end"
            className="transition-transform group-data-panel-open/more:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Fields>
            <FieldRow label={<Trans>Вес</Trans>}>
              {sheep.weight === null ? <NoValue /> : <WeightText weight={sheep.weight} />}
            </FieldRow>
            <FieldRow label={<Trans>Заметки</Trans>}>
              {sheep.notes === null ? (
                <NoValue />
              ) : (
                <p className="max-w-[65ch] whitespace-pre-wrap">{sheep.notes}</p>
              )}
            </FieldRow>
            <FieldRow label={<Trans>Начальный ввод</Trans>}>
              {sheep.initialEntry ? <Trans>Да</Trans> : <Trans>Нет</Trans>}
            </FieldRow>
            <FieldRow label={<Trans>Дата регистрации</Trans>}>
              {formatDateAt(sheep.registeredAt, farm.timeZone, i18n.locale)}
            </FieldRow>
          </Fields>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** «aibek — с 01.06.2026», or «при регистрации» for the first Owner. */
function OwnerPeriodItem({ period }: { period: OwnerPeriod }) {
  const { i18n } = useLingui();
  const since = period.since === null ? null : formatCalendarDate(period.since, i18n.locale);

  return (
    <li className="tabular-nums">
      <span className="font-medium">{period.owner.name}</span>
      <span className="text-muted-foreground">
        {" — "}
        {since === null ? <Trans>при регистрации</Trans> : <Trans>с {since}</Trans>}
      </span>
    </li>
  );
}

/** «42 кг, взвешен 01.10.2026». */
function WeightText({ weight }: { weight: Weighing }) {
  const { i18n } = useLingui();
  const kg = formatKg(weight.kg, i18n.locale);
  const weighed = formatCalendarDate(weight.date, i18n.locale);
  return (
    <Trans>
      {kg} кг, взвешен {weighed}
    </Trans>
  );
}

function Fields({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[minmax(8rem,max-content)_1fr] gap-x-8 gap-y-2.5 text-sm tabular-nums">
      {children}
    </dl>
  );
}

function FieldRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
