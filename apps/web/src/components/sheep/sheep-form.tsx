import {
  dateAt,
  isPureArashan,
  maxSheepNameLength,
  maxTagLength,
  type SheepCardData,
  useParentOptions,
  useRegisterExternalSheep,
  useRegisterSheep,
  useSheepOwners,
  useUpdateSheep,
  useUploadPassportScan,
} from "@arashan/client";
import type {
  BreedId,
  ErrorCode,
  Farm,
  MembershipId,
  RegisteredOrigin,
  Sex,
  SheepDetails,
  SheepId,
} from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, XIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type ErrorInfo, formError, useError } from "@/errors";

import {
  CompositionFields,
  compositionPreview,
  emptyPedigree,
  GradeFields,
  hasPedigreeData,
  isPedigreeError,
  ParentsFields,
  PassportFields,
  type PedigreeDraft,
  pedigreeDraftOf,
  pedigreeFieldCodes,
  pedigreeOf,
} from "./pedigree-fields";

// The side panel that registers a Sheep, or changes one (DESIGN.md, "Event Entry"). It opens from the
// right, so the table stays in view. The primary button is at the bottom, with its shortcut ⌘↵; Enter
// in a one-line field saves too.

/** The fields of a Sheep as the form holds them, before the core checks them. */
interface SheepDraft extends PedigreeDraft {
  tag: string;
  name: string;
  sex: Sex | null;
  birthDate: string;
  origin: RegisteredOrigin;
  weightKg: string;
  weighingDate: string;
  notes: string;
}

const emptyDraft: SheepDraft = {
  ...emptyPedigree,
  tag: "",
  name: "",
  sex: null,
  birthDate: "",
  origin: "born",
  weightKg: "",
  weighingDate: "",
  notes: "",
};

function draftOf(sheep: SheepCardData, locale: string): SheepDraft {
  return {
    ...pedigreeDraftOf(sheep, locale),
    tag: sheep.tag ?? "",
    name: sheep.name ?? "",
    sex: sheep.sex,
    birthDate: sheep.birthDate ?? "",
    origin: sheep.origin === "bought" ? "bought" : "born",
    weightKg: sheep.weight === null ? "" : String(sheep.weight.kg),
    weighingDate: sheep.weight?.date ?? "",
    notes: sheep.notes ?? "",
  };
}

/**
 * The fields to send. The core trims the texts and checks the values; an empty text is no value. A
 * weight with no date was weighed today. An External Sheep has no weight, no Passport and no Grade.
 */
function detailsOf(draft: SheepDraft, sex: Sex, today: string, external: boolean): SheepDetails {
  const weight = draft.weightKg.trim();
  return {
    tag: draft.tag,
    name: draft.name,
    sex,
    birthDate: draft.birthDate === "" ? null : draft.birthDate,
    notes: draft.notes,
    weight:
      external || weight === ""
        ? null
        : { kg: Number(weight.replace(",", ".")), date: draft.weighingDate || today },
    ...pedigreeOf(draft, today, external),
  };
}

/** The errors that each field shows under it. The form shows the others in an alert. */
const fieldCodes = {
  tag: ["sheep.tagTaken", "sheep.tagTooLong"],
  name: ["sheep.nameTooLong"],
  sex: ["pedigree.parentSexLocked"],
  birthDate: [
    "sheep.birthDateRequired",
    "sheep.birthDateInFuture",
    "sheep.birthDateAfterOwnerChange",
  ],
  owner: ["sheep.ownerNotMember"],
  weight: ["sheep.weightInvalid", "sheep.weighingDateInvalid"],
  notes: ["sheep.notesTooLong"],
} satisfies Record<string, readonly ErrorCode[]>;
const allFieldCodes: readonly ErrorCode[] = [
  ...Object.values(fieldCodes).flat(),
  ...Object.values(pedigreeFieldCodes).flat(),
];

function fieldError(error: ErrorInfo | null, field: keyof typeof fieldCodes): string | null {
  if (error?.code == null) return null;
  return (fieldCodes[field] as readonly ErrorCode[]).includes(error.code) ? error.message : null;
}

/**
 * How a Member registers a Sheep: one that was on the Farm before the app, one born now, or an
 * External Sheep: a parent that was never on the Farm.
 */
type Mode = "initial" | "born" | "external";
const modes: readonly Mode[] = ["initial", "born", "external"];

