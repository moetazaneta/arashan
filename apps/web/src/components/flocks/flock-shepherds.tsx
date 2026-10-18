import {
  dateAt,
  useAssignShepherd,
  useRemoveShepherdAssignment,
  useShepherds,
  useUpdateShepherdAssignment,
} from "@arashan/client";
import type { AssignmentRow, ErrorCode, Farm, FlockCard, ShepherdId } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";

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
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { type ErrorInfo, useError, useErrorMessage } from "@/errors";
import { formatCalendarDate } from "@/format";

import {
  DataCell,
  DateField,
  EmptyList,
  ErrorAlert,
  fieldMessage,
  FormAlert,
  HeadCell,
  NameWithState,
  tableClass,
} from "./shared";

const datesCodes: readonly ErrorCode[] = ["flock.assignmentDatesInvalid"];
const shepherdCodes: readonly ErrorCode[] = ["shepherd.archived", "shepherd.notFound"];

/** The section «Чабаны» of a Flock card: who herded the Flock and when, the newest first. */
export function FlockShepherds({ farm, flock }: { farm: Farm; flock: FlockCard }) {
  const { t } = useLingui();
  const [assigning, setAssigning] = useState(false);
  const headingId = useId();
  // An Archived Flock gets no new Shepherd.
  const assignButton = flock.archived ? undefined : (
    <Button variant="outline" onClick={() => setAssigning(true)}>
      <Trans>Назначить чабана</Trans>
    </Button>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center gap-3">
        <h2 id={headingId} className="text-base font-semibold">
          <Trans>Чабаны</Trans>
        </h2>
        {flock.assignments.length > 0 && <div className="ml-auto">{assignButton}</div>}
      </div>
      {flock.assignments.length === 0 ? (
        <EmptyList title={<Trans>Чабан не назначен.</Trans>} action={assignButton} />
      ) : (
        <Table aria-label={t`Назначения чабанов`} className={tableClass}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <HeadCell>
                <Trans>Чабан</Trans>
              </HeadCell>
              <HeadCell>
                <Trans context="from date">С</Trans>
              </HeadCell>
              <HeadCell>
                <Trans context="to date">По</Trans>
              </HeadCell>
              <HeadCell>
                <span className="sr-only">
                  <Trans>Действия</Trans>
                </span>
              </HeadCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flock.assignments.map((assignment) => (
              <AssignmentTableRow key={assignment.id} farm={farm} assignment={assignment} />
            ))}
          </TableBody>
        </Table>
      )}
      {!flock.archived && (
        <AssignShepherdDialog
          farm={farm}
          flock={flock}
          open={assigning}
          onOpenChange={setAssigning}
        />
      )}
    </section>
  );
}

function AssignmentTableRow({ farm, assignment }: { farm: Farm; assignment: AssignmentRow }) {
  const { i18n } = useLingui();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <TableRow className="group/row h-9">
      <DataCell>
        <NameWithState
          name={assignment.shepherd.name}
          archived={assignment.shepherd.archived}
          className="font-medium"
        />
      </DataCell>
      <DataCell>{formatCalendarDate(assignment.from, i18n.locale)}</DataCell>
      <DataCell>
        {assignment.to === null ? (
          <span className="text-muted-foreground">
            <Trans>сейчас</Trans>
          </span>
        ) : (
          formatCalendarDate(assignment.to, i18n.locale)
        )}
      </DataCell>
      <DataCell className="w-0">
        {/* The actions of a row appear on hover and on the keyboard focus. */}
        <div className="flex justify-end gap-1 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Trans>Изменить даты</Trans>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setRemoving(true)}
          >
            <Trans context="assignment">Удалить</Trans>
          </Button>
        </div>
        <EditAssignmentDialog
          farm={farm}
          assignment={assignment}
          open={editing}
          onOpenChange={setEditing}
        />
        <RemoveAssignmentDialog
          farm={farm}
          assignment={assignment}
          open={removing}
          onOpenChange={setRemoving}
        />
      </DataCell>
    </TableRow>
  );
}

/** The fields «С» and «По» of an assignment. An empty «По» means that the Shepherd herds it now. */
function AssignmentDatesFields({
  today,
  from,
  to,
  error,
  onFromChange,
  onToChange,
}: {
  today: string;
  from: string;
  to: string;
  error: ErrorInfo | null;
  onFromChange: (from: string) => void;
  onToChange: (to: string) => void;
}) {
  const id = useId();
  const datesError = fieldMessage(error, datesCodes);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4">
        <DateField
          id={`${id}-from`}
          label={<Trans context="from date">С</Trans>}
          value={from}
          max={today}
          error={datesError !== null}
          onChange={onFromChange}
        />
        <DateField
          id={`${id}-to`}
          label={<Trans context="to date">По</Trans>}
          value={to}
          max={today}
          error={datesError !== null}
          description={<Trans>Пусто, если работает сейчас.</Trans>}
          onChange={onToChange}
        />
      </div>
      {datesError !== null && (
        <p role="alert" className="text-sm text-destructive">
          {datesError}
        </p>
      )}
    </div>
  );
}

