import {
  useArchiveMoneyCategory,
  useCreateMoneyCategory,
  useDeleteMoneyCategory,
  useMoneyCategories,
  useRenameMoneyCategory,
  useUnarchiveMoneyCategory,
} from "@arashan/client";
import type { ErrorCode, Farm, MoneyCategoryRow, MoneyKind } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { EllipsisIcon } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";

import {
  ArchivedBadge,
  DataCell,
  ErrorAlert,
  fieldMessage,
  FormAlert,
  HeadCell,
  SkeletonRows,
  tableClass,
} from "@/components/flocks/shared";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { useCodeError, useError, useErrorMessage } from "@/errors";

import { categoryName, isNameOfKey } from "./category-names";

const nameCodes: readonly ErrorCode[] = [
  "moneyCategory.nameRequired",
  "moneyCategory.nameTooLong",
  "moneyCategory.nameTaken",
];

/**
 * The tab «Категории»: the categories of the kind, in the order of the list, and the form that adds
 * one. A Member renames, archives or deletes any category but a System one.
 */
export function CategoriesTab({ farm, kind }: { farm: Farm; kind: MoneyKind }) {
  const { i18n, t } = useLingui();
  const categories = useMoneyCategories(farm.id, kind);
  const error = useErrorMessage(categories.error);
  const archive = useArchiveMoneyCategory(farm.id);
  const unarchive = useUnarchiveMoneyCategory(farm.id);
  const actionError = useErrorMessage(archive.error ?? unarchive.error);
  // The category of a dialog stays as it was when the dialog opened, also while it closes.
  const [renaming, setRenaming] = useState<MoneyCategoryRow | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleting, setDeleting] = useState<MoneyCategoryRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (error !== null) return <ErrorAlert message={error} />;
  const rows = categories.data;

  return (
    <div className="flex flex-col gap-3">
      <AddCategoryForm farm={farm} kind={kind} categories={categories.data ?? []} />
      <ErrorAlert message={actionError} />
      <Table aria-label={t`Категории`} className={tableClass}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <HeadCell>
              <Trans>Название</Trans>
            </HeadCell>
            <HeadCell>
              <span className="sr-only">
                <Trans>Действия</Trans>
              </span>
            </HeadCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows === undefined ? (
            <SkeletonRows columns={2} />
          ) : (
            rows.map((category) => (
              <TableRow key={category.id} className="h-9">
                <DataCell>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{categoryName(category, i18n)}</span>
                    {category.system && (
                      <Badge variant="secondary">
                        <Trans>Системная</Trans>
                      </Badge>
                    )}
                    {category.archived && <ArchivedBadge />}
                  </span>
                </DataCell>
                <DataCell className="w-10 text-right">
                  {/* The app owns a System category: it has no actions. */}
                  {!category.system && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" aria-label={t`Действия`} />}
                      >
                        <EllipsisIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onClick={() => {
                              setRenaming(category);
                              setRenameOpen(true);
                            }}
                          >
                            <Trans>Переименовать</Trans>
                          </DropdownMenuItem>
                          {category.archived ? (
                            <DropdownMenuItem
                              onClick={() => {
                                archive.reset();
                                unarchive.mutate(category.id);
                              }}
                            >
                              <Trans>Вернуть из архива</Trans>
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => {
                                unarchive.reset();
                                archive.mutate(category.id);
                              }}
                            >
                              <Trans>В архив</Trans>
                            </DropdownMenuItem>
                          )}
                          {/* A category in use can only go to the archive. */}
                          {!category.inUse && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setDeleting(category);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trans context="money category">Удалить</Trans>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </DataCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        <Trans>Категорию, в которой есть записи, можно только отправить в архив.</Trans>
      </p>
      {renaming !== null && (
        <RenameCategoryDialog
          farm={farm}
          category={renaming}
          categories={categories.data ?? []}
          open={renameOpen}
          onOpenChange={setRenameOpen}
        />
      )}
      {deleting !== null && (
        <DeleteCategoryDialog
          farm={farm}
          category={deleting}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </div>
  );
}

/** A name and a button: the Member adds a category to the list. */
function AddCategoryForm({
  farm,
  kind,
  categories,
}: {
  farm: Farm;
  kind: MoneyKind;
  categories: readonly MoneyCategoryRow[];
}) {
  const { i18n, t } = useLingui();
  const create = useCreateMoneyCategory(farm.id);
  const [name, setName] = useState("");
  const [taken, setTaken] = useState(false);
  const takenError = useCodeError(taken ? "moneyCategory.nameTaken" : null);
  const createError = useErrorMessage(create.error);
  const error = takenError?.message ?? createError;
  const id = useId();

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (create.isPending) return;
        if (isNameOfKey(name, categories, null, i18n)) {
          setTaken(true);
          return;
        }
        create.mutate({ kind, name }, { onSuccess: () => setName("") });
      }}
    >
      <Field data-invalid={error !== null} className="max-w-md">
        <FieldLabel htmlFor={`${id}-name`} className="sr-only">
          <Trans>Новая категория</Trans>
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`${id}-name`}
            value={name}
            autoComplete="off"
            placeholder={t`Новая категория`}
            aria-invalid={error !== null}
            onChange={(event) => {
              setName(event.target.value);
              setTaken(false);
              create.reset();
            }}
          />
          <Button type="submit" variant="outline" disabled={create.isPending}>
            {create.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans>Добавить категорию</Trans>
          </Button>
        </div>
        <FieldError>{error}</FieldError>
      </Field>
    </form>
  );
}

/** The dialog that gives a category another name. Its key stays, so its rules stay. */
function RenameCategoryDialog({
  farm,
  category,
  categories,
  open,
  onOpenChange,
}: {
  farm: Farm;
  category: MoneyCategoryRow;
  categories: readonly MoneyCategoryRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Переименовать категорию</Trans>
          </DialogTitle>
        </DialogHeader>
        <RenameCategoryForm
          farm={farm}
          category={category}
          categories={categories}
          nameRef={nameRef}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameCategoryForm({
  farm,
  category,
  categories,
  nameRef,
  onDone,
}: {
  farm: Farm;
  category: MoneyCategoryRow;
  categories: readonly MoneyCategoryRow[];
  nameRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const { i18n } = useLingui();
  const rename = useRenameMoneyCategory(farm.id);
  const shownName = categoryName(category, i18n);
  const [name, setName] = useState(shownName);
  const [taken, setTaken] = useState(false);
  const takenError = useCodeError(taken ? "moneyCategory.nameTaken" : null);
  const renameError = useError(rename.error);
  const error = takenError ?? renameError;
  const id = useId();
  const nameError = fieldMessage(error, nameCodes);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rename.isPending) return;
        // A category of the app keeps the name of its key, in the language of each Member, until a
        // Member really changes it.
        if (name === shownName) {
          onDone();
          return;
        }
        if (isNameOfKey(name, categories, category.id, i18n)) {
          setTaken(true);
          return;
        }
        rename.mutate({ categoryId: category.id, name }, { onSuccess: onDone });
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={nameError !== null}>
          <FieldLabel htmlFor={`${id}-name`}>
            <Trans>Название</Trans>
          </FieldLabel>
          <Input
            ref={nameRef}
            id={`${id}-name`}
            value={name}
            autoComplete="off"
            aria-invalid={nameError !== null}
            onChange={(event) => {
              setName(event.target.value);
              setTaken(false);
              rename.reset();
            }}
          />
          <FieldError>{nameError}</FieldError>
        </Field>
        <FormAlert error={error} fieldCodes={nameCodes} />
      </FieldGroup>
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

/** A Member deletes a category that no record uses, after a confirmation. It becomes Deleted. */
function DeleteCategoryDialog({
  farm,
  category,
  open,
  onOpenChange,
}: {
  farm: Farm;
  category: MoneyCategoryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n } = useLingui();
  const remove = useDeleteMoneyCategory(farm.id);
  const error = useErrorMessage(remove.error);
  const name = categoryName(category, i18n);

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
            <Trans>Удалить категорию «{name}»?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Она пропадёт из списка и из форм.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Отмена</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(category.id, { onSuccess: () => onOpenChange(false) })}
          >
            {remove.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            <Trans context="money category">Удалить</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
