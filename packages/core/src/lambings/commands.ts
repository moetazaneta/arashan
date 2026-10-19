import { authorize } from "../access/permissions";
import { recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import { recordFlockMove } from "../flocks/commands";
import { flockAt } from "../flocks/flock";
import type { FlockId, LambingId, MembershipId, SheepId } from "../ids";
import { cachedLookup, requireParents } from "../pedigree/pedigree";
import { requireFreeTag, requireOwner } from "../sheep/commands";
import { maxTagLength, type Sex, type Sheep, type SheepFields, tagKey } from "../sheep/sheep";
import { maxLambs, maxStillborn, ownerAt } from "./lambing";

// The command of a Lambing: one form registers all live Lambs of an Ewe at once. It checks the
// permission and all the rules before the first write, so a Lambing with one wrong Lamb writes
// nothing. It appends one audit entry for each Lamb and one for the Lambing.

/** One live Lamb in the form of a Lambing. */
export interface LambInput {
  sex: Sex;
  /** The Tag, or null if the Lamb has no Tag yet. An empty text is no Tag. */
  tag: string | null;
  /** The Owner, or null for the default: the Owner of the Mother on the date of the Lambing. */
  ownerId: MembershipId | null;
}

/** The form of a Lambing. */
export interface LambingInput {
  motherId: SheepId;
  /** The Father, also an External Sheep, or null if nobody knows him. */
  fatherId: SheepId | null;
  date: CalendarDate;
  /** The live Lambs: from 1 to `maxLambs`. */
  lambs: LambInput[];
  /** How many Lambs were born dead: from 0 to `maxStillborn`. They do not become Sheep. */
  stillborn: number;
}

/** The new Lambing and its Lambs, in the order of the form. */
export interface RecordedLambing {
  lambingId: LambingId;
  lambIds: SheepId[];
}

/**
 * A Member records a Lambing. Each live Lamb becomes a Sheep: Origin Born, Active, born on the date
 * of the Lambing, with the Mother and the Father as its parents, so its Breed composition comes from
 * them (ADR 0007). The rules:
 *
 * - The date is a real date and not in the future (`lambing.dateInvalid`), and after the birth date
 *   of each parent (`pedigree.parentBornAfterChild`).
 * - The Mother is an Ewe of the Farm (not an External Sheep: `lambing.motherExternal`) that is
 *   Active now (`lambing.motherNotActive`). The Lambs join the Farm now, so they need an Owner who is
 *   a Member now and a Flock that is in use now.
 * - The Father is optional. He is a Ram of the Farm or an External one, of any Status.
 * - The Owner of a Lamb is the Owner of the Mother on the date (`ownerAt`), unless the form gives
 *   another Member.
 * - Each Lamb goes into the Flock that had the Mother at the end of the date (`flockAt`), with a
 *   move on that date. Later moves of the Mother do not move the Lambs. If that Flock is Archived
 *   now, the command fails (`lambing.flockArchived`): an Archived Flock has no Sheep.
 * - The Tags are optional, unique in the Farm (`sheep.tagTaken`) and in the Lambing
 *   (`lambing.tagRepeated`).
 * - The stillborn Lambs are only a number on the Lambing.
 */
export async function recordLambing(
  ctx: FarmCommandContext,
  input: LambingInput,
): Promise<RecordedLambing> {
  authorize(ctx.member, "lambing.record", { farmId: ctx.farm.id });
  const date = input.date;
  if (!isCalendarDate(date) || date > dateAt(ctx.now(), ctx.farm.timeZone)) {
    throw new DomainError("lambing.dateInvalid");
  }
  if (input.lambs.length === 0) throw new DomainError("lambing.lambsRequired");
  if (input.lambs.length > maxLambs) throw new DomainError("lambing.tooManyLambs");
  if (!Number.isInteger(input.stillborn) || input.stillborn < 0 || input.stillborn > maxStillborn) {
    throw new DomainError("lambing.stillbornInvalid");
  }

  // All checks come before the first write.
  const mother = await requireMother(ctx, input.motherId);
  const fatherId = input.fatherId;
  await requireParents(
    cachedLookup((id) => ctx.repos.sheep.get(id)),
    { id: null, birthDate: date, motherId: mother.id, fatherId },
  );
  const flockId = await motherFlock(ctx, mother, date);
  const defaultOwner = ownerAt(mother, await ctx.repos.sheep.ownerChanges(mother.id), date);
  const lambs = await validLambs(ctx, input.lambs, defaultOwner);

  const lambIds: SheepId[] = [];
  for (const lamb of lambs) {
    const fields: SheepFields = {
      tag: lamb.tag,
      name: null,
      sex: lamb.sex,
      birthDate: date,
      origin: "born",
      initialEntry: false,
      status: "active",
      ownerId: lamb.ownerId,
      notes: null,
      weight: null,
      motherId: mother.id,
      fatherId,
      manualBreeds: [],
      passport: null,
      grade: null,
      flockId: null,
      registeredAt: ctx.now(),
    };
    const lambId = await ctx.repos.sheep.insert(fields);
    if (flockId !== null) {
      await recordFlockMove(ctx, { id: lambId, farmId: ctx.farm.id, ...fields }, flockId, date);
    }
    await recordFarmAudit(ctx, {
      command: "lambing.record",
      target: { kind: "Sheep", id: lambId },
    });
    lambIds.push(lambId);
  }
  const lambingId = await ctx.repos.lambings.insert({
    motherId: mother.id,
    fatherId,
    date,
    lambIds,
    stillborn: input.stillborn,
    recordedAt: ctx.now(),
  });
  await recordFarmAudit(ctx, {
    command: "lambing.record",
    target: { kind: "Lambing", id: lambingId },
  });
  return { lambingId, lambIds };
}

/** The Mother: an Active Ewe of the Farm, not an External Sheep. */
async function requireMother(ctx: FarmCommandContext, motherId: SheepId): Promise<Sheep> {
  const mother = await ctx.repos.sheep.get(motherId);
  if (mother === null) throw new DomainError("pedigree.parentNotFound");
  if (mother.origin === "external") throw new DomainError("lambing.motherExternal");
  if (mother.sex !== "ewe") throw new DomainError("pedigree.motherNotEwe");
  if (mother.status !== "active") throw new DomainError("lambing.motherNotActive");
  return mother;
}

/**
 * The Flock that had the Mother at the end of the date, or null for no Flock. Throws
 * `lambing.flockArchived` if that Flock is Archived now.
 */
async function motherFlock(
  ctx: FarmCommandContext,
  mother: Sheep,
  date: CalendarDate,
): Promise<FlockId | null> {
  const flockId = flockAt(await ctx.repos.sheep.flockMoves(mother.id), date);
  if (flockId === null) return null;
  const flock = await ctx.repos.flocks.get(flockId);
  if (flock === null) throw new DomainError("flock.notFound");
  if (flock.archivedAt !== null) throw new DomainError("lambing.flockArchived");
  return flockId;
}

/** The Lambs with their Tags trimmed and their Owners chosen, or a domain error. */
async function validLambs(
  ctx: FarmCommandContext,
  lambs: readonly LambInput[],
  defaultOwner: MembershipId | null,
): Promise<{ sex: Sex; tag: string | null; ownerId: MembershipId }[]> {
  const tags = new Set<string>();
  const owners = new Set<MembershipId>();
  const valid = [];
  for (const lamb of lambs) {
    const tag = validTag(lamb.tag);
    if (tag !== null) {
      const key = tagKey(tag);
      if (tags.has(key)) throw new DomainError("lambing.tagRepeated");
      tags.add(key);
      await requireFreeTag(ctx, tag, null);
    }
    const ownerId = lamb.ownerId ?? defaultOwner;
    if (ownerId === null) throw new DomainError("sheep.ownerNotMember");
    if (!owners.has(ownerId)) {
      await requireOwner(ctx, ownerId);
      owners.add(ownerId);
    }
    valid.push({ sex: lamb.sex, tag, ownerId });
  }
  return valid;
}

/** The Tag trimmed, with the spaces inside as one, or null if it is empty. */
function validTag(tag: string | null): string | null {
  const trimmed = tag?.trim() ?? "";
  if (trimmed === "") return null;
  if (trimmed.length > maxTagLength) throw new DomainError("sheep.tagTooLong");
  return trimmed.replace(/\s+/g, " ");
}
