import type { CalendarDate } from "../dates";
import type { Flock } from "../flocks/flock";
import { type FlockRef, flockRefOf } from "../flocks/queries";
import type { FlockId, ResourceEventId, ResourceId } from "../ids";
import type { TrashType } from "../trash/trash";
import { restoreResourceEvent } from "./commands";
import type { Resource, ResourceEventKind } from "./resource";

/** A cancelled Restock, Usage or Adjustment as the Trash shows it. */
export interface TrashResourceEvent {
  kind: ResourceEventKind;
  date: CalendarDate;
  /** In thousandths of the unit: the counted quantity for an Adjustment. */
  quantity: number;
  resource: { id: ResourceId; name: string; unit: string; archived: boolean };
  /** The Flock of a Usage, or null. */
  flock: FlockRef | null;
}

/** The cancelled events of the Resources. A Restock comes back with its Automatic Expense. */
export const resourceEventTrash: TrashType<"resourceEvent", TrashResourceEvent> = {
  async list(ctx) {
    const events = await ctx.repos.resources.listDeletedEvents();
    if (events.length === 0) return [];
    const resources = new Map<ResourceId, Resource>();
    for (const resource of await ctx.repos.resources.list()) resources.set(resource.id, resource);
    const flocks = new Map<FlockId, Flock>();
    for (const flock of await ctx.repos.flocks.list()) flocks.set(flock.id, flock);
    return events.map((event) => {
      const resource = resources.get(event.resourceId);
      return {
        kind: "resourceEvent",
        id: event.id,
        deletedAt: event.deletedAt,
        record: {
          kind: event.kind,
          date: event.date,
          quantity: event.quantity,
          // Nothing deletes a Resource, so this is only a guard.
          resource: {
            id: event.resourceId,
            name: resource?.name ?? "",
            unit: resource?.unit ?? "",
            archived: resource !== undefined && resource.archivedAt !== null,
          },
          flock: event.flockId === null ? null : flockRefOf(flocks, event.flockId),
        },
      };
    });
  },
  restore: (ctx, id) => restoreResourceEvent(ctx, id as ResourceEventId),
};
