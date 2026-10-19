import { authorize } from "../access/permissions";
import { recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError, type ErrorCode } from "../errors";
import type { MembershipId, SheepId } from "../ids";
import {
  type BreedShare,
  compositionOf,
  isPureArashan,
  sameComposition,
  validManualBreeds,
} from "../pedigree/composition";
import {
  bornNotBefore,
  cachedLookup,
  compositions,
  knownParents,
  requireParents,
  type SheepLookup,
} from "../pedigree/pedigree";
import { arashanBreedId } from "../breeds/breed";
import { lastLambingDate } from "../lambings/lambing";
import {
  type Grading,
  maxPassportNumberLength,
  maxScanBytes,
  maxSheepNameLength,
  maxSheepNotesLength,
  maxTagLength,
  maxWeightKg,
  type Origin,
  type Passport,
  scanContentTypes,
  type Sex,
  type Sheep,
  type SheepFields,
  tagKey,
  type Weighing,
} from "./sheep";

// The commands of the Sheep registry: register a Sheep, an External Sheep, change it, give it to
// another Owner, and delete it. Each one checks the permission first and appends one audit entry for
// the Sheep.

/** The fields of a Sheep that a Member enters in the form. An empty text is no value. */
export interface SheepDetails extends Partial<PedigreeDetails> {
  tag: string | null;
  name: string | null;
  sex: Sex;
  birthDate: CalendarDate | null;
  notes: string | null;
  weight: Weighing | null;
}

/**
 * The fields of the pedigree, the Passport and the Grade, in the block «Дополнительно» of the form.
 * A field that a command does not get stays the same; a new Sheep has none.
 */
export interface PedigreeDetails {
  motherId: SheepId | null;
  fatherId: SheepId | null;
  /**
   * The parts of the Breed composition that the Member gives by hand, in millionths of the Sheep,
   * out of the Unknown part that the unknown parents give: up to 100 percent with no known parent,
   * up to 50 percent with one, and none with two (`manualLimit`). The rest stays Unknown.
   */
  manualBreeds: BreedShare[];
  passport: Passport | null;
  grade: Grading | null;
}

/** The Origin of a Sheep that a Member registers: an External Sheep comes with the pedigree. */
export type RegisteredOrigin = Extract<Origin, "born" | "bought">;

/** A new Sheep of the Farm. */
export interface SheepRegistration extends SheepDetails {
  ownerId: MembershipId;
  origin: RegisteredOrigin;
  /**
   * True for an Initial entry: a Sheep that was on the Farm before the app. Its Origin is Born or
   * Bought, its birth date is optional, and it needs no Purchase.
   */
  initialEntry: boolean;
}

/**
 * A Member registers a Sheep. Outside the Initial entry, a Sheep is Born on the Farm and has a birth
 * date: a Bought Sheep comes from a Purchase (`sheep.purchaseRequired`). The Tag is optional, and
 * unique among the Sheep of the Farm. The Owner is a Member of the Farm.
 */
export async function registerSheep(
  ctx: FarmCommandContext,
  input: SheepRegistration,
): Promise<SheepId> {
  authorize(ctx.member, "sheep.register", { farmId: ctx.farm.id });
  if (!input.initialEntry && input.origin === "bought") {
    throw new DomainError("sheep.purchaseRequired");
  }
  const details = validDetails(input, today(ctx));
  requireBirthDate(details, input);
  await requireFreeTag(ctx, details.tag, null);
  await requireOwner(ctx, input.ownerId);
  const pedigree = await validPedigree(ctx, null, details, input);
  const sheepId = await ctx.repos.sheep.insert({
    ...details,
    ...pedigree,
    origin: input.origin,
    initialEntry: input.initialEntry,
    purchaseId: null,
    status: "active",
    ownerId: input.ownerId,
    flockId: null,
    registeredAt: ctx.now(),
  });
  await recordSheepAudit(ctx, "sheep.register", sheepId);
  return sheepId;
}

/**
 * A new External Sheep: a Sheep that was never on the Farm, which the Farm records only as the
 * Mother or the Father of its own Sheep.
 */
export type ExternalSheepRegistration = Pick<
  SheepDetails,
  "tag" | "name" | "sex" | "birthDate" | "notes" | "motherId" | "fatherId" | "manualBreeds"
>;

