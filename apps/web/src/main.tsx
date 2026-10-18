import { ClientProvider, createClient } from "@arashan/client";
import { I18nProvider, useLingui } from "@lingui/react";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createI18n, isLocale, savedLocale } from "@/i18n";
import { createAppRouter } from "@/router";

import "@/styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is not set: see README.md.");
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is not set: see docs/environment.md.");
}

const client = createClient({ convexUrl, clerkPublishableKey });
const i18n = createI18n(savedLocale());
const router = createAppRouter();

/** The client and the router, with the Clerk forms in the language of the UI. */
function App() {
  const { i18n } = useLingui();

  return (
    <ClientProvider
      client={client}
      locale={isLocale(i18n.locale) ? i18n.locale : "ru"}
      navigate={(href, { replace }) => void router.navigate({ href, replace })}
    >
      <RouterProvider router={router} />
    </ClientProvider>
  );
}

const container = document.getElementById("root");
if (container === null) throw new Error("root-missing");

createRoot(container).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>,
);
