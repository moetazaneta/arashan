import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="grid min-h-svh place-items-center">
      <h1 className="text-2xl font-semibold">Arashan</h1>
    </main>
  );
}
