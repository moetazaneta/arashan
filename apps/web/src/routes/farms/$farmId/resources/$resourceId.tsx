import type { FarmId, ResourceId } from "@arashan/core";
import { useFarm, useResource } from "@arashan/client";
import { Trans } from "@lingui/react/macro";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeftIcon, SearchXIcon } from "lucide-react";

import { ErrorAlert } from "@/components/flocks/shared";
import { Loading } from "@/components/loading";
import { ResourceCardView } from "@/components/resources/resource-card";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useErrorMessage } from "@/errors";

export const Route = createFileRoute("/farms/$farmId/resources/$resourceId")({
  component: ResourcePage,
});

/** The card of a Resource: its Stock and its events. */
function ResourcePage() {
  const { farmId, resourceId } = Route.useParams() as { farmId: FarmId; resourceId: ResourceId };
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const resource = useResource(farmId, resourceId);
  const error = useErrorMessage(resource.error);

  if (farm === undefined) return null;
  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/farms/$farmId/resources"
        params={{ farmId }}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2.5 w-fit" })}
      >
        <ChevronLeftIcon data-icon="inline-start" />
        <Trans>Ресурсы</Trans>
      </Link>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : resource.data === undefined ? (
        <Loading />
      ) : resource.data === null ? (
        <NoResource farmId={farmId} />
      ) : (
        <ResourceCardView farm={farm} resource={resource.data} />
      )}
    </div>
  );
}

/** A Resource that the Farm does not have. */
function NoResource({ farmId }: { farmId: FarmId }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Такого ресурса нет.</Trans>
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/farms/$farmId/resources" params={{ farmId }} className={buttonVariants()}>
          <Trans>К списку ресурсов</Trans>
        </Link>
      </EmptyContent>
    </Empty>
  );
}
