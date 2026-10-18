interface ImportMetaEnv {
  /** The URL of the Convex deployment. `vp dev` sets it for the local deployment. */
  readonly VITE_CONVEX_URL?: string;
  /** The publishable key of the Clerk instance: see docs/environment.md. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
