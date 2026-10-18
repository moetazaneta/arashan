import type { FarmId, FlockId } from "@arashan/core";
import { useFarm, useFlock } from "@arashan/client";
import { Trans } from "@lingui/react/macro";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeftIcon, SearchXIcon } from "lucide-react";

import { FlockCardView } from "@/components/flocks/flock-card";
import { ErrorAlert } from "@/components/flocks/shared";
import { Loading } from "@/components/loading";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useErrorMessage } from "@/errors";

export const Route = createFileRoute("/farms/$farmId/flocks/$flockId")({
  component: FlockPage,
});

/** The card of a Flock: its Location, its Shepherds and its Sheep. */
function FlockPage() {
  const { farmId, flockId } = Route.useParams() as { farmId: FarmId; flockId: FlockId };
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const flock = useFlock(farmId, flockId);
  const error = useErrorMessage(flock.error);

  if (farm === undefined) return null;
  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/farms/$farmId/flocks"
        params={{ farmId }}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2.5 w-fit" })}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        <Trans>Стада</Trans>
      </Link>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : flock.data === undefined ? (
        <Loading />
      ) : flock.data === null ? (
        <NoFlock farmId={farmId} />
      ) : (
        <FlockCardView farm={farm} flock={flock.data} />
      )}
    </div>
  );
}

/** A Flock that the Farm does not have. */
function NoFlock({ farmId }: { farmId: FarmId }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Такого стада нет.</Trans>
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/farms/$farmId/flocks" params={{ farmId }} className={buttonVariants()}>
          <Trans>К списку стад</Trans>
        </Link>
      </EmptyContent>
    </Empty>
  );
}
