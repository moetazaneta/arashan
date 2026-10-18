import { useLingui } from "@lingui/react/macro";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { changeLocale, isLocale } from "@/i18n";

/** Switches the language of the UI between Russian and English. */
export function LocaleSwitch() {
  const { i18n, t } = useLingui();

  return (
    <ToggleGroup
      aria-label={t`Язык`}
      size="sm"
      value={[i18n.locale]}
      onValueChange={([locale]) => {
        if (isLocale(locale)) changeLocale(i18n, locale);
      }}
    >
      <ToggleGroupItem value="ru" lang="ru">
        Русский
      </ToggleGroupItem>
      <ToggleGroupItem value="en" lang="en">
        English
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
