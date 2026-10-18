import { dateAt } from "@arashan/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { formatCalendarDate } from "@/format";
import {
  addAssignment,
  addFlock,
  addLocation,
  addSheep,
  addShepherd,
  aFarm,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** A Member "aibek" of a Farm. */
function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  return farm;
}

const day = 24 * 60 * 60 * 1000;

/** The date some days before today in the time zone of the Farm, as "YYYY-MM-DD". */
function daysAgo(days: number, timeZone: string) {
  return dateAt(Date.now() - days * day, timeZone);
}

/** The rows of the body of a table, as their text. */
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

test("a Member creates a Location, a Shepherd and a Flock at that Location", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Стада" }));
  expect(await screen.findByRole("heading", { name: "Стада" })).toBeTruthy();

  await user.click(screen.getByRole("tab", { name: "Места" }));
  await screen.findByText("Здесь будут места: пастбища, кошары, загоны.");
  await user.click(screen.getByRole("button", { name: "Добавить место" }));
  const locationDialog = await screen.findByRole("dialog", { name: "Добавить место" });
  const locationName = within(locationDialog).getByRole("textbox", { name: "Название" });
  expect(document.activeElement).toBe(locationName);
  await user.type(locationName, "Верхнее пастбище{Enter}");
  await screen.findByRole("table", { name: "Места" });
  expect(rowsOf("Места")).toEqual(["Верхнее пастбище——"]);

  await user.click(screen.getByRole("tab", { name: "Чабаны" }));
  await user.click(await screen.findByRole("button", { name: "Добавить чабана" }));
  const shepherdDialog = await screen.findByRole("dialog", { name: "Добавить чабана" });
  await user.type(within(shepherdDialog).getByRole("textbox", { name: "Имя" }), "Асан");
  await user.type(within(shepherdDialog).getByRole("textbox", { name: "Телефон" }), "0555 123 456");
  await user.click(within(shepherdDialog).getByRole("button", { name: "Добавить чабана" }));
  await screen.findByRole("table", { name: "Чабаны" });
  expect(rowsOf("Чабаны")).toEqual(["Асан0555 123 456——"]);

  await user.click(screen.getByRole("tab", { name: "Стада" }));
  await user.click(await screen.findByRole("button", { name: "Создать стадо" }));
  const flockDialog = await screen.findByRole("dialog", { name: "Создать стадо" });
  const flockName = within(flockDialog).getByRole("textbox", { name: "Название" });
  expect(document.activeElement).toBe(flockName);
  await user.type(flockName, "Отара 1");
  const location = within(flockDialog).getByRole("combobox", { name: "Место" });
  expect(location.textContent).toContain("Без места");
  await user.click(location);
  await user.click(await screen.findByRole("option", { name: "Верхнее пастбище" }));
  await user.click(within(flockDialog).getByRole("button", { name: "Создать стадо" }));
  await screen.findByRole("table", { name: "Стада" });
  expect(rowsOf("Стада")).toEqual(["Отара 1Верхнее пастбище—0"]);

  // The Location lists the Flock that stays there.
  await user.click(screen.getByRole("tab", { name: "Места" }));
  await screen.findByRole("table", { name: "Места" });
  expect(rowsOf("Места")).toEqual(["Верхнее пастбищеОтара 1—"]);
});

test("a Member assigns a Shepherd to a Flock from a date", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const flockId = addFlock(farm, { name: "Отара 1" });
  addShepherd(farm, { name: "Асан" });
  renderApp(`/farms/${farm.id}/flocks/${flockId}`);

  expect(await screen.findByText("Чабан не назначен.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Назначить чабана" }));
  const dialog = await screen.findByRole("dialog", { name: "Назначить чабана" });
  await user.click(within(dialog).getByRole("combobox", { name: "Чабан" }));
  await user.click(await screen.findByRole("option", { name: "Асан" }));
  const from = within(dialog).getByLabelText("С");
  expect(from).toHaveProperty("value", dateAt(Date.now(), farm.timeZone));
  const start = daysAgo(10, farm.timeZone);
  await user.clear(from);
  await user.type(from, start);
  await user.click(within(dialog).getByRole("button", { name: "Назначить чабана" }));

  await screen.findByRole("table", { name: "Назначения чабанов" });
  expect(rowsOf("Назначения чабанов")[0]).toMatch(
    new RegExp(`^Асан${formatCalendarDate(start, "ru")}сейчас`),
  );
});

