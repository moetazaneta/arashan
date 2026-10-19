import { useCancelDeal, useChangeDealPrice } from "@arashan/client";
import type { DealCard, ErrorCode, Farm } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { type RefObject, useId, useRef, useState } from "react";

import { fieldMessage, FormAlert } from "@/components/flocks/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useCodeError, useError, useErrorMessage } from "@/errors";
import { amountText, parseAmount } from "@/format";

import { PriceField } from "./price-field";

const priceCodes: readonly ErrorCode[] = ["deal.priceInvalid"];

/**
 * A Member changes the total price of a deal. It is the amount of the Automatic record, so the
 * table of the Incomes or the Expenses shows the new amount too.
 */
export function ChangePriceDialog({ farm, deal }: { farm: Farm; deal: DealCard }) {
  const [open, setOpen] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Изменить сумму</Trans>
      </Button>
      <DialogContent showCloseButton={false} initialFocus={priceRef}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Изменить сумму</Trans>
          </DialogTitle>
          <DialogDescription>
            {deal.kind === "sale" ? (
              <Trans>Доход «Продажа баранов» получит ту же сумму.</Trans>
            ) : (
              <Trans>Расход «Покупка баранов» получит ту же сумму.</Trans>
            )}
          </DialogDescription>
        </DialogHeader>
        <PriceForm farm={farm} deal={deal} priceRef={priceRef} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PriceForm({
  farm,
  deal,
  priceRef,
  onDone,
}: {
  farm: Farm;
  deal: DealCard;
  priceRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const { i18n } = useLingui();
  const change = useChangeDealPrice(farm.id);
  const [price, setPrice] = useState(() => amountText(deal.price, i18n.locale));
  const [checked, setChecked] = useState(false);
  const priceValue = parseAmount(price);
  const priceError = useCodeError(checked && priceValue === null ? "deal.priceInvalid" : null);
  const saveError = useError(change.error);
  const error = priceError ?? saveError;
  const id = useId();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (change.isPending) return;
        setChecked(true);
        if (priceValue === null) return;
        change.mutate({ dealId: deal.id, price: priceValue }, { onSuccess: onDone });
      }}
    >
      <FieldGroup className="gap-4">
        <PriceField
          id={`${id}-price`}
          label={<Trans>Сумма</Trans>}
          currency={farm.currency}
          value={price}
          inputRef={priceRef}
          error={fieldMessage(error, priceCodes)}
          onChange={(value) => {
            setPrice(value);
            setChecked(false);
            change.reset();
          }}
        />
        <FormAlert error={error} fieldCodes={priceCodes} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Сохранить</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A Member cancels a deal made by mistake, after a confirmation. The deal and its Automatic record
 * go away. The Sheep of a Sale are Active again; the Sheep of a Purchase are deleted.
 */
export function CancelDealDialog({
  farm,
  deal,
  onCancelled,
}: {
  farm: Farm;
  deal: DealCard;
  onCancelled: () => void;
}) {
  const cancel = useCancelDeal(farm.id);
  const [open, setOpen] = useState(false);
  const error = useErrorMessage(cancel.error);
  const sale = deal.kind === "sale";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancel.reset();
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        {sale ? <Trans>Отменить продажу</Trans> : <Trans>Отменить покупку</Trans>}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {sale ? <Trans>Отменить продажу?</Trans> : <Trans>Отменить покупку?</Trans>}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {sale ? (
              <Trans>
                Продажа и её доход удалятся. Бараны снова станут активными и вернутся в свои стада.
                Отменяйте только ошибочную продажу.
              </Trans>
            ) : (
              <Trans>
                Покупка и её расход удалятся, и бараны этой покупки тоже. Отменяйте только ошибочную
                покупку.
              </Trans>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Не отменять</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(deal.id, {
                onSuccess: () => {
                  setOpen(false);
                  onCancelled();
                },
              })
            }
          >
            {cancel.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {sale ? <Trans>Отменить продажу</Trans> : <Trans>Отменить покупку</Trans>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
