/**
 * The id of a record of one kind, such as `Id<"Farm">`. The backend makes the ids; the core only
 * compares and passes them. The brand stops an id of one kind from going where another kind goes.
 */
export type Id<Kind extends string> = string & { readonly __kind: Kind };

export type UserId = Id<"User">;
export type FarmId = Id<"Farm">;
export type MembershipId = Id<"Membership">;
export type InviteId = Id<"Invite">;
export type SheepId = Id<"Sheep">;
export type OwnerChangeId = Id<"OwnerChange">;
export type PasswordResetId = Id<"PasswordReset">;
export type BreedId = Id<"Breed">;
/** A file in the file storage of the app, such as the scan of a Passport. */
export type FileId = Id<"File">;
export type LocationId = Id<"Location">;
export type ShepherdId = Id<"Shepherd">;
export type FlockId = Id<"Flock">;
export type ShepherdAssignmentId = Id<"ShepherdAssignment">;
export type FlockMoveId = Id<"FlockMove">;
