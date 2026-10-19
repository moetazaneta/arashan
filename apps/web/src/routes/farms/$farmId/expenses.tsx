import type { FarmId } from "@arashan/core";
import { useFarm } from "@arashan/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { MoneyPage, validateMoneySearch } from "@/components/money/money-page";

export const Route = createFileRoute("/farms/$farmId/expenses")({
  validateSearch: validateMoneySearch,
  component: ExpensesPage,
});

/** The Expenses of the Farm and their categories. */
function ExpensesPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const tab = Route.useSearch().tab ?? "records";
  const navigate = useNavigate();

  if (farm === undefined) return null;
  return (
    <MoneyPage
      farm={farm}
      kind="expense"
      tab={tab}
      onTabChange={(next) =>
        void navigate({
          to: "/farms/$farmId/expenses",
          params: { farmId },
          search: next === "records" ? {} : { tab: next },
          replace: true,
        })
      }
    />
  );
}
