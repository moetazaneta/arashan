import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import { type CalendarDate, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import { flockAt } from "../flocks/flock";
import type { FlockRef } from "../flocks/queries";
import type { LambingId, MembershipId, SheepId } from "../ids";
import { cachedLookup } from "../pedigree/pedigree";
import type { SheepRef } from "../sheep/queries";
import type { Sheep } from "../sheep/sheep";
import { ownerAt } from "./lambing";

// The queries of Lambings: what the form of a Lambing gives by default, and the Lambings of an Ewe
// on her card.

/** What the form of a Lambing gives by default for a Mother and a date. */
export interface LambingDefaults {
  /**
   * The Owner of the Mother on the date: the default Owner of each Lamb. Null if that Member is not a
   * Member of the Farm now, so the form asks for another one.
   */
  ownerId: MembershipId | null;
  /** The Flock that had the Mother at the end of the date, where the Lambs go, or null. */
  flock: FlockRef | null;
}

/** A Lambing as the card of the Mother shows it. */
export interface LambingRow {
  id: LambingId;
  date: CalendarDate;
  father: SheepRef | null;
  /** The live Lambs that are not Deleted, in the order of the form. */
  lambs: SheepRef[];
  stillborn: number;
  recordedAt: number;
}

/**
 * The defaults of the form of a Lambing for the Mother and the date, as `recordLambing` computes
 * them. Null if the Farm has no such Sheep or it is an External Sheep. The date is a real date
 * (`lambing.dateInvalid`).
 */
export async function getLambingDefaults(
  ctx: FarmQueryContext,
  input: { motherId: SheepId; date: CalendarDate },
): Promise<LambingDefaults | null> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  if (!isCalendarDate(input.date)) throw new DomainError("lambing.dateInvalid");
  const mother = await ctx.repos.sheep.get(input.motherId);
  if (mother === null || mother.origin === "external") return null;
  const [changes, moves] = await Promise.all([
    ctx.repos.sheep.ownerChanges(mother.id),
    ctx.repos.sheep.flockMoves(mother.id),
  ]);
  const ownerId = ownerAt(mother, changes, input.date);
  const membership = ownerId === null ? null : await ctx.repos.memberships.get(ownerId);
  const flockId = flockAt(moves, input.date);
  const flock = flockId === null ? null : await ctx.repos.flocks.get(flockId);
  return {
    ownerId: membership === null || membership.archivedAt !== undefined ? null : membership.id,
    flock:
      flock === null
        ? null
        : { id: flock.id, name: flock.name, archived: flock.archivedAt !== null },
  };
}

/** The Lambings of the Ewe, the newest first. */
export async function listLambings(
  ctx: FarmQueryContext,
  input: { motherId: SheepId },
): Promise<LambingRow[]> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const lookup = cachedLookup((id) => ctx.repos.sheep.get(id));
  const ref = async (id: SheepId | null): Promise<SheepRef | null> => {
    const sheep = id === null ? null : await lookup(id);
    return sheep === null ? null : toRef(sheep);
  };
  const lambings = await ctx.repos.lambings.listOfMother(input.motherId);
  const rows = await Promise.all(
    lambings.map(async (lambing) => ({
      id: lambing.id,
      date: lambing.date,
      father: await ref(lambing.fatherId),
      // A Lamb that got another Mother or birth date later (`updateSheep`) is no longer of this Lambing.
      lambs: (await Promise.all(lambing.lambIds.map(lookup)))
        .filter(
          (lamb): lamb is Sheep =>
            lamb !== null && lamb.motherId === lambing.motherId && lamb.birthDate === lambing.date,
        )
        .map(toRef),
      stillborn: lambing.stillborn,
      recordedAt: lambing.recordedAt,
    })),
  );
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt - a.recordedAt);
}

function toRef(sheep: Sheep): SheepRef {
  return { id: sheep.id, tag: sheep.tag, name: sheep.name, sex: sheep.sex, origin: sheep.origin };
}
