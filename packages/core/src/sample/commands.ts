import type { CommandContext, QueryContext } from "../context";
import { DomainError } from "../errors";
import type { Sample, SampleId } from "./sample";

export function listSamples(ctx: QueryContext): Promise<Sample[]> {
  return ctx.repos.samples.list();
}

/** Adds a Sample. The name must not be empty, and no other Sample that is not Deleted has it. */
export async function addSample(ctx: CommandContext, input: { name: string }): Promise<SampleId> {
  const name = input.name.trim();
  if (name === "") throw new DomainError("sample.nameRequired");
  if ((await ctx.repos.samples.findByName(name)) !== null) {
    throw new DomainError("sample.nameTaken");
  }
  return ctx.repos.samples.insert({ name });
}

/** Marks a Sample Deleted. A Member can restore it later; nothing erases it. */
export async function deleteSample(ctx: CommandContext, input: { id: SampleId }): Promise<void> {
  if ((await ctx.repos.samples.get(input.id)) === null) throw new DomainError("sample.notFound");
  await ctx.repos.samples.markDeleted(input.id, ctx.now());
}
