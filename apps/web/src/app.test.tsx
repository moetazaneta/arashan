import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vite-plus/test";

import { fakeAppVersion } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("the home page shows the version of the app from the backend", async () => {
  renderApp("/");

  expect(await screen.findByText(`Версия ${fakeAppVersion}`)).toBeTruthy();
});

test("a domain error from a command shows its message in the language of the UI", async () => {
  const user = userEvent.setup();
  renderApp("/");

  await user.type(await screen.findByLabelText("Название"), "Первый");
  await user.click(screen.getByRole("button", { name: "Добавить" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Образец с таким названием уже есть.",
  );

  await user.click(screen.getByRole("button", { name: "English" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "A sample with this name already exists.",
  );
});
