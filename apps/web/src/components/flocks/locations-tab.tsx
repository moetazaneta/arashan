import {
  useArchiveLocation,
  useCreateLocation,
  useLocations,
  useUnarchiveLocation,
  useUpdateLocation,
} from "@arashan/client";
import type { ErrorCode, Farm, LocationId, LocationRow } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { type RefObject, useId, useRef, useState } from "react";

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
  EmptyList,
  ErrorAlert,
  fieldMessage,
  FormAlert,
  HeadCell,
  ListToolbar,
  NameWithState,
  Names,
  ShortText,
  SkeletonRows,
  tableClass,
  useOpenableRows,
} from "./shared";

const nameCodes: readonly ErrorCode[] = [
  "location.nameRequired",
  "location.nameTooLong",
  "location.nameTaken",
];
const notesCodes: readonly ErrorCode[] = ["location.notesTooLong"];
const fieldCodes = [...nameCodes, ...notesCodes];

/** The tab «Места»: the Locations of the Farm. A row opens the dialog that changes the Location. */
export function LocationsTab({
  farm,
  showArchived,
  onShowArchivedChange,
}: {
  farm: Farm;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
}) {
  const locations = useLocations(farm.id);
  const error = useErrorMessage(locations.error);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<LocationId | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (error !== null) return <ErrorAlert message={error} />;
  const all = locations.data;
  const rows = all?.filter((location) => showArchived || !location.archived);
  const hasArchived = all?.some((location) => location.archived) ?? false;
  const editing = all?.find((location) => location.id === editingId) ?? null;
  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Trans>Добавить место</Trans>
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
        <EmptyList
          title={<Trans>Здесь будут места: пастбища, кошары, загоны.</Trans>}
          action={addButton}
        />
      ) : (
        <LocationsTable
          rows={rows}
          onOpen={(id) => {
            setEditingId(id);
            setEditOpen(true);
          }}
        />
      )}
      <LocationDialog farm={farm} open={creating} onOpenChange={setCreating} />
      {editing !== null && (
        <LocationDialog farm={farm} location={editing} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </div>
  );
}

function LocationsTable({
  rows,
  onOpen,
}: {
  rows: LocationRow[] | undefined;
  onOpen: (id: LocationId) => void;
}) {
  const { t } = useLingui();
  const { bodyProps, rowProps } = useOpenableRows(
    (rows ?? []).map((location) => location.id),
    onOpen,
  );

  return (
    <Table aria-label={t`Места`} className={tableClass}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <HeadCell>
            <Trans>Название</Trans>
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
          <SkeletonRows columns={3} />
        ) : (
          rows.map((location) => (
            <TableRow key={location.id} {...rowProps(location.id)}>
              <DataCell>
                <NameWithState
                  name={location.name}
                  archived={location.archived}
                  className="font-medium"
                />
              </DataCell>
              <DataCell>
                <Names refs={location.flocks} />
              </DataCell>
              <DataCell>
                <ShortText text={location.notes} />
              </DataCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/** The dialog that adds a Location, or changes one and sends it to the archive or back. */
function LocationDialog({
  farm,
  location = null,
  open,
  onOpenChange,
}: {
  farm: Farm;
  location?: LocationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>
            {location === null ? <Trans>Добавить место</Trans> : <Trans>Изменить место</Trans>}
          </DialogTitle>
        </DialogHeader>
        <LocationForm
          farm={farm}
          location={location}
          nameRef={nameRef}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LocationForm({
  farm,
  location,
  nameRef,
  onDone,
}: {
  farm: Farm;
  location: LocationRow | null;
  nameRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const create = useCreateLocation(farm.id);
  const update = useUpdateLocation(farm.id);
  const archive = useArchiveLocation(farm.id);
  const unarchive = useUnarchiveLocation(farm.id);
  const save = location === null ? create : update;
  const [name, setName] = useState(location?.name ?? "");
  const [notes, setNotes] = useState(location?.notes ?? "");
  const error = useError(save.error ?? archive.error ?? unarchive.error);
  const id = useId();
  const nameError = fieldMessage(error, nameCodes);
  const notesError = fieldMessage(error, notesCodes);
  const busy = save.isPending || archive.isPending || unarchive.isPending;

  function reset() {
    save.reset();
    archive.reset();
    unarchive.reset();
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        reset();
        const input = { name, notes: notes || null };
        if (location === null) create.mutate(input, { onSuccess: onDone });
        else update.mutate({ locationId: location.id, ...input }, { onSuccess: onDone });
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={nameError !== null}>
          <FieldLabel htmlFor={`${id}-name`}>
            <Trans>Название</Trans>
          </FieldLabel>
          <Input
            ref={nameRef}
            id={`${id}-name`}
            value={name}
            autoComplete="off"
            aria-invalid={nameError !== null}
            onChange={(event) => {
              setName(event.target.value);
              reset();
            }}
          />
          <FieldError>{nameError}</FieldError>
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
              reset();
            }}
          />
          <FieldError>{notesError}</FieldError>
        </Field>
        <FormAlert error={error} fieldCodes={fieldCodes} />
      </FieldGroup>
      <DialogFooter>
        {location !== null && (
          <Button
            type="button"
            variant="outline"
            className="sm:mr-auto"
            disabled={busy}
            onClick={() => {
              reset();
              if (location.archived) unarchive.mutate(location.id, { onSuccess: onDone });
              else archive.mutate(location.id, { onSuccess: onDone });
            }}
          >
            {(archive.isPending || unarchive.isPending) && (
              <Spinner data-icon="inline-start" aria-hidden />
            )}
            {location.archived ? <Trans>Вернуть из архива</Trans> : <Trans>В архив</Trans>}
          </Button>
        )}
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          {location === null ? <Trans>Добавить место</Trans> : <Trans>Сохранить</Trans>}
        </Button>
      </DialogFooter>
    </form>
  );
}
