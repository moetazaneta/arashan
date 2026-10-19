import {
  dateAt,
  useCreateMoneyRecord,
  useFlocks,
  useMoneyCategories,
  useShepherds,
  useUpdateMoneyRecord,
} from "@arashan/client";
import type {
  ErrorCode,
  Farm,
  FlockId,
  MoneyCategoryId,
  MoneyKind,
  MoneyRecordRow,
  MoneyScope,
  MoneyScopeRef,
  SheepId,
  ShepherdId,
} from "@arashan/core";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCodeError, useError } from "@/errors";
import { amountText, currencySymbol, parseAmount } from "@/format";

import { categoryName } from "./category-names";
import { kindLabels } from "./labels";
import { SheepCombobox } from "./sheep-combobox";

const dateCodes: readonly ErrorCode[] = ["money.dateInvalid", "money.dateInFuture"];
const amountCodes: readonly ErrorCode[] = ["money.amountInvalid"];
const categoryCodes: readonly ErrorCode[] = [
  "moneyCategory.notFound",
  "moneyCategory.system",
  "moneyCategory.archived",
];
const shepherdCodes: readonly ErrorCode[] = [
  "money.shepherdRequired",
  "money.shepherdNotAllowed",
  "shepherd.notFound",
  "shepherd.archived",
];
const scopeCodes: readonly ErrorCode[] = ["flock.notFound", "flock.archived", "sheep.notFound"];
const notesCodes: readonly ErrorCode[] = ["money.notesTooLong"];
const fieldCodes = [
  ...dateCodes,
  ...amountCodes,
  ...categoryCodes,
  ...shepherdCodes,
  ...scopeCodes,
  ...notesCodes,
];

type ScopeKind = MoneyScope["kind"];

function isScopeKind(value: unknown): value is ScopeKind {
  return value === "farm" || value === "flock" || value === "sheep";
}

/** The scope of a record of the table, as a command takes it. */
function scopeOf(ref: MoneyScopeRef): MoneyScope {
  switch (ref.kind) {
    case "farm":
      return { kind: "farm" };
    case "flock":
      return { kind: "flock", flockId: ref.flock.id };
    case "sheep":
      return { kind: "sheep", sheepId: ref.sheep.id };
  }
}

