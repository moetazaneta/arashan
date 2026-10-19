import {
  useArchiveResource,
  useCreateResource,
  useUnarchiveResource,
  useUpdateResource,
} from "@arashan/client";
import type { ErrorCode, FarmId, ResourceId, ResourceRow } from "@arashan/core";
import { Trans } from "@lingui/react/macro";
import { type RefObject, useId, useRef, useState } from "react";

import { fieldMessage, FormAlert } from "@/components/flocks/shared";
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
import { Spinner } from "@/components/ui/spinner";
import { useError } from "@/errors";

const nameCodes: readonly ErrorCode[] = [
  "resource.nameRequired",
  "resource.nameTooLong",
  "resource.nameTaken",
];
const unitCodes: readonly ErrorCode[] = [
  "resource.unitRequired",
  "resource.unitTooLong",
  "resource.unitLocked",
];
const fieldCodes = [...nameCodes, ...unitCodes];

/** The dialog that adds a Resource, or changes one and sends it to the archive or back. */
export function ResourceDialog({
  farmId,
  resource = null,
  open,
  onOpenChange,
  onCreated,
}: {
  farmId: FarmId;
  resource?: ResourceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a new Resource, for example to open its card. */
  onCreated?: (id: ResourceId) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>
            {resource === null ? <Trans>Добавить ресурс</Trans> : <Trans>Изменить ресурс</Trans>}
          </DialogTitle>
        </DialogHeader>
        <ResourceForm
          farmId={farmId}
          resource={resource}
          nameRef={nameRef}
          onDone={(id) => {
            onOpenChange(false);
            if (resource === null && id !== undefined) onCreated?.(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ResourceForm({
  farmId,
  resource,
  nameRef,
  onDone,
}: {
  farmId: FarmId;
  resource: ResourceRow | null;
  nameRef: RefObject<HTMLInputElement | null>;
  onDone: (id?: ResourceId) => void;
}) {
  const create = useCreateResource(farmId);
  const update = useUpdateResource(farmId);
  const archive = useArchiveResource(farmId);
  const unarchive = useUnarchiveResource(farmId);
  const save = resource === null ? create : update;
  const [name, setName] = useState(resource?.name ?? "");
  const [unit, setUnit] = useState(resource?.unit ?? "");
  const error = useError(save.error ?? archive.error ?? unarchive.error);
  const id = useId();
  const nameError = fieldMessage(error, nameCodes);
  const unitError = fieldMessage(error, unitCodes);
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
        if (resource === null) create.mutate({ name, unit }, { onSuccess: (id) => onDone(id) });
        else update.mutate({ resourceId: resource.id, name, unit }, { onSuccess: () => onDone() });
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
        <Field data-invalid={unitError !== null}>
          <FieldLabel htmlFor={`${id}-unit`}>
            <Trans>Единица измерения</Trans>
          </FieldLabel>
          <Input
            id={`${id}-unit`}
            value={unit}
            autoComplete="off"
            className="w-44"
            aria-invalid={unitError !== null}
            onChange={(event) => {
              setUnit(event.target.value);
              reset();
            }}
          />
          <FieldDescription>
            <Trans>Например: кг, тюк, мешок. После первой записи единицу не изменить.</Trans>
          </FieldDescription>
          <FieldError>{unitError}</FieldError>
        </Field>
        <FormAlert error={error} fieldCodes={fieldCodes} />
      </FieldGroup>
      <DialogFooter>
        {resource !== null && (
          <Button
            type="button"
            variant="outline"
            className="sm:mr-auto"
            disabled={busy}
            onClick={() => {
              reset();
              if (resource.archived) unarchive.mutate(resource.id, { onSuccess: () => onDone() });
              else archive.mutate(resource.id, { onSuccess: () => onDone() });
            }}
          >
            {(archive.isPending || unarchive.isPending) && (
              <Spinner data-icon="inline-start" aria-hidden />
            )}
            {resource.archived ? <Trans>Вернуть из архива</Trans> : <Trans>В архив</Trans>}
          </Button>
        )}
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          {resource === null ? <Trans>Добавить ресурс</Trans> : <Trans>Сохранить</Trans>}
        </Button>
      </DialogFooter>
    </form>
  );
}
