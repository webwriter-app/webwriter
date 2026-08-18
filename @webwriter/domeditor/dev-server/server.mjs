import {createServer as createHTTPServer} from "node:http"
import {randomUUID} from "node:crypto"
import {mkdir, readFile, readdir, rename, rm, writeFile} from "node:fs/promises"
import {dirname, extname, join, resolve} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import OpenAI from "openai"
import WebSocketPackage from "ws"
import {setupWSConnection} from "@y/websocket-server/utils"

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(serverDirectory, "..")
const defaultDataDirectory = join(projectRoot, ".webwriter-dev")
const maximumBodySize = 25 * 1024 * 1024
const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"])
const WebSocketServer = WebSocketPackage.WebSocketServer ?? WebSocketPackage.Server

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value)

const errorMessage = error => error instanceof Error ? error.message : String(error)

const json = (response, status, value, headers = {}) => {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  })
  response.end(body)
}

const apiError = (response, status, message) => json(response, status, {error: {message}})

const readJSON = async request => {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if(length > maximumBodySize) throw Object.assign(new Error("Request body is too large"), {status: 413})
    chunks.push(chunk)
  }
  if(!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  }
  catch {
    throw Object.assign(new Error("Request body must be valid JSON"), {status: 400})
  }
}

const atomicJSONWrite = async (path, value) => {
  await mkdir(dirname(path), {recursive: true})
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600})
  await rename(temporaryPath, path)
}

const readJSONFile = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  }
  catch(error) {
    if(error?.code === "ENOENT") return fallback
    throw error
  }
}

const safeId = value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)

const documentInput = (value, previous = {}) => {
  if(!isRecord(value)) throw Object.assign(new Error("Document must be a JSON object"), {status: 400})
  const title = typeof value.title === "string" ? value.title.trim() : previous.title ?? ""
  const content = typeof value.content === "string" ? value.content : previous.content
  const format = value.format === "offline" ? "offline" : value.format === "html" ? "html" : previous.format ?? "html"
  if(!title) throw Object.assign(new Error("Document title is required"), {status: 400})
  if(typeof content !== "string") throw Object.assign(new Error("Document content is required"), {status: 400})
  return {title: title.slice(0, 240), content, format}
}