/**
 * A Member registers an External Sheep, in the mode «Внешний» of the panel of a new Sheep. It has no
 * Owner, no Flock and no Status of its own on the Farm: each list of the Farm skips it by its
 * Origin. Its Tag is optional, and no other Tag makes it taken.
 */
export async function registerExternalSheep(
  ctx: FarmCommandContext,
  input: ExternalSheepRegistration,
): Promise<SheepId> {
  authorize(ctx.member, "sheep.register", { farmId: ctx.farm.id });
  const details = validDetails({ ...input, weight: null }, today(ctx));
  const pedigree = await validPedigree(ctx, null, details, {
    ...input,
    passport: null,
    grade: null,
  });
  const sheepId = await ctx.repos.sheep.insert({
    ...details,
    ...pedigree,
    origin: "external",
    initialEntry: false,
    purchaseId: null,
    // The Status of a Sheep is its life on the Farm. An External Sheep has none, and keeps the
    // default; each list of the Farm skips it by its Origin.
    status: "active",
    ownerId: null,
    flockId: null,
    registeredAt: ctx.now(),
  });
  await recordSheepAudit(ctx, "sheep.registerExternal", sheepId);
  return sheepId;
}

/** The new fields of a Sheep. The Origin changes only for an Initial entry, between Born and Bought. */
export interface SheepUpdate extends SheepDetails {
  sheepId: SheepId;
  origin?: RegisteredOrigin;
}

/**
 * A Member changes the fields of a Sheep, also of an External Sheep. The same rules apply as for a
 * new Sheep, and the birth date is not after a change of the Owner
 * (`sheep.birthDateAfterOwnerChange`), a Flock move (`sheep.birthDateAfterFlockMove`) or a change
 * of the Status (`sheep.birthDateAfterStatusChange`). A Sheep that is a parent keeps its sex, and
 * stays born before its children. A change of the Breed composition changes the composition of all
 * descendants too, so it fails if a Sheep with a Passport among them would stop being 100 percent
 * Arashan. The Owner changes only with `changeSheepOwner`, which records the date. A change that
 * changes nothing writes nothing.
 */
export async function updateSheep(ctx: FarmCommandContext, input: SheepUpdate): Promise<void> {
  authorize(ctx.member, "sheep.update", { farmId: ctx.farm.id });
  const sheep = await requireRecord(ctx, input.sheepId);
  const origin = input.origin ?? sheep.origin;
  if (origin !== sheep.origin && !sheep.initialEntry) throw new DomainError("sheep.originLocked");
  const details = validDetails(input, today(ctx));
  requireBirthDate(details, { origin, initialEntry: sheep.initialEntry });
  const { birthDate } = details;
  if (birthDate !== null && birthDate !== sheep.birthDate) {
    const bought = await purchaseDate(ctx, sheep);
    if (bought !== null && birthDate > bought) throw new DomainError("deal.bornAfterPurchase");
    const changes = await ctx.repos.sheep.ownerChanges(sheep.id);
    if (changes.some((change) => change.date < birthDate)) {
      throw new DomainError("sheep.birthDateAfterOwnerChange");
    }
    const moves = await ctx.repos.sheep.flockMoves(sheep.id);
    if (moves.some((move) => move.date < birthDate)) {
      throw new DomainError("sheep.birthDateAfterFlockMove");
    }
    const statusChanges = await ctx.repos.sheep.statusChanges(sheep.id);
    if (statusChanges.some((change) => change.date < birthDate)) {
      throw new DomainError("sheep.birthDateAfterStatusChange");
    }
  }
  if (origin !== "external") await requireFreeTag(ctx, details.tag, sheep.id);
  await requireChildrenFit(ctx, sheep, details);
  const pedigree = await validPedigree(ctx, sheep, details, input);
  const changed = { ...details, ...pedigree, origin };
  if (sameFields(sheep, changed)) return;
  await ctx.repos.sheep.update(sheep.id, changed);
  await recordSheepAudit(ctx, "sheep.update", sheep.id);
}

/**
 * A Member gives an Active or a Lost Sheep to another Member of the Farm, on a date. The date is not
 * in the future, and not before the birth date, the last change of the Owner or the last change of
 * the Status. The card shows the history
 * of the Owners.
 */
