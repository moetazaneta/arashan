import { useFlocks } from "@arashan/client";
import type { Farm, FlockRow } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorMessage } from "@/errors";

import { FlockDialog } from "./flock-dialog";
import {
  ArchiveToggle,
  DataCell,
  EmptyList,
  ErrorAlert,
  HeadCell,
  linkRowProps,
  ListToolbar,
  NameWithState,
  Names,
  NoValue,
  SkeletonRows,
  tableClass,
} from "./shared";

/** The tab «Стада»: the Flocks of the Farm, and the dialog that makes one. */
export function FlocksTab({
  farm,
  showArchived,
  onShowArchivedChange,
}: {
  farm: Farm;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
}) {
  const flocks = useFlocks(farm.id);
  const error = useErrorMessage(flocks.error);
  const [creating, setCreating] = useState(false);

  if (error !== null) return <ErrorAlert message={error} />;
  const all = flocks.data;
  const rows = all?.filter((flock) => showArchived || !flock.archived);
  const hasArchived = all?.some((flock) => flock.archived) ?? false;
  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Trans>Создать стадо</Trans>
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        start={
          hasArchived && (
            <ArchiveToggle pressed={showArchived} onPressedChange={onShowArchivedChange} />
          )
        }
        end={rows !== undefined && rows.length > 0 && addButton}
      />
      {rows?.length === 0 ? (
        <EmptyList title={<Trans>Здесь будут стада фермы.</Trans>} action={addButton} />
      ) : (
        <FlocksTable farm={farm} rows={rows} />
      )}
      <FlockDialog farm={farm} open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function FlocksTable({ farm, rows }: { farm: Farm; rows: FlockRow[] | undefined }) {
  const { t } = useLingui();
  const navigate = useNavigate();

  return (
    <Table aria-label={t`Стада`} className={tableClass}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <HeadCell>
            <Trans>Название</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Место</Trans>
          </HeadCell>
          <HeadCell>
            <Trans>Чабаны</Trans>
          </HeadCell>
          <HeadCell numeric>
            <Trans>Голов</Trans>
          </HeadCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows === undefined ? (
          <SkeletonRows columns={4} />
        ) : (
          rows.map((flock) => (
            <TableRow
              key={flock.id}
              {...linkRowProps(
                () =>
                  void navigate({
                    to: "/farms/$farmId/flocks/$flockId",
                    params: { farmId: farm.id, flockId: flock.id },
                  }),
              )}
            >
              <DataCell>
                <NameWithState
                  archived={flock.archived}
                  name={
                    <Link
                      to="/farms/$farmId/flocks/$flockId"
                      params={{ farmId: farm.id, flockId: flock.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {flock.name}
                    </Link>
                  }
                />
              </DataCell>
              <DataCell>{flock.location === null ? <NoValue /> : flock.location.name}</DataCell>
              <DataCell>
                <Names refs={flock.shepherds} />
              </DataCell>
              <DataCell numeric>{flock.sheepCount}</DataCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
