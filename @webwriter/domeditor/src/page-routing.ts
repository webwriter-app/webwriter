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

/** Build a clean learner entry URL on the dedicated document origin. */
export function liveLearnerURL(value: string | URL, documentOrigin: string, basePath = "/", serverUrl?: string) {
  const source = new URL(value)
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`
  const target = new URL(`${base}live/`, `${new URL(documentOrigin).origin}/`)
  for(const key of ["liveSession", "liveToken", "liveServer"]) {
    const parameter = serverUrl && key === "liveServer" ? serverUrl : source.searchParams.get(key)
    if(parameter !== null && parameter !== undefined) target.searchParams.set(key, parameter)
  }
  target.hash = source.hash
  return target
}
