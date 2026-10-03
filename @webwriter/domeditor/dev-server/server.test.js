// @vitest-environment node
import {mkdtemp, readFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {WebsocketProvider} from "y-websocket"
import {docs, getYDoc} from "@y/websocket-server/utils"
import WebSocketPackage from "ws"
import {createDevServer} from "./server.mjs"
import {defaultGroupingRules, groupingTarget} from "../src/widget-grouping.js"

let developmentServer
let baseUrl
let upstreamFetch
let gitPackageFetch
let widgetGroupsFormed

const request = async (path, init) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {"Content-Type": "application/json", ...init?.headers},
  })
  const value = response.status === 204 ? null : await response.json()
  return {response, value}
}

const openWebSocket = url => new Promise((resolve, reject) => {
  const socket = new WebSocketPackage(url)
  const timer = setTimeout(() => {
    socket.terminate()
    reject(new Error("WebSocket connection timed out"))
  }, 2_000)
  socket.once("open", () => {
    clearTimeout(timer)
    resolve(socket)
  })
  socket.once("error", error => {
    clearTimeout(timer)
    reject(error)
  })
})

const closeWebSocket = socket => new Promise(resolve => {
  socket.once("close", resolve)
  socket.close()
})

const groupingRules = () => {
  const rules = defaultGroupingRules("server-grouping-test")
  rules.method = "manual"
  rules.grouping = "new"
  rules.manualGroups = [
    {id: "group-a", name: "A", members: ["ada", "amy"]},
    {id: "group-b", name: "B", members: ["lin"]},
  ]
  return rules
}

const writeWidgetGrouping = (documentRoom, widgetId, declaration) => {
  const serverDocument = getYDoc(documentRoom)
  const document = new Y.Doc()
  Y.applyUpdate(document, Y.encodeStateAsUpdate(serverDocument))
  const body = document.getXmlElement("body")
  let widget = body.toArray().find(node => node instanceof Y.XmlElement && node.getAttribute("id") === widgetId)
  if(!widget) {
    widget = new Y.XmlElement("ww-poll")
    widget.setAttribute("id", widgetId)
    body.insert(body.length, [widget])
  }
  const instruction = new Y.XmlElement("domeditor-comment")
  instruction.setAttribute("__domeditor_node_kind", "processing-instruction")
  instruction.setAttribute("__domeditor_processing_instruction_target", groupingTarget)
  instruction.insert(0, [new Y.XmlText(declaration)])
  widget.delete(0, widget.length)
  widget.insert(0, [instruction])
  Y.applyUpdate(serverDocument, Y.encodeStateAsUpdate(document))
  document.destroy()
}

beforeEach(async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "webwriter-dev-server-"))
  upstreamFetch = vi.fn().mockRejectedValue(new Error("Unexpected upstream inference request"))
  widgetGroupsFormed = vi.fn()
  gitPackageFetch = vi.fn(async source => ({source, commit: "abc123", files: new Map([
    ["package.json", Buffer.from('{"name":"@git/demo","version":"1.0.0"}')],
    ["dist/demo.js", Buffer.from('export const version = "1.0.0"')],
    ["dist/icon.png", Buffer.from([0, 255, 128])],
    ["dist/page.html", Buffer.from("<script>localStorage.clear()</script>")],
    ["dist/icon.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="localStorage.clear()"/>')],
  ])}))
  developmentServer = await createDevServer({
    fetchGitPackage: gitPackageFetch,
    port: 0,
    vite: false,
    dataDirectory,
    fetch: (...args) => upstreamFetch(...args),
    resolveWidgetDataIdentity: request => ({
      userId: request.headers["x-test-user"] ?? "local-development",
      ...(request.headers["x-test-group"] ? {groupId: request.headers["x-test-group"]} : {}),
    }),
    resolveWidgetGroupingContext: request => ({
      canManage: request.headers["x-test-manage"] === "yes",
      participants: [
        {id: "ada", firstName: "Ada", active: true, roles: [], cohorts: [], groups: [], groupings: []},
        {id: "amy", firstName: "Amy", active: true, roles: [], cohorts: [], groups: [], groupings: []},
        {id: "lin", firstName: "Lin", active: true, roles: [], cohorts: [], groups: [], groupings: []},
        ...(request.headers["x-test-roster"] === "expanded" ? [{id: "zoe", firstName: "Zoe", active: true, roles: [], cohorts: [], groups: [], groupings: []}] : []),
      ].map(person => request.headers["x-test-owned-group"] && person.id === "ada"
        ? {...person, groups: [request.headers["x-test-owned-group"]]} : person),
      groups: [], groupings: [], roles: [], cohorts: [],
    }),
    onWidgetGroupsFormed: (...args) => widgetGroupsFormed(...args),
  })
  baseUrl = (await developmentServer.listen()).url
})

afterEach(async () => {
  await developmentServer?.close()
  vi.restoreAllMocks()
})

