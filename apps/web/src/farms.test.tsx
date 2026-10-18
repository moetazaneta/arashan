import { DomainError } from "@arashan/core";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { addFarm, aFarm, signIn, updateFake } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

test("a User without a Membership sees only the message that the User has no Farm", async () => {
  signIn();
  const { router } = renderApp("/");

  expect(await screen.findByText("У вас пока нет фермы")).toBeTruthy();
  expect(
    screen.getByText("Попросите администратора фермы прислать ссылку-приглашение."),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Ферма" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Фермы" })).toBeNull();
  expect(router.state.location.pathname).toBe("/");
});

test("a Member of two Farms opens the first one, and switches to the other", async () => {
  const user = userEvent.setup();
  const chui = aFarm("Чуйская");
  const alai = aFarm("Алайская", { currency: "USD", lambAgeMonths: 6 });
  signIn({
    farms: [
      [chui, "admin"],
      [alai, "editor"],
    ],
  });
  const { router } = renderApp("/");

  // The Farms are by name: «Алайская» is the first one.
  expect(await screen.findByRole("heading", { name: "Алайская" })).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/farms/${alai.id}`);
  expect(screen.getByText("USD — доллар США")).toBeTruthy();
  expect(screen.getByText("младше 6 месяцев")).toBeTruthy();

  await user.click(screen.getByRole("combobox", { name: "Ферма" }));
  await user.click(await screen.findByRole("option", { name: "Чуйская" }));

  expect(await screen.findByRole("heading", { name: "Чуйская" })).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/farms/${chui.id}`);
  expect(screen.getByText("KGS — киргизский сом")).toBeTruthy();
});

test("the app opens the Farm that the User used last", async () => {
  const chui = aFarm("Чуйская");
  const alai = aFarm("Алайская");
  signIn({
    farms: [
      [chui, "admin"],
      [alai, "editor"],
    ],
  });
  const first = renderApp(`/farms/${chui.id}`);
  await screen.findByRole("heading", { name: "Чуйская" });
  first.unmount();

  const { router } = renderApp("/");

  expect(await screen.findByRole("heading", { name: "Чуйская" })).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/farms/${chui.id}`);
});

test("a Farm of which the User is not a Member does not open", async () => {
  const other = aFarm("Чужая");
  addFarm(other);
  signIn({ farms: [[aFarm("Своя"), "admin"]] });
  renderApp(`/farms/${other.id}`);

  expect(await screen.findByText("У вас нет доступа к этой ферме.")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Чужая" })).toBeNull();
  expect(screen.getByRole("link", { name: "На главную" })).toBeTruthy();
});

test("an Admin changes the settings of the Farm", async () => {
  const user = userEvent.setup();
  const farm = aFarm("Чуйская");
  signIn({ farms: [[farm, "admin"]] });
  renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Изменить настройки" }));
  const lambAge = await screen.findByLabelText("Возраст ягнёнка, месяцев");
  await user.clear(lambAge);
  await user.type(lambAge, "5");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Настройки сохранены.")).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Ферма" }));
  expect(await screen.findByText("младше 5 месяцев")).toBeTruthy();
});

test("the settings form shows a domain error at its field", async () => {
  const user = userEvent.setup();
  const farm = aFarm("Чуйская");
  signIn({ farms: [[farm, "admin"]] });
  updateFake((backend) => {
    backend.failures.updateFarmSettings = new DomainError("farm.lambAgeInvalid");
  });
  renderApp(`/farms/${farm.id}/settings`);

  const lambAge = await screen.findByLabelText("Возраст ягнёнка, месяцев");
  await user.clear(lambAge);
  await user.type(lambAge, "13");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Введите целое число месяцев от 1 до 12.",
  );
  expect(lambAge.getAttribute("aria-invalid")).toBe("true");
  expect(screen.queryByText("Настройки сохранены.")).toBeNull();
});

test("an Editor sees the settings, but cannot change them", async () => {
  const farm = aFarm("Чуйская");
  signIn({ farms: [[farm, "editor"]] });
  const farmPage = renderApp(`/farms/${farm.id}`);

  expect(await screen.findByText("KGS — киргизский сом")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Изменить настройки" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Настройки" })).toBeNull();
  farmPage.unmount();

  renderApp(`/farms/${farm.id}/settings`);
  expect(await screen.findByText("Настройки фермы меняет только её администратор.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
});
