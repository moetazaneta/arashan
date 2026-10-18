import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { addBreed, addMembers, addSheep, aFarm, aMember, signIn } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** An Editor "aibek" of a Farm. */
function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"));
  return farm;
}

/** The rows of the list «Породы», as their text. */
function breedRows() {
  const table = screen.getByRole("table", { name: "Породы" });
  return within(table)
    .getAllByRole("row")
    .map((row) => row.textContent);
}

/** Opens the menu of the Breed. */
async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Действия с породой ${name}` }));
  return screen.findByRole("menu");
}

test("a Member opens «Породы» from the navigation and adds a Breed with Enter", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Породы" }));
  expect(await screen.findByRole("heading", { name: "Породы" })).toBeTruthy();
  // Arashan is built in: it is the main Breed, and it has no actions.
  await screen.findByText("Арашан");
  expect(breedRows()).toEqual(["Арашаносновная"]);
  expect(screen.queryByRole("button", { name: "Действия с породой Арашан" })).toBeNull();

  const input = screen.getByRole("textbox", { name: "Новая порода" });
  await user.type(input, "Эдильбаевская{Enter}");

  await screen.findByText("Эдильбаевская");
  expect(breedRows()).toEqual(["Арашаносновная", "Эдильбаевская"]);
  // The input is ready for the next Breed.
  expect(input).toHaveProperty("value", "");
  expect(document.activeElement).toBe(input);
});

test("a name that the Farm already has shows its message under the input", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addBreed(farm, "Гиссарская", { archivedAt: Date.now() });
  renderApp(`/farms/${farm.id}/breeds`);

  const input = await screen.findByRole("textbox", { name: "Новая порода" });
  // The case and the spaces do not count, and an Archived Breed keeps its name.
  await user.type(input, " гиссарская {Enter}");

  const field = input.closest<HTMLElement>("[data-slot=field]");
  expect(field).not.toBeNull();
  expect(
    await within(field!).findByText("Такая порода уже есть в списке, возможно в архиве."),
  ).toBeTruthy();
  expect(breedRows()).toHaveLength(2);
});

test("a Member sends a Breed to the archive and returns it", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addBreed(farm, "Гиссарская");
  renderApp(`/farms/${farm.id}/breeds`);

  await screen.findByText("Гиссарская");
  let menu = await openMenu(user, "Гиссарская");
  await user.click(within(menu).getByRole("menuitem", { name: "В архив" }));
  expect(await screen.findByText("В архиве")).toBeTruthy();
  expect(breedRows()).toEqual(["Арашаносновная", "ГиссарскаяВ архиве"]);

  menu = await openMenu(user, "Гиссарская");
  await user.click(within(menu).getByRole("menuitem", { name: "Вернуть из архива" }));
  await screen.findByText("Гиссарская");
  expect(breedRows()).toEqual(["Арашаносновная", "Гиссарская"]);
});

test("a Member renames a Breed in a dialog", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addBreed(farm, "Гисарская");
  renderApp(`/farms/${farm.id}/breeds`);

  await screen.findByText("Гисарская");
  const menu = await openMenu(user, "Гисарская");
  await user.click(within(menu).getByRole("menuitem", { name: "Переименовать" }));
  const dialog = await screen.findByRole("dialog", { name: "Переименовать породу" });
  const input = within(dialog).getByRole("textbox", { name: "Название породы" });
  expect(input).toHaveProperty("value", "Гисарская");
  await user.clear(input);
  await user.type(input, "Гиссарская{Enter}");

  expect(await screen.findByText("Гиссарская")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(breedRows()).toEqual(["Арашаносновная", "Гиссарская"]);
});

test("a Breed that no Sheep has can be deleted; a Breed in use can only go to the archive", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addBreed(farm, "Гиссарская");
  const used = addBreed(farm, "Эдильбаевская");
  addSheep(farm, { tag: "12", manualBreeds: [{ breedId: used, share: 500_000 }] });
  renderApp(`/farms/${farm.id}/breeds`);

  await screen.findByText("Эдильбаевская");
  let menu = await openMenu(user, "Эдильбаевская");
  const remove = within(menu).getByRole("menuitem", { name: "Удалить" });
  expect(remove.getAttribute("aria-disabled")).toBe("true");
  expect(
    within(menu).getByText("Породу используют бараны: её можно только отправить в архив."),
  ).toBeTruthy();
  await user.keyboard("{Escape}");

  menu = await openMenu(user, "Гиссарская");
  await user.click(within(menu).getByRole("menuitem", { name: "Удалить" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Удалить породу Гиссарская?")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

  await waitFor(() => expect(breedRows()).toEqual(["Арашаносновная", "Эдильбаевская"]));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