describe("development server", () => {
  it("advertises a no-auth localhost session and serves the admin dashboard", async () => {
    const {response, value} = await request("/api/session")
    expect(response.status).toBe(200)
    expect(value).toEqual(expect.objectContaining({
      kind: "webwriter-dev-server",
      authentication: "none",
      capabilities: expect.arrayContaining(["documents", "collaboration", "inference", "providers"]),
    }))
    expect((await fetch(`${baseUrl}/admin`)).status).toBe(200)
  })

  it("refuses network binds and non-loopback browser origins", async () => {
    await expect(createDevServer({host: "0.0.0.0", vite: false})).rejects.toThrow("loopback")
    const response = await fetch(`${baseUrl}/api/session`, {
      headers: {Origin: "https://example.com"},
    })
    expect(response.status).toBe(403)
  })

  it("creates, reads, updates, lists, and deletes documents", async () => {
    const created = await request("/api/documents", {
      method: "POST",
      body: JSON.stringify({title: "Lesson", content: "<p>Hello</p>", format: "html"}),
    })
    expect(created.response.status).toBe(201)
    const id = created.value.document.id

    expect((await request("/api/documents")).value.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({id, title: "Lesson"}),
    ]))
    expect((await request(`/api/documents/${id}`)).value.document.content).toBe("<p>Hello</p>")

    const updated = await request(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({title: "Updated"}),
    })
    expect(updated.value.document.title).toBe("Updated")
    expect(updated.value.document.content).toBe("<p>Hello</p>")

    expect((await request(`/api/documents/${id}`, {method: "DELETE"})).response.status).toBe(204)
    expect((await request(`/api/documents/${id}`)).response.status).toBe(404)
  })

  it("seeds the MathML preset and preserves edits across restarts", async () => {
    const id = "preset-mozilla-mathml-test"
    const documents = (await request("/api/documents")).value.documents
    expect(documents).toEqual(expect.arrayContaining([expect.objectContaining({id, title: "Mozilla MathML Test", format: "html"})]))
    expect(documents[0]).not.toHaveProperty("content")
    const {document} = (await request(`/api/documents/${id}`)).value
    expect(document.content.match(/<math\b/g)).toHaveLength(60)
    expect(document.content.match(/<img\b/g)).toHaveLength(30)
    const rows = [...document.content.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    expect(rows).toHaveLength(31)
    for(const [, row] of rows.slice(1)) {
      expect(row.match(/<td\b/g)).toHaveLength(4)
      expect(row).toContain('<td class="compact-math">')
      const math = row.match(/<math\b[\s\S]*?<\/math>/g)
      expect(math).toHaveLength(2)
      expect(math[1]).toBe(math[0])
    }
    expect(document.content).toContain("math-style: compact;")
    expect(document.content).toContain("min-width: max(100%, 90rem);")
    expect(document.content).toContain('src="https://fred-wang.github.io/MathFonts/mozilla_mathml_test/resources/ex1.png"')
    expect(document.content).not.toContain("<script")

    await request(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({title: "Edited MathML", content: "<p>Saved edits</p>"}),
    })
    const {dataDirectory} = developmentServer
    await developmentServer.close()
    developmentServer = await createDevServer({port: 0, vite: false, dataDirectory})
    baseUrl = (await developmentServer.listen()).url
    expect((await request(`/api/documents/${id}`)).value.document).toEqual(expect.objectContaining({
      id, title: "Edited MathML", content: "<p>Saved edits</p>", createdAt: document.createdAt,
    }))
    expect((await request("/api/documents")).value.documents).toHaveLength(2)
  })

  it("seeds the Kitchen Sink preset, preserves edits, and restores it after deletion", async () => {
    const id = "preset-kitchen-sink"
    expect((await request("/api/documents")).value.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({id, title: "Kitchen Sink", format: "html"}),
    ]))
    const {document} = (await request(`/api/documents/${id}`)).value
    expect(document.content).toContain('<title>Kitchen Sink</title>')
    expect(document.content).toContain('class="ww-column-group"')
    await request(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({content: "<p>My kitchen sink</p>"}),
    })
    const {dataDirectory} = developmentServer
    const restart = async () => {
      await developmentServer.close()
      developmentServer = await createDevServer({port: 0, vite: false, dataDirectory})
      baseUrl = (await developmentServer.listen()).url
    }
    await restart()
    expect((await request(`/api/documents/${id}`)).value.document.content).toBe("<p>My kitchen sink</p>")
    await request(`/api/documents/${id}`, {method: "DELETE"})
    await restart()
    expect((await request(`/api/documents/${id}`)).value.document.content).toBe(document.content)
  })

  it("manages providers without returning stored API keys", async () => {
    const created = await request("/api/providers", {
      method: "POST",
      body: JSON.stringify({
        id: "test-provider",
        name: "Test provider",
        preset: "custom",
        baseUrl: "https://ai.example/v1",
        auth: "bearer",
        apiKey: "secret-value",
        models: ["test-model"],
        defaultModel: "test-model",
        apiKeyEnvironment: "PATH",
      }),
    })
    expect(created.response.status).toBe(201)
    expect(JSON.stringify(created.value)).not.toContain("secret-value")
    expect(created.value.provider).toEqual(expect.objectContaining({
      managed: "backend",
      credentialStatus: "available",
    }))
    // Editing behavior is application-owned; providers store only extra preferences.
    expect(created.value.provider.customInstructions ?? "").toBe("")

    const listed = await request("/api/providers")
    expect(JSON.stringify(listed.value)).not.toContain("secret-value")
    expect(listed.value.activeProviderId).toBe("test-provider")

    const envOnly = await request("/api/providers", {
      method: "POST",
      body: JSON.stringify({
        id: "env-only-provider",
        name: "Environment only",
        preset: "custom",
        baseUrl: "https://ai.example/v1",
        auth: "bearer",
        apiKeyEnvironment: "PATH",
      }),
    })
    expect(envOnly.response.status).toBe(201)
    expect(envOnly.value.provider.credentialStatus).toBe("missing")
  })

  it("serializes concurrent provider updates without losing fields", async () => {
    await request("/api/providers", {
      method: "POST",
      body: JSON.stringify({
        id: "concurrent-provider",
        name: "Concurrent provider",
        baseUrl: "https://ai.example/v1",
        models: ["model-a"],
        defaultModel: "model-a",
        customInstructions: "initial",
      }),
    })

    const [modelsUpdate, instructionsUpdate] = await Promise.all([
      request("/api/providers/concurrent-provider", {
        method: "PATCH",
        body: JSON.stringify({models: ["model-a", "model-b"]}),
      }),
      request("/api/providers/concurrent-provider", {
        method: "PATCH",
        body: JSON.stringify({customInstructions: "updated concurrently"}),
      }),
    ])
    expect(modelsUpdate.response.status).toBe(200)
    expect(instructionsUpdate.response.status).toBe(200)

    const final = await request("/api/providers/concurrent-provider")
    expect(final.value.provider.models).toEqual(["model-a", "model-b"])
    expect(final.value.provider.customInstructions).toBe("updated concurrently")
  })

  it("proxies inference through the OpenAI client with the server-side key", async () => {
    await request("/api/providers", {
      method: "POST",
      body: JSON.stringify({
        id: "proxy-provider",
        name: "Proxy provider",
        preset: "custom",
        baseUrl: "https://ai.example/v1",
        auth: "bearer",
        apiKey: "server-only-secret",
        models: ["test-model"],
        defaultModel: "test-model",
      }),
    })
    upstreamFetch.mockImplementation(async (url, init) => {
      if(String(url).endsWith("/models")) {
        return new Response(JSON.stringify({object: "list", data: [{id: "test-model", object: "model", created: 1, owned_by: "test"}]}), {
          headers: {"Content-Type": "application/json"},
        })
      }
      return new Response(JSON.stringify({id: "chat-1", choices: [{message: {role: "assistant", content: "Hello"}}]}), {
        headers: {"Content-Type": "application/json"},
      })
    })

    const models = await request("/api/inference/providers/proxy-provider/models")
    expect(models.value.data[0].id).toBe("test-model")
    const completion = await request("/api/inference/providers/proxy-provider/chat/completions", {
      method: "POST",
      body: JSON.stringify({model: "test-model", messages: [{role: "user", content: "Hi"}]}),
    })
    expect(completion.value.choices[0].message.content).toBe("Hello")
    expect(upstreamFetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      headers: expect.objectContaining({authorization: "Bearer server-only-secret"}),
    }))
  })

  it("forwards streamed chunks rather than serializing the SDK stream", async () => {
    await request("/api/providers", {method: "POST", body: JSON.stringify({id: "stream-provider", name: "Stream provider", preset: "custom", baseUrl: "https://ai.example/v1", auth: "none", models: ["test-model"], defaultModel: "test-model"})})
    const chunk = {choices: [{index: 0, delta: {content: "Hello"}, finish_reason: "stop"}]}
    upstreamFetch.mockResolvedValue(new Response(`: keep-alive\n\ndata: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {headers: {"Content-Type": "text/event-stream"}}))
    const result = await fetch(`${baseUrl}/api/inference/providers/stream-provider/chat/completions`, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({model: "test-model", messages: [], stream: true}),
    })
    expect(result.headers.get("content-type")).toContain("text/event-stream")
    const text = await result.text()
    expect(text).toContain(`data: ${JSON.stringify(chunk)}`)
    expect(text).toContain("data: [DONE]")
  })

  it("bounds a non-streaming provider body after headers have arrived", async () => {
    await request("/api/providers", {method: "POST", body: JSON.stringify({
      id: "body-timeout", name: "Body timeout", preset: "custom", baseUrl: "https://ai.example/v1",
      auth: "none", models: ["test-model"], defaultModel: "test-model",
    })})
    let upstreamSignal
    upstreamFetch.mockImplementation((url, init) => {
      upstreamSignal = init.signal
      return Promise.resolve(new Response(new ReadableStream({start(controller) {
        controller.enqueue(new TextEncoder().encode('\n'))
        init.signal.addEventListener("abort", () => controller.error(init.signal.reason), {once: true})
      }}), {headers: {"Content-Type": "application/json"}}))
    })
    const timers = vi.spyOn(globalThis, "setTimeout")
    const pending = request("/api/inference/providers/body-timeout/chat/completions", {
      method: "POST", body: JSON.stringify({model: "test-model", messages: []}),
    })
    await vi.waitFor(() => expect(upstreamSignal).toBeDefined())
    const deadline = timers.mock.calls.find(([, delay]) => delay === 120_000)
    expect(deadline).toBeDefined()
    deadline[0]()
    const result = await pending
    expect(upstreamSignal.aborted).toBe(true)
    expect(result.value.error.message).toContain("did not complete its response within two minutes")
  })

  it("cancels upstream inference when the browser disconnects", async () => {
    await request("/api/providers", {method: "POST", body: JSON.stringify({
      id: "cancel-provider", name: "Cancel provider", preset: "custom", baseUrl: "https://ai.example/v1",
      auth: "none", models: ["test-model"], defaultModel: "test-model",
    })})
    let upstreamSignal
    upstreamFetch.mockImplementation((url, init) => new Promise((resolve, reject) => {
      upstreamSignal = init.signal
      init.signal.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), {once: true})
    }))
    const controller = new AbortController()
    const pending = fetch(`${baseUrl}/api/inference/providers/cancel-provider/chat/completions`, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({model: "test-model", messages: [{role: "user", content: "Hi"}]}), signal: controller.signal,
    })
    const stopped = expect(pending).rejects.toMatchObject({name: "AbortError"})
    await vi.waitFor(() => expect(upstreamSignal).toBeDefined())
    controller.abort()
    await stopped
    await vi.waitFor(() => expect(upstreamSignal.aborted).toBe(true))
    expect(upstreamFetch).toHaveBeenCalledOnce()
  })

  it("returns upstream failures immediately without automatic retries", async () => {
    await request("/api/providers", {method: "POST", body: JSON.stringify({
      id: "failure-provider", name: "Failure provider", preset: "custom", baseUrl: "https://ai.example/v1",
      auth: "none", models: ["test-model"], defaultModel: "test-model",
    })})
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({error: {message: "Provider unavailable"}}), {
      status: 503, headers: {"Content-Type": "application/json"},
    }))
    const result = await request("/api/inference/providers/failure-provider/chat/completions", {
      method: "POST", body: JSON.stringify({model: "test-model", messages: []}),
    })
    expect(result.response.status).toBe(503)
    expect(upstreamFetch).toHaveBeenCalledOnce()
  })

  it("synchronizes Yjs documents through the collaboration WebSocket", async () => {
    const left = new Y.Doc()
    const right = new Y.Doc()
    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const options = {WebSocketPolyfill: WebSocketPackage, disableBc: true}
    const leftProvider = new WebsocketProvider(websocketUrl, "shared-room", left, options)
    const rightProvider = new WebsocketProvider(websocketUrl, "shared-room", right, options)
    try {
      await Promise.all([leftProvider, rightProvider].map(provider => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Collaboration connection timed out")), 2_000)
        provider.on("status", event => {
          if(event.status !== "connected") return
          clearTimeout(timer)
          resolve()
        })
      })))
      left.getMap("document").set("title", "Together")
      await vi.waitFor(() => expect(right.getMap("document").get("title")).toBe("Together"))
    }
    finally {
      leftProvider.destroy()
      rightProvider.destroy()
      left.destroy()
      right.destroy()
    }
  })

  it("resolves widget-data rooms from server identity and persists their Yjs state", async () => {
    const frameOrigin = "http://localhost:5173"
    const preflight = await fetch(`${baseUrl}/api/widget-data/resolve`, {
      method: "OPTIONS",
      headers: {
        Origin: frameOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe(frameOrigin)
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true")
    const credentialedResolve = await request("/api/widget-data/resolve", {
      method: "POST",
      headers: {Origin: frameOrigin},
      body: JSON.stringify({document: "lesson-1", widget: "poll", mode: "individual"}),
    })
    expect(credentialedResolve.response.status).toBe(200)
    const invalidBody = await request("/api/widget-data/resolve", {
      method: "POST",
      body: JSON.stringify(["not", "an", "object"]),
    })
    expect(invalidBody.response.status).toBe(400)

    const resolved = await request("/api/widget-data/resolve", {
      method: "POST",
      body: JSON.stringify({document: "lesson-1", widget: "poll", mode: "individual", user: "forged", group: "forged"}),
    })
    expect(resolved.response.status).toBe(200)
    expect(resolved.value.room).toMatch(/^widget-data-[a-f0-9]{64}$/)
    expect(resolved.value.token).toMatch(/^[a-f0-9]{32}$/)
    const forged = await request("/api/widget-data/resolve", {
      method: "POST",
      body: JSON.stringify({document: "lesson-1", widget: "poll", mode: "group", group: "forged"}),
    })
    expect(forged.response.status).toBe(403)

    const resolveFor = async (mode, user, group) => (await request("/api/widget-data/resolve", {
      method: "POST",
      headers: {"X-Test-User": user, ...(group ? {"X-Test-Group": group} : {})},
      body: JSON.stringify({document: "lesson-1", widget: "poll", mode}),
    })).value
    const individualAda = await resolveFor("individual", "ada")
    const individualLin = await resolveFor("individual", "lin")
    expect(individualAda.room).not.toBe(individualLin.room)
    const xmlAda = await request("/api/widget-data/resolve", {
      method: "POST",
      headers: {"X-Test-User": "ada"},
      body: JSON.stringify({document: "lesson-1", widget: "poll", mode: "individual", format: "xml"}),
    })
    expect(xmlAda.value.room).not.toBe(individualAda.room)
    expect((await request("/api/widget-data/resolve", {
      method: "POST",
      body: JSON.stringify({document: "lesson-1", widget: "poll", mode: "individual", format: "yaml"}),
    })).response.status).toBe(400)
    const groupAda = await resolveFor("group", "ada", "group-a")
    const groupLin = await resolveFor("group", "lin", "group-a")
    const groupSam = await resolveFor("group", "sam", "group-b")
    expect(groupAda.room).toBe(groupLin.room)
    expect(groupAda.room).not.toBe(groupSam.room)
    const allAda = await resolveFor("all", "ada", "group-a")
    const allSam = await resolveFor("all", "sam", "group-b")
    expect(allAda.room).toBe(allSam.room)

    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const {dataDirectory} = developmentServer
    const document = new Y.Doc()
    const provider = new WebsocketProvider(websocketUrl, resolved.value.room, document, {
      WebSocketPolyfill: WebSocketPackage, disableBc: true, params: {token: resolved.value.token},
    })
    await expect(openWebSocket(`${websocketUrl}/${individualAda.room}?token=${resolved.value.token}`)).rejects.toBeInstanceOf(Error)
    await vi.waitFor(() => expect(provider.wsconnected).toBe(true))
    document.getMap("widget-data").set("answer", "saved")
    await vi.waitFor(async () => expect((await readFile(join(dataDirectory, "widget-data", `${resolved.value.room}.bin`))).length).toBeGreaterThan(0))
    provider.destroy()
    document.destroy()
    await vi.waitFor(() => expect(provider.wsconnected).toBe(false))

    const reconnectDocument = new Y.Doc()
    const reconnectProvider = new WebsocketProvider(websocketUrl, resolved.value.room, reconnectDocument, {
      WebSocketPolyfill: WebSocketPackage, disableBc: true, params: {token: resolved.value.token},
    })
    await vi.waitFor(() => expect(reconnectProvider.wsconnected).toBe(true))
    await vi.waitFor(() => expect(reconnectDocument.getMap("widget-data").get("answer")).toBe("saved"))
    reconnectProvider.destroy()
    reconnectDocument.destroy()

    await developmentServer.close()
    developmentServer = await createDevServer({port: 0, vite: false, dataDirectory})
    baseUrl = (await developmentServer.listen()).url
    const afterRestart = await request("/api/widget-data/resolve", {
      method: "POST",
      body: JSON.stringify({document: "lesson-1", widget: "poll", mode: "individual"}),
    })
    expect(afterRestart.value.room).toBe(resolved.value.room)
    const restored = new Y.Doc()
    const restoredProvider = new WebsocketProvider(baseUrl.replace(/^http/, "ws"), afterRestart.value.room, restored, {
      WebSocketPolyfill: WebSocketPackage, disableBc: true, params: {token: afterRestart.value.token},
    })
    await vi.waitFor(() => expect(restoredProvider.wsconnected).toBe(true))
    await vi.waitFor(() => expect(restored.getMap("widget-data").get("answer")).toBe("saved"))
    restoredProvider.destroy()
    restored.destroy()
  })

  it("resolves group rooms from the authoritative shared PI and protects grouping context", async () => {
    const document = "lesson-grouping"
    const documentRoom = "room-grouping-document"
    const widget = "poll-one"
    const rules = groupingRules()
    const declaration = encodeURIComponent(JSON.stringify(rules))
    writeWidgetGrouping(documentRoom, widget, declaration)

    const deniedContext = await request(`/api/widget-grouping/context?document=${document}&widget=${widget}&room=${documentRoom}`)
    expect(deniedContext.response.status).toBe(403)
    const context = await request(`/api/widget-grouping/context?document=${document}&widget=${widget}&room=${documentRoom}`, {
      headers: {"X-Test-Manage": "yes"},
    })
    expect(context.response.status).toBe(200)
    expect(context.value).toEqual(expect.objectContaining({canManage: true, participants: expect.arrayContaining([expect.objectContaining({id: "ada"})])}))
    expect(context.value.groups).toEqual(expect.arrayContaining([expect.objectContaining({name: "A"}), expect.objectContaining({name: "B"})]))
    expect(context.value.groupings).toEqual(expect.arrayContaining([expect.objectContaining({name: "Grouping"})]))
    const savedGroupingId = context.value.groupings.find(grouping => grouping.name === "Grouping").id
    const formed = widgetGroupsFormed.mock.calls[0][1].result
    expect(context.value.groups.map(group => group.id)).toContain(formed.groups[0].id)
    expect(context.value.groupings.map(grouping => grouping.id)).toContain(formed.grouping.id)

    const resolve = (user, groupingRevision = declaration) => request("/api/widget-data/resolve", {
      method: "POST",
      headers: {"X-Test-User": user},
      body: JSON.stringify({document, documentRoom, widget, mode: "group", groupingRevision}),
    })
    const ada = await resolve("ada")
    const amy = await resolve("amy")
    const lin = await resolve("lin")
    expect(ada.response.status).toBe(200)
    expect(amy.value.room).toBe(ada.value.room)
    expect(lin.response.status).toBe(200)
    expect(ada.value.room).not.toBe(lin.value.room)
    expect((await resolve("unknown")).response.status).toBe(403)

    const revisedRules = {...rules, seed: "reconfigured-seed"}
    const revisedDeclaration = encodeURIComponent(JSON.stringify(revisedRules))
    writeWidgetGrouping(documentRoom, widget, revisedDeclaration)
    expect((await resolve("ada")).response.status).toBe(409)
    const revisedAda = await resolve("ada", revisedDeclaration)
    expect(revisedAda.response.status).toBe(200)
    expect(revisedAda.value.room).not.toBe(ada.value.room)
    const revisedGroupingId = widgetGroupsFormed.mock.calls.at(-1)[1].result.grouping.id
    const reuseRules = defaultGroupingRules("reuse-grouping")
    reuseRules.method = "existing"
    reuseRules.grouping = "existing"
    reuseRules.groupingId = savedGroupingId
    reuseRules.existingGroupingId = savedGroupingId
    const reuseDeclaration = encodeURIComponent(JSON.stringify(reuseRules))
    const reuseWidget = "poll-two"
    writeWidgetGrouping(documentRoom, reuseWidget, reuseDeclaration)
    const reused = await request("/api/widget-data/resolve", {
      method: "POST",
      headers: {"X-Test-User": "ada"},
      body: JSON.stringify({document, documentRoom, widget: reuseWidget, mode: "group", groupingRevision: reuseDeclaration}),
    })
    expect(reused.response.status).toBe(200)
    expect(reused.value.room).toBeTruthy()
    const appendRules = defaultGroupingRules("append-groups")
    appendRules.number = 1
    appendRules.grouping = "existing"
    appendRules.groupingId = revisedGroupingId
    const appendDeclaration = encodeURIComponent(JSON.stringify(appendRules))
    const appendWidget = "poll-three"
    writeWidgetGrouping(documentRoom, appendWidget, appendDeclaration)
    const appended = await request("/api/widget-data/resolve", {
      method: "POST",
      headers: {"X-Test-User": "ada"},
      body: JSON.stringify({document, documentRoom, widget: appendWidget, mode: "group", groupingRevision: appendDeclaration}),
    })
    expect(appended.response.status).toBe(200)
    const appendedContext = await request(`/api/widget-grouping/context?document=${document}&widget=${appendWidget}&room=${documentRoom}`, {
      headers: {"X-Test-Manage": "yes"},
    })
    expect(appendedContext.value.groupings.find(grouping => grouping.id === revisedGroupingId).groups).toHaveLength(5)
    expect((await request("/api/widget-data/resolve", {
      method: "POST",
      body: JSON.stringify({document, documentRoom, widget: "missing-widget", mode: "group", groupingRevision: revisedDeclaration}),
    })).response.status).toBe(409)

    const automaticRules = defaultGroupingRules("stable-grouping")
    automaticRules.allocateBy = "firstname"
    const automaticDeclaration = encodeURIComponent(JSON.stringify(automaticRules))
    const rosterRoom = "room-grouping-roster"
    writeWidgetGrouping(rosterRoom, widget, automaticDeclaration)
    const resolveWithRoster = headers => request("/api/widget-data/resolve", {
      method: "POST",
      headers: {"X-Test-User": "ada", ...headers},
      body: JSON.stringify({document, documentRoom: rosterRoom, widget, mode: "group", groupingRevision: automaticDeclaration}),
    })
    const originalRosterRoom = await resolveWithRoster({})
    const expandedRosterRoom = await resolveWithRoster({"X-Test-Roster": "expanded"})
    expect(expandedRosterRoom.value.room).not.toBe(originalRosterRoom.value.room)

    const ignoreRules = defaultGroupingRules("ignore-repeat")
    ignoreRules.ignoreGrouped = true
    ignoreRules.allocateBy = "firstname"
    const ignoreDeclaration = encodeURIComponent(JSON.stringify(ignoreRules))
    const ignoreWidget = "poll-ignore"
    const ignoreRoom = "room-grouping-ignore"
    writeWidgetGrouping(ignoreRoom, ignoreWidget, ignoreDeclaration)
    const resolveIgnoringGrouped = headers => request("/api/widget-data/resolve", {
      method: "POST",
      headers: {"X-Test-User": "ada", ...headers},
      body: JSON.stringify({document, documentRoom: ignoreRoom, widget: ignoreWidget, mode: "group", groupingRevision: ignoreDeclaration}),
    })
    const ignoreFirst = await resolveIgnoringGrouped({})
    const ignoreSecond = await resolveIgnoringGrouped({})
    const ownGroupId = widgetGroupsFormed.mock.calls.at(-1)[1].result.assignments.ada
    const ignoreWithProviderMembership = await resolveIgnoringGrouped({"X-Test-Owned-Group": ownGroupId})
    expect(ignoreFirst.response.status).toBe(200)
    expect(ignoreSecond.response.status).toBe(200)
    expect(ignoreSecond.value.room).toBe(ignoreFirst.value.room)
    expect(ignoreWithProviderMembership.response.status).toBe(200)
    expect(ignoreWithProviderMembership.value.room).toBe(ignoreFirst.value.room)

    const {dataDirectory} = developmentServer
    await developmentServer.close()
    const oldDocument = docs.get(documentRoom)
    docs.delete(documentRoom)
    oldDocument?.destroy()
    developmentServer = await createDevServer({
      port: 0,
      vite: false,
      dataDirectory,
      resolveWidgetDataIdentity: request => ({userId: request.headers["x-test-user"] ?? "local-development"}),
      resolveWidgetGroupingContext: request => ({
        canManage: request.headers["x-test-manage"] === "yes",
        participants: [
          {id: "ada", firstName: "Ada", active: true, roles: [], cohorts: [], groups: [], groupings: []},
          {id: "amy", firstName: "Amy", active: true, roles: [], cohorts: [], groups: [], groupings: []},
          {id: "lin", firstName: "Lin", active: true, roles: [], cohorts: [], groups: [], groupings: []},
        ],
        groups: [], groupings: [], roles: [], cohorts: [],
      }),
    })
    baseUrl = (await developmentServer.listen()).url
    const restoredContext = await request(`/api/widget-grouping/context?document=${document}&widget=${widget}&room=${documentRoom}`, {
      headers: {"X-Test-Manage": "yes"},
    })
    expect(restoredContext.response.status).toBe(200)
    expect(restoredContext.value.groups).toEqual(expect.arrayContaining([expect.objectContaining({name: "A"}), expect.objectContaining({name: "B"})]))
    expect(restoredContext.value.groupings).toEqual(expect.arrayContaining([expect.objectContaining({name: "Grouping"})]))
  })

  it("survives a malformed close frame from a collaboration client", async () => {
    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const socket = await openWebSocket(`${websocketUrl}/malformed-close`)
    try {
      const closed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Malformed connection did not close")), 2_000)
        socket.once("close", () => {
          clearTimeout(timer)
          resolve()
        })
      })
      // A masked close frame whose status code is 26057, outside the WebSocket range.
      socket._socket.write(Buffer.from([0x88, 0x82, 0, 0, 0, 0, 0x65, 0xc9]))
      await closed

      expect((await request("/api/session")).response.status).toBe(200)
      const replacement = await openWebSocket(`${websocketUrl}/malformed-close`)
      await closeWebSocket(replacement)
    }
    finally {
      socket.terminate()
    }
  })

  it("rejects oversized frames on generic and host collaboration sockets", async () => {
    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const payload = Buffer.alloc(8 * 1024 * 1024 + 1)
    const expectPayloadClose = async socket => {
      const closed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Oversized frame was not closed")), 5_000)
        socket.once("close", code => {
          clearTimeout(timer)
          resolve(code)
        })
      })
      socket.send(payload)
      // ws enforces maxPayload by closing with 1009 (message too big).
      await expect(closed).resolves.toBe(1009)
    }

    const generic = await openWebSocket(`${websocketUrl}/oversized-generic`)
    await expectPayloadClose(generic)

    const host = await openWebSocket(`${websocketUrl}/live-session-oversized-host?role=host&token=aaaaaaaaaaaaaaaaaaaaaaaa&hostKey=hhhhhhhhhhhhhhhhhhhhhhhh`)
    await expectPayloadClose(host)
  })

  it("requires the host capability for live-session WebSockets and releases empty rooms", async () => {
    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const room = "live-session-token-test"
    const firstToken = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const secondToken = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const hostKey = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const learnerIdentity = "&learner=ada&learnerKey=llllllllllllllllllllllll"

    await expect(openWebSocket(`${websocketUrl}/${room}?role=learner&token=${firstToken}`)).rejects.toBeInstanceOf(Error)

    const host = await openWebSocket(`${websocketUrl}/${room}?role=host&token=${firstToken}&hostKey=${hostKey}`)
    await expect(openWebSocket(`${websocketUrl}/${room}?role=host&token=${firstToken}&hostKey=${secondToken}`)).rejects.toBeInstanceOf(Error)
    await expect(openWebSocket(`${websocketUrl}/${room}?role=learner&token=${secondToken}`)).rejects.toBeInstanceOf(Error)
    const learner = await openWebSocket(`${websocketUrl}/${room}?role=learner&token=${firstToken}${learnerIdentity}`)
    await expect(openWebSocket(`${websocketUrl}/${room}?role=learner&token=${firstToken}&learner=ada&learnerKey=${secondToken}`)).rejects.toBeInstanceOf(Error)
    await closeWebSocket(learner)
    await closeWebSocket(host)

    const replacementHost = await openWebSocket(`${websocketUrl}/${room}?role=host&token=${secondToken}&hostKey=${hostKey}`)
    await closeWebSocket(replacementHost)
  })

  it("accepts learner activity but rejects writes to host metadata over the actual socket", async () => {
    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const room = "live-session-roles"
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const hostDoc = new Y.Doc()
    hostDoc.getMap("live-session-meta").set("baseHTML", "<p>Host</p>")
    const host = new WebsocketProvider(websocketUrl, room, hostDoc, {
      WebSocketPolyfill: WebSocketPackage, disableBc: true,
      params: {role: "host", token, hostKey: "hhhhhhhhhhhhhhhhhhhhhhhh"},
    })
    const learnerDoc = new Y.Doc()
    let learner
    try {
      await vi.waitFor(() => expect(host.synced).toBe(true))
      learner = new WebsocketProvider(websocketUrl, room, learnerDoc, {
        WebSocketPolyfill: WebSocketPackage, disableBc: true,
        params: {role: "learner", token, learner: "ada", learnerKey: "llllllllllllllllllllllll"},
      })
      learner.awareness.setLocalState({liveSession: {role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}}})
      await vi.waitFor(() => expect(learner.synced).toBe(true))
      learnerDoc.getArray("live-session-steps").push([{id: "step", time: Date.now(), kind: "pointer", learner: "ada", pointer: {x: 0.2, y: 0.3}}])
      await vi.waitFor(() => expect(hostDoc.getArray("live-session-steps").length).toBe(1))
      learnerDoc.getMap("live-session-meta").set("baseHTML", "<script>attack</script>")
      await vi.waitFor(() => expect(learner.wsconnected).toBe(false))
      expect(hostDoc.getMap("live-session-meta").get("baseHTML")).toBe("<p>Host</p>")
    }
    finally {
      learner?.destroy()
      host.destroy()
      learnerDoc.destroy()
      hostDoc.destroy()
    }
  })
})


describe("Git developer packages", () => {
  it("serves immutable, uncached snapshots with executable MIME types and frame CORS", async () => {
    const source = {repository: "https://gitlab.example/demo.git", ref: "v1.0.0", path: "packages/demo"}
    const {response, value} = await request("/api/developer-packages/git", {method: "POST", body: JSON.stringify(source)})
    expect(response.status).toBe(200)
    expect(gitPackageFetch).toHaveBeenCalledWith(source)
    expect(value).toMatchObject({source, commit: "abc123", baseUrl: `${baseUrl}/api/developer-packages/git/${value.id}/`})
    const script = await fetch(value.baseUrl + "dist/demo.js", {headers: {Origin: "http://localhost:1234"}})
    expect(script.headers.get("Content-Type")).toBe("text/javascript")
    expect(script.headers.get("Cache-Control")).toBe("no-store")
    expect(script.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:1234")
    expect(await script.text()).toContain('version = "1.0.0"')
    const icon = await fetch(value.baseUrl + "dist/icon.png")
    expect(new Uint8Array(await icon.arrayBuffer())).toEqual(new Uint8Array([0, 255, 128]))
    const head = await fetch(value.baseUrl + "dist/demo.js", {method: "HEAD"})
    expect(head.status).toBe(200)
    expect(await head.text()).toBe("")
    const refreshed = await request("/api/developer-packages/git", {method: "POST", body: JSON.stringify(source)})
    expect(refreshed.value.id).toBe(value.id)
    expect(gitPackageFetch).toHaveBeenCalledTimes(2)
    expect((await fetch(value.baseUrl + "dist/demo.js")).status).toBe(200)
    expect((await fetch(value.baseUrl + "missing.js")).status).toBe(404)
    expect((await fetch(value.baseUrl + "dist/demo.js", {method: "PUT"})).status).toBe(405)
  })

  it("keeps another source's current resources available across repeated refreshes", async () => {
    const load = repository => request("/api/developer-packages/git", {method: "POST", body: JSON.stringify({repository})})
    const other = await load("https://example.test/other.git")
    const original = await load("https://example.test/demo.git")
    const files = new Map([["dist/demo.js", Buffer.from("export const version = 2")]])
    for(let index = 0; index < 40; index++) {
      gitPackageFetch.mockResolvedValueOnce({commit: `revision-${index}`, files})
      expect((await load("https://example.test/demo.git")).response.status).toBe(200)
    }
    expect((await fetch(other.value.baseUrl + "dist/demo.js")).status).toBe(200)
    expect((await fetch(original.value.baseUrl + "dist/demo.js")).status).toBe(410)
  })

  it("refuses a new source rather than evicting current resources when the cache is full", async () => {
    let first
    for(let index = 0; index < 32; index++) {
      const loaded = await request("/api/developer-packages/git", {method: "POST", body: JSON.stringify({repository: `https://example.test/package-${index}.git`})})
      expect(loaded.response.status).toBe(200)
      first ??= loaded.value
    }
    const refused = await request("/api/developer-packages/git", {method: "POST", body: JSON.stringify({repository: "https://example.test/overflow.git"})})
    expect(refused.response.status).toBe(503)
    expect((await fetch(first.baseUrl + "dist/demo.js")).status).toBe(200)
  })

  it.each(["GET", "HEAD"])("sandboxes direct navigation to package documents without allowing scripts or same-origin access (%s)", async method => {
    const {value} = await request("/api/developer-packages/git", {method: "POST", body: JSON.stringify({repository: "https://example.test/demo.git"})})
    for(const [path, type] of [["dist/page.html", "text/html"], ["dist/icon.svg", "image/svg+xml"], ["dist/demo.js", "text/javascript"]]) {
      const response = await fetch(value.baseUrl + path, {method})
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe(type)
      expect(response.headers.get("Content-Security-Policy")).toBe("sandbox")
    }
  })

  it("reports unknown snapshots and fetch errors without exposing a writable endpoint", async () => {
    expect((await request("/api/developer-packages/git/missing/package.json")).response.status).toBe(410)
    gitPackageFetch.mockRejectedValueOnce(new Error("Unknown branch or tag"))
    const failed = await request("/api/developer-packages/git", {method: "POST", body: JSON.stringify({repository: "https://example.test/demo.git", ref: "missing"})})
    expect(failed.value.error.message).toBe("Unknown branch or tag")
    const invalid = await request("/api/developer-packages/git", {method: "POST", body: JSON.stringify({repository: "file:///local"})})
    expect(invalid.response.status).toBe(400)
  })
})
