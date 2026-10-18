import { useSheepHistory } from "@arashan/client";
import type { Farm, SheepId } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";

import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorMessage } from "@/errors";
import { formatDateTime } from "@/format";

import { commandLabels } from "./labels";

/** The tab «История»: who changed the Sheep and when, the newest first. */
export function SheepHistory({ farm, sheepId }: { farm: Farm; sheepId: SheepId }) {
  const { i18n } = useLingui();
  const history = useSheepHistory(farm.id, sheepId);
  const error = useErrorMessage(history.error);

  if (error !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (history.data === undefined) return <Loading />;

  return (
    <Table className="text-[13px] tabular-nums">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-9 w-44 text-xs text-muted-foreground">
            <Trans>Когда</Trans>
          </TableHead>
          <TableHead className="h-9 w-48 text-xs text-muted-foreground">
            <Trans>Кто</Trans>
          </TableHead>
          <TableHead className="h-9 text-xs text-muted-foreground">
            <Trans>Что</Trans>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.data.map((entry, index) => (
          <TableRow key={`${entry.at} ${index}`} className="h-9">
            <TableCell className="py-0">
              {formatDateTime(entry.at, farm.timeZone, i18n.locale)}
            </TableCell>
            <TableCell className="py-0">
              {entry.actor === null ? (
                <span className="text-muted-foreground">
                  <Trans>Система</Trans>
                </span>
              ) : (
                entry.actor.name
              )}
            </TableCell>
            <TableCell className="py-0">{i18n._(commandLabels[entry.command])}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
