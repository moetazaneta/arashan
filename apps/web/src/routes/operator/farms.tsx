import type { ErrorCode, FarmSummary } from "@arashan/core";
import {
  defaultLambAgeMonths,
  useCreateFarm,
  useInviteFarmAdmin,
  useOperatorFarms,
} from "@arashan/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { FenceIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import {
  FarmSettingsFields,
  settingsErrorCodes,
  settingsOf,
  type SettingsDraft,
} from "@/components/farm-settings-fields";
import { InviteLinkCard, type ShownInvite } from "@/components/invite-link-card";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formError, useError, useErrorMessage } from "@/errors";
import { browserTimeZone } from "@/format";
import { useViewer } from "@/viewer";

export const Route = createFileRoute("/operator/farms")({
  component: OperatorFarmsPage,
});

/** The Operator's screen «Фермы»: make a Farm, and give its first Admin an invite link. */
function OperatorFarmsPage() {
  if (!useViewer().user.isOperator) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>Этот раздел только для оператора</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>Новые фермы создаёт оператор приложения.</Trans>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <OperatorFarms />;
}

function OperatorFarms() {
  const [shownInvite, setShownInvite] = useState<ShownInvite | null>(null);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          <Trans>Фермы</Trans>
        </h1>
        <p className="text-muted-foreground">
          <Trans>Создайте ферму и отправьте ссылку её первому администратору.</Trans>
        </p>
      </div>
      <NewFarmCard onCreated={setShownInvite} />
      {shownInvite !== null && <InviteLinkCard key={shownInvite.token} invite={shownInvite} />}
      <FarmsCard onInvited={setShownInvite} />
    </div>
  );
}

// The errors that the fields of the form of a new Farm show.
const newFarmFieldCodes: readonly ErrorCode[] = ["farm.nameRequired", ...settingsErrorCodes];

// The farms of the app are in Kyrgyzstan, so a new Farm counts its money in soms by default.
const defaultCurrency = "KGS";

function NewFarmCard({ onCreated }: { onCreated: (invite: ShownInvite) => void }) {
  const createFarm = useCreateFarm();
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<SettingsDraft>(() => ({
    currency: defaultCurrency,
    timeZone: browserTimeZone(),
    lambAgeMonths: String(defaultLambAgeMonths),
  }));
  const error = useError(createFarm.error);
  const nameError = error?.code === "farm.nameRequired" ? error.message : null;
  const ownError = formError(error, newFarmFieldCodes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Новая ферма</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>Администратор фермы сможет потом изменить эти настройки.</Trans>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const farmName = name.trim();
            createFarm.mutate(
              { name: farmName, ...settingsOf(draft) },
              {
                onSuccess: ({ invite }) => {
                  onCreated({ farmName, role: "admin", ...invite });
                  setName("");
                },
              },
            );
          }}
        >
          <FieldGroup>
            <Field data-invalid={nameError !== null}>
              <FieldLabel htmlFor="new-farm-name">
                <Trans>Название</Trans>
              </FieldLabel>
              <Input
                id="new-farm-name"
                value={name}
                autoComplete="off"
                aria-invalid={nameError !== null}
                onChange={(event) => {
                  setName(event.target.value);
                  createFarm.reset();
                }}
              />
              <FieldError>{nameError}</FieldError>
            </Field>
            <FarmSettingsFields
              id="new-farm"
              draft={draft}
              error={error}
              onChange={(next) => {
                setDraft(next);
                createFarm.reset();
              }}
            />
            {ownError !== null && (
              <Alert variant="destructive">
                <AlertDescription>{ownError.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="self-start" disabled={createFarm.isPending}>
              {createFarm.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              <Trans>Создать ферму</Trans>
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

/** All Farms of the app: the Operator sees only their names and whether the first Admin joined. */
function FarmsCard({ onInvited }: { onInvited: (invite: ShownInvite) => void }) {
  const farms = useOperatorFarms();
  const inviteAdmin = useInviteFarmAdmin();
  const listError = useErrorMessage(farms.error);
  const inviteError = useErrorMessage(inviteAdmin.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Все фермы</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {inviteError !== null && (
          <Alert variant="destructive">
            <AlertDescription>{inviteError}</AlertDescription>
          </Alert>
        )}
        {listError !== null ? (
          <Alert variant="destructive">
            <AlertDescription>{listError}</AlertDescription>
          </Alert>
        ) : farms.data === undefined ? (
          <Loading />
        ) : farms.data.length === 0 ? (
          <Empty className="p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FenceIcon />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Ферм пока нет</Trans>
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Название</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Создана</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Администратор</Trans>
                </TableHead>
                <TableHead>
                  <span className="sr-only">
                    <Trans>Действия</Trans>
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {farms.data.map((farm) => (
                <FarmRow
                  key={farm.id}
                  farm={farm}
                  inviting={inviteAdmin.isPending && inviteAdmin.variables === farm.id}
                  onInvite={() =>
                    inviteAdmin.mutate(farm.id, {
                      onSuccess: (invite) =>
                        onInvited({ farmName: farm.name, role: "admin", ...invite }),
                    })
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function FarmRow({
  farm,
  inviting,
  onInvite,
}: {
  farm: FarmSummary;
  inviting: boolean;
  onInvite: () => void;
}) {
  const { i18n, t } = useLingui();
  const farmName = farm.name;

  return (
    <TableRow>
      <TableCell className="font-medium">{farm.name}</TableCell>
      <TableCell>{i18n.date(new Date(farm.createdAt), { dateStyle: "medium" })}</TableCell>
      <TableCell>
        {farm.hasMembers ? (
          <Badge variant="secondary">
            <Trans>Администратор есть</Trans>
          </Badge>
        ) : (
          <Badge variant="outline">
            <Trans>Ждёт администратора</Trans>
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {!farm.hasMembers && (
          <Button
            variant="outline"
            size="sm"
            disabled={inviting}
            aria-label={t`Новая ссылка для фермы «${farmName}»`}
            onClick={onInvite}
          >
            {inviting && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans>Новая ссылка</Trans>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
