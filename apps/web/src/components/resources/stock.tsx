import { useLingui } from "@lingui/react/macro";

import { formatQuantity } from "@/format";
import { cn } from "@/lib/utils";

/**
 * A quantity of a Resource with its unit: «1 250,5 кг». A Stock below 0 is red: a Usage came before
 * its Restock was recorded, or a count is missing.
 */
export function Stock({
  quantity,
  unit,
  signed = false,
  className,
}: {
  quantity: number;
  unit: string;
  /** Show «+» before a gain, for the change of an event. */
  signed?: boolean;
  className?: string;
}) {
  const { i18n } = useLingui();
  return (
    <span className={cn("tabular-nums", !signed && quantity < 0 && "text-destructive", className)}>
      {formatQuantity(quantity, i18n.locale, signed)} {unit}
    </span>
  );
}
