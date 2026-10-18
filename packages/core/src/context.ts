import type { SampleReader, SampleRepository } from "./sample/sample";

/**
 * What a query gets from the backend: read-only repositories. Later slices add the actor and the
 * Farm here, so the signature of each query stays the same.
 */
export interface QueryContext {
  repos: {
    samples: SampleReader;
  };
}

/**
 * What a command gets from the backend: repositories that can write, and the clock. Later slices
 * add the actor, the permission check and the audit log here.
 */
export interface CommandContext {
  repos: {
    samples: SampleRepository;
  };
  /** The time now, in milliseconds since the Unix epoch. */
  now(): number;
}
