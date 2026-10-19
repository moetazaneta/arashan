import { dateAt } from "@arashan/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { formatAmount } from "@/format";
import {
  addDefaultMoneyCategories,
  addFlock,
  addMoneyRecord,
  addSheep,
  aFarm,
  moneyCategoryOf,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** A Member "aibek" of a Farm. */
function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  return farm;
}

/** The rows of a table under its header, the total too, as their text. */
function rowsOf(name: string) {
  const table = screen.getByRole("table", { name });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
}

/** An amount of whole units, as a table shows it. */
function amount(units: number) {
  return formatAmount(units * 100, "ru");
}

const day = 24 * 60 * 60 * 1000;

test("the head count shows the Sheep by Status, group and Flock", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const flockId = addFlock(farm, { name: "Северная" });
  addSheep(farm, { sex: "ram", flockId });
  addSheep(farm, { sex: "ewe", birthDate: dateAt(Date.now() - 30 * day, farm.timeZone), flockId });
  addSheep(farm, { sex: "ewe" });
  addSheep(farm, { sex: "ewe", status: "dead" });
  addSheep(farm, { sex: "ram", origin: "external" });
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Отчёты" }));
  expect(await screen.findByRole("heading", { name: "Отчёты" })).toBeTruthy();
  await screen.findByRole("table", { name: "По статусу" });
  await waitFor(() =>
    expect(rowsOf("По статусу")).toEqual([
      "Активные3",
      "Потерянные0",
      "Проданные0",
      "Забитые0",
      "Павшие1",
      "Всего4",
    ]),
  );
  expect(rowsOf("По группам")).toEqual(["Самцы1", "Самки1", "Ягнята1", "Всего3"]);
  expect(rowsOf("По стадам")).toEqual(["Северная2", "Без стада1", "Всего3"]);
});

test("the money report gives the Incomes minus the Expenses of the period, with Automatic records", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  const year = Number(dateAt(Date.now(), farm.timeZone).slice(0, 4));
  addMoneyRecord(farm, moneyCategoryOf(farm, "expense", "shearing"), {
    date: `${year}-01-10`,
    amount: 3_000_00,
  });
  // The Automatic Expense of a Restock with a price.
  addMoneyRecord(farm, moneyCategoryOf(farm, "expense", "restock"), {
    date: `${year}-01-11`,
    amount: 5_000_00,
    source: { kind: "restock", id: "restock-1" },
  });
  addMoneyRecord(farm, moneyCategoryOf(farm, "income", "wool"), {
    kind: "income",
    date: `${year}-01-12`,
    amount: 10_000_00,
  });
  addMoneyRecord(farm, moneyCategoryOf(farm, "income", "wool"), {
    kind: "income",
    date: `${year - 1}-06-01`,
    amount: 1_000_00,
  });
  renderApp(`/farms/${farm.id}/reports?tab=money`);

  await screen.findByRole("table", { name: "Деньги за период" });
  await waitFor(() =>
    expect(rowsOf("Деньги за период")).toEqual([
      `Доходы1${amount(10_000)}`,
      `Шерсть1${amount(10_000)}`,
      `Расходы2${amount(8_000)}`,
      `Пополнение ресурсаАвто1${amount(5_000)}`,
      `Стрижка1${amount(3_000)}`,
      `Доходы минус расходы${amount(2_000)}`,
    ]),
  );

  await user.click(screen.getByRole("combobox", { name: "Период" }));
  await user.click(await screen.findByRole("option", { name: "Прошлый год" }));
  await waitFor(() =>
    expect(rowsOf("Деньги за период")).toEqual([
      `Доходы1${amount(1_000)}`,
      `Шерсть1${amount(1_000)}`,
      "Расходы00",
      "Нет расходов за этот период.",
      `Доходы минус расходы${amount(1_000)}`,
    ]),
  );
});
