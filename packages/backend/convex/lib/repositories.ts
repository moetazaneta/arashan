import type { Sample, SampleId, SampleReader, SampleRepository } from "@arashan/core";

import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";

// The Convex adapters of the repository ports of the core. Each read hides Deleted records: it goes
// through an index with `deletedAt` undefined, or checks `deletedAt` after a `get`.

function toSample(doc: Doc<"samples">): Sample {
  return { id: doc._id as string as SampleId, name: doc.name };
}

async function getActiveSample(db: DatabaseReader, id: SampleId) {
  const docId = db.normalizeId("samples", id);
  const doc = docId === null ? null : await db.get("samples", docId);
  return doc === null || doc.deletedAt !== undefined ? null : doc;
}

export function sampleReader(db: DatabaseReader): SampleReader {
  return {
    async get(id) {
      const doc = await getActiveSample(db, id);
      return doc === null ? null : toSample(doc);
    },
    async list() {
      const docs = await db
        .query("samples")
        .withIndex("by_deletedAt_name", (q) => q.eq("deletedAt", undefined))
        .collect();
      return docs.map(toSample);
    },
    async findByName(name) {
      const doc = await db
        .query("samples")
        .withIndex("by_deletedAt_name", (q) => q.eq("deletedAt", undefined).eq("name", name))
        .first();
      return doc === null ? null : toSample(doc);
    },
  };
}

export function sampleRepository(db: DatabaseWriter): SampleRepository {
  return {
    ...sampleReader(db),
    async insert(sample) {
      return (await db.insert("samples", sample)) as string as SampleId;
    },
    async markDeleted(id, deletedAt) {
      const doc = await getActiveSample(db, id);
      if (doc !== null) await db.patch("samples", doc._id, { deletedAt });
    },
  };
}
