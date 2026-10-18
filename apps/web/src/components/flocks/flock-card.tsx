import { dateAt, useArchiveFlock, useUnarchiveFlock } from "@arashan/client";
import type { ErrorCode, Farm, FlockCard } from "@arashan/core";
import { Plural, Trans } from "@lingui/react/macro";
import { useId, useState } from "react";

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
import { Spinner } from "@/components/ui/spinner";
import { useError, useErrorMessage } from "@/errors";

import { FlockDialog } from "./flock-dialog";
import { FlockSheep } from "./flock-sheep";
import { FlockShepherds } from "./flock-shepherds";
import { ArchivedBadge, DateField, ErrorAlert, fieldMessage, FormAlert } from "./shared";

/** The card of a Flock: its name, Location and head count, its Shepherds and its Sheep. */
export function FlockCardView({ farm, flock }: { farm: Farm; flock: FlockCard }) {
  const [editing, setEditing] = useState(false);
  const unarchive = useUnarchiveFlock(farm.id);
  const unarchiveError = useErrorMessage(unarchive.error);
  const count = flock.sheepCount;

  return (
    <>
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {flock.name}
            {flock.archived && <ArchivedBadge />}
          </h1>
          <p className="text-sm text-muted-foreground">
            {flock.location === null ? <Trans>Без места</Trans> : flock.location.name}
            {" · "}
            <span className="tabular-nums">
              <Plural value={count} one="# голова" few="# головы" many="# голов" other="# головы" />
            </span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              unarchive.reset();
              setEditing(true);
            }}
          >
            <Trans>Изменить</Trans>
          </Button>
          {flock.archived ? (
            <Button
              variant="outline"
              disabled={unarchive.isPending}
              onClick={() => unarchive.mutate(flock.id)}
            >
              {unarchive.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              <Trans>Вернуть из архива</Trans>
            </Button>
          ) : (
            <ArchiveFlockDialog farm={farm} flock={flock} />
          )}
        </div>
      </header>
      <ErrorAlert message={unarchiveError} />
      <FlockShepherds farm={farm} flock={flock} />
      <FlockSheep farm={farm} flock={flock} />
      <FlockDialog farm={farm} flock={flock} open={editing} onOpenChange={setEditing} />
    </>
  );
}

/**
 * A Member sends a Flock with no Sheep to the archive. The open assignments of its Shepherds end on
 * the last day of their work: by default today on the Farm.
 */
function ArchiveFlockDialog({ farm, flock }: { farm: Farm; flock: FlockCard }) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>В архив</Trans>
      </Button>
      <AlertDialogContent>
        <ArchiveFlockForm farm={farm} flock={flock} onArchived={() => setOpen(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

const dateCodes: readonly ErrorCode[] = ["flock.endDateInvalid"];

function ArchiveFlockForm({
  farm,
  flock,
  onArchived,
}: {
  farm: Farm;
  flock: FlockCard;
  onArchived: () => void;
}) {
  const archive = useArchiveFlock(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [date, setDate] = useState(today);
  const error = useError(archive.error);
  const id = useId();
  const { name } = flock;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (archive.isPending) return;
        archive.mutate({ flockId: flock.id, date }, { onSuccess: onArchived });
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>
          <Trans>Отправить стадо {name} в архив?</Trans>
        </AlertDialogTitle>
        <AlertDialogDescription>
          <Trans>Назначения чабанов в стаде закончатся этой датой.</Trans>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <DateField
        id={`${id}-date`}
        label={<Trans>Последний день работы чабанов</Trans>}
        value={date}
        max={today}
        error={fieldMessage(error, dateCodes)}
        onChange={(value) => {
          setDate(value);
          archive.reset();
        }}
      />
      <FormAlert error={error} fieldCodes={dateCodes} />
      <AlertDialogFooter>
        <AlertDialogCancel>
          <Trans>Отмена</Trans>
        </AlertDialogCancel>
        <Button type="submit" disabled={archive.isPending}>
          {archive.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>В архив</Trans>
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
