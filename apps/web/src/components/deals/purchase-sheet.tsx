import {
  dateAt,
  maxSheepNameLength,
  maxSheepPerPurchase,
  maxTagLength,
  useBuySheep,
  useFlocks,
  useSheepOwners,
} from "@arashan/client";
import type { DealId, ErrorCode, Farm, FlockId, MembershipId, Sex } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { PlusIcon, XIcon } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";

import { DateField, fieldMessage, FormAlert } from "@/components/flocks/shared";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCodeError, useError } from "@/errors";
import { parseAmount } from "@/format";

import { PriceField } from "./price-field";

const dateCodes: readonly ErrorCode[] = ["deal.dateInvalid", "deal.dateInFuture"];
const priceCodes: readonly ErrorCode[] = ["deal.priceInvalid"];
const flockCodes: readonly ErrorCode[] = ["flock.notFound", "flock.archived"];

/** One new Sheep of the form, as the Member types it. */
interface Row {
  key: number;
  tag: string;
  name: string;
  sex: Sex | null;
  birthDate: string;
  /** Null until the Member picks one: then the Owner is the Member who fills the form. */
  ownerId: MembershipId | null;
}

let nextKey = 1;
const emptyRow = (): Row => ({
  key: nextKey++,
  tag: "",
  name: "",
  sex: null,
  birthDate: "",
  ownerId: null,
});

/** The value of the Flock field for no Flock. */
const noFlock = "none";

/**
 * The panel of a Purchase: a Member records the new Sheep that the Farm bought, in one form, with the
 * date, the total price and an optional Flock. The Sheep get the Origin «Куплен», and the price
 * becomes an Expense of «Покупка баранов».
 */
