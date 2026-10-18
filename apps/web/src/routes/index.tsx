import { createFileRoute } from "@tanstack/react-router";

import { AppVersion } from "@/components/app-version";
import { LocaleSwitch } from "@/components/locale-switch";
import { SamplesCard } from "@/components/samples-card";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Arashan</h1>
          <AppVersion />
        </div>
        <LocaleSwitch />
      </header>
      <SamplesCard />
    </main>
  );
}
