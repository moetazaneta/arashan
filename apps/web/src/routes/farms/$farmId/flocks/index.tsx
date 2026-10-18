import type { FarmId } from "@arashan/core";
import { useFarm } from "@arashan/client";
import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { FlocksTab } from "@/components/flocks/flocks-tab";
import { LocationsTab } from "@/components/flocks/locations-tab";
import { ShepherdsTab } from "@/components/flocks/shepherds-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = ["flocks", "shepherds", "locations"] as const;
type FlocksPageTab = (typeof tabs)[number];

function isTab(value: unknown): value is FlocksPageTab {
  return tabs.some((tab) => tab === value);
}

/** The tab of the page in the URL, so that a link can open it. «Стада» is the default. */
interface FlocksSearch {
  tab?: Exclude<FlocksPageTab, "flocks">;
}

export const Route = createFileRoute("/farms/$farmId/flocks/")({
  validateSearch: (search: Record<string, unknown>): FlocksSearch =>
    isTab(search.tab) && search.tab !== "flocks" ? { tab: search.tab } : {},
  component: FlocksPage,
});

/** The Flocks of the Farm, its Shepherds and its Locations, each in its own tab. */
function FlocksPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const tab: FlocksPageTab = Route.useSearch().tab ?? "flocks";
  const navigate = useNavigate();
  // One toggle for the three tabs: the Archived records stay shown when the Member changes the tab.
  const [showArchived, setShowArchived] = useState(false);

  if (farm === undefined) return null;
  const archive = { showArchived, onShowArchivedChange: setShowArchived };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Trans>Стада</Trans>
      </h1>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (!isTab(value)) return;
          void navigate({
            to: "/farms/$farmId/flocks",
            params: { farmId },
            search: value === "flocks" ? {} : { tab: value },
            replace: true,
          });
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="flocks">
            <Trans>Стада</Trans>
          </TabsTrigger>
          <TabsTrigger value="shepherds">
            <Trans>Чабаны</Trans>
          </TabsTrigger>
          <TabsTrigger value="locations">
            <Trans>Места</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="flocks" className="pt-3">
          <FlocksTab farm={farm} {...archive} />
        </TabsContent>
        <TabsContent value="shepherds" className="pt-3">
          <ShepherdsTab farm={farm} {...archive} />
        </TabsContent>
        <TabsContent value="locations" className="pt-3">
          <LocationsTab farm={farm} {...archive} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
