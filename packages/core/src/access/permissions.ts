import { DomainError } from "../errors";
import type { FarmId, MembershipId, UserId } from "../ids";
import type { Role } from "../members/membership";

/** A User who acts in one Farm, with the Role of the User's Membership in it. */
export interface Member {
  membershipId: MembershipId;
  userId: UserId;
  farmId: FarmId;
  role: Role;
}

/**
 * The permission matrix: the Roles that can do each action. An Admin manages the Farm and its
 * Members; an Editor does all other work. A new action adds its row here, and the tests of the matrix
 * check each row.
 */
export const permissions = {
  /** See the Farm and its settings. */
  "farm.view": ["admin", "editor"],
  /** Change the currency, the time zone and the lamb age of the Farm. */
  "farm.updateSettings": ["admin"],
  /** See the Members of the Farm, also the removed ones. */
  "member.list": ["admin"],
  /** Make a one-time invite link for a new Editor. */
  "member.invite": ["admin"],
  /** Change the Role of a Member. */
  "member.changeRole": ["admin"],
  /** Remove a Member from the Farm: the Membership becomes Archived. */
  "member.remove": ["admin"],
  /** Set a new password for a Member (through the identity provider). */
  "member.setPassword": ["admin"],
  /** See the Sheep of the Farm, their cards and their history. */
  "sheep.view": ["admin", "editor"],
  /** Register a Sheep, also as an Initial entry. */
  "sheep.register": ["admin", "editor"],
  /** Change the fields of a Sheep. */
  "sheep.update": ["admin", "editor"],
  /** Give a Sheep to another Owner, on a date. */
  "sheep.changeOwner": ["admin", "editor"],
  /** Make a Sheep Deleted, for a record made by mistake. */
  "sheep.delete": ["admin", "editor"],
  /** See the Breeds of the Farm. */
  "breed.view": ["admin", "editor"],
  /** Add a Breed to the list of the Farm. */
  "breed.add": ["admin", "editor"],
  /** Rename a Breed, archive it, or take it out of the archive. */
  "breed.update": ["admin", "editor"],
  /** Make a Breed that no Sheep uses Deleted, for a record made by mistake. */
  "breed.delete": ["admin", "editor"],
  /** Move Sheep into a Flock or out of all Flocks, on a date. */
  "sheep.move": ["admin", "editor"],
  /**
   * Change the Status of Sheep to Slaughtered, Dead or Lost, bring a Lost Sheep back, or undo the
   * last change of the Status.
   */
  "sheep.changeStatus": ["admin", "editor"],
  /** See the Flocks, the Locations and the Shepherds, and the Flock history of a Sheep. */
  "flock.view": ["admin", "editor"],
  /** Make a Flock. */
  "flock.create": ["admin", "editor"],
  /** Change the name or the Location of a Flock. */
  "flock.update": ["admin", "editor"],
  /** Archive a Flock, or take it out of the archive. */
  "flock.archive": ["admin", "editor"],
  /** Assign a Shepherd to a Flock, change the dates of an assignment, or remove it. */
  "flock.assignShepherd": ["admin", "editor"],
  /** Make a Location. */
  "location.create": ["admin", "editor"],
  /** Change the name or the notes of a Location. */
  "location.update": ["admin", "editor"],
  /** Archive a Location, or take it out of the archive. */
  "location.archive": ["admin", "editor"],
  /** Add a Shepherd. */
  "shepherd.create": ["admin", "editor"],
  /** Change the name, the phone or the notes of a Shepherd. */
  "shepherd.update": ["admin", "editor"],
  /** Archive a Shepherd, or take the Shepherd out of the archive. */
  "shepherd.archive": ["admin", "editor"],
  /** See the Expenses and the Incomes, and their categories. */
  "money.view": ["admin", "editor"],
  /** Record an Expense or an Income. */
  "money.create": ["admin", "editor"],
  /** Change an Expense or an Income. */
  "money.update": ["admin", "editor"],
  /** Make an Expense or an Income Deleted, for a record made by mistake. */
  "money.delete": ["admin", "editor"],
  /** Add a category of Expenses or of Incomes. */
  "moneyCategory.create": ["admin", "editor"],
  /** Rename a category. */
  "moneyCategory.update": ["admin", "editor"],
  /** Archive a category, or take it out of the archive. */
  "moneyCategory.archive": ["admin", "editor"],
  /** Make a category that no record uses Deleted. */
  "moneyCategory.delete": ["admin", "editor"],
  /** See the Sales and the Purchases. */
  "deal.view": ["admin", "editor"],
  /** Sell Active Sheep, or buy new Sheep. */
  "deal.create": ["admin", "editor"],
  /** Change the price of a Sale or a Purchase. */
  "deal.update": ["admin", "editor"],
  /** Cancel a Sale or a Purchase made by mistake, with its Automatic record. */
  "deal.cancel": ["admin", "editor"],
  /** See the Resources, their Stock and their events. */
  "resource.view": ["admin", "editor"],
  /** Add a Resource. */
  "resource.create": ["admin", "editor"],
  /** Change the name or the unit of a Resource. */
  "resource.update": ["admin", "editor"],
  /** Archive a Resource, or take it out of the archive. */
  "resource.archive": ["admin", "editor"],
  /** Record a Restock, a Usage or an Adjustment of a Resource, or cancel one. */
  "resource.record": ["admin", "editor"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof permissions;

/** Anything that belongs to one Farm: the Farm itself, or one of its records. */
export interface Target {
  farmId: FarmId;
}

/**
 * True if the Member can do the action to the target. A Member never acts on a record of another
 * Farm, whatever the Role.
 */
export function can(actor: Member, action: Action, target: Target): boolean {
  if (actor.farmId !== target.farmId) return false;
  return (permissions[action] as readonly Role[]).includes(actor.role);
}

/** Throws `access.denied` if the Member cannot do the action to the target. */
export function authorize(actor: Member, action: Action, target: Target): void {
  if (!can(actor, action, target)) throw new DomainError("access.denied");
}
