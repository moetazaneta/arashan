import type { Sample, SampleId, SampleRepository } from "./sample";

/** A SampleRepository in memory, for the tests of the core. It hides Deleted Samples, as the real one does. */
export class InMemorySampleRepository implements SampleRepository {
  readonly records: (Sample & { deletedAt?: number })[] = [];

  async get(id: SampleId) {
    return this.active().find((sample) => sample.id === id) ?? null;
  }

  async list() {
    return this.active().sort((a, b) => a.name.localeCompare(b.name));
  }

  async findByName(name: string) {
    return this.active().find((sample) => sample.name === name) ?? null;
  }

  async insert(sample: { name: string }) {
    const id = `sample-${this.records.length + 1}` as SampleId;
    this.records.push({ id, ...sample });
    return id;
  }

  async markDeleted(id: SampleId, deletedAt: number) {
    const record = this.records.find((sample) => sample.id === id);
    if (record !== undefined) record.deletedAt = deletedAt;
  }

  private active(): Sample[] {
    return this.records
      .filter((record) => record.deletedAt === undefined)
      .map(({ id, name }) => ({ id, name }));
  }
}
