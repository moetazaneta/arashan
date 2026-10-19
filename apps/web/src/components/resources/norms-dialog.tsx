import { normGroups, useSetResourceNorms } from "@arashan/client";
import type { FarmId, NormGroup, ResourceCard } from "@arashan/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { type RefObject, useId, useRef, useState } from "react";

import { FormAlert } from "@/components/flocks/shared";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useCodeError, useError } from "@/errors";
import { parseQuantity, quantityText } from "@/format";

export const normLabels = { ram: msg`Самец`, ewe: msg`Самка`, lamb: msg`Ягнёнок` };

/** The daily Norms for one Sheep in each group. An empty field means no Norm. */
export function NormsDialog({
  farmId,
  resource,
  open,
  onOpenChange,
}: {
  farmId: FarmId;
  resource: ResourceCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={firstRef}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Изменить нормы</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Количество на одного барана в день. Пустое поле означает, что нормы нет.</Trans>
          </DialogDescription>
        </DialogHeader>
        <NormsForm
          farmId={farmId}
          resource={resource}
          firstRef={firstRef}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NormsForm({
  farmId,
  resource,
  firstRef,
  onDone,
}: {
  farmId: FarmId;
  resource: ResourceCard;
  firstRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const { i18n } = useLingui();
  const save = useSetResourceNorms(farmId);
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(
        normGroups.map((group) => [
          group,
          resource.norms[group] === 0 ? "" : quantityText(resource.norms[group], i18n.locale),
        ]),
      ) as Record<NormGroup, string>,
  );
  const [checked, setChecked] = useState(false);
  const parsed = Object.fromEntries(
    normGroups.map((group) => [
      group,
      values[group].trim() === "" ? 0 : parseQuantity(values[group], i18n.locale),
    ]),
  ) as Record<NormGroup, number | null>;
  const invalid = normGroups.some((group) => parsed[group] === null);
  const localError = useCodeError(checked && invalid ? "resource.normInvalid" : null);
  const saveError = useError(save.error);
  const error = localError ?? saveError;
  const id = useId();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (save.isPending) return;
        setChecked(true);
        save.reset();
        if (parsed.ram === null || parsed.ewe === null || parsed.lamb === null) return;
        save.mutate(
          {
            resourceId: resource.id,
            norms: { ram: parsed.ram, ewe: parsed.ewe, lamb: parsed.lamb },
          },
          { onSuccess: onDone },
        );
      }}
    >
      <FieldGroup className="gap-4">
        {normGroups.map((group) => (
          <Field key={group} data-invalid={checked && parsed[group] === null}>
            <FieldLabel htmlFor={`${id}-${group}`}>{i18n._(normLabels[group])}</FieldLabel>
            <InputGroup className="w-44">
              <InputGroupInput
                ref={group === "ram" ? firstRef : undefined}
                id={`${id}-${group}`}
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
                value={values[group]}
                aria-invalid={checked && parsed[group] === null}
                onChange={(event) => {
                  setValues({ ...values, [group]: event.target.value });
                  setChecked(false);
                  save.reset();
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{resource.unit}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <FieldError>
              {checked && parsed[group] === null ? localError?.message : null}
            </FieldError>
          </Field>
        ))}
        <FormAlert error={error} fieldCodes={localError ? ["resource.normInvalid"] : []} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Сохранить</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}
