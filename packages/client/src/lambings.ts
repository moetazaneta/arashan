import type { CalendarDate, FarmId, LambingInput, RecordedLambing, SheepId } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

// The hooks of Lambings: the form of a Lambing and the Lambings of an Ewe on her card.

/**
 * What the form of a Lambing gives by default for the Mother and the date: the Owner of the Lambs
 * and the Flock where they go. The query waits while the Mother or the date is not chosen.
 */
export function useLambingDefaults(
  farmId: FarmId,
  motherId: SheepId | null,
  date: CalendarDate | null,
) {
  return useQuery(
    convexQuery(
      api.lambings.defaults,
      motherId === null || date === null ? "skip" : { farmId, motherId, date },
    ),
  );
}

/** The Lambings of the Ewe, the newest first, with their Lambs and the Father. */
export function useLambings(farmId: FarmId, motherId: SheepId) {
  return useQuery(convexQuery(api.lambings.listOfMother, { farmId, motherId }));
}

/** A Member records a Lambing, and gets the ids of the Lambing and of its Lambs. */
export function useRecordLambing(farmId: FarmId) {
  const record = useConvexMutation(api.lambings.record);
  return useMutation({
    mutationFn: (input: LambingInput): Promise<RecordedLambing> =>
      callCommand(record, { farmId, ...input }),
  });
}
