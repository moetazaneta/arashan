import {
  arashanBreedId,
  compositionOf,
  grades,
  knownParents,
  manualLimit,
  maxPassportNumberLength,
  maxScanBytes,
  scanContentTypes,
  type SheepCardData,
  useBreeds,
  type useUploadPassportScan,
} from "@arashan/client";
import type {
  BreedComposition,
  BreedId,
  BreedShare,
  ErrorCode,
  FarmId,
  FileId,
  Grade,
  ParentOption,
  PedigreeDetails,
  SheepId,
} from "@arashan/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { PlusIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

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
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { type ErrorInfo, useCodeMessage, useError } from "@/errors";
import { formatShare, formatShareInput, parseShare } from "@/format";

import { useBreedLabel, useCompositionText } from "./composition";
import { gradeLabels } from "./labels";
import { useSheepTag } from "./sheep-ref";

// The fields of the block «Дополнительно» that come with the pedigree: the parents, the Breed
// composition, the Passport and the Grade. The core checks each rule again when the form saves.

/** One part of the Breed composition that a Member gives by hand, as the form holds it. */
export interface BreedPartDraft {
  /** The key of the row for React: a part has no id of its own. */
  key: number;
  breedId: BreedId;
  /** The percent as the Member types it: «12,5». */
  percent: string;
}

/** The scan of a Passport in the form: the one that the Sheep has, or a new upload. */
export interface ScanDraft {
  id: FileId;
  /** The name of the file that the Member uploaded now, or null for the scan that the Sheep has. */
  fileName: string | null;
  /** The URL of the scan that the Sheep has, or null for a new upload. */
  url: string | null;
}

/** The pedigree, the Passport and the Grade as the form holds them, before the core checks them. */
export interface PedigreeDraft {
  motherId: SheepId | null;
  fatherId: SheepId | null;
  manualBreeds: BreedPartDraft[];
  passportNumber: string;
  passportIssueDate: string;
  scan: ScanDraft | null;
  grade: Grade | null;
  gradeDate: string;
}

export const emptyPedigree: PedigreeDraft = {
  motherId: null,
  fatherId: null,
  manualBreeds: [],
  passportNumber: "",
  passportIssueDate: "",
  scan: null,
  grade: null,
  gradeDate: "",
};

let lastKey = 0;
const newKey = () => ++lastKey;

export function pedigreeDraftOf(sheep: SheepCardData, locale: string): PedigreeDraft {
  const scan = sheep.passport?.scan ?? null;
  return {
    motherId: sheep.mother?.id ?? null,
    fatherId: sheep.father?.id ?? null,
    manualBreeds: sheep.manualBreeds.map((part) => ({
      key: newKey(),
      breedId: part.breedId,
      percent: formatShareInput(part.share, locale),
    })),
    passportNumber: sheep.passport?.number ?? "",
    passportIssueDate: sheep.passport?.issueDate ?? "",
    scan: scan === null ? null : { id: scan.id, fileName: null, url: scan.url },
    grade: sheep.grade?.grade ?? null,
    gradeDate: sheep.grade?.date ?? "",
  };
}

/** True if the draft has a parent, a part by hand, a Passport or a Grade. */
export function hasPedigreeData(draft: PedigreeDraft): boolean {
  return (
    draft.motherId !== null ||
    draft.fatherId !== null ||
    draft.manualBreeds.length > 0 ||
    hasPassport(draft) ||
    draft.grade !== null
  );
}

function hasPassport(draft: PedigreeDraft): boolean {
  return (
    draft.passportNumber.trim() !== "" || draft.passportIssueDate !== "" || draft.scan !== null
  );
}

/** The parts by hand that the Member typed. A row with an empty percent is no part. */
function partsOf(draft: PedigreeDraft): BreedShare[] {
  return draft.manualBreeds
    .filter((part) => part.percent.trim() !== "")
    .map((part) => ({ breedId: part.breedId, share: parseShare(part.percent) }));
}

