import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import {
  addAssignment,
  addFlock,
  addFlockMove,
  addMembers,
  addSheep,
  addShepherd,
  aFarm,
  aMember,
  auditEntries,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** A Member "aibek" of a Farm. */
function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"));
  return farm;
}

/** The text of a column of the table «Бараны», from the top. */
function column(name: string) {
  const table = screen.getByRole("table", { name: "Бараны" });
  const index = within(table)
    .getAllByRole("columnheader")
    .findIndex((header) => header.textContent === name);
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[index]?.textContent);
}

/** The ids of the Sheep that a `sheep.move` audit entry names, in order. */
function movedSheep() {
  return auditEntries()
    .filter((entry) => entry.command === "sheep.move")
    .map((entry) => entry.target.id);
}

/** Opens the move dialog of the table and moves the selected Sheep into the Flock. */
async function moveSelected(user: UserEvent, flock: string) {
  await user.click(screen.getByRole("button", { name: "Перевести в стадо" }));
  const dialog = await screen.findByRole("dialog", { name: /^Перевести в стадо/ });
  await user.click(within(dialog).getByRole("combobox", { name: "Стадо" }));
  await user.click(await screen.findByRole("option", { name: flock }));
  return dialog;
}

/** Types a date into a date field. */
async function typeDate(user: UserEvent, field: HTMLElement, date: string) {
  await user.clear(field);
  await user.type(field, date);
}

test("a Member selects two Sheep by their checkboxes and moves them into a Flock", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addFlock(farm, { name: "Верхнее" });
  const first = addSheep(farm, { tag: "1" });
  const second = addSheep(farm, { tag: "2" });
  addSheep(farm, { tag: "3" });
  const { router } = renderApp(`/farms/${farm.id}/sheep`);

  await user.click(await screen.findByRole("checkbox", { name: "Выбрать барана 1" }));
  await user.click(screen.getByRole("checkbox", { name: "Выбрать барана 2" }));
  // A click on a checkbox selects the Sheep: it does not open the card.
  expect(router.state.location.pathname).toBe(`/farms/${farm.id}/sheep`);
  expect(screen.getByText("Выбрано: 2")).toBeTruthy();

  const dialog = await moveSelected(user, "Верхнее");
  expect(within(dialog).getByRole("heading").textContent).toBe("Перевести в стадо 2 баранов");
  await user.click(within(dialog).getByRole("button", { name: "Перевести" }));

  expect(await screen.findByText("Переведено баранов: 2")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText(/Выбрано/)).toBeNull();
  expect(column("Стадо")).toEqual(["Верхнее", "Верхнее", "—"]);
  expect(movedSheep()).toEqual([first, second]);
});

test("«select all» selects only the Active Sheep, and a Sheep in the Flock already stays", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const upper = addFlock(farm, { name: "Верхнее" });
  const inUpper = addSheep(farm, { tag: "1" });
  addFlockMove(inUpper, upper, "2026-05-01");
  const other = addSheep(farm, { tag: "2" });
  addSheep(farm, { tag: "3", status: "sold" });
  renderApp(`/farms/${farm.id}/sheep`);

  const sold = await screen.findByRole("checkbox", { name: "Выбрать барана 3" });
  await user.click(screen.getByRole("checkbox", { name: "Выбрать всех баранов" }));
  expect(screen.getByText("Выбрано: 2")).toBeTruthy();
  expect(sold.getAttribute("aria-checked")).toBe("false");

  // `Escape` clears the selection, and «select all» selects again.
  await user.keyboard("{Escape}");
  expect(screen.queryByText(/Выбрано/)).toBeNull();
  await user.click(screen.getByRole("checkbox", { name: "Выбрать всех баранов" }));

  const dialog = await moveSelected(user, "Верхнее");
  await user.click(within(dialog).getByRole("button", { name: "Перевести" }));

  expect(
    await screen.findByText("Переведено баранов: 1 из 2. Остальные уже в этом стаде."),
  ).toBeTruthy();
  expect(movedSheep()).toEqual([other]);
});

test("`Space` on the focused row selects its Sheep", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "1" });
  addSheep(farm, { tag: "2" });
  renderApp(`/farms/${farm.id}/sheep`);

  const checkbox = await screen.findByRole("checkbox", { name: "Выбрать барана 2" });
  await user.click(screen.getByRole("checkbox", { name: "Выбрать барана 1" }));
  await user.keyboard("{ArrowDown} ");

  expect(screen.getByText("Выбрано: 2")).toBeTruthy();
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
});

test("a move before the last move of a Sheep shows the date error and moves nothing", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const upper = addFlock(farm, { name: "Верхнее" });
  addFlock(farm, { name: "Нижнее" });
  const sheepId = addSheep(farm, { tag: "1" });
  addFlockMove(sheepId, upper, "2026-06-01");
  renderApp(`/farms/${farm.id}/sheep`);

  await user.click(await screen.findByRole("checkbox", { name: "Выбрать барана 1" }));
  const dialog = await moveSelected(user, "Нижнее");
  const date = within(dialog).getByLabelText("Дата");
  await typeDate(user, date, "2026-05-01");
  await user.click(within(dialog).getByRole("button", { name: "Перевести" }));

  const field = date.closest<HTMLElement>("[data-slot=field]");
  expect(field).not.toBeNull();
  expect(await within(field!).findByText(/Дата перевода не может быть/)).toBeTruthy();
  expect(movedSheep()).toEqual([]);

  await user.click(within(dialog).getByRole("button", { name: "Отмена" }));
  expect(column("Стадо")).toEqual(["Верхнее"]);
  expect(screen.getByText("Выбрано: 1")).toBeTruthy();
});

