import type { Member } from "../access/permissions";
import type { FarmId, UserId } from "../ids";

/**
 * The name of each command that writes to the audit log. A new command adds its name here, so that
 * the history can show it.
 */
export type CommandName =
  | "user.register"
  | "user.updateUsername"
  | "user.setOperator"
  | "farm.create"
  | "farm.inviteAdmin"
  | "farm.updateSettings"
  | "invite.accept"
  | "member.invite"
  | "member.changeRole"
  | "member.remove"
  | "member.requestPassword"
  | "member.setPassword"
  | "member.setPasswordFailed"
  | "member.setPasswordUnknown"
  | "sheep.register"
  | "sheep.update"
  | "sheep.changeOwner"
  | "sheep.delete"
  | "sheep.move"
  | "sheep.undoMove"
  | "flock.create"
  | "flock.update"
  | "flock.archive"
  | "flock.unarchive"
  | "flock.assignShepherd"
  | "flock.updateAssignment"
  | "flock.removeAssignment"
  | "location.create"
  | "location.update"
  | "location.archive"
  | "location.unarchive"
  | "shepherd.create"
  | "shepherd.update"
  | "shepherd.archive"
  | "shepherd.unarchive";

/** The kind of record that a command changed. */
export type TargetKind =
  | "User"
  | "Farm"
  | "Membership"
  | "Invite"
  | "Sheep"
  | "Flock"
  | "Location"
  | "Shepherd";

/** One record of the audit log: who did what to which record, and when. */
export interface AuditEntry {
  /** When the command ran, in milliseconds since the Unix epoch. */
  at: number;
  /** The User who ran the command, or null for the CLI (an internal function). */
  actorId: UserId | null;
  /** The Farm of the target, or null if the target belongs to no Farm, such as a User. */
  farmId: FarmId | null;
  command: CommandName;
  target: { kind: TargetKind; id: string };
}

/**
 * The audit log. Each command that changes a record appends one entry. Nothing changes or erases an
 * entry. `FarmAuditReader` reads the entries of one record.
 */
export interface AuditLog {
  append(entry: AuditEntry): Promise<void>;
}

/**
 * Reads the audit log of one Farm, for the history of a record (the tab «История»). The backend
 * binds it to the Farm, so it never gives an entry of another Farm.
 */
export interface FarmAuditReader {
  /** The entries of the record, the oldest first. */
  listForTarget(target: AuditEntry["target"]): Promise<AuditEntry[]>;
}

/** Appends an entry to the audit log, at the time now. A command can append more than one. */
export function recordAudit(
  ctx: { repos: { audit: AuditLog }; now(): number },
  entry: Omit<AuditEntry, "at">,
): Promise<void> {
  return ctx.repos.audit.append({ ...entry, at: ctx.now() });
}

/** Appends an entry of a command of one Farm: the actor is the Member, and the Farm is the Farm. */
export function recordFarmAudit(
  ctx: { repos: { audit: AuditLog }; now(): number; member: Member },
  entry: Pick<AuditEntry, "command" | "target">,
): Promise<void> {
  return recordAudit(ctx, { ...entry, actorId: ctx.member.userId, farmId: ctx.member.farmId });
}
