import { SignInForm, useSession, useSignOut } from "@arashan/client";
import { Trans } from "@lingui/react/macro";
import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SearchXIcon, TriangleAlertIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BareLayout } from "@/components/bare-layout";
import { HomeLink } from "@/components/home-link";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useErrorMessage } from "@/errors";
import { ViewerProvider } from "@/viewer";

export const Route = createRootRoute({
  component: SessionGate,
  notFoundComponent: NotFound,
});

/** Each URL needs a User who is logged in: the gate shows the sign-in form until there is one. */
function SessionGate() {
  const session = useSession();

  switch (session.status) {
    case "loading":
    case "registering":
      return <Loading className="min-h-svh" />;
    case "signedOut":
      return <SignInScreen />;
    case "failed":
      return <SessionFailed error={session.error} />;
    case "ready":
      return (
        <ViewerProvider viewer={session.viewer}>
          <AppShell>
            <Outlet />
          </AppShell>
        </ViewerProvider>
      );
  }
}

function SignInScreen() {
  // The form sends the person back to the URL where it was made, for example an invite link. Make a
  // new form when the URL changes, so that it does not send the person to the old one.
  const here = useLocation({ select: (location) => location.pathname + location.searchStr });

  return (
    <BareLayout>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold">Arashan</h1>
        <p className="text-muted-foreground">
          <Trans>Войдите, чтобы открыть записи вашей фермы.</Trans>
        </p>
      </div>
      <SignInForm key={here} />
    </BareLayout>
  );
}

/** The backend refused the person who logged in, for example an account without a username. */
function SessionFailed({ error }: { error: unknown }) {
  const message = useErrorMessage(error);
  const signOut = useSignOut();

  return (
    <BareLayout>
      <div className="flex w-full max-w-md flex-col gap-4">
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>
            <Trans>Не удалось войти</Trans>
          </AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Button variant="outline" className="self-start" onClick={() => void signOut()}>
          <Trans>Выйти</Trans>
        </Button>
      </div>
    </BareLayout>
  );
}

function NotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Такой страницы нет</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Проверьте адрес или вернитесь на главную.</Trans>
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <HomeLink />
      </EmptyContent>
    </Empty>
  );
}
