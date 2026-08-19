import type {AIProviderConfig} from "./ai-provider"

export type BackendSession = {
  kind: "webwriter-dev-server"
  version: 1
  authentication: "none"
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

  constructor(readonly session: BackendSession, private readonly fetchImplementation = globalThis.fetch) {
    this.apiBaseUrl = normalizedBaseUrl(session.apiBaseUrl)
    validatedUrl(session.collaborationUrl, ["ws:", "wss:"])
    validatedUrl(session.adminUrl, ["http:", "https:"])
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
        },
        cache: "no-store",
        credentials: "omit",
      })
    }
    catch(error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not reach the development server. ${message}`)
    }
    if(response.status === 204) return undefined as T
    let value: unknown
    try {
      value = await response.json()
    }
    catch {
      throw new Error(`The development server returned invalid JSON (${response.status})`)
    }
    if(!response.ok) throw new Error(errorText(value, `Development server request failed (${response.status})`))
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
    || value.kind !== "webwriter-dev-server"
    || value.version !== 1
    || value.authentication !== "none"
    || !isRecord(value.user)
    || typeof value.user.id !== "string"
    || typeof value.user.name !== "string"
    || typeof value.apiBaseUrl !== "string"
    || typeof value.collaborationUrl !== "string"
    || typeof value.adminUrl !== "string"
    || !Array.isArray(value.capabilities)) return null
  try {
    validatedUrl(value.apiBaseUrl, ["http:", "https:"])
    validatedUrl(value.collaborationUrl, ["ws:", "wss:"])
    validatedUrl(value.adminUrl, ["http:", "https:"])
  }
  catch {
    return null
  }
  return value as BackendSession
}

const backendCandidates = () => {
  const urls = [new URL("/api/session", location.href)]
  const hostname = location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost"
  urls.push(new URL(`http://${hostname}:1234/api/session`))
  return [...new Map(urls.map(url => [url.href, url])).values()]
}

export async function probeDevelopmentBackend(
  signal?: AbortSignal,
  fetchImplementation = globalThis.fetch,
) {
  if(typeof fetchImplementation !== "function") return null
  for(const url of backendCandidates()) {
    try {
      const response = await fetchImplementation.call(globalThis, url, {
        signal,
        headers: {Accept: "application/json"},
        cache: "no-store",
        credentials: "omit",
      })
      if(!response.ok || !response.headers.get("content-type")?.includes("application/json")) continue
      const session = sessionFrom(await response.json())
      if(session) return session
    }
    catch(error) {
      if(error instanceof DOMException && error.name === "AbortError") throw error
    }
  }
  return null
}
