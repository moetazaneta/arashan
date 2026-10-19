import type {
  CalendarDate,
  ExitInput,
  ExternalSheepRegistration,
  FarmId,
  FileId,
  MembershipId,
  SheepCard,
  SheepId,
  SheepRegistration,
  SheepRow,
  SheepUpdate,
} from "@arashan/core";
import { withLamb } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { callCommand } from "./errors";
import { useToday } from "./dates";
import { useFarm } from "./farms";

/** A Sheep of the table «Бараны», with the flag Lamb for today. */
export type SheepListItem = SheepRow & { lamb: boolean };

/** The card of a Sheep, with the flag Lamb for today. */
export type SheepCardData = SheepCard & { lamb: boolean };

/**
 * The Sheep of the Farm for the table, by Tag, with the flag Lamb. The backend does not compute the
 * flag, because it changes with the day (see `withLamb` in the core). The list keeps the same
 * reference until its data, the Farm or the day changes, so a table does not rebuild on each render.
 */
export function useSheepList(farmId: FarmId) {
  const farm = useFarm(farmId);
  const list = useQuery(convexQuery(api.sheep.list, { farmId }));
  const farmData = farm.data;
  const today = useToday(farmData?.timeZone);
  const rows = list.data;
  const data = useMemo(
    (): SheepListItem[] | undefined =>
      rows === undefined || farmData === undefined || today === undefined
        ? undefined
        : withLamb(rows, farmData, today),
    [rows, farmData, today],
  );
  const error = list.error ?? farm.error;
  return { data, error, isPending: data === undefined && error === null };
}

/**
 * The card of a Sheep, with the flag Lamb, or null if the Farm has no such Sheep or it is Deleted.
 */
export function useSheep(farmId: FarmId, sheepId: SheepId) {
  const farm = useFarm(farmId);
  const card = useQuery(convexQuery(api.sheep.get, { farmId, sheepId }));
  const farmData = farm.data;
  const today = useToday(farmData?.timeZone);
  const sheep = card.data;
  const data = useMemo((): SheepCardData | null | undefined => {
    if (sheep === undefined || farmData === undefined || today === undefined) return undefined;
    if (sheep === null) return null;
    return withLamb([sheep], farmData, today)[0] ?? null;
  }, [sheep, farmData, today]);
  const error = card.error ?? farm.error;
  return { data, error, isPending: data === undefined && error === null };
}

/** The audit entries of a Sheep, the newest first: who changed it and when. */
export function useSheepHistory(farmId: FarmId, sheepId: SheepId) {
  return useQuery(convexQuery(api.sheep.history, { farmId, sheepId }));
}

/** The Members who can own a Sheep now, by username. `isMe` marks the User. */
export function useSheepOwners(farmId: FarmId) {
  return useQuery(convexQuery(api.sheep.owners, { farmId }));
}

/**
 * The Sheep that can be a parent in a form, by Tag: also the External ones and the ones that are not
 * Active, each with its Breed composition. The form filters them by sex.
 */
export function useParentOptions(farmId: FarmId) {
  return useQuery(convexQuery(api.sheep.parentOptions, { farmId }));
}

/**
 * The pedigree tree of a Sheep, for `pedigreeDepth` generations, or null if the Farm has no such
 * Sheep or it is Deleted.
 */
export function useSheepPedigree(farmId: FarmId, sheepId: SheepId) {
  return useQuery(convexQuery(api.sheep.pedigree, { farmId, sheepId }));
}

/** A Member registers a Sheep, and gets its id. */
export function useRegisterSheep(farmId: FarmId) {
  const register = useConvexMutation(api.sheep.register);
  return useMutation({
    mutationFn: (input: SheepRegistration) => callCommand(register, { farmId, ...input }),
  });
}

/** A Member registers an External Sheep: a parent that was never on the Farm. It gets its id. */
export function useRegisterExternalSheep(farmId: FarmId) {
  const register = useConvexMutation(api.sheep.registerExternal);
  return useMutation({
    mutationFn: (input: ExternalSheepRegistration) => callCommand(register, { farmId, ...input }),
  });
}

/** A Member changes the fields of a Sheep. */
export function useUpdateSheep(farmId: FarmId) {
  const update = useConvexMutation(api.sheep.update);
  return useMutation({
    mutationFn: (input: SheepUpdate) => callCommand(update, { farmId, ...input }),
  });
}

/** A Member gives a Sheep to another Owner, on a date. */
export function useChangeSheepOwner(farmId: FarmId) {
  const changeOwner = useConvexMutation(api.sheep.changeOwner);
  return useMutation({
    mutationFn: (input: { sheepId: SheepId; ownerId: MembershipId; date: CalendarDate }) =>
      callCommand(changeOwner, { farmId, ...input }),
  });
}

/** A Member deletes a Sheep registered by mistake. The Sheep becomes Deleted, not erased. */
export function useDeleteSheep(farmId: FarmId) {
  const markDeleted = useConvexMutation(api.sheep.markDeleted);
  return useMutation({
    mutationFn: (sheepId: SheepId) => callCommand(markDeleted, { farmId, sheepId }),
  });
}

/**
 * A Member changes the Status of one Sheep or many Active Sheep to Slaughtered, Dead or Lost, and
 * gets the number of Sheep. The Sheep leave their Flocks on the date.
 */
export function useChangeSheepStatus(farmId: FarmId) {
  const changeStatus = useConvexMutation(api.sheep.changeStatus);
  return useMutation({
    mutationFn: (input: ExitInput & { sheepIds: readonly SheepId[] }) =>
      callCommand(changeStatus, { farmId, ...input, sheepIds: [...input.sheepIds] }),
  });
}

/** A Member records that a Lost Sheep came back on a date. */
export function useMarkSheepFound(farmId: FarmId) {
  const markFound = useConvexMutation(api.sheep.markFound);
  return useMutation({
    mutationFn: (input: { sheepId: SheepId; date: CalendarDate; reason: string | null }) =>
      callCommand(markFound, { farmId, ...input }),
  });
}

/** A Member undoes the last change of the Status of a Sheep, made by mistake. */
export function useUndoSheepStatusChange(farmId: FarmId) {
  const undo = useConvexMutation(api.sheep.undoStatusChange);
  return useMutation({
    mutationFn: (sheepId: SheepId) => callCommand(undo, { farmId, sheepId }),
  });
}

/**
 * A Member uploads the scan of a Passport, and gets the id of the file, which the form then sends
 * with the Passport. The backend gives a URL for one upload; the file goes there straight from the
 * browser. An upload that fails throws an Error, not a domain error.
 */
export function useUploadPassportScan(farmId: FarmId) {
  const uploadUrl = useConvexMutation(api.sheep.passportUploadUrl);
  return useMutation({
    mutationFn: async (file: File): Promise<FileId> => {
      const url = await callCommand(uploadUrl, { farmId });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`The upload of the scan failed: ${response.status}`);
      const { storageId } = (await response.json()) as { storageId: string };
      return storageId as FileId;
    },
  });
}
