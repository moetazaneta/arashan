import { expect, test } from "vite-plus/test";

import { setup } from "../test.setup";
import { audited } from "./functions";

const farm = {
  name: "Арашан",
  currency: "KGS",
  timeZone: "Asia/Bishkek",
  lambAgeMonths: 4,
  createdAt: 0,
};

test("a command that writes a record but no audit entry fails, and writes nothing", async () => {
  const t = setup();

  await expect(
    t.run((ctx) =>
      audited(ctx.db, async (records) => {
        await records.insert("farms", farm);
      }),
    ),
  ).rejects.toThrow("no audit entry");
  expect(await t.run((ctx) => ctx.db.query("farms").collect())).toEqual([]);
});

test("a command that writes a record and an audit entry, or writes nothing, passes", async () => {
  const t = setup();

  await t.run((ctx) =>
    audited(ctx.db, async (records, audit) => {
      const farmId = await records.insert("farms", farm);
      await audit.insert("auditLog", {
        at: 0,
        actorId: null,
        farmId,
        command: "farm.create",
        targetKind: "Farm",
        targetId: farmId,
      });
    }),
  );
  await t.run((ctx) =>
    audited(ctx.db, async (records) => void (await records.query("farms").collect())),
  );

  expect(await t.run((ctx) => ctx.db.query("farms").collect())).toHaveLength(1);
});
