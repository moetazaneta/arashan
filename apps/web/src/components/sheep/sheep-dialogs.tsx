import {
  dateAt,
  type SheepCardData,
  useChangeSheepOwner,
  useDeleteSheep,
  useSheepOwners,
} from "@arashan/client";
import type { Farm, MembershipId } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formError, useError, useErrorMessage } from "@/errors";

/** A Member gives the Sheep to another Owner, from a date: by default today on the Farm. */
export function ChangeOwnerDialog({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Сменить владельца</Trans>
      </Button>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Сменить владельца</Trans>
          </DialogTitle>
        </DialogHeader>
        <ChangeOwnerForm farm={farm} sheep={sheep} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ChangeOwnerForm({
  farm,
  sheep,
  onDone,
}: {
  farm: Farm;
  sheep: SheepCardData;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const owners = useSheepOwners(farm.id);
  const changeOwner = useChangeSheepOwner(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [ownerId, setOwnerId] = useState<MembershipId | null>(null);
  const [date, setDate] = useState(today);
  const error = useError(changeOwner.error);
  const id = useId();
  const ownerError =
    error?.code === "sheep.sameOwner" || error?.code === "sheep.ownerNotMember"
      ? error.message
      : null;
  const dateError =
    error?.code === "sheep.ownerChangeDateInvalid" || error?.code === "sheep.dateInvalid"
      ? error.message
      : null;
  const ownError = formError(error, [
    "sheep.sameOwner",
    "sheep.ownerNotMember",
    "sheep.ownerChangeDateInvalid",
    "sheep.dateInvalid",
  ]);
  const items = (owners.data ?? [])
    .filter((owner) => owner.id !== sheep.owner?.id)
    .map((owner) => ({ value: owner.id, label: owner.name }));

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ownerId === null || changeOwner.isPending) return;
        changeOwner.mutate({ sheepId: sheep.id, ownerId, date }, { onSuccess: onDone });
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={ownerError !== null}>
          <FieldLabel htmlFor={`${id}-owner`}>
            <Trans>Новый владелец</Trans>
          </FieldLabel>
          <Select
            items={items}
            value={ownerId}
            onValueChange={(value) => {
              setOwnerId(value);
              changeOwner.reset();
            }}
          >
            <SelectTrigger id={`${id}-owner`} className="w-full" aria-invalid={ownerError !== null}>
              <SelectValue placeholder={t`Выберите участника`} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError>{ownerError}</FieldError>
        </Field>
        <Field data-invalid={dateError !== null}>
          <FieldLabel htmlFor={`${id}-date`}>
            <Trans>С какого дня</Trans>
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
              changeOwner.reset();
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
        <Button type="submit" disabled={ownerId === null || changeOwner.isPending}>
          {changeOwner.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Сменить владельца</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A Member deletes a Sheep registered by mistake, after a confirmation. The Sheep becomes Deleted: the
 * app hides it but keeps it (ADR 0005).
 */
export function DeleteSheepDialog({
  farm,
  sheep,
  onDeleted,
}: {
  farm: Farm;
  sheep: SheepCardData;
  onDeleted: () => void;
}) {
  const remove = useDeleteSheep(farm.id);
  const [open, setOpen] = useState(false);
  const error = useErrorMessage(remove.error);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        <Trans context="sheep">Удалить</Trans>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Удалить барана?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Баран пропадёт из списков. Его можно будет восстановить.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Отмена</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(sheep.id, { onSuccess: onDeleted })}
          >
            {remove.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans context="sheep">Удалить</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
