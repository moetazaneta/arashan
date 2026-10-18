import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/** A new invite link: the backend gives its token only once. */
export interface ShownInvite {
  farmName: string;
  token: string;
  expiresAt: number;
}

/**
 * The invite link for the first Admin of a Farm, to copy and send. The app does not keep the token,
 * so the link is on the screen only now.
 */
export function InviteLinkCard({ invite }: { invite: ShownInvite }) {
  const { i18n, t } = useLingui();
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const url = `${window.location.origin}/invite/${invite.token}`;
  const { farmName } = invite;
  const expiresAt = i18n.date(new Date(invite.expiresAt), {
    dateStyle: "long",
    timeStyle: "short",
  });

  // Show the new link: focus it, so that it is in view and selected for a copy.
  useEffect(() => {
    input.current?.focus();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No access to the clipboard: the link is selected in the field, to copy by hand.
      input.current?.select();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Ссылка для администратора фермы «{farmName}»</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>
            Отправьте её человеку, который будет управлять фермой. Он войдёт по ссылке и станет
            администратором.
          </Trans>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InputGroup>
          <InputGroupInput
            ref={input}
            readOnly
            value={url}
            aria-label={t`Ссылка-приглашение`}
            onFocus={(event) => event.currentTarget.select()}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={() => void copy()}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? <Trans>Скопировано</Trans> : <Trans>Копировать</Trans>}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Ссылка работает один раз, до {expiresAt}. Она показана только сейчас: скопируйте её
            перед уходом со страницы.
          </Trans>
        </p>
      </CardContent>
    </Card>
  );
}
