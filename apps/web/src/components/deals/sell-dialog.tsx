import { dateAt, useSellSheep } from "@arashan/client";
import type { DealId, ErrorCode, Farm, SheepId } from "@arashan/core";
import { Plural, Trans } from "@lingui/react/macro";
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
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useCodeError, useError } from "@/errors";
import { parseAmount } from "@/format";

import { PriceField } from "./price-field";

const dateCodes: readonly ErrorCode[] = [
  "deal.dateInvalid",
  "deal.dateInFuture",
  "sheep.statusDateInvalid",
  "sheep.dateInvalid",
];
const priceCodes: readonly ErrorCode[] = ["deal.priceInvalid"];

/**
 * A Member sells Active Sheep on a date (by default today on the Farm) for one total price. The
 * table «Бараны» opens it for the selected Sheep, the card of a Sheep for that Sheep. The Sheep
 * become Sold and leave their Flocks, and the price becomes an Income of «Продажа баранов».
 */
export function SellSheepDialog({
  farm,
  sheepIds,
  open,
  onOpenChange,
  onSold,
}: {
  farm: Farm;
  sheepIds: readonly SheepId[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSold: (saleId: DealId) => void;
}) {
  const count = sheepIds.length;
  const priceRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The date is today by default, so the price gets the focus. */}
      <DialogContent showCloseButton={false} initialFocus={priceRef}>
        <DialogHeader>
          <DialogTitle>
            {count > 1 ? (
              <Plural
                value={count}
                one="Продать # барана"
                few="Продать # барана"
                many="Продать # баранов"
                other="Продать # барана"
              />
            ) : (
              <Trans>Продать барана</Trans>
            )}
          </DialogTitle>
          <DialogDescription>
            <Plural
              value={count}
              one="Баран станет проданным и выйдет из стада. Сумма станет доходом «Продажа баранов»."
              other="Бараны станут проданными и выйдут из стад. Общая сумма станет доходом «Продажа баранов»."
            />
          </DialogDescription>
        </DialogHeader>
        <SellForm
          farm={farm}
          sheepIds={sheepIds}
          priceRef={priceRef}
          onDone={(saleId) => {
            onOpenChange(false);
            onSold(saleId);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SellForm({
  farm,
  sheepIds,
  priceRef,
  onDone,
}: {
  farm: Farm;
  sheepIds: readonly SheepId[];
  priceRef: RefObject<HTMLInputElement | null>;
  onDone: (saleId: DealId) => void;
}) {
  const sell = useSellSheep(farm.id);
  const today = dateAt(Date.now(), farm.timeZone);
  const [date, setDate] = useState(today);
  const [price, setPrice] = useState("");
  // The price shows its error after a try to sell.
  const [checked, setChecked] = useState(false);
  const priceValue = parseAmount(price);
  const priceError = useCodeError(checked && priceValue === null ? "deal.priceInvalid" : null);
  const saveError = useError(sell.error);
  const error = priceError ?? saveError;
  const id = useId();

  function changed() {
    sell.reset();
    setChecked(false);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (sell.isPending) return;
        setChecked(true);
        if (priceValue === null) return;
        sell.mutate({ sheepIds, date, price: priceValue }, { onSuccess: onDone });
      }}
    >
      <FieldGroup className="gap-4">
        <DateField
          id={`${id}-date`}
          label={<Trans>Дата продажи</Trans>}
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
          label={<Trans>Сумма</Trans>}
          currency={farm.currency}
          value={price}
          inputRef={priceRef}
          error={fieldMessage(error, priceCodes)}
          onChange={(value) => {
            setPrice(value);
            changed();
          }}
        />
        <FormAlert error={error} fieldCodes={[...dateCodes, ...priceCodes]} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={sell.isPending}>
          {sell.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Продать</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}
