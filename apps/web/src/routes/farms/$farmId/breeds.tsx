import {
  maxBreedNameLength,
  useAddBreed,
  useBreeds,
  useDeleteBreed,
  useFarm,
  useRenameBreed,
  useSetBreedArchived,
} from "@arashan/client";
import type { BreedId, BreedRow, FarmId } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";

import { useBreedLabel } from "@/components/sheep/composition";
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useError, useErrorMessage } from "@/errors";

export const Route = createFileRoute("/farms/$farmId/breeds")({
  component: BreedsPage,
});

/**
 * The Breeds of the Farm: Arashan, which each Farm has, and the Breeds that the Members add. A Breed
 * that a Sheep has can only go to the archive; one added by mistake can be deleted.
 */
function BreedsPage() {
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  if (farm === undefined) return null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Trans>Породы</Trans>
      </h1>
      <AddBreedForm farmId={farmId} />
      <BreedList farmId={farmId} />
    </div>
  );
}

/** The row that adds a Breed: the name and Enter. It stays ready for the next one. */
function AddBreedForm({ farmId }: { farmId: FarmId }) {
  const { t } = useLingui();
  const add = useAddBreed(farmId);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const error = useError(add.error);
  const id = useId();

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (add.isPending) return;
        add.mutate(
          { name },
          {
            onSuccess: () => {
              setName("");
              inputRef.current?.focus();
            },
          },
        );
      }}
    >
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor={`${id}-name`} className="sr-only">
          <Trans>Новая порода</Trans>
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={`${id}-name`}
            value={name}
            placeholder={t`Новая порода`}
            maxLength={maxBreedNameLength}
            autoComplete="off"
            className="max-w-72"
            aria-invalid={error !== null}
            onChange={(event) => {
              setName(event.target.value);
              add.reset();
            }}
          />
          <Button type="submit" disabled={add.isPending}>
            {add.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans>Добавить</Trans>
          </Button>
        </div>
        <FieldError>{error?.message}</FieldError>
      </Field>
    </form>
  );
}

/** The Breeds, Arashan first, then by name, also the Archived ones. */
function BreedList({ farmId }: { farmId: FarmId }) {
  const { t } = useLingui();
  const breeds = useBreeds(farmId);
  const setArchived = useSetBreedArchived(farmId);
  const listError = useErrorMessage(breeds.error);
  const archiveError = useErrorMessage(setArchived.error);

  if (listError !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{listError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {archiveError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{archiveError}</AlertDescription>
        </Alert>
      )}
      <table aria-label={t`Породы`} className="w-full text-[13px] tabular-nums">
        <TableBody className="border-t">
          {breeds.data === undefined
            ? skeletonRows.map((key) => (
                <TableRow key={key} className="h-9 hover:bg-transparent">
                  <TableCell className="px-2 py-0">
                    <Skeleton className="h-3.5 w-32" />
                  </TableCell>
                  <TableCell className="w-10 px-2 py-0" />
                </TableRow>
              ))
            : breeds.data.map((breed) => (
                <BreedListRow
                  key={breed.id}
                  farmId={farmId}
                  breed={breed}
                  archiving={setArchived.isPending && setArchived.variables.breedId === breed.id}
                  onSetArchived={(archived) => setArchived.mutate({ breedId: breed.id, archived })}
                  // The error of an archive is old news when the Member starts another action.
                  onAction={() => setArchived.reset()}
                />
              ))}
        </TableBody>
      </table>
    </div>
  );
}

const skeletonRows = ["1", "2", "3"];

