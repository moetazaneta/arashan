import { useAppVersion } from "@arashan/client";
import { Trans } from "@lingui/react/macro";

/** The version of the app, from the backend. */
export function AppVersion() {
  const { data: version } = useAppVersion();
  if (version === undefined) return null;

  return (
    <p className="text-sm text-muted-foreground">
      <Trans>Версия {version}</Trans>
    </p>
  );
}