/**
 * The fields of the pedigree to send. With two known parents the composition comes from them, so
 * the form sends no parts by hand. An empty number and date of the Passport mean no Passport, and a
 * Grade with no date was given today. An External Sheep has no Passport and no Grade.
 */
export function pedigreeOf(
  draft: PedigreeDraft,
  today: string,
  external: boolean,
): Partial<PedigreeDetails> {
  const parents = { motherId: draft.motherId, fatherId: draft.fatherId };
  const manualBreeds = knownParents(parents) === 2 ? [] : partsOf(draft);
  if (external) return { ...parents, manualBreeds };
  return {
    ...parents,
    manualBreeds,
    passport: hasPassport(draft)
      ? {
          number: draft.passportNumber,
          issueDate: draft.passportIssueDate,
          scanId: draft.scan?.id ?? null,
        }
      : null,
    grade: draft.grade === null ? null : { grade: draft.grade, date: draft.gradeDate || today },
  };
}

/**
 * The draft with new parents. The parts by hand are parts of the whole Sheep, out of what the unknown
 * parents give: when the first parent becomes known, the editable part halves, and so does each part;
 * with two known parents, no part is left.
 */
export function withParents(
  draft: PedigreeDraft,
  parents: Pick<PedigreeDraft, "motherId" | "fatherId">,
  locale: string,
): PedigreeDraft {
  const before = knownParents(draft);
  const after = knownParents(parents);
  let manualBreeds = draft.manualBreeds;
  if (after === 2) manualBreeds = [];
  else if (before === 0 && after === 1) {
    manualBreeds = manualBreeds.map((part) => {
      const share = parseShare(part.percent);
      if (part.percent.trim() === "" || !Number.isFinite(share)) return part;
      return { ...part, percent: formatShareInput(Math.round(share / 2), locale) };
    });
  }
  return { ...draft, ...parents, manualBreeds };
}

/**
 * The Breed composition that the Sheep gets with the draft, as the core computes it: from the
 * compositions of the parents and the valid parts by hand. Null while the parents load.
 */
export function compositionPreview(
  draft: PedigreeDraft,
  options: readonly ParentOption[] | undefined,
): BreedComposition | null {
  const parent = (id: SheepId | null) =>
    id === null ? null : options?.find((option) => option.id === id)?.composition;
  const mother = parent(draft.motherId);
  const father = parent(draft.fatherId);
  if (mother === undefined || father === undefined) return null;
  const parts =
    knownParents(draft) === 2
      ? []
      : partsOf(draft).filter((part) => Number.isSafeInteger(part.share) && part.share > 0);
  return compositionOf(mother, father, parts);
}

/** The errors that the fields of the pedigree show under them. */
export const pedigreeFieldCodes = {
  mother: ["pedigree.motherNotEwe"],
  father: ["pedigree.fatherNotRam"],
  parents: ["pedigree.parentNotFound", "pedigree.parentBornAfterChild", "pedigree.ownAncestor"],
  composition: [
    "sheep.breedsTooLarge",
    "sheep.breedsInvalid",
    "breed.archived",
    "breed.notFound",
    // A change of the composition would break the Passport of a descendant.
    "passport.descendantNotArashan",
  ],
  passport: ["passport.notArashan"],
  passportNumber: ["passport.numberRequired", "passport.numberTooLong"],
  passportIssueDate: ["passport.issueDateInvalid"],
  passportScan: ["passport.scanInvalid"],
  grade: ["sheep.gradeDateInvalid"],
} satisfies Record<string, readonly ErrorCode[]>;

type PedigreeField = keyof typeof pedigreeFieldCodes;

function errorFor(error: ErrorInfo | null, field: PedigreeField): string | null {
  if (error?.code == null) return null;
  return (pedigreeFieldCodes[field] as readonly ErrorCode[]).includes(error.code)
    ? error.message
    : null;
}

