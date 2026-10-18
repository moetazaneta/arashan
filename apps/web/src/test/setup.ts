import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vite-plus/test";

import { resetFake } from "./fake-client";

// jsdom lays nothing out and has no `scrollTo`, which the router's scroll restoration calls on each
// navigation.
if (typeof window !== "undefined") window.scrollTo = () => {};

// The app has no backend in the tests.
vi.mock("@arashan/client", () => import("./fake-client"));

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetFake();
});
