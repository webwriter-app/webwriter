// @vitest-environment node
import {mkdtemp} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {WebsocketProvider} from "y-websocket"
import WebSocketPackage from "ws"
import {createDevServer} from "./server.mjs"

let developmentServer
let baseUrl
let upstreamFetch

const request = async (path, init) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {"Content-Type": "application/json"},
    ...init,
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

beforeEach(async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "webwriter-dev-server-"))
  upstreamFetch = vi.fn().mockRejectedValue(new Error("Unexpected upstream inference request"))
  developmentServer = await createDevServer({port: 0, vite: false, dataDirectory, fetch: (...args) => upstreamFetch(...args)})
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

    expect((await request("/api/documents")).value.documents).toEqual([
      expect.objectContaining({id, title: "Lesson"}),
    ])
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
      customInstructions: expect.stringContaining("propose a document change"),
    }))

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

  it("requires the host capability for live-session WebSockets and releases empty rooms", async () => {
    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const room = "live-session-token-test"
    const firstToken = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const secondToken = "bbbbbbbbbbbbbbbbbbbbbbbb"

    await expect(openWebSocket(`${websocketUrl}/${room}?role=learner&token=${firstToken}`)).rejects.toBeInstanceOf(Error)

    const host = await openWebSocket(`${websocketUrl}/${room}?role=host&token=${firstToken}`)
    await expect(openWebSocket(`${websocketUrl}/${room}?role=learner&token=${secondToken}`)).rejects.toBeInstanceOf(Error)
    const learner = await openWebSocket(`${websocketUrl}/${room}?role=learner&token=${firstToken}`)
    await closeWebSocket(learner)
    await closeWebSocket(host)

    const replacementHost = await openWebSocket(`${websocketUrl}/${room}?role=host&token=${secondToken}`)
    await closeWebSocket(replacementHost)
  })
})
