import type { Role } from "@arashan/core";
import { useAcceptInvite, useInvite, useSignOut } from "@arashan/client";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { TicketIcon } from "lucide-react";
import { useState } from "react";

import { HomeLink } from "@/components/home-link";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/errors";
import { useViewer } from "@/viewer";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

const roleNames: Record<Role, MessageDescriptor> = {
  admin: msg`администратор`,
  editor: msg`редактор`,
};

/** A User who opened an invite link joins the Farm of the link. */
function InvitePage() {
  const { token } = Route.useParams();
  const invite = useInvite(token);
  const accept = useAcceptInvite();
  const errorMessage = useErrorMessage(invite.error);

  // The link works once: right after the User joins, the live preview fails with `invite.used`.
  // Keep the last preview on the screen while the User joins, and do not show that error.
  const [preview, setPreview] = useState(invite.data);
  if (invite.data !== undefined && invite.data !== preview) setPreview(invite.data);
  const joining = accept.isPending || accept.isSuccess;

  if (accept.isSuccess) {
    return <Navigate to="/farms/$farmId" params={{ farmId: accept.data.farmId }} replace />;
  }
  if (!joining && errorMessage !== null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TicketIcon />
          </EmptyMedia>
          <EmptyTitle>{errorMessage}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <HomeLink />
        </EmptyContent>
      </Empty>
    );
  }
  if (preview === undefined) return <Loading />;

  return (
    <div className="flex flex-1 items-center justify-center">
      <InviteCard
        token={token}
        preview={preview}
        joining={joining}
        error={accept.error}
        onJoin={() => accept.mutate(token)}
      />
    </div>
  );
}

function InviteCard({
  token,
  preview,
  joining,
  error,
  onJoin,
}: {
  token: string;
  preview: { farmName: string; role: Role; expiresAt: number };
  joining: boolean;
  error: unknown;
  onJoin: () => void;
}) {
  const { i18n } = useLingui();
  const viewer = useViewer();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage(error);
  const { farmName } = preview;
  const role = i18n._(roleNames[preview.role]);
  const username = viewer.user.username;
  const expiresAt = i18n.date(new Date(preview.expiresAt), {
    dateStyle: "long",
    timeStyle: "short",
  });

  // Another person uses the link: log out, and stay on the link to log in.
  const switchAccount = async () => {
    await signOut();
    await navigate({ to: "/invite/$token", params: { token }, replace: true });
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          <Trans>Приглашение в ферму «{farmName}»</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>
            Вы станете участником фермы. Ваша роль: {role}. Ссылка работает до {expiresAt}.
          </Trans>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          <Trans>
            Вы вошли как <span className="font-medium">{username}</span>.
          </Trans>{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            disabled={joining}
            onClick={() => void switchAccount()}
          >
            <Trans>Выйти</Trans>
          </Button>
        </p>
        {errorMessage !== null && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button disabled={joining} onClick={onJoin}>
          {joining && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Вступить в ферму</Trans>
        </Button>
      </CardFooter>
    </Card>
  );
}