/** A Member assigns a Shepherd to the Flock: from a date, by default today, to a date or to now. */
function AssignShepherdDialog({
  farm,
  flock,
  open,
  onOpenChange,
}: {
  farm: Farm;
  flock: FlockCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Назначить чабана</Trans>
          </DialogTitle>
        </DialogHeader>
        <AssignShepherdForm farm={farm} flock={flock} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AssignShepherdForm({
  farm,
  flock,
  onDone,
}: {
  farm: Farm;
  flock: FlockCard;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const shepherds = useShepherds(farm.id);
  const listError = useErrorMessage(shepherds.error);
  const assign = useAssignShepherd(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [shepherdId, setShepherdId] = useState<ShepherdId | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState("");
  const error = useError(assign.error);
  const id = useId();
  const shepherdError = fieldMessage(error, shepherdCodes);
  const items = (shepherds.data ?? [])
    .filter((shepherd) => !shepherd.archived)
    .map((shepherd) => ({ value: shepherd.id, label: shepherd.name }));

  if (listError !== null) return <ErrorAlert message={listError} />;
  if (shepherds.data !== undefined && items.length === 0) {
    return (
      <>
        <p className="text-muted-foreground">
          <Trans>У фермы ещё нет чабанов. Сначала добавьте чабана.</Trans>
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            <Trans>Отмена</Trans>
          </DialogClose>
          <Link
            to="/farms/$farmId/flocks"
            params={{ farmId: farm.id }}
            search={{ tab: "shepherds" }}
            className={buttonVariants()}
          >
            <Trans>Открыть вкладку «Чабаны»</Trans>
          </Link>
        </DialogFooter>
      </>
    );
  }

  function changed() {
    assign.reset();
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (shepherdId === null || assign.isPending) return;
        assign.mutate(
          { flockId: flock.id, shepherdId, from, to: to === "" ? null : to },
          { onSuccess: onDone },
        );
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={shepherdError !== null}>
          <FieldLabel htmlFor={`${id}-shepherd`}>
            <Trans>Чабан</Trans>
          </FieldLabel>
          <Select
            items={items}
            value={shepherdId}
            onValueChange={(value) => {
              setShepherdId(value);
              changed();
            }}
          >
            <SelectTrigger
              id={`${id}-shepherd`}
              className="w-full"
              aria-invalid={shepherdError !== null}
            >
              <SelectValue placeholder={t`Выберите чабана`} />
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
          <FieldError>{shepherdError}</FieldError>
        </Field>
        <AssignmentDatesFields
          today={today}
          from={from}
          to={to}
          error={error}
          onFromChange={(value) => {
            setFrom(value);
            changed();
          }}
          onToChange={(value) => {
            setTo(value);
            changed();
          }}
        />
        <FormAlert error={error} fieldCodes={[...shepherdCodes, ...datesCodes]} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={shepherdId === null || assign.isPending}>
          {assign.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Назначить чабана</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A Member changes the dates of an assignment, for example to end it. */
function EditAssignmentDialog({
  farm,
  assignment,
  open,
  onOpenChange,
}: {
  farm: Farm;
  assignment: AssignmentRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { name } = assignment.shepherd;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Изменить даты</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Когда чабан {name} работал в этом стаде.</Trans>
          </DialogDescription>
        </DialogHeader>
        <EditAssignmentForm
          farm={farm}
          assignment={assignment}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditAssignmentForm({
  farm,
  assignment,
  onDone,
}: {
  farm: Farm;
  assignment: AssignmentRow;
  onDone: () => void;
}) {
  const update = useUpdateShepherdAssignment(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [from, setFrom] = useState<string>(assignment.from);
  const [to, setTo] = useState<string>(assignment.to ?? "");
  const error = useError(update.error);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (update.isPending) return;
        update.mutate(
          { assignmentId: assignment.id, from, to: to === "" ? null : to },
          { onSuccess: onDone },
        );
      }}
    >
      <FieldGroup className="gap-4">
        <AssignmentDatesFields
          today={today}
          from={from}
          to={to}
          error={error}
          onFromChange={(value) => {
            setFrom(value);
            update.reset();
          }}
          onToChange={(value) => {
            setTo(value);
            update.reset();
          }}
        />
        <FormAlert error={error} fieldCodes={datesCodes} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Сохранить</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A Member removes an assignment recorded by mistake, after a confirmation. */
function RemoveAssignmentDialog({
  farm,
  assignment,
  open,
  onOpenChange,
}: {
  farm: Farm;
  assignment: AssignmentRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useRemoveShepherdAssignment(farm.id);
  const error = useErrorMessage(remove.error);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Удалить назначение?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Сделайте это, только если его записали по ошибке.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Отмена</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(assignment.id, { onSuccess: () => onOpenChange(false) })}
          >
            {remove.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans context="assignment">Удалить</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
