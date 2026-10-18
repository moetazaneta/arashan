/**
 * The id of a record of one kind, such as `Id<"Sample">`. The backend makes the ids; the core only
 * compares and passes them. The brand stops an id of one kind from going where another kind goes.
 */
export type Id<Kind extends string> = string & { readonly __kind: Kind };
