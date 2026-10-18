import { DomainError, isErrorCode } from "@arashan/core";
import { ConvexError } from "convex/values";

/**
 * The DomainError in an error from the backend, or null if the error is not a domain error. The
 * backend sends a DomainError as a `ConvexError` with its code; this turns it back into the type of
 * the core, so the view does not see Convex.
 */
export function toDomainError(error: unknown): DomainError | null {
  if (error instanceof DomainError) return error;
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "object" && data !== null && "code" in data && isErrorCode(data.code)) {
      return new DomainError(data.code);
    }
  }
  return null;
}

/** Calls a mutation of the backend; a domain error from it comes out as a DomainError. */
export async function callCommand<Args, Result>(
  mutation: (args: Args) => Promise<Result>,
  args: Args,
): Promise<Result> {
  try {
    return await mutation(args);
  } catch (error) {
    throw toDomainError(error) ?? error;
  }
}
