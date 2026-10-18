import { DomainError } from "@arashan/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { addInvite, aFarm, signIn, signInFormText, updateFake } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

test("a User opens an invite link, joins the Farm, and lands on it", async () => {
  const user = userEvent.setup();
  const farm = aFarm("Чуйская");
  addInvite("abc", farm, "admin");
  signIn({ username: "aibek" });
  const { router } = renderApp("/invite/abc");

  expect(await screen.findByText("Приглашение в ферму «Чуйская»")).toBeTruthy();
  expect(screen.getByText(/Ваша роль: администратор\./)).toBeTruthy();
  expect(screen.getByText(/Вы вошли как/).textContent).toContain("Вы вошли как aibek.");
  await user.click(screen.getByRole("button", { name: "Вступить в ферму" }));

  expect(await screen.findByRole("heading", { name: "Чуйская" })).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/farms/${farm.id}`);
  // The new Admin sees the settings of the Farm in the header.
  expect(screen.getByRole("link", { name: "Настройки" })).toBeTruthy();
});

test("an expired invite link says that it no longer works", async () => {
  updateFake((backend) => {
    backend.invites.set("old", new DomainError("invite.expired"));
  });
  signIn();
  renderApp("/invite/old");

  expect(await screen.findByText("Ссылка больше не работает. Попросите новую.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Вступить в ферму" })).toBeNull();
  expect(screen.getByRole("link", { name: "На главную" })).toBeTruthy();
});

test("another person logs out on the invite page, and logs in on the same link", async () => {
  const user = userEvent.setup();
  addInvite("abc", aFarm("Чуйская"));
  signIn({ username: "aibek" });
  const { router } = renderApp("/invite/abc");

  await screen.findByText("Приглашение в ферму «Чуйская»");
  await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Выйти" }));

  expect(await screen.findByText(signInFormText)).toBeTruthy();
  expect(router.state.location.pathname).toBe("/invite/abc");
});
