import {
  isCalendarDate,
  useToday,
  useUsageSuggestion,
  useFlocks,
  useRecordAdjustment,
  useRecordRestock,
  useRecordUsage,
} from "@arashan/client";
import type { ErrorCode, Farm, FlockId, ResourceCard, ResourceEventKind } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { type RefObject, useId, useRef, useState } from "react";

import { DateField, fieldMessage, FormAlert } from "@/components/flocks/shared";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
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
import { useCodeError, useError } from "@/errors";
import { currencySymbol, formatQuantity, parseAmount, parseQuantity, quantityText } from "@/format";

import { Stock } from "./stock";

const dateCodes: readonly ErrorCode[] = ["resource.dateInvalid", "resource.dateInFuture"];
const quantityCodes: readonly ErrorCode[] = [
  "resource.quantityInvalid",
  "resource.adjustmentNoChange",
];
const priceCodes: readonly ErrorCode[] = ["money.amountInvalid"];
const flockCodes: readonly ErrorCode[] = ["flock.notFound", "flock.archived"];
const reasonCodes: readonly ErrorCode[] = ["resource.reasonRequired", "resource.reasonTooLong"];
const fieldCodes = [...dateCodes, ...quantityCodes, ...priceCodes, ...flockCodes, ...reasonCodes];

/**
 * The dialog that records an event of a Resource: a Restock (with an optional price), a Usage by a
 * Flock, or an Adjustment after a count.
 */
