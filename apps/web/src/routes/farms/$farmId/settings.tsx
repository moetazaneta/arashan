import type { Farm, FarmId } from "@arashan/core";
import { useFarm, useUpdateFarmSettings } from "@arashan/client";
import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  draftOf,
  FarmSettingsFields,
  settingsErrorCodes,
  settingsOf,
} from "@/components/farm-settings-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formError, useError } from "@/errors";
import { useRole } from "@/viewer";

export const Route = createFileRoute("/farms/$farmId/settings")({
  component: SettingsPage,
});

/** An Admin changes the currency, the time zone and the lamb age of the Farm. */
function SettingsPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const role = useRole(farmId);
  if (farm === undefined) return null;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          <Trans>Настройки фермы</Trans>
        </h1>
        <p className="text-muted-foreground">{farm.name}</p>
      </div>
      {role === "admin" ? (
        <SettingsForm farm={farm} />
      ) : (
        <Alert>
          <AlertDescription>
            <Trans>Настройки фермы меняет только её администратор.</Trans>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SettingsForm({ farm }: { farm: Farm }) {
  const update = useUpdateFarmSettings(farm.id);
  const [draft, setDraft] = useState(() => draftOf(farm));
  const error = useError(update.error);
  const ownError = formError(error, settingsErrorCodes);

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(settingsOf(draft));
          }}
        >
          <FieldGroup>
            <FarmSettingsFields
              id="settings"
              draft={draft}
              error={error}
              onChange={(next) => {
                setDraft(next);
                update.reset();
              }}
            />
            {ownError !== null && (
              <Alert variant="destructive">
                <AlertDescription>{ownError.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                <Trans>Сохранить</Trans>
              </Button>
              {update.isSuccess && (
                <p role="status" className="text-sm text-muted-foreground">
                  <Trans>Настройки сохранены.</Trans>
                </p>
              )}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
