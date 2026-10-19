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
  "farm.currencyLocked",
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
  "member.ownsLostSheep",
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
  "sheep.birthDateAfterFlockMove",
  "sheep.birthDateAfterStatusChange",
  "sheep.purchaseRequired",
  "sheep.originLocked",
  "sheep.ownerNotMember",
  "sheep.weightInvalid",
  "sheep.weighingDateInvalid",
  "sheep.notActive",
  "sheep.sameOwner",
  "sheep.ownerChangeDateInvalid",
  "sheep.isParent",
  "sheep.inDeal",
  "sheep.breedsInvalid",
  "sheep.breedsTooLarge",
  "sheep.gradeDateInvalid",
  // Pedigree.
  "pedigree.parentNotFound",
  "pedigree.motherNotEwe",
  "pedigree.fatherNotRam",
  "pedigree.parentBornAfterChild",
  "pedigree.ownAncestor",
  "pedigree.parentSexLocked",
  // Passports.
  "passport.numberRequired",
  "passport.numberTooLong",
  "passport.issueDateInvalid",
  "passport.scanInvalid",
  "passport.notArashan",
  "passport.descendantNotArashan",
  // Breeds.
  "breed.notFound",
  "breed.nameRequired",
  "breed.nameTooLong",
  "breed.nameTaken",
  "breed.inUse",
  "breed.arashanLocked",
  "breed.archived",
  "sheep.moveDateInvalid",
  "sheep.tooManyToMove",
  "sheep.noMoveToUndo",
  "sheep.notLost",
  "sheep.statusDateInvalid",
  "sheep.reasonTooLong",
  "sheep.tooManyToChangeStatus",
  "sheep.noStatusChangeToUndo",
  "sheep.movedAfterFound",
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
  // Expenses and Incomes.
  "money.notFound",
  "money.dateInvalid",
  "money.dateInFuture",
  "money.periodInvalid",
  "money.amountInvalid",
  "money.notesTooLong",
  "money.shepherdRequired",
  "money.shepherdNotAllowed",
  "money.automatic",
  // The categories of Expenses and Incomes.
  "moneyCategory.notFound",
  "moneyCategory.nameRequired",
  "moneyCategory.nameTooLong",
  "moneyCategory.nameTaken",
  "moneyCategory.system",
  "moneyCategory.archived",
  "moneyCategory.inUse",
  // Sales and Purchases.
  "deal.notFound",
  "deal.noSheep",
  "deal.tooManySheep",
  "deal.dateInvalid",
  "deal.dateInFuture",
  "deal.priceInvalid",
  "deal.bornAfterPurchase",
  "deal.sheepSold",
  // Resources and their events.
  "resource.notFound",
  "resource.nameRequired",
  "resource.nameTooLong",
  "resource.nameTaken",
  "resource.unitRequired",
  "resource.unitTooLong",
  "resource.unitLocked",
  "resource.archived",
  "resource.dateInvalid",
  "resource.dateInFuture",
  "resource.quantityInvalid",
  "resource.reasonRequired",
  "resource.reasonTooLong",
  "resource.adjustmentNoChange",
  "resource.eventNotFound",
  // Reports.
  "report.dateInvalid",
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
