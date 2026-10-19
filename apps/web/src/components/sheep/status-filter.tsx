import type { SheepListItem } from "@arashan/client";
import type { SheepStatus } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** The Statuses that the table «Бараны» can show, or all of them. Active is the default. */
export const statusFilters = ["active", "lost", "sold", "slaughtered", "dead", "all"] as const;
export type StatusFilter = (typeof statusFilters)[number];

/** The name of each filter: the Sheep with that Status. */
const filterLabels: Record<StatusFilter, MessageDescriptor> = {
  active: msg({ context: "filter", message: "Активные" }),
  lost: msg({ context: "filter", message: "Потерянные" }),
  sold: msg({ context: "filter", message: "Проданные" }),
  slaughtered: msg({ context: "filter", message: "Забитые" }),
  dead: msg({ context: "filter", message: "Павшие" }),
  all: msg({ context: "filter", message: "Все" }),
};

export function isStatusFilter(value: unknown): value is StatusFilter {
  return statusFilters.some((filter) => filter === value);
}

/** The Sheep that the filter shows. */
export function filterByStatus(
  sheep: readonly SheepListItem[],
  filter: StatusFilter,
): SheepListItem[] {
  return filter === "all" ? [...sheep] : sheep.filter((item) => item.status === filter);
}

/** The filter of the table by Status, with the number of Sheep of each. */
export function StatusFilterToggle({
  sheep,
  value,
  onChange,
}: {
  sheep: readonly SheepListItem[];
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  const { t, i18n } = useLingui();
  const counts = new Map<SheepStatus, number>();
  for (const item of sheep) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);

  return (
    <ToggleGroup
      aria-label={t`Статус`}
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      onValueChange={(next) => {
        const [filter] = next;
        if (isStatusFilter(filter)) onChange(filter);
      }}
    >
      {statusFilters.map((filter) => (
        <ToggleGroupItem key={filter} value={filter} className="gap-1.5 px-2.5">
          {i18n._(filterLabels[filter])}
          <span className="text-muted-foreground tabular-nums">
            {filter === "all" ? sheep.length : (counts.get(filter) ?? 0)}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