/** The panel that registers Sheep, one after another: after a save it stays open and clean. */
export function RegisterSheepSheet({
  farm,
  open,
  onOpenChange,
}: {
  farm: Farm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const tagRef = useRef<HTMLInputElement>(null);

  return (
    <SheepSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t`Добавить барана`}
      initialFocus={tagRef}
    >
      <RegisterForm farm={farm} tagRef={tagRef} />
    </SheepSheet>
  );
}

/** The panel that changes the fields of a Sheep. The Owner changes with its own command. */
export function EditSheepSheet({
  farm,
  sheep,
  open,
  onOpenChange,
}: {
  farm: Farm;
  sheep: SheepCardData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const tagRef = useRef<HTMLInputElement>(null);

  return (
    <SheepSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t`Изменить барана`}
      initialFocus={tagRef}
    >
      <EditForm farm={farm} sheep={sheep} tagRef={tagRef} onSaved={() => onOpenChange(false)} />
    </SheepSheet>
  );
}

function SheepSheet({
  open,
  onOpenChange,
  title,
  initialFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialFocus: RefObject<HTMLInputElement | null>;
  children: ReactNode;
}) {
  const { t } = useLingui();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        initialFocus={initialFocus}
        className="gap-0 data-[side=right]:w-[480px] data-[side=right]:sm:max-w-[480px]"
      >
        <SheetHeader className="flex-row items-center justify-between border-b">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label={t`Закрыть`} />}>
            <XIcon />
          </SheetClose>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

const noBreeds: ReadonlySet<BreedId> = new Set();

