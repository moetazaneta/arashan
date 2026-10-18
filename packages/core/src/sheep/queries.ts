import { authorize } from "../access/permissions";
import type { CommandName } from "../audit/audit";
import type { FarmQueryContext } from "../context";
import type { CalendarDate } from "../dates";
import { DomainError } from "../errors";
import type { Flock } from "../flocks/flock";
import {
  type FlockRef,
  flockRefOf,
  flocksById,
  type SheepFlockStay,
  sheepFlockStays,
} from "../flocks/queries";
import type { FileId, FlockId, MembershipId, SheepId, UserId } from "../ids";
import type { BreedComposition, BreedShare } from "../pedigree/composition";
import { cachedLookup, compositions, type SheepLookup } from "../pedigree/pedigree";
import type { Grading, Origin, Sex, Sheep, SheepStatus, Weighing } from "./sheep";

// The queries of the Sheep registry: the table, the card, the pedigree, the history, and the Owners
// and the parents to choose from.

/** A Member as the Owner of a Sheep: the id of the Membership and the username. */
export interface OwnerRef {
  id: MembershipId;
  name: string;
}

/** A Member who can own a Sheep now, as the Owner field of a form offers it. */
export interface OwnerOption extends OwnerRef {
  /** True for the Member who makes the request: the default Owner of a new Sheep. */
  isMe: boolean;
}

/**
 * A Sheep as the table «Бараны» shows it. Whether it is a Lamb depends on the day, so the client
 * adds it with `withLamb`.
 */
export interface SheepRow {
  id: SheepId;
  tag: string | null;
  name: string | null;
  sex: Sex;
  birthDate: CalendarDate | null;
  origin: Origin;
  initialEntry: boolean;
  status: SheepStatus;
  owner: OwnerRef | null;
  /** The Flock that the Sheep is in now, or null. */
  flock: FlockRef | null;
  weight: Weighing | null;
  notes: string | null;
  composition: BreedComposition;
  grade: Grading | null;
  hasPassport: boolean;
  registeredAt: number;
}

/** A Sheep as a link to its card shows it, for example a parent. */
export interface SheepRef {
  id: SheepId;
  tag: string | null;
  name: string | null;
  sex: Sex;
  origin: Origin;
}

/** A Sheep that can be the Mother or the Father in a form: also an External Sheep. */
export interface ParentOption extends SheepRef {
  birthDate: CalendarDate | null;
  status: SheepStatus;
  composition: BreedComposition;
}

/** The Passport of a Sheep, with the scan to open. */
export interface PassportView {
  number: string;
  issueDate: CalendarDate;
  /** The scan, or null if a Member did not attach it, or the storage lost it. */
  scan: { id: FileId; url: string } | null;
}

/** One Owner of a Sheep, from a date. */
export interface OwnerPeriod {
  owner: OwnerRef;
  /** The date when the Owner got the Sheep, or null for the Owner at the registration. */
  since: CalendarDate | null;
}

/**
 * A Sheep as its card shows it: the fields, the Owners (the newest first), the parents and the
 * Flock stays (the newest first), children, the parts of the Breed composition by hand, and the Passport.
 */
export interface SheepCard extends SheepRow {
  owners: OwnerPeriod[];
  mother: SheepRef | null;
  father: SheepRef | null;
  /** The Sheep of which this one is a parent, the oldest first. */
  children: SheepRef[];
  manualBreeds: BreedShare[];
  passport: PassportView | null;
  flocks: SheepFlockStay[];
}

/** A Sheep in the pedigree tree, with its parents up to the depth of the tree. */
export interface PedigreeNode extends SheepRef {
  birthDate: CalendarDate | null;
  composition: BreedComposition;
  /** The Mother, or null if nobody knows her, or undefined below the depth of the tree. */
  mother?: PedigreeNode | null;
  father?: PedigreeNode | null;
}

/** The generations of ancestors that the pedigree tree of the card shows. */
export const pedigreeDepth = 3;

/** One audit entry of a Sheep, for the tab «История». */
export interface SheepHistoryEntry {
  at: number;
  /** The User who made the change, or null for a change from the CLI. */
  actor: { id: UserId; name: string } | null;
  command: CommandName;
}

/**
 * The Sheep of the Farm for the table: all Sheep that are or were on the Farm, without the Deleted
 * ones and the External ones. By Tag, then by name.
 */