export async function changeSheepOwner(
  ctx: FarmCommandContext,
  input: { sheepId: SheepId; ownerId: MembershipId; date: CalendarDate },
): Promise<void> {
  authorize(ctx.member, "sheep.changeOwner", { farmId: ctx.farm.id });
  const sheep = await requireSheep(ctx, input.sheepId);
  // A Lost Sheep can come back, so it can get a new Owner too, for example before a removal.
  if ((sheep.status !== "active" && sheep.status !== "lost") || sheep.ownerId === null) {
    throw new DomainError("sheep.notActive");
  }
  if (input.ownerId === sheep.ownerId) throw new DomainError("sheep.sameOwner");
  await requireOwner(ctx, input.ownerId);
  const date = validDate(input.date);
  const lastChange = (await ctx.repos.sheep.ownerChanges(sheep.id)).at(-1);
  const lastStatusChange = (await ctx.repos.sheep.statusChanges(sheep.id)).at(-1);
  // The Lambs of an Ewe got her Owner of the date of her Lambing.
  const lastLambing = await lastLambingDate(ctx.repos.lambings, sheep.id);
  const bought = await purchaseDate(ctx, sheep);
  if (
    date > today(ctx) ||
    (sheep.birthDate !== null && date < sheep.birthDate) ||
    (bought !== null && date < bought) ||
    (lastChange !== undefined && date < lastChange.date) ||
    (lastStatusChange !== undefined && date < lastStatusChange.date) ||
    (lastLambing !== null && date < lastLambing)
  ) {
    throw new DomainError("sheep.ownerChangeDateInvalid");
  }
  await ctx.repos.sheep.insertOwnerChange({
    sheepId: sheep.id,
    previousOwnerId: sheep.ownerId,
    ownerId: input.ownerId,
    date,
    at: ctx.now(),
  });
  await ctx.repos.sheep.update(sheep.id, { ownerId: input.ownerId });
  await recordSheepAudit(ctx, "sheep.changeOwner", sheep.id);
}

/**
 * A Member deletes a Sheep that was registered by mistake, also an External Sheep. The Sheep becomes
 * Deleted: the app hides it but keeps it, and a Member can restore it (ADR 0005). A Sheep that is
 * the parent of another Sheep cannot become Deleted (`sheep.isParent`), nor a Sheep of a deal
 * (`sheep.inDeal`): a Sold Sheep, or a Sheep that a Purchase brought. A Member cancels the deal
 * instead, so that a deal never has a Deleted Sheep.
 */
export async function deleteSheep(
  ctx: FarmCommandContext,
  input: { sheepId: SheepId },
): Promise<void> {
  authorize(ctx.member, "sheep.delete", { farmId: ctx.farm.id });
  const sheep = await requireRecord(ctx, input.sheepId);
  if (sheep.status === "sold" || sheep.purchaseId !== null) throw new DomainError("sheep.inDeal");
  await requireNotParent(ctx, sheep.id);
  await ctx.repos.sheep.markDeleted(sheep.id, ctx.now());
  await recordSheepAudit(ctx, "sheep.delete", sheep.id);
}

/**
 * A Member restores a Deleted Sheep from the Trash, also an External Sheep. A Sheep of a Purchase
 * comes back only with its Purchase (`sheep.inDeal`), so that a deal never has a Deleted Sheep. The
 * rules about other records can change while the Sheep is Deleted, so the restore checks them again
 * (`requireRestorableSheep`). For the Trash, which checks the permission.
 */
export async function restoreSheep(ctx: FarmCommandContext, id: SheepId): Promise<void> {
  const sheep = await ctx.repos.sheep.getDeleted(id);
  if (sheep === null) throw new DomainError("trash.notFound");
  if (sheep.purchaseId !== null) throw new DomainError("sheep.inDeal");
  await requireRestorableSheep(ctx, sheep);
  await ctx.repos.sheep.markRestored(sheep.id);
  await recordSheepAudit(ctx, "sheep.restore", sheep.id);
}

/**
 * Throws the error of the first rule that the restore of a Deleted Sheep breaks. While the Sheep was
 * Deleted, no rule saw it: another Sheep could take its Tag, its Owner could leave the Farm, and its
 * parents, its Breeds and its Flock could change. So the restore checks again:
 *
 * - the Tag is free (`sheep.tagTaken`), unless the Sheep is External;
 * - the Owner of an Active or a Lost Sheep is a Member now (`sheep.ownerNotMember`);
 * - no parent is Deleted (`trash.parentDeleted`), and the parents keep the rules of the pedigree
 *   (`requireParents`), for example a Mother that is an Ewe;
 * - no Breed of the parts by hand is Deleted (`trash.breedDeleted`);
 * - a Sheep with a Passport is still 100 percent Arashan (`passport.notArashan`);
 * - its Flock is not Archived (`flock.archived`): an Archived Flock has no Sheep.
 *
 * The restore of a Purchase checks its Sheep with it too.
 */
