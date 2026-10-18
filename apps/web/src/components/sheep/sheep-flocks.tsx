import { dateAt, type SheepCardData, useSheepResponsible, useUndoFlockMove } from "@arashan/client";
import type { Farm, FarmId, FlockRef, SheepFlockStay, ShepherdRef } from "@arashan/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useError, useErrorMessage } from "@/errors";
import { formatCalendarDate } from "@/format";
import { cn } from "@/lib/utils";

// The Flocks in the tab «История» of a Sheep: where the Sheep was, with whom, and who was
// responsible for it on a day.

/** The section «Стада»: the stays of the Sheep in Flocks, the newest first, with their Shepherds. */
export function SheepFlockStays({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 id={headingId} className="text-base font-semibold">
          <Trans>Стада</Trans>
        </h2>
        {sheep.flocks.length > 0 && sheep.status === "active" && (
          <UndoFlockMoveDialog farm={farm} sheep={sheep} />
        )}
      </div>
      {sheep.flocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Trans>Баран ещё не был в стаде.</Trans>
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5 text-sm tabular-nums">
          {sheep.flocks.map((stay) => (
            <StayItem key={`${stay.flock.id} ${stay.from}`} farmId={farm.id} stay={stay} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** «Верхнее — с 01.05.2026 по 30.09.2026 · чабаны: Асан, Бек». */
function StayItem({ farmId, stay }: { farmId: FarmId; stay: SheepFlockStay }) {
  const { i18n } = useLingui();
  const from = formatCalendarDate(stay.from, i18n.locale);
  const to = stay.to === null ? null : formatCalendarDate(stay.to, i18n.locale);

  return (
    <li>
      <FlockLink farmId={farmId} flock={stay.flock} className="font-medium" />
      <span className="text-muted-foreground">
        {" — "}
        {to === null ? (
          <Trans>с {from}</Trans>
        ) : (
          <Trans>
            с {from} по {to}
          </Trans>
        )}
        {" · "}
        <ShepherdsText shepherds={stay.shepherds} />
      </span>
    </li>
  );
}

/**
 * A Member undoes the last move of the Sheep, made by mistake, after a confirmation. The Sheep goes
 * back to where it was before the move.
 */
function UndoFlockMoveDialog({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const undo = useUndoFlockMove(farm.id);
  const [open, setOpen] = useState(false);
  const error = useErrorMessage(undo.error);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) undo.reset();
      }}
    >
      <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
        <Trans>Отменить последний перевод</Trans>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Отменить последний перевод?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Баран вернётся туда, где был до этого перевода.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Оставить</Trans>
          </AlertDialogCancel>
          <Button
            disabled={undo.isPending}
            onClick={() => undo.mutate(sheep.id, { onSuccess: () => setOpen(false) })}
          >
            {undo.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans>Отменить перевод</Trans>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The section «Кто отвечал за барана»: the Flocks that had the Sheep on a date, by default today on
 * the Farm, and their Shepherds on that date.
 */
export function SheepResponsible({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const today = dateAt(Date.now(), farm.timeZone);
  const [date, setDate] = useState(today);
  const responsible = useSheepResponsible(farm.id, sheep.id, date);
  const error = useError(responsible.error);
  const dateError = error?.code === "sheep.dateInvalid" ? error.message : null;
  const headingId = useId();
  const dateId = useId();
  const answer = responsible.data;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        <Trans>Кто отвечал за барана</Trans>
      </h2>
      <Field data-invalid={dateError !== null} className="w-fit">
        <FieldLabel htmlFor={dateId}>
          <Trans>Дата</Trans>
        </FieldLabel>
        <Input
          id={dateId}
          type="date"
          max={today}
          className="w-44 tabular-nums"
          value={date}
          aria-invalid={dateError !== null}
          onChange={(event) => setDate(event.target.value)}
        />
        <FieldError>{dateError}</FieldError>
      </Field>
      <div aria-live="polite" className="flex flex-col gap-1.5 text-sm">
        {error !== null ? (
          dateError === null && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )
        ) : answer === undefined ? (
          <Skeleton className="h-4 w-64" />
        ) : answer.length === 0 ? (
          <p className="text-muted-foreground">
            <Trans>В этот день баран не был в стаде.</Trans>
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {answer.map(({ flock, shepherds }) => (
                <li key={flock.id}>
                  <Trans>
                    Стадо «<FlockLink farmId={farm.id} flock={flock} className="font-medium" />»
                  </Trans>
                  <span className="text-muted-foreground">
                    {" — "}
                    <ShepherdsText shepherds={shepherds} />
                  </span>
                </li>
              ))}
            </ul>
            {answer.length > 1 && (
              <p className="text-muted-foreground">
                <Trans>В этот день барана перевели в другое стадо.</Trans>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function FlockLink({
  farmId,
  flock,
  className,
}: {
  farmId: FarmId;
  flock: FlockRef;
  className?: string;
}) {
  return (
    <Link
      to="/farms/$farmId/flocks/$flockId"
      params={{ farmId, flockId: flock.id }}
      className={cn("underline-offset-4 hover:underline", className)}
    >
      {flock.name}
    </Link>
  );
}

/** «чабаны: Асан, Бек», «чабан: Асан» or «чабан не назначен». */
function ShepherdsText({ shepherds }: { shepherds: readonly ShepherdRef[] }) {
  if (shepherds.length === 0) return <Trans>чабан не назначен</Trans>;
  const names = shepherds.map((shepherd) => shepherd.name).join(", ");
  return <Plural value={shepherds.length} _1={`чабан: ${names}`} other={`чабаны: ${names}`} />;
}
