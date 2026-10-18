import { dateAt } from "@arashan/core";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { formatCalendarDate } from "@/format";
import { addMembers, addSheep, aFarm, aMember, signIn } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** A Member "aibek" of a Farm with another Member "zarina". */
function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"), aMember("zarina", "admin"));
  return farm;
}

/** Today in the time zone of the Farm, as the UI shows a date. */
function todayOnFarm(timeZone: string) {
  return formatCalendarDate(dateAt(Date.now(), timeZone), "ru");
}

/** The rows of the body of the table «Бараны», as their text. */
function sheepRows() {
  const table = screen.getByRole("table", { name: "Бараны" });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
}

/** The Tags in the table «Бараны», from the top. */
function sheepTags() {
  const table = screen.getByRole("table", { name: "Бараны" });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
}

/** The Tag of the row that has the focus. */
function focusedTag() {
  const row = document.activeElement;
  if (!(row instanceof HTMLTableRowElement)) return null;
  return within(row).getAllByRole("cell")[0]?.textContent ?? null;
}

test("a Member registers a Sheep as an Initial entry and sees it in the table", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Бараны" }));
  expect(await screen.findByText("Здесь будут бараны фермы.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Добавить барана" }));

  const panel = await screen.findByRole("dialog", { name: "Добавить барана" });
  const tag = within(panel).getByRole("textbox", { name: "Бирка" });
  expect(document.activeElement).toBe(tag);
  await user.type(tag, "12");
  await user.type(within(panel).getByRole("textbox", { name: "Кличка" }), "Буян");
  await user.click(within(panel).getByRole("button", { name: "Самец" }));
  await user.click(within(panel).getByRole("button", { name: "Добавить барана" }));

  // The panel stays open and clean for the next Sheep.
  expect(await within(panel).findByRole("status")).toHaveProperty(
    "textContent",
    "Баран добавлен: 12",
  );
  expect(within(panel).getByRole("link", { name: "12" })).toBeTruthy();
  expect(tag).toHaveProperty("value", "");
  expect(document.activeElement).toBe(tag);

  await user.click(within(panel).getByRole("button", { name: "Закрыть" }));
  expect(await screen.findByRole("heading", { name: "Бараны 1" })).toBeTruthy();
  expect(sheepRows()).toEqual(["12БуянСамец—aibekАктивен"]);
});

test("a Tag that another Sheep has shows its message under the field «Бирка»", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "A-12" });
  renderApp(`/farms/${farm.id}/sheep`);

  await screen.findByRole("table", { name: "Бараны" });
  // The shortcut N opens the panel when the focus is not in a field.
  await user.keyboard("n");
  const panel = await screen.findByRole("dialog", { name: "Добавить барана" });
  await user.click(within(panel).getByRole("button", { name: "Самка" }));
  // The Cyrillic «а» looks like the Latin "a": the core counts it as the same Tag.
  const tag = within(panel).getByRole("textbox", { name: "Бирка" });
  await user.type(tag, "а-12{Enter}");

  const field = tag.closest<HTMLElement>("[data-slot=field]");
  expect(field).not.toBeNull();
  expect(
    await within(field!).findByText("Эта бирка уже есть у другого барана фермы. Проверьте номер."),
  ).toBeTruthy();
  expect(within(panel).queryByRole("status")).toBeNull();
});

