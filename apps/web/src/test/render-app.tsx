import { I18nProvider } from "@lingui/react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";

import { createI18n, type Locale } from "@/i18n";
import { createAppRouter } from "@/router";

/**
 * Renders the whole app at `path`, with a memory history in place of the browser's. The tests mock
 * the hooks of `@arashan/client`: the app has no backend here.
 */
export function renderApp(path = "/", locale: Locale = "ru") {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  return {
    router,
    ...render(
      <I18nProvider i18n={createI18n(locale)}>
        <RouterProvider router={router} />
      </I18nProvider>,
    ),
  };
}