function RegisterForm({
  farm,
  tagRef,
}: {
  farm: Farm;
  tagRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useLingui();
  const register = useRegisterSheep(farm.id);
  const registerExternal = useRegisterExternalSheep(farm.id);
  const owners = useSheepOwners(farm.id);
  const [mode, setMode] = useState<Mode>("initial");
  const [draft, setDraft] = useState(emptyDraft);
  const [ownerId, setOwnerId] = useState<MembershipId | null>(null);
  const [sexMissing, setSexMissing] = useState(false);
  const [added, setAdded] = useState<{
    sheepId: SheepId;
    label: string | null;
    external: boolean;
  } | null>(null);
  const external = mode === "external";
  const command = external ? registerExternal : register;
  const error = useError(command.error);
  const id = useId();

  const addedLabel = added?.label ?? t`без бирки`;
  const ownerItems = (owners.data ?? []).map((owner) => ({ value: owner.id, label: owner.name }));
  const owner = ownerId ?? owners.data?.find((option) => option.isMe)?.id ?? null;
  const ownerError = fieldError(error, "owner");

  function reset() {
    register.reset();
    registerExternal.reset();
  }

  function save() {
    if (command.isPending) return;
    if (draft.sex === null) {
      setSexMissing(true);
      return;
    }
    const today = dateAt(Date.now(), farm.timeZone);
    const label = draft.tag.trim() || draft.name.trim() || null;
    const details = detailsOf(draft, draft.sex, today, external);
    const onSuccess = (sheepId: SheepId) => {
      setAdded({ sheepId, label, external });
      // The next Sheep keeps the mode, the Origin and the Owner.
      setDraft((current) => ({ ...emptyDraft, origin: current.origin }));
      tagRef.current?.focus();
    };
    if (external) {
      registerExternal.mutate(
        {
          tag: details.tag,
          name: details.name,
          sex: details.sex,
          birthDate: details.birthDate,
          notes: details.notes,
          motherId: details.motherId ?? null,
          fatherId: details.fatherId ?? null,
          manualBreeds: details.manualBreeds ?? [],
        },
        { onSuccess },
      );
      return;
    }
    if (owner === null) return;
    register.mutate(
      {
        ...details,
        ownerId: owner,
        origin: mode === "born" ? "born" : draft.origin,
        initialEntry: mode === "initial",
      },
      { onSuccess },
    );
  }

  return (
    <SheepForm
      id={id}
      farm={farm}
      draft={draft}
      error={error}
      sexMissing={sexMissing}
      tagRef={tagRef}
      pending={command.isPending}
      external={external}
      selfId={null}
      keptBreeds={noBreeds}
      sexLocked={false}
      birthDateRequired={mode === "born"}
      showOrigin={mode === "initial"}
      submitLabel={external ? t`Добавить внешнего барана` : t`Добавить барана`}
      onChange={(next) => {
        setDraft(next);
        if (next.sex !== null) setSexMissing(false);
        reset();
      }}
      onSave={save}
      top={
        <ToggleGroup
          aria-label={t`Как записать барана`}
          variant="outline"
          spacing={0}
          className="w-full"
          value={[mode]}
          onValueChange={(value) => {
            const next = modes.find((option) => option === value[0]);
            if (next !== undefined) {
              setMode(next);
              reset();
            }
          }}
        >
          <ToggleGroupItem value="initial" className="flex-1">
            <Trans>Начальный ввод</Trans>
          </ToggleGroupItem>
          <ToggleGroupItem value="born" className="flex-1">
            <Trans>Рождён на ферме</Trans>
          </ToggleGroupItem>
          <ToggleGroupItem value="external" className="flex-1">
            <Trans>Внешний</Trans>
          </ToggleGroupItem>
        </ToggleGroup>
      }
      intro={
        external && (
          <FieldDescription className="-mt-1">
            <Trans>
              Внешний баран никогда не был на ферме: например, отец с другой фермы. Его записывают
              только как родителя.
            </Trans>
          </FieldDescription>
        )
      }
      ownerField={
        !external && (
          <Field data-invalid={ownerError !== null}>
            <FieldLabel htmlFor={`${id}-owner`}>
              <Trans>Владелец</Trans>
            </FieldLabel>
            <Select
              items={ownerItems}
              value={owner}
              onValueChange={(value) => {
                if (value !== null) setOwnerId(value);
                reset();
              }}
            >
              <SelectTrigger
                id={`${id}-owner`}
                className="w-full"
                aria-invalid={ownerError !== null}
              >
                <SelectValue placeholder={t`Выберите владельца`} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ownerItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError>{ownerError}</FieldError>
          </Field>
        )
      }
      status={
        added !== null && (
          <p role="status" className="text-sm text-muted-foreground">
            {added.external ? (
              <Trans>
                Внешний баран добавлен:{" "}
                <Link
                  to="/farms/$farmId/sheep/$sheepId"
                  params={{ farmId: farm.id, sheepId: added.sheepId }}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {addedLabel}
                </Link>
              </Trans>
            ) : (
              <Trans>
                Баран добавлен:{" "}
                <Link
                  to="/farms/$farmId/sheep/$sheepId"
                  params={{ farmId: farm.id, sheepId: added.sheepId }}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {addedLabel}
                </Link>
              </Trans>
            )}
          </p>
        )
      }
    />
  );
}

function EditForm({
  farm,
  sheep,
  tagRef,
  onSaved,
}: {
  farm: Farm;
  sheep: SheepCardData;
  tagRef: RefObject<HTMLInputElement | null>;
  onSaved: () => void;
}) {
  const { t, i18n } = useLingui();
  const update = useUpdateSheep(farm.id);
  const [draft, setDraft] = useState(() => draftOf(sheep, i18n.locale));
  const error = useError(update.error);
  const id = useId();
  const external = sheep.origin === "external";
  const keptBreeds = useMemo(
    () => new Set(sheep.manualBreeds.map((part) => part.breedId)),
    [sheep.manualBreeds],
  );

  function save() {
    if (update.isPending || draft.sex === null) return;
    const today = dateAt(Date.now(), farm.timeZone);
    update.mutate(
      {
        sheepId: sheep.id,
        ...detailsOf(draft, draft.sex, today, external),
        // Only an Initial entry can change its Origin.
        ...(sheep.initialEntry ? { origin: draft.origin } : {}),
      },
      { onSuccess: onSaved },
    );
  }

  return (
    <SheepForm
      id={id}
      farm={farm}
      draft={draft}
      error={error}
      sexMissing={false}
      tagRef={tagRef}
      pending={update.isPending}
      external={external}
      selfId={sheep.id}
      keptBreeds={keptBreeds}
      sexLocked={sheep.children.length > 0}
      birthDateRequired={sheep.origin === "born" && !sheep.initialEntry}
      showOrigin={sheep.initialEntry}
      submitLabel={t`Сохранить`}
      onChange={(next) => {
        setDraft(next);
        update.reset();
      }}
      onSave={save}
    />
  );
}

/** The fields of a Sheep in one column, and the button that saves them. */
function SheepForm({
  id,
  farm,
  draft,
  error,
  sexMissing,
  tagRef,
  pending,
  external,
  selfId,
  keptBreeds,
  sexLocked,
  birthDateRequired,
  showOrigin,
  submitLabel,
  onChange,
  onSave,
  top,
  intro,
  ownerField,
  status,
}: {
  /** The prefix of the ids of the inputs, unique on the page. */
  id: string;
  farm: Farm;
  draft: SheepDraft;
  error: ErrorInfo | null;
  sexMissing: boolean;
  tagRef: RefObject<HTMLInputElement | null>;
  pending: boolean;
  /** An External Sheep has no weight, no Passport and no Grade. */
  external: boolean;
  /** The Sheep of the form, which cannot be its own parent, or null for a new Sheep. */
  selfId: SheepId | null;
  /** The Breeds that the Sheep has by hand: the form offers them even if they are Archived. */
  keptBreeds: ReadonlySet<BreedId>;
  /** True for a Sheep that is a parent: its sex stays. */
  sexLocked: boolean;
  birthDateRequired: boolean;
  showOrigin: boolean;
  submitLabel: string;
  onChange: (draft: SheepDraft) => void;
  onSave: () => void;
  top?: ReactNode;
  intro?: ReactNode;
  ownerField?: ReactNode;
  status?: ReactNode;
}) {
  const { t } = useLingui();
  const parentOptions = useParentOptions(farm.id).data;
  const upload = useUploadPassportScan(farm.id);
  const tagError = fieldError(error, "tag");
  const nameError = fieldError(error, "name");
  const sexError = fieldError(error, "sex");
  const birthDateError = fieldError(error, "birthDate");
  const weightError = fieldError(error, "weight");
  const notesError = fieldError(error, "notes");
  const ownError = formError(error, allFieldCodes);
  // The block «Дополнительно» opens by itself when it has data or an error.
  const [moreOpen, setMoreOpen] = useState(
    () => draft.weightKg !== "" || draft.notes !== "" || hasPedigreeData(draft),
  );
  const moreError = weightError !== null || notesError !== null || isPedigreeError(error);
  const today = dateAt(Date.now(), farm.timeZone);
  const shortcut = isApple() ? "⌘↵" : "Ctrl+Enter";
  const preview = compositionPreview(draft, parentOptions);
  // A scan that is still uploading would be lost: the form waits for it.
  const busy = pending || upload.isPending;

  const set = <Key extends keyof SheepDraft>(key: Key, value: SheepDraft[Key]) =>
    onChange({ ...draft, [key]: value });
  const setPedigree = (pedigree: PedigreeDraft) => onChange({ ...draft, ...pedigree });

  function submit() {
    if (!busy) onSave();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  const originItems = [
    { value: "born", label: t`Рождён на ферме` },
    { value: "bought", label: t`Куплен` },
  ];

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex-1 overflow-y-auto p-4">
        <FieldGroup className="gap-4">
          {top}
          {intro}
          <Field data-invalid={tagError !== null}>
            <FieldLabel htmlFor={`${id}-tag`}>
              <Trans>Бирка</Trans>
            </FieldLabel>
            <Input
              ref={tagRef}
              id={`${id}-tag`}
              value={draft.tag}
              maxLength={maxTagLength}
              autoComplete="off"
              spellCheck={false}
              className="tabular-nums"
              aria-invalid={tagError !== null}
              onChange={(event) => set("tag", event.target.value)}
            />
            <FieldError>{tagError}</FieldError>
          </Field>
          <Field data-invalid={nameError !== null}>
            <FieldLabel htmlFor={`${id}-name`}>
              <Trans>Кличка</Trans>
            </FieldLabel>
            <Input
              id={`${id}-name`}
              value={draft.name}
              maxLength={maxSheepNameLength}
              autoComplete="off"
              aria-invalid={nameError !== null}
              onChange={(event) => set("name", event.target.value)}
            />
            <FieldError>{nameError}</FieldError>
          </Field>
          <Field data-invalid={sexMissing || sexError !== null}>
            <FieldLabel id={`${id}-sex`}>
              <Trans>Пол</Trans>
            </FieldLabel>
            <ToggleGroup
              aria-labelledby={`${id}-sex`}
              variant="outline"
              spacing={0}
              disabled={sexLocked}
              value={draft.sex === null ? [] : [draft.sex]}
              onValueChange={(value) => {
                const [sex] = value;
                if (sex === "ram" || sex === "ewe") set("sex", sex);
              }}
            >
              <ToggleGroupItem value="ram" className="px-4">
                <Trans>Самец</Trans>
              </ToggleGroupItem>
              <ToggleGroupItem value="ewe" className="px-4">
                <Trans>Самка</Trans>
              </ToggleGroupItem>
            </ToggleGroup>
            {sexLocked && (
              <FieldDescription>
                <Trans>У барана есть потомки, поэтому пол не меняется.</Trans>
              </FieldDescription>
            )}
            <FieldError>
              {sexMissing ? <Trans>Выберите пол: самец или самка.</Trans> : sexError}
            </FieldError>
          </Field>
          {showOrigin && (
            <Field>
              <FieldLabel htmlFor={`${id}-origin`}>
                <Trans>Происхождение</Trans>
              </FieldLabel>
              <Select
                items={originItems}
                value={draft.origin}
                onValueChange={(value) => {
                  if (value === "born" || value === "bought") set("origin", value);
                }}
              >
                <SelectTrigger id={`${id}-origin`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {originItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field data-invalid={birthDateError !== null}>
            <FieldLabel htmlFor={`${id}-birth-date`}>
              <Trans>Дата рождения</Trans>
            </FieldLabel>
            <Input
              id={`${id}-birth-date`}
              type="date"
              max={today}
              className="w-44 tabular-nums"
              value={draft.birthDate}
              aria-invalid={birthDateError !== null}
              onChange={(event) => set("birthDate", event.target.value)}
            />
            {!birthDateRequired && (
              <FieldDescription>
                <Trans>Если дату никто не знает, оставьте поле пустым.</Trans>
              </FieldDescription>
            )}
            <FieldError>{birthDateError}</FieldError>
          </Field>
          {ownerField}
          <Collapsible open={moreOpen || moreError} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger
              render={<Button variant="ghost" size="sm" className="-ml-2.5 group/more" />}
            >
              <Trans>Дополнительно</Trans>
              <ChevronDownIcon
                data-icon="inline-end"
                className="transition-transform group-data-panel-open/more:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <FieldGroup className="gap-5 pt-3">
                <ParentsFields
                  id={id}
                  draft={draft}
                  onChange={setPedigree}
                  error={error}
                  options={parentOptions}
                  selfId={selfId}
                />
                <CompositionFields
                  id={id}
                  farmId={farm.id}
                  draft={draft}
                  onChange={setPedigree}
                  error={error}
                  preview={preview}
                  keptBreeds={keptBreeds}
                />
                {!external && (
                  <>
                    <FieldSeparator />
                    <PassportFields
                      id={id}
                      draft={draft}
                      onChange={setPedigree}
                      error={error}
                      pure={preview === null || isPureArashan(preview)}
                      today={today}
                      upload={upload}
                    />
                    <GradeFields
                      id={id}
                      draft={draft}
                      onChange={setPedigree}
                      error={error}
                      today={today}
                    />
                  </>
                )}
                <FieldSeparator />
                {!external && (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-3">
                      <Field data-invalid={weightError !== null}>
                        <FieldLabel htmlFor={`${id}-weight`}>
                          <Trans>Вес, кг</Trans>
                        </FieldLabel>
                        <Input
                          id={`${id}-weight`}
                          inputMode="decimal"
                          autoComplete="off"
                          className="tabular-nums"
                          value={draft.weightKg}
                          aria-invalid={weightError !== null}
                          onChange={(event) =>
                            onChange({
                              ...draft,
                              weightKg: event.target.value,
                              // A new weight was weighed today, unless the Member says otherwise.
                              weighingDate: draft.weighingDate || today,
                            })
                          }
                        />
                      </Field>
                      <Field data-invalid={weightError !== null}>
                        <FieldLabel htmlFor={`${id}-weighing-date`}>
                          <Trans>Дата взвешивания</Trans>
                        </FieldLabel>
                        <Input
                          id={`${id}-weighing-date`}
                          type="date"
                          max={today}
                          className="tabular-nums"
                          value={draft.weighingDate}
                          aria-invalid={weightError !== null}
                          onChange={(event) => set("weighingDate", event.target.value)}
                        />
                      </Field>
                    </div>
                    <FieldError>{weightError}</FieldError>
                  </div>
                )}
                <Field data-invalid={notesError !== null}>
                  <FieldLabel htmlFor={`${id}-notes`}>
                    <Trans>Заметки</Trans>
                  </FieldLabel>
                  <Textarea
                    id={`${id}-notes`}
                    rows={3}
                    value={draft.notes}
                    aria-invalid={notesError !== null}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                  <FieldError>{notesError}</FieldError>
                </Field>
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
          {ownError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{ownError.message}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </div>
      <SheetFooter className="mt-0 border-t">
        {status}
        <Button type="submit" disabled={busy} aria-keyshortcuts="Meta+Enter Control+Enter">
          {busy && <Spinner data-icon="inline-start" aria-hidden />}
          {submitLabel}
          <Kbd aria-hidden className="ml-1 bg-primary-foreground/15 text-primary-foreground">
            {shortcut}
          </Kbd>
        </Button>
      </SheetFooter>
    </form>
  );
}

/** True on a Mac or an iPad, where the shortcut uses ⌘ in place of Ctrl. */
function isApple(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}
