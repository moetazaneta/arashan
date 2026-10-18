import { arashanShare, pedigreeDepth, useSheepPedigree } from "@arashan/client";
import type { Farm, PedigreeNode, Sex, SheepId } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId } from "react";

import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useErrorMessage } from "@/errors";
import { formatShare } from "@/format";
import { cn } from "@/lib/utils";

import { sexLabels } from "./labels";
import { useSheepTag } from "./sheep-ref";

// The tab «Родословная»: the Sheep and its ancestors in four columns, from the Sheep on the left to
// its great-grandparents on the right. Each ancestor sits in the middle of the rows of its child, so
// the columns read as a tree. In each pair the Mother is above the Father, as in the form and the
// card.

/** One place of the tree: an ancestor, a parent that nobody knows, or nothing above an unknown one. */
type Slot =
  | { kind: "node"; node: PedigreeNode }
  | { kind: "unknown"; sex: Sex }
  | { kind: "empty" };

/** The rows of the tree: one for each ancestor of the last generation. */
const rows = 2 ** pedigreeDepth;

/** The title of the column of each generation, from the Sheep itself. */
const generationLabels: MessageDescriptor[] = [
  msg({ context: "pedigree", message: "Баран" }),
  msg`Родители`,
  msg`Деды`,
  msg`Прадеды`,
];

/** The places of each generation, from the Sheep: 1, 2, 4 and 8 of them. */
function generations(root: PedigreeNode): Slot[][] {
  const all: Slot[][] = [[{ kind: "node", node: root }]];
  for (let generation = 1; generation <= pedigreeDepth; generation += 1) {
    const children = all[generation - 1] ?? [];
    all.push(
      children.flatMap((child): Slot[] => {
        if (child.kind !== "node") return [{ kind: "empty" }, { kind: "empty" }];
        return [parentSlot(child.node.mother, "ewe"), parentSlot(child.node.father, "ram")];
      }),
    );
  }
  return all;
}

function parentSlot(parent: PedigreeNode | null | undefined, sex: Sex): Slot {
  if (parent === undefined) return { kind: "empty" };
  if (parent === null) return { kind: "unknown", sex };
  return { kind: "node", node: parent };
}

/** The pedigree tree of a Sheep, for `pedigreeDepth` generations of ancestors. */
export function PedigreeTree({ farm, sheepId }: { farm: Farm; sheepId: SheepId }) {
  const pedigree = useSheepPedigree(farm.id, sheepId);
  const error = useErrorMessage(pedigree.error);

  if (error !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (pedigree.data === undefined) return <Loading />;
  if (pedigree.data === null) return null;

  return (
    <div
      className="grid grid-cols-4 gap-x-6 gap-y-2"
      style={{ gridTemplateRows: `auto repeat(${rows}, minmax(3.25rem, auto))` }}
    >
      {generations(pedigree.data).map((slots, generation) => (
        <Generation
          key={generation}
          farm={farm}
          label={generationLabels[generation]}
          slots={slots}
          root={generation === 0}
        />
      ))}
    </div>
  );
}

/** One column: a list of the ancestors of one generation, each in the rows of its child. */
function Generation({
  farm,
  label,
  slots,
  root,
}: {
  farm: Farm;
  label: MessageDescriptor | undefined;
  slots: Slot[];
  root: boolean;
}) {
  const { i18n } = useLingui();
  const headingId = useId();
  const span = rows / slots.length;

  return (
    <section aria-labelledby={headingId} className="row-span-full grid grid-rows-subgrid">
      <h2 id={headingId} className="text-xs font-medium text-muted-foreground">
        {label === undefined ? null : i18n._(label)}
      </h2>
      <ol className="row-[2/-1] grid grid-rows-subgrid">
        {slots.map((slot, index) =>
          slot.kind === "empty" ? null : (
            <li
              // The places of a generation never move, so the index is a stable key.
              key={index}
              className="flex min-w-0 items-center"
              style={{ gridRow: `${index * span + 1} / span ${span}` }}
            >
              {slot.kind === "node" ? (
                <NodeBox farm={farm} node={slot.node} root={root} />
              ) : (
                <UnknownBox sex={slot.sex} />
              )}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

const boxClass = "flex w-full min-w-0 flex-col gap-0.5 rounded-md border px-3 py-2 text-[13px]";

/**
 * A Sheep of the tree: the Tag, the name, the sex and the part of Arashan. An ancestor links to its
 * card; the Sheep itself is the open card.
 */
function NodeBox({ farm, node, root }: { farm: Farm; node: PedigreeNode; root: boolean }) {
  const { i18n } = useLingui();
  const tag = useSheepTag();
  const share = formatShare(arashanShare(node.composition), i18n.locale);
  const content = (
    <>
      <span className="truncate tabular-nums">
        <span className="font-medium">{tag(node)}</span>
        {node.name !== null && (
          <>
            {" "}
            <span className="text-muted-foreground">{node.name}</span>
          </>
        )}
      </span>
      {/* The space parts the two lines in the name of the link. */}{" "}
      <span className="truncate text-xs text-muted-foreground tabular-nums">
        {i18n._(sexLabels[node.sex])}
        {node.origin === "external" && (
          <>
            {" · "}
            <Trans>внешний</Trans>
          </>
        )}
        {" · "}
        <Trans>арашан {share}</Trans>
      </span>
    </>
  );

  if (root) return <div className={cn(boxClass, "border-input")}>{content}</div>;
  return (
    <Link
      to="/farms/$farmId/sheep/$sheepId"
      params={{ farmId: farm.id, sheepId: node.id }}
      className={cn(
        boxClass,
        "outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {content}
    </Link>
  );
}

/** A parent that nobody knows: a muted box with a dashed border. */
function UnknownBox({ sex }: { sex: Sex }) {
  return (
    <div className={cn(boxClass, "border-dashed text-muted-foreground")}>
      {sex === "ewe" ? <Trans>неизвестна</Trans> : <Trans>неизвестен</Trans>}
    </div>
  );
}
