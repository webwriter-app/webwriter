import type {AIProviderConfig} from "./ai-provider"
import {cloudServiceURL, cloudServiceExpired, tokenExpiresAt, type CloudService} from "./cloud-services"

export type BackendSession = {
  kind: "webwriter-dev-server" | "webwriter-cloud-service"
  version: 1
  authentication: "none" | "bearer"
  signInUrl?: string
  user: {id: string, name: string}
  apiBaseUrl: string
  collaborationUrl: string
  adminUrl: string
  capabilities: string[]
}

export type BackendDocumentSummary = {
  id: string
  title: string
  format: "html" | "offline"
  createdAt: string
  updatedAt: string
}

export type BackendDocument = BackendDocumentSummary & {
  content: string
}

type ProviderCollection = {
  providers: AIProviderConfig[]
  activeProviderId: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const errorText = (value: unknown, fallback: string) => {
  if(!isRecord(value)) return fallback
  if(typeof value.message === "string") return value.message
  if(isRecord(value.error) && typeof value.error.message === "string") return value.error.message
  return fallback
}

const isAbortError = (value: unknown) =>
  Boolean(value) && typeof value === "object" && (value as {name?: unknown}).name === "AbortError"

const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"])

const validatedUrl = (value: string, protocols: string[]) => {
  const url = new URL(value)
  if(!protocols.includes(url.protocol) || url.username || url.password || !loopbackHosts.has(url.hostname)) {
    throw new TypeError("The development backend returned an unsafe URL")
  }
  return url
}

const normalizedBaseUrl = (value: string) => validatedUrl(value, ["http:", "https:"]).toString().replace(/\/$/, "")

export class BackendClient {
  readonly apiBaseUrl: string

  constructor(readonly session: BackendSession, private readonly fetchImplementation = globalThis.fetch,
    private readonly accessToken?: string, private readonly onUnauthorized?: () => void) {
    this.apiBaseUrl = session.kind === "webwriter-dev-server" ? normalizedBaseUrl(session.apiBaseUrl) : cloudServiceURL(session.apiBaseUrl)
    validateSessionURLs(session)
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    if(typeof this.fetchImplementation !== "function") throw new Error("Backend requests are unavailable in this browser")
    let response: Response
    try {
      response = await this.fetchImplementation.call(globalThis, `${this.apiBaseUrl}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? {"Content-Type": "application/json"} : {}),
          ...(init.headers ?? {}),
          ...(this.accessToken ? {Authorization: `Bearer ${this.accessToken}`} : {}),
        },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      })
    }
    catch(error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not reach the ${this.session.kind === "webwriter-dev-server" ? "development server" : "cloud service"}. ${message}`)
    }
    if(response.status === 401) {
      this.onUnauthorized?.()
      throw new Error("Your cloud session expired. Sign in again in Settings.")
    }
    if(response.status === 204) return undefined as T
    let value: unknown
    try {
      value = await response.json()
    }
    catch {
      throw new Error(`The ${this.session.kind === "webwriter-dev-server" ? "development server" : "cloud service"} returned invalid JSON (${response.status})`)
    }
    if(!response.ok) throw new Error(errorText(value, `${this.session.kind === "webwriter-dev-server" ? "Development server" : "Cloud service"} request failed (${response.status})`))
    return value as T
  }

  async listDocuments() {
    return (await this.request<{documents: BackendDocumentSummary[]}>("documents")).documents
  }

  async getDocument(id: string) {
    return (await this.request<{document: BackendDocument}>(`documents/${encodeURIComponent(id)}`)).document
  }

  async createDocument(input: Pick<BackendDocument, "title" | "content" | "format">) {
    return (await this.request<{document: BackendDocument}>("documents", {
      method: "POST",
      body: JSON.stringify(input),
    })).document
  }

  async updateDocument(id: string, input: Partial<Pick<BackendDocument, "title" | "content" | "format">>) {
    return (await this.request<{document: BackendDocument}>(`documents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    })).document
  }

  async deleteDocument(id: string) {
    await this.request<void>(`documents/${encodeURIComponent(id)}`, {method: "DELETE"})
  }

  async listAIProviders() {
    return await this.request<ProviderCollection>("providers")
  }

  async createAIProvider(provider: AIProviderConfig, apiKey?: string) {
    return await this.request<{provider: AIProviderConfig, activeProviderId: string}>("providers", {
      method: "POST",
      body: JSON.stringify({...provider, ...(apiKey ? {apiKey} : {})}),
    })
  }

  async updateAIProvider(provider: AIProviderConfig, apiKey?: string) {
    return await this.request<{provider: AIProviderConfig, activeProviderId: string | null}>(`providers/${encodeURIComponent(provider.id)}`, {
      method: "PUT",
      body: JSON.stringify({...provider, ...(apiKey ? {apiKey} : {})}),
    })
  }

  async deleteAIProvider(id: string) {
    await this.request<void>(`providers/${encodeURIComponent(id)}`, {method: "DELETE"})
  }

  async setActiveAIProvider(id: string) {
    await this.request<{activeProviderId: string}>(`providers/${encodeURIComponent(id)}/active`, {method: "PUT"})
  }
}

const sessionFrom = (value: unknown): BackendSession | null => {
  if(!isRecord(value)
    || !["webwriter-dev-server", "webwriter-cloud-service"].includes(String(value.kind))
    || value.version !== 1
    || !["none", "bearer"].includes(String(value.authentication))
    || !isRecord(value.user)
    || typeof value.user.id !== "string"
    || typeof value.user.name !== "string"
    || typeof value.apiBaseUrl !== "string"
    || typeof value.collaborationUrl !== "string"
    || typeof value.adminUrl !== "string"
    || !Array.isArray(value.capabilities)) return null
  try {
    validateSessionURLs(value as BackendSession)
  }
  catch {
    return null
  }
  return value as BackendSession
}

const backendCandidates = () => {
  const urls = [new URL("/api/session", location.href)]
  if(loopbackHosts.has(location.hostname)) urls.push(new URL(`http://${location.hostname}:1234/api/session`))
  return [...new Map(urls.map(url => [url.href, url])).values()]
}

export async function probeDevelopmentBackend(
  signal?: AbortSignal,
  fetchImplementation = globalThis.fetch,
  apiBaseUrl?: string,
) {
  if(typeof fetchImplementation !== "function") return null
  const base = apiBaseUrl === undefined ? undefined : normalizedBaseUrl(apiBaseUrl)
  const candidates = base === undefined ? backendCandidates() : [new URL(`${base}/session`)]
  for(const url of candidates) {
    try {
      const response = await fetchImplementation.call(globalThis, url, {
        signal,
        headers: {Accept: "application/json"},
        cache: "no-store",
        credentials: "omit",
      })
      if(!response.ok || !response.headers.get("content-type")?.includes("application/json")) continue
      const session = sessionFrom(await response.json())
      if(session?.kind === "webwriter-dev-server" && session.authentication === "none"
        && (base === undefined || normalizedBaseUrl(session.apiBaseUrl) === base)) return session
    }
    catch(error) {
      if(isAbortError(error)) throw error
    }
  }
  return null
}

function validateSessionURLs(session: BackendSession) {
  if(session.kind === "webwriter-dev-server") {
    if(session.authentication !== "none") throw new TypeError("Invalid development session")
    validatedUrl(session.apiBaseUrl, ["http:", "https:"])
    validatedUrl(session.collaborationUrl, ["ws:", "wss:"])
    validatedUrl(session.adminUrl, ["http:", "https:"])
    return
  }
  const base = new URL(cloudServiceURL(session.apiBaseUrl))
  for(const value of [session.adminUrl, session.signInUrl].filter((value): value is string => !!value)) {
    if(new URL(cloudServiceURL(value)).origin !== base.origin) throw new TypeError("Cloud service URLs must use the provider origin")
  }
  const socket = new URL(session.collaborationUrl)
  if(!["ws:", "wss:"].includes(socket.protocol) || socket.username || socket.password
    || socket.host !== base.host || base.protocol === "https:" && socket.protocol !== "wss:") {
    throw new TypeError("Cloud collaboration must use the provider origin")
  }
}

export async function connectCloudService(service: CloudService, options: {
  password?: string, signal?: AbortSignal, fetchImplementation?: typeof fetch,
} = {}) {
  const base = cloudServiceURL(service.url)
  const api = base.endsWith("/api") ? base : `${base}/api`
  const fetch = options.fetchImplementation ?? globalThis.fetch
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetch.call(globalThis, url, {...init, signal, credentials: "omit", redirect: "error",
      cache: "no-store", headers: {Accept: "application/json", ...(init.body ? {"Content-Type": "application/json"} : {}),
        ...(service.accessToken && options.password === undefined ? {Authorization: `Bearer ${service.accessToken}`} : {})}})
    if(response.status === 401 && options.password === undefined) throw new CloudAuthenticationError("Sign in again in Settings.")
    const value = await response.json()
    if(!response.ok) throw new Error(errorText(value, `Cloud request failed (${response.status})`))
    return value
  }
  if(options.password === undefined && cloudServiceExpired(service)) throw new CloudAuthenticationError("Sign in again in Settings.")
  let value = await request(`${api}/session`)
  if(options.password !== undefined) {
    if(!isRecord(value) || value.kind !== "webwriter-cloud-service" || value.version !== 1 || value.authentication !== "bearer") {
      throw new Error("This URL does not provide a supported WebWriter cloud service.")
    }
    const signInUrl = isRecord(value) && typeof value.signInUrl === "string" ? cloudServiceURL(value.signInUrl) : null
    if(!signInUrl || new URL(signInUrl).origin !== new URL(base).origin) throw new Error("This service does not advertise a supported sign-in endpoint.")
    value = await request(signInUrl, {method: "POST", body: JSON.stringify({username: service.username, password: options.password})})
  }
  const session = sessionFrom(isRecord(value) && value.session ? value.session : value)
  if(!session || session.apiBaseUrl.replace(/\/$/, "") !== api) throw new Error("This URL does not provide a supported WebWriter cloud service.")
  const accessToken = isRecord(value) && typeof value.accessToken === "string" ? value.accessToken
    : options.password === undefined ? service.accessToken : undefined
  if(session.authentication === "bearer" && !accessToken) throw new CloudAuthenticationError("Sign in in Settings.")
  const expiresAt = isRecord(value) && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) ? value.expiresAt
    : isRecord(value) && typeof value.expiresIn === "number" && Number.isFinite(value.expiresIn) ? Date.now() + value.expiresIn * 1000
      : accessToken ? tokenExpiresAt(accessToken) ?? (options.password === undefined ? service.expiresAt : undefined) : undefined
  return {session, service: {...service, authentication: session.authentication === "none" ? "none" as const : undefined,
    accessToken, expiresAt}}
}

export class CloudAuthenticationError extends Error {}

/** Discover only the current host; localhost port fallback belongs to dev setups. */
export async function discoverHostBackend(signal?: AbortSignal, fetchImplementation = globalThis.fetch) {
  try {
    const response = await fetchImplementation.call(globalThis, new URL("/api/session", location.href), {
      signal, credentials: "omit", cache: "no-store", redirect: "error", headers: {Accept: "application/json"},
    })
    if(!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null
    const value = await response.json()
    if(!isRecord(value)) return null
    const session = sessionFrom(value.kind === "webwriter-cloud-service" ? {...value, user: value.user ?? {id: "", name: ""}} : value)
    if(!session || session.kind === "webwriter-cloud-service" && new URL(session.apiBaseUrl).origin !== location.origin) return null
    return session
  }
  catch(error) {if(isAbortError(error)) throw error; return null}
}
