import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";

import { createAppRouter } from "@/router";

/** Renders the whole app at `path`, with a memory history in place of the browser's. */
export function renderApp(path = "/") {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  return { router, ...render(<RouterProvider router={router} />) };
}
