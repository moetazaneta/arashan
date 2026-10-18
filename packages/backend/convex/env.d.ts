// The parts of the Convex runtime that this code uses and the tsconfig does not type: it has no DOM
// and no Node.js libraries, because the runtime is neither.

/** The environment variables of the deployment (`convex env set`). */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
  readonly subtle: { digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer> };
};

declare class TextEncoder {
  encode(input: string): Uint8Array;
}

declare function btoa(data: string): string;

/** The Fetch API of the runtime, as the call to the Clerk Backend API uses it. */
declare function fetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

declare class AbortSignal {}

declare class AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}

declare function setTimeout(callback: () => void, ms: number): number;
declare function clearTimeout(id: number): void;
