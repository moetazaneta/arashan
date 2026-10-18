import { useAddSample, useDeleteSample, useSamples } from "@arashan/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/errors";

// The view of the throwaway sample module of the core. Delete it with that module.

/** Adds and deletes Samples: a command that can fail with a domain error, end to end. */
export function SamplesCard() {
  const { t } = useLingui();
  const samples = useSamples();
  const addSample = useAddSample();
  const deleteSample = useDeleteSample();
  const [newName, setNewName] = useState("");
  const addError = useErrorMessage(addSample.error);
  const listError = useErrorMessage(deleteSample.error ?? samples.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Образцы</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>Пример команды, которая проходит через все слои приложения.</Trans>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addSample.mutate({ name: newName }, { onSuccess: () => setNewName("") });
          }}
        >
          <FieldGroup>
            <Field data-invalid={addError !== null}>
              <FieldLabel htmlFor="sample-name">
                <Trans>Название</Trans>
              </FieldLabel>
              <Input
                id="sample-name"
                value={newName}
                aria-invalid={addError !== null}
                onChange={(event) => setNewName(event.target.value)}
              />
              <FieldError>{addError}</FieldError>
            </Field>
            <Button type="submit" disabled={addSample.isPending} className="self-start">
              <Trans>Добавить</Trans>
            </Button>
          </FieldGroup>
        </form>
        {listError !== null && (
          <Alert variant="destructive">
            <AlertDescription>{listError}</AlertDescription>
          </Alert>
        )}
        <ul className="flex flex-col gap-2">
          {samples.data?.map(({ id, name }) => (
            <li key={id} className="flex items-center justify-between gap-4">
              <span className="truncate">{name}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t`Удалить «${name}»`}
                onClick={() => deleteSample.mutate(id)}
              >
                <Trans>Удалить</Trans>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