export async function requireRestorableSheep(ctx: FarmCommandContext, sheep: Sheep): Promise<void> {
  if (sheep.origin !== "external") await requireFreeTag(ctx, sheep.tag, sheep.id);
  if ((sheep.status === "active" || sheep.status === "lost") && sheep.ownerId !== null) {
    await requireOwner(ctx, sheep.ownerId);
  }
  const lookup = cachedLookup((parentId) => ctx.repos.sheep.get(parentId));
  for (const parentId of [sheep.motherId, sheep.fatherId]) {
    if (parentId !== null && (await lookup(parentId)) === null) {
      throw new DomainError("trash.parentDeleted");
    }
  }
  await requireParents(lookup, sheep);
  for (const { breedId } of sheep.manualBreeds) {
    if (breedId !== arashanBreedId && (await ctx.repos.breeds.get(breedId)) === null) {
      throw new DomainError("trash.breedDeleted");
    }
  }
  await requirePassportsFit(ctx, lookup, sheep, sheep);
  if (sheep.flockId !== null) {
    const flock = await ctx.repos.flocks.get(sheep.flockId);
    if (flock === null || flock.archivedAt !== null) throw new DomainError("flock.archived");
  }
}

/** A new Sheep of a Purchase: one row of its form. An empty text is no value. */
export interface BoughtSheep {
  tag: string | null;
  name: string | null;
  sex: Sex;
  /** Null if nobody knows it. Not after the day of the Purchase. */
  birthDate: CalendarDate | null;
  notes: string | null;
  ownerId: MembershipId;
}

/**
 * The fields of the new Sheep of a Purchase on the date, or the error of the first rule that a row
 * breaks: the rules of `registerSheep`, and a Sheep is not born after the Purchase
 * (`deal.bornAfterPurchase`). Two rows do not have the same Tag (`sheep.tagTaken`). For the command
 * of the Purchase: it checks all rows before it writes, then inserts the Sheep with its id.
 */
export async function validBoughtSheep(
  ctx: FarmCommandContext,
  rows: readonly BoughtSheep[],
  date: CalendarDate,
): Promise<Omit<SheepFields, "purchaseId">[]> {
  const fields: Omit<SheepFields, "purchaseId">[] = [];
  const tags = new Set<string>();
  for (const row of rows) {
    const details = validDetails({ ...row, weight: null }, today(ctx));
    if (details.birthDate !== null && details.birthDate > date) {
      throw new DomainError("deal.bornAfterPurchase");
    }
    if (details.tag !== null) {
      if (tags.has(tagKey(details.tag))) throw new DomainError("sheep.tagTaken");
      tags.add(tagKey(details.tag));
    }
    await requireFreeTag(ctx, details.tag, null);
    await requireOwner(ctx, row.ownerId);
    fields.push({
      ...details,
      motherId: null,
      fatherId: null,
      manualBreeds: [],
      passport: null,
      grade: null,
      origin: "bought",
      initialEntry: false,
      status: "active",
      ownerId: row.ownerId,
      flockId: null,
      registeredAt: ctx.now(),
    });
  }
  return fields;
}

/** Today in the time zone of the Farm. */
function today(ctx: FarmCommandContext): CalendarDate {
  return dateAt(ctx.now(), ctx.farm.timeZone);
}

/**
 * A Member uploads the scan of a Passport: the command gives a URL for one upload. The upload gives
 * the id of the file, which the form then sends with the Passport. It writes no record.
 */
export async function requestPassportScanUpload(ctx: FarmCommandContext): Promise<string> {
  authorize(ctx.member, "sheep.update", { farmId: ctx.farm.id });
  return ctx.repos.files.uploadUrl();
}

/**
 * The day of the Purchase that brought the Sheep, or null if no Purchase brought it. No event of a
 * Bought Sheep on the Farm (a move, a change of the Owner or of the Status) is before it, as no event
 * is before the birth date.
 */
export async function purchaseDate(
  ctx: Pick<FarmCommandContext, "repos">,
  sheep: Pick<Sheep, "purchaseId">,
): Promise<CalendarDate | null> {
  if (sheep.purchaseId === null) return null;
  return (await ctx.repos.deals.get(sheep.purchaseId))?.date ?? null;
}

