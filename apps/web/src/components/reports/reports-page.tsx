import type { Farm } from "@arashan/core";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";

import { defaultPeriod, type PeriodChoice } from "@/components/money/period-filter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { HeadCountTab } from "./head-count-tab";
import { MoneyTab } from "./money-tab";

const tabs = ["headCount", "money"] as const;
export type ReportsTab = (typeof tabs)[number];

function isTab(value: unknown): value is ReportsTab {
  return tabs.some((tab) => tab === value);
}

/** The tab of the page in the URL, so that a link can open it. «Поголовье» is the default. */
export interface ReportsSearch {
  tab?: Exclude<ReportsTab, "headCount">;
}

export function validateReportsSearch(search: Record<string, unknown>): ReportsSearch {
  return isTab(search.tab) && search.tab !== "headCount" ? { tab: search.tab } : {};
}

/** The page «Отчёты»: the head count of the Sheep and the money of a period, each in its own tab. */
export function ReportsPage({
  farm,
  tab,
  onTabChange,
}: {
  farm: Farm;
  tab: ReportsTab;
  onTabChange: (tab: ReportsTab) => void;
}) {
  // The period stays when the Member changes the tab.
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Trans>Отчёты</Trans>
      </h1>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isTab(value)) onTabChange(value);
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="headCount">
            <Trans>Поголовье</Trans>
          </TabsTrigger>
          <TabsTrigger value="money">
            <Trans>Деньги</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="headCount" className="pt-3">
          <HeadCountTab farm={farm} />
        </TabsContent>
        <TabsContent value="money" className="pt-3">
          <MoneyTab farm={farm} period={period} onPeriodChange={setPeriod} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
