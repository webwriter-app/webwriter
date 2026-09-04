/**
 * The protocol-independent part of the local-package service worker.
 *
 * Keeping request routing separate from the worker global makes this code
 * straightforward to exercise in Vitest and prevents importing the worker
 * entry from installing listeners in the application window.
 */

export function localPackageRoutePrefix(configuredBase: string, runtimeBases: Array<string | undefined>) {
  let httpBase = "http://localhost/"
  for(const candidate of [...runtimeBases, httpBase]) {
    try {
      const url = new URL(candidate!)
      if(url.protocol === "http:" || url.protocol === "https:") {
        httpBase = url.href
        break
      }
    }
    catch {
      // `about:srcdoc` is not a valid base for resolving an absolute app path.
    }
  }
  const basePath = new URL(configuredBase || "/", httpBase).pathname.replace(/\/?$/, "/")
  return `${basePath}__webwriter/local-packages/`
}

const documentBase = (globalThis as typeof globalThis & {document?: {baseURI?: string}}).document?.baseURI

export const LOCAL_PACKAGE_ROUTE_PREFIX = localPackageRoutePrefix(
  import.meta.env.BASE_URL,
  [documentBase, globalThis.location?.href],
)

export type LocalPackageDirectoryHandle = {
  readonly kind?: string
  getDirectoryHandle(name: string): Promise<LocalPackageDirectoryHandle>
  getFileHandle(name: string): Promise<LocalPackageFileHandle>
  queryPermission?(descriptor?: {mode?: "read" | "readwrite"}): Promise<PermissionState>
  requestPermission?(descriptor?: {mode?: "read" | "readwrite"}): Promise<PermissionState>
}

export type LocalPackageFileHandle = {
  readonly kind?: string
  getFile(): Promise<Blob & {readonly name?: string, readonly lastModified?: number, readonly type?: string}>
}

export type LocalPackageRoute = {
  id: string
  path: string
}

export type ParsedLocalPackageRoute =
  | {kind: "route", route: LocalPackageRoute}
  | {kind: "invalid", message: string}

/** Builds a same-origin URL which can be resolved by the local package worker. */
export function localPackageUrl(
  id: string,
  path: string,
  revision?: string | number,
  origin = globalThis.location?.origin || "http://localhost",
) {
  const normalizedPath = path.replace(/^\.\//, "")
  const segments = normalizedPath.split("/").filter(Boolean)
  if(!id || !segments.length || segments.some(segment => segment === "." || segment === ".." || segment.includes("\\"))) {
    throw new TypeError("Invalid local package resource path")
  }
  const url = new URL(
    `${LOCAL_PACKAGE_ROUTE_PREFIX}${encodeURIComponent(id)}/${segments.map(encodeURIComponent).join("/")}`,
    origin,
  )
  if(revision !== undefined) url.searchParams.set("revision", String(revision))
  return url.href
}

/**
 * Parses only the reserved local-package route. A null result means that a
 * request belongs to the normal network/application pipeline and should be
 * passed through by the service worker.
 */
export function parseLocalPackageRoute(input: Request | URL | string): ParsedLocalPackageRoute | null {
  const url = input instanceof Request
    ? new URL(input.url)
    : input instanceof URL
      ? input
      : new URL(input, globalThis.location?.origin || "http://localhost")
  const ownOrigin = globalThis.location?.origin
  if(ownOrigin && url.origin !== ownOrigin) return null
  if(!url.pathname.startsWith(LOCAL_PACKAGE_ROUTE_PREFIX)) return null

  const tail = url.pathname.slice(LOCAL_PACKAGE_ROUTE_PREFIX.length)
  const encodedSegments = tail.split("/")
  if(encodedSegments.length < 2 || encodedSegments.some(segment => !segment)) {
    return {kind: "invalid", message: "A local package resource must include a package id and file path"}
  }

  let segments: string[]
  try {
    segments = encodedSegments.map(segment => decodeURIComponent(segment))
  }
  catch {
    return {kind: "invalid", message: "The local package resource URL is not validly encoded"}
  }

  if(segments.some(segment => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return {kind: "invalid", message: "Path traversal is not allowed for local package resources"}
  }
  return {
    kind: "route",
    route: {id: segments[0], path: segments.slice(1).join("/")},
  }
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

export function localPackageMimeType(path: string, fileType = "") {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase()
  return MIME_TYPES[extension] ?? (fileType || "application/octet-stream")
}

function permissionError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "NotAllowedError" || error.name === "SecurityError"
    : isNamedError(error, "NotAllowedError") || isNamedError(error, "SecurityError")
}

function missingError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "NotFoundError"
    : isNamedError(error, "NotFoundError")
}

function isNamedError(error: unknown, name: string): error is {name: string} {
  if(!error || typeof error !== "object") return false
  return "name" in error && (error as {name?: unknown}).name === name
}

async function getFileHandle(root: LocalPackageDirectoryHandle, path: string) {
  const segments = path.split("/")
  let directory = root
  for(const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment)
  return directory.getFileHandle(segments.at(-1)!)
}

export type LocalPackageRequestHandler = (request: Request) => Promise<Response | null>

/**
 * Returns a response promise only for the worker's reserved URL namespace.
 * A synchronous null lets a service-worker fetch listener avoid calling
 * `respondWith()`, so unrelated requests remain entirely in the browser's
 * normal network pipeline.
 */
export function localPackageFetchResponse(
  request: Request,
  requestHandler: LocalPackageRequestHandler,
): Promise<Response> | null {
  if(!parseLocalPackageRoute(request)) return null
  return requestHandler(request).then(response => response ?? new Response(
    "Local package request was not handled",
    {status: 500, headers: {"Content-Type": "text/plain; charset=utf-8"}},
  ))
}

/**
 * Creates the fetch handler used by the worker. Null means unrelated request;
 * callers should leave the request in the browser's normal network pipeline.
 */
export function createLocalPackageRequestHandler(
  roots: ReadonlyMap<string, LocalPackageDirectoryHandle>,
): LocalPackageRequestHandler {
  return async request => {
    const parsed = parseLocalPackageRoute(request)
    if(!parsed) return null
    if(parsed.kind === "invalid") {
      return new Response(parsed.message, {
        status: 400,
        headers: {"Content-Type": "text/plain; charset=utf-8"},
      })
    }
    if(request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: {Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8"},
      })
    }

    const root = roots.get(parsed.route.id)
    if(!root) {
      return new Response("Local package is not registered", {
        status: 404,
        headers: {"Content-Type": "text/plain; charset=utf-8"},
      })
    }

    let file: Blob & {readonly name?: string, readonly lastModified?: number, readonly type?: string}
    try {
      const handle = await getFileHandle(root, parsed.route.path)
      file = await handle.getFile()
    }
    catch(error) {
      const status = permissionError(error) ? 403 : missingError(error) ? 404 : 500
      const message = status === 403
        ? "Permission to the local package was denied"
        : status === 404
          ? "Local package resource was not found"
          : "Could not read local package resource"
      return new Response(message, {
        status,
        headers: {"Content-Type": "text/plain; charset=utf-8"},
      })
    }

    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": localPackageMimeType(parsed.route.path, file.type),
      "X-Content-Type-Options": "nosniff",
    }
    return new Response(request.method === "HEAD" ? null : file, {status: 200, headers})
  }
}
