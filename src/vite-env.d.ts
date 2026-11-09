/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://api.example.com. Empty: same origin as the app. */
  readonly VITE_API_ORIGIN?: string
  /** 'true' shows the SI14 Listing quality section. Unset (prod today): hidden. */
  readonly VITE_QUALITY_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
