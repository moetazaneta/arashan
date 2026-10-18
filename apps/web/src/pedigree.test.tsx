import { arashanBreedId } from "@arashan/core";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import {
  addBreed,
  addFile,
  addMembers,
  addSheep,
  aFarm,
  aMember,
  holdUploads,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** A Member "aibek" of a Farm with another Member "zarina". */
function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"), aMember("zarina", "admin"));
  return farm;
}

/** The text with each run of spaces as one space: a percent has a no-break space in Russian. */
function plain(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** The value of a field of the card, by its label. */
function cardField(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`The field «${label}» has no value.`);
  return value;
}

/** Opens the panel «Добавить барана» from the table, and its block «Дополнительно». */
async function openRegisterPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Добавить барана" }));
  const panel = await screen.findByRole("dialog", { name: "Добавить барана" });
  await user.click(within(panel).getByRole("button", { name: "Дополнительно" }));
  return panel;
}

/** Picks a parent in the combobox «Мать» or «Отец» of the panel, by the text of its option. */
async function pickParent(
  user: ReturnType<typeof userEvent.setup>,
  panel: HTMLElement,
  field: "Мать" | "Отец",
  option: string | RegExp,
) {
  await user.click(within(panel).getByRole("combobox", { name: field }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/** The whole Breed of Arashan, by hand: a Sheep with no parents that is 100 percent Arashan. */
const pureArashan = [{ breedId: arashanBreedId, share: 1_000_000 }];

test("the card shows the parents, the Breed composition, the children, the Passport and the Grade", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const edilbaev = addBreed(farm, "Эдильбаевская");
  const scanId = addFile();
  const mother = addSheep(farm, {
    tag: "1",
    name: "Айгуль",
    sex: "ewe",
    manualBreeds: pureArashan,
    passport: { number: "KG-0042", issueDate: "2026-05-01", scanId },
    grade: { grade: "elite", date: "2026-09-01" },
  });
  const father = addSheep(farm, {
    tag: "2",
    manualBreeds: [
      { breedId: arashanBreedId, share: 500_000 },
      { breedId: edilbaev, share: 500_000 },
    ],
  });
  const child = addSheep(farm, { tag: "3", name: "Буян", motherId: mother, fatherId: father });
  renderApp(`/farms/${farm.id}/sheep/${child}`);

  // The block «Дополнительно» opens by itself: the Sheep has parents.
  await screen.findByRole("heading", { name: "3 Буян" });
  expect(within(cardField("Мать")).getByRole("link", { name: "1 Айгуль" })).toBeTruthy();
  expect(within(cardField("Отец")).getByRole("link", { name: "2" })).toBeTruthy();
  await within(cardField("Состав породы")).findByText(/Арашан/);
  expect(plain(cardField("Состав породы").textContent)).toBe("Арашан 75 %, Эдильбаевская 25 %");
  expect(cardField("Ветпаспорт").textContent).toBe("нет");
  expect(cardField("Дети").textContent).toBe("нет");

  await user.click(within(cardField("Мать")).getByRole("link", { name: "1 Айгуль" }));
  expect(await screen.findByRole("heading", { name: "1 Айгуль" })).toBeTruthy();
  expect(cardField("Мать").textContent).toBe("неизвестна");
  expect(cardField("Отец").textContent).toBe("неизвестен");
  expect(within(cardField("Дети")).getByRole("link", { name: "3 Буян" })).toBeTruthy();
  expect(cardField("Ветпаспорт").textContent).toBe("KG-0042, выдан 01.05.2026 · Скан");
  const scan = within(cardField("Ветпаспорт")).getByRole("link", { name: "Скан" });
  expect(scan.getAttribute("href")).toBe(`https://files.test/${scanId}`);
  expect(scan.getAttribute("target")).toBe("_blank");
  expect(cardField("Класс").textContent).toBe("Элита, бонитировка 01.09.2026");
});

test("the tab «Родословная» shows the ancestors, and a parent that nobody knows", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const greatGrandmother = addSheep(farm, { tag: "5", sex: "ewe", manualBreeds: pureArashan });
  const grandmother = addSheep(farm, { tag: "10", sex: "ewe", motherId: greatGrandmother });
  const grandfather = addSheep(farm, { tag: "11", name: "Алтын", manualBreeds: pureArashan });
  const mother = addSheep(farm, {
    tag: "20",
    sex: "ewe",
    motherId: grandmother,
    fatherId: grandfather,
  });
  const child = addSheep(farm, { tag: "30", motherId: mother });
  renderApp(`/farms/${farm.id}/sheep/${child}`);

  await user.click(await screen.findByRole("tab", { name: "Родословная" }));
  const tree = await screen.findByRole("tabpanel", { name: "Родословная" });
  const parents = await within(tree).findByRole("region", { name: "Родители" });
  expect(
    within(parents)
      .getAllByRole("listitem")
      .map((item) => plain(item.textContent)),
  ).toEqual([
    // The Mother gets half from her Father (100 %) and half from her Mother (50 %).
    "20 Самка · арашан 75 %",
    "неизвестен",
  ]);
  const grandparents = within(tree).getByRole("region", { name: "Деды" });
  expect(
    within(grandparents)
      .getAllByRole("listitem")
      .map((item) => plain(item.textContent)),
  ).toEqual(["10 Самка · арашан 50 %", "11 Алтын Самец · арашан 100 %"]);
  const greatGrandparents = within(tree).getByRole("region", { name: "Прадеды" });
  expect(
    within(greatGrandparents)
      .getAllByRole("listitem")
      .map((item) => plain(item.textContent)),
  ).toEqual(["5 Самка · арашан 100 %", "неизвестен", "неизвестна", "неизвестен"]);

  // A Sheep of the tree opens its card.
  await user.click(within(grandparents).getByRole("link", { name: /^11 Алтын/ }));
  expect(await screen.findByRole("heading", { name: "11 Алтын" })).toBeTruthy();
});

test("the card of an External Sheep has no Owner", async () => {
  const farm = memberOfFarm();
  const external = addSheep(farm, { tag: "E-7", name: "Чужак", origin: "external" });
  addSheep(farm, { tag: "8", fatherId: external });
  renderApp(`/farms/${farm.id}/sheep/${external}`);

  expect(await screen.findByRole("heading", { name: "E-7 Чужак" })).toBeTruthy();
  expect(screen.getByText("внешний")).toBeTruthy();
  expect(screen.queryByText("Владелец", { selector: "dt" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Владельцы" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Сменить владельца" })).toBeNull();
  expect(within(cardField("Дети")).getByRole("link", { name: "8" })).toBeTruthy();
});

test("a Sheep that is a parent cannot be deleted", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const mother = addSheep(farm, { tag: "1", sex: "ewe" });
  addSheep(farm, { tag: "2", motherId: mother });
  const { router } = renderApp(`/farms/${farm.id}/sheep/${mother}`);

  await user.click(await screen.findByRole("button", { name: "Удалить" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

  expect(
    await within(dialog).findByText("Этот баран — родитель других баранов, его нельзя удалить."),
  ).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/farms/${farm.id}/sheep/${mother}`);
});

test("the columns «Арашан, %» and «Класс» show the part of Arashan and the Grade", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, {
    tag: "4",
    manualBreeds: [{ breedId: arashanBreedId, share: 875_000 }],
    grade: { grade: "elite", date: "2026-09-01" },
  });
  renderApp(`/farms/${farm.id}/sheep`);

  const table = await screen.findByRole("table", { name: "Бараны" });
  expect(within(table).queryByRole("columnheader", { name: "Арашан, %" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Столбцы" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Арашан, %" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Класс" }));
  await user.keyboard("{Escape}");

  const [, row] = within(table).getAllByRole("row");
  const cells = within(row!)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
  expect(cells).toContain("87,5");
  expect(cells).toContain("Элита");
});

test("a Member registers a Sheep with a Mother and sees its Breed composition on the card", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "1", name: "Айгуль", sex: "ewe", manualBreeds: pureArashan });
  addSheep(farm, { tag: "2", sex: "ram" });
  renderApp(`/farms/${farm.id}/sheep`);

  const panel = await openRegisterPanel(user);
  await user.type(within(panel).getByRole("textbox", { name: "Бирка" }), "40");
  await user.click(within(panel).getByRole("button", { name: "Самец" }));
  // A Sheep without parents is all Unknown.
  expect(await within(panel).findByText("неизвестно 100 %")).toBeTruthy();
  // The Mother is an Ewe: the Ram is not a choice.
  await user.click(within(panel).getByRole("combobox", { name: "Мать" }));
  expect(screen.queryByRole("option", { name: "2" })).toBeNull();
  await user.click(await screen.findByRole("option", { name: "1 Айгуль" }));

  expect(await within(panel).findByText("Арашан 50 %, неизвестно 50 %")).toBeTruthy();
  expect(within(panel).getByText("Можно указать до 50 %.")).toBeTruthy();
  await user.click(within(panel).getByRole("button", { name: "Добавить барана" }));

  await user.click(await within(panel).findByRole("link", { name: "40" }));
  expect(await screen.findByRole("heading", { name: "40" })).toBeTruthy();
  expect(within(cardField("Мать")).getByRole("link", { name: "1 Айгуль" })).toBeTruthy();
  await within(cardField("Состав породы")).findByText(/Арашан/);
  expect(plain(cardField("Состав породы").textContent)).toBe("Арашан 50 %, неизвестно 50 %");
});

test("the parts by hand halve with the first known parent, and go with the second", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addSheep(farm, { tag: "1", sex: "ewe", manualBreeds: pureArashan });
  addSheep(farm, { tag: "2", sex: "ram", manualBreeds: pureArashan });
  renderApp(`/farms/${farm.id}/sheep`);

  const panel = await openRegisterPanel(user);
  await within(panel).findByText("неизвестно 100 %");
  await user.click(within(panel).getByRole("button", { name: "Добавить породу" }));
  await user.type(within(panel).getByRole("textbox", { name: "Доля, %" }), "80");
  expect(within(panel).getByText("Арашан 80 %, неизвестно 20 %")).toBeTruthy();

  // The unknown Father gives half of the Sheep: 80 % of the Sheep was 40 % of it.
  await pickParent(user, panel, "Мать", "1");
  expect(within(panel).getByRole("textbox", { name: "Доля, %" })).toHaveProperty("value", "40");
  expect(await within(panel).findByText("Арашан 90 %, неизвестно 10 %")).toBeTruthy();

  await pickParent(user, panel, "Отец", "2");
  expect(await within(panel).findByText("Арашан 100 %")).toBeTruthy();
  expect(within(panel).getByText("Состав считается по родителям.")).toBeTruthy();
  expect(within(panel).queryByRole("textbox", { name: "Доля, %" })).toBeNull();
});

test("«Всё неизвестное — арашан» makes the Sheep 100 % Arashan, and then it can have a Passport", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}/sheep`);

  const panel = await openRegisterPanel(user);
  await user.type(within(panel).getByRole("textbox", { name: "Бирка" }), "50");
  await user.click(within(panel).getByRole("button", { name: "Самка" }));
  await user.type(within(panel).getByRole("textbox", { name: "Номер ветпаспорта" }), "KG-1");
  fireEvent.change(within(panel).getByLabelText("Дата выдачи"), {
    target: { value: "2025-01-10" },
  });
  await user.upload(
    within(panel).getByLabelText("Скан"),
    new File(["%PDF-1.7"], "passport.pdf", { type: "application/pdf" }),
  );
  expect(await within(panel).findByText("passport.pdf")).toBeTruthy();
  expect(
    within(panel).getByText("Ветпаспорт может быть только у барана со 100 % арашан."),
  ).toBeTruthy();

  // The core refuses a Passport of a Sheep that is not all Arashan.
  await user.click(within(panel).getByRole("button", { name: "Добавить барана" }));
  expect(
    await within(panel).findByText(
      "Ветпаспорт может быть только у барана со 100 % арашан. Укажите состав породы.",
    ),
  ).toBeTruthy();

  await user.click(within(panel).getByRole("button", { name: "Всё неизвестное — арашан" }));
  expect(within(panel).getByText("Арашан 100 %")).toBeTruthy();
  expect(
    within(panel).queryByText("Ветпаспорт может быть только у барана со 100 % арашан."),
  ).toBeNull();
  await user.click(within(panel).getByRole("button", { name: "Добавить барана" }));

  await user.click(await within(panel).findByRole("link", { name: "50" }));
  await screen.findByRole("heading", { name: "50" });
  expect(plain(cardField("Состав породы").textContent)).toBe("Арашан 100 %");
  expect(cardField("Ветпаспорт").textContent).toBe("KG-1, выдан 10.01.2025 · Скан");
});

test("an upload of a scan that ends later keeps what the Member typed in the meantime", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}/sheep`);
  const release = holdUploads();

  const panel = await openRegisterPanel(user);
  await user.upload(
    within(panel).getByLabelText("Скан"),
    new File(["%PDF-1.7"], "passport.pdf", { type: "application/pdf" }),
  );
  await user.type(within(panel).getByRole("textbox", { name: "Бирка" }), "77");
  await user.type(within(panel).getByRole("textbox", { name: "Номер ветпаспорта" }), "KG-7");
  release();

  expect(await within(panel).findByText("passport.pdf")).toBeTruthy();
  expect(within(panel).getByRole("textbox", { name: "Бирка" })).toHaveProperty("value", "77");
  expect(within(panel).getByRole("textbox", { name: "Номер ветпаспорта" })).toHaveProperty(
    "value",
    "KG-7",
  );
});

test("the mode «Внешний» adds a parent that the forms offer but the table does not show", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}/sheep`);

  await user.click(await screen.findByRole("button", { name: "Добавить барана" }));
  const panel = await screen.findByRole("dialog", { name: "Добавить барана" });
  await user.click(within(panel).getByRole("button", { name: "Внешний" }));
  // An External Sheep has no Owner, no weight, no Passport and no Grade.
  expect(within(panel).queryByRole("combobox", { name: "Владелец" })).toBeNull();
  await user.click(within(panel).getByRole("button", { name: "Дополнительно" }));
  expect(within(panel).queryByRole("textbox", { name: "Вес, кг" })).toBeNull();
  expect(within(panel).queryByRole("textbox", { name: "Номер ветпаспорта" })).toBeNull();
  await user.type(within(panel).getByRole("textbox", { name: "Бирка" }), "E-1");
  await user.type(within(panel).getByRole("textbox", { name: "Кличка" }), "Чужак");
  await user.click(within(panel).getByRole("button", { name: "Самец" }));
  await user.click(within(panel).getByRole("button", { name: "Добавить внешнего барана" }));
  expect(await within(panel).findByRole("status")).toHaveProperty(
    "textContent",
    "Внешний баран добавлен: E-1",
  );

  await user.click(within(panel).getByRole("button", { name: "Начальный ввод" }));
  await user.type(within(panel).getByRole("textbox", { name: "Бирка" }), "60");
  await user.click(within(panel).getByRole("button", { name: "Самка" }));
  await pickParent(user, panel, "Отец", "E-1 Чужак внешний");
  await user.click(within(panel).getByRole("button", { name: "Добавить барана" }));
  await within(panel).findByRole("link", { name: "60" });
  await user.click(within(panel).getByRole("button", { name: "Закрыть" }));

  // The table has the Sheep of the Farm only.
  expect(await screen.findByRole("heading", { name: "Бараны 1" })).toBeTruthy();
  expect(screen.queryByText("E-1")).toBeNull();
});
