import type { ReactNode } from "react";

import { LocaleSwitch } from "@/components/locale-switch";

/** The page for a person who is not in the app yet: the language switch, and the content centered. */
export function BareLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex justify-end p-4">
        <LocaleSwitch />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16">
        {children}
      </main>
    </div>
  );
}
