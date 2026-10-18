import type {
  AssignmentDates,
  CalendarDate,
  FarmId,
  FlockId,
  FlockInput,
  LocationId,
  LocationInput,
  SheepId,
  ShepherdAssignmentId,
  ShepherdId,
  ShepherdInput,
} from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

// The hooks of Flocks, Locations and Shepherds, and of the moves of Sheep between Flocks. A list has
// the Archived records too, with the flag `archived`: a form leaves them out.

/** The Flocks of the Farm, by name, with their Location, Shepherds and head count. */
export function useFlocks(farmId: FarmId) {
  return useQuery(convexQuery(api.flocks.list, { farmId }));
}

/** The card of a Flock, or null if the Farm has no such Flock. */
export function useFlock(farmId: FarmId, flockId: FlockId) {
  return useQuery(convexQuery(api.flocks.get, { farmId, flockId }));
}

/** The Locations of the Farm, by name, with the Flocks that stay there. */
export function useLocations(farmId: FarmId) {
  return useQuery(convexQuery(api.locations.list, { farmId }));
}

/** The Shepherds of the Farm, by name, with the Flocks that they herd now. */
export function useShepherds(farmId: FarmId) {
  return useQuery(convexQuery(api.shepherds.list, { farmId }));
}

/** Who was responsible for the Sheep on the date: the Flocks that had it and their Shepherds. */
export function useSheepResponsible(farmId: FarmId, sheepId: SheepId, date: CalendarDate) {
  return useQuery(convexQuery(api.flocks.responsible, { farmId, sheepId, date }));
}

/** A Member makes a Flock, and gets its id. */
export function useCreateFlock(farmId: FarmId) {
  const create = useConvexMutation(api.flocks.create);
  return useMutation({
    mutationFn: async (input: FlockInput) =>
      (await callCommand(create, { farmId, ...input })) as FlockId,
  });
}

/** A Member changes the name or the Location of a Flock. */
export function useUpdateFlock(farmId: FarmId) {
  const update = useConvexMutation(api.flocks.update);
  return useMutation({
    mutationFn: (input: FlockInput & { flockId: FlockId }) =>
      callCommand(update, { farmId, ...input }),
  });
}

/** A Member archives a Flock with no Sheep. Its open assignments end on the date. */
export function useArchiveFlock(farmId: FarmId) {
  const archive = useConvexMutation(api.flocks.archive);
  return useMutation({
    mutationFn: (input: { flockId: FlockId; date: CalendarDate }) =>
      callCommand(archive, { farmId, ...input }),
  });
}

/** A Member takes a Flock out of the archive. */
export function useUnarchiveFlock(farmId: FarmId) {
  const unarchive = useConvexMutation(api.flocks.unarchive);
  return useMutation({
    mutationFn: (flockId: FlockId) => callCommand(unarchive, { farmId, flockId }),
  });
}

/** A Member assigns a Shepherd to a Flock, from a date and to a date or to now. */
export function useAssignShepherd(farmId: FarmId) {
  const assign = useConvexMutation(api.flocks.assignShepherd);
  return useMutation({
    mutationFn: async (input: AssignmentDates & { flockId: FlockId; shepherdId: ShepherdId }) =>
      (await callCommand(assign, { farmId, ...input })) as ShepherdAssignmentId,
  });
}

/** A Member changes the dates of an assignment, for example to end it. */
export function useUpdateShepherdAssignment(farmId: FarmId) {
  const update = useConvexMutation(api.flocks.updateAssignment);
  return useMutation({
    mutationFn: (input: AssignmentDates & { assignmentId: ShepherdAssignmentId }) =>
      callCommand(update, { farmId, ...input }),
  });
}

/** A Member removes an assignment made by mistake. */
export function useRemoveShepherdAssignment(farmId: FarmId) {
  const remove = useConvexMutation(api.flocks.removeAssignment);
  return useMutation({
    mutationFn: (assignmentId: ShepherdAssignmentId) =>
      callCommand(remove, { farmId, assignmentId }),
  });
}

/**
 * A Member moves Sheep into a Flock, or out of all Flocks (`flockId` null), on a date, in one
 * command. Gives the number of Sheep that moved.
 */
export function useMoveSheep(farmId: FarmId) {
  const move = useConvexMutation(api.flocks.moveSheep);
  return useMutation({
    mutationFn: (input: {
      sheepIds: readonly SheepId[];
      flockId: FlockId | null;
      date: CalendarDate;
    }) => callCommand(move, { farmId, ...input, sheepIds: [...input.sheepIds] }),
  });
}

/** A Member undoes the last move of a Sheep. */
export function useUndoFlockMove(farmId: FarmId) {
  const undo = useConvexMutation(api.flocks.undoMove);
  return useMutation({
    mutationFn: (sheepId: SheepId) => callCommand(undo, { farmId, sheepId }),
  });
}

/** A Member makes a Location, and gets its id. */
export function useCreateLocation(farmId: FarmId) {
  const create = useConvexMutation(api.locations.create);
  return useMutation({
    mutationFn: async (input: LocationInput) =>
      (await callCommand(create, { farmId, ...input })) as LocationId,
  });
}

/** A Member changes the name or the notes of a Location. */
export function useUpdateLocation(farmId: FarmId) {
  const update = useConvexMutation(api.locations.update);
  return useMutation({
    mutationFn: (input: LocationInput & { locationId: LocationId }) =>
      callCommand(update, { farmId, ...input }),
  });
}

/** A Member archives a Location that no Flock uses now. */
export function useArchiveLocation(farmId: FarmId) {
  const archive = useConvexMutation(api.locations.archive);
  return useMutation({
    mutationFn: (locationId: LocationId) => callCommand(archive, { farmId, locationId }),
  });
}

/** A Member takes a Location out of the archive. */
export function useUnarchiveLocation(farmId: FarmId) {
  const unarchive = useConvexMutation(api.locations.unarchive);
  return useMutation({
    mutationFn: (locationId: LocationId) => callCommand(unarchive, { farmId, locationId }),
  });
}

/** A Member adds a Shepherd, and gets the id. */
export function useCreateShepherd(farmId: FarmId) {
  const create = useConvexMutation(api.shepherds.create);
  return useMutation({
    mutationFn: async (input: ShepherdInput) =>
      (await callCommand(create, { farmId, ...input })) as ShepherdId,
  });
}

/** A Member changes the name, the phone or the notes of a Shepherd. */
export function useUpdateShepherd(farmId: FarmId) {
  const update = useConvexMutation(api.shepherds.update);
  return useMutation({
    mutationFn: (input: ShepherdInput & { shepherdId: ShepherdId }) =>
      callCommand(update, { farmId, ...input }),
  });
}

/** A Member archives a Shepherd. The Shepherd's open assignments end on the date. */
export function useArchiveShepherd(farmId: FarmId) {
  const archive = useConvexMutation(api.shepherds.archive);
  return useMutation({
    mutationFn: (input: { shepherdId: ShepherdId; date: CalendarDate }) =>
      callCommand(archive, { farmId, ...input }),
  });
}

/** A Member takes a Shepherd out of the archive. */
export function useUnarchiveShepherd(farmId: FarmId) {
  const unarchive = useConvexMutation(api.shepherds.unarchive);
  return useMutation({
    mutationFn: (shepherdId: ShepherdId) => callCommand(unarchive, { farmId, shepherdId }),
  });
}