/** True if a field of the pedigree shows the error: then the block «Дополнительно» opens. */
export function isPedigreeError(error: ErrorInfo | null): boolean {
  return (Object.keys(pedigreeFieldCodes) as PedigreeField[]).some(
    (field) => errorFor(error, field) !== null,
  );
}

interface FieldsProps {
  /** The prefix of the ids of the inputs, unique on the page. */
  id: string;
  draft: PedigreeDraft;
  onChange: (draft: PedigreeDraft) => void;
  error: ErrorInfo | null;
}

/**
 * «Мать» and «Отец»: the Sheep of the Farm of the right sex, also the External ones, without the
 * Sheep itself.
 */
export function ParentsFields({
  id,
  draft,
  onChange,
  error,
  options,
  selfId,
}: FieldsProps & {
  options: readonly ParentOption[] | undefined;
  /** The Sheep of the form, which cannot be its own parent, or null for a new Sheep. */
  selfId: SheepId | null;
}) {
  const { t, i18n } = useLingui();
  const of = (sex: ParentOption["sex"]) =>
    (options ?? []).filter((option) => option.sex === sex && option.id !== selfId);
  const parentsError = errorFor(error, "parents");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <ParentField
          id={`${id}-mother`}
          label={t`Мать`}
          options={of("ewe")}
          value={draft.motherId}
          error={errorFor(error, "mother")}
          invalid={parentsError !== null}
          onChange={(motherId) =>
            onChange(withParents(draft, { motherId, fatherId: draft.fatherId }, i18n.locale))
          }
        />
        <ParentField
          id={`${id}-father`}
          label={t`Отец`}
          options={of("ram")}
          value={draft.fatherId}
          error={errorFor(error, "father")}
          invalid={parentsError !== null}
          onChange={(fatherId) =>
            onChange(withParents(draft, { motherId: draft.motherId, fatherId }, i18n.locale))
          }
        />
      </div>
      <FieldError>{parentsError}</FieldError>
      <FieldDescription className="-mt-1 text-xs">
        <Trans>
          Если родителя нет в списке, добавьте его как внешнего барана: «Добавить барана» →
          «Внешний».
        </Trans>
      </FieldDescription>
    </div>
  );
}