/** The dialog that records an Expense or an Income, or changes one of the table. */
export function RecordDialog({
  farm,
  kind,
  record = null,
  open,
  onOpenChange,
}: {
  farm: Farm;
  kind: MoneyKind;
  record?: MoneyRecordRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n } = useLingui();
  const amountRef = useRef<HTMLInputElement>(null);
  const labels = kindLabels[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The date is today by default, so the amount gets the focus. */}
      <DialogContent showCloseButton={false} initialFocus={amountRef}>
        <DialogHeader>
          <DialogTitle>{i18n._(record === null ? labels.add : labels.edit)}</DialogTitle>
          {record !== null && record.source !== null && (
            <DialogDescription>
              <Trans>
                Эту запись сделало приложение: в ней можно изменить только сумму и примечание.
              </Trans>
            </DialogDescription>
          )}
        </DialogHeader>
        <RecordForm
          farm={farm}
          kind={kind}
          record={record}
          amountRef={amountRef}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({
  farm,
  kind,
  record,
  amountRef,
  onDone,
}: {
  farm: Farm;
  kind: MoneyKind;
  record: MoneyRecordRow | null;
  amountRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const { i18n, t } = useLingui();
  const categories = useMoneyCategories(farm.id, kind);
  const shepherds = useShepherds(farm.id);
  const flocks = useFlocks(farm.id);
  const create = useCreateMoneyRecord(farm.id);
  const update = useUpdateMoneyRecord(farm.id);
  const save = record === null ? create : update;
  const today = dateAt(Date.now(), farm.timeZone);
  const recordScope = record === null ? null : scopeOf(record.scope);
  const [date, setDate] = useState(record?.date ?? today);
  const [amount, setAmount] = useState(
    record === null ? "" : amountText(record.amount, i18n.locale),
  );
  const [categoryId, setCategoryId] = useState<MoneyCategoryId | null>(record?.category.id ?? null);
  const [shepherdId, setShepherdId] = useState<ShepherdId | null>(record?.shepherd?.id ?? null);
  const [scopeKind, setScopeKind] = useState<ScopeKind>(recordScope?.kind ?? "farm");
  const [flockId, setFlockId] = useState<FlockId | null>(
    recordScope?.kind === "flock" ? recordScope.flockId : null,
  );
  const [sheepId, setSheepId] = useState<SheepId | null>(
    recordScope?.kind === "sheep" ? recordScope.sheepId : null,
  );
  const [notes, setNotes] = useState(record?.notes ?? "");
  // The rules that the form checks before it sends the record: they show after a try to save.
  const [checked, setChecked] = useState(false);
  const amountValue = parseAmount(amount);
  const amountError = useCodeError(checked && amountValue === null ? "money.amountInvalid" : null);
  const saveError = useError(save.error);
  const error = amountError ?? saveError;
  const id = useId();
  // Of an Automatic record, its event owns all but the amount and the notes.
  const automatic = record !== null && record.source !== null;

  // A form offers only the categories, Shepherds and Flocks that are not Archived. A record keeps
  // its own, also when it is Archived now; an Automatic record keeps its System category.
  const categoryItems = (categories.data ?? [])
    .filter(
      (category) => category.id === record?.category.id || (!category.system && !category.archived),
    )
    .map((category) => {
      const name = categoryName(category, i18n);
      return { value: category.id, label: category.archived ? t`${name} (в архиве)` : name };
    });
  const category = categories.data?.find((one) => one.id === categoryId);
  const paysShepherd = kind === "expense" && category?.key === "shepherdPay";
  const shepherdItems = (shepherds.data ?? [])
    .filter((shepherd) => !shepherd.archived || shepherd.id === record?.shepherd?.id)
    .map((shepherd) => {
      const { name } = shepherd;
      return { value: shepherd.id, label: shepherd.archived ? t`${name} (в архиве)` : name };
    });
  const ownFlockId = recordScope?.kind === "flock" ? recordScope.flockId : null;
  const flockItems = (flocks.data ?? [])
    .filter((flock) => !flock.archived || flock.id === ownFlockId)
    .map((flock) => {
      const { name } = flock;
      return { value: flock.id, label: flock.archived ? t`${name} (в архиве)` : name };
    });

  const categoryMissing = checked && categoryId === null;
  const flockMissing = checked && scopeKind === "flock" && flockId === null;
  const sheepMissing = checked && scopeKind === "sheep" && sheepId === null;
  const dateError = fieldMessage(error, dateCodes);
  const amountMessage = fieldMessage(error, amountCodes);
  const categoryError = fieldMessage(error, categoryCodes);
  const shepherdError = fieldMessage(error, shepherdCodes);
  const scopeError = fieldMessage(error, scopeCodes);
  const notesError = fieldMessage(error, notesCodes);
  const symbol = currencySymbol(farm.currency, i18n.locale);

  function changed() {
    save.reset();
    setChecked(false);
  }

  function submit() {
    if (save.isPending) return;
    setChecked(true);
    save.reset();
    if (amountValue === null || categoryId === null) return;
    let scope: MoneyScope;
    if (scopeKind === "flock") {
      if (flockId === null) return;
      scope = { kind: "flock", flockId };
    } else if (scopeKind === "sheep") {
      if (sheepId === null) return;
      scope = { kind: "sheep", sheepId };
    } else {
      scope = { kind: "farm" };
    }
    const input = {
      date,
      amount: amountValue,
      categoryId,
      scope,
      shepherdId: paysShepherd ? shepherdId : null,
      notes: notes || null,
    };
    if (record === null) create.mutate({ kind, ...input }, { onSuccess: onDone });
    else update.mutate({ recordId: record.id, ...input }, { onSuccess: onDone });
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
          disabled={automatic}
          error={dateError}
          onChange={(value) => {
            setDate(value);
            changed();
          }}
        />
        <Field data-invalid={amountMessage !== null}>
          <FieldLabel htmlFor={`${id}-amount`}>
            <Trans>Сумма</Trans>
          </FieldLabel>
          <InputGroup className="w-44">
            <InputGroupInput
              ref={amountRef}
              id={`${id}-amount`}
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums"
              value={amount}
              aria-invalid={amountMessage !== null}
              onChange={(event) => {
                setAmount(event.target.value);
                changed();
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{symbol}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldError>{amountMessage}</FieldError>
        </Field>
        <Field data-invalid={categoryMissing || categoryError !== null}>
          <FieldLabel htmlFor={`${id}-category`}>
            <Trans>Категория</Trans>
          </FieldLabel>
          <Select
            items={categoryItems}
            value={categoryId}
            disabled={automatic}
            onValueChange={(value) => {
              setCategoryId(value);
              changed();
            }}
          >
            <SelectTrigger
              id={`${id}-category`}
              className="w-full"
              aria-invalid={categoryMissing || categoryError !== null}
            >
              <SelectValue placeholder={t`Выберите категорию`} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError>
            {categoryMissing ? <Trans>Выберите категорию.</Trans> : categoryError}
          </FieldError>
        </Field>
        {paysShepherd && (
          <Field data-invalid={shepherdError !== null}>
            <FieldLabel htmlFor={`${id}-shepherd`}>
              <Trans>Чабан</Trans>
            </FieldLabel>
            <Select
              items={shepherdItems}
              value={shepherdId}
              disabled={automatic}
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
                  {shepherdItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError>{shepherdError}</FieldError>
          </Field>
        )}
        <Field data-invalid={flockMissing || sheepMissing || scopeError !== null}>
          <FieldLabel id={`${id}-scope`}>
            <Trans>Относится к</Trans>
          </FieldLabel>
          <ToggleGroup
            aria-labelledby={`${id}-scope`}
            variant="outline"
            spacing={0}
            className="w-full"
            value={[scopeKind]}
            disabled={automatic}
            onValueChange={(value) => {
              const [next] = value;
              if (isScopeKind(next)) {
                setScopeKind(next);
                changed();
              }
            }}
          >
            <ToggleGroupItem value="farm" className="flex-1">
              <Trans>Ферма</Trans>
            </ToggleGroupItem>
            <ToggleGroupItem value="flock" className="flex-1">
              <Trans>Стадо</Trans>
            </ToggleGroupItem>
            <ToggleGroupItem value="sheep" className="flex-1">
              <Trans>Баран</Trans>
            </ToggleGroupItem>
          </ToggleGroup>
          {scopeKind === "flock" && (
            <Select
              items={flockItems}
              value={flockId}
              disabled={automatic}
              onValueChange={(value) => {
                setFlockId(value);
                changed();
              }}
            >
              <SelectTrigger
                aria-label={t`Стадо`}
                className="w-full"
                aria-invalid={flockMissing || scopeError !== null}
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
          )}
          {scopeKind === "sheep" && (
            <SheepCombobox
              farmId={farm.id}
              label={t`Баран`}
              value={sheepId}
              current={record?.scope.kind === "sheep" ? record.scope.sheep : null}
              disabled={automatic}
              invalid={sheepMissing || scopeError !== null}
              className="w-full"
              onChange={(value) => {
                setSheepId(value);
                changed();
              }}
            />
          )}
          <FieldError>
            {flockMissing ? (
              <Trans>Выберите стадо.</Trans>
            ) : sheepMissing ? (
              <Trans>Выберите барана.</Trans>
            ) : (
              scopeError
            )}
          </FieldError>
        </Field>
        <Field data-invalid={notesError !== null}>
          <FieldLabel htmlFor={`${id}-notes`}>
            <Trans>Примечание</Trans>
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
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          {record === null ? i18n._(kindLabels[kind].add) : <Trans>Сохранить</Trans>}
        </Button>
      </DialogFooter>
    </form>
  );
}
