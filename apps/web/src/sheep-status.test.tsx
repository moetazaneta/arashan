import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import {
  addFlock,
  addFlockMove,
  addMembers,
  addSheep,
  aFarm,
  aMember,
  auditEntries,
  sheepState,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"));
  return farm;
}

/** The Tags in the table, in row order. */
function sheepTags() {
  const table = screen.getByRole("table", { name: "Бараны" });
  const column = within(table)
    .getAllByRole("columnheader")
    .findIndex((header) => header.textContent === "Бирка");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[column]?.textContent);
}

async function typeDate(user: UserEvent, field: HTMLElement, date: string) {
  await user.clear(field);
  await user.type(field, date);
}

async function changeStatus(user: UserEvent, status: string) {
  await user.click(screen.getByRole("button", { name: "Сменить статус" }));
  const dialog = await screen.findByRole("dialog", { name: /^Сменить статус/ });
  await user.click(within(dialog).getByRole("button", { name: status }));
  return dialog;
}

test("the Status filter shows counts, filters the table and keeps the choice in the URL", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "1" });
  addSheep(farm, { tag: "2" });
  addSheep(farm, { tag: "3", status: "lost" });
  addSheep(farm, { tag: "4", status: "sold" });
  addSheep(farm, { tag: "5", status: "slaughtered" });
  addSheep(farm, { tag: "6", status: "dead" });
  const { router } = renderApp(`/farms/${farm.id}/sheep`);

  await screen.findByRole("heading", { name: "Бараны 2" });
  expect(sheepTags()).toEqual(["1", "2"]);
  for (const name of ["Активные2", "Потерянные1", "Проданные1", "Забитые1", "Павшие1", "Все6"]) {
    expect(screen.getByRole("button", { name })).toBeTruthy();
  }
  for (const [label, status, tags] of [
    ["Все6", "all", ["1", "2", "3", "4", "5", "6"]],
    ["Проданные1", "sold", ["4"]],
    ["Потерянные1", "lost", ["3"]],
    ["Забитые1", "slaughtered", ["5"]],
    ["Павшие1", "dead", ["6"]],
  ] as const) {
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(sheepTags()).toEqual(tags));
    expect(router.state.location.search).toEqual({ status });
    expect(router.state.location.searchStr).toBe(`?status=${status}`);
    expect(screen.getByRole("heading", { name: `Бараны ${tags.length}` })).toBeTruthy();
  }
  await user.click(screen.getByRole("button", { name: "Активные2" }));
  await waitFor(() => expect(sheepTags()).toEqual(["1", "2"]));
  expect(router.state.location.search).toEqual({});
});

test("a Member marks two Sheep Dead with a reason and they leave the Active view and their Flock", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const flock = addFlock(farm, { name: "Верхнее" });
  const first = addSheep(farm, { tag: "1" });
  addFlockMove(first, flock, "2026-05-01");
  const second = addSheep(farm, { tag: "2" });
  addSheep(farm, { tag: "3" });
  renderApp(`/farms/${farm.id}/sheep`);

  await user.click(await screen.findByRole("checkbox", { name: "Выбрать барана 1" }));
  await user.click(screen.getByRole("checkbox", { name: "Выбрать барана 2" }));
  const dialog = await changeStatus(user, "Пал");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Причина (необязательно)" }),
    "Болезнь",
  );
  await user.click(within(dialog).getByRole("button", { name: "Сменить статус" }));

  expect(await screen.findByText("Новый статус «Пал» у баранов: 2")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(sheepTags()).toEqual(["3"]);
  expect(screen.getByRole("heading", { name: "Бараны 1" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Павшие2" })).toBeTruthy();
  for (const id of [first, second]) {
    expect(sheepState(id)).toMatchObject({ status: "dead", flockId: null });
  }
  await user.click(screen.getByRole("button", { name: "Павшие2" }));
  await user.click(await screen.findByRole("cell", { name: "1" }));
  const changes = await screen.findByRole("region", { name: "Смены статуса" });
  expect(changes.textContent).toContain("Болезнь");
});

test("a Status date before the last move shows an error under the date and changes no Sheep", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const flock = addFlock(farm, { name: "Верхнее" });
  const first = addSheep(farm, { tag: "1" });
  const second = addSheep(farm, { tag: "2" });
  addFlockMove(second, flock, "2026-06-01");
  renderApp(`/farms/${farm.id}/sheep`);

  await user.click(await screen.findByRole("checkbox", { name: "Выбрать всех баранов" }));
  const dialog = await changeStatus(user, "Забит");
  const date = within(dialog).getByLabelText("Дата");
  await typeDate(user, date, "2026-05-01");
  await user.click(within(dialog).getByRole("button", { name: "Сменить статус" }));

  const field = date.closest<HTMLElement>("[data-slot=field]");
  expect(field).not.toBeNull();
  expect(await within(field!).findByText(/Дата не может быть/)).toBeTruthy();
  expect(sheepState(first)).toMatchObject({ status: "active", flockId: null });
  expect(sheepState(second)).toMatchObject({ status: "active", flockId: flock });
  expect(auditEntries().filter((entry) => entry.command === "sheep.markSlaughtered")).toEqual([]);
  await user.click(within(dialog).getByRole("button", { name: "Отмена" }));
  expect(sheepTags()).toEqual(["1", "2"]);
});

test("a Lost Sheep is found, its card shows both Status changes, and undo makes it Lost again", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const sheep = addSheep(farm, { tag: "7" });
  renderApp(`/farms/${farm.id}/sheep/${sheep}`);

  await screen.findByRole("button", { name: "Сменить статус" });
  const lost = await changeStatus(user, "Потерян");
  await typeDate(user, within(lost).getByLabelText("Дата"), "2026-05-01");
  await user.click(within(lost).getByRole("button", { name: "Сменить статус" }));
  await user.click(await screen.findByRole("button", { name: "Баран нашёлся" }));
  const found = await screen.findByRole("dialog", { name: "Баран нашёлся" });
  await typeDate(user, within(found).getByLabelText("Когда нашёлся"), "2026-05-02");
  await user.click(within(found).getByRole("button", { name: "Сохранить" }));

  const card = screen.getByRole("tabpanel", { name: "Карточка" });
  expect(await within(card).findByText("Активен")).toBeTruthy();
  const changes = screen.getByRole("region", { name: "Смены статуса" });
  expect(
    within(changes)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Нашёлся — 02.05.2026Отменить", "Потерян — 01.05.2026"]);
  await user.click(within(changes).getByRole("button", { name: "Отменить" }));
  const undo = await screen.findByRole("alertdialog", { name: "Отменить смену статуса?" });
  await user.click(within(undo).getByRole("button", { name: "Отменить" }));

  expect(await screen.findByRole("button", { name: "Баран нашёлся" })).toBeTruthy();
  expect(screen.queryByText("Активен")).toBeNull();
  expect(sheepState(sheep)).toMatchObject({ status: "lost", flockId: null });
  expect(
    within(changes)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Потерян — 01.05.2026Отменить"]);
});
