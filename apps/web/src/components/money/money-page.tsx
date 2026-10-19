import type { Farm, MoneyKind } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKeyShortcut } from "@/shortcuts";

import { CategoriesTab } from "./categories-tab";
import { kindLabels } from "./labels";
import { RecordDialog } from "./record-dialog";
import { defaultFilters, type RecordFilters, RecordsTab } from "./records-tab";

const tabs = ["records", "categories"] as const;
export type MoneyTab = (typeof tabs)[number];

function isTab(value: unknown): value is MoneyTab {
  return tabs.some((tab) => tab === value);
}

/** The tab of the page in the URL, so that a link can open it. «Записи» is the default. */
export interface MoneySearch {
  tab?: Exclude<MoneyTab, "records">;
}

export function validateMoneySearch(search: Record<string, unknown>): MoneySearch {
  return isTab(search.tab) && search.tab !== "records" ? { tab: search.tab } : {};
}

/**
 * The page «Расходы» or «Доходы»: the records of the kind with their filters and total, and the
 * categories of the kind, each in its own tab. `N` opens the dialog that adds a record.
 */
export function MoneyPage({
  farm,
  kind,
  tab,
  onTabChange,
}: {
  farm: Farm;
  kind: MoneyKind;
  tab: MoneyTab;
  onTabChange: (tab: MoneyTab) => void;
}) {
  const { i18n } = useLingui();
  // The filters stay when the Member changes the tab.
  const [filters, setFilters] = useState<RecordFilters>(defaultFilters);
  const [adding, setAdding] = useState(false);
  useKeyShortcut("KeyN", () => setAdding(true));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{i18n._(kindLabels[kind].title)}</h1>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isTab(value)) onTabChange(value);
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="records">
            <Trans>Записи</Trans>
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Trans>Категории</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="records" className="pt-3">
          <RecordsTab
            farm={farm}
            kind={kind}
            filters={filters}
            onFiltersChange={setFilters}
            onAdd={() => setAdding(true)}
          />
        </TabsContent>
        <TabsContent value="categories" className="pt-3">
          <CategoriesTab farm={farm} kind={kind} />
        </TabsContent>
      </Tabs>
      <RecordDialog farm={farm} kind={kind} open={adding} onOpenChange={setAdding} />
    </div>
  );
}
