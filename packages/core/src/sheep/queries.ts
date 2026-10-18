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
import type { FlockId, MembershipId, SheepId, UserId } from "../ids";
import type { Origin, Sex, Sheep, SheepStatus, Weighing } from "./sheep";

// The queries of the Sheep registry: the table, the card, the history, and the Owners to choose from.

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
  registeredAt: number;
}

/** One Owner of a Sheep, from a date. */
export interface OwnerPeriod {
  owner: OwnerRef;
  /** The date when the Owner got the Sheep, or null for the Owner at the registration. */
  since: CalendarDate | null;
}

/** A Sheep as its card shows it: the fields, the Owners and the stays in Flocks, the newest first. */
export interface SheepCard extends SheepRow {
  owners: OwnerPeriod[];
  flocks: SheepFlockStay[];
}

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
  return (await ctx.repos.sheep.list())
    .filter((sheep) => sheep.origin !== "external")
    .map((sheep) => toRow(sheep, owners, flocks))
    .sort(byTagThenName);
}

/**
 * The card of a Sheep, with the history of its Owners, or null if the Farm has no such Sheep, or it
 * is Deleted: a card that is open when a Member deletes the Sheep then shows that it is gone.
 */
export async function getSheep(
  ctx: FarmQueryContext,
  input: { sheepId: SheepId },
): Promise<SheepCard | null> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  const sheep = await ctx.repos.sheep.get(input.sheepId);
  if (sheep === null || sheep.origin === "external") return null;
  const [owners, flocks] = await Promise.all([ownerNames(ctx), flocksById(ctx)]);
  const row = toRow(sheep, owners, flocks);
  const changes = await ctx.repos.sheep.ownerChanges(sheep.id);
  const periods: OwnerPeriod[] = [];
  const first = changes[0]?.previousOwnerId ?? sheep.ownerId;
  if (first !== null) periods.push({ owner: ownerOf(owners, first), since: null });
  for (const change of changes) {
    periods.push({ owner: ownerOf(owners, change.ownerId), since: change.date });
  }
  return { ...row, owners: periods.reverse(), flocks: await sheepFlockStays(ctx, sheep.id) };
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

/** The Sheep of the Farm, or `sheep.notFound`. A Deleted Sheep and an External Sheep are not found. */
async function requireSheep(ctx: FarmQueryContext, id: SheepId): Promise<Sheep> {
  const sheep = await ctx.repos.sheep.get(id);
  if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
  return sheep;
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
    registeredAt: sheep.registeredAt,
  };
}

const collator = new Intl.Collator("ru", { numeric: true });

/** By Tag in the natural order (2 before 10), the Sheep without a Tag last; then by name. */
function byTagThenName(a: SheepRow, b: SheepRow): number {
  if (a.tag !== b.tag) {
    if (a.tag === null) return 1;
    if (b.tag === null) return -1;
    const byTag = collator.compare(a.tag, b.tag);
    if (byTag !== 0) return byTag;
  }
  return collator.compare(a.name ?? "", b.name ?? "") || a.registeredAt - b.registeredAt;
}
