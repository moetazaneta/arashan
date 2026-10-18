import { api } from "@arashan/backend/api";
import { enUS, ruRU } from "@clerk/localizations";
import { ClerkProvider, useAuth } from "@clerk/react";
import { shadcn } from "@clerk/ui/themes";
import { ConvexQueryClient, useConvexMutation } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

import type { Registration } from "./session-state";

// The connection to the backend and to Clerk (ADR 0003, ADR 0006). The views never see Convex or
// Clerk: they get the hooks and the sign-in form of this package.

/** The connection to the backend. Make one for the app. */
export interface Client {
  convex: ConvexReactClient;
  queryClient: QueryClient;
  clerkPublishableKey: string;
}

export function createClient(options: { convexUrl: string; clerkPublishableKey: string }): Client {
  const convex = new ConvexReactClient(options.convexUrl);
  const convexQueryClient = new ConvexQueryClient(convex);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        // A Convex query is live: the server pushes each new result, and an error does not go away
        // when the client asks again.
        retry: false,
      },
    },
  });
  convexQueryClient.connect(queryClient);
  return { convex, queryClient, clerkPublishableKey: options.clerkPublishableKey };
}

/** The languages of the Clerk forms. The web app has the same ones. */
export type Locale = "ru" | "en";

const clerkLocalizations = { ru: ruRU, en: enUS };

/**
 * Gives the hooks of this package their client. `locale` is the language of the Clerk forms, and
 * `navigate` moves the app to a URL without a reload, after a log-in.
 */
export function ClientProvider({
  client,
  locale,
  navigate,
  children,
}: {
  client: Client;
  locale: Locale;
  navigate: (href: string, options: { replace: boolean }) => void;
  children: ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={client.clerkPublishableKey}
      localization={clerkLocalizations[locale]}
      // The shadcn theme of Clerk reads the CSS variables of the app. Its styles go in the layer
      // `components`, so that the utility classes of the theme win over them.
      appearance={{ theme: shadcn, cssLayerName: "components" }}
      afterSignOutUrl="/"
      // The sign-in form is on each URL of the app (hash routing). The link "Sign in" of the sign-up
      // step goes back to the start of the form on the same URL, not to the Clerk Account Portal.
      signInUrl="#/"
      signUpUrl="#/"
      routerPush={(href) => navigateFromClerk(href, navigate, false)}
      routerReplace={(href) => navigateFromClerk(href, navigate, true)}
    >
      <ConvexProviderWithClerk client={client.convex} useAuth={useAuth}>
        <QueryClientProvider client={client.queryClient}>
          <RegistrationProvider>{children}</RegistrationProvider>
        </QueryClientProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

/**
 * Moves the app to a URL that Clerk asks for. The sign-in form uses hash routing: it follows the
 * `hashchange` event, which the history API of the router does not fire. So a change of the hash
 * alone goes through `location`, and any other URL through the router, without a reload.
 */
function navigateFromClerk(
  href: string,
  navigate: (href: string, options: { replace: boolean }) => void,
  replace: boolean,
) {
  const url = new URL(href, window.location.href);
  const here = window.location;
  if (url.origin === here.origin && url.pathname === here.pathname && url.search === here.search) {
    if (replace) here.replace(url.href);
    else here.hash = url.hash;
    return;
  }
  navigate(url.pathname + url.search + url.hash, { replace });
}

const RegistrationContext = createContext<Registration>({ status: "idle" });

export function useRegistration(): Registration {
  return useContext(RegistrationContext);
}

/**
 * Calls `users.register` once for each person who logs in: the backend makes the User at the first
 * log-in, and takes the new username at a later one.
 */
function RegistrationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const { userId } = useAuth();
  const register = useConvexMutation(api.users.register);
  const registeredFor = useRef<string | null>(null);
  const [registration, setRegistration] = useState<Registration>({ status: "idle" });

  useEffect(() => {
    if (!isAuthenticated || userId === null || userId === undefined) {
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === userId) return;
    registeredFor.current = userId;
    setRegistration({ status: "pending" });
    register({}).then(
      () => {
        if (registeredFor.current === userId) setRegistration({ status: "done" });
      },
      (error: unknown) => {
        if (registeredFor.current === userId) setRegistration({ status: "failed", error });
      },
    );
  }, [isAuthenticated, userId, register]);

  return <RegistrationContext value={registration}>{children}</RegistrationContext>;
}
