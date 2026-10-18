import type { Id } from "../ids";

// A throwaway module that shows how a command goes through the layers. Delete it when the first
// real slice (#4) adds its own commands.

export type SampleId = Id<"Sample">;

export interface Sample {
  id: SampleId;
  name: string;
}

/** Reads Samples. Each method hides Deleted Samples (ADR 0005). */
export interface SampleReader {
  /** The Sample, or null if there is none or it is Deleted. */
  get(id: SampleId): Promise<Sample | null>;
  /** All Samples that are not Deleted, by name. */
  list(): Promise<Sample[]>;
  /** The Sample with this exact name, or null if there is none or it is Deleted. */
  findByName(name: string): Promise<Sample | null>;
}

/** Reads and writes Samples. Nothing erases a Sample: it only becomes Deleted. */
export interface SampleRepository extends SampleReader {
  insert(sample: { name: string }): Promise<SampleId>;
  markDeleted(id: SampleId, deletedAt: number): Promise<void>;
}
