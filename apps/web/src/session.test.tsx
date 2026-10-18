import { DomainError } from "@arashan/core";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { signIn, signInFormText, updateFake } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

test("a visitor who is not logged in sees the sign-in form", async () => {
  renderApp("/");

  expect(await screen.findByText(signInFormText)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Arashan" })).toBeTruthy();
});

test("an invite link shows the sign-in form first, and stays on the link", async () => {
  const { router } = renderApp("/invite/abc");

  expect(await screen.findByText(signInFormText)).toBeTruthy();
  expect(router.state.location.pathname).toBe("/invite/abc");
});

test("a refused log-in shows why, and lets the person log out", async () => {
  const user = userEvent.setup();
  updateFake((backend) => {
    backend.session = { status: "failed", error: new DomainError("user.usernameMissing") };
  });
  renderApp("/");

  expect((await screen.findByRole("alert")).textContent).toContain(
    "У вашей учётной записи нет имени пользователя.",
  );
  await user.click(screen.getByRole("button", { name: "Выйти" }));
  expect(await screen.findByText(signInFormText)).toBeTruthy();
});

test("the message of a domain error follows the language of the UI", async () => {
  const user = userEvent.setup();
  updateFake((backend) => {
    backend.session = { status: "failed", error: new DomainError("user.usernameMissing") };
  });
  renderApp("/");
  await screen.findByRole("alert");

  await user.click(screen.getByRole("button", { name: "English" }));

  expect(screen.getByRole("alert").textContent).toContain("Your account has no username.");
  expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
});

test("a User logs out from the header", async () => {
  const user = userEvent.setup();
  signIn({ username: "aibek" });
  renderApp("/");

  expect(await screen.findByText("aibek")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Выйти" }));

  expect(await screen.findByText(signInFormText)).toBeTruthy();
});
