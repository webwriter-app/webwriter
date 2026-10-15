const legacyEditorParameters = ["open", "session", "liveSession", "liveToken", "share", "source"]

/** Redirect legacy root document links to the editor page. */
export function legacyEditorURL(value: string | URL): URL | null {
  let url
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value, "http://localhost/")
  }
  catch { return null }

  if(url.pathname !== "/" && url.pathname !== "/index.html") return null
  if(!legacyEditorParameters.some(parameter => url.searchParams.has(parameter))) return null

  url.pathname = "/editor/"
  return url
}