/**
 * Throws `sheep.isParent` if the Sheep is the Mother or the Father of another Sheep. A command that
 * makes a Sheep Deleted, such as a cancelled Purchase, checks it too.
 */
export async function requireNotParent(ctx: FarmCommandContext, sheepId: SheepId): Promise<void> {
  if ((await ctx.repos.sheep.children(sheepId)).length > 0) {
    throw new DomainError("sheep.isParent");
  }
}

function recordSheepAudit(
  ctx: FarmCommandContext,
  command:
    | "sheep.register"
    | "sheep.registerExternal"
    | "sheep.update"
    | "sheep.changeOwner"
    | "sheep.delete"
    | "sheep.restore",
  sheepId: SheepId,
): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind: "Sheep", id: sheepId } });
}

/** The Sheep of the Farm, or `sheep.notFound`. A Deleted Sheep and an External Sheep are not found. */
async function requireSheep(ctx: FarmCommandContext, id: SheepId): Promise<Sheep> {
  const sheep = await requireRecord(ctx, id);
  if (sheep.origin === "external") throw new DomainError("sheep.notFound");
  return sheep;
}

/** The Sheep of the Farm, also an External one, or `sheep.notFound` if it is none or Deleted. */
async function requireRecord(ctx: FarmCommandContext, id: SheepId): Promise<Sheep> {
  const sheep = await ctx.repos.sheep.get(id);
  if (sheep === null) throw new DomainError("sheep.notFound");
  return sheep;
}

/**
 * The pedigree, the Passport and the Grade of a Sheep after the change, or a domain error. `sheep`
 * is the Sheep before the change, or null for a new Sheep; a field that `input` does not have stays
 * the same.
 */
async function validPedigree(
  ctx: FarmCommandContext,
  sheep: Sheep | null,
  details: { sex: Sex; birthDate: CalendarDate | null },
  input: Partial<PedigreeDetails>,
): Promise<PedigreeDetails> {
  const lookup = cachedLookup((id) => ctx.repos.sheep.get(id));
  const motherId = input.motherId === undefined ? (sheep?.motherId ?? null) : input.motherId;
  const fatherId = input.fatherId === undefined ? (sheep?.fatherId ?? null) : input.fatherId;
  await requireParents(lookup, {
    id: sheep?.id ?? null,
    birthDate: details.birthDate,
    motherId,
    fatherId,
  });
  const known = knownParents({ motherId, fatherId });
  // With two known parents, the composition comes from them alone.
  const manualBreeds =
    input.manualBreeds === undefined && known === 2
      ? []
      : validManualBreeds(input.manualBreeds ?? sheep?.manualBreeds ?? [], known);
  await requireBreeds(ctx, manualBreeds, sheep?.manualBreeds ?? []);
  const today = dateAt(ctx.now(), ctx.farm.timeZone);
  const passport = await validPassport(
    ctx,
    input.passport === undefined ? (sheep?.passport ?? null) : input.passport,
    sheep?.passport ?? null,
    details.birthDate,
    today,
  );
  const grade = validGrade(
    input.grade === undefined ? (sheep?.grade ?? null) : input.grade,
    details.birthDate,
    today,
  );
  const pedigree = { motherId, fatherId, manualBreeds, passport, grade };
  await requirePassportsFit(ctx, lookup, sheep, pedigree);
  return pedigree;
}

/**
 * Throws `passport.notArashan` if the Sheep has a Passport but is not 100 percent Arashan after the
 * change, and `passport.descendantNotArashan` if its composition changes, it is not 100 percent
 * Arashan, and a descendant has a Passport. A child is 100 percent Arashan only if both parents are
 * (`compositionOf` never rounds a part to zero for it), so a descendant of a Sheep that is not 100
 * percent Arashan is not one either, and cannot keep a Passport.
 */
