import { arashanBreedId, dateAt, type MembershipId } from "@arashan/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { formatCalendarDate } from "@/format";
import {
  addFlock,
  addFlockMove,
  addLambing,
  addMembers,
  addSheep,
  aFarm,
  aMember,
  lambingsOf,
  sheepOf,
  signIn,
  updateFake,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

const zarina = "membership-zarina" as MembershipId;

/**
 * A Member "aibek" of a Farm with another Member "zarina". The Ewe «1 Айгуль» of zarina is in the
 * Flock «Верхнее»; the Ram «2 Алтын» is 100 % Arashan.
 */
function farmWithEwe() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"), aMember("zarina", "admin"));
  const upper = addFlock(farm, { name: "Верхнее" });
  const mother = addSheep(farm, {
    tag: "1",
    name: "Айгуль",
    sex: "ewe",
    birthDate: "2023-03-01",
    ownerId: zarina,
  });
  addFlockMove(mother, upper, "2026-05-01");
  const father = addSheep(farm, {
    tag: "2",
    name: "Алтын",
    sex: "ram",
    manualBreeds: [{ breedId: arashanBreedId, share: 1_000_000 }],
  });
  return { farm, upper, mother, father };
}

/** The element that has the focus now. */
const focused = () => document.activeElement;

/** The lines of a list, as their text. */
function lines(list: HTMLElement) {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => plain(item.textContent));
}

