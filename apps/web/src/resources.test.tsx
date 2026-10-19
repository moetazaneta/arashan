import { dateAt } from "@arashan/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { formatCalendarDate } from "@/format";
import {
  addDefaultMoneyCategories,
  addFlock,
  addResource,
  addResourceEvent,
  aFarm,
  fakeMoneyRecords,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** A Member "aibek" of a Farm. */
function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  return farm;
}

/** The rows of the body of a table, as their text, with plain spaces and minus signs. */
function rowsOf(name: string) {
  const table = screen.getByRole("table", { name });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => (row.textContent ?? "").replace(/[\u00a0\u202f]/g, " ").replace(/\u2212/g, "-"));
}

/** The field (label, control, message) of a control. */
function fieldOf(control: HTMLElement) {
  const field = control.closest<HTMLElement>("[data-slot=field]");
  expect(field).not.toBeNull();
  return field!;
}

/** Opens the dialog of the button on the card, and gives it once its first field has the focus. */
async function openDialog(user: ReturnType<typeof userEvent.setup>, button: string, title: RegExp) {
  await user.click(screen.getByRole("button", { name: button }));
  const dialog = await screen.findByRole("dialog", { name: title });
  const quantity = within(dialog).getAllByRole("textbox")[0]!;
  await waitFor(() => expect(document.activeElement).toBe(quantity));
  return dialog;
}

test("a Member adds a Resource, restocks it with a price, gives some to a Flock and counts it", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  addFlock(farm, { name: "Северная" });
  const today = formatCalendarDate(dateAt(Date.now(), farm.timeZone), "ru");
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Ресурсы" }));
  await screen.findByText("Здесь будут корма и другие ресурсы: сено, зерно, комбикорм.");
  await user.click(screen.getByRole("button", { name: "Добавить ресурс" }));
  const create = await screen.findByRole("dialog", { name: "Добавить ресурс" });
  await user.type(within(create).getByRole("textbox", { name: "Название" }), "Сено");
  await user.type(within(create).getByRole("textbox", { name: "Единица измерения" }), "кг");
  await user.click(within(create).getByRole("button", { name: "Добавить ресурс" }));

  // The new Resource opens on its card, with a Stock of 0.
  expect(await screen.findByRole("heading", { name: "Сено" })).toBeTruthy();
  expect(screen.getByText("0 кг")).toBeTruthy();

  const restock = await openDialog(user, "Пополнить", /Пополнение: Сено/);
  await user.type(within(restock).getByRole("textbox", { name: "Количество" }), "1 250,5");
  await user.type(within(restock).getByRole("textbox", { name: "Цена" }), "25 000");
  await user.click(within(restock).getByRole("button", { name: "Записать" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  const usage = await openDialog(user, "Выдать стаду", /Выдача: Сено/);
  await user.type(within(usage).getByRole("textbox", { name: "Количество" }), "50,25");
  await user.click(within(usage).getByRole("button", { name: "Записать" }));
  expect(
    within(fieldOf(within(usage).getByRole("combobox"))).getByText("Выберите стадо."),
  ).toBeTruthy();
  await user.click(within(usage).getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: "Северная" }));
  await user.click(within(usage).getByRole("button", { name: "Записать" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  const count = await openDialog(user, "Пересчитать", /Корректировка: Сено/);
  await user.type(within(count).getByRole("textbox", { name: "Остаток по пересчёту" }), "1190");
  await user.click(within(count).getByRole("button", { name: "Записать" }));
  expect(await within(count).findByText("Укажите причину корректировки.")).toBeTruthy();
  await user.type(within(count).getByRole("textbox", { name: "Причина" }), "Сено сгнило");
  await user.click(within(count).getByRole("button", { name: "Записать" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  // 1 250,5 − 50,25 = 1 200,25; the count found 1 190: −10,25.
  expect(screen.getAllByText("1 190 кг").length).toBeGreaterThan(0);
  const [adjustment, usageRow, restockRow] = rowsOf("Записи ресурса");
  expect(adjustment).toBe(`${today}Корректировка-10,251 190 кгСено сгнило`);
  expect(usageRow).toBe(`${today}Выдача-50,251 200,25 кгСеверная`);
  // The currency symbol of the Farm comes from the browser.
  expect(restockRow).toMatch(new RegExp(`^${today}Пополнение\\+1 250,51 250,5 кг25 000 .+Расход$`));
  expect(fakeMoneyRecords()).toMatchObject([{ amount: 2_500_000, source: { kind: "restock" } }]);
});

test("a Member cancels a Restock made by mistake, and its Expense goes away with it", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  const hay = addResource(farm, { name: "Зерно", unit: "мешок" });
  addResourceEvent(hay, { kind: "restock", date: "2026-01-10", quantity: 10_000 });
  renderApp(`/farms/${farm.id}/resources`);

  expect(await screen.findByRole("table", { name: "Ресурсы" })).toBeTruthy();
  expect(rowsOf("Ресурсы")).toEqual(["Зерно10 мешок"]);
  await user.click(screen.getByText("Зерно"));
  expect(await screen.findByRole("heading", { name: "Зерно" })).toBeTruthy();
  expect(rowsOf("Записи ресурса")[0]).toContain("Без цены");

  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(await screen.findByRole("menuitem", { name: "Отменить" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Отменить запись?" });
  await user.click(within(confirm).getByRole("button", { name: "Отменить запись" }));

  expect(
    await screen.findByText(
      "Здесь будут пополнения, выдачи стадам и корректировки после пересчёта.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("0 мешок")).toBeTruthy();
});

test("an Archived Resource offers no new events, and its unit stays once it has one", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const hay = addResource(farm, { name: "Сено", unit: "тюк" });
  addResourceEvent(hay, { kind: "restock", date: "2026-01-10", quantity: 3_000 });
  renderApp(`/farms/${farm.id}/resources/${hay.id}`);

  expect(await screen.findByRole("heading", { name: "Сено" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Изменить" }));
  const edit = await screen.findByRole("dialog", { name: "Изменить ресурс" });
  const unit = within(edit).getByRole("textbox", { name: "Единица измерения" });
  await user.clear(unit);
  await user.type(unit, "кг");
  await user.click(within(edit).getByRole("button", { name: "Сохранить" }));
  expect(
    await within(fieldOf(unit)).findByText(
      "У ресурса уже есть записи, поэтому единицу измерения изменить нельзя.",
    ),
  ).toBeTruthy();

  await user.click(within(edit).getByRole("button", { name: "В архив" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("В архиве")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Пополнить" })).toBeNull();
});
