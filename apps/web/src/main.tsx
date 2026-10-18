import { ClientProvider, createClient } from "@arashan/client";
import { I18nProvider } from "@lingui/react";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createI18n, savedLocale } from "@/i18n";
import { createAppRouter } from "@/router";

import "@/styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is not set: see README.md.");

const client = createClient(convexUrl);
const i18n = createI18n(savedLocale());
const router = createAppRouter();

const container = document.getElementById("root");
if (container === null) throw new Error("root-missing");

createRoot(container).render(
  <StrictMode>
    <ClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nProvider>
    </ClientProvider>
  </StrictMode>,
);
