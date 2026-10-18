import { v } from "convex/values";

/**
 * The fields that make a record Deleted, for each table. The app never erases a record (ADR 0005):
 * a Deleted record keeps its row, with the time it became Deleted. Each read in a repository hides
 * these rows, so each table has indexes that start with `deletedAt`.
 */
export const deletable = {
  deletedAt: v.optional(v.number()),
};