test("a Sheep born on the Farm needs a birth date", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}/sheep`);

  await screen.findByText("Здесь будут бараны фермы.");
  await user.click(screen.getByRole("button", { name: "Добавить барана" }));
  const panel = await screen.findByRole("dialog", { name: "Добавить барана" });
  await user.click(within(panel).getByRole("button", { name: "Рождён на ферме" }));
  await user.click(within(panel).getByRole("button", { name: "Самка" }));
  await user.type(within(panel).getByRole("textbox", { name: "Бирка" }), "31{Enter}");

  expect(await within(panel).findByText(/Введите дату рождения/)).toBeTruthy();
});

test("the keyboard moves between the rows, and Enter opens the card", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  for (const tag of ["10", "2", "1"]) addSheep(farm, { tag });
  const { router } = renderApp(`/farms/${farm.id}/sheep`);

  // The Tags are in the natural order, and one Tab from the headers reaches the first row.
  await screen.findByRole("table", { name: "Бараны" });
  expect(sheepTags()).toEqual(["1", "2", "10"]);
  act(() => screen.getByRole("button", { name: "Статус" }).focus());
  await user.tab();
  expect(focusedTag()).toBe("1");

  await user.keyboard("{ArrowDown}");
  expect(focusedTag()).toBe("2");
  await user.keyboard("{End}");
  expect(focusedTag()).toBe("10");
  await user.keyboard("{Home}");
  expect(focusedTag()).toBe("1");
  await user.keyboard("{PageDown}{Enter}");

  expect(await screen.findByRole("heading", { name: "10" })).toBeTruthy();
  expect(router.state.location.pathname).toMatch(
    new RegExp(`^/farms/${farm.id}/sheep/sheep-\\d+$`),
  );
});

test("a click on a header sorts the table, the Sheep without a Tag last", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "2" });
  addSheep(farm, { name: "Без номера" });
  addSheep(farm, { tag: "10" });
  renderApp(`/farms/${farm.id}/sheep`);

  await screen.findByRole("table", { name: "Бараны" });
  const tagHeader = screen.getByRole("columnheader", { name: "Бирка" });
  await user.click(within(tagHeader).getByRole("button", { name: "Бирка" }));
  await user.click(within(tagHeader).getByRole("button", { name: "Бирка" }));

  expect(tagHeader.getAttribute("aria-sort")).toBe("descending");
  expect(sheepTags()).toEqual(["10", "2", "—"]);
});

test("the column settings show the hidden columns, and the table remembers them", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, {
    tag: "8",
    origin: "bought",
    weight: { kg: 42.5, date: "2026-10-01" },
    notes: "Хромает",
  });
  const first = renderApp(`/farms/${farm.id}/sheep`);

  await screen.findByRole("table", { name: "Бараны" });
  expect(screen.queryByRole("columnheader", { name: "Вес, кг" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Столбцы" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Вес, кг" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Происхождение" }));
  await user.keyboard("{Escape}");

  expect(screen.getByRole("columnheader", { name: "Вес, кг" })).toBeTruthy();
  expect(sheepRows()[0]).toContain("Куплен · начальный ввод");
  expect(sheepRows()[0]).toContain("42,5");
  first.unmount();

  renderApp(`/farms/${farm.id}/sheep`);
  expect(await screen.findByRole("columnheader", { name: "Вес, кг" })).toBeTruthy();
});

test("the tab «История» shows who changed the Sheep and when", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const sheepId = addSheep(farm, { tag: "7" });
  renderApp(`/farms/${farm.id}/sheep/${sheepId}`);

  await user.click(await screen.findByRole("button", { name: "Изменить" }));
  const panel = await screen.findByRole("dialog", { name: "Изменить барана" });
  await user.type(within(panel).getByRole("textbox", { name: "Кличка" }), "Буян");
  await user.click(within(panel).getByRole("button", { name: "Сохранить" }));
  expect(await screen.findByRole("heading", { name: "7 Буян" })).toBeTruthy();

  await user.click(screen.getByRole("tab", { name: "История" }));
  const history = await screen.findByRole("tabpanel", { name: "История" });
  const [, changed, registered] = within(history).getAllByRole("row");
  const today = todayOnFarm(farm.timeZone);
  expect(changed?.textContent).toContain(today);
  expect(changed?.textContent).toMatch(/aibekИзменён$/);
  expect(registered?.textContent).toMatch(/aibekЗарегистрирован$/);
});

test("a change of the Owner shows in «Владельцы»", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const sheepId = addSheep(farm, { tag: "5", birthDate: "2025-03-01" });
  renderApp(`/farms/${farm.id}/sheep/${sheepId}`);

  await user.click(await screen.findByRole("button", { name: "Сменить владельца" }));
  const dialog = await screen.findByRole("dialog", { name: "Сменить владельца" });
  await user.click(within(dialog).getByRole("combobox", { name: "Новый владелец" }));
  // The current Owner is not a choice.
  expect(screen.queryByRole("option", { name: "aibek" })).toBeNull();
  await user.click(await screen.findByRole("option", { name: "zarina" }));
  await user.click(within(dialog).getByRole("button", { name: "Сменить владельца" }));

  const owners = await screen.findByRole("region", { name: "Владельцы" });
  await within(owners).findByText("zarina");
  expect(
    within(owners)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([`zarina — с ${todayOnFarm(farm.timeZone)}`, "aibek — при регистрации"]);
});

test("a deleted Sheep leaves the table", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const sheepId = addSheep(farm, { tag: "3" });
  addSheep(farm, { tag: "4" });
  const { router } = renderApp(`/farms/${farm.id}/sheep/${sheepId}`);

  await user.click(await screen.findByRole("button", { name: "Удалить" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Удалить барана?")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

  expect(await screen.findByRole("heading", { name: "Бараны 1" })).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/farms/${farm.id}/sheep`);
  expect(sheepRows()).toHaveLength(1);
  expect(sheepRows()[0]).toMatch(/^4/);
});

test("the card of a deleted Sheep says that it is gone", async () => {
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}/sheep/sheep-404`);

  expect(await screen.findByText("Этого барана нет: его удалили.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "К списку баранов" })).toBeTruthy();
});
