import { type SheepCardData, useFarm, useSheep } from "@arashan/client";
import type { Farm, FarmId, SheepId } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, SearchXIcon } from "lucide-react";
import { useState } from "react";

import { Loading } from "@/components/loading";
import { MoveSheepDialog } from "@/components/sheep/move-sheep-dialog";
import { ChangeOwnerDialog, DeleteSheepDialog } from "@/components/sheep/sheep-dialogs";
import { SheepDetails } from "@/components/sheep/sheep-details";
import { EditSheepSheet } from "@/components/sheep/sheep-form";
import { SheepHistory } from "@/components/sheep/sheep-history";
import { StatusCell } from "@/components/sheep/sheep-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useErrorMessage } from "@/errors";

export const Route = createFileRoute("/farms/$farmId/sheep/$sheepId")({
  component: SheepCardPage,
});

/** The card of a Sheep: its fields, its Owners and its history, and what a Member can do to it. */
function SheepCardPage() {
  const { farmId, sheepId } = Route.useParams() as { farmId: FarmId; sheepId: SheepId };
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const sheep = useSheep(farmId, sheepId);
  const error = useErrorMessage(sheep.error);

  if (farm === undefined) return null;
  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/farms/$farmId/sheep"
        params={{ farmId }}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2.5 w-fit" })}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        <Trans>Бараны</Trans>
      </Link>
      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : sheep.data === undefined ? (
        <Loading />
      ) : sheep.data === null ? (
        <Gone farmId={farmId} />
      ) : (
        <SheepCard farm={farm} sheep={sheep.data} />
      )}
    </div>
  );
}

/** A Deleted Sheep, or one that the Farm never had. */
function Gone({ farmId }: { farmId: FarmId }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Этого барана нет: его удалили.</Trans>
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/farms/$farmId/sheep" params={{ farmId }} className={buttonVariants()}>
          <Trans>К списку баранов</Trans>
        </Link>
      </EmptyContent>
    </Empty>
  );
}

function SheepCard({ farm, sheep }: { farm: Farm; sheep: SheepCardData }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);

  return (
    <>
      <header className="flex flex-wrap items-start gap-4">
        <SheepTitle sheep={sheep} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Trans>Изменить</Trans>
          </Button>
          {sheep.status === "active" && (
            <Button variant="outline" onClick={() => setMoving(true)}>
              <Trans>Перевести в стадо</Trans>
            </Button>
          )}
          {sheep.status === "active" && <ChangeOwnerDialog farm={farm} sheep={sheep} />}
          <DeleteSheepDialog
            farm={farm}
            sheep={sheep}
            onDeleted={() =>
              void navigate({ to: "/farms/$farmId/sheep", params: { farmId: farm.id } })
            }
          />
        </div>
      </header>
      <Tabs defaultValue="card">
        <TabsList variant="line">
          <TabsTrigger value="card">
            <Trans>Карточка</Trans>
          </TabsTrigger>
          <TabsTrigger value="history">
            <Trans>История</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="card" className="pt-4">
          <SheepDetails farm={farm} sheep={sheep} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <SheepHistory farm={farm} sheep={sheep} />
        </TabsContent>
      </Tabs>
      <EditSheepSheet farm={farm} sheep={sheep} open={editing} onOpenChange={setEditing} />
      <MoveSheepDialog
        farm={farm}
        sheepIds={[sheep.id]}
        currentFlockId={sheep.flock?.id ?? null}
        open={moving}
        onOpenChange={setMoving}
      />
    </>
  );
}

/** The Tag (or «Без бирки») and the name of the Sheep, with its Status and the Lamb mark. */
function SheepTitle({ sheep }: { sheep: SheepCardData }) {
  const { t } = useLingui();
  const title = sheep.tag ?? t`Без бирки`;
  const subtitle = sheep.name;

  return (
    <div className="flex flex-col gap-1">
      <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight tabular-nums">
        {title}{" "}
        {subtitle !== null && (
          <span className="text-lg font-normal text-muted-foreground">{subtitle}</span>
        )}
      </h1>
      <p className="flex items-center gap-2 text-sm">
        <StatusCell status={sheep.status} />
        {sheep.lamb && (
          <span className="text-muted-foreground">
            · <Trans>ягнёнок</Trans>
          </span>
        )}
      </p>
    </div>
  );
}
