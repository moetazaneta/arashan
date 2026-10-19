import {
  compositionOf,
  dateAt,
  maxLambs,
  maxStillborn,
  maxTagLength,
  useLambingDefaults,
  useParentOptions,
  useRecordLambing,
  useSheepOwners,
} from "@arashan/client";
import type {
  BreedComposition,
  CalendarDate,
  ErrorCode,
  Farm,
  LambingDefaults,
  LambingInput,
  MembershipId,
  OwnerOption,
  ParentOption,
  Sex,
  SheepId,
} from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, type RefObject, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
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
import { SheetFooter } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type ErrorInfo, formError, useCodeMessage, useError } from "@/errors";
import { cn } from "@/lib/utils";

import { CompositionText } from "./composition";
import { statusLabels } from "./labels";
import { isApple, SheepSheet } from "./sheep-form";
import { useSheepTag } from "./sheep-ref";

// The side panel «Окот» (DESIGN.md, "Event Entry"): one form registers all live Lambs of an Ewe at
// once. The keyboard alone fills it: each field is one Tab from the last, «Добавить ягнёнка» moves
// the focus into the new row, and Enter in a one-line field or ⌘↵ saves. The core checks each rule
// again; the form checks what it can first, so that the error shows at the field.

/** One live Lamb in the form, before the core checks it. */
interface LambDraft {
  /** The key of the row, for React and for the ids of its fields. */
  key: number;
  sex: Sex | null;
  tag: string;
  /**
   * The Owner that the Member chose for this Lamb, or null: then the Lamb gets the Owner of the
   * Mother on the date of the Lambing, and the row follows that Owner when the Mother or the date
   * changes.
   */
  ownerId: MembershipId | null;
}

let lastKey = 0;
function newLamb(): LambDraft {
  lastKey += 1;
  return { key: lastKey, sex: null, tag: "", ownerId: null };
}

/** The errors of the core that each part of the form shows. The form shows the others in an alert. */
const fieldCodes = {
  mother: ["lambing.motherExternal", "lambing.motherNotActive", "pedigree.motherNotEwe"],
  father: ["pedigree.fatherNotRam"],
  date: ["lambing.dateInvalid", "pedigree.parentBornAfterChild"],
  flock: ["lambing.flockArchived", "flock.notFound"],
  lambs: [
    "lambing.lambsRequired",
    "lambing.tooManyLambs",
    "lambing.tagRepeated",
    "sheep.tagTaken",
    "sheep.tagTooLong",
    "sheep.ownerNotMember",
  ],
  stillborn: ["lambing.stillbornInvalid"],
} satisfies Record<string, readonly ErrorCode[]>;
const allFieldCodes: readonly ErrorCode[] = Object.values(fieldCodes).flat();

function fieldError(error: ErrorInfo | null, field: keyof typeof fieldCodes): string | null {
  if (error?.code == null) return null;
  return (fieldCodes[field] as readonly ErrorCode[]).includes(error.code) ? error.message : null;
}

/**
 * The Tag as the form compares it: trimmed, with the spaces inside as one, in lower case. The core
 * compares more (letters that look alike), and it decides.
 */
function tagKeyOf(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** The number of stillborn Lambs, or null if the text is not a whole number from 0 to the limit. */
function stillbornOf(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  return count <= maxStillborn ? count : null;
}

/**
 * The side panel that records a Lambing. The card of an Ewe opens it with her as the Mother; then the
 * date has the focus first.
 */
export function RecordLambingSheet({
  farm,
  motherId = null,
  open,
  onOpenChange,
  onRecorded,
}: {
  farm: Farm;
  /** The Mother to fill in, or null to choose her in the form. */
  motherId?: SheepId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a save, with the number of live Lambs. The panel closes. */
  onRecorded?: (lambs: number) => void;
}) {
  const { t } = useLingui();
  const motherRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  return (
    <SheepSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t`Окот`}
      initialFocus={motherId === null ? motherRef : dateRef}
    >
      <LambingForm
        farm={farm}
        initialMotherId={motherId}
        motherRef={motherRef}
        dateRef={dateRef}
        onRecorded={(lambs) => {
          onOpenChange(false);
          onRecorded?.(lambs);
        }}
      />
    </SheepSheet>
  );
}

/** «Записано ягнят: 2». The result of a save, for a status line. */
export function LambsRecorded({ count }: { count: number }) {
  return <Trans>Записано ягнят: {count}</Trans>;
}

