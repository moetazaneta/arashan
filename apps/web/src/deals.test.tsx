import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { currencySymbol, formatAmount } from "@/format";
import {
  addDefaultMoneyCategories,
  addFlock,
  addFlockMove,
  addMembers,
  addSale,
  addSheep,
  aFarm,
  aMember,
  sheepState,
  signIn,
} from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** The symbol of the currency of the Farm. */
const som = currencySymbol("KGS", "ru");

function memberOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "editor"]] });
  addMembers(farm, aMember("aibek", "editor"));
  addDefaultMoneyCategories(farm);
  return farm;
}

/** The rows of a table under its header, as their text. */
function rowsOf(name: string) {
  const table = screen.getByRole("table", { name });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
}

test("a Member sells the selected Sheep, and the Income links to the Sale", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const flock = addFlock(farm, { name: "Верхнее" });
  const first = addSheep(farm, { tag: "1" });
  addFlockMove(first, flock, "2026-05-01");
  const second = addSheep(farm, { tag: "2" });
  addSheep(farm, { tag: "3" });
  const { router } = renderApp(`/farms/${farm.id}/sheep`);

  await screen.findByRole("heading", { name: "Бараны 3" });
  await user.click(screen.getByRole("checkbox", { name: "Выбрать барана 1" }));
  await user.click(screen.getByRole("checkbox", { name: "Выбрать барана 2" }));
  await user.click(screen.getByRole("button", { name: "Продать" }));
  const dialog = await screen.findByRole("dialog", { name: "Продать 2 барана" });
  await user.click(within(dialog).getByRole("button", { name: "Продать" }));
  expect(await within(dialog).findByText(/Укажите сумму/)).toBeTruthy();
  await user.type(within(dialog).getByLabelText("Сумма"), "30 000");
  await user.click(within(dialog).getByRole("button", { name: "Продать" }));

  // The card of the Sale opens.
  await screen.findByRole("heading", { name: /^Продажа от / });
  expect(router.state.location.pathname).toMatch(new RegExp(`^/farms/${farm.id}/deals/`));
  expect(document.body.textContent).toContain(`${formatAmount(30_000_00, "ru")} ${som}`);
  expect(sheepState(first)).toMatchObject({ status: "sold", flockId: null });
  expect(sheepState(second)?.status).toBe("sold");

  await user.click(screen.getByRole("link", { name: "«Продажа баранов»" }));
  const income = await screen.findByRole("row", { name: /Продажа баранов/ });
  expect(income.textContent).toContain(formatAmount(30_000_00, "ru"));
  await user.click(within(income).getByRole("link", { name: "Продажа" }));
  await screen.findByRole("heading", { name: /^Продажа от / });
});

test("a Member buys two new Sheep in one form, into a Flock", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  addFlock(farm, { name: "Верхнее" });
  renderApp(`/farms/${farm.id}/deals`);

  expect(await screen.findByText(/Здесь будут продажи и покупки баранов/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Купить баранов" }));
  const sheet = await screen.findByRole("dialog", { name: "Купить баранов" });
  await user.type(within(sheet).getByLabelText("Сумма за всех"), "12000");
  await user.click(within(sheet).getByLabelText("Стадо"));
  await user.click(await screen.findByRole("option", { name: "Верхнее" }));
  await user.click(within(sheet).getByRole("button", { name: "Ещё баран" }));
  const [first, second] = within(sheet).getAllByRole("group", { name: /^Баран \d$/ });
  await user.type(within(first!).getByLabelText("Бирка"), "К-1");
  await user.click(within(first!).getByRole("button", { name: "Самец" }));
  await user.type(within(second!).getByLabelText("Бирка"), "К-2");
  // A row without a sex is not sent.
  await user.click(within(sheet).getByRole("button", { name: "Купить" }));
  expect(await within(second!).findByText("Выберите пол: самец или самка.")).toBeTruthy();
  await user.click(within(second!).getByRole("button", { name: "Самка" }));
  await user.click(within(sheet).getByRole("button", { name: "Купить" }));

  await screen.findByRole("heading", { name: /^Покупка от / });
  expect(screen.getByRole("link", { name: "Верхнее" })).toBeTruthy();
  expect(rowsOf("Бараны")).toEqual([
    expect.stringMatching(/^К-1Самецaibek/),
    expect.stringMatching(/^К-2Самкаaibek/),
  ]);
  // The link back to the list, after the one of the header.
  await user.click(screen.getAllByRole("link", { name: "Сделки" }).at(-1)!);
  await screen.findByRole("table", { name: "Сделки" });
  expect(rowsOf("Сделки")).toEqual([
    expect.stringMatching(new RegExp(`ПокупкаК-1, К-2Верхнее${formatAmount(12_000_00, "ru")}$`)),
  ]);
});

test("a change of the price on the card of a deal changes its Income", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const sheepId = addSheep(farm, { tag: "1" });
  const saleId = await addSale(farm, { sheepIds: [sheepId], date: "2026-10-15", price: 500_00 });
  renderApp(`/farms/${farm.id}/deals/${saleId}`);

  await screen.findByRole("heading", { name: "Продажа от 15.10.2026" });
  await user.click(screen.getByRole("button", { name: "Изменить сумму" }));
  const dialog = await screen.findByRole("dialog", { name: "Изменить сумму" });
  const price = within(dialog).getByLabelText("Сумма");
  await user.clear(price);
  await user.type(price, "450");
  await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));

  await waitFor(() =>
    expect(document.body.textContent).toContain(`${formatAmount(450_00, "ru")} ${som}`),
  );
  await user.click(screen.getByRole("link", { name: "«Продажа баранов»" }));
  const income = await screen.findByRole("row", { name: /Продажа баранов/ });
  expect(income.textContent).toContain(formatAmount(450_00, "ru"));
});

test("a cancelled Sale makes its Sheep Active again, and the card says that it is gone", async () => {
  const user = userEvent.setup();
  const farm = memberOfFarm();
  const sheepId = addSheep(farm, { tag: "1" });
  const saleId = await addSale(farm, { sheepIds: [sheepId], date: "2026-10-15", price: 500_00 });
  const { router } = renderApp(`/farms/${farm.id}/sheep/${sheepId}`);

  // The card of the Sold Sheep links to its Sale.
  await screen.findByRole("heading", { name: /^1/ });
  await user.click(screen.getAllByRole("link", { name: "Продажа" })[0]!);
  await screen.findByRole("heading", { name: "Продажа от 15.10.2026" });
  await user.click(screen.getByRole("button", { name: "Отменить продажу" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Отменить продажу?" });
  await user.click(within(confirm).getByRole("button", { name: "Отменить продажу" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/farms/${farm.id}/deals`));
  expect(sheepState(sheepId)?.status).toBe("active");
  expect(await screen.findByText(/Здесь будут продажи и покупки баранов/)).toBeTruthy();
  void router.navigate({ to: `/farms/${farm.id}/deals/${saleId}` });
  expect(await screen.findByText("Этой сделки нет: её отменили.")).toBeTruthy();
});