test("archiving a Shepherd ends the assignment on the date and hides the Shepherd", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const flockId = addFlock(farm, { name: "Отара 1" });
  const shepherdId = addShepherd(farm, { name: "Асан" });
  const start = daysAgo(30, farm.timeZone);
  addAssignment(farm, { flockId, shepherdId, from: start });
  const first = renderApp(`/farms/${farm.id}/flocks?tab=shepherds`);

  await screen.findByRole("table", { name: "Чабаны" });
  expect(rowsOf("Чабаны")).toEqual(["Асан—Отара 1—"]);
  await user.click(screen.getByRole("row", { name: /Асан/ }));
  const dialog = await screen.findByRole("dialog", { name: "Изменить чабана" });
  await user.click(within(dialog).getByRole("button", { name: "В архив" }));
  const confirm = await screen.findByRole("alertdialog", {
    name: "Отправить чабана Асан в архив?",
  });
  expect(
    within(confirm).getByText("Назначения чабана в стадах закончатся этой датой."),
  ).toBeTruthy();
  const lastDay = within(confirm).getByLabelText("Последний день работы");
  expect(lastDay).toHaveProperty("value", dateAt(Date.now(), farm.timeZone));
  const end = daysAgo(3, farm.timeZone);
  await user.clear(lastDay);
  await user.type(lastDay, end);
  await user.click(within(confirm).getByRole("button", { name: "В архив" }));

  // By default the list hides the Archived Shepherd; the toggle shows it.
  expect(await screen.findByText("Здесь будут чабаны фермы.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Показать архив" }));
  expect(rowsOf("Чабаны")).toEqual(["АсанВ архиве———"]);
  first.unmount();

  renderApp(`/farms/${farm.id}/flocks/${flockId}`);
  await screen.findByRole("table", { name: "Назначения чабанов" });
  expect(rowsOf("Назначения чабанов")[0]).toMatch(
    new RegExp(`^АсанВ архиве${formatCalendarDate(start, "ru")}${formatCalendarDate(end, "ru")}`),
  );
});

test("a Location where a Flock stays cannot go to the archive: the dialog says why", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const locationId = addLocation(farm, { name: "Кошара" });
  addFlock(farm, { name: "Отара 1", locationId });
  renderApp(`/farms/${farm.id}/flocks?tab=locations`);

  await screen.findByRole("table", { name: "Места" });
  await user.click(screen.getByRole("row", { name: /Кошара/ }));
  const dialog = await screen.findByRole("dialog", { name: "Изменить место" });
  await user.click(within(dialog).getByRole("button", { name: "В архив" }));

  expect(
    await within(dialog).findByText("Здесь стоит стадо. Сначала переведите стадо на другое место."),
  ).toBeTruthy();
});

test("a Flock with a Sheep cannot go to the archive: the dialog says why", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const flockId = addFlock(farm, { name: "Отара 1" });
  addSheep(farm, { tag: "12", flockId });
  renderApp(`/farms/${farm.id}/flocks/${flockId}`);

  await screen.findByRole("table", { name: "Бараны стада" });
  await user.click(screen.getByRole("button", { name: "В архив" }));
  const confirm = await screen.findByRole("alertdialog", {
    name: "Отправить стадо Отара 1 в архив?",
  });
  await user.click(within(confirm).getByRole("button", { name: "В архив" }));

  expect(
    await within(confirm).findByText(
      "В стаде есть бараны. Сначала переведите их в другое стадо или выведите из стада.",
    ),
  ).toBeTruthy();
});

test("a Flock name that another Flock has shows its message under «Название»", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addFlock(farm, { name: "Отара", archivedAt: Date.now() });
  renderApp(`/farms/${farm.id}/flocks`);

  // The other Flock is Archived, so the list is empty by default.
  await screen.findByText("Здесь будут стада фермы.");
  await user.click(screen.getByRole("button", { name: "Создать стадо" }));
  const dialog = await screen.findByRole("dialog", { name: "Создать стадо" });
  const name = within(dialog).getByRole("textbox", { name: "Название" });
  await user.type(name, " отара {Enter}");

  expect(
    await within(fieldOf(name)).findByText(
      "Стадо с таким названием уже есть, может быть, в архиве.",
    ),
  ).toBeTruthy();
});

test("the tab in the URL opens «Чабаны», and a change of the tab changes the URL", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addShepherd(farm, { name: "Асан" });
  const { router } = renderApp(`/farms/${farm.id}/flocks?tab=shepherds`);

  expect(await screen.findByRole("tab", { name: "Чабаны", selected: true })).toBeTruthy();
  expect(await screen.findByRole("row", { name: /Асан/ })).toBeTruthy();

  await user.click(screen.getByRole("tab", { name: "Места" }));
  expect(router.state.location.search).toEqual({ tab: "locations" });
});

test("the card of a Flock that the Farm does not have says so", async () => {
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}/flocks/flock-404`);

  expect(await screen.findByText("Такого стада нет.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "К списку стад" })).toBeTruthy();
});
