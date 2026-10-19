import { useFarm, useTrash } from "@arashan/client";
import type { FarmId } from "@arashan/core";
import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";

import { ErrorAlert } from "@/components/flocks/shared";
import { TrashTable } from "@/components/trash/trash-table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useErrorMessage } from "@/errors";

export const Route = createFileRoute("/farms/$farmId/trash")({
  component: TrashPage,
});

/**
 * The page «Корзина»: the Deleted records of the Farm, of all kinds (ADR 0005). A Member restores a
 * record that someone deleted by mistake, and it comes back as it was. A restore destroys nothing,
 * so it asks for no confirmation.
 */
function TrashPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const trash = useTrash(farmId);
  const error = useErrorMessage(trash.error);

  if (farm === undefined) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          <Trans>Корзина</Trans>
        </h1>
        <p className="text-muted-foreground">
          <Trans>Удалённые записи фермы. Восстановите запись, и она вернётся на своё место.</Trans>
        </p>
      </div>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : trash.data?.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle>
              <Trans>Корзина пуста</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Здесь будут удалённые записи: бараны, сделки, расходы и другие.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TrashTable farm={farm} items={trash.data} />
      )}
    </div>
  );
}
