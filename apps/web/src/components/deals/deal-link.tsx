import type { DealId, FarmId } from "@arashan/core";
import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { dealKindLabels } from "./labels";

/**
 * A link to the card of a deal: «Продажа» or «Покупка», or other words. The table of the Incomes or
 * the Expenses shows it for an Automatic record, the card of a Sheep for its Sale and its Purchase.
 */
export function DealLink({
  farmId,
  deal,
  children,
}: {
  farmId: FarmId;
  deal: { kind: "sale" | "purchase"; id: DealId };
  children?: ReactNode;
}) {
  const { i18n } = useLingui();
  return (
    <Link
      to="/farms/$farmId/deals/$dealId"
      params={{ farmId, dealId: deal.id }}
      className="underline decoration-border underline-offset-4 hover:decoration-foreground"
    >
      {children ?? i18n._(dealKindLabels[deal.kind])}
    </Link>
  );
}
