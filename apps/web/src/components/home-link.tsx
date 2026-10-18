import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button";

/** A link to `/`, which opens the Farm of the User, for a page that has nothing to show. */
export function HomeLink() {
  return (
    <Link to="/" className={buttonVariants({ variant: "outline" })}>
      <Trans>На главную</Trans>
    </Link>
  );
}
