/** The editor and preview run on a distinct origin so script and same-origin
 * sandbox permissions cannot give them access to the application window. */
const configuredOrigin = (value: string | undefined, name: string) => {
  if(!value) return null
  const url = new URL(value)
  if(!["http:", "https:"].includes(url.protocol) || url.href !== `${url.origin}/`) {
    throw new Error(`${name} must be an HTTP(S) origin without a path`)
  }
  return url.origin
}

const pairedLoopbackOrigin = (location: Pick<Location, "protocol" | "hostname" | "port">) => {
  const hostname = location.hostname === "localhost" ? "127.0.0.1"
    : location.hostname === "127.0.0.1" ? "localhost" : null
  return hostname ? `${location.protocol}//${hostname}${location.port ? `:${location.port}` : ""}` : null
}

export function editorFrameOrigin(location: Location = window.location) {
  const origin = configuredOrigin(import.meta.env.VITE_EDITOR_ORIGIN, "VITE_EDITOR_ORIGIN")
    ?? pairedLoopbackOrigin(location)
  if(!origin || origin === location.origin) throw new Error("Configure VITE_EDITOR_ORIGIN as a separate origin for editor frames")
  return origin
}

export function editorHostOrigin(location: Location = window.location) {
  const origin = configuredOrigin(import.meta.env.VITE_APP_ORIGIN, "VITE_APP_ORIGIN")
    ?? pairedLoopbackOrigin(location)
  if(!origin || origin === location.origin) throw new Error("Configure VITE_APP_ORIGIN as the application origin for editor frames")
  return origin
}
