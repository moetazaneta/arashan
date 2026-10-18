import type { Tokens } from "@arashan/core";

// The tokens of invite links: 32 random bytes from the Web Crypto API of the Convex runtime, in
// base64url, so that a token is safe in a URL. The database keeps only the SHA-256 hash of a token.

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const tokens: Tokens = {
  newToken() {
    return base64url(crypto.getRandomValues(new Uint8Array(32)));
  },
  async hash(token) {
    return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  },
};
