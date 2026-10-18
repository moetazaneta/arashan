import type {
  CalendarDate,
  FarmId,
  MembershipId,
  SheepCard,
  SheepId,
  SheepRegistration,
  SheepRow,
  SheepUpdate,
} from "@arashan/core";
import { dateAt, withLamb } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { callCommand } from "./errors";
import { useFarm } from "./farms";

/** A Sheep of the table «Бараны», with the flag Lamb for today. */
export type SheepListItem = SheepRow & { lamb: boolean };

/** The card of a Sheep, with the flag Lamb for today. */
export type SheepCardData = SheepCard & { lamb: boolean };

/** How often a page that stays open checks whether the day changed. */
const dayCheckMs = 60_000;

/**
 * Today in the time zone, or undefined while the time zone is not known. The value changes when the
 * day changes there, also on a page that stays open overnight: the hook checks the date each minute
 * and when the window gets the focus. A check on the same day renders nothing again.
 */
function useToday(timeZone: string | undefined): CalendarDate | undefined {
  const [today, setToday] = useState(() =>
    timeZone === undefined ? undefined : dateAt(Date.now(), timeZone),
  );
  useEffect(() => {
    const check = () => setToday(timeZone === undefined ? undefined : dateAt(Date.now(), timeZone));
    check();
    const timer = setInterval(check, dayCheckMs);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeZone]);
  return today;
}

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

/** A Member registers a Sheep, and gets its id. */
export function useRegisterSheep(farmId: FarmId) {
  const register = useConvexMutation(api.sheep.register);
  return useMutation({
    mutationFn: (input: SheepRegistration) => callCommand(register, { farmId, ...input }),
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