async function requirePassportsFit(
  ctx: FarmCommandContext,
  lookup: SheepLookup,
  before: Sheep | null,
  after: Pick<PedigreeDetails, "motherId" | "fatherId" | "manualBreeds" | "passport">,
): Promise<void> {
  const compositionOfSheep = compositions(lookup);
  // The Sheep is no ancestor of its parents (`requireParents`), so their compositions stay the same.
  const parent = async (id: SheepId | null) => {
    const found = id === null ? null : await lookup(id);
    return found === null ? null : compositionOfSheep(found);
  };
  const composition = compositionOf(
    await parent(after.motherId),
    await parent(after.fatherId),
    after.manualBreeds,
  );
  if (isPureArashan(composition)) return;
  if (after.passport !== null) throw new DomainError("passport.notArashan");
  // A composition that stays the same changes nothing for the descendants.
  if (before === null || sameComposition(await compositionOfSheep(before), composition)) return;
  const seen = new Set<SheepId>([before.id]);
  const queue: SheepId[] = [before.id];
  while (queue.length > 0) {
    for (const child of await ctx.repos.sheep.children(queue.shift()!)) {
      if (seen.has(child.id)) continue;
      if (child.passport !== null) throw new DomainError("passport.descendantNotArashan");
      seen.add(child.id);
      queue.push(child.id);
    }
  }
}

/**
 * A Sheep that is a parent keeps its sex (`pedigree.parentSexLocked`), and its birth date stays
 * before the birth date of each child (`pedigree.parentBornAfterChild`).
 */
async function requireChildrenFit(
  ctx: FarmCommandContext,
  sheep: Sheep,
  details: { sex: Sex; birthDate: CalendarDate | null },
): Promise<void> {
  if (details.sex === sheep.sex && details.birthDate === sheep.birthDate) return;
  for (const child of await ctx.repos.sheep.children(sheep.id)) {
    if (details.sex !== sheep.sex) throw new DomainError("pedigree.parentSexLocked");
    if (bornNotBefore(details.birthDate, child.birthDate)) {
      throw new DomainError("pedigree.parentBornAfterChild");
    }
  }
}

/**
 * Throws `breed.notFound` if a part by hand has a Breed that the Farm does not have, and
 * `breed.archived` for an Archived Breed that the Sheep did not have before: a form does not offer
 * an Archived Breed.
 */
async function requireBreeds(
  ctx: FarmCommandContext,
  parts: readonly BreedShare[],
  before: readonly BreedShare[],
): Promise<void> {
  for (const part of parts) {
    if (part.breedId === arashanBreedId) continue;
    const breed = await ctx.repos.breeds.get(part.breedId);
    if (breed === null) throw new DomainError("breed.notFound");
    if (breed.archivedAt !== null && !before.some((old) => old.breedId === breed.id)) {
      throw new DomainError("breed.archived");
    }
  }
}

/**
 * The Passport with its number trimmed, or a domain error. The issue date is not in the future and
 * not before the birth date. A new scan is a file of the storage, at most `maxScanBytes`, of a type
 * of `scanContentTypes` if the storage knows the type.
 */
async function validPassport(
  ctx: FarmCommandContext,
  passport: Passport | null,
  before: Passport | null,
  birthDate: CalendarDate | null,
  today: CalendarDate,
): Promise<Passport | null> {
  if (passport === null) return null;
  const number = passport.number.trim().replace(/\s+/g, " ");
  if (number === "") throw new DomainError("passport.numberRequired");
  if (number.length > maxPassportNumberLength) throw new DomainError("passport.numberTooLong");
  if (
    !isCalendarDate(passport.issueDate) ||
    passport.issueDate > today ||
    (birthDate !== null && passport.issueDate < birthDate)
  ) {
    throw new DomainError("passport.issueDateInvalid");
  }
  if (passport.scanId !== null && passport.scanId !== before?.scanId) {
    const file = await ctx.repos.files.get(passport.scanId);
    if (
      file === null ||
      file.size > maxScanBytes ||
      (file.contentType !== null &&
        !(scanContentTypes as readonly string[]).includes(file.contentType))
    ) {
      throw new DomainError("passport.scanInvalid");
    }
  }
  return { number, issueDate: passport.issueDate, scanId: passport.scanId };
}

/** The Grade, or `sheep.gradeDateInvalid` if its date is in the future or before the birth date. */
function validGrade(
  grade: Grading | null,
  birthDate: CalendarDate | null,
  today: CalendarDate,
): Grading | null {
  if (grade === null) return null;
  if (
    !isCalendarDate(grade.date) ||
    grade.date > today ||
    (birthDate !== null && grade.date < birthDate)
  ) {
    throw new DomainError("sheep.gradeDateInvalid");
  }
  return { grade: grade.grade, date: grade.date };
}

/**
 * Throws `sheep.tagTaken` if another Sheep of the Farm has the same Tag. A Sold or a Dead Sheep keeps
 * its Tag; a Deleted Sheep and an External Sheep do not count. A command that registers Sheep, such
 * as a Lambing, checks each Tag with this rule too.
 */
