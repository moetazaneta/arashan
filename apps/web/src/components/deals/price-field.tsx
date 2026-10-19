import { useLingui } from "@lingui/react/macro";
import type { ReactNode, RefObject } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { currencySymbol } from "@/format";

/**
 * The total price of a deal, in the currency of the Farm: the text that a Member types, which
 * `parseAmount` reads.
 */
export function PriceField({
  id,
  label,
  currency,
  value,
  error,
  inputRef,
  onChange,
}: {
  id: string;
  label: ReactNode;
  currency: string;
  value: string;
  error: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const { i18n } = useLingui();
  return (
    <Field data-invalid={error !== null}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="w-44">
        <InputGroupInput
          ref={inputRef}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className="tabular-nums"
          value={value}
          aria-invalid={error !== null}
          onChange={(event) => onChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{currencySymbol(currency, i18n.locale)}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
