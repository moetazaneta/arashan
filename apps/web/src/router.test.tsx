import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";

import { renderApp } from "@/test/render-app";

afterEach(cleanup);

test("the home page shows the app's name", async () => {
  renderApp("/");

  expect(await screen.findByRole("heading", { name: "Arashan" })).toBeTruthy();
});
