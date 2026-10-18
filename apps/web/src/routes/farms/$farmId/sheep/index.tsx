import type { FarmId, SheepId } from "@arashan/core";
import { useFarm, useSheepList } from "@arashan/client";
import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { RegisterSheepSheet } from "@/components/sheep/sheep-form";
import { ColumnSettings, SheepTable, useSheepColumns } from "@/components/sheep/sheep-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { useErrorMessage } from "@/errors";
import { useKeyShortcut } from "@/shortcuts";

export const Route = createFileRoute("/farms/$farmId/sheep/")({
  component: SheepPage,
});

/** The table «Бараны»: all Sheep of the Farm, and the side panel that registers new ones. */
function SheepPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const sheep = useSheepList(farmId);
  const error = useErrorMessage(sheep.error);
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);
  const [columnVisibility, setColumnVisibility] = useSheepColumns();
  useKeyShortcut("KeyN", () => setRegistering(true));

  const openCard = useCallback(
    (sheepId: SheepId) =>
      void navigate({ to: "/farms/$farmId/sheep/$sheepId", params: { farmId, sheepId } }),
    [navigate, farmId],
  );

  if (farm === undefined) return null;
  const empty = sheep.data?.length === 0;
  // The actions appear with the Sheep. With no Sheep, the empty state has the action.
  const hasSheep = sheep.data !== undefined && !empty;
  const addButton = (
    <Button aria-keyshortcuts="N" onClick={() => setRegistering(true)}>
      <Trans>Добавить барана</Trans>
      <Kbd aria-hidden className="ml-1 bg-primary-foreground/15 text-primary-foreground">
        N
      </Kbd>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
          <Trans>Бараны</Trans>{" "}
          {sheep.data !== undefined && (
            <span className="text-base font-normal text-muted-foreground tabular-nums">
              {sheep.data.length}
            </span>
          )}
        </h1>
        {hasSheep && (
          <div className="ml-auto flex items-center gap-2">
            <ColumnSettings visibility={columnVisibility} onChange={setColumnVisibility} />
            {addButton}
          </div>
        )}
      </div>
      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : empty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              <Trans>Здесь будут бараны фермы.</Trans>
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>{addButton}</EmptyContent>
        </Empty>
      ) : (
        <SheepTable data={sheep.data} columnVisibility={columnVisibility} onOpen={openCard} />
      )}
      <RegisterSheepSheet farm={farm} open={registering} onOpenChange={setRegistering} />
    </div>
  );
}