export async function requireFreeTag(
  ctx: FarmCommandContext,
  tag: string | null,
  self: SheepId | null,
): Promise<void> {
  if (tag === null) return;
  const same = await ctx.repos.sheep.findByTag(tag);
  if (same.some((other) => other.id !== self)) {
    throw new DomainError("sheep.tagTaken");
  }
}

/**
 * Throws `sheep.ownerNotMember` if the Owner is not a Member of the Farm now. The Owner of an Active
 * Sheep is always a Member who is not removed: `removeMember` rejects a Member who owns one. A
 * command that makes a Sheep Active again (a restore, a found Lost Sheep, a cancelled Sale) checks
 * the Owner with this rule too.
 */
export async function requireOwner(ctx: FarmCommandContext, ownerId: MembershipId): Promise<void> {
  const membership = await ctx.repos.memberships.get(ownerId);
  if (membership === null || membership.archivedAt !== undefined) {
    throw new DomainError("sheep.ownerNotMember");
  }
}

/** A Born Sheep outside the Initial entry has a birth date. */
function requireBirthDate(
  details: SheepDetails,
  sheep: { origin: Origin; initialEntry: boolean },
): void {
  if (details.birthDate === null && sheep.origin === "born" && !sheep.initialEntry) {
    throw new DomainError("sheep.birthDateRequired");
  }
}

/** The fields with the texts trimmed and the dates checked, or a domain error. */
function validDetails(input: SheepDetails, today: CalendarDate): SheepDetails {
  const tag = optionalText(input.tag, maxTagLength, "sheep.tagTooLong");
  const birthDate = input.birthDate === null ? null : validDate(input.birthDate);
  if (birthDate !== null && birthDate > today) throw new DomainError("sheep.birthDateInFuture");
  return {
    tag: tag === null ? null : tag.replace(/\s+/g, " "),
    name: optionalText(input.name, maxSheepNameLength, "sheep.nameTooLong"),
    sex: input.sex,
    birthDate,
    notes: optionalText(input.notes, maxSheepNotesLength, "sheep.notesTooLong"),
    weight: input.weight === null ? null : validWeight(input.weight, birthDate, today),
  };
}

function validWeight(weight: Weighing, birthDate: CalendarDate | null, today: CalendarDate) {
  if (!Number.isFinite(weight.kg) || weight.kg <= 0 || weight.kg > maxWeightKg) {
    throw new DomainError("sheep.weightInvalid");
  }
  const date = validDate(weight.date);
  if (date > today || (birthDate !== null && date < birthDate)) {
    throw new DomainError("sheep.weighingDateInvalid");
  }
  return { kg: weight.kg, date };
}

function validDate(date: string): CalendarDate {
  if (!isCalendarDate(date)) throw new DomainError("sheep.dateInvalid");
  return date;
}

/** The trimmed text, or null if it is empty. Throws the code if the text is too long. */
function optionalText(text: string | null, maxLength: number, code: ErrorCode): string | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) throw new DomainError(code);
  return trimmed;
}

function sameFields(
  sheep: Sheep,
  fields: Omit<
    SheepFields,
    "initialEntry" | "purchaseId" | "status" | "ownerId" | "flockId" | "registeredAt"
  >,
): boolean {
  return (
    sameParts(sheep.manualBreeds, fields.manualBreeds) &&
    sheep.motherId === fields.motherId &&
    sheep.fatherId === fields.fatherId &&
    sheep.passport?.number === fields.passport?.number &&
    sheep.passport?.issueDate === fields.passport?.issueDate &&
    sheep.passport?.scanId === fields.passport?.scanId &&
    sheep.grade?.grade === fields.grade?.grade &&
    sheep.grade?.date === fields.grade?.date &&
    sheep.tag === fields.tag &&
    sheep.name === fields.name &&
    sheep.sex === fields.sex &&
    sheep.birthDate === fields.birthDate &&
    sheep.notes === fields.notes &&
    sheep.origin === fields.origin &&
    sheep.weight?.kg === fields.weight?.kg &&
    sheep.weight?.date === fields.weight?.date
  );
}

function sameParts(a: readonly BreedShare[], b: readonly BreedShare[]): boolean {
  return (
    a.length === b.length &&
    a.every((part, index) => part.breedId === b[index]?.breedId && part.share === b[index]?.share)
  );
}