/** A Sheep that was in «Верхнее» with Асан and Бек, and is in «Нижнее» since 30.09.2026. */
function sheepWithStays() {
  const farm = memberOfFarm();
  const upper = addFlock(farm, { name: "Верхнее" });
  const lower = addFlock(farm, { name: "Нижнее" });
  const asan = addShepherd(farm, { name: "Асан" });
  const bek = addShepherd(farm, { name: "Бек" });
  addAssignment(farm, { flockId: upper, shepherdId: asan, from: "2026-01-01" });
  addAssignment(farm, { flockId: upper, shepherdId: bek, from: "2026-06-01" });
  const sheepId = addSheep(farm, { tag: "7", birthDate: "2025-03-01" });
  addFlockMove(sheepId, upper, "2026-05-01");
  addFlockMove(sheepId, lower, "2026-09-30");
  return { farm, sheepId };
}

/** The lines of a list in a section of the tab «История». */
function lines(section: HTMLElement) {
  return within(section)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

test("the tab «История» shows the stays in Flocks, and who was responsible on a day", async () => {
  const user = userEvent.setup();
  const { farm, sheepId } = sheepWithStays();
  renderApp(`/farms/${farm.id}/sheep/${sheepId}`);

  await user.click(await screen.findByRole("tab", { name: "История" }));
  const stays = await screen.findByRole("region", { name: "Стада" });
  expect(lines(stays)).toEqual([
    "Нижнее — с 30.09.2026 · чабан не назначен",
    "Верхнее — с 01.05.2026 по 30.09.2026 · чабаны: Асан, Бек",
  ]);

  // Today the Sheep is in «Нижнее».
  const responsible = screen.getByRole("region", { name: "Кто отвечал за барана" });
  await within(responsible).findByText("Нижнее");
  expect(lines(responsible)).toEqual(["Стадо «Нижнее» — чабан не назначен"]);

  const date = within(responsible).getByLabelText("Дата");
  await typeDate(user, date, "2026-05-15");
  await within(responsible).findByText("Верхнее");
  expect(lines(responsible)).toEqual(["Стадо «Верхнее» — чабан: Асан"]);

  await typeDate(user, date, "2026-09-30");
  expect(
    await within(responsible).findByText("В этот день барана перевели в другое стадо."),
  ).toBeTruthy();
  expect(lines(responsible)).toEqual([
    "Стадо «Верхнее» — чабаны: Асан, Бек",
    "Стадо «Нижнее» — чабан не назначен",
  ]);

  await typeDate(user, date, "2026-04-01");
  expect(await within(responsible).findByText("В этот день баран не был в стаде.")).toBeTruthy();
});

test("a Member undoes the last move of a Sheep", async () => {
  const user = userEvent.setup();
  const { farm, sheepId } = sheepWithStays();
  renderApp(`/farms/${farm.id}/sheep/${sheepId}`);

  await user.click(await screen.findByRole("tab", { name: "История" }));
  const stays = await screen.findByRole("region", { name: "Стада" });
  await user.click(within(stays).getByRole("button", { name: "Отменить последний перевод" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Отменить перевод" }));

  await waitFor(() => expect(lines(stays)).toEqual(["Верхнее — с 01.05.2026 · чабаны: Асан, Бек"]));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Карточка" }));
  expect(screen.getByRole("link", { name: "Верхнее" })).toBeTruthy();
});

test("the card moves its Sheep out of its Flock, and does not offer that Flock", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const upper = addFlock(farm, { name: "Верхнее" });
  addFlock(farm, { name: "Нижнее" });
  addFlock(farm, { name: "Старое", archivedAt: Date.UTC(2026, 0, 1) });
  const sheepId = addSheep(farm, { tag: "7" });
  addFlockMove(sheepId, upper, "2026-05-01");
  renderApp(`/farms/${farm.id}/sheep/${sheepId}`);

  expect(await screen.findByRole("link", { name: "Верхнее" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Перевести в стадо" }));
  const dialog = await screen.findByRole("dialog", { name: "Перевести в стадо" });
  await user.click(within(dialog).getByRole("combobox", { name: "Стадо" }));
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["Нижнее", "Вне стада"]);
  await user.click(screen.getByRole("option", { name: "Вне стада" }));
  await user.click(within(dialog).getByRole("button", { name: "Перевести" }));

  await waitFor(() => expect(screen.queryByRole("link", { name: "Верхнее" })).toBeNull());
  expect(movedSheep()).toEqual([sheepId]);
});

test("with no Flock on the Farm, the dialog offers to create one", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "1" });
  renderApp(`/farms/${farm.id}/sheep`);

  await user.click(await screen.findByRole("checkbox", { name: "Выбрать барана 1" }));
  await user.click(screen.getByRole("button", { name: "Перевести в стадо" }));
  const dialog = await screen.findByRole("dialog", { name: "Перевести в стадо" });

  const create = await within(dialog).findByRole("link", { name: "Создать стадо" });
  expect(create.getAttribute("href")).toBe(`/farms/${farm.id}/flocks`);
  await user.click(within(dialog).getByRole("combobox", { name: "Стадо" }));
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["Вне стада"]);
});