export async function listSheep(ctx: FarmQueryContext): Promise<SheepRow[]> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const [owners, flocks] = await Promise.all([ownerNames(ctx), flocksById(ctx)]);
  const all = await ctx.repos.sheep.list();
  const compositionOf = compositions(lookupIn(all));
  const rows = await Promise.all(
    all
      .filter((sheep) => sheep.origin !== "external")
      .map(async (sheep) => toRow(sheep, owners, await compositionOf(sheep), flocks)),
  );
  return rows.sort(byTagThenName);
}

/**
 * The Sheep that can be a parent in a form, by Tag: all Sheep of the Farm, also the External ones
 * and the ones that are not Active, with their Breed composition. The form checks the sex and the
 * dates; the core checks them again with the command.
 */
export async function listParentOptions(ctx: FarmQueryContext): Promise<ParentOption[]> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const all = await ctx.repos.sheep.list();
  const compositionOf = compositions(lookupIn(all));
  return Promise.all(
    all.toSorted(byTagThenName).map(async (sheep) => ({
      ...toRef(sheep),
      birthDate: sheep.birthDate,
      status: sheep.status,
      composition: await compositionOf(sheep),
    })),
  );
}

/**
 * The pedigree tree of a Sheep: the Sheep and its ancestors for `pedigreeDepth` generations, each
 * with its Breed composition. Null if the Farm has no such Sheep, or it is Deleted.
 */
export async function getSheepPedigree(
  ctx: FarmQueryContext,
  input: { sheepId: SheepId },
): Promise<PedigreeNode | null> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const lookup = cachedLookup((id) => ctx.repos.sheep.get(id));
  const sheep = await lookup(input.sheepId);
  if (sheep === null) return null;
  const compositionOf = compositions(lookup);
  const node = async (sheep: Sheep, depth: number): Promise<PedigreeNode> => {
    const parent = async (id: SheepId | null) => {
      const found = id === null ? null : await lookup(id);
      return found === null ? null : node(found, depth + 1);
    };
    const base = {
      ...toRef(sheep),
      birthDate: sheep.birthDate,
      composition: await compositionOf(sheep),
    };
    if (depth === pedigreeDepth) return base;
    const [mother, father] = await Promise.all([parent(sheep.motherId), parent(sheep.fatherId)]);
    return { ...base, mother, father };
  };
  return node(sheep, 0);
}

/**
 * The card of a Sheep, also of an External Sheep, with the history of its Owners, or null if the Farm
 * has no such Sheep, or it is Deleted: a card that is open when a Member deletes the Sheep then shows
 * that it is gone.
 */
export async function getSheep(
  ctx: FarmQueryContext,
  input: { sheepId: SheepId },
): Promise<SheepCard | null> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const lookup = cachedLookup((id) => ctx.repos.sheep.get(id));
  const sheep = await lookup(input.sheepId);
  if (sheep === null) return null;
  const [owners, flocks] = await Promise.all([ownerNames(ctx), flocksById(ctx)]);
  const row = toRow(sheep, owners, await compositions(lookup)(sheep), flocks);
  const parent = async (id: SheepId | null) => {
    const found = id === null ? null : await lookup(id);
    return found === null ? null : toRef(found);
  };
  const children = (await ctx.repos.sheep.children(sheep.id)).sort(
    (a, b) =>
      (a.birthDate ?? "").localeCompare(b.birthDate ?? "") || a.registeredAt - b.registeredAt,
  );
  const changes = await ctx.repos.sheep.ownerChanges(sheep.id);
  const periods: OwnerPeriod[] = [];
  const first = changes[0]?.previousOwnerId ?? sheep.ownerId;
  if (first !== null) periods.push({ owner: ownerOf(owners, first), since: null });
  for (const change of changes) {
    periods.push({ owner: ownerOf(owners, change.ownerId), since: change.date });
  }
  return {
    ...row,
    owners: periods.reverse(),
    flocks: await sheepFlockStays(ctx, sheep.id),
    mother: await parent(sheep.motherId),
    father: await parent(sheep.fatherId),
    children: children.map(toRef),
    manualBreeds: sheep.manualBreeds,
    passport: sheep.passport === null ? null : await passportView(ctx, sheep.passport),
  };
}

