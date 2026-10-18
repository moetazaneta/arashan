import { useCreateFlock, useLocations, useUpdateFlock } from "@arashan/client";
import type { ErrorCode, Farm, FlockId, LocationId, LocationRef } from "@arashan/core";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useError } from "@/errors";

import { fieldMessage, FormAlert } from "./shared";

const nameCodes: readonly ErrorCode[] = [
  "flock.nameRequired",
  "flock.nameTooLong",
  "flock.nameTaken",
];
const locationCodes: readonly ErrorCode[] = ["location.archived", "location.notFound"];

/** The Flock that the dialog changes. With none, the dialog makes a new Flock. */
export interface FlockDraft {
  id: FlockId;
  name: string;
  location: LocationRef | null;
}

/** The dialog that makes a Flock, or changes the name and the Location of one. */
export function FlockDialog({
  farm,
  flock = null,
  open,
  onOpenChange,
}: {
  farm: Farm;
  flock?: FlockDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>
            {flock === null ? <Trans>Создать стадо</Trans> : <Trans>Изменить стадо</Trans>}
          </DialogTitle>
        </DialogHeader>
        <FlockForm farm={farm} flock={flock} nameRef={nameRef} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FlockForm({
  farm,
  flock,
  nameRef,
  onDone,
}: {
  farm: Farm;
  flock: FlockDraft | null;
  nameRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const locations = useLocations(farm.id);
  const create = useCreateFlock(farm.id);
  const update = useUpdateFlock(farm.id);
  const save = flock === null ? create : update;
  const [name, setName] = useState(flock?.name ?? "");
  const [locationId, setLocationId] = useState<LocationId | null>(flock?.location?.id ?? null);
  const error = useError(save.error);
  const id = useId();
  const nameError = fieldMessage(error, nameCodes);
  const locationError = fieldMessage(error, locationCodes);

  // A Flock goes only to a Location that is not Archived. A Flock that stays at an Archived one
  // keeps it as a choice.
  const items: { value: LocationId | null; label: string }[] = [
    { value: null, label: t`Без места` },
    ...(locations.data ?? [])
      .filter((location) => !location.archived || location.id === flock?.location?.id)
      .map((location) => {
        const { name } = location;
        return { value: location.id, label: location.archived ? t`${name} (в архиве)` : name };
      }),
  ];

  function changed() {
    save.reset();
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (save.isPending) return;
        if (flock === null) create.mutate({ name, locationId }, { onSuccess: onDone });
        else update.mutate({ flockId: flock.id, name, locationId }, { onSuccess: onDone });
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
              changed();
            }}
          />
          <FieldError>{nameError}</FieldError>
        </Field>
        <Field data-invalid={locationError !== null}>
          <FieldLabel htmlFor={`${id}-location`}>
            <Trans>Место</Trans>
          </FieldLabel>
          <Select
            items={items}
            value={locationId}
            onValueChange={(value) => {
              setLocationId(value);
              changed();
            }}
          >
            <SelectTrigger
              id={`${id}-location`}
              className="w-full"
              aria-invalid={locationError !== null}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value ?? "none"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError>{locationError}</FieldError>
        </Field>
        <FormAlert error={error} fieldCodes={[...nameCodes, ...locationCodes]} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          {flock === null ? <Trans>Создать стадо</Trans> : <Trans>Сохранить</Trans>}
        </Button>
      </DialogFooter>
    </form>
  );
}
