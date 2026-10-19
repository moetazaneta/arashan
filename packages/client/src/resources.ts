import type {
  CalendarDate,
  FarmId,
  FlockId,
  Norms,
  ResourceEventId,
  ResourceId,
  ResourceInput,
} from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

// The hooks of the Resources and of their events. A quantity is an integer of thousandths of the unit
// of the Resource, and a price an integer of hundredths of the currency unit of the Farm.

/** The Resources of the Farm with their Stock, by name, also the Archived ones. */
export function useResources(farmId: FarmId) {
  return useQuery(convexQuery(api.resources.list, { farmId }));
}

/** The card of a Resource with its events, or null if the Farm has no such Resource. */
export function useResource(farmId: FarmId, resourceId: ResourceId) {
  return useQuery(convexQuery(api.resources.get, { farmId, resourceId }));
}

/** A Member adds a Resource, and gets its id. */
export function useCreateResource(farmId: FarmId) {
  const create = useConvexMutation(api.resources.create);
  return useMutation({
    mutationFn: async (input: ResourceInput) =>
      (await callCommand(create, { farmId, ...input })) as ResourceId,
  });
}

/** A Member changes the name or the unit of a Resource. */
export function useUpdateResource(farmId: FarmId) {
  const update = useConvexMutation(api.resources.update);
  return useMutation({
    mutationFn: (input: ResourceInput & { resourceId: ResourceId }) =>
      callCommand(update, { farmId, ...input }),
  });
}

/** A Member archives a Resource. */
export function useArchiveResource(farmId: FarmId) {
  const archive = useConvexMutation(api.resources.archive);
  return useMutation({
    mutationFn: (resourceId: ResourceId) => callCommand(archive, { farmId, resourceId }),
  });
}

/** A Member takes a Resource out of the archive. */
export function useUnarchiveResource(farmId: FarmId) {
  const unarchive = useConvexMutation(api.resources.unarchive);
  return useMutation({
    mutationFn: (resourceId: ResourceId) => callCommand(unarchive, { farmId, resourceId }),
  });
}

/** A Member records a Restock. A price makes an Automatic Expense. */
export function useRecordRestock(farmId: FarmId) {
  const restock = useConvexMutation(api.resources.restock);
  return useMutation({
    mutationFn: async (input: {
      resourceId: ResourceId;
      date: CalendarDate;
      quantity: number;
      price: number | null;
    }) => (await callCommand(restock, { farmId, ...input })) as ResourceEventId,
  });
}

/** A Member records a Usage of a Resource by a Flock. */
export function useRecordUsage(farmId: FarmId) {
  const use = useConvexMutation(api.resources.use);
  return useMutation({
    mutationFn: async (input: {
      resourceId: ResourceId;
      date: CalendarDate;
      quantity: number;
      flockId: FlockId;
    }) => (await callCommand(use, { farmId, ...input })) as ResourceEventId,
  });
}

/** A Member records an Adjustment: the quantity that a count found on the date, and why. */
export function useRecordAdjustment(farmId: FarmId) {
  const adjust = useConvexMutation(api.resources.adjust);
  return useMutation({
    mutationFn: async (input: {
      resourceId: ResourceId;
      date: CalendarDate;
      counted: number;
      reason: string;
    }) => (await callCommand(adjust, { farmId, ...input })) as ResourceEventId,
  });
}

/** A Member cancels an event made by mistake. */
export function useCancelResourceEvent(farmId: FarmId) {
  const cancel = useConvexMutation(api.resources.cancelEvent);
  return useMutation({
    mutationFn: (eventId: ResourceEventId) => callCommand(cancel, { farmId, eventId }),
  });
}

/** The quantity suggested for a Usage of the Flock on the date. */
export function useUsageSuggestion(
  farmId: FarmId,
  input: { resourceId: ResourceId; flockId: FlockId; date: CalendarDate } | null,
) {
  return useQuery(
    convexQuery(api.resources.suggestUsage, input === null ? "skip" : { farmId, ...input }),
  );
}

/** How long the Stock lasts for the Farm and for each Flock, with the groups on the date. */
export function useStockForecast(farmId: FarmId, date: CalendarDate | undefined) {
  return useQuery(
    convexQuery(api.resources.forecast, date === undefined ? "skip" : { farmId, date }),
  );
}

/** A Member changes the Norms of a Resource without changing its Stock. */
export function useSetResourceNorms(farmId: FarmId) {
  const setNorms = useConvexMutation(api.resources.setNorms);
  return useMutation({
    mutationFn: (input: { resourceId: ResourceId; norms: Norms }) =>
      callCommand(setNorms, { farmId, ...input }),
  });
}
