import type { FarmId, ResourceId, ResourceRow } from "@arashan/core";
import { useResources } from "@arashan/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  ArchiveToggle,
  DataCell,
  EmptyList,
  ErrorAlert,
  HeadCell,
  ListToolbar,
  NameWithState,
  SkeletonRows,
  tableClass,
  useOpenableRows,
} from "@/components/flocks/shared";
import { ResourceDialog } from "@/components/resources/resource-dialog";
import { Stock } from "@/components/resources/stock";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";

export const Route = createFileRoute("/farms/$farmId/resources/")({
  component: ResourcesPage,
});

/** The Resources of the Farm, such as hay and grain, with their Stock. A row opens the card. */
function ResourcesPage() {
  const farmId = Route.useParams().farmId as FarmId;
  const resources = useResources(farmId);
  const error = useErrorMessage(resources.error);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const open = (resourceId: ResourceId) =>
    void navigate({ to: "/farms/$farmId/resources/$resourceId", params: { farmId, resourceId } });
  const all = resources.data;
  const rows = all?.filter((resource) => showArchived || !resource.archived);
  const hasArchived = all?.some((resource) => resource.archived) ?? false;
  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Trans>Добавить ресурс</Trans>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Trans>Ресурсы</Trans>
      </h1>
      {error !== null ? (
        <ErrorAlert message={error} />
      ) : (
        <div className="flex flex-col gap-3">
          <ListToolbar
            start={
              hasArchived && (
                <ArchiveToggle pressed={showArchived} onPressedChange={setShowArchived} />
              )
            }
            end={rows !== undefined && rows.length > 0 && addButton}
          />
          {rows?.length === 0 ? (
            <EmptyList
              title={<Trans>Здесь будут корма и другие ресурсы: сено, зерно, комбикорм.</Trans>}
              action={addButton}
            />
          ) : (
            <ResourcesTable rows={rows} onOpen={open} />
          )}
        </div>
      )}
      <ResourceDialog farmId={farmId} open={creating} onOpenChange={setCreating} onCreated={open} />
    </div>
  );
}

function ResourcesTable({
  rows,
  onOpen,
}: {
  rows: ResourceRow[] | undefined;
  onOpen: (id: ResourceId) => void;
}) {
  const { t } = useLingui();
  const { bodyProps, rowProps } = useOpenableRows(
    (rows ?? []).map((resource) => resource.id),
    onOpen,
  );

  return (
    <Table aria-label={t`Ресурсы`} className={tableClass}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <HeadCell>
            <Trans>Название</Trans>
          </HeadCell>
          <HeadCell numeric>
            <Trans>Запас</Trans>
          </HeadCell>
        </TableRow>
      </TableHeader>
      <TableBody {...bodyProps}>
        {rows === undefined ? (
          <SkeletonRows columns={2} />
        ) : (
          rows.map((resource) => (
            <TableRow key={resource.id} {...rowProps(resource.id)}>
              <DataCell>
                <NameWithState
                  name={resource.name}
                  archived={resource.archived}
                  className="font-medium"
                />
              </DataCell>
              <DataCell numeric>
                <Stock quantity={resource.stock} unit={resource.unit} />
              </DataCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
