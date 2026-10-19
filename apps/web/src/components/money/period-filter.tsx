import type { CalendarDate, Period } from "@arashan/core";
import { useLingui } from "@lingui/react/macro";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The period of the money: the filter of the tables of Expenses and Incomes, and of the money report.

export type PeriodPreset = "thisMonth" | "thisYear" | "lastYear" | "all" | "custom";

/** What the Member chose for the period. */
export interface PeriodChoice {
  period: PeriodPreset;
  /** The days of «Свой период», as the date fields have them: an empty one is no limit. */
  from: string;
  to: string;
}

/** The period as a page opens: this year. */
export const defaultPeriod: PeriodChoice = { period: "thisYear", from: "", to: "" };

/** The first and the last day of the period, both included; null is no limit. */
export function periodOf(choice: PeriodChoice, today: CalendarDate): Period {
  const year = Number(today.slice(0, 4));
  switch (choice.period) {
    // No record is in the future, so a period that goes on now needs no last day.
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: null };
    case "thisYear":
      return { from: `${year}-01-01`, to: null };
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "all":
      return { from: null, to: null };
    case "custom":
      return { from: choice.from || null, to: choice.to || null };
  }
}

/** The select of the period, and the two date fields of «Свой период». */
export function PeriodFilter({
  value,
  today,
  onChange,
}: {
  value: PeriodChoice;
  today: CalendarDate;
  onChange: (choice: PeriodChoice) => void;
}) {
  const { t } = useLingui();
  const periodItems: { value: PeriodPreset; label: string }[] = [
    { value: "thisMonth", label: t`Этот месяц` },
    { value: "thisYear", label: t`Этот год` },
    { value: "lastYear", label: t`Прошлый год` },
    { value: "all", label: t`Всё время` },
    { value: "custom", label: t`Свой период` },
  ];
  return (
    <>
      <FilterSelect
        label={t`Период`}
        items={periodItems}
        value={value.period}
        onChange={(period) => {
          if (period !== "custom") {
            onChange({ ...value, period });
            return;
          }
          // «Свой период» starts as the period that the page shows.
          const shown = periodOf(value, today);
          onChange({ period, from: shown.from ?? "", to: shown.to ?? today });
        }}
      />
      {value.period === "custom" && (
        <>
          <Input
            type="date"
            aria-label={t({ context: "from date", message: "С" })}
            max={today}
            className="w-36 tabular-nums"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label={t({ context: "to date", message: "По" })}
            max={today}
            className="w-36 tabular-nums"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </>
      )}
    </>
  );
}

/** A filter of a page: a select with no label of its own, which shows what it selects. */
export function FilterSelect<Value extends string | null>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => onChange(next as Value)}>
      <SelectTrigger aria-label={label} className="max-w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value ?? "all"} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