/** The audit entries of a Sheep: who changed it and when, the newest first. */
export async function getSheepHistory(
  ctx: FarmQueryContext,
  input: { sheepId: SheepId },
): Promise<SheepHistoryEntry[]> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const sheep = await requireSheep(ctx, input.sheepId);
  const entries = await ctx.repos.history.listForTarget({ kind: "Sheep", id: sheep.id });
  const names = new Map<UserId, string>();
  const history: SheepHistoryEntry[] = [];
  for (const entry of entries) {
    let actor: SheepHistoryEntry["actor"] = null;
    if (entry.actorId !== null) {
      if (!names.has(entry.actorId)) {
        names.set(entry.actorId, (await ctx.repos.users.get(entry.actorId))?.username ?? "");
      }
      actor = { id: entry.actorId, name: names.get(entry.actorId) ?? "" };
    }
    history.push({ at: entry.at, actor, command: entry.command });
  }
  return history.reverse();
}

/**
 * The Members who can own a Sheep now, by username: the choices of the Owner in the forms. A removed
 * Member (an Archived Membership) cannot.
 */
export async function listSheepOwners(ctx: FarmQueryContext): Promise<OwnerOption[]> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const memberships = await ctx.repos.memberships.list();
  const owners = await Promise.all(
    memberships
      .filter((membership) => membership.archivedAt === undefined)
      .map(async (membership) => ({
        id: membership.id,
        name: (await ctx.repos.users.get(membership.userId))?.username ?? "",
        isMe: membership.id === ctx.member.membershipId,
      })),
  );
  return owners.sort((a, b) => a.name.localeCompare(b.name));
}

/** The Sheep of the Farm, also an External one, or `sheep.notFound` if it is none or Deleted. */
async function requireSheep(ctx: FarmQueryContext, id: SheepId): Promise<Sheep> {
  const sheep = await ctx.repos.sheep.get(id);
  if (sheep === null) throw new DomainError("sheep.notFound");
  return sheep;
}

/** The Sheep of the list by id, for `compositions`. */
function lookupIn(all: readonly Sheep[]): SheepLookup {
  const byId = new Map(all.map((sheep) => [sheep.id, sheep]));
  return async (id) => byId.get(id) ?? null;
}

async function passportView(
  ctx: FarmQueryContext,
  passport: NonNullable<Sheep["passport"]>,
): Promise<PassportView> {
  const url = passport.scanId === null ? null : await ctx.repos.files.url(passport.scanId);
  return {
    number: passport.number,
    issueDate: passport.issueDate,
    scan: passport.scanId === null || url === null ? null : { id: passport.scanId, url },
  };
}

function toRef(sheep: Sheep): SheepRef {
  return { id: sheep.id, tag: sheep.tag, name: sheep.name, sex: sheep.sex, origin: sheep.origin };
}

/** The username of each Member of the Farm, also of a removed one, by the id of the Membership. */
async function ownerNames(ctx: FarmQueryContext): Promise<Map<MembershipId, string>> {
  const memberships = await ctx.repos.memberships.list();
  const names = new Map<MembershipId, string>();
  for (const membership of memberships) {
    names.set(membership.id, (await ctx.repos.users.get(membership.userId))?.username ?? "");
  }
  return names;
}

function ownerOf(names: Map<MembershipId, string>, id: MembershipId): OwnerRef {
  return { id, name: names.get(id) ?? "" };
}

function toRow(
  sheep: Sheep,
  owners: Map<MembershipId, string>,
  composition: BreedComposition,
  flocks: Map<FlockId, Flock>,
): SheepRow {
  return {
    id: sheep.id,
    tag: sheep.tag,
    name: sheep.name,
    sex: sheep.sex,
    birthDate: sheep.birthDate,
    origin: sheep.origin,
    initialEntry: sheep.initialEntry,
    status: sheep.status,
    owner: sheep.ownerId === null ? null : ownerOf(owners, sheep.ownerId),
    flock: sheep.flockId === null ? null : flockRefOf(flocks, sheep.flockId),
    weight: sheep.weight,
    notes: sheep.notes,
    composition,
    grade: sheep.grade,
    hasPassport: sheep.passport !== null,
    registeredAt: sheep.registeredAt,
  };
}

const collator = new Intl.Collator("ru", { numeric: true });

/** By Tag in the natural order (2 before 10), the Sheep without a Tag last; then by name. */
function byTagThenName(
  a: Pick<SheepRow, "tag" | "name" | "registeredAt">,
  b: Pick<SheepRow, "tag" | "name" | "registeredAt">,
): number {
  if (a.tag !== b.tag) {
    if (a.tag === null) return 1;
    if (b.tag === null) return -1;
    const byTag = collator.compare(a.tag, b.tag);
    if (byTag !== 0) return byTag;
  }
  return collator.compare(a.name ?? "", b.name ?? "") || a.registeredAt - b.registeredAt;
}
