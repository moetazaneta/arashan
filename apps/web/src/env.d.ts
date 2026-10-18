interface ImportMetaEnv {
  /** The URL of the Convex deployment. `vp dev` sets it for the local deployment. */
  readonly VITE_CONVEX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
