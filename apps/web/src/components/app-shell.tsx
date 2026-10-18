import { useSignOut } from "@arashan/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppVersion } from "@/components/app-version";
import { LocaleSwitch } from "@/components/locale-switch";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useViewer } from "@/viewer";

/** The frame of the app for a User who is logged in: the header with the navigation, and the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const viewer = useViewer();
  const signOut = useSignOut();
  // The Farm of the page, if the page is one of a Farm of the User.
  const { farmId } = useParams({ strict: false });
  const farm = viewer.farms.find((farm) => farm.id === farmId);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-6">
          <Link to="/" className="font-semibold">
            Arashan
          </Link>
          <FarmSwitcher currentFarmId={farm?.id ?? null} />
          <nav aria-label={t`Разделы`} className="flex items-center gap-1">
            {farm !== undefined && (
              <Link
                to="/farms/$farmId"
                params={{ farmId: farm.id }}
                activeOptions={{ exact: true }}
                className={navLink}
              >
                <Trans>Ферма</Trans>
              </Link>
            )}
            {farm !== undefined && (
              <Link to="/farms/$farmId/sheep" params={{ farmId: farm.id }} className={navLink}>
                <Trans>Бараны</Trans>
              </Link>
            )}
            {farm !== undefined && (
              <Link to="/farms/$farmId/breeds" params={{ farmId: farm.id }} className={navLink}>
                <Trans>Породы</Trans>
              </Link>
            )}
            {farm !== undefined && (
              <Link to="/farms/$farmId/flocks" params={{ farmId: farm.id }} className={navLink}>
                <Trans>Стада</Trans>
              </Link>
            )}
            {farm?.role === "admin" && (
              <>
                <Link to="/farms/$farmId/members" params={{ farmId: farm.id }} className={navLink}>
                  <Trans>Участники</Trans>
                </Link>
                <Link to="/farms/$farmId/settings" params={{ farmId: farm.id }} className={navLink}>
                  <Trans>Настройки</Trans>
                </Link>
              </>
            )}
            {viewer.user.isOperator && (
              <Link to="/operator/farms" className={navLink}>
                <Trans>Фермы</Trans>
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LocaleSwitch />
            <span className="max-w-40 truncate text-sm text-muted-foreground">
              {viewer.user.username}
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <Trans>Выйти</Trans>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-6 pb-4">
        <AppVersion />
      </footer>
    </div>
  );
}

// A link of the header looks like a ghost button; the link of the page that is open looks pressed.
const navLink = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "aria-[current=page]:bg-muted",
);

/**
 * The Farm of the User that is open. A User with one Farm sees its name; a User with more selects
 * another Farm here.
 */
function FarmSwitcher({ currentFarmId }: { currentFarmId: string | null }) {
  const { t } = useLingui();
  const viewer = useViewer();
  const navigate = useNavigate();

  const [firstFarm] = viewer.farms;
  if (firstFarm === undefined) return null;
  if (viewer.farms.length === 1) {
    return (
      <Link
        to="/farms/$farmId"
        params={{ farmId: firstFarm.id }}
        className="max-w-48 truncate text-sm font-medium"
      >
        {firstFarm.name}
      </Link>
    );
  }

  const items = viewer.farms.map((farm) => ({ value: farm.id as string, label: farm.name }));
  return (
    <Select
      items={items}
      value={currentFarmId}
      onValueChange={(farmId) => {
        if (farmId !== null) void navigate({ to: "/farms/$farmId", params: { farmId } });
      }}
    >
      <SelectTrigger aria-label={t`Ферма`} className="w-48">
        <SelectValue placeholder={t`Выберите ферму`} />
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
  );
}