const normalizeBaseUrl = value => {
  const url = new URL(String(value ?? ""))
  if(url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Provider URL must use HTTP or HTTPS")
  if(url.username || url.password) throw new Error("Provider URL cannot contain credentials")
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

const DEFAULT_AI_INSTRUCTIONS = "Fulfill every request by using the document tools to propose a document change, unless the user explicitly asks for planning only. Use clean semantic HTML with the flattest practical structure; avoid unnecessary wrappers such as <div>."

const providerInput = (value, previous = {}) => {
  if(!isRecord(value)) throw Object.assign(new Error("Provider must be a JSON object"), {status: 400})
  try {
    const id = safeId(value.id) ? value.id : previous.id ?? randomUUID()
    const name = typeof value.name === "string" ? value.name.trim() : previous.name ?? ""
    if(!name) throw new Error("Provider name is required")
    const models = Array.isArray(value.models)
      ? [...new Set(value.models.filter(model => typeof model === "string").map(model => model.trim()).filter(Boolean))]
      : previous.models ?? []
    const defaultModel = typeof value.defaultModel === "string"
      ? value.defaultModel.trim()
      : previous.defaultModel ?? models[0] ?? ""
    if(defaultModel && !models.includes(defaultModel)) models.unshift(defaultModel)
    const apiKey = typeof value.apiKey === "string" && value.apiKey.trim()
      ? value.apiKey.trim()
      : previous.apiKey ?? ""
    const customInstructions = typeof value.customInstructions === "string"
      ? value.customInstructions.trim()
      : previous.customInstructions ?? DEFAULT_AI_INSTRUCTIONS
    return {
      id,
      name: name.slice(0, 120),
      preset: ["openai", "ollama", "lm-studio", "custom"].includes(value.preset)
        ? value.preset
        : previous.preset ?? "custom",
      baseUrl: normalizeBaseUrl(value.baseUrl ?? previous.baseUrl),
      auth: ["bearer", "api-key", "x-api-key", "none"].includes(value.auth)
        ? value.auth
        : previous.auth ?? "bearer",
      models,
      defaultModel,
      customInstructions,
      apiKey,
      apiKeyEnvironment: typeof value.apiKeyEnvironment === "string"
        ? value.apiKeyEnvironment.trim()
        : previous.apiKeyEnvironment ?? "",
    }
  }
  catch(error) {
    throw Object.assign(new Error(errorMessage(error)), {status: 400})
  }
}

const providerSecret = provider => provider.apiKey
  || (provider.apiKeyEnvironment ? process.env[provider.apiKeyEnvironment] : "")
  || (provider.preset === "openai" ? process.env.OPENAI_API_KEY : "")
  || ""

const publicProvider = (provider, origin) => ({
  id: provider.id,
  name: provider.name,
  preset: provider.preset,
  baseUrl: provider.baseUrl,
  auth: provider.auth,
  keyMode: "memory",
  models: [...provider.models],
  defaultModel: provider.defaultModel,
  ...(provider.customInstructions ? {customInstructions: provider.customInstructions} : {}),
  managed: "backend",
  inferenceUrl: `${origin}/api/inference/providers/${encodeURIComponent(provider.id)}`,
  credentialStatus: provider.auth === "none" ? "not-required" : providerSecret(provider) ? "available" : "missing",
})

const defaultProviderState = () => {
  const providers = []
  if(process.env.OPENAI_API_KEY) {
    providers.push({
      id: "openai",
      name: "OpenAI",
      preset: "openai",
      baseUrl: "https://api.openai.com/v1",
      auth: "bearer",
      models: ["gpt-5.6-luna"],
      defaultModel: "gpt-5.6-luna",
      customInstructions: DEFAULT_AI_INSTRUCTIONS,
      apiKey: "",
      apiKeyEnvironment: "OPENAI_API_KEY",
    })
  }
  return {version: 1, activeProviderId: providers[0]?.id ?? null, providers}
}

const loadProviderState = async path => {
  const value = await readJSONFile(path, null)
  if(!isRecord(value) || !Array.isArray(value.providers)) return defaultProviderState()
  const providers = value.providers.flatMap(provider => {
    try {
      return [providerInput(provider)]
    }
    catch {
      return []
    }
  })
  const activeProviderId = providers.some(provider => provider.id === value.activeProviderId)
    ? value.activeProviderId
    : providers[0]?.id ?? null
  return {version: 1, activeProviderId, providers}
}

const requestOrigin = request => {
  const host = request.headers.host || "127.0.0.1"
  return `http://${host}`
}

const isAllowedOrigin = origin => {
  if(!origin) return true
  try {
    return loopbackHosts.has(new URL(origin).hostname)
  }
  catch {
    return false
  }
}

const applyCors = (request, response) => {
  const origin = request.headers.origin
  if(typeof origin === "string" && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin)
    response.setHeader("Vary", "Origin")
    response.setHeader("Access-Control-Allow-Headers", "Content-Type")
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
  }
}

const clientForProvider = (provider, fetchImplementation) => {
  const secret = providerSecret(provider)
  if(provider.auth !== "none" && !secret) {
    throw Object.assign(new Error(`No API key is configured for ${provider.name}`), {status: 400})
  }
  const customFetch = provider.auth === "bearer"
    ? fetchImplementation
    : async (url, init = {}) => {
      const headers = new Headers(init.headers)
      headers.delete("authorization")
      if(provider.auth !== "none") headers.set(provider.auth, secret)
      return fetchImplementation(url, {...init, headers})
    }
  return new OpenAI({
    apiKey: provider.auth === "bearer" ? secret : "not-required",
    baseURL: provider.baseUrl,
    fetch: customFetch,
  })
}

const inferenceError = (response, error) => {
  const status = Number.isInteger(error?.status) ? error.status : Number.isInteger(error?.statusCode) ? error.statusCode : 502
  apiError(response, status, errorMessage(error))
}

export async function createDevServer(options = {}) {
  const host = options.host ?? process.env.WEBWRITER_DEV_HOST ?? "127.0.0.1"
  if(!loopbackHosts.has(host)) throw new Error("The development server may only bind to a loopback host")
  const requestedPort = options.port ?? Number.parseInt(process.env.WEBWRITER_DEV_PORT || "1234", 10)
  const dataDirectory = resolve(options.dataDirectory ?? process.env.WEBWRITER_DEV_DATA_DIR ?? defaultDataDirectory)
  const documentsDirectory = join(dataDirectory, "documents")
  const providerStatePath = join(dataDirectory, "providers.json")
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const useVite = options.vite !== false
  await mkdir(documentsDirectory, {recursive: true})

  let viteServer
  const websocketServer = new WebSocketServer({noServer: true})
  websocketServer.on("connection", (socket, request) => setupWSConnection(socket, request))

  const requestHandler = async (request, response) => {
    applyCors(request, response)
    if(typeof request.headers.origin === "string" && !isAllowedOrigin(request.headers.origin)) {
      apiError(response, 403, "Only loopback browser origins may use this development server")
      return
    }
    if(request.method === "OPTIONS") {
      response.writeHead(204)
      response.end()
      return
    }

    const url = new URL(request.url || "/", requestOrigin(request))
    const path = url.pathname
    const origin = url.origin

    try {
      if(path === "/api/session" && request.method === "GET") {
        json(response, 200, {
          kind: "webwriter-dev-server",
          version: 1,
          authentication: "none",
          user: {id: "local-development", name: "Local developer"},
          apiBaseUrl: `${origin}/api`,
          collaborationUrl: origin.replace(/^http/, "ws"),
          adminUrl: `${origin}/admin`,
          capabilities: ["documents", "collaboration", "inference", "providers"],
        })
        return
      }

      if(path === "/api/documents" && request.method === "GET") {
        const entries = await readdir(documentsDirectory, {withFileTypes: true})
        const documents = await Promise.all(entries
          .filter(entry => entry.isFile() && extname(entry.name) === ".json")
          .map(entry => readJSONFile(join(documentsDirectory, entry.name), null)))
        json(response, 200, {documents: documents.filter(isRecord).map(({content: _content, ...document}) => document)
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))})
        return
      }

      if(path === "/api/documents" && request.method === "POST") {
        const now = new Date().toISOString()
        const id = randomUUID()
        const document = {id, ...documentInput(await readJSON(request)), createdAt: now, updatedAt: now}
        await atomicJSONWrite(join(documentsDirectory, `${id}.json`), document)
        json(response, 201, {document}, {Location: `/api/documents/${id}`})
        return
      }

      const documentMatch = path.match(/^\/api\/documents\/([^/]+)$/)
      if(documentMatch) {
        const id = decodeURIComponent(documentMatch[1])
        if(!safeId(id)) return apiError(response, 400, "Invalid document ID")
        const documentPath = join(documentsDirectory, `${id}.json`)
        const existing = await readJSONFile(documentPath, null)
        if(!existing) return apiError(response, 404, "Document not found")
        if(request.method === "GET") return json(response, 200, {document: existing})
        if(request.method === "PUT" || request.method === "PATCH") {
          const updated = {
            ...existing,
            ...documentInput(await readJSON(request), existing),
            id,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
          }
          await atomicJSONWrite(documentPath, updated)
          return json(response, 200, {document: updated})
        }
        if(request.method === "DELETE") {
          await rm(documentPath)
          response.writeHead(204)
          response.end()
          return
        }
      }

      if(path === "/api/providers" && request.method === "GET") {
        const state = await loadProviderState(providerStatePath)
        return json(response, 200, {
          providers: state.providers.map(provider => publicProvider(provider, origin)),
          activeProviderId: state.activeProviderId,
        })
      }

      if(path === "/api/providers" && request.method === "POST") {
        const state = await loadProviderState(providerStatePath)
        const provider = providerInput(await readJSON(request))
        if(state.providers.some(candidate => candidate.id === provider.id)) return apiError(response, 409, "Provider ID already exists")
        state.providers.push(provider)
        state.activeProviderId = provider.id
        await atomicJSONWrite(providerStatePath, state)
        return json(response, 201, {provider: publicProvider(provider, origin), activeProviderId: provider.id})
      }

      const providerMatch = path.match(/^\/api\/providers\/([^/]+)$/)
      if(providerMatch) {
        const id = decodeURIComponent(providerMatch[1])
        if(!safeId(id)) return apiError(response, 400, "Invalid provider ID")
        const state = await loadProviderState(providerStatePath)
        const index = state.providers.findIndex(provider => provider.id === id)
        if(index < 0) return apiError(response, 404, "Provider not found")
        if(request.method === "GET") return json(response, 200, {provider: publicProvider(state.providers[index], origin)})
        if(request.method === "PUT" || request.method === "PATCH") {
          const input = await readJSON(request)
          state.providers[index] = providerInput(isRecord(input) ? {...input, id} : input, state.providers[index])
          await atomicJSONWrite(providerStatePath, state)
          return json(response, 200, {provider: publicProvider(state.providers[index], origin), activeProviderId: state.activeProviderId})
        }
        if(request.method === "DELETE") {
          state.providers.splice(index, 1)
          if(state.activeProviderId === id) state.activeProviderId = state.providers[0]?.id ?? null
          await atomicJSONWrite(providerStatePath, state)
          response.writeHead(204)
          response.end()
          return
        }
      }

      const activeProviderMatch = path.match(/^\/api\/providers\/([^/]+)\/active$/)
      if(activeProviderMatch && request.method === "PUT") {
        const id = decodeURIComponent(activeProviderMatch[1])
        const state = await loadProviderState(providerStatePath)
        if(!state.providers.some(provider => provider.id === id)) return apiError(response, 404, "Provider not found")
        state.activeProviderId = id
        await atomicJSONWrite(providerStatePath, state)
        return json(response, 200, {activeProviderId: id})
      }

      const inferenceMatch = path.match(/^\/api\/inference\/providers\/([^/]+)\/(models|chat\/completions|responses)$/)
      if(inferenceMatch) {
        const id = decodeURIComponent(inferenceMatch[1])
        const operation = inferenceMatch[2]
        const state = await loadProviderState(providerStatePath)
        const provider = state.providers.find(candidate => candidate.id === id)
        if(!provider) return apiError(response, 404, "Provider not found")
        try {
          const client = clientForProvider(provider, fetchImplementation)
          if(operation === "models" && request.method === "GET") {
            const models = await client.models.list()
            return json(response, 200, {object: "list", data: models.data})
          }
          if(operation === "chat/completions" && request.method === "POST") {
            const completion = await client.chat.completions.create(await readJSON(request))
            return json(response, 200, completion)
          }
          if(operation === "responses" && request.method === "POST") {
            const result = await client.responses.create(await readJSON(request))
            return json(response, 200, result)
          }
        }
        catch(error) {
          inferenceError(response, error)
          return
        }
      }

      if(path === "/admin" || path === "/admin/") {
        const content = await readFile(join(serverDirectory, "admin.html"))
        response.writeHead(200, {"Content-Type": "text/html; charset=utf-8", "Content-Length": content.length})
        response.end(content)
        return
      }

      if(path.startsWith("/api/")) return apiError(response, 404, "API endpoint not found")
      if(viteServer) {
        viteServer.middlewares(request, response, error => {
          if(error) {
            console.error(error)
            if(!response.headersSent) apiError(response, 500, "Development frontend failed")
          }
          else if(!response.writableEnded) apiError(response, 404, "Not found")
        })
        return
      }
      apiError(response, 404, "Not found")
    }
    catch(error) {
      if(!response.headersSent) apiError(response, error?.status ?? 500, errorMessage(error))
      else response.end()
    }
  }

  const server = createHTTPServer((request, response) => void requestHandler(request, response))
  if(useVite) {
    const {createServer: createViteServer} = await import("vite")
    viteServer = await createViteServer({
      root: projectRoot,
      appType: "spa",
      server: {middlewareMode: true, hmr: {server}},
    })
  }

  server.on("upgrade", (request, socket, head) => {
    if(request.headers["sec-websocket-protocol"] === "vite-hmr") return
    const origin = request.headers.origin
    if(typeof origin === "string" && !isAllowedOrigin(origin)) {
      socket.destroy()
      return
    }
    websocketServer.handleUpgrade(request, socket, head, webSocket => {
      websocketServer.emit("connection", webSocket, request)
    })
  })

  return {
    host,
    dataDirectory,
    server,
    websocketServer,
    async listen() {
      await new Promise((resolveListen, reject) => {
        const onError = error => {
          server.off("listening", onListening)
          reject(error)
        }
        const onListening = () => {
          server.off("error", onError)
          resolveListen()
        }
        server.once("error", onError)
        server.once("listening", onListening)
        server.listen(requestedPort, host)
      })
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : requestedPort
      return {host, port, url: `http://${host}:${port}`}
    },
    async close() {
      for(const client of websocketServer.clients) client.terminate()
      await new Promise(resolveClose => websocketServer.close(() => resolveClose()))
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
      await viteServer?.close()
    },
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if(isDirectRun) {
  for(const name of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(join(projectRoot, name))
    }
    catch(error) {
      if(error?.code !== "ENOENT") throw error
    }
  }
  const developmentServer = await createDevServer()
  const address = await developmentServer.listen()
  console.log(`WebWriter development server: ${address.url}`)
  console.log(`Admin dashboard: ${address.url}/admin`)
}
