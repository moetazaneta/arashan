import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadEnv, type Plugin } from "vite-plus";

// A Vite plugin for the web app: `vp dev` starts `convex dev` for this package, and gives the web app
// the URL of the deployment. `convex dev` pushes the functions on each change, and writes the
// deployment and its URL to packages/backend/.env.local.

const backendDir = import.meta.dirname;
const envFile = join(backendDir, ".env.local");
const convexBin = join(backendDir, "node_modules", ".bin", "convex");

/** How long to wait for a new deployment. The first local one downloads the Convex backend. */
const deploymentTimeoutMs = 5 * 60 * 1000;

let convexDevProcess: ChildProcess | undefined;

function readEnvFile(): Record<string, string> {
  if (!existsSync(envFile)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) env[match[1]] = match[2];
  }
  return env;
}

/** The URL of the deployment that `convex dev` uses, or undefined if it chose none yet. */
function deploymentUrl(): string | undefined {
  const env = readEnvFile();
  return env.VITE_CONVEX_URL ?? env.CONVEX_URL;
}

function startConvexDev() {
  if (convexDevProcess !== undefined) return;
  // Until the Convex project of issue #2 exists, a developer without a configured deployment gets
  // a local one that needs no account. `convex dev --configure` changes it later.
  const anonymous = readEnvFile().CONVEX_DEPLOYMENT === undefined;
  const child = spawn(convexBin, ["dev"], {
    cwd: backendDir,
    env: anonymous ? { ...process.env, CONVEX_AGENT_MODE: "anonymous" } : process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  convexDevProcess = child;
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) if (line.trim() !== "") console.log(`[convex] ${line}`);
    });
  }
  child.on("exit", (code) => {
    if (convexDevProcess === child) convexDevProcess = undefined;
    if (code !== null && code !== 0) console.error(`[convex] convex dev stopped with code ${code}`);
  });
  // SIGINT, as Ctrl+C sends it: on SIGINT, `convex dev` also stops a local backend that it started.
  process.once("exit", () => child.kill("SIGINT"));
}

async function waitForDeploymentUrl(): Promise<string> {
  const deadline = Date.now() + deploymentTimeoutMs;
  for (;;) {
    const url = deploymentUrl();
    if (url !== undefined) return url;
    if (convexDevProcess === undefined)
      throw new Error("convex dev stopped: see its output above.");
    if (Date.now() > deadline) throw new Error("convex dev made no deployment in 5 minutes.");
    await sleep(250);
  }
}

/** Starts `convex dev` with the dev server, and sets `VITE_CONVEX_URL` if the web app has none. */
export function convexDev(): Plugin {
  return {
    name: "arashan:convex-dev",
    // Only for `vp dev`: not for builds, previews, tests or CI.
    apply: (_config, env) =>
      env.command === "serve" &&
      env.isPreview !== true &&
      process.env.VITEST === undefined &&
      process.env.CI === undefined,
    async config(config, env) {
      startConvexDev();
      const root = config.root ?? process.cwd();
      const envDir = typeof config.envDir === "string" ? resolve(root, config.envDir) : root;
      if (loadEnv(env.mode, envDir, "VITE_").VITE_CONVEX_URL !== undefined) return;
      process.env.VITE_CONVEX_URL = await waitForDeploymentUrl();
    },
  };
}
