import type { FarmId, MemberSummary, Role } from "@arashan/core";
import {
  maxPasswordLength,
  minPasswordLength,
  useChangeMemberRole,
  useFarm,
  useInviteMember,
  useMembers,
  useRemoveMember,
  useSetMemberPassword,
} from "@arashan/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { InviteLinkCard, type ShownInvite } from "@/components/invite-link-card";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useError, useErrorMessage } from "@/errors";
import { useRole, useViewer } from "@/viewer";

export const Route = createFileRoute("/farms/$farmId/members")({
  component: MembersPage,
});

/** An Admin manages the Members of the Farm: invites Editors, changes Roles, removes Members. */
function MembersPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const role = useRole(farmId);
  const [shownInvite, setShownInvite] = useState<ShownInvite | null>(null);
  if (farm === undefined) return null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          <Trans>Участники</Trans>
        </h1>
        <p className="text-muted-foreground">{farm.name}</p>
      </div>
      {role === "admin" ? (
        <>
          <InviteCard farmId={farmId} farmName={farm.name} onInvited={setShownInvite} />
          {shownInvite !== null && <InviteLinkCard key={shownInvite.token} invite={shownInvite} />}
          <MembersCards farmId={farmId} />
        </>
      ) : (
        <Alert>
          <AlertDescription>
            <Trans>Участниками фермы управляет только её администратор.</Trans>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function InviteCard({
  farmId,
  farmName,
  onInvited,
}: {
  farmId: FarmId;
  farmName: string;
  onInvited: (invite: ShownInvite) => void;
}) {
  const invite = useInviteMember(farmId);
  const error = useErrorMessage(invite.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Пригласить редактора</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>
            Редактор ведёт все записи фермы, но не управляет участниками и настройками. Ссылка
            работает один раз, 7 дней.
          </Trans>
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={invite.isPending}
            onClick={() =>
              invite.mutate(undefined, {
                onSuccess: (link) => onInvited({ farmName, role: "editor", ...link }),
              })
            }
          >
            {invite.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans>Новая ссылка</Trans>
          </Button>
        </CardAction>
      </CardHeader>
      {error !== null && (
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      )}
    </Card>
  );
}

/** The Members now, and the removed ones. */
function MembersCards({ farmId }: { farmId: FarmId }) {
  const members = useMembers(farmId);
  const changeRole = useChangeMemberRole(farmId);
  const listError = useErrorMessage(members.error);
  const changeError = useErrorMessage(changeRole.error);

  if (listError !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{listError}</AlertDescription>
      </Alert>
    );
  }
  if (members.data === undefined) return <Loading />;
  const current = members.data.filter((member) => member.archivedAt === null);
  const removed = members.data.filter((member) => member.archivedAt !== null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Участники фермы</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>
              Администратор управляет фермой и её участниками. В ферме всегда есть хотя бы один
              администратор.
            </Trans>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {changeError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{changeError}</AlertDescription>
            </Alert>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Имя пользователя</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Роль</Trans>
                </TableHead>
                <TableHead>
                  <span className="sr-only">
                    <Trans>Действия</Trans>
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  farmId={farmId}
                  member={member}
                  changing={
                    changeRole.isPending &&
                    changeRole.variables.membershipId === member.membershipId
                  }
                  onRoleChange={(role) =>
                    changeRole.mutate({ membershipId: member.membershipId, role })
                  }
                  // The error of a Role change is old news when the Admin starts another action.
                  onAction={() => changeRole.reset()}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {removed.length > 0 && <RemovedMembersCard members={removed} />}
    </>
  );
}

function MemberRow({
  farmId,
  member,
  changing,
  onRoleChange,
  onAction,
}: {
  farmId: FarmId;
  member: MemberSummary;
  changing: boolean;
  onRoleChange: (role: Role) => void;
  onAction: () => void;
}) {
  const { t } = useLingui();
  const isYou = useViewer().user.id === member.userId;
  const { username } = member;
  const roleItems = [
    { value: "admin", label: t`Администратор` },
    { value: "editor", label: t`Редактор` },
  ];

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          {username}
          {isYou && (
            <Badge variant="secondary">
              <Trans>Вы</Trans>
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell>
        <Select
          items={roleItems}
          value={member.role}
          disabled={changing}
          onValueChange={(role) => {
            if (role === "admin" || role === "editor") onRoleChange(role);
          }}
        >
          <SelectTrigger size="sm" aria-label={t`Роль участника ${username}`} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {roleItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          {member.canSetPassword && (
            <PasswordDialog farmId={farmId} member={member} onOpen={onAction} />
          )}
          <RemoveDialog farmId={farmId} member={member} isYou={isYou} onOpen={onAction} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/** An Admin sets a new password for a Member who cannot log in, for example with no email. */
function PasswordDialog({
  farmId,
  member,
  onOpen,
}: {
  farmId: FarmId;
  member: MemberSummary;
  onOpen: () => void;
}) {
  const { t } = useLingui();
  const setPassword = useSetMemberPassword(farmId);
  const [open, setOpen] = useState(false);
  const [password, setPasswordText] = useState("");
  const error = useError(setPassword.error);
  const { username } = member;
  const fieldId = `password-${member.membershipId}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPasswordText("");
          setPassword.reset();
        }
      }}
    >
      <Button
        variant="outline"
        size="sm"
        aria-label={t`Новый пароль для ${username}`}
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
      >
        <Trans>Новый пароль</Trans>
      </Button>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Новый пароль для {username}</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Участник войдёт с этим паролем. Все его открытые сеансы закончатся. Сообщите ему новый
              пароль лично.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        {setPassword.isSuccess ? (
          <>
            <p role="status">
              <Trans>Пароль изменён.</Trans>
            </p>
            <DialogFooter>
              <DialogClose render={<Button />}>
                <Trans>Готово</Trans>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPassword.mutate({ membershipId: member.membershipId, password });
            }}
          >
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor={fieldId}>
                <Trans>Пароль</Trans>
              </FieldLabel>
              {/* The Admin reads the password to tell it to the Member, so it is not hidden. */}
              <Input
                id={fieldId}
                value={password}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error !== null}
                onChange={(event) => {
                  setPasswordText(event.target.value);
                  setPassword.reset();
                }}
              />
              <FieldDescription>
                <Trans>
                  От {minPasswordLength} до {maxPasswordLength} символов.
                </Trans>
              </FieldDescription>
              <FieldError>{error?.message}</FieldError>
            </Field>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                <Trans>Отмена</Trans>
              </DialogClose>
              <Button type="submit" disabled={setPassword.isPending}>
                {setPassword.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                <Trans>Задать пароль</Trans>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** An Admin removes a Member, after a confirmation. */
function RemoveDialog({
  farmId,
  member,
  isYou,
  onOpen,
}: {
  farmId: FarmId;
  member: MemberSummary;
  isYou: boolean;
  onOpen: () => void;
}) {
  const { t } = useLingui();
  const remove = useRemoveMember(farmId);
  const [open, setOpen] = useState(false);
  const error = useErrorMessage(remove.error);
  const { username } = member;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        aria-label={t`Удалить ${username} из фермы`}
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
      >
        <Trans>Удалить</Trans>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isYou ? <Trans>Выйти из фермы?</Trans> : <Trans>Удалить {username} из фермы?</Trans>}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isYou ? (
              <Trans>
                Вы больше не сможете открыть ферму. Вернуть вас может другой администратор.
              </Trans>
            ) : (
              <Trans>
                Участник больше не сможет открыть ферму. Его записи и история останутся.
              </Trans>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Отмена</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(member.membershipId, { onSuccess: () => setOpen(false) })}
          >
            {remove.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans>Удалить</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The removed Members: they stay in the history of the Farm. */
function RemovedMembersCard({ members }: { members: MemberSummary[] }) {
  const { i18n } = useLingui();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Бывшие участники</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>
            Они не могут открыть ферму, но остаются в истории. Чтобы вернуть участника, отправьте
            ему новую ссылку.
          </Trans>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>Имя пользователя</Trans>
              </TableHead>
              <TableHead>
                <Trans>Удалён</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.membershipId}>
                <TableCell className="text-muted-foreground">{member.username}</TableCell>
                <TableCell className="text-muted-foreground">
                  {member.archivedAt !== null &&
                    i18n.date(new Date(member.archivedAt), { dateStyle: "medium" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
