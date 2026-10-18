import { Trans } from "@lingui/react/macro";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { FenceIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { farmToOpen, useViewer } from "@/viewer";

export const Route = createFileRoute("/")({
  component: Home,
});

/** Opens the Farm that the User used last. A User who is a Member of no Farm sees only a message. */
function Home() {
  const farmId = farmToOpen(useViewer());
  if (farmId !== null) return <Navigate to="/farms/$farmId" params={{ farmId }} replace />;

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FenceIcon />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>У вас пока нет фермы</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Попросите администратора фермы прислать ссылку-приглашение.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
