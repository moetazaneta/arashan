import type { ErrorCode } from "@arashan/core";
import { Trans } from "@lingui/react/macro";
import { ArchiveIcon } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useState,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { type ErrorInfo, formError } from "@/errors";
import { cn } from "@/lib/utils";

// The parts that the pages of Flocks, Locations and Shepherds share, and the pages of Expenses and
// Incomes too: the dense tables, the archive toggle, the empty states and the errors of the forms.

/** An empty value: a muted dash. */
export function NoValue() {
  return <span className="text-muted-foreground">—</span>;
}

/** The mark of an Archived record, next to its name. */
export function ArchivedBadge() {
  return (
    <Badge variant="secondary">
      <Trans>В архиве</Trans>
    </Badge>
  );
}

/** A name, with the mark «В архиве» if the record is Archived. */
export function NameWithState({
  name,
  archived,
  className,
}: {
  name: ReactNode;
  archived: boolean;
  className?: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={className}>{name}</span>
      {archived && <ArchivedBadge />}
    </span>
  );
}

/** The names of records, such as the Flocks of a Shepherd, or a dash if there are none. */
export function Names({ refs }: { refs: readonly { id: string; name: string }[] }) {
  if (refs.length === 0) return <NoValue />;
  return <>{refs.map((ref) => ref.name).join(", ")}</>;
}

/** A text that can be long, such as notes, on one line. */
export function ShortText({ text }: { text: string | null }) {
  if (text === null) return <NoValue />;
  return (
    <span title={text} className="block max-w-64 truncate">
      {text}
    </span>
  );
}

/** The toggle that shows the Archived records too. */
export function ArchiveToggle({
  pressed,
  onPressedChange,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <Toggle variant="outline" pressed={pressed} onPressedChange={onPressedChange}>
      <ArchiveIcon data-icon="inline-start" />
      <Trans>Показать архив</Trans>
    </Toggle>
  );
}

/** The row above a list: the archive toggle on the left, the action on the right. */
export function ListToolbar({ start, end }: { start: ReactNode; end: ReactNode }) {
  if (!start && !end) return null;
  return (
    <div className="flex items-center gap-2">
      {start}
      <div className="ml-auto flex items-center gap-2">{end}</div>
    </div>
  );
}

/** A one-line empty state: what goes here, and the action that adds it. */
export function EmptyList({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <Empty className="border py-8">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** An error of a list or a form, in a red box. */
export function ErrorAlert({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** The message of the error if its code is one of the codes of a field, or null. */
export function fieldMessage(error: ErrorInfo | null, codes: readonly ErrorCode[]): string | null {
  return error !== null && error.code !== null && codes.includes(error.code) ? error.message : null;
}

/** The error that no field of the form shows, in a red box. */
export function FormAlert({
  error,
  fieldCodes,
}: {
  error: ErrorInfo | null;
  fieldCodes: readonly ErrorCode[];
}) {
  return <ErrorAlert message={formError(error, fieldCodes)?.message ?? null} />;
}

// The tables: dense rows of 36px, small labels in the header, tabular figures.

export const tableClass = "text-[13px] tabular-nums";

export function HeadCell({ children, numeric }: { children?: ReactNode; numeric?: boolean }) {
  return (
    <TableHead
      className={cn("h-9 px-2 text-xs text-muted-foreground", numeric === true && "text-right")}
    >
      {children}
    </TableHead>
  );
}

export function DataCell({
  children,
  numeric,
  className,
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <TableCell
      colSpan={colSpan}
      className={cn("h-9 px-2 py-0", numeric === true && "text-right", className)}
    >
      {children}
    </TableCell>
  );
}

/** Rows of skeletons while a table loads. */
export function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {["1", "2", "3"].map((key) => (
        <TableRow key={key} className="h-9 hover:bg-transparent">
          {Array.from({ length: columns }, (_, index) => (
            <TableCell key={index} className="px-2 py-0">
              <Skeleton className="h-3.5 w-20" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// `outline-hidden` keeps the style of the outline, so that the ring of the keyboard focus shows.
const openableRowClass =
  "h-9 cursor-pointer outline-hidden focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Whether a click went to a control of the row, such as a link, which acts on its own. */
function onControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest("a, button, input, textarea") !== null;
}

/**
 * The rows of a table that open a record: a click or `Enter` on a row opens it. The arrows move
 * between the rows, `Home` and `End` go to the first and the last one. Only one row is in the tab
 * order: the one that had the focus last.
 */
export function useOpenableRows<Id extends string>(ids: readonly Id[], onOpen: (id: Id) => void) {
  const [focusedId, setFocusedId] = useState<Id | null>(null);
  const activeId = focusedId !== null && ids.includes(focusedId) ? focusedId : (ids[0] ?? null);

  function idOf(target: EventTarget): Id | null {
    if (!(target instanceof Element)) return null;
    const id = target.closest<HTMLElement>("tr[data-row-id]")?.dataset.rowId;
    return ids.find((one) => one === id) ?? null;
  }

  const bodyProps = {
    onKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
      const row = event.target;
      if (!(row instanceof HTMLTableRowElement)) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const id = idOf(row);
      if (id === null) return;
      const index = ids.indexOf(id);
      let next: number;
      switch (event.key) {
        case "Enter":
          event.preventDefault();
          onOpen(id);
          return;
        case "ArrowDown":
          next = index + 1;
          break;
        case "ArrowUp":
          next = index - 1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = ids.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const rows = event.currentTarget.querySelectorAll<HTMLElement>("tr[data-row-id]");
      rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    },
    onFocus(event: FocusEvent<HTMLTableSectionElement>) {
      const id = idOf(event.target);
      if (id !== null) setFocusedId(id);
    },
    onClick(event: MouseEvent<HTMLTableSectionElement>) {
      if (onControl(event.target)) return;
      const id = idOf(event.target);
      if (id !== null) onOpen(id);
    },
  };

  const rowProps = (id: Id) => ({
    "data-row-id": id,
    tabIndex: id === activeId ? 0 : -1,
    className: openableRowClass,
  });

  return { bodyProps, rowProps };
}

/** A row that a click opens, as a link in it does: for a mouse, the whole row is the link. */
export function linkRowProps(onOpen: () => void) {
  return {
    className: "h-9 cursor-pointer",
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if (!onControl(event.target)) onOpen();
    },
  };
}

/**
 * A date field: a calendar date "YYYY-MM-DD", not after `max`. An optional field can be empty, and
 * its description says what an empty date means.
 */
export function DateField({
  id,
  label,
  value,
  max,
  disabled = false,
  error,
  description,
  onChange,
}: {
  id: string;
  label: ReactNode;
  value: string;
  max: string;
  disabled?: boolean;
  /** The message under the field, or null. `true` marks the field red with no message of its own. */
  error: string | boolean | null;
  description?: ReactNode;
  onChange: (value: string) => void;
}) {
  const invalid = error !== null && error !== false;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="date"
        max={max}
        disabled={disabled}
        className="w-44 tabular-nums"
        value={value}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
      {description !== undefined && <FieldDescription>{description}</FieldDescription>}
      {typeof error === "string" && <FieldError>{error}</FieldError>}
    </Field>
  );
}
