import {
  dateAt,
  useArchiveShepherd,
  useCreateShepherd,
  useShepherds,
  useUnarchiveShepherd,
  useUpdateShepherd,
} from "@arashan/client";
import type { ErrorCode, Farm, ShepherdId, ShepherdRow } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { type RefObject, useId, useRef, useState } from "react";

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
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useError, useErrorMessage } from "@/errors";

import {
  ArchiveToggle,
  DataCell,
  DateField,
  EmptyList,
  ErrorAlert,
  fieldMessage,
  FormAlert,
  HeadCell,
  ListToolbar,
  NameWithState,
  Names,
  NoValue,
  ShortText,
  SkeletonRows,
  tableClass,
  useOpenableRows,
} from "./shared";

const nameCodes: readonly ErrorCode[] = ["shepherd.nameRequired", "shepherd.nameTooLong"];
const phoneCodes: readonly ErrorCode[] = ["shepherd.phoneTooLong"];
const notesCodes: readonly ErrorCode[] = ["shepherd.notesTooLong"];
const fieldCodes = [...nameCodes, ...phoneCodes, ...notesCodes];

/** The tab «Чабаны»: the Shepherds of the Farm. A row opens the dialog that changes the Shepherd. */
export function ShepherdsTab({
  farm,
  showArchived,
  onShowArchivedChange,
}: {
  farm: Farm;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
}) {
  const shepherds = useShepherds(farm.id);
  const error = useErrorMessage(shepherds.error);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<ShepherdId | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (error !== null) return <ErrorAlert message={error} />;
  const all = shepherds.data;
  const rows = all?.filter((shepherd) => showArchived || !shepherd.archived);
  const hasArchived = all?.some((shepherd) => shepherd.archived) ?? false;
  const editing = all?.find((shepherd) => shepherd.id === editingId) ?? null;
  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Trans>Добавить чабана</Trans>
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        start={
          hasArchived && (
            <ArchiveToggle pressed={showArchived} onPressedChange={onShowArchivedChange} />
          )
        }
        end={rows !== undefined && rows.length > 0 && addButton}
      />
      {rows?.length === 0 ? (
        <EmptyList title={<Trans>Здесь будут чабаны фермы.</Trans>} action={addButton} />
      ) : (
        <ShepherdsTable
          rows={rows}
          onOpen={(id) => {
            setEditingId(id);
            setEditOpen(true);
          }}
        />
      )}
      <ShepherdDialog farm={farm} open={creating} onOpenChange={setCreating} />
      {editing !== null && (
        <ShepherdDialog farm={farm} shepherd={editing} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </div>
  );
}

function ShepherdsTable({
  rows,
  onOpen,
}: {
  rows: ShepherdRow[] | undefined;
  onOpen: (id: ShepherdId) => void;
}) {
  const { t } = useLingui();
  const { bodyProps, rowProps } = useOpenableRows(
    (rows ?? []).map((shepherd) => shepherd.id),
    onOpen,
  );

  return (
    <Table aria-label={t`Чабаны`} className={tableClass}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <HeadCell>
            <Trans>Имя</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Телефон</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Стада</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Заметки</Trans>
          </HeadCell>
        </TableRow>
      </TableHeader>
      <TableBody {...bodyProps}>
        {rows === undefined ? (
          <SkeletonRows columns={4} />
        ) : (
          rows.map((shepherd) => (
            <TableRow key={shepherd.id} {...rowProps(shepherd.id)}>
              <DataCell>
                <NameWithState
                  name={shepherd.name}
                  archived={shepherd.archived}
                  className="font-medium"
                />
              </DataCell>
              <DataCell>{shepherd.phone ?? <NoValue />}</DataCell>
              <DataCell>
                <Names refs={shepherd.flocks} />
              </DataCell>
              <DataCell>
                <ShortText text={shepherd.notes} />
              </DataCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/** The dialog that adds a Shepherd, or changes one and sends it to the archive or back. */
function ShepherdDialog({
  farm,
  shepherd = null,
  open,
  onOpenChange,
}: {
  farm: Farm;
  shepherd?: ShepherdRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>
            {shepherd === null ? <Trans>Добавить чабана</Trans> : <Trans>Изменить чабана</Trans>}
          </DialogTitle>
        </DialogHeader>
        <ShepherdForm
          farm={farm}
          shepherd={shepherd}
          nameRef={nameRef}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ShepherdForm({
  farm,
  shepherd,
  nameRef,
  onDone,
}: {
  farm: Farm;
  shepherd: ShepherdRow | null;
  nameRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const create = useCreateShepherd(farm.id);
  const update = useUpdateShepherd(farm.id);
  const unarchive = useUnarchiveShepherd(farm.id);
  const save = shepherd === null ? create : update;
  const [name, setName] = useState(shepherd?.name ?? "");
  const [phone, setPhone] = useState(shepherd?.phone ?? "");
  const [notes, setNotes] = useState(shepherd?.notes ?? "");
  const [archiving, setArchiving] = useState(false);
  const error = useError(save.error ?? unarchive.error);
  const id = useId();
  const nameError = fieldMessage(error, nameCodes);
  const phoneError = fieldMessage(error, phoneCodes);
  const notesError = fieldMessage(error, notesCodes);

  function changed() {
    save.reset();
    unarchive.reset();
  }

  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (save.isPending) return;
          unarchive.reset();
          const input = { name, phone: phone || null, notes: notes || null };
          if (shepherd === null) create.mutate(input, { onSuccess: onDone });
          else update.mutate({ shepherdId: shepherd.id, ...input }, { onSuccess: onDone });
        }}
      >
        <FieldGroup className="gap-4">
          <Field data-invalid={nameError !== null}>
            <FieldLabel htmlFor={`${id}-name`}>
              <Trans>Имя</Trans>
            </FieldLabel>
            <Input
              ref={nameRef}
              id={`${id}-name`}
              value={name}
              autoComplete="off"
              aria-invalid={nameError !== null}
              onChange={(event) => {
                setName(event.target.value);
                changed();
              }}
            />
            <FieldError>{nameError}</FieldError>
          </Field>
          <Field data-invalid={phoneError !== null}>
            <FieldLabel htmlFor={`${id}-phone`}>
              <Trans>Телефон</Trans>
            </FieldLabel>
            <Input
              id={`${id}-phone`}
              type="tel"
              value={phone}
              autoComplete="off"
              className="tabular-nums"
              aria-invalid={phoneError !== null}
              onChange={(event) => {
                setPhone(event.target.value);
                changed();
              }}
            />
            <FieldError>{phoneError}</FieldError>
          </Field>
          <Field data-invalid={notesError !== null}>
            <FieldLabel htmlFor={`${id}-notes`}>
              <Trans>Заметки</Trans>
            </FieldLabel>
            <Textarea
              id={`${id}-notes`}
              value={notes}
              aria-invalid={notesError !== null}
              onChange={(event) => {
                setNotes(event.target.value);
                changed();
              }}
            />
            <FieldError>{notesError}</FieldError>
          </Field>
          <FormAlert error={error} fieldCodes={fieldCodes} />
        </FieldGroup>
        <DialogFooter>
          {shepherd !== null &&
            (shepherd.archived ? (
              <Button
                type="button"
                variant="outline"
                className="sm:mr-auto"
                disabled={unarchive.isPending}
                onClick={() => {
                  save.reset();
                  unarchive.mutate(shepherd.id, { onSuccess: onDone });
                }}
              >
                {unarchive.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                <Trans>Вернуть из архива</Trans>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="sm:mr-auto"
                onClick={() => {
                  changed();
                  setArchiving(true);
                }}
              >
                <Trans>В архив</Trans>
              </Button>
            ))}
          <DialogClose render={<Button variant="outline" />}>
            <Trans>Отмена</Trans>
          </DialogClose>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {shepherd === null ? <Trans>Добавить чабана</Trans> : <Trans>Сохранить</Trans>}
          </Button>
        </DialogFooter>
      </form>
      {/* Outside the form: the submit of its own form must not reach this one. */}
      {shepherd !== null && !shepherd.archived && (
        <ArchiveShepherdDialog
          farm={farm}
          shepherd={shepherd}
          open={archiving}
          onOpenChange={setArchiving}
          onArchived={onDone}
        />
      )}
    </>
  );
}

/**
 * A Member sends a Shepherd to the archive, for example one who left. The open assignments of the
 * Shepherd end on the last day of work: by default today on the Farm.
 */
function ArchiveShepherdDialog({
  farm,
  shepherd,
  open,
  onOpenChange,
  onArchived,
}: {
  farm: Farm;
  shepherd: ShepherdRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <ArchiveShepherdForm
          farm={farm}
          shepherd={shepherd}
          onArchived={() => {
            onOpenChange(false);
            onArchived();
          }}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ArchiveShepherdForm({
  farm,
  shepherd,
  onArchived,
}: {
  farm: Farm;
  shepherd: ShepherdRow;
  onArchived: () => void;
}) {
  const archive = useArchiveShepherd(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [date, setDate] = useState(today);
  const error = useError(archive.error);
  const id = useId();
  const dateCodes: readonly ErrorCode[] = ["flock.endDateInvalid"];
  const { name } = shepherd;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (archive.isPending) return;
        archive.mutate({ shepherdId: shepherd.id, date }, { onSuccess: onArchived });
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>
          <Trans>Отправить чабана {name} в архив?</Trans>
        </AlertDialogTitle>
        <AlertDialogDescription>
          <Trans>Назначения чабана в стадах закончатся этой датой.</Trans>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <DateField
        id={`${id}-date`}
        label={<Trans>Последний день работы</Trans>}
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
