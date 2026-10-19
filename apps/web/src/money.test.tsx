import { dateAt } from "@arashan/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { formatAmount, formatCalendarDate } from "@/format";
import {
  addDefaultMoneyCategories,
  addMoneyCategory,
  addMoneyRecord,
  addShepherd,
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

/** The field (label, control, message) of a control. */
function fieldOf(control: HTMLElement) {
  const field = control.closest<HTMLElement>("[data-slot=field]");
  expect(field).not.toBeNull();
  return field!;
}

/** An amount of whole units, as a table shows it. */
function amount(units: number) {
  return formatAmount(units * 100, "ru");
}

/** Opens a select, and gives the text of its options. */
async function optionsOf(user: ReturnType<typeof userEvent.setup>, select: HTMLElement) {
  await user.click(select);
  const options = await screen.findAllByRole("option");
  return options.map((option) => option.textContent);
}

test("a Farm made before the Expenses gets the default categories when a Member opens them", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Расходы" }));
  expect(await screen.findByRole("heading", { name: "Расходы" })).toBeTruthy();
  expect(await screen.findByText("Здесь будут расходы фермы за этот год.")).toBeTruthy();

  await user.click(screen.getByRole("tab", { name: "Категории" }));
  await screen.findByRole("table", { name: "Категории" });
  await waitFor(() =>
    expect(rowsOf("Категории")).toEqual([
      "Стрижка",
      "Лечение",
      "Оплата чабану",
      "Оборудование",
      "Прочее",
      "Покупка барановСистемная",
      "Пополнение ресурсаСистемная",
    ]),
  );
});

