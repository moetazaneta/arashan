import { useLingui } from "@lingui/react/macro";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** A spinner in the middle of the space it has, while data loads. */
export function Loading({ className }: { className?: string }) {
  const { t } = useLingui();

  return (
    <div className={cn("flex flex-1 items-center justify-center p-12", className)}>
      <Spinner className="size-6 text-muted-foreground" aria-label={t`Загрузка`} />
    </div>
  );
}
