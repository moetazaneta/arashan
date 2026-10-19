import {
  dateAt,
  exitStatuses,
  maxStatusReasonLength,
  type SheepCardData,
  useChangeSheepStatus,
  useMarkSheepFound,
  useUndoSheepStatusChange,
} from "@arashan/client";
import type { ExitStatus, Farm, SheepId, StatusChangeRow } from "@arashan/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DealLink } from "@/components/deals/deal-link";
import { formatCalendarDate } from "@/format";
import { formError, useError, useErrorMessage } from "@/errors";

import { statusLabels } from "./labels";

// The changes of the Status of a Sheep: it was Slaughtered, it died or it was Lost, a Lost Sheep came
// back, and the undo of a change made by mistake.

/** What a change of the Status did: how many Sheep got which Status. */
export interface StatusResult {
  changed: number;
  status: ExitStatus;
}

const dateCodes = ["sheep.statusDateInvalid", "sheep.dateInvalid"] as const;

/**
 * A Member changes the Status of Active Sheep to Slaughtered, Dead or Lost, on a date (by default
 * today on the Farm), with an optional reason. The table «Бараны» opens it for the selected Sheep, the
 * card of a Sheep for that Sheep. The Sheep leave their Flocks on that date.
 */
export function ChangeStatusDialog({
  farm,
  sheepIds,
  open,
  onOpenChange,
  onChanged,
}: {
  farm: Farm;
  sheepIds: readonly SheepId[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: (result: StatusResult) => void;
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
                one="Сменить статус # барана"
                few="Сменить статус # баранов"
                many="Сменить статус # баранов"
                other="Сменить статус # барана"
              />
            ) : (
              <Trans>Сменить статус</Trans>
            )}
          </DialogTitle>
          <DialogDescription>
            <Plural
              value={count}
              one="В этот день баран выйдет из стада. Статусы «Забит» и «Пал» окончательные."
              other="В этот день бараны выйдут из стада. Статусы «Забит» и «Пал» окончательные."
            />
          </DialogDescription>
        </DialogHeader>
        <ChangeStatusForm
          farm={farm}
          sheepIds={sheepIds}
          onDone={(result) => {
            onOpenChange(false);
            onChanged?.(result);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChangeStatusForm({
  farm,
  sheepIds,
  onDone,
}: {
  farm: Farm;
  sheepIds: readonly SheepId[];
  onDone: (result: StatusResult) => void;
}) {
  const { t, i18n } = useLingui();
  const change = useChangeSheepStatus(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [status, setStatus] = useState<ExitStatus | null>(null);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const error = useError(change.error);
  const id = useId();
  const dateError =
    error?.code === "sheep.statusDateInvalid" || error?.code === "sheep.dateInvalid"
      ? error.message
      : null;
  const reasonError = error?.code === "sheep.reasonTooLong" ? error.message : null;
  const ownError = formError(error, [...dateCodes, "sheep.reasonTooLong"]);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (status === null || change.isPending) return;
        change.mutate(
          { sheepIds, status, date, reason },
          { onSuccess: ({ changed }) => onDone({ changed, status }) },
        );
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel id={`${id}-status`}>
            <Trans>Новый статус</Trans>
          </FieldLabel>
          <ToggleGroup
            aria-labelledby={`${id}-status`}
            variant="outline"
            spacing={0}
            className="w-full"
            value={status === null ? [] : [status]}
            onValueChange={(value) => {
              const [next] = value;
              setStatus(exitStatuses.find((item) => item === next) ?? null);
              change.reset();
            }}
          >
            {exitStatuses.map((item) => (
              <ToggleGroupItem key={item} value={item} className="flex-1">
                {i18n._(statusLabels[item])}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
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
              change.reset();
            }}
          />
          <FieldError>{dateError}</FieldError>
        </Field>
        <ReasonField
          id={`${id}-reason`}
          value={reason}
          error={reasonError}
          placeholder={t`Например, болезнь или на мясо`}
          onChange={(value) => {
            setReason(value);
            change.reset();
          }}
        />
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
        <Button type="submit" disabled={status === null || change.isPending}>
          {change.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Сменить статус</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A Member records that a Lost Sheep came back on a date: it is Active again, in no Flock. */
export function FoundDialog({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Баран нашёлся</Trans>
      </Button>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Баран нашёлся</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Баран снова станет активным. Потом его можно перевести в стадо.</Trans>
          </DialogDescription>
        </DialogHeader>
        <FoundForm farm={farm} sheep={sheep} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FoundForm({
  farm,
  sheep,
  onDone,
}: {
  farm: Farm;
  sheep: SheepCardData;
  onDone: () => void;
}) {
  const found = useMarkSheepFound(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const error = useError(found.error);
  const id = useId();
  const dateError =
    error?.code === "sheep.statusDateInvalid" || error?.code === "sheep.dateInvalid"
      ? error.message
      : null;
  const reasonError = error?.code === "sheep.reasonTooLong" ? error.message : null;
  const ownError = formError(error, [...dateCodes, "sheep.reasonTooLong"]);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (found.isPending) return;
        found.mutate({ sheepId: sheep.id, date, reason }, { onSuccess: onDone });
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={dateError !== null}>
          <FieldLabel htmlFor={`${id}-date`}>
            <Trans>Когда нашёлся</Trans>
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
              found.reset();
            }}
          />
          <FieldError>{dateError}</FieldError>
        </Field>
        <ReasonField
          id={`${id}-reason`}
          value={reason}
          error={reasonError}
          onChange={(value) => {
            setReason(value);
            found.reset();
          }}
        />
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
        <Button type="submit" disabled={found.isPending}>
          {found.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Сохранить</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

function ReasonField({
  id,
  value,
  error,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  error: string | null;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-invalid={error !== null}>
      <FieldLabel htmlFor={id}>
        <Trans>Причина</Trans>{" "}
        <span className="font-normal text-muted-foreground">
          <Trans>(необязательно)</Trans>
        </span>
      </FieldLabel>
      <Textarea
        id={id}
        rows={2}
        maxLength={maxStatusReasonLength}
        placeholder={placeholder}
        value={value}
        aria-invalid={error !== null}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/**
 * A Member undoes the last change of the Status, made by mistake, after a confirmation. The Sheep
 * gets its Status from before; a Sheep that is Active again goes back to its Flock.
 */
export function UndoStatusChangeDialog({
  farm,
  sheep,
  change,
}: {
  farm: Farm;
  sheep: SheepCardData;
  change: StatusChangeRow;
}) {
  const { i18n } = useLingui();
  const undo = useUndoSheepStatusChange(farm.id);
  const [open, setOpen] = useState(false);
  const error = useErrorMessage(undo.error);
  const back = i18n._(statusLabels[change.from]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) undo.reset();
      }}
    >
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trans context="status change">Отменить</Trans>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Отменить смену статуса?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              Запись удалится, и у барана снова будет статус «{back}». Отменяйте только ошибочную
              запись.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Не отменять</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={undo.isPending}
            onClick={() => undo.mutate(sheep.id, { onSuccess: () => setOpen(false) })}
          >
            {undo.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans context="status change">Отменить</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The changes of the Status of a Sheep, the newest first: «Пал — 10.10.2026, болезнь». The newest one
 * can be undone.
 */
export function StatusChanges({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const { i18n } = useLingui();
  const headingId = useId();
  if (sheep.statusChanges.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        <Trans>Смены статуса</Trans>
      </h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {sheep.statusChanges.map((change, index) => (
          <li key={change.id} className="flex min-h-8 items-center gap-2 tabular-nums">
            <span className="font-medium">
              {change.to === "active" ? <Trans>Нашёлся</Trans> : i18n._(statusLabels[change.to])}
            </span>
            <span className="text-muted-foreground">
              {" — "}
              {formatCalendarDate(change.date, i18n.locale)}
              {change.reason !== null && <>, {change.reason}</>}
            </span>
            {/* A Sale is undone with its own cancel, on the card of the Sale. */}
            {change.saleId !== null ? (
              <DealLink farmId={farm.id} deal={{ kind: "sale", id: change.saleId }} />
            ) : (
              index === 0 && <UndoStatusChangeDialog farm={farm} sheep={sheep} change={change} />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