/** The text with each run of spaces as one space: a percent has a no-break space in Russian. */
function plain(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** What the Lambs get, as the panel shows it: the Breed composition and the Flock. */
function outcome(panel: HTMLElement) {
  return within(panel)
    .getAllByRole("definition")
    .map((value) => plain(value.textContent));
}

test("the keyboard alone records twins: the Lambs get the parents, the Owner and the Flock of the Mother", async () => {
  const user = userEvent.setup();
  const { farm, upper, mother, father } = farmWithEwe();
  renderApp(`/farms/${farm.id}/sheep`);
  await screen.findByRole("table", { name: "Бараны" });

  // The shortcut L opens the panel, and the Mother has the focus.
  await user.keyboard("l");
  const panel = await screen.findByRole("dialog", { name: "Окот" });
  const motherInput = within(panel).getByRole("combobox", { name: "Мать" });
  await waitFor(() => expect(focused()).toBe(motherInput));

  // The first match is highlighted while the Member types, so Enter picks it.
  await user.keyboard("1");
  await screen.findByRole("option", { name: /^1 Айгуль/ });
  await user.keyboard("{Enter}");
  expect(motherInput).toHaveProperty("value", "1 Айгуль");

  // The date is today on the Farm.
  await user.tab();
  const date = within(panel).getByLabelText("Дата окота");
  expect(focused()).toBe(date);
  expect(date).toHaveProperty("value", dateAt(Date.now(), farm.timeZone));

  await user.tab();
  expect(focused()).toBe(within(panel).getByRole("combobox", { name: "Отец" }));
  await user.keyboard("2");
  await screen.findByRole("option", { name: /^2 Алтын/ });
  await user.keyboard("{Enter}");
  // The Lambs get half of each parent, and go into the Flock of the Mother.
  expect(await within(panel).findByText("Верхнее")).toBeTruthy();
  expect(outcome(panel)).toEqual(["Арашан 50 %, неизвестно 50 %", "Верхнее"]);

  // The first Lamb: a Ram with the Tag 101. Its Owner is the Owner of the Mother.
  const first = within(panel).getByRole("group", { name: "Ягнёнок 1" });
  await user.tab();
  expect(focused()).toBe(within(first).getByRole("button", { name: "Самец" }));
  await user.keyboard("{Enter}");
  await user.tab();
  expect(focused()).toBe(within(first).getByRole("textbox", { name: "Бирка" }));
  await user.keyboard("101");
  await user.tab();
  expect(focused()).toBe(within(first).getByRole("combobox", { name: "Владелец" }));
  await user.tab();
  expect(focused()).toBe(within(panel).getByRole("button", { name: "Добавить ягнёнка" }));
  await user.keyboard("{Enter}");

  // The second Lamb: «Добавить ягнёнка» moves the focus into the new row.
  const second = within(panel).getByRole("group", { name: "Ягнёнок 2" });
  expect(focused()).toBe(within(second).getByRole("button", { name: "Самец" }));
  await user.keyboard("{ArrowRight}");
  expect(focused()).toBe(within(second).getByRole("button", { name: "Самка" }));
  await user.keyboard("{Enter}");
  await user.tab();
  await user.keyboard("102");
  await user.tab();
  await user.tab();
  expect(focused()).toBe(within(second).getByRole("button", { name: "Убрать ягнёнка 2" }));
  await user.tab();
  await user.tab();
  const stillborn = within(panel).getByRole("textbox", { name: "Мертворождённых" });
  expect(focused()).toBe(stillborn);
  await user.keyboard("{Backspace}1{Enter}");

  // The panel closes, and the table says what the Lambing did.
  expect(await screen.findByText("Записано ягнят: 2")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  const today = dateAt(Date.now(), farm.timeZone);
  const [lambing, ...others] = lambingsOf(farm);
  expect(others).toEqual([]);
  expect(lambing).toMatchObject({ motherId: mother, fatherId: father, date: today, stillborn: 1 });
  const lambs = lambing!.lambIds.map((id) => sheepOf(id));
  expect(lambs).toMatchObject([
    { tag: "101", sex: "ram" },
    { tag: "102", sex: "ewe" },
  ]);
  for (const lamb of lambs) {
    expect(lamb).toMatchObject({
      motherId: mother,
      fatherId: father,
      birthDate: today,
      origin: "born",
      initialEntry: false,
      status: "active",
      ownerId: zarina,
      flockId: upper,
    });
  }
});

/** Opens the panel «Окот» from the table and picks the Mother with the mouse. */
async function openWithMother(user: UserEvent, mother: string | RegExp) {
  await user.click(await screen.findByRole("button", { name: /^Записать окот/ }));
  const panel = await screen.findByRole("dialog", { name: "Окот" });
  await user.click(within(panel).getByRole("combobox", { name: "Мать" }));
  await user.click(await screen.findByRole("option", { name: mother }));
  return panel;
}

/** The row of the Lamb with the number in the panel. */
const lambRow = (panel: HTMLElement, number: number) =>
  within(panel).getByRole("group", { name: `Ягнёнок ${number}` });

/** The Owner that the row of a Lamb shows. */
const ownerOf = (row: HTMLElement) =>
  within(row).getByRole("combobox", { name: "Владелец" }).querySelector("[data-slot=select-value]")
    ?.textContent;

test("each Lamb gets the Owner of the Mother, unless the Member chooses another for it", async () => {
  const user = userEvent.setup();
  const { farm } = farmWithEwe();
  addMembers(farm, aMember("bolat", "editor"));
  addSheep(farm, {
    tag: "3",
    sex: "ewe",
    birthDate: "2022-04-01",
    ownerId: "membership-bolat" as MembershipId,
  });
  renderApp(`/farms/${farm.id}/sheep`);

  const panel = await openWithMother(user, /^1 Айгуль/);
  await waitFor(() => expect(ownerOf(lambRow(panel, 1))).toBe("zarina"));
  await user.click(within(panel).getByRole("button", { name: "Добавить ягнёнка" }));
  expect(ownerOf(lambRow(panel, 2))).toBe("zarina");

  // The Member gives the second Lamb to aibek.
  await user.click(within(lambRow(panel, 2)).getByRole("combobox", { name: "Владелец" }));
  await user.click(await screen.findByRole("option", { name: "aibek" }));
  expect(ownerOf(lambRow(panel, 2))).toBe("aibek");

  // Another Mother: the first Lamb follows her Owner, the second keeps the Owner of the Member.
  const motherInput = within(panel).getByRole("combobox", { name: "Мать" });
  await user.clear(motherInput);
  await user.type(motherInput, "3");
  await user.click(await screen.findByRole("option", { name: /^3/ }));
  await waitFor(() => expect(ownerOf(lambRow(panel, 1))).toBe("bolat"));
  expect(ownerOf(lambRow(panel, 2))).toBe("aibek");

  await user.click(within(lambRow(panel, 1)).getByRole("button", { name: "Самка" }));
  await user.click(within(lambRow(panel, 2)).getByRole("button", { name: "Самец" }));
  await user.click(within(panel).getByRole("button", { name: /^Записать окот/ }));

  expect(await screen.findByText("Записано ягнят: 2")).toBeTruthy();
  const lambs = lambingsOf(farm)[0]!.lambIds.map((id) => sheepOf(id)?.ownerId);
  expect(lambs).toEqual(["membership-bolat", "membership-aibek"]);
});

test("two Lambs with one Tag show an error, and the Lambing writes nothing until the Member fixes it", async () => {
  const user = userEvent.setup();
  const { farm } = farmWithEwe();
  renderApp(`/farms/${farm.id}/sheep`);

  const panel = await openWithMother(user, /^1 Айгуль/);
  await user.click(within(lambRow(panel, 1)).getByRole("button", { name: "Самец" }));
  await user.type(within(lambRow(panel, 1)).getByRole("textbox", { name: "Бирка" }), "A-7");
  await user.click(within(panel).getByRole("button", { name: "Добавить ягнёнка" }));
  await user.click(within(lambRow(panel, 2)).getByRole("button", { name: "Самка" }));
  const secondTag = within(lambRow(panel, 2)).getByRole("textbox", { name: "Бирка" });
  await user.type(secondTag, " a-7 ");
  await user.click(within(panel).getByRole("button", { name: /^Записать окот/ }));

  expect(
    within(panel).getByText("У двух ягнят одна и та же бирка. Проверьте номера."),
  ).toBeTruthy();
  expect(secondTag.getAttribute("aria-invalid")).toBe("true");
  expect(lambingsOf(farm)).toEqual([]);

  await user.clear(secondTag);
  await user.type(secondTag, "A-8");
  expect(within(panel).queryByText(/одна и та же бирка/)).toBeNull();
  await user.click(within(panel).getByRole("button", { name: /^Записать окот/ }));
  expect(await screen.findByText("Записано ягнят: 2")).toBeTruthy();
  expect(lambingsOf(farm)[0]!.lambIds.map((id) => sheepOf(id)?.tag)).toEqual(["A-7", "A-8"]);
});

test("the card of an Ewe lists her Lambings, and records a new one with her as the Mother", async () => {
  const user = userEvent.setup();
  const { farm, mother, father } = farmWithEwe();
  const ram = addSheep(farm, {
    tag: "10",
    birthDate: "2026-03-10",
    motherId: mother,
    fatherId: father,
  });
  const ewe = addSheep(farm, {
    tag: "11",
    sex: "ewe",
    birthDate: "2026-03-10",
    motherId: mother,
    fatherId: father,
  });
  addLambing(farm, {
    motherId: mother,
    fatherId: father,
    date: "2026-03-10",
    lambIds: [ram, ewe],
    stillborn: 1,
  });
  renderApp(`/farms/${farm.id}/sheep/${mother}`);

  const lambings = await screen.findByRole("region", { name: "Окоты" });
  expect(lines(lambings)).toEqual([
    "10.03.2026 — 2 ягнёнка: 10, 11 · отец: 2 Алтын · мертворождённых: 1",
  ]);

  await user.click(screen.getByRole("button", { name: "Записать окот" }));
  const panel = await screen.findByRole("dialog", { name: "Окот" });
  // The Mother is filled in, so the date has the focus.
  await waitFor(() => expect(focused()).toBe(within(panel).getByLabelText("Дата окота")));
  await waitFor(() =>
    expect(within(panel).getByRole("combobox", { name: "Мать" })).toHaveProperty(
      "value",
      "1 Айгуль",
    ),
  );
  await user.click(within(lambRow(panel, 1)).getByRole("button", { name: "Самка" }));
  await user.type(within(lambRow(panel, 1)).getByRole("textbox", { name: "Бирка" }), "12{Enter}");

  expect(await screen.findByText("Записано ягнят: 1")).toBeTruthy();
  const today = formatCalendarDate(dateAt(Date.now(), farm.timeZone), "ru");
  await waitFor(() =>
    expect(lines(lambings)).toEqual([
      `${today} — 1 ягнёнок: 12 · отец неизвестен`,
      "10.03.2026 — 2 ягнёнка: 10, 11 · отец: 2 Алтын · мертворождённых: 1",
    ]),
  );

  // A Lamb opens its card. A Ram has no Lambings.
  await user.click(within(lambings).getByRole("link", { name: "10" }));
  expect(await screen.findByRole("heading", { name: "10" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Записать окот" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Окоты" })).toBeNull();
});

test("a Mother in a Flock that is Archived now: the panel warns, and the core refuses the Lambing", async () => {
  const user = userEvent.setup();
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  const old = addFlock(farm, { name: "Старое" });
  const lower = addFlock(farm, { name: "Нижнее" });
  const mother = addSheep(farm, { tag: "5", sex: "ewe", birthDate: "2022-01-01" });
  addFlockMove(mother, old, "2026-01-01");
  addFlockMove(mother, lower, "2026-06-01");
  updateFake((backend) => {
    backend.flocks.find((flock) => flock.id === old)!.archivedAt = Date.UTC(2026, 6, 1);
  });
  renderApp(`/farms/${farm.id}/sheep/${mother}`);

  await user.click(await screen.findByRole("button", { name: "Записать окот" }));
  const panel = await screen.findByRole("dialog", { name: "Окот" });
  // Today the Mother is in «Нижнее».
  await within(panel).findByText("Нижнее");

  const date = within(panel).getByLabelText("Дата окота");
  await user.clear(date);
  await user.type(date, "2026-05-15");
  expect(
    await within(panel).findByText(
      "«Старое» в архиве, и ягнят нельзя записать в это стадо. Верните стадо из архива или исправьте дату окота.",
    ),
  ).toBeTruthy();

  await user.click(within(lambRow(panel, 1)).getByRole("button", { name: "Самец" }));
  await user.click(within(panel).getByRole("button", { name: /^Записать окот/ }));
  expect(
    await within(panel).findByText(
      "На дату окота мать была в стаде, которое теперь в архиве. Верните стадо из архива или исправьте дату.",
    ),
  ).toBeTruthy();
  expect(lambingsOf(farm)).toEqual([]);
});
