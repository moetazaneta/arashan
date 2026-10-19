import {
  cancelDeal,
  cancelResourceEvent,
  dateAt,
  deleteBreed,
  deleteMoneyCategory,
  deleteMoneyRecord,
  deleteSheep,
  recordUsage,
  removeShepherdAssignment,
} from "@arashan/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { currencySymbol, formatAmount } from "@/format";
import {
  addAssignment,
  addBreed,
  addDefaultMoneyCategories,
  addFlock,
  addMembers,
  addMoneyCategory,
  addMoneyRecord,
  addResource,
  addResourceEvent,
  addSale,
  addShepherd,
  addSheep,
  aFarm,
  aMember,
  moneyCategoryOf,
  runCommand,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** The symbol of the currency of the Farm. */
const som = currencySymbol("KGS", "ru");

function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"));
  addDefaultMoneyCategories(farm);
  return farm;
}

/** The rows of the table «Корзина», as their text. */
function trashRows() {
  const table = screen.getByRole("table", { name: "Корзина" });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
}

test("an Editor opens the Trash from the navigation; with nothing deleted, it is empty", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "1" });
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Корзина" }));

  await screen.findByRole("heading", { name: "Корзина" });
  expect(await screen.findByText("Корзина пуста")).toBeTruthy();
  expect(screen.queryByRole("table", { name: "Корзина" })).toBeNull();
});

test("a Member restores a deleted Sheep: it leaves the Trash and is back in the Sheep table", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const today = dateAt(Date.now(), farm.timeZone);
  const lost = addSheep(farm, { tag: "1", name: "Белка" });
  await runCommand(farm, (ctx) => deleteSheep(ctx, { sheepId: lost }));
  const sold = addSheep(farm, { tag: "2" });
  const saleId = await addSale(farm, { sheepIds: [sold], date: today, price: 500_00 });
  await runCommand(farm, (ctx) => cancelDeal(ctx, { dealId: saleId }));
  renderApp(`/farms/${farm.id}/trash`);

  const sheepRow = await screen.findByRole("row", { name: /Белка/ });
  expect(sheepRow.textContent).toMatch(/^Баран1 Белка/);
  const saleRow = screen.getByRole("row", { name: /^Продажа/ });
  expect(saleRow.textContent).toContain(`${formatAmount(500_00, "ru")} ${som} · 1 баран: 2`);

  await user.click(within(sheepRow).getByRole("button", { name: "Восстановить" }));

  await waitFor(() => expect(screen.queryByRole("row", { name: /Белка/ })).toBeNull());
  expect(trashRows()).toEqual([expect.stringMatching(/^Продажа/)]);
  await user.click(screen.getByRole("link", { name: "Бараны" }));
  expect(await screen.findByRole("checkbox", { name: "Выбрать барана 1" })).toBeTruthy();
});

test("a restore that breaks a rule says why, and the record stays in the Trash", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const deleted = addSheep(farm, { tag: "7" });
  await runCommand(farm, (ctx) => deleteSheep(ctx, { sheepId: deleted }));
  // While the Sheep is Deleted, another Sheep takes its Tag.
  addSheep(farm, { tag: "7" });
  renderApp(`/farms/${farm.id}/trash`);

  const row = await screen.findByRole("row", { name: /^Баран 7 / });
  await user.click(within(row).getByRole("button", { name: "Восстановить" }));

  expect((await within(row).findByRole("alert")).textContent).toBe(
    "Эта бирка уже есть у другого барана фермы. Проверьте номер.",
  );
  expect(trashRows()).toHaveLength(1);
});

test("the Trash says what each Deleted record is", async () => {
  const farm = memberOfFarm();
  const expenseId = addMoneyRecord(farm, moneyCategoryOf(farm, "expense", "shearing"), {
    date: "2026-10-10",
    amount: 1_500_50,
    notes: "Весной",
  });
  await runCommand(farm, (ctx) => deleteMoneyRecord(ctx, { recordId: expenseId }));
  const categoryId = addMoneyCategory(farm, { kind: "income", name: "Кожа" });
  await runCommand(farm, (ctx) => deleteMoneyCategory(ctx, { categoryId }));
  const breedId = addBreed(farm, "Гиссарская");
  await runCommand(farm, (ctx) => deleteBreed(ctx, { breedId }));
  const flockId = addFlock(farm, { name: "Верхнее" });
  const shepherdId = addShepherd(farm, { name: "Асан" });
  const assignmentId = addAssignment(farm, { flockId, shepherdId, from: "2026-09-01" });
  await runCommand(farm, (ctx) => removeShepherdAssignment(ctx, { assignmentId }));
  const resource = addResource(farm, { name: "Сено", unit: "кг" });
  addResourceEvent(resource, { kind: "restock", date: "2026-09-01", quantity: 100_000 });
  const usageId = await runCommand(farm, (ctx) =>
    recordUsage(ctx, { resourceId: resource.id, date: "2026-10-12", quantity: 2_500, flockId }),
  );
  await runCommand(farm, (ctx) => cancelResourceEvent(ctx, { eventId: usageId }));
  const external = addSheep(farm, { tag: "F-9", origin: "external" });
  await runCommand(farm, (ctx) => deleteSheep(ctx, { sheepId: external }));
  renderApp(`/farms/${farm.id}/trash`);

  await screen.findByRole("row", { name: /Гиссарская/ });
  const rows = trashRows();
  expect(rows).toHaveLength(6);
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp(
          `^Расход10\\.10\\.2026 · Стрижка · ${formatAmount(1_500_50, "ru")} ${som} · Весной`,
        ),
      ),
      expect.stringMatching(/^Категория доходовКожа/),
      expect.stringMatching(/^ПородаГиссарская/),
      expect.stringMatching(/^Чабан в стадеАсан · Верхнее · с 01\.09\.2026 по сей день/),
      expect.stringMatching(/^Выдача12\.10\.2026 · Сено · 2,5 кг · Верхнее/),
      expect.stringMatching(/^Внешний баранF-9/),
    ]),
  );
});