export function BuySheepSheet({
  farm,
  open,
  onOpenChange,
  onBought,
}: {
  farm: Farm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBought: (purchaseId: DealId) => void;
}) {
  const { t } = useLingui();
  const priceRef = useRef<HTMLInputElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        initialFocus={priceRef}
        className="gap-0 data-[side=right]:w-[600px] data-[side=right]:sm:max-w-[600px]"
      >
        <SheetHeader className="flex-row items-center justify-between border-b">
          <SheetTitle className="text-base font-semibold">
            <Trans>Купить баранов</Trans>
          </SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label={t`Закрыть`} />}>
            <XIcon />
          </SheetClose>
        </SheetHeader>
        <PurchaseForm
          farm={farm}
          priceRef={priceRef}
          onDone={(purchaseId) => {
            onOpenChange(false);
            onBought(purchaseId);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function PurchaseForm({
  farm,
  priceRef,
  onDone,
}: {
  farm: Farm;
  priceRef: RefObject<HTMLInputElement | null>;
  onDone: (purchaseId: DealId) => void;
}) {
  const { t } = useLingui();
  const buy = useBuySheep(farm.id);
  const owners = useSheepOwners(farm.id);
  const flocks = useFlocks(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [date, setDate] = useState(today);
  const [price, setPrice] = useState("");
  const [flock, setFlock] = useState<string>(noFlock);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  // The rules that the form checks before it sends the Purchase: they show after a try to save.
  const [checked, setChecked] = useState(false);
  const priceValue = parseAmount(price);
  const priceError = useCodeError(checked && priceValue === null ? "deal.priceInvalid" : null);
  const saveError = useError(buy.error);
  const error = priceError ?? saveError;
  const id = useId();
  const me = owners.data?.find((owner) => owner.isMe)?.id ?? null;
  const ownerItems = (owners.data ?? []).map((owner) => ({ value: owner.id, label: owner.name }));
  // A form offers only the Flocks that are not Archived.
  const flockItems = (flocks.data ?? [])
    .filter((one) => !one.archived)
    .map((one) => ({ value: one.id as string, label: one.name }));
  const allFlockItems = [{ value: noFlock, label: t`Без стада` }, ...flockItems];

  function changed() {
    buy.reset();
    setChecked(false);
  }

  function setRow(key: number, change: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    changed();
  }

  function submit() {
    if (buy.isPending) return;
    setChecked(true);
    buy.reset();
    if (priceValue === null || rows.some((row) => row.sex === null)) return;
    const sheep = rows.flatMap((row) => {
      const ownerId = row.ownerId ?? me;
      if (row.sex === null || ownerId === null) return [];
      return [
        {
          tag: row.tag,
          name: row.name,
          sex: row.sex,
          birthDate: row.birthDate === "" ? null : row.birthDate,
          notes: null,
          ownerId,
        },
      ];
    });
    buy.mutate(
      {
        sheep,
        date,
        price: priceValue,
        flockId: flock === noFlock ? null : (flock as FlockId),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex-1 overflow-y-auto p-4">
        <FieldGroup className="gap-4">
          <div className="flex flex-wrap gap-4">
            <DateField
              id={`${id}-date`}
              label={<Trans>Дата покупки</Trans>}
              value={date}
              max={today}
              error={fieldMessage(error, dateCodes)}
              onChange={(value) => {
                setDate(value);
                changed();
              }}
            />
            <PriceField
              id={`${id}-price`}
              label={<Trans>Сумма за всех</Trans>}
              currency={farm.currency}
              value={price}
              inputRef={priceRef}
              error={fieldMessage(error, priceCodes)}
              onChange={(value) => {
                setPrice(value);
                changed();
              }}
            />
          </div>
          <Field data-invalid={fieldMessage(error, flockCodes) !== null}>
            <FieldLabel htmlFor={`${id}-flock`}>
              <Trans>Стадо</Trans>
            </FieldLabel>
            <Select
              items={allFlockItems}
              value={flock}
              onValueChange={(value) => {
                setFlock(value ?? noFlock);
                changed();
              }}
            >
              <SelectTrigger id={`${id}-flock`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={noFlock}>{t`Без стада`}</SelectItem>
                </SelectGroup>
                {flockItems.length > 0 && <SelectSeparator />}
                {flockItems.length > 0 && (
                  <SelectGroup>
                    {flockItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <FieldError>{fieldMessage(error, flockCodes)}</FieldError>
          </Field>
          <h3 className="pt-2 text-sm font-semibold">
            <Trans>Бараны</Trans>{" "}
            <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
          </h3>
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li key={row.key}>
                <SheepRow
                  id={`${id}-row-${row.key}`}
                  number={index + 1}
                  row={row}
                  ownerItems={ownerItems}
                  ownerId={row.ownerId ?? me}
                  today={today}
                  sexMissing={checked && row.sex === null}
                  onChange={(change) => setRow(row.key, change)}
                  onRemove={
                    rows.length > 1
                      ? () => {
                          setRows((current) => current.filter((one) => one.key !== row.key));
                          changed();
                        }
                      : null
                  }
                />
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={rows.length >= maxSheepPerPurchase}
            onClick={() => {
              setRows((current) => [...current, emptyRow()]);
              changed();
            }}
          >
            <PlusIcon data-icon="inline-start" />
            <Trans>Ещё баран</Trans>
          </Button>
          <FormAlert error={error} fieldCodes={[...dateCodes, ...priceCodes, ...flockCodes]} />
        </FieldGroup>
      </div>
      <div className="flex justify-end gap-2 border-t p-4">
        <SheetClose render={<Button type="button" variant="outline" />}>
          <Trans>Отмена</Trans>
        </SheetClose>
        <Button type="submit" disabled={buy.isPending}>
          {buy.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Купить</Trans>
        </Button>
      </div>
    </form>
  );
}

/** The fields of one new Sheep: the Tag, the name, the sex, the birth date and the Owner. */
function SheepRow({
  id,
  number,
  row,
  ownerItems,
  ownerId,
  today,
  sexMissing,
  onChange,
  onRemove,
}: {
  id: string;
  number: number;
  row: Row;
  ownerItems: { value: MembershipId; label: string }[];
  ownerId: MembershipId | null;
  today: string;
  sexMissing: boolean;
  onChange: (change: Partial<Row>) => void;
  onRemove: (() => void) | null;
}) {
  const { t } = useLingui();
  return (
    <fieldset className="grid grid-cols-2 gap-3 rounded-md border p-3">
      <legend className="sr-only">
        <Trans>Баран {number}</Trans>
      </legend>
      <div className="col-span-2 -mb-1 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span aria-hidden>{number}</span>
        {onRemove !== null && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t`Убрать барана ${number}`}
            onClick={onRemove}
          >
            <XIcon />
          </Button>
        )}
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-tag`}>
          <Trans>Бирка</Trans>
        </FieldLabel>
        <Input
          id={`${id}-tag`}
          value={row.tag}
          maxLength={maxTagLength}
          autoComplete="off"
          spellCheck={false}
          className="tabular-nums"
          onChange={(event) => onChange({ tag: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>
          <Trans>Кличка</Trans>
        </FieldLabel>
        <Input
          id={`${id}-name`}
          value={row.name}
          maxLength={maxSheepNameLength}
          autoComplete="off"
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>
      <Field data-invalid={sexMissing}>
        <FieldLabel id={`${id}-sex`}>
          <Trans>Пол</Trans>
        </FieldLabel>
        <ToggleGroup
          aria-labelledby={`${id}-sex`}
          variant="outline"
          spacing={0}
          value={row.sex === null ? [] : [row.sex]}
          onValueChange={(value) => {
            const [sex] = value;
            if (sex === "ram" || sex === "ewe") onChange({ sex });
          }}
        >
          <ToggleGroupItem value="ram" className="px-4">
            <Trans>Самец</Trans>
          </ToggleGroupItem>
          <ToggleGroupItem value="ewe" className="px-4">
            <Trans>Самка</Trans>
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldError>{sexMissing && <Trans>Выберите пол: самец или самка.</Trans>}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-birth-date`}>
          <Trans>Дата рождения</Trans>
        </FieldLabel>
        <Input
          id={`${id}-birth-date`}
          type="date"
          max={today}
          className="w-44 tabular-nums"
          value={row.birthDate}
          onChange={(event) => onChange({ birthDate: event.target.value })}
        />
      </Field>
      <Field className="col-span-2">
        <FieldLabel htmlFor={`${id}-owner`}>
          <Trans>Владелец</Trans>
        </FieldLabel>
        <Select
          items={ownerItems}
          value={ownerId}
          onValueChange={(value) => {
            if (value !== null) onChange({ ownerId: value });
          }}
        >
          <SelectTrigger id={`${id}-owner`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ownerItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </fieldset>
  );
}
