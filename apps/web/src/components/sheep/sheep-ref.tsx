import type { FarmId, SheepRef } from "@arashan/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/** The Tag of a Sheep, or «без бирки» when it has none. */
export function useSheepTag(): (sheep: Pick<SheepRef, "tag">) => string {
  const { t } = useLingui();
  return (sheep) => sheep.tag ?? t`без бирки`;
}

/**
 * A link to the card of a Sheep, such as a parent or a child: the Tag (or «без бирки») and the name,
 * and a quiet «внешний» for an External Sheep.
 */
export function SheepLink({
  farmId,
  sheep,
  className,
}: {
  farmId: FarmId;
  sheep: SheepRef;
  className?: string;
}) {
  const tag = useSheepTag();

  return (
    <span className={cn("tabular-nums", className)}>
      <Link
        to="/farms/$farmId/sheep/$sheepId"
        params={{ farmId, sheepId: sheep.id }}
        className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
      >
        {tag(sheep)}
        {sheep.name !== null && ` ${sheep.name}`}
      </Link>
      {sheep.origin === "external" && (
        <span className="text-muted-foreground">
          {" · "}
          <Trans>внешний</Trans>
        </span>
      )}
    </span>
  );
}