test("an Expense of «Оплата чабану» needs a Shepherd, and the new row adds to the total", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  addMoneyRecord(farm, moneyCategoryOf(farm, "expense", "shearing"), { amount: 2_000_00 });
  addShepherd(farm, { name: "Асан" });
  addShepherd(farm, { name: "Бакыт", archivedAt: Date.now() });
  renderApp(`/farms/${farm.id}/expenses`);

  await screen.findByRole("table", { name: "Расходы" });
  await user.keyboard("n");
  const dialog = await screen.findByRole("dialog", { name: "Добавить расход" });
  const amountField = within(dialog).getByRole("textbox", { name: "Сумма" });
  // The date is today by default, so the amount has the focus.
  await waitFor(() => expect(document.activeElement).toBe(amountField));
  expect(within(dialog).getByLabelText("Дата")).toHaveProperty(
    "value",
    dateAt(Date.now(), farm.timeZone),
  );
  await user.type(amountField, "15 000");
  await user.click(within(dialog).getByRole("combobox", { name: "Категория" }));
  await user.click(await screen.findByRole("option", { name: "Оплата чабану" }));
  await user.click(within(dialog).getByRole("button", { name: "Добавить расход" }));

  const shepherd = within(dialog).getByRole("combobox", { name: "Чабан" });
  expect(
    await within(fieldOf(shepherd)).findByText("Выберите чабана, которому заплатили."),
  ).toBeTruthy();
  // The form offers no Archived Shepherd.
  expect(await optionsOf(user, shepherd)).toEqual(["Асан"]);
  await user.click(screen.getByRole("option", { name: "Асан" }));
  await user.click(within(dialog).getByRole("button", { name: "Добавить расход" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const today = formatCalendarDate(dateAt(Date.now(), farm.timeZone), "ru");
  await waitFor(() =>
    expect(rowsOf("Расходы")).toEqual([
      `${today}Оплата чабану${amount(15_000)}ФермаАсан—`,
      `${today}Стрижка${amount(2_000)}Ферма——`,
      `Итого${amount(17_000)}`,
    ]),
  );
});

test("the form of an Income offers no System or Archived category, and reads the amount", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  addMoneyCategory(farm, { kind: "income", name: "Аренда", archivedAt: Date.now() });
  renderApp(`/farms/${farm.id}/incomes`);

  await user.click(await screen.findByRole("button", { name: "Добавить доход" }));
  const dialog = await screen.findByRole("dialog", { name: "Добавить доход" });
  const category = within(dialog).getByRole("combobox", { name: "Категория" });
  expect(await optionsOf(user, category)).toEqual(["Шерсть", "Мясо", "Прочее"]);
  await user.click(screen.getByRole("option", { name: "Шерсть" }));
  const amountField = within(dialog).getByRole("textbox", { name: "Сумма" });
  await user.type(amountField, "1 500,505");
  await user.click(within(dialog).getByRole("button", { name: "Добавить доход" }));

  expect(
    await within(fieldOf(amountField)).findByText(
      "Введите сумму больше нуля и не больше миллиарда, например 1500 или 1500,50.",
    ),
  ).toBeTruthy();
  await user.clear(amountField);
  await user.type(amountField, "1 500,50{Enter}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await screen.findByRole("table", { name: "Доходы" });
  expect(rowsOf("Доходы").at(-1)).toBe(`Итого${formatAmount(1_500_50, "ru")}`);
});

test("the filters show the records of a category and of a period", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  const shearing = moneyCategoryOf(farm, "expense", "shearing");
  const treatment = moneyCategoryOf(farm, "expense", "treatment");
  const year = Number(dateAt(Date.now(), farm.timeZone).slice(0, 4));
  addMoneyRecord(farm, shearing, { amount: 5_000_00 });
  addMoneyRecord(farm, treatment, { amount: 2_000_00 });
  addMoneyRecord(farm, shearing, { amount: 1_000_00, date: `${year - 1}-06-01` });
  renderApp(`/farms/${farm.id}/expenses`);

  // The page opens on this year.
  await screen.findByRole("table", { name: "Расходы" });
  await waitFor(() => expect(rowsOf("Расходы").at(-1)).toBe(`Итого${amount(7_000)}`));

  await user.click(screen.getByRole("combobox", { name: "Категория" }));
  await user.click(await screen.findByRole("option", { name: "Стрижка" }));
  await waitFor(() => expect(rowsOf("Расходы")).toHaveLength(2));
  expect(rowsOf("Расходы").at(-1)).toBe(`Итого${amount(5_000)}`);

  await user.click(screen.getByRole("combobox", { name: "Период" }));
  await user.click(await screen.findByRole("option", { name: "Прошлый год" }));
  await waitFor(() =>
    expect(rowsOf("Расходы")).toEqual([
      `${formatCalendarDate(`${year - 1}-06-01`, "ru")}Стрижка${amount(1_000)}Ферма——`,
      `Итого${amount(1_000)}`,
    ]),
  );

  await user.click(screen.getByRole("combobox", { name: "Период" }));
  await user.click(await screen.findByRole("option", { name: "Всё время" }));
  await waitFor(() => expect(rowsOf("Расходы").at(-1)).toBe(`Итого${amount(6_000)}`));
});

test("a Member deletes a record after a confirmation, but not an Automatic one", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  addMoneyRecord(farm, moneyCategoryOf(farm, "income", "wool"), {
    kind: "income",
    amount: 3_000_00,
    notes: "Весенняя стрижка",
  });
  addMoneyRecord(farm, moneyCategoryOf(farm, "income", "sheepSale"), {
    kind: "income",
    amount: 40_000_00,
    source: { kind: "sale", id: "sale-1" },
  });
  renderApp(`/farms/${farm.id}/incomes`);

  await screen.findByRole("table", { name: "Доходы" });
  const automatic = await screen.findByRole("row", { name: /Продажа баранов/ });
  // An Automatic record links to its deal.
  expect(within(automatic).getByRole("link", { name: "Продажа" }).getAttribute("href")).toBe(
    `/farms/${farm.id}/deals/sale-1`,
  );
  await user.click(within(automatic).getByRole("button", { name: "Действия" }));
  expect(await screen.findByRole("menuitem", { name: "Изменить" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Удалить" })).toBeNull();
  await user.keyboard("{Escape}");

  const wool = screen.getByRole("row", { name: /Весенняя стрижка/ });
  await user.click(within(wool).getByRole("button", { name: "Действия" }));
  await user.click(await screen.findByRole("menuitem", { name: "Удалить" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Удалить доход?" });
  await user.click(within(confirm).getByRole("button", { name: "Удалить" }));

  await waitFor(() => expect(screen.queryByRole("row", { name: /Весенняя стрижка/ })).toBeNull());
  expect(rowsOf("Доходы").at(-1)).toBe(`Итого${amount(40_000)}`);
});

test("of an Automatic record, a Member changes the amount but not the date", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  addMoneyRecord(farm, moneyCategoryOf(farm, "income", "sheepSale"), {
    kind: "income",
    amount: 40_000_00,
    source: { kind: "sale", id: "sale-1" },
  });
  renderApp(`/farms/${farm.id}/incomes`);

  await screen.findByRole("table", { name: "Доходы" });
  await user.click(await screen.findByRole("row", { name: /Продажа баранов/ }));
  const dialog = await screen.findByRole("dialog", { name: "Изменить доход" });
  expect(within(dialog).getByLabelText("Дата")).toHaveProperty("disabled", true);
  const amountField = within(dialog).getByRole("textbox", { name: "Сумма" });
  await user.clear(amountField);
  await user.type(amountField, "42000");
  await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(rowsOf("Доходы").at(-1)).toBe(`Итого${amount(42_000)}`));
});

test("a used category can go to the archive but not be deleted, and an unused one can", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  addMoneyRecord(farm, moneyCategoryOf(farm, "expense", "shearing"));
  renderApp(`/farms/${farm.id}/expenses?tab=categories`);

  await screen.findByRole("table", { name: "Категории" });
  // The app owns a System category: it has no actions.
  const system = await screen.findByRole("row", { name: /Покупка баранов/ });
  expect(within(system).queryByRole("button", { name: "Действия" })).toBeNull();

  const shearing = screen.getByRole("row", { name: /Стрижка/ });
  await user.click(within(shearing).getByRole("button", { name: "Действия" }));
  expect(await screen.findByRole("menuitem", { name: "Переименовать" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Удалить" })).toBeNull();
  await user.click(screen.getByRole("menuitem", { name: "В архив" }));
  await waitFor(() => expect(rowsOf("Категории")[0]).toBe("СтрижкаВ архиве"));

  const equipment = screen.getByRole("row", { name: /Оборудование/ });
  await user.click(within(equipment).getByRole("button", { name: "Действия" }));
  await user.click(await screen.findByRole("menuitem", { name: "Удалить" }));
  const confirm = await screen.findByRole("alertdialog", {
    name: "Удалить категорию «Оборудование»?",
  });
  await user.click(within(confirm).getByRole("button", { name: "Удалить" }));
  await waitFor(() => expect(screen.queryByRole("row", { name: /Оборудование/ })).toBeNull());
});

test("a Member adds a category and renames it", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  renderApp(`/farms/${farm.id}/expenses?tab=categories`);

  await screen.findByRole("table", { name: "Категории" });
  await user.type(screen.getByRole("textbox", { name: "Новая категория" }), "Транспорт");
  await user.click(screen.getByRole("button", { name: "Добавить категорию" }));
  // A category of a Member comes after the default ones, before the System ones.
  await waitFor(() => expect(rowsOf("Категории")[5]).toBe("Транспорт"));

  await user.click(
    within(screen.getByRole("row", { name: /Транспорт/ })).getByRole("button", {
      name: "Действия",
    }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Переименовать" }));
  const dialog = await screen.findByRole("dialog", { name: "Переименовать категорию" });
  const name = within(dialog).getByRole("textbox", { name: "Название" });
  await user.clear(name);
  await user.type(name, "Перевозка{Enter}");

  await waitFor(() => expect(rowsOf("Категории")[5]).toBe("Перевозка"));
});

test("a new or renamed category cannot take the name of a category of the app", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addDefaultMoneyCategories(farm);
  renderApp(`/farms/${farm.id}/expenses?tab=categories`);

  await screen.findByRole("table", { name: "Категории" });
  const before = rowsOf("Категории");
  // The System category, in another case: a manual copy of it would look the same in the forms.
  const newName = screen.getByRole("textbox", { name: "Новая категория" });
  await user.type(newName, "покупка  баранов");
  await user.click(screen.getByRole("button", { name: "Добавить категорию" }));
  expect(
    await screen.findByText("Категория с таким названием уже есть, может быть, в архиве."),
  ).toBeTruthy();
  expect(rowsOf("Категории")).toEqual(before);

  // A copy of «Оплата чабану» would not need a Shepherd.
  await user.click(
    within(screen.getByRole("row", { name: /Прочее/ })).getByRole("button", { name: "Действия" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Переименовать" }));
  const dialog = await screen.findByRole("dialog", { name: "Переименовать категорию" });
  const name = within(dialog).getByRole("textbox", { name: "Название" });
  await user.clear(name);
  await user.type(name, "Оплата чабану{Enter}");
  expect(
    await within(dialog).findByText("Категория с таким названием уже есть, может быть, в архиве."),
  ).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(rowsOf("Категории")).toEqual(before);
});
