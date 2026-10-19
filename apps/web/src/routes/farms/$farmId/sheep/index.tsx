import type { FarmId, SheepId } from "@arashan/core";
import { useFarm, useSheepList } from "@arashan/client";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { SellSheepDialog } from "@/components/deals/sell-dialog";
import { type MoveResult, MoveSheepDialog } from "@/components/sheep/move-sheep-dialog";
import { statusLabels } from "@/components/sheep/labels";
import { RegisterSheepSheet } from "@/components/sheep/sheep-form";
import {
  ColumnSettings,
  noSelection,
  SheepTable,
  useSheepColumns,
} from "@/components/sheep/sheep-table";
import { ChangeStatusDialog, type StatusResult } from "@/components/sheep/status-dialogs";
import {
  filterByStatus,
  isStatusFilter,
  type StatusFilter,
  StatusFilterToggle,
} from "@/components/sheep/status-filter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { useErrorMessage } from "@/errors";
import { useKeyShortcut } from "@/shortcuts";

/** The Status filter of the table in the URL. Active is the default. */
interface SheepSearch {
  status?: Exclude<StatusFilter, "active">;
}

export const Route = createFileRoute("/farms/$farmId/sheep/")({
  validateSearch: (search: Record<string, unknown>): SheepSearch =>
    isStatusFilter(search.status) && search.status !== "active" ? { status: search.status } : {},
  component: SheepPage,
});

/**
 * The table «Бараны»: the Sheep of the Farm with one Status (Active by default) or all of them, and
 * the side panel that registers new ones. With Sheep selected, the actions of the header give way to
 * the bulk actions on them.
 */
function SheepPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const sheep = useSheepList(farmId);
  const error = useErrorMessage(sheep.error);
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);
  const [columnVisibility, setColumnVisibility] = useSheepColumns();
  const [selection, setSelection] = useState<ReadonlySet<SheepId>>(noSelection);
  // The Sheep of the move dialog stay as they were when it opened, also while it closes.
  const [moving, setMoving] = useState(false);
  const [movingIds, setMovingIds] = useState<readonly SheepId[]>([]);
  const [moveResult, setMoveResult] = useState<MoveResult | null>(null);
  // The Sheep of the dialog of the Status, as for the move.
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusIds, setStatusIds] = useState<readonly SheepId[]>([]);
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  // The Sheep of the dialog of a Sale, as for the move.
  const [selling, setSelling] = useState(false);
  const [sellingIds, setSellingIds] = useState<readonly SheepId[]>([]);
  const filter: StatusFilter = Route.useSearch().status ?? "active";
  const all = sheep.data;
  const shown = useMemo(
    () => (all === undefined ? undefined : filterByStatus(all, filter)),
    [all, filter],
  );
  useKeyShortcut("KeyN", () => setRegistering(true));
  useKeyShortcut("Escape", () => setSelection(noSelection));

  // A new selection starts a new bulk action: the result of the last one goes.
  const changeSelection = useCallback((next: ReadonlySet<SheepId>) => {
    setSelection(next);
    if (next.size > 0) {
      setMoveResult(null);
      setStatusResult(null);
    }
  }, []);

  // Another filter shows other Sheep: a selection of Sheep that it hides would act on them unseen.
  const changeFilter = (next: StatusFilter) => {
    setSelection(noSelection);
    void navigate({
      to: "/farms/$farmId/sheep",
      params: { farmId },
      search: next === "active" ? {} : { status: next },
      replace: true,
    });
  };

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
          {shown !== undefined && (
            <span className="text-base font-normal text-muted-foreground tabular-nums">
              {shown.length}
            </span>
          )}
        </h1>
        <p role="status" className="text-sm text-muted-foreground">
          {moveResult !== null && <MoveResultText result={moveResult} />}
          {statusResult !== null && <StatusResultText result={statusResult} />}
        </p>
        {selection.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              <SelectedCount count={selection.size} />
            </span>
            <Button
              variant="ghost"
              aria-keyshortcuts="Escape"
              onClick={() => setSelection(noSelection)}
            >
              <Trans>Снять выбор</Trans>
              <Kbd aria-hidden className="ml-1">
                Esc
              </Kbd>
            </Button>
            <Button
              onClick={() => {
                setMovingIds([...selection]);
                setMoving(true);
              }}
            >
              <Trans>Перевести в стадо</Trans>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStatusIds([...selection]);
                setChangingStatus(true);
              }}
            >
              <Trans>Сменить статус</Trans>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSellingIds([...selection]);
                setSelling(true);
              }}
            >
              <Trans>Продать</Trans>
            </Button>
          </div>
        ) : (
          hasSheep && (
            <div className="ml-auto flex items-center gap-2">
              <ColumnSettings visibility={columnVisibility} onChange={setColumnVisibility} />
              {addButton}
            </div>
          )
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
        <>
          {all !== undefined && (
            <StatusFilterToggle sheep={all} value={filter} onChange={changeFilter} />
          )}
          {shown?.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  <Trans>Нет баранов с этим статусом.</Trans>
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <SheepTable
              data={shown}
              columnVisibility={columnVisibility}
              onOpen={openCard}
              selection={selection}
              onSelectionChange={changeSelection}
            />
          )}
        </>
      )}
      <RegisterSheepSheet farm={farm} open={registering} onOpenChange={setRegistering} />
      <MoveSheepDialog
        farm={farm}
        sheepIds={movingIds}
        open={moving}
        onOpenChange={setMoving}
        onMoved={(result) => {
          setSelection(noSelection);
          setStatusResult(null);
          setMoveResult(result);
        }}
      />
      <ChangeStatusDialog
        farm={farm}
        sheepIds={statusIds}
        open={changingStatus}
        onOpenChange={setChangingStatus}
        onChanged={(result) => {
          setSelection(noSelection);
          setMoveResult(null);
          setStatusResult(result);
        }}
      />
      <SellSheepDialog
        farm={farm}
        sheepIds={sellingIds}
        open={selling}
        onOpenChange={setSelling}
        onSold={(dealId) =>
          void navigate({ to: "/farms/$farmId/deals/$dealId", params: { farmId, dealId } })
        }
      />
    </div>
  );
}

/** «Новый статус «Пал» у баранов: 3». */
function StatusResultText({ result }: { result: StatusResult }) {
  const { i18n } = useLingui();
  const status = i18n._(statusLabels[result.status]);
  const count = result.changed;
  return (
    <Trans>
      Новый статус «{status}» у баранов: {count}
    </Trans>
  );
}

/** «Выбрано: 5». */
function SelectedCount({ count }: { count: number }) {
  return <Trans>Выбрано: {count}</Trans>;
}

/** «Переведено баранов: 3 из 5. Остальные уже в этом стаде.» */
function MoveResultText({ result }: { result: MoveResult }) {
  const { moved, total } = result;
  if (moved === total) return <Trans>Переведено баранов: {moved}</Trans>;
  if (moved === 0) {
    return result.out ? (
      <Plural value={total} _1="Баран уже вне стада." other="Эти бараны уже вне стада." />
    ) : (
      <Plural value={total} _1="Баран уже в этом стаде." other="Эти бараны уже в этом стаде." />
    );
  }
  if (result.out) {
    return (
      <Trans>
        Переведено баранов: {moved} из {total}. Остальные уже вне стада.
      </Trans>
    );
  }
  return (
    <Trans>
      Переведено баранов: {moved} из {total}. Остальные уже в этом стаде.
    </Trans>
  );
}
