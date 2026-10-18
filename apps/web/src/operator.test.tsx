import { DomainError } from "@arashan/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { addFarm, aFarm, signIn, updateFake } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

test("only the Operator has the link to the screen «Фермы»", async () => {
  signIn({ username: "operator", isOperator: true });
  const operator = renderApp("/");
  expect(await screen.findByRole("link", { name: "Фермы" })).toBeTruthy();
  operator.unmount();

  signIn({ username: "aibek" });
  renderApp("/");
  await screen.findByText("У вас пока нет фермы");
  expect(screen.queryByRole("link", { name: "Фермы" })).toBeNull();
});

test("a User who is not the Operator cannot make a Farm", async () => {
  signIn({ username: "aibek", farms: [[aFarm("Чуйская"), "admin"]] });
  renderApp("/operator/farms");

  expect(await screen.findByText("Этот раздел только для оператора")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Создать ферму" })).toBeNull();
  expect(screen.queryByLabelText("Название")).toBeNull();
});

test("the Operator makes a Farm and gets the invite link for its first Admin", async () => {
  const user = userEvent.setup();
  signIn({ username: "operator", isOperator: true });
  renderApp("/operator/farms");

  expect(await screen.findByText("Ферм пока нет")).toBeTruthy();
  // The lamb age is 4 months unless the Operator changes it.
  expect((screen.getByLabelText("Возраст ягнёнка, месяцев") as HTMLInputElement).value).toBe("4");
  await user.type(screen.getByLabelText("Название"), "Чуйская");
  await user.click(screen.getByRole("button", { name: "Создать ферму" }));

  const link = (await screen.findByLabelText("Ссылка-приглашение")) as HTMLInputElement;
  expect(link.value).toBe(`${window.location.origin}/invite/token-1`);
  expect(screen.getByText("Ссылка для администратора фермы «Чуйская»")).toBeTruthy();
  expect(screen.getByText(/Ссылка работает один раз, до/)).toBeTruthy();
  const row = screen.getByRole("row", { name: /Чуйская/ });
  expect(within(row).getByText("Ждёт администратора")).toBeTruthy();
  // The form is ready for the next Farm.
  expect((screen.getByLabelText("Название") as HTMLInputElement).value).toBe("");
});

test("a Farm without a name is not made, and the name field says why", async () => {
  const user = userEvent.setup();
  signIn({ username: "operator", isOperator: true });
  updateFake((backend) => {
    backend.failures.createFarm = new DomainError("farm.nameRequired");
  });
  renderApp("/operator/farms");

  await user.click(await screen.findByRole("button", { name: "Создать ферму" }));

  expect((await screen.findByRole("alert")).textContent).toBe("Введите название фермы.");
  expect(screen.getByLabelText("Название").getAttribute("aria-invalid")).toBe("true");
  expect(screen.queryByLabelText("Ссылка-приглашение")).toBeNull();
});

test("the Operator makes a new link for a Farm that waits for its Admin", async () => {
  const user = userEvent.setup();
  signIn({ username: "operator", isOperator: true });
  addFarm(aFarm("Чуйская", { hasMembers: false }), aFarm("Алайская", { hasMembers: true }));
  renderApp("/operator/farms");

  const alai = await screen.findByRole("row", { name: /Алайская/ });
  expect(within(alai).getByText("Администратор есть")).toBeTruthy();
  expect(within(alai).queryByRole("button")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Новая ссылка для фермы «Чуйская»" }));

  const link = (await screen.findByLabelText("Ссылка-приглашение")) as HTMLInputElement;
  expect(link.value).toBe(`${window.location.origin}/invite/token-1`);
  expect(screen.getByText("Ссылка для администратора фермы «Чуйская»")).toBeTruthy();
});