/** One Breed, with its menu. Arashan is built in: it has no menu. */
function BreedListRow({
  farmId,
  breed,
  archiving,
  onSetArchived,
  onAction,
}: {
  farmId: FarmId;
  breed: BreedRow;
  archiving: boolean;
  onSetArchived: (archived: boolean) => void;
  onAction: () => void;
}) {
  const { t } = useLingui();
  const label = useBreedLabel();
  const name = label(breed);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const inUseId = useId();
  const builtIn = breed.name === null;

  return (
    <TableRow className="h-9 hover:bg-transparent">
      <TableCell className="px-2 py-0">
        <span className="flex items-center gap-2">
          <span className={breed.archived ? "text-muted-foreground" : "font-medium"}>{name}</span>
          {builtIn && (
            <Badge variant="secondary">
              <Trans>основная</Trans>
            </Badge>
          )}
          {breed.archived && (
            <Badge variant="secondary">
              <Trans>В архиве</Trans>
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="w-10 px-2 py-0 text-right">
        {!builtIn && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t`Действия с породой ${name}`}
                    disabled={archiving}
                    onClick={onAction}
                  />
                }
              >
                {archiving ? <Spinner aria-hidden /> : <MoreHorizontalIcon />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setDialog("rename")}>
                    <Trans>Переименовать</Trans>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSetArchived(!breed.archived)}>
                    {breed.archived ? <Trans>Вернуть из архива</Trans> : <Trans>В архив</Trans>}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={breed.inUse}
                    aria-describedby={breed.inUse ? inUseId : undefined}
                    onClick={() => setDialog("delete")}
                  >
                    <Trans context="breed">Удалить</Trans>
                  </DropdownMenuItem>
                  {breed.inUse && (
                    <p
                      id={inUseId}
                      className="px-1.5 pb-1 text-left text-xs text-pretty text-muted-foreground"
                    >
                      <Trans>Породу используют бараны: её можно только отправить в архив.</Trans>
                    </p>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <RenameBreedDialog
              farmId={farmId}
              breed={breed}
              open={dialog === "rename"}
              onOpenChange={(open) => setDialog(open ? "rename" : null)}
            />
            <DeleteBreedDialog
              farmId={farmId}
              breedId={breed.id}
              name={name}
              open={dialog === "delete"}
              onOpenChange={(open) => setDialog(open ? "delete" : null)}
            />
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

/** A Member gives a Breed a new name. Enter saves. */
function RenameBreedDialog({
  farmId,
  breed,
  open,
  onOpenChange,
}: {
  farmId: FarmId;
  breed: BreedRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={inputRef}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Переименовать породу</Trans>
          </DialogTitle>
        </DialogHeader>
        {/* A new form for each opening: it starts with the name of now and no error. */}
        {open && (
          <RenameBreedForm
            farmId={farmId}
            breed={breed}
            inputRef={inputRef}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameBreedForm({
  farmId,
  breed,
  inputRef,
  onDone,
}: {
  farmId: FarmId;
  breed: BreedRow;
  inputRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const rename = useRenameBreed(farmId);
  const [name, setName] = useState(breed.name ?? "");
  const error = useError(rename.error);
  const id = useId();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rename.isPending) return;
        rename.mutate({ breedId: breed.id, name }, { onSuccess: onDone });
      }}
    >
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor={`${id}-name`}>
          <Trans>Название породы</Trans>
        </FieldLabel>
        <Input
          ref={inputRef}
          id={`${id}-name`}
          value={name}
          maxLength={maxBreedNameLength}
          autoComplete="off"
          aria-invalid={error !== null}
          onChange={(event) => {
            setName(event.target.value);
            rename.reset();
          }}
        />
        <FieldError>{error?.message}</FieldError>
      </Field>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          <Trans>Отмена</Trans>
        </DialogClose>
        <Button type="submit" disabled={rename.isPending}>
          {rename.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Сохранить</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A Member deletes a Breed added by mistake, after a confirmation. It becomes Deleted: the app hides
 * it but keeps it (ADR 0005).
 */
function DeleteBreedDialog({
  farmId,
  breedId,
  name,
  open,
  onOpenChange,
}: {
  farmId: FarmId;
  breedId: BreedId;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteBreed(farmId);
  const error = useErrorMessage(remove.error);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Удалить породу {name}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Порода пропадёт из списка и из форм.</Trans>
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
            onClick={() => remove.mutate(breedId, { onSuccess: () => onOpenChange(false) })}
          >
            {remove.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans context="breed">Удалить</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
