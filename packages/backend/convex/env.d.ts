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
