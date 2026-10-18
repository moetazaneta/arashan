import type { FarmId } from "@arashan/core";
import { useFarm } from "@arashan/client";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import { useEffect } from "react";

import { HomeLink } from "@/components/home-link";
import { Loading } from "@/components/loading";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useErrorMessage } from "@/errors";
import { rememberFarm, useViewer } from "@/viewer";

export const Route = createFileRoute("/farms/$farmId")({
  component: FarmLayout,
});

/** The pages of one Farm. They open only for a Member of it: the backend checks the Membership. */
function FarmLayout() {
  const farmId = Route.useParams().farmId as FarmId;
  const viewer = useViewer();
  const farm = useFarm(farmId);
  const errorMessage = useErrorMessage(farm.error);
  const loaded = farm.data !== undefined;

  useEffect(() => {
    if (loaded) rememberFarm(viewer, farmId);
  }, [loaded, viewer, farmId]);

  if (errorMessage !== null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{errorMessage}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <HomeLink />
        </EmptyContent>
      </Empty>
    );
  }
  if (!loaded) return <Loading />;
  return <Outlet />;
}
