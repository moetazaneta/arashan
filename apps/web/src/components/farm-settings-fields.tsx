import type { ErrorCode, FarmSettings } from "@arashan/core";
import { maxLambAgeMonths, minLambAgeMonths } from "@arashan/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ErrorInfo } from "@/errors";
import { currencyOptions, timeZoneOffset, timeZones } from "@/format";

/** The settings of a Farm as the form holds them, before the core checks them. */
export interface SettingsDraft {
  currency: string | null;
  timeZone: string | null;
  lambAgeMonths: string;
}

export function draftOf(settings: FarmSettings): SettingsDraft {
  return {
    currency: settings.currency,
    timeZone: settings.timeZone,
    lambAgeMonths: String(settings.lambAgeMonths),
  };
}

/** The settings to send. The core checks them and gives the error of a wrong one. */
export function settingsOf(draft: SettingsDraft): FarmSettings {
  return {
    currency: draft.currency ?? "",
    timeZone: draft.timeZone ?? "",
    lambAgeMonths: Number(draft.lambAgeMonths),
  };
}

/** The errors that these fields show; a form shows the others itself. */
export const settingsErrorCodes: readonly ErrorCode[] = [
  "farm.currencyInvalid",
  "farm.timeZoneInvalid",
  "farm.lambAgeInvalid",
];

/**
 * The fields of the settings of a Farm: the currency, the time zone and the lamb age. For the form of
 * a new Farm and for the settings of a Farm. They go inside the `FieldGroup` of the form.
 */
export function FarmSettingsFields({
  id,
  draft,
  onChange,
  error,
}: {
  /** The prefix of the ids of the inputs, unique on the page. */
  id: string;
  draft: SettingsDraft;
  onChange: (draft: SettingsDraft) => void;
  error: ErrorInfo | null;
}) {
  const { i18n, t } = useLingui();
  const currencies = useMemo(() => currencyOptions(i18n.locale), [i18n.locale]);
  const zones = useMemo(() => timeZones(draft.timeZone), [draft.timeZone]);
  const errorOf = (code: ErrorCode) => (error?.code === code ? error.message : null);
  const currencyError = errorOf("farm.currencyInvalid");
  const timeZoneError = errorOf("farm.timeZoneInvalid");
  const lambAgeError = errorOf("farm.lambAgeInvalid");

  return (
    <>
      <Field data-invalid={currencyError !== null}>
        <FieldLabel htmlFor={`${id}-currency`}>
          <Trans>Валюта</Trans>
        </FieldLabel>
        <Select
          items={currencies}
          value={draft.currency}
          onValueChange={(currency) => onChange({ ...draft, currency })}
        >
          <SelectTrigger
            id={`${id}-currency`}
            className="w-full"
            aria-invalid={currencyError !== null}
          >
            <SelectValue placeholder={t`Выберите валюту`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {currencies.map((currency) => (
                <SelectItem key={currency.value} value={currency.value}>
                  {currency.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldError>{currencyError}</FieldError>
      </Field>
      <Field data-invalid={timeZoneError !== null}>
        <FieldLabel htmlFor={`${id}-time-zone`}>
          <Trans>Часовой пояс</Trans>
        </FieldLabel>
        <Combobox
          items={zones}
          value={draft.timeZone}
          onValueChange={(timeZone) => onChange({ ...draft, timeZone })}
        >
          <ComboboxInput
            id={`${id}-time-zone`}
            placeholder={t`Например, Asia/Bishkek`}
            aria-invalid={timeZoneError !== null}
          />
          <ComboboxContent>
            <ComboboxEmpty>
              <Trans>Такого часового пояса нет.</Trans>
            </ComboboxEmpty>
            <ComboboxList>
              {(zone: string) => (
                <ComboboxItem key={zone} value={zone}>
                  {zone}
                  <span className="ml-auto text-muted-foreground">
                    {timeZoneOffset(zone, i18n.locale)}
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          <Trans>По нему приложение решает, когда начинается день.</Trans>
        </FieldDescription>
        <FieldError>{timeZoneError}</FieldError>
      </Field>
      <Field data-invalid={lambAgeError !== null}>
        <FieldLabel htmlFor={`${id}-lamb-age`}>
          <Trans>Возраст ягнёнка, месяцев</Trans>
        </FieldLabel>
        <Input
          id={`${id}-lamb-age`}
          type="number"
          inputMode="numeric"
          min={minLambAgeMonths}
          max={maxLambAgeMonths}
          step={1}
          className="max-w-24"
          value={draft.lambAgeMonths}
          aria-invalid={lambAgeError !== null}
          onChange={(event) => onChange({ ...draft, lambAgeMonths: event.target.value })}
        />
        <FieldDescription>
          <Trans>Баран младше этого возраста — ягнёнок.</Trans>
        </FieldDescription>
        <FieldError>{lambAgeError}</FieldError>
      </Field>
    </>
  );
}
