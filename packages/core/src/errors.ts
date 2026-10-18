/**
 * The codes of all domain errors of the app, in one list. The core gives a code, never a text for
 * people (ADR 0004): the web app has a translated message for each code, and its type check fails
 * if a code has no message. To add an error, add its code here and its message in the web app.
 */
export const errorCodes = [
  // Who makes the request.
  "auth.signedOut",
  "auth.operatorOnly",
  "access.denied",
  // Users.
  "user.notRegistered",
  "user.usernameMissing",
  "user.notFound",
  // Farms.
  "farm.notMember",
  "farm.notFound",
  "farm.hasMembers",
  "farm.nameRequired",
  "farm.currencyInvalid",
  "farm.timeZoneInvalid",
  "farm.lambAgeInvalid",
  // Invites.
  "invite.notFound",
  "invite.used",
  "invite.expired",
  "invite.alreadyMember",
  // Members.
  "member.notFound",
  "member.lastAdmin",
  "member.passwordInvalid",
  "member.passwordNotAllowed",
  "member.passwordRejected",
  "user.passwordResetPending",
  "member.ownsActiveSheep",
  // Sheep.
  "sheep.notFound",
  "sheep.tagTaken",
  "sheep.tagTooLong",
  "sheep.nameTooLong",
  "sheep.notesTooLong",
  "sheep.dateInvalid",
  "sheep.birthDateRequired",
  "sheep.birthDateInFuture",
  "sheep.birthDateAfterOwnerChange",
  "sheep.purchaseRequired",
  "sheep.originLocked",
  "sheep.ownerNotMember",
  "sheep.weightInvalid",
  "sheep.weighingDateInvalid",
  "sheep.notActive",
  "sheep.sameOwner",
  "sheep.ownerChangeDateInvalid",
  "sheep.moveDateInvalid",
  "sheep.tooManyToMove",
  "sheep.noMoveToUndo",
  "sheep.notLost",
  "sheep.statusDateInvalid",
  "sheep.reasonTooLong",
  "sheep.tooManyToChangeStatus",
  "sheep.noStatusChangeToUndo",
  "sheep.inFlock",
  // Locations.
  "location.notFound",
  "location.nameRequired",
  "location.nameTooLong",
  "location.nameTaken",
  "location.notesTooLong",
  "location.archived",
  "location.inUse",
  // Shepherds.
  "shepherd.notFound",
  "shepherd.nameRequired",
  "shepherd.nameTooLong",
  "shepherd.phoneTooLong",
  "shepherd.notesTooLong",
  "shepherd.archived",
  // Flocks.
  "flock.notFound",
  "flock.nameRequired",
  "flock.nameTooLong",
  "flock.nameTaken",
  "flock.archived",
  "flock.notEmpty",
  "flock.assignmentNotFound",
  "flock.assignmentDatesInvalid",
  "flock.assignmentOverlaps",
  "flock.endDateInvalid",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (errorCodes as readonly string[]).includes(value);
}

/**
 * A command or a query broke a business rule. The backend sends only the code to the client, and the
 * view shows the translated message for it.
 */
export class DomainError extends Error {
  override readonly name = "DomainError";
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}
