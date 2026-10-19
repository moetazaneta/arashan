import { useLambings } from "@arashan/client";
import type { Farm, LambingRow, SheepId } from "@arashan/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Fragment, useId } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useErrorMessage } from "@/errors";
import { formatCalendarDate } from "@/format";

import { SheepLink } from "./sheep-ref";

/**
 * The section «Окоты» of the card of an Ewe: her Lambings, the newest first, each on one line. The
 * section is hidden while she has none.
 */
export function LambingsSection({ farm, motherId }: { farm: Farm; motherId: SheepId }) {
  const lambings = useLambings(farm.id, motherId);
  const error = useErrorMessage(lambings.error);
  const headingId = useId();

  if (error === null && (lambings.data === undefined || lambings.data.length === 0)) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        <Trans>Окоты</Trans>
      </h2>
      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <ol className="flex flex-col gap-1.5 text-sm tabular-nums">
          {lambings.data?.map((lambing) => (
            <LambingItem key={lambing.id} farm={farm} lambing={lambing} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** «12.10.2026 — 2 ягнёнка: 101, 102 · отец: 7 Алтын · мертворождённых: 1». */
function LambingItem({ farm, lambing }: { farm: Farm; lambing: LambingRow }) {
  const { i18n } = useLingui();
  const count = lambing.lambs.length;
  const stillborn = lambing.stillborn;

  return (
    <li>
      <span className="font-medium">{formatCalendarDate(lambing.date, i18n.locale)}</span>
      {" — "}
      <Plural value={count} one="# ягнёнок" few="# ягнёнка" many="# ягнят" other="# ягнёнка" />
      {count > 0 && ": "}
      {lambing.lambs.map((lamb, index) => (
        <Fragment key={lamb.id}>
          {index > 0 && ", "}
          <SheepLink farmId={farm.id} sheep={lamb} />
        </Fragment>
      ))}
      <span className="text-muted-foreground">{" · "}</span>
      {lambing.father === null ? (
        <span className="text-muted-foreground">
          <Trans>отец неизвестен</Trans>
        </span>
      ) : (
        <>
          <Trans>отец:</Trans> <SheepLink farmId={farm.id} sheep={lambing.father} />
        </>
      )}
      {stillborn > 0 && (
        <>
          <span className="text-muted-foreground">{" · "}</span>
          <Trans>мертворождённых: {stillborn}</Trans>
        </>
      )}
    </li>
  );
}