function ParentField({
  id,
  label,
  options,
  value,
  error,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  options: ParentOption[];
  value: SheepId | null;
  error: string | null;
  /** True if an error of both parents shows under them. */
  invalid: boolean;
  onChange: (id: SheepId | null) => void;
}) {
  const { t } = useLingui();
  const tag = useSheepTag();
  const selected = options.find((option) => option.id === value) ?? null;
  const labelOf = (option: ParentOption) =>
    option.name === null ? tag(option) : `${tag(option)} ${option.name}`;

  return (
    <Field data-invalid={error !== null || invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Combobox
        items={options}
        value={selected}
        itemToStringLabel={labelOf}
        isItemEqualToValue={(item, current) => item.id === current.id}
        onValueChange={(option) => onChange(option?.id ?? null)}
      >
        <ComboboxInput
          id={id}
          placeholder={t`Бирка или кличка`}
          showClear={selected !== null}
          aria-invalid={error !== null || invalid}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            <Trans>Такого барана нет.</Trans>
          </ComboboxEmpty>
          <ComboboxList>
            {(option: ParentOption) => (
              <ComboboxItem key={option.id} value={option}>
                {/* The spaces between the parts make the name of the option: «12 Буян внешний». */}
                <span className="font-medium tabular-nums">{tag(option)}</span>{" "}
                {option.name !== null && <span className="truncate">{option.name}</span>}{" "}
                {option.origin === "external" && (
                  <span className="ml-auto text-muted-foreground">
                    <Trans>внешний</Trans>
                  </span>
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/**
 * «Состав породы»: the composition that the Sheep gets, and the editor of the part that the unknown
 * parents leave: up to 100 percent with no known parent, up to 50 with one, none with two.
 */
export function CompositionFields({
  id,
  farmId,
  draft,
  onChange,
  error,
  preview,
  keptBreeds,
}: FieldsProps & {
  farmId: FarmId;
  preview: BreedComposition | null;
  /** The Breeds that the Sheep has by hand now: the form offers them even if they are Archived. */
  keptBreeds: ReadonlySet<BreedId>;
}) {
  const { t, i18n } = useLingui();
  const breeds = useBreeds(farmId).data;
  const breedLabel = useBreedLabel();
  const compositionText = useCompositionText(farmId);
  const known = knownParents(draft);
  const limit = manualLimit(known);
  const compositionError = errorFor(error, "composition");
  const parts = partsOf(draft);
  const sum = parts.reduce(
    (total, part) => total + (Number.isFinite(part.share) ? part.share : 0),
    0,
  );
  const tooMuch = sum > limit;
  const limitText = formatShare(limit, i18n.locale);
  const offered = (breeds ?? []).filter((breed) => !breed.archived || keptBreeds.has(breed.id));
  const used = new Set(draft.manualBreeds.map((part) => part.breedId));
  const free = offered.filter((breed) => !used.has(breed.id));

  const setParts = (manualBreeds: BreedPartDraft[]) => onChange({ ...draft, manualBreeds });
  const setPart = (key: number, change: Partial<BreedPartDraft>) =>
    setParts(draft.manualBreeds.map((part) => (part.key === key ? { ...part, ...change } : part)));

  // «Всё неизвестное — арашан»: Arashan gets what the other parts by hand leave of the editable part.
  const others = parts.filter((part) => part.breedId !== arashanBreedId);
  const othersSum = others.reduce(
    (total, part) => total + (Number.isFinite(part.share) ? part.share : 0),
    0,
  );
  const arashanRest = limit - othersSum;
  const arashanNow = parts.find((part) => part.breedId === arashanBreedId)?.share ?? 0;

  function allArashan() {
    const arashan = draft.manualBreeds.find((part) => part.breedId === arashanBreedId);
    setParts([
      {
        key: arashan?.key ?? newKey(),
        breedId: arashanBreedId,
        percent: formatShareInput(arashanRest, i18n.locale),
      },
      ...draft.manualBreeds.filter((part) => part.breedId !== arashanBreedId),
    ]);
  }

  return (
    <FieldSet className="gap-2" data-invalid={compositionError !== null}>
      <FieldLegend variant="label" className="mb-0">
        <Trans>Состав породы</Trans>
      </FieldLegend>
      <p aria-live="polite" className="text-sm tabular-nums">
        {preview !== null && compositionText !== null ? compositionText(preview) : " "}
      </p>
      {limit === 0 ? (
        <FieldDescription>
          <Trans>Состав считается по родителям.</Trans>
        </FieldDescription>
      ) : (
        <>
          {draft.manualBreeds.map((part) => {
            const items = offered
              .filter((breed) => breed.id === part.breedId || !used.has(breed.id))
              .map((breed) => ({
                value: breed.id,
                label: breedLabel(breed),
                archived: breed.archived,
              }));
            return (
              <div key={part.key} className="flex items-center gap-2">
                <Select
                  items={items}
                  value={part.breedId}
                  onValueChange={(breedId) => {
                    if (breedId !== null) setPart(part.key, { breedId });
                  }}
                >
                  <SelectTrigger aria-label={t`Порода`} className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                          {item.archived && (
                            <span className="text-muted-foreground">
                              <Trans>в архиве</Trans>
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <InputGroup className="w-28">
                  <InputGroupInput
                    aria-label={t`Доля, %`}
                    inputMode="decimal"
                    autoComplete="off"
                    className="text-right tabular-nums"
                    value={part.percent}
                    aria-invalid={compositionError !== null || tooMuch}
                    aria-describedby={`${id}-composition-limit`}
                    onChange={(event) => setPart(part.key, { percent: event.target.value })}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>%</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Убрать породу`}
                  onClick={() =>
                    setParts(draft.manualBreeds.filter((other) => other.key !== part.key))
                  }
                >
                  <XIcon />
                </Button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={free[0] === undefined}
              onClick={() => {
                const [breed] = free;
                if (breed !== undefined) {
                  setParts([
                    ...draft.manualBreeds,
                    { key: newKey(), breedId: breed.id, percent: "" },
                  ]);
                }
              }}
            >
              <PlusIcon data-icon="inline-start" />
              <Trans>Добавить породу</Trans>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={arashanRest <= 0 || arashanNow === arashanRest}
              onClick={allArashan}
            >
              <Trans>Всё неизвестное — арашан</Trans>
            </Button>
          </div>
          <FieldDescription
            id={`${id}-composition-limit`}
            className={tooMuch ? "text-destructive" : undefined}
          >
            <Trans>Можно указать до {limitText}.</Trans>
          </FieldDescription>
        </>
      )}
      <FieldError>{compositionError}</FieldError>
    </FieldSet>
  );
}

/**
 * «Ветпаспорт»: the number, the issue date and the scan. The scan uploads at once, so the Sheep gets
 * only its id when the form saves.
 */
export function PassportFields({
  id,
  draft,
  onChange,
  error,
  pure,
  today,
  upload,
  onScan,
}: FieldsProps & {
  /** False if the composition that the Sheep gets is not 100 percent Arashan. */
  pure: boolean;
  today: string;
  upload: ReturnType<typeof useUploadPassportScan>;
  /**
   * Puts a new scan into the draft. The upload ends later, so this changes only the scan of the
   * draft of that time, not the draft of the time when the upload started.
   */
  onScan: (scan: ScanDraft) => void;
}) {
  const { t } = useLingui();
  const codeMessage = useCodeMessage();
  const uploadError = useError(upload.error);
  const fileRef = useRef<HTMLInputElement>(null);
  // A file that the form refuses before an upload: too large, or of another type.
  const [fileRefused, setFileRefused] = useState(false);
  const numberError = errorFor(error, "passportNumber");
  const issueDateError = errorFor(error, "passportIssueDate");
  const scanError =
    errorFor(error, "passportScan") ??
    (fileRefused ? codeMessage("passport.scanInvalid") : null) ??
    uploadError?.message ??
    null;
  const passportError = errorFor(error, "passport");
  const set = (change: Partial<PedigreeDraft>) => onChange({ ...draft, ...change });

  function onFile(file: File | undefined) {
    upload.reset();
    setFileRefused(false);
    if (file === undefined) return;
    if (file.size > maxScanBytes || !(scanContentTypes as readonly string[]).includes(file.type)) {
      setFileRefused(true);
      return;
    }
    upload.mutate(file, {
      onSuccess: (scanId) => {
        onScan({ id: scanId, fileName: file.name, url: null });
        // The name shows above; the input is ready for another file.
        if (fileRef.current !== null) fileRef.current.value = "";
      },
    });
  }

  return (
    <FieldSet className="gap-3" data-invalid={passportError !== null}>
      <FieldLegend variant="label" className="mb-0">
        <Trans>Ветпаспорт</Trans>
      </FieldLegend>
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={numberError !== null}>
          <FieldLabel htmlFor={`${id}-passport-number`}>
            <Trans>Номер ветпаспорта</Trans>
          </FieldLabel>
          <Input
            id={`${id}-passport-number`}
            value={draft.passportNumber}
            maxLength={maxPassportNumberLength}
            autoComplete="off"
            spellCheck={false}
            className="tabular-nums"
            aria-invalid={numberError !== null}
            onChange={(event) => set({ passportNumber: event.target.value })}
          />
          <FieldError>{numberError}</FieldError>
        </Field>
        <Field data-invalid={issueDateError !== null}>
          <FieldLabel htmlFor={`${id}-passport-date`}>
            <Trans>Дата выдачи</Trans>
          </FieldLabel>
          <Input
            id={`${id}-passport-date`}
            type="date"
            max={today}
            className="tabular-nums"
            value={draft.passportIssueDate}
            aria-invalid={issueDateError !== null}
            onChange={(event) => set({ passportIssueDate: event.target.value })}
          />
          <FieldError>{issueDateError}</FieldError>
        </Field>
      </div>
      <Field data-invalid={scanError !== null}>
        <FieldLabel htmlFor={`${id}-passport-scan`}>
          <Trans>Скан</Trans>
        </FieldLabel>
        {draft.scan !== null && (
          <div className="flex min-w-0 items-center gap-1 text-sm">
            {draft.scan.url !== null ? (
              <a
                href={draft.scan.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                <Trans>Открыть скан</Trans>
              </a>
            ) : (
              <span className="truncate">{draft.scan.fileName}</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t`Убрать скан`}
              onClick={() => set({ scan: null })}
            >
              <XIcon />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* The browser writes the text of a file input in its own language, so the input stays
              hidden and a button of the form opens it. */}
          <input
            ref={fileRef}
            id={`${id}-passport-scan`}
            type="file"
            accept={scanContentTypes.join(",")}
            className="sr-only"
            tabIndex={-1}
            disabled={upload.isPending}
            aria-invalid={scanError !== null}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {draft.scan === null ? <Trans>Выбрать файл</Trans> : <Trans>Заменить файл</Trans>}
          </Button>
          {upload.isPending && <Spinner aria-label={t`Скан загружается`} />}
        </div>
        <FieldDescription className="text-xs">
          <Trans>PDF или фото: JPEG, PNG, WebP.</Trans>
        </FieldDescription>
        <FieldError>{scanError}</FieldError>
      </Field>
      {/* The error of the Passport says the same, and more. */}
      {!pure && passportError === null && (
        <FieldDescription>
          <Trans>Ветпаспорт может быть только у барана со 100 % арашан.</Trans>
        </FieldDescription>
      )}
      <FieldError>{passportError}</FieldError>
      {hasPassport(draft) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 w-fit text-muted-foreground"
          onClick={() => {
            setFileRefused(false);
            upload.reset();
            set({ passportNumber: "", passportIssueDate: "", scan: null });
          }}
        >
          <Trans>Убрать ветпаспорт</Trans>
        </Button>
      )}
    </FieldSet>
  );
}

const noGrade = "none";
const noGradeLabel = msg({ context: "grade", message: "Нет" });

/** «Класс» and «Дата бонитировки». A Grade that a Member picks was given today, by default. */
export function GradeFields({
  id,
  draft,
  onChange,
  error,
  today,
}: FieldsProps & { today: string }) {
  const { i18n } = useLingui();
  const gradeError = errorFor(error, "grade");
  const items = [
    { value: noGrade, label: i18n._(noGradeLabel) },
    ...grades.map((grade) => ({ value: grade, label: i18n._(gradeLabels[grade]) })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${id}-grade`}>
            <Trans>Класс</Trans>
          </FieldLabel>
          <Select
            items={items}
            value={draft.grade ?? noGrade}
            onValueChange={(value) => {
              const grade = grades.find((option) => option === value) ?? null;
              onChange({
                ...draft,
                grade,
                gradeDate: grade === null ? "" : draft.gradeDate || today,
              });
            }}
          >
            <SelectTrigger id={`${id}-grade`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {draft.grade !== null && (
          <Field data-invalid={gradeError !== null}>
            <FieldLabel htmlFor={`${id}-grade-date`}>
              <Trans>Дата бонитировки</Trans>
            </FieldLabel>
            <Input
              id={`${id}-grade-date`}
              type="date"
              max={today}
              className="tabular-nums"
              value={draft.gradeDate}
              aria-invalid={gradeError !== null}
              onChange={(event) => onChange({ ...draft, gradeDate: event.target.value })}
            />
          </Field>
        )}
      </div>
      <FieldError>{gradeError}</FieldError>
    </div>
  );
}
