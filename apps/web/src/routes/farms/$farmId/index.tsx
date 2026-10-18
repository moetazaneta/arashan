import type { FarmId } from "@arashan/core";
import { useFarm } from "@arashan/client";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, Link } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { currencyLabel, timeZoneOffset } from "@/format";
import { useRole } from "@/viewer";

export const Route = createFileRoute("/farms/$farmId/")({
  component: FarmPage,
});

/** The Farm: its name and its settings. */
function FarmPage() {
  const { i18n } = useLingui();
  const farmId = Route.useParams().farmId as FarmId;
  // The layout shows this page only after the Farm loaded.
  const farm = useFarm(farmId).data;
  const role = useRole(farmId);
  if (farm === undefined) return null;

  const offset = timeZoneOffset(farm.timeZone, i18n.locale);
  const { lambAgeMonths } = farm;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{farm.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Настройки фермы</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>По ним приложение считает деньги, даты и возраст.</Trans>
          </CardDescription>
          {role === "admin" && (
            <CardAction>
              <Link
                to="/farms/$farmId/settings"
                params={{ farmId }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Trans>Изменить настройки</Trans>
              </Link>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-3 text-sm">
            <dt className="text-muted-foreground">
              <Trans>Валюта</Trans>
            </dt>
            <dd>{currencyLabel(farm.currency, i18n.locale)}</dd>
            <dt className="text-muted-foreground">
              <Trans>Часовой пояс</Trans>
            </dt>
            <dd>{offset === "" ? farm.timeZone : `${farm.timeZone} (${offset})`}</dd>
            <dt className="text-muted-foreground">
              <Trans>Возраст ягнёнка</Trans>
            </dt>
            <dd>
              <Plural
                value={lambAgeMonths}
                one="младше # месяца"
                few="младше # месяцев"
                many="младше # месяцев"
                other="младше # месяца"
              />
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