export function EventDialog({
  farm,
  resource,
  kind,
  open,
  onOpenChange,
}: {
  farm: Farm;
  resource: ResourceCard;
  kind: ResourceEventKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const quantityRef = useRef<HTMLInputElement>(null);
  const { name } = resource;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The date is today by default, so the quantity gets the focus. */}
      <DialogContent showCloseButton={false} initialFocus={quantityRef}>
        <DialogHeader>
          <DialogTitle>
            {kind === "restock" ? (
              <Trans>Пополнение: {name}</Trans>
            ) : kind === "usage" ? (
              <Trans>Выдача: {name}</Trans>
            ) : (
              <Trans>Корректировка: {name}</Trans>
            )}
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Запас сейчас: <Stock quantity={resource.stock} unit={resource.unit} />
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <EventForm
          farm={farm}
          resource={resource}
          kind={kind}
          quantityRef={quantityRef}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  farm,
  resource,
  kind,
  quantityRef,
  onDone,
}: {
  farm: Farm;
  resource: ResourceCard;
  kind: ResourceEventKind;
  quantityRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const { i18n, t } = useLingui();
  const flocks = useFlocks(farm.id);
  const restock = useRecordRestock(farm.id);
  const usage = useRecordUsage(farm.id);
  const adjustment = useRecordAdjustment(farm.id);
  const save = kind === "restock" ? restock : kind === "usage" ? usage : adjustment;
  const today = useToday(farm.timeZone)!;
  const [date, setDate] = useState(today);
  const [typedQuantity, setTypedQuantity] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [flockId, setFlockId] = useState<FlockId | null>(null);
  const [reason, setReason] = useState("");
  // The rules that the form checks before it sends the event: they show after a try to save.
  const [checked, setChecked] = useState(false);
  const suggestion = useUsageSuggestion(
    farm.id,
    kind === "usage" && flockId !== null && isCalendarDate(date)
      ? { resourceId: resource.id, flockId, date }
      : null,
  );
  const suggested = suggestion.data;
  const quantity =
    typedQuantity ??
    (suggested && suggested.quantity > 0 ? quantityText(suggested.quantity, i18n.locale) : "");
  const quantityValue = parseQuantity(quantity, i18n.locale);
  const priceValue = price.trim() === "" ? null : parseAmount(price);
  const priceInvalid = price.trim() !== "" && priceValue === null;
  const localError = useCodeError(
    !checked
      ? null
      : quantityValue === null || (kind !== "adjustment" && quantityValue === 0)
        ? "resource.quantityInvalid"
        : priceInvalid
          ? "money.amountInvalid"
          : null,
  );
  const suggestionError = useError(suggestion.error);
  const saveError = useError(save.error);
  const error = localError ?? saveError;
  const flockMissing = checked && kind === "usage" && flockId === null;
  const id = useId();
  const flockItems = (flocks.data ?? [])
    .filter((flock) => !flock.archived)
    .map((flock) => ({ value: flock.id, label: flock.name }));
  const quantityError = fieldMessage(error, quantityCodes);
  const priceError = fieldMessage(error, priceCodes);
  const flockError = fieldMessage(error, flockCodes);
  const reasonError = fieldMessage(error, reasonCodes);

  function changed() {
    save.reset();
    setChecked(false);
  }

  function submit() {
    if (save.isPending) return;
    setChecked(true);
    save.reset();
    if (quantityValue === null) return;
    const base = { resourceId: resource.id, date };
    if (kind === "restock") {
      if (quantityValue === 0 || priceInvalid) return;
      restock.mutate(
        { ...base, quantity: quantityValue, price: priceValue },
        { onSuccess: onDone },
      );
    } else if (kind === "usage") {
      if (quantityValue === 0 || flockId === null) return;
      usage.mutate({ ...base, quantity: quantityValue, flockId }, { onSuccess: onDone });
    } else {
      adjustment.mutate({ ...base, counted: quantityValue, reason }, { onSuccess: onDone });
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FieldGroup className="gap-4">
        <DateField
          id={`${id}-date`}
          label={<Trans>Дата</Trans>}
          value={date}
          max={today}
          error={fieldMessage(error, dateCodes)}
          onChange={(value) => {
            setDate(value);
            changed();
          }}
        />
        <Field data-invalid={quantityError !== null}>
          <FieldLabel htmlFor={`${id}-quantity`}>
            {kind === "adjustment" ? (
              <Trans>Остаток по пересчёту</Trans>
            ) : (
              <Trans>Количество</Trans>
            )}
          </FieldLabel>
          <InputGroup className="w-44">
            <InputGroupInput
              ref={quantityRef}
              id={`${id}-quantity`}
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums"
              value={quantity}
              aria-invalid={quantityError !== null}
              onChange={(event) => {
                setTypedQuantity(event.target.value);
                changed();
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{resource.unit}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {kind === "adjustment" && (
            <FieldDescription>
              <Trans>
                Сколько ресурса на самом деле было в этот день. Разницу запишет приложение.
              </Trans>
            </FieldDescription>
          )}
          {kind === "usage" && suggested && (
            <FieldDescription>
              {suggested.quantity > 0 ? (
                <>
                  <Trans>
                    Предложено: {formatQuantity(suggested.quantity, i18n.locale)} {resource.unit}. В
                    день: {formatQuantity(suggested.perDay, i18n.locale)} {resource.unit}, дней:{" "}
                    {suggested.days}.
                  </Trans>
                  {typedQuantity !== null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTypedQuantity(quantityText(suggested.quantity, i18n.locale));
                        changed();
                      }}
                    >
                      <Trans>Подставить</Trans>
                    </Button>
                  )}
                </>
              ) : suggested.days === 0 ? (
                <Trans>В этот день стаду уже выдавали ресурс.</Trans>
              ) : suggested.norms.ram === 0 &&
                suggested.norms.ewe === 0 &&
                suggested.norms.lamb === 0 ? (
                <Trans>Задайте нормы, чтобы рассчитать выдачу.</Trans>
              ) : (
                <Trans>Для этого стада нет расхода по нормам.</Trans>
              )}
            </FieldDescription>
          )}
          {kind === "usage" && suggestion.error !== null && (
            <FormAlert error={suggestionError} fieldCodes={[]} />
          )}
          <FieldError>{quantityError}</FieldError>
        </Field>
        {kind === "restock" && (
          <Field data-invalid={priceError !== null}>
            <FieldLabel htmlFor={`${id}-price`}>
              <Trans>Цена</Trans>
            </FieldLabel>
            <InputGroup className="w-44">
              <InputGroupInput
                id={`${id}-price`}
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
                value={price}
                aria-invalid={priceError !== null}
                onChange={(event) => {
                  setPrice(event.target.value);
                  changed();
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{currencySymbol(farm.currency, i18n.locale)}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              <Trans>
                Общая сумма. С ценой приложение запишет расход «Пополнение ресурса». Свой урожай —
                без цены.
              </Trans>
            </FieldDescription>
            <FieldError>{priceError}</FieldError>
          </Field>
        )}
        {kind === "usage" && (
          <Field data-invalid={flockMissing || flockError !== null}>
            <FieldLabel htmlFor={`${id}-flock`}>
              <Trans>Стадо</Trans>
            </FieldLabel>
            <Select
              items={flockItems}
              value={flockId}
              onValueChange={(value) => {
                setFlockId(value);
                changed();
              }}
            >
              <SelectTrigger
                id={`${id}-flock`}
                className="w-full"
                aria-invalid={flockMissing || flockError !== null}
              >
                <SelectValue placeholder={t`Выберите стадо`} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {flockItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError>{flockMissing ? <Trans>Выберите стадо.</Trans> : flockError}</FieldError>
          </Field>
        )}
        {kind === "adjustment" && (
          <Field data-invalid={reasonError !== null}>
            <FieldLabel htmlFor={`${id}-reason`}>
              <Trans>Причина</Trans>
            </FieldLabel>
            <Input
              id={`${id}-reason`}
              value={reason}
              autoComplete="off"
              placeholder={t`Например: сено сгнило`}
              aria-invalid={reasonError !== null}
              onChange={(event) => {
                setReason(event.target.value);
                changed();
              }}
            />
            <FieldError>{reasonError}</FieldError>
          </Field>
        )}
        <FormAlert error={error} fieldCodes={fieldCodes} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Записать</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}