function LambingForm({
  farm,
  initialMotherId,
  motherRef,
  dateRef,
  onRecorded,
}: {
  farm: Farm;
  initialMotherId: SheepId | null;
  motherRef: RefObject<HTMLInputElement | null>;
  dateRef: RefObject<HTMLInputElement | null>;
  onRecorded: (lambs: number) => void;
}) {
  const { t } = useLingui();
  const id = useId();
  const options = useParentOptions(farm.id).data;
  const owners = useSheepOwners(farm.id).data;
  const record = useRecordLambing(farm.id);
  const error = useError(record.error);
  const codeMessage = useCodeMessage();
  const today = dateAt(Date.now(), farm.timeZone);
  const [motherId, setMotherId] = useState(initialMotherId);
  const [fatherId, setFatherId] = useState<SheepId | null>(null);
  const [date, setDate] = useState<string>(today);
  const [lambs, setLambs] = useState<LambDraft[]>(() => [newLamb()]);
  const [stillborn, setStillborn] = useState("0");
  // The form shows its own errors after the first try to save, and then while the Member fixes them.
  const [checked, setChecked] = useState(false);

  // A date input gives a whole date or nothing.
  const validDate = date === "" ? null : (date as CalendarDate);
  const defaults = useLambingDefaults(farm.id, motherId, validDate);
  // The Mother is an Active Ewe of the Farm; the Father is any Ram, also an External one.
  const mothers = (options ?? []).filter(
    (option) => option.sex === "ewe" && option.origin !== "external" && option.status === "active",
  );
  const fathers = (options ?? []).filter((option) => option.sex === "ram");
  const mother = options?.find((option) => option.id === motherId) ?? null;
  const father = options?.find((option) => option.id === fatherId) ?? null;
  const composition =
    mother === null || (fatherId !== null && father === null)
      ? null
      : compositionOf(mother.composition, father?.composition ?? null, []);
  /**
   * The Owner of the Mother on the date: the Owner of each Lamb that has no Owner of its own. Null if
   * that Member left the Farm, undefined while it is not known.
   */
  const defaultOwner =
    motherId === null || defaults.data === undefined ? undefined : (defaults.data?.ownerId ?? null);

  // The checks of the form. The core checks them again.
  const tagCounts = new Map<string, number>();
  for (const lamb of lambs) {
    const key = tagKeyOf(lamb.tag);
    if (key !== "") tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
  }
  const tagRepeated = (lamb: LambDraft) => (tagCounts.get(tagKeyOf(lamb.tag)) ?? 0) > 1;
  const ownerMissing = (lamb: LambDraft) => lamb.ownerId === null && defaultOwner === null;
  const stillbornCount = stillbornOf(stillborn);
  const dateWrong = validDate === null || validDate > today;

  const motherError =
    checked && motherId === null ? t`Выберите мать.` : fieldError(error, "mother");
  const dateError =
    checked && dateWrong ? codeMessage("lambing.dateInvalid") : fieldError(error, "date");
  const ownLambsError = !checked
    ? null
    : lambs.some((lamb) => lamb.sex === null)
      ? t`Выберите пол каждого ягнёнка.`
      : lambs.some(tagRepeated)
        ? codeMessage("lambing.tagRepeated")
        : lambs.some(ownerMissing)
          ? t`Выберите владельца каждого ягнёнка.`
          : null;
  const lambsError = ownLambsError ?? fieldError(error, "lambs");
  const stillbornError =
    checked && stillbornCount === null
      ? codeMessage("lambing.stillbornInvalid")
      : fieldError(error, "stillborn");
  const ownError = formError(error, allFieldCodes);
  const shortcut = isApple() ? "⌘↵" : "Ctrl+Enter";

  const fieldId = (name: string) => `${id}-${name}`;
  const lambFieldId = (lamb: LambDraft, name: "sex" | "tag" | "owner") =>
    `${id}-lamb-${lamb.key}-${name}`;
  const focusField = (target: string) => document.getElementById(target)?.focus();

  /** A change of the form clears the error of the last save. */
  function changed() {
    if (record.error !== null) record.reset();
  }

  function setLamb(key: number, change: Partial<LambDraft>) {
    setLambs((current) =>
      current.map((lamb) => (lamb.key === key ? { ...lamb, ...change } : lamb)),
    );
    changed();
  }

  function addLamb() {
    if (lambs.length >= maxLambs) return;
    const lamb = newLamb();
    // The new row must be in the page before it gets the focus.
    flushSync(() => setLambs((current) => [...current, lamb]));
    focusField(lambFieldId(lamb, "sex"));
    changed();
  }

  function removeLamb(key: number) {
    const index = lambs.findIndex((lamb) => lamb.key === key);
    const neighbour = lambs[index + 1] ?? lambs[index - 1];
    flushSync(() => setLambs((current) => current.filter((lamb) => lamb.key !== key)));
    if (neighbour !== undefined) focusField(lambFieldId(neighbour, "sex"));
    changed();
  }

  /** The first field that the Member must fix before a save, or null. */
  function firstInvalidField(): string | null {
    if (motherId === null) return fieldId("mother");
    if (dateWrong) return fieldId("date");
    for (const lamb of lambs) {
      if (lamb.sex === null) return lambFieldId(lamb, "sex");
      if (tagRepeated(lamb)) return lambFieldId(lamb, "tag");
      if (ownerMissing(lamb)) return lambFieldId(lamb, "owner");
    }
    if (stillbornCount === null) return fieldId("stillborn");
    return null;
  }

  function inputOf(): LambingInput | null {
    if (motherId === null || validDate === null || stillbornCount === null) return null;
    const valid = lambs.flatMap((lamb) =>
      lamb.sex === null
        ? []
        : [{ sex: lamb.sex, tag: lamb.tag.trim() === "" ? null : lamb.tag, ownerId: lamb.ownerId }],
    );
    if (valid.length !== lambs.length) return null;
    return { motherId, fatherId, date: validDate, lambs: valid, stillborn: stillbornCount };
  }

  function submit() {
    if (record.isPending) return;
    setChecked(true);
    const invalid = firstInvalidField();
    const input = inputOf();
    if (invalid !== null || input === null) {
      if (invalid !== null) focusField(invalid);
      return;
    }
    record.mutate(input, { onSuccess: ({ lambIds }) => onRecorded(lambIds.length) });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

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
          <ParentPicker
            id={fieldId("mother")}
            label={t`Мать`}
            inputRef={motherRef}
            options={mothers}
            value={motherId}
            error={motherError}
            empty={<Trans>Такой овцы нет среди активных овец фермы.</Trans>}
            onChange={(next) => {
              setMotherId(next);
              changed();
            }}
          />
          <Field data-invalid={dateError !== null}>
            <FieldLabel htmlFor={fieldId("date")}>
              <Trans>Дата окота</Trans>
            </FieldLabel>
            <Input
              ref={dateRef}
              id={fieldId("date")}
              type="date"
              max={today}
              className="w-44 tabular-nums"
              value={date}
              aria-invalid={dateError !== null}
              onChange={(event) => {
                setDate(event.target.value);
                changed();
              }}
            />
            <FieldError>{dateError}</FieldError>
          </Field>
          <ParentPicker
            id={fieldId("father")}
            label={t`Отец`}
            options={fathers}
            value={fatherId}
            error={fieldError(error, "father")}
            empty={
              <Trans>
                Такого самца нет. Отца с другой фермы сначала добавьте как внешнего барана.
              </Trans>
            }
            description={<Trans>Если отец неизвестен, оставьте поле пустым.</Trans>}
            onChange={(next) => {
              setFatherId(next);
              changed();
            }}
          />
          <FieldSet className="gap-3" data-invalid={lambsError !== null}>
            <FieldLegend variant="label" className="mb-0">
              <Trans>Ягнята</Trans>
            </FieldLegend>
            {mother !== null && (
              <LambsOutcome
                farm={farm}
                composition={composition}
                defaults={defaults.data}
                flockError={fieldError(error, "flock")}
              />
            )}
            <div
              className={cn(
                "grid items-center gap-x-2 gap-y-2",
                lambs.length > 1
                  ? "grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
                  : "grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.4fr)]",
              )}
            >
              <div
                aria-hidden
                className="col-span-full grid grid-cols-subgrid text-xs font-medium text-muted-foreground"
              >
                <span />
                <span>
                  <Trans>Пол</Trans>
                </span>
                <span>
                  <Trans>Бирка</Trans>
                </span>
                <span>
                  <Trans>Владелец</Trans>
                </span>
              </div>
              {lambs.map((lamb, index) => (
                <LambRow
                  key={lamb.key}
                  number={index + 1}
                  lamb={lamb}
                  fieldId={(name) => lambFieldId(lamb, name)}
                  owners={owners}
                  defaultOwner={defaultOwner}
                  removable={lambs.length > 1}
                  sexInvalid={checked && lamb.sex === null}
                  tagInvalid={checked && tagRepeated(lamb)}
                  ownerInvalid={checked && ownerMissing(lamb)}
                  onChange={(change) => setLamb(lamb.key, change)}
                  onRemove={() => removeLamb(lamb.key)}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lambs.length >= maxLambs}
                onClick={addLamb}
              >
                <PlusIcon data-icon="inline-start" />
                <Trans>Добавить ягнёнка</Trans>
              </Button>
              {lambs.length >= maxLambs && (
                <span className="text-xs text-muted-foreground">
                  <Trans>В одном окоте не больше {maxLambs} живых ягнят.</Trans>
                </span>
              )}
            </div>
            <FieldDescription className="text-xs">
              <Trans>По умолчанию владелец ягнёнка — владелец матери на дату окота.</Trans>
            </FieldDescription>
            <FieldError>{lambsError}</FieldError>
          </FieldSet>
          <Field data-invalid={stillbornError !== null}>
            <FieldLabel htmlFor={fieldId("stillborn")}>
              <Trans>Мертворождённых</Trans>
            </FieldLabel>
            <Input
              id={fieldId("stillborn")}
              inputMode="numeric"
              autoComplete="off"
              className="w-20 tabular-nums"
              value={stillborn}
              aria-invalid={stillbornError !== null}
              onChange={(event) => {
                setStillborn(event.target.value);
                changed();
              }}
            />
            <FieldError>{stillbornError}</FieldError>
          </Field>
          {ownError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{ownError.message}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </div>
      <SheetFooter className="mt-0 border-t">
        <Button
          type="submit"
          disabled={record.isPending}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {record.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          <Trans>Записать окот</Trans>
          <Kbd aria-hidden className="ml-1 bg-primary-foreground/15 text-primary-foreground">
            {shortcut}
          </Kbd>
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * A picker of a parent: a Sheep of the Farm by its Tag or name. The first match is highlighted while
 * the Member types, so Enter picks it.
 */
function ParentPicker({
  id,
  label,
  inputRef,
  options,
  value,
  error,
  empty,
  description,
  onChange,
}: {
  id: string;
  label: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  options: ParentOption[];
  value: SheepId | null;
  error: string | null;
  /** What the list says when no Sheep matches. */
  empty: ReactNode;
  description?: ReactNode;
  onChange: (id: SheepId | null) => void;
}) {
  const { t, i18n } = useLingui();
  const tag = useSheepTag();
  const selected = options.find((option) => option.id === value) ?? null;
  const labelOf = (option: ParentOption) =>
    option.name === null ? tag(option) : `${tag(option)} ${option.name}`;

  return (
    <Field data-invalid={error !== null}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Combobox
        items={options}
        value={selected}
        autoHighlight
        itemToStringLabel={labelOf}
        isItemEqualToValue={(item, current) => item.id === current.id}
        onValueChange={(option) => onChange(option?.id ?? null)}
      >
        <ComboboxInput
          ref={inputRef}
          id={id}
          placeholder={t`Бирка или кличка`}
          showClear={selected !== null}
          aria-invalid={error !== null}
        />
        <ComboboxContent>
          <ComboboxEmpty>{empty}</ComboboxEmpty>
          <ComboboxList>
            {(option: ParentOption) => (
              <ComboboxItem key={option.id} value={option}>
                {/* The spaces between the parts make the name of the option: «12 Буян внешний». */}
                <span className="font-medium tabular-nums">{tag(option)}</span>{" "}
                {option.name !== null && <span className="truncate">{option.name}</span>}{" "}
                {option.origin === "external" ? (
                  <span className="ml-auto text-muted-foreground">
                    <Trans>внешний</Trans>
                  </span>
                ) : (
                  option.status !== "active" && (
                    <span className="ml-auto text-muted-foreground">
                      {i18n._(statusLabels[option.status])}
                    </span>
                  )
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {description !== undefined && (
        <FieldDescription className="text-xs">{description}</FieldDescription>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** One row of «Ягнята»: the sex, the Tag and the Owner of a live Lamb. */
function LambRow({
  number,
  lamb,
  fieldId,
  owners,
  defaultOwner,
  removable,
  sexInvalid,
  tagInvalid,
  ownerInvalid,
  onChange,
  onRemove,
}: {
  /** The number of the row, from 1. */
  number: number;
  lamb: LambDraft;
  fieldId: (name: "sex" | "tag" | "owner") => string;
  owners: OwnerOption[] | undefined;
  /** The Owner of the Mother on the date; null if the Member must choose; undefined if not known. */
  defaultOwner: MembershipId | null | undefined;
  removable: boolean;
  sexInvalid: boolean;
  tagInvalid: boolean;
  ownerInvalid: boolean;
  onChange: (change: Partial<LambDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const ownerItems = (owners ?? []).map((owner) => ({ value: owner.id, label: owner.name }));
  const owner = owners === undefined ? null : (lamb.ownerId ?? defaultOwner ?? null);

  return (
    <div
      role="group"
      aria-label={t`Ягнёнок ${number}`}
      className="col-span-full grid grid-cols-subgrid items-center"
    >
      <span aria-hidden className="w-3 text-right text-xs text-muted-foreground tabular-nums">
        {number}
      </span>
      <ToggleGroup
        aria-label={t`Пол`}
        variant="outline"
        spacing={0}
        value={lamb.sex === null ? [] : [lamb.sex]}
        onValueChange={(value) => {
          const [sex] = value;
          if (sex === "ram" || sex === "ewe") onChange({ sex });
        }}
      >
        <ToggleGroupItem id={fieldId("sex")} value="ram" aria-invalid={sexInvalid}>
          <Trans>Самец</Trans>
        </ToggleGroupItem>
        <ToggleGroupItem value="ewe" aria-invalid={sexInvalid}>
          <Trans>Самка</Trans>
        </ToggleGroupItem>
      </ToggleGroup>
      <Input
        id={fieldId("tag")}
        aria-label={t`Бирка`}
        value={lamb.tag}
        maxLength={maxTagLength}
        autoComplete="off"
        spellCheck={false}
        className="w-full tabular-nums"
        aria-invalid={tagInvalid}
        onChange={(event) => onChange({ tag: event.target.value })}
      />
      <Select
        items={ownerItems}
        value={owner}
        onValueChange={(value) => {
          if (value !== null) onChange({ ownerId: value });
        }}
      >
        <SelectTrigger
          id={fieldId("owner")}
          aria-label={t`Владелец`}
          className="w-full min-w-0"
          aria-invalid={ownerInvalid}
        >
          <SelectValue
            placeholder={defaultOwner === null ? t`Выберите владельца` : t`Как у матери`}
          />
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
      {removable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t`Убрать ягнёнка ${number}`}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

/**
 * What the Lambs get from the Mother and the Father: the Breed composition, and the Flock that had
 * the Mother at the end of the date, where the Lambs go.
 */
function LambsOutcome({
  farm,
  composition,
  defaults,
  flockError,
}: {
  farm: Farm;
  /** Null while the parents load. */
  composition: BreedComposition | null;
  /** Undefined while they load or with no date; null for a Sheep that is not on the Farm. */
  defaults: LambingDefaults | null | undefined;
  /** The error of the core about that Flock, after a save. */
  flockError: string | null;
}) {
  return (
    <dl
      aria-live="polite"
      className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm tabular-nums"
    >
      <dt className="text-muted-foreground">
        <Trans>Состав породы</Trans>
      </dt>
      <dd>
        {composition !== null && <CompositionText farmId={farm.id} composition={composition} />}
      </dd>
      <dt className="text-muted-foreground">
        <Trans>Стадо</Trans>
      </dt>
      <dd>
        <FlockOutcome defaults={defaults} error={flockError} />
      </dd>
    </dl>
  );
}

function FlockOutcome({
  defaults,
  error,
}: {
  defaults: LambingDefaults | null | undefined;
  error: string | null;
}) {
  if (error !== null) {
    return (
      <span role="alert" className="flex gap-1.5 text-destructive">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {error}
      </span>
    );
  }
  if (defaults == null) return null;
  const flock = defaults.flock;
  if (flock === null) {
    return (
      <span className="text-muted-foreground">
        <Trans>вне стада</Trans>
      </span>
    );
  }
  if (!flock.archived) return <span>{flock.name}</span>;
  const name = flock.name;
  return (
    <span className="flex gap-1.5 text-warning">
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <Trans>
          «{name}» в архиве, и ягнят нельзя записать в это стадо. Верните стадо из архива или
          исправьте дату окота.
        </Trans>
      </span>
    </span>
  );
}
