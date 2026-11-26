/** Deployment settings the server provides when the container starts (`/runtime-config.js`,
 * written by Caddy from APP_ORIGIN, EDITOR_ORIGIN and EDUMIX_URL). One image can then serve
 * several environments side by side. Empty values fall back to the build-time VITE_* variables. */
export type RuntimeConfig = {appOrigin?: string, editorOrigin?: string, edumixURL?: string}

declare global {
  // eslint-disable-next-line no-var
  var webwriterRuntimeConfig: RuntimeConfig | undefined
}

export function runtimeSetting(name: keyof RuntimeConfig, buildValue?: string) {
  return globalThis.webwriterRuntimeConfig?.[name] || buildValue || undefined
}
