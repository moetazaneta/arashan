import { dateAt, useFlocks, useMoveSheep } from "@arashan/client";
import type { Farm, FlockId, SheepId } from "@arashan/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formError, useError, useErrorMessage } from "@/errors";

/** What a move did: how many of the Sheep moved. A Sheep that is there already stays as it is. */
export interface MoveResult {
  moved: number;
  /** How many Sheep the Member chose. */
  total: number;
  /** The Sheep went out of all Flocks, not into a Flock. */
  out: boolean;
}

/** The choice «Вне стада» of the select: out of all Flocks. A Flock id is never this text. */
const outOfFlocks = "out";

const dateCodes = ["sheep.moveDateInvalid", "sheep.dateInvalid"] as const;
const flockCodes = ["flock.archived", "flock.notFound"] as const;

/**
 * A Member moves Sheep into a Flock, or out of all Flocks, on a date: by default today on the Farm.
 * The table «Бараны» opens it for the selected Sheep, the card of a Sheep for that Sheep.
 */
export function MoveSheepDialog({
  farm,
  sheepIds,
  currentFlockId,
  open,
  onOpenChange,
  onMoved,
}: {
  farm: Farm;
  sheepIds: readonly SheepId[];
  /**
   * The Flock that the Sheep is in now, or null if it is in none, when the dialog moves one Sheep:
   * the select leaves that Flock out, and offers «Вне стада» only when the Sheep is in a Flock.
   * Undefined when the Sheep can be in different Flocks.
   */
  currentFlockId?: FlockId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved?: (result: MoveResult) => void;
}) {
  const count = sheepIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {count > 1 ? (
              <Plural
                value={count}
                one="Перевести в стадо # барана"
                few="Перевести в стадо # барана"
                many="Перевести в стадо # баранов"
                other="Перевести в стадо # барана"
              />
            ) : (
              <Trans>Перевести в стадо</Trans>
            )}
          </DialogTitle>
        </DialogHeader>
        <MoveSheepForm
          farm={farm}
          sheepIds={sheepIds}
          currentFlockId={currentFlockId}
          onDone={(result) => {
            onOpenChange(false);
            onMoved?.(result);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function MoveSheepForm({
  farm,
  sheepIds,
  currentFlockId,
  onDone,
}: {
  farm: Farm;
  sheepIds: readonly SheepId[];
  currentFlockId: FlockId | null | undefined;
  onDone: (result: MoveResult) => void;
}) {
  const { t } = useLingui();
  const flocks = useFlocks(farm.id);
  const move = useMoveSheep(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [choice, setChoice] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const error = useError(move.error);
  const flocksError = useErrorMessage(flocks.error);
  const id = useId();
  const flockError =
    error?.code === "flock.archived" || error?.code === "flock.notFound" ? error.message : null;
  const dateError =
    error?.code === "sheep.moveDateInvalid" || error?.code === "sheep.dateInvalid"
      ? error.message
      : null;
  const ownError = formError(error, [...flockCodes, ...dateCodes]);

  // A form does not offer an Archived Flock: it cannot get Sheep.
  const openFlocks = (flocks.data ?? []).filter((flock) => !flock.archived);
  const flockItems = openFlocks
    .filter((flock) => flock.id !== currentFlockId)
    .map((flock) => ({ value: flock.id as string, label: flock.name }));
  const outItem = currentFlockId === null ? null : { value: outOfFlocks, label: t`Вне стада` };
  const items = outItem === null ? flockItems : [...flockItems, outItem];
  const noFlocks = flocks.data !== undefined && openFlocks.length === 0;

  function change() {
    if (move.error !== null) move.reset();
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice === null || move.isPending) return;
        const flockId = choice === outOfFlocks ? null : (choice as FlockId);
        move.mutate(
          { sheepIds, flockId, date },
          {
            onSuccess: ({ moved }) =>
              onDone({ moved, total: sheepIds.length, out: flockId === null }),
          },
        );
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={flockError !== null}>
          <FieldLabel htmlFor={`${id}-flock`}>
            <Trans>Стадо</Trans>
          </FieldLabel>
          <Select
            items={items}
            value={choice}
            onValueChange={(value) => {
              setChoice(value);
              change();
            }}
          >
            <SelectTrigger
              id={`${id}-flock`}
              className="w-full"
              disabled={items.length === 0}
              aria-invalid={flockError !== null}
            >
              <SelectValue placeholder={t`Выберите стадо`} />
            </SelectTrigger>
            <SelectContent>
              {flockItems.length > 0 && (
                <SelectGroup>
                  {flockItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {flockItems.length > 0 && outItem !== null && <SelectSeparator />}
              {outItem !== null && (
                <SelectGroup>
                  <SelectItem value={outItem.value}>{outItem.label}</SelectItem>
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {noFlocks && (
            <FieldDescription>
              <Trans>
                На ферме ещё нет стад.{" "}
                <Link to="/farms/$farmId/flocks" params={{ farmId: farm.id }}>
                  Создать стадо
                </Link>
              </Trans>
            </FieldDescription>
          )}
          <FieldError>{flockError ?? flocksError}</FieldError>
        </Field>
        <Field data-invalid={dateError !== null}>
          <FieldLabel htmlFor={`${id}-date`}>
            <Trans>Дата</Trans>
          </FieldLabel>
          <Input
            id={`${id}-date`}
            type="date"
            max={today}
            className="w-44 tabular-nums"
            value={date}
            aria-invalid={dateError !== null}
            onChange={(event) => {
              setDate(event.target.value);
              change();
            }}
          />
          <FieldError>{dateError}</FieldError>
        </Field>
        {ownError !== null && (
          <Alert variant="destructive">
            <AlertDescription>{ownError.message}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={choice === null || move.isPending}>
          {move.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Перевести</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}
