/** Published npm files: jsDelivr as the canonical CDN, and mirrors serving the same files.
 * Free of DOM dependencies so the frame service worker can use it. */

export const NPM_REGISTRY_ENDPOINT = "https://registry.npmjs.org"
export const JSDELIVR_NPM_ENDPOINT = "https://cdn.jsdelivr.net/npm"
export const JSDELIVR_DATA_ENDPOINT = "https://data.jsdelivr.com/v1"
/** Hosts serving the same published npm files as jsDelivr under `<host>/<name>@<version>/<path>`,
 * tried in order when jsDelivr fails: independent services first, then jsDelivr on other networks. */
export const NPM_FILE_MIRRORS = [
  "https://unpkg.com",
  "https://gcore.jsdelivr.net/npm",
  "https://raw.esm.sh",
  "https://fastly.jsdelivr.net/npm",
] as const
/** How long a CDN may take to answer before the next mirror is tried. */
export const NPM_FILE_TIMEOUT_MS = 8_000

/** The same npm file on each mirror, for a jsDelivr npm URL. */
export function npmMirrorUrls(url: string) {
  const prefix = `${JSDELIVR_NPM_ENDPOINT}/`
  return url.startsWith(prefix) ? NPM_FILE_MIRRORS.map(mirror => `${mirror}/${url.slice(prefix.length)}`) : []
}

/** Maps a mirror URL back to jsDelivr, so resolved maps keep one address per file. */
export function canonicalNpmUrl(url: string) {
  for(const mirror of NPM_FILE_MIRRORS) {
    if(url.startsWith(`${mirror}/`)) return `${JSDELIVR_NPM_ENDPOINT}/${url.slice(mirror.length + 1)}`
  }
  return url
}

export async function fetchWithin(fetcher: typeof fetch, url: string, init: RequestInit, timeout: number) {
  const controller = new AbortController()
  const outer = init.signal
  if(outer?.aborted) controller.abort(outer.reason)
  outer?.addEventListener("abort", () => controller.abort(outer.reason), {once: true})
  // Only the wait for the response headers is bounded; the body may take longer.
  const timer = setTimeout(() => controller.abort(new DOMException("The CDN did not answer in time", "TimeoutError")), timeout)
  try { return await fetcher(url, {...init, signal: controller.signal}) }
  finally { clearTimeout(timer) }
}

/** Fetches a file, retrying jsDelivr npm files on the mirrors when jsDelivr fails, throttles or stalls.
 * A mirror's response is rebuilt without its own URL, so a module fetched this way keeps the requested
 * jsDelivr URL, and with it its import-map scope and relative imports. */
export async function fetchNpmFile(url: string, init: RequestInit = {}, fetcher: typeof fetch = globalThis.fetch.bind(globalThis), timeout = NPM_FILE_TIMEOUT_MS) {
  const mirrors = npmMirrorUrls(url)
  if(!mirrors.length) return fetcher(url, init)
  const retryable = (response: Response) => response.status >= 500 || response.status === 429 || response.status === 403
  let primary: Response | undefined
  let failure: unknown
  try {
    primary = await fetchWithin(fetcher, url, init, timeout)
    if(!retryable(primary)) return primary
  }
  catch(error) {
    if(init.signal?.aborted) throw error
    failure = error
  }
  for(const mirror of mirrors) {
    try {
      const response = await fetchWithin(fetcher, mirror, {...init, mode: "cors", credentials: "omit"}, timeout)
      if(response.ok) return new Response(response.body, {status: response.status, statusText: response.statusText, headers: response.headers})
    }
    catch(error) {
      if(init.signal?.aborted) throw error
    }
  }
  if(primary) return primary
  throw failure
}
