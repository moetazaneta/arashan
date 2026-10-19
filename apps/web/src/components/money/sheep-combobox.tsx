import { useSheepList } from "@arashan/client";
import type { FarmId, MoneySheepRef, SheepId } from "@arashan/core";
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

interface SheepOption {
  id: SheepId;
  label: string;
}

/**
 * A Sheep of the Farm, found by its Tag: the scope of a money record, or of the filter of a table.
 * `current` is the Sheep that the record has already, which can be gone from the list now.
 */
export function SheepCombobox({
  farmId,
  id,
  label,
  value,
  current = null,
  disabled = false,
  invalid = false,
  className,
  onChange,
}: {
  farmId: FarmId;
  id?: string;
  /** The name of the field, for a field with no label of its own. */
  label?: string;
  value: SheepId | null;
  current?: MoneySheepRef | null;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  onChange: (sheepId: SheepId | null) => void;
}) {
  const { t } = useLingui();
  const sheep = useSheepList(farmId);
  const noTag = t`без бирки`;
  const options = useMemo(() => {
    const list: SheepOption[] = (sheep.data ?? []).map((row) => ({
      id: row.id,
      label: row.tag ?? row.name ?? noTag,
    }));
    if (current !== null && !list.some((option) => option.id === current.id)) {
      list.push({ id: current.id, label: current.tag ?? current.name ?? noTag });
    }
    return list;
  }, [sheep.data, current, noTag]);

  return (
    <Combobox
      items={options}
      value={options.find((option) => option.id === value) ?? null}
      itemToStringLabel={(option: SheepOption) => option.label}
      isItemEqualToValue={(a: SheepOption, b: SheepOption) => a.id === b.id}
      disabled={disabled}
      onValueChange={(option: SheepOption | null) => onChange(option?.id ?? null)}
    >
      <ComboboxInput
        id={id}
        aria-label={label}
        placeholder={t`Бирка`}
        disabled={disabled}
        aria-invalid={invalid}
        className={className}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          <Trans>Нет барана с такой биркой.</Trans>
        </ComboboxEmpty>
        <ComboboxList>
          {(option: SheepOption) => (
            <ComboboxItem key={option.id} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
