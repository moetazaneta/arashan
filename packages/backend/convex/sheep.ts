import {
  type BreedShare,
  changeSheepOwner,
  deleteSheep,
  getSheep,
  getSheepHistory,
  getSheepPedigree,
  listParentOptions,
  listSheep,
  listSheepOwners,
  type MembershipId,
  type Passport,
  registerExternalSheep,
  registerSheep,
  requestPassportScanUpload,
  type SheepId,
  updateSheep,
} from "@arashan/core";
import { type ObjectType, v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Sheep registry of a Farm. The ids of Sheep, Memberships, Breeds and files are strings, not
// `v.id(…)`: the core gets its own ids, and an unknown id is a domain error.

const sex = v.union(v.literal("ram"), v.literal("ewe"));
/** The Origin of a Sheep that a Member registers: an External Sheep comes with the pedigree. */
const registeredOrigin = v.union(v.literal("born"), v.literal("bought"));
/** A text that the Member can leave empty. */
const optionalText = v.union(v.string(), v.null());

/** The fields of the form of a Sheep. A date is "YYYY-MM-DD". */
const details = {
  tag: optionalText,
  name: optionalText,
  sex,
  birthDate: optionalText,
  notes: optionalText,
  weight: v.union(v.object({ kg: v.number(), date: v.string() }), v.null()),
};

/** The parents of a Sheep, and the parts of its Breed composition by hand, in millionths. */
const parents = {
  motherId: v.optional(v.union(v.string(), v.null())),
  fatherId: v.optional(v.union(v.string(), v.null())),
  manualBreeds: v.optional(v.array(v.object({ breedId: v.string(), share: v.number() }))),
};

/**
 * The fields of the block «Дополнительно» of the form: the parents, the parts by hand, the Passport
 * and the Grade. Each one is optional: a field that the client leaves out stays the same.
 */
const pedigreeFields = {
  ...parents,
  passport: v.optional(
    v.union(
      v.object({
        number: v.string(),
        issueDate: v.string(),
        scanId: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
  ),
  grade: v.optional(
    v.union(
      v.object({
        grade: v.union(v.literal("elite"), v.literal("first"), v.literal("second")),
        date: v.string(),
      }),
      v.null(),
    ),
  ),
};

/** The parents and the parts by hand with the ids of the core. A field left out stays undefined. */
function parentIds(args: ObjectType<typeof parents>) {
  return {
    motherId: args.motherId as SheepId | null | undefined,
    fatherId: args.fatherId as SheepId | null | undefined,
    manualBreeds: args.manualBreeds as BreedShare[] | undefined,
  };
}

/** The fields of the block «Дополнительно» with the ids of the core. */
function pedigreeIds(args: ObjectType<typeof pedigreeFields>) {
  return { ...parentIds(args), passport: args.passport as Passport | null | undefined };
}

/** The Sheep of the Farm for the table «Бараны», without the Deleted ones. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listSheep(ctx),
});

/** The card of a Sheep with the history of its Owners, or null if it is Deleted or not found. */
export const get = farmQuery({
  args: { sheepId: v.string() },
  handler: (ctx, args) => getSheep(ctx, { sheepId: args.sheepId as SheepId }),
});

/** Who changed a Sheep and when, the newest first: the tab «История» of the card. */
export const history = farmQuery({
  args: { sheepId: v.string() },
  handler: (ctx, args) => getSheepHistory(ctx, { sheepId: args.sheepId as SheepId }),
});

/** The Members who can own a Sheep now: the choices of the Owner in the forms. */
export const owners = farmQuery({
  args: {},
  handler: (ctx) => listSheepOwners(ctx),
});

/**
 * The Sheep that can be the Mother or the Father in a form, also the External ones, with their
 * Breed composition.
 */
export const parentOptions = farmQuery({
  args: {},
  handler: (ctx) => listParentOptions(ctx),
});

/** The pedigree tree of a Sheep for three generations, or null if it is Deleted or not found. */
export const pedigree = farmQuery({
  args: { sheepId: v.string() },
  handler: (ctx, args) => getSheepPedigree(ctx, { sheepId: args.sheepId as SheepId }),
});

/** A Member registers a Sheep, and gets its id. */
export const register = farmCommand({
  args: {
    ...details,
    ...pedigreeFields,
    ownerId: v.string(),
    origin: registeredOrigin,
    initialEntry: v.boolean(),
  },
  handler: (ctx, args) =>
    registerSheep(ctx, { ...args, ...pedigreeIds(args), ownerId: args.ownerId as MembershipId }),
});

/**
 * A Member registers an External Sheep: a parent that was never on the Farm. It has no Owner and no
 * weight. The Member gets its id.
 */
export const registerExternal = farmCommand({
  args: {
    tag: optionalText,
    name: optionalText,
    sex,
    birthDate: optionalText,
    notes: optionalText,
    ...parents,
  },
  handler: (ctx, args) => registerExternalSheep(ctx, { ...args, ...parentIds(args) }),
});

/** A Member changes the fields of a Sheep. The Origin changes only for an Initial entry. */
export const update = farmCommand({
  args: {
    sheepId: v.string(),
    ...details,
    ...pedigreeFields,
    origin: v.optional(registeredOrigin),
  },
  handler: (ctx, args) =>
    updateSheep(ctx, { ...args, ...pedigreeIds(args), sheepId: args.sheepId as SheepId }),
});

/**
 * A URL to which the client uploads the scan of a Passport, for a short time. The answer to the
 * upload gives the id of the file, which the form then sends as the `scanId` of the Passport.
 */
export const passportUploadUrl = farmCommand({
  args: {},
  handler: (ctx) => requestPassportScanUpload(ctx),
});

/** A Member gives an Active Sheep to another Member, on a date "YYYY-MM-DD". */
export const changeOwner = farmCommand({
  args: { sheepId: v.string(), ownerId: v.string(), date: v.string() },
  handler: (ctx, args) =>
    changeSheepOwner(ctx, {
      sheepId: args.sheepId as SheepId,
      ownerId: args.ownerId as MembershipId,
      date: args.date,
    }),
});

/**
 * A Member deletes a Sheep that was registered by mistake: it becomes Deleted (ADR 0005). The name
 * is not `delete`, because that is a reserved word.
 */
export const markDeleted = farmCommand({
  args: { sheepId: v.string() },
  handler: (ctx, args) => deleteSheep(ctx, { sheepId: args.sheepId as SheepId }),
});
