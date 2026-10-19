import type { FarmId } from "@arashan/core";
import { useFarm } from "@arashan/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ReportsPage, validateReportsSearch } from "@/components/reports/reports-page";

export const Route = createFileRoute("/farms/$farmId/reports")({
  validateSearch: validateReportsSearch,
  component: Reports,
});

/** The reports of the Farm: the head count and the money. */
function Reports() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const tab = Route.useSearch().tab ?? "headCount";
  const navigate = useNavigate();

  if (farm === undefined) return null;
  return (
    <ReportsPage
      farm={farm}
      tab={tab}
      onTabChange={(next) =>
        void navigate({
          to: "/farms/$farmId/reports",
          params: { farmId },
          search: next === "headCount" ? {} : { tab: next },
          replace: true,
        })
      }
    />
  );
}
