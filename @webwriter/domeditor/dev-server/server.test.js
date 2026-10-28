// @vitest-environment node
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {request as httpRequest} from "node:http"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {WebsocketProvider} from "y-websocket"
import {docs, getYDoc} from "@y/websocket-server/utils"
import WebSocketPackage from "ws"
import {createDevServer} from "./server.mjs"
import {LiveSession} from "../src/live-session"
import {encodeLiveSessionFeedback} from "../src/live-session-permissions.js"
import {defaultGroupingRules, distributionGroupingRevision, groupingTarget} from "../src/widget-grouping.js"
import {distributionTarget, emptyDistributionConfig, encodeDistributionConfig} from "../src/distribution.js"

const exampleDocuments = JSON.parse(await readFile(new URL("../src/example-documents.json", import.meta.url), "utf8"))

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

const rawRequest = (path, init = {}) => new Promise((resolve, reject) => {
  const outgoing = httpRequest(`${baseUrl}${path}`, init, response => {
    const chunks = []
    response.on("data", chunk => chunks.push(chunk))
    response.on("error", reject)
    response.on("end", () => resolve(new Response(response.statusCode === 204 || init.method === "HEAD"
      ? null : Buffer.concat(chunks), {status: response.statusCode, headers: response.headers})))
  })
  outgoing.on("error", reject)
  outgoing.end(init.body)
})

const openWebSocket = (url, options) => new Promise((resolve, reject) => {
  const socket = new WebSocketPackage(url, options)
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
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("VPN-only private testing", () => {
  const appOrigin = "https://authors.vpn.example:8443"
  const editorOrigin = "https://content.vpn.example:8443"
  const privateOptions = () => ({privateTesting: true, appOrigin, editorOrigin, port: 0,
    dataDirectory: developmentServer.dataDirectory, fetch: (...args) => upstreamFetch(...args)})
  const startPrivate = async () => {
    const options = privateOptions()
    await developmentServer.close()
    developmentServer = await createDevServer(options)
    baseUrl = (await developmentServer.listen()).url
  }
  // Connect to loopback while preserving the VPN proxy's Host and browser Origin.
  const privateRequest = (path, init = {}) => rawRequest(path, {...init, headers: {
    Host: new URL(appOrigin).host, Origin: appOrigin, "Content-Type": "application/json", ...init.headers,
  }})
  const socketOptions = (origin = editorOrigin, host = new URL(appOrigin).host) => ({headers: {Host: host, Origin: origin}})

  it("requires explicit HTTPS origins, isolated data, and a loopback bind", async () => {
    vi.stubEnv("VITE_APP_ORIGIN", "")
    vi.stubEnv("VITE_EDITOR_ORIGIN", "")
    vi.stubEnv("WEBWRITER_DEV_DATA_DIR", "")
    for(const value of [undefined, "http://authors.vpn.example", "https://authors.vpn.example/path", "https://user:pass@authors.vpn.example", "https://authors.vpn.example?query", "*"]) {
      await expect(createDevServer({...privateOptions(), appOrigin: value})).rejects.toThrow("VITE_APP_ORIGIN")
      await expect(createDevServer({...privateOptions(), editorOrigin: value})).rejects.toThrow("VITE_EDITOR_ORIGIN")
    }
    await expect(createDevServer({...privateOptions(), editorOrigin: appOrigin})).rejects.toThrow("separate")
    await expect(createDevServer({...privateOptions(), dataDirectory: undefined})).rejects.toThrow("WEBWRITER_DEV_DATA_DIR")
    await expect(createDevServer({...privateOptions(), dataDirectory: ".webwriter-dev"})).rejects.toThrow("default development data")
    await expect(createDevServer({...privateOptions(), host: "0.0.0.0"})).rejects.toThrow("loopback")
  })

  it("advertises canonical no-auth cloud URLs and serves no Vite sources", async () => {
    await startPrivate()
    const response = await privateRequest("/api/session", {headers: {"X-Forwarded-Host": "attacker.example", "X-Forwarded-Proto": "http"}})
    expect(await response.json()).toMatchObject({kind: "webwriter-cloud-service", authentication: "none",
      user: {id: "local-development", name: "Private tester"}, apiBaseUrl: `${appOrigin}/api`,
      collaborationUrl: appOrigin.replace(/^https/, "wss"), adminUrl: `${appOrigin}/admin`})
    for(const path of ["/src/editor-page.ts", "/@vite/client", "/.env.local", "/editor/"]) {
      expect((await privateRequest(path)).status).toBe(404)
    }
    const admin = await privateRequest("/admin")
    expect(await admin.text()).toContain("Private testing · shared identity · no authentication")
  })

  it("stops the private CLI cleanly and retains its storage across a restart", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "webwriter-private-restart-"))
    const originalBase = baseUrl
    const child = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url)), "--private-testing"], {
      env: {...process.env, VITE_APP_ORIGIN: appOrigin, VITE_EDITOR_ORIGIN: editorOrigin,
        WEBWRITER_DEV_HOST: "127.0.0.1", WEBWRITER_DEV_PORT: "0", WEBWRITER_DEV_DATA_DIR: dataDirectory,
        OPENAI_API_KEY: ""},
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stopped = new Promise(resolve => child.once("exit", (code, signal) => resolve({code, signal})))
    let restored
    try {
      baseUrl = await new Promise((resolve, reject) => {
        let output = ""
        const timeout = setTimeout(() => reject(new Error("Private CLI did not start")), 3000)
        child.once("error", error => { clearTimeout(timeout); reject(error) })
        child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Private CLI exited before startup (${code})`)) })
        child.stdout.on("data", chunk => {
          output += chunk.toString()
          const address = /private-testing backend: (http:\/\/127\.0\.0\.1:\d+)/.exec(output)
          if(address) { clearTimeout(timeout); resolve(address[1]) }
        })
        child.stderr.resume()
      })
      const created = await privateRequest("/api/documents", {method: "POST", body: JSON.stringify({title: "Persisted", content: "<p>Survives replacement</p>", format: "html"})})
      const {document} = await created.json()
      await privateRequest("/api/providers", {method: "POST", body: JSON.stringify({id: "persisted-provider", name: "Persisted AI", baseUrl: "https://ai.example/v1", auth: "none", models: ["test"]})})
      const socket = await openWebSocket(`${baseUrl.replace(/^http/, "ws")}/cli-shutdown-room`, socketOptions())
      const disconnected = new Promise(resolve => socket.once("close", resolve))
      child.kill("SIGTERM")
      expect(await stopped).toEqual({code: 0, signal: null})
      await disconnected
      restored = await createDevServer({...privateOptions(), dataDirectory})
      baseUrl = (await restored.listen()).url
      const reloaded = await privateRequest(`/api/documents/${document.id}`)
      expect((await reloaded.json()).document).toMatchObject(document)
      const providers = await privateRequest("/api/providers")
      expect((await providers.json()).providers).toContainEqual(expect.objectContaining({id: "persisted-provider"}))
    }
    finally {
      if(child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await stopped }
      await restored?.close()
      baseUrl = originalBase
    }
  })

  it("allows only configured hosts and exact browser origins for HTTP and CORS", async () => {
    await startPrivate()
    for(const Origin of [appOrigin, editorOrigin]) {
      const response = await privateRequest("/api/widget-data/resolve", {method: "OPTIONS", headers: {Origin}})
      expect(response.status).toBe(204)
      expect(response.headers.get("access-control-allow-origin")).toBe(Origin)
      expect(response.headers.get("access-control-allow-credentials")).toBe("true")
    }
    for(const Origin of ["null", "http://localhost:1234", "https://attacker.example", `${editorOrigin}.attacker.example`, "https://content.vpn.example"]) {
      const response = await privateRequest("/api/session", {headers: {Origin}})
      expect(response.status).toBe(403)
      expect(response.headers.has("access-control-allow-origin")).toBe(false)
    }
    for(const Host of ["localhost:1234", "attacker.example", "authors.vpn.example", "authors.vpn.example:8443.attacker.example"]) {
      expect((await privateRequest("/api/session", {headers: {Host}})).status).toBe(403)
    }
    expect((await fetch(`${baseUrl}/api/session`)).status).toBe(403)
  })

  it("keeps shared documents, server-managed inference, and widget-data capabilities working", async () => {
    await startPrivate()
    const created = await privateRequest("/api/documents", {method: "POST", body: JSON.stringify({title: "VPN lesson", content: "<x-lesson><!--preserved--></x-lesson>", format: "html"})})
    const {document} = await created.json()
    const saved = await privateRequest(`/api/documents/${document.id}`, {method: "PATCH", body: JSON.stringify({title: "Updated"})})
    expect((await saved.json()).document).toMatchObject({title: "Updated", content: document.content})
    const listed = await privateRequest("/api/documents")
    expect((await listed.json()).documents).toContainEqual(expect.objectContaining({id: document.id, title: "Updated"}))

    await privateRequest("/api/providers", {method: "POST", body: JSON.stringify({id: "vpn-ai", name: "Test AI", baseUrl: "https://ai.example/v1", auth: "bearer", apiKey: "test-secret", models: ["test-model"]})})
    const providers = await privateRequest("/api/providers")
    const payload = await providers.text()
    expect(payload).not.toContain("test-secret")
    expect(JSON.parse(payload).providers.find(provider => provider.id === "vpn-ai").inferenceUrl).toBe(`${appOrigin}/api/inference/providers/vpn-ai`)
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({id: "completion", choices: [{message: {role: "assistant", content: "Hello"}}]}), {headers: {"Content-Type": "application/json"}}))
    expect((await privateRequest("/api/inference/providers/vpn-ai/chat/completions", {method: "POST", body: JSON.stringify({model: "test-model", messages: []})})).status).toBe(200)

    const scoped = await privateRequest("/api/widget-data/resolve", {method: "POST", headers: {Origin: editorOrigin}, body: JSON.stringify({document: document.id, widget: "poll", mode: "individual", format: "json"})})
    expect(scoped.status).toBe(200)
    const {room, token} = await scoped.json()
    const socket = await openWebSocket(`${baseUrl.replace(/^http/, "ws")}/${room}?token=${token}`, socketOptions())
    await closeWebSocket(socket)
  })

  it("rejects content-origin document and provider access, including the retained-key exfiltration sequence", async () => {
    await startPrivate()
    await privateRequest("/api/providers", {method: "POST", body: JSON.stringify({id: "protected", name: "Protected", baseUrl: "https://provider.example/v1", auth: "bearer", apiKey: "dummy-protected-key"})})
    for(const [path, init] of [
      ["/api/documents", {}],
      ["/api/providers", {}],
      ["/admin", {}],
      ["/api/providers/protected", {method: "PATCH", body: JSON.stringify({baseUrl: "https://attacker.invalid/v1"})}],
      ["/api/inference/providers/protected/models", {}],
      ["/api/providers/protected", {method: "OPTIONS", headers: {"Access-Control-Request-Method": "PATCH"}}],
    ]) {
      const response = await privateRequest(path, {...init, headers: {...init.headers, Origin: editorOrigin}})
      expect(response.status).toBe(403)
      expect(response.headers.has("access-control-allow-origin")).toBe(false)
    }
    expect(upstreamFetch).not.toHaveBeenCalled()
    expect((await (await privateRequest("/api/providers/protected")).json()).provider.baseUrl).toBe("https://provider.example/v1")
  })

  it("accepts collaboration upgrades only on the application host from configured origins", async () => {
    await startPrivate()
    const url = `${baseUrl.replace(/^http/, "ws")}/vpn-collaboration`
    for(const origin of [appOrigin, editorOrigin]) {
      const socket = await openWebSocket(url, socketOptions(origin))
      await closeWebSocket(socket)
    }
    for(const options of [socketOptions("https://attacker.example"), socketOptions("null"),
      {headers: {Host: new URL(appOrigin).host}}, socketOptions(editorOrigin, new URL(editorOrigin).host),
      socketOptions(editorOrigin, "localhost:1234"), {...socketOptions(), headers: {...socketOptions().headers, "Sec-WebSocket-Protocol": "vite-hmr"}}]) {
      await expect(openWebSocket(url, options)).rejects.toBeInstanceOf(Error)
    }
  })

  it("publishes live documents exclusively on the content origin with WSS and existing role protections", async () => {
    await startPrivate()
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa", hostKey = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const html = "<!doctype html><x-lesson>Live VPN lesson</x-lesson>"
    const published = await privateRequest("/api/live-sessions/vpn-lesson", {method: "PUT", body: JSON.stringify({token, hostKey, html})})
    const {url} = await published.json()
    const link = new URL(url)
    expect(link.origin).toBe(editorOrigin)
    expect(link.searchParams.get("liveServer")).toBe(appOrigin.replace(/^https/, "wss"))
    const path = link.pathname + link.search
    expect((await privateRequest(path)).status).toBe(403)
    const headers = {Host: new URL(editorOrigin).host}
    expect(await (await privateRequest(path, {headers})).text()).toBe(html)
    expect((await privateRequest(path, {headers, method: "HEAD"})).status).toBe(200)
    expect((await privateRequest(path.replace(token, "bbbbbbbbbbbbbbbbbbbbbbbb"), {headers})).status).toBe(404)
    expect((await privateRequest("/api/documents", {headers})).status).toBe(403)
    expect((await privateRequest("/admin", {headers})).status).toBe(403)
    const socketUrl = `${baseUrl.replace(/^http/, "ws")}/live-session-vpn-lesson?token=${token}`
    await expect(openWebSocket(`${socketUrl}&role=host&hostKey=iiiiiiiiiiiiiiiiiiiiiiii`, socketOptions())).rejects.toBeInstanceOf(Error)
    const host = await openWebSocket(`${socketUrl}&role=host&hostKey=${hostKey}`, socketOptions(appOrigin))
    const learner = await openWebSocket(`${socketUrl}&role=learner&learner=ada&learnerKey=llllllllllllllllllllllll`, socketOptions())
    await closeWebSocket(learner)
    await closeWebSocket(host)
    await vi.waitFor(async () => expect((await privateRequest(path, {headers})).status).toBe(404))
  })
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

  it.each(["attacker.invalid:1234", "localhost.attacker.invalid", "localhost@attacker.invalid", "localhost:bad", "localhost:65536"])("rejects an untrusted or malformed Host header %s without Origin", async Host => {
    const status = await new Promise((resolve, reject) => {
      const outgoing = httpRequest(`${baseUrl}/api/documents`, {headers: {Host}}, response => {
        response.resume()
        response.once("end", () => resolve(response.statusCode))
      })
      outgoing.once("error", reject)
      outgoing.end()
    })
    expect(status).toBe(403)
  })

  it("rejects WebSocket upgrades with an untrusted Host header", async () => {
    await expect(new Promise((resolve, reject) => {
      const socket = new WebSocketPackage(`${baseUrl.replace(/^http/, "ws")}/untrusted-host`, {headers: {Host: "attacker.invalid"}})
      socket.once("open", () => { socket.terminate(); resolve() })
      socket.once("error", reject)
    })).rejects.toBeInstanceOf(Error)
  })

  it("accepts bracketed IPv6 origins and advertises a usable IPv6 URL", async () => {
    const response = await fetch(`${baseUrl}/api/session`, {headers: {Origin: "http://[::1]:1234"}})
    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe("http://[::1]:1234")
    await developmentServer.close()
    developmentServer = await createDevServer({host: "::1", port: 0, vite: false, dataDirectory: developmentServer.dataDirectory})
    const address = await developmentServer.listen()
    expect(new URL(address.url).hostname).toBe("[::1]")
    expect((await fetch(`${address.url}/api/session`)).status).toBe(200)
  })

  it("separates the default application and content hosts for privileged endpoints and live documents", async () => {
    const content = new URL(baseUrl)
    content.hostname = "localhost"
    expect((await request("/api/documents", {headers: {Origin: baseUrl}})).response.status).toBe(200)
    for(const [path, init] of [
      ["/api/documents", {}], ["/admin", {}],
      ["/api/providers", {method: "POST", body: JSON.stringify({name: "Forbidden", baseUrl: "https://attacker.invalid", auth: "none"})}],
      ["/api/providers", {method: "OPTIONS", headers: {"Access-Control-Request-Method": "POST"}}],
    ]) {
      const {response} = await request(path, {...init, headers: {...init.headers, Origin: content.origin}})
      expect(response.status).toBe(403)
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false)
      // Same-origin fetches need not carry Origin; the content Host cannot
      // turn into an application API just by omitting that header.
      expect((await rawRequest(path, {...init, headers: {...init.headers, Host: content.host}})).status).toBe(403)
    }
    const redirect = await fetch(`${baseUrl}/live/?liveSession=missing`, {redirect: "manual"})
    expect(redirect.status).toBe(307)
    expect(new URL(redirect.headers.get("Location")).origin).toBe(content.origin)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it("allows an explicitly configured separate frontend origin without granting its frames privileged access", async () => {
    await developmentServer.close()
    const appOrigin = "http://localhost:5173", editorOrigin = "http://127.0.0.1:5173"
    developmentServer = await createDevServer({port: 0, vite: false, appOrigin, editorOrigin, dataDirectory: developmentServer.dataDirectory})
    baseUrl = (await developmentServer.listen()).url
    expect((await request("/api/documents", {headers: {Origin: appOrigin}})).response.status).toBe(200)
    for(const Origin of [editorOrigin, "http://localhost:5174"]) {
      expect((await request("/api/documents", {headers: {Origin}})).response.status).toBe(403)
    }
    expect((await request("/api/widget-data/resolve", {method: "POST", headers: {Origin: editorOrigin},
      body: JSON.stringify({document: "lesson", widget: "poll", mode: "individual"})})).response.status).toBe(200)
  })

  it.each(["backend", "frontend"])("excludes the provider data directory from Vite's ordinary, raw, and absolute file routes: %s", async entry => {
    const projectRoot = fileURLToPath(new URL("../", import.meta.url))
    const dataDirectory = await mkdtemp(join(projectRoot, ".review-private-"))
    await writeFile(join(dataDirectory, "providers.json"), JSON.stringify({apiKey: "dummy-static-secret"}), {mode: 0o600})
    await developmentServer.close()
    developmentServer = undefined
    // Vite owns process-level worker and shutdown hooks. Exercise the CLI in
    // its own process, just like the private-testing startup regression.
    const args = entry === "backend" ? [fileURLToPath(new URL("./server.mjs", import.meta.url))] : ["--input-type=module", "-e", `
      import {createServer} from "vite"
      const vite = await createServer({server:{host:"127.0.0.1",port:0,strictPort:true,hmr:false,watch:null}})
      await vite.listen()
      console.log("development server: http://127.0.0.1:" + vite.httpServer.address().port)
      process.once("SIGTERM", async () => {await vite.close(); process.exit(0)})
    `]
    const child = spawn(process.execPath, args, {
      env: {...process.env, WEBWRITER_DEV_HOST: "127.0.0.1", WEBWRITER_DEV_PORT: "0", WEBWRITER_DEV_DATA_DIR: dataDirectory,
        VITE_APP_ORIGIN: "", VITE_EDITOR_ORIGIN: "", OPENAI_API_KEY: ""},
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stopped = new Promise(resolve => child.once("exit", (code, signal) => resolve({code, signal})))
    try {
      baseUrl = await new Promise((resolve, reject) => {
        let output = ""
        const timer = setTimeout(() => reject(new Error("Development CLI did not start")), 5000)
        child.once("error", error => { clearTimeout(timer); reject(error) })
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`Development CLI exited before startup (${code})`)) })
        child.stdout.on("data", chunk => {
          output += chunk.toString()
          const address = /development server: (http:\/\/127\.0\.0\.1:\d+)/.exec(output)
          if(address) { clearTimeout(timer); resolve(address[1]) }
        })
        child.stderr.resume()
      })
      const relative = dataDirectory.slice(projectRoot.length)
      for(const path of [`/${relative}/providers.json`, `/${relative}/providers.json?raw`, `/@fs${dataDirectory}/providers.json?raw`]) {
        const response = await fetch(`${baseUrl}${path}`, {headers: {Origin: "http://localhost:1234"}})
        expect(response.status).toBe(403)
        expect(await response.text()).not.toContain("dummy-static-secret")
      }
      child.kill("SIGTERM")
      const exit = await stopped
      expect(exit.signal).toBeNull()
      // Standalone Vite's SIGTERM hook may set the conventional 128 + 15
      // exit code before the inline wrapper's close hook completes.
      expect(entry === "frontend" ? [0, 143] : [0]).toContain(exit.code)
    }
    finally {
      if(child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await stopped }
      await rm(dataDirectory, {recursive: true, force: true})
    }
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

  it("persists sharing links, serves shared documents, and revokes shared sockets", async () => {
    const created = await request("/api/documents", {
      method: "POST",
      body: JSON.stringify({title: "Shared", content: "<p>Visible</p>"}),
    })
    const id = created.value.document.id
    const sharingPath = `/api/documents/${id}/sharing`
    expect((await request(sharingPath)).value).toEqual({sharing: {enabled: false}})

    const enabled = await request(sharingPath, {method: "PUT", body: JSON.stringify({enabled: true})})
    const token = enabled.value.sharing.token
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect((await request(sharingPath, {method: "PUT", body: JSON.stringify({enabled: true})})).value.sharing.token).toBe(token)
    expect((await request(`/api/shared-documents/${token}`)).value.document).toEqual(expect.objectContaining({id, content: "<p>Visible</p>"}))
    expect((await request(`/api/documents/${id}`)).value.document).not.toHaveProperty("sharing")

    const websocketUrl = `${baseUrl.replace(/^http/, "ws")}/document-${id}?share=${token}`
    const socket = await openWebSocket(websocketUrl)
    const disabled = await request(sharingPath, {method: "PUT", body: JSON.stringify({enabled: false})})
    expect(disabled.value).toEqual({sharing: {enabled: false}})
    await new Promise(resolve => socket.once("close", resolve))
    expect((await request(`/api/shared-documents/${token}`)).response.status).toBe(404)
    await expect(openWebSocket(websocketUrl)).rejects.toBeInstanceOf(Error)

    const reenabled = await request(sharingPath, {method: "PUT", body: JSON.stringify({enabled: true})})
    const deleteToken = reenabled.value.sharing.token
    const deleteSocket = await openWebSocket(`${baseUrl.replace(/^http/, "ws")}/document-${id}?share=${deleteToken}`)
    expect((await request(`/api/documents/${id}`, {method: "PATCH", body: JSON.stringify({title: "Still shared"})})).value.document)
      .not.toHaveProperty("sharing")
    expect((await request(sharingPath)).value.sharing.token).toBe(deleteToken)
    expect((await request(`/api/documents/${id}`, {method: "DELETE"})).response.status).toBe(204)
    await new Promise(resolve => deleteSocket.once("close", resolve))
    await expect(openWebSocket(`${baseUrl.replace(/^http/, "ws")}/document-${id}?share=${deleteToken}`)).rejects.toBeInstanceOf(Error)
  })

  it("merges concurrent partial document updates", async () => {
    const created = await request("/api/documents", {
      method: "POST",
      body: JSON.stringify({title: "Concurrent", content: "<p>Original</p>", format: "html"}),
    })
    const id = created.value.document.id
    const delayedPatch = patch => {
      let resolveResult
      let rejectResult
      const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
      const outgoing = httpRequest(`${baseUrl}/api/documents/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
      }, response => {
        const chunks = []
        response.on("data", chunk => chunks.push(chunk))
        response.on("end", () => resolveResult({status: response.statusCode, value: JSON.parse(Buffer.concat(chunks).toString("utf8"))}))
      })
      outgoing.once("error", rejectResult)
      outgoing.flushHeaders()
      return {outgoing, result, patch}
    }
    const first = delayedPatch({title: "Concurrent title"})
    const second = delayedPatch({content: "<p>Concurrent content</p>"})
    // Let the server receive both headers and begin reading both request
    // bodies before either partial update is available.
    await new Promise(resolve => setTimeout(resolve, 20))
    first.outgoing.end(JSON.stringify(first.patch))
    second.outgoing.end(JSON.stringify(second.patch))
    const responses = await Promise.all([first.result, second.result])

    expect(responses.map(response => response.status)).toEqual([200, 200])
    const saved = (await request(`/api/documents/${id}`)).value.document
    expect(saved).toEqual(expect.objectContaining({title: "Concurrent title", content: "<p>Concurrent content</p>"}))
  })

  it("seeds exactly the landing-page lessons with their authored HTML", async () => {
    const documents = (await request("/api/documents")).value.documents
    expect(documents.map(({id}) => id).sort()).toEqual(exampleDocuments.map(({id}) => `example-${id}`).sort())
    for(const example of exampleDocuments) {
      const id = `example-${example.id}`
      expect(documents).toContainEqual(expect.objectContaining({id, title: example.title, format: "html"}))
      expect(documents.find(document => document.id === id)).not.toHaveProperty("content")
      const {document} = (await request(`/api/documents/${id}`)).value
      expect(document.content).toBe(await readFile(new URL(`../examples/subjects/${example.id}.html`, import.meta.url), "utf8"))
    }
  })

  it("preserves edited lessons across restarts and restores deleted examples", async () => {
    const id = `example-${exampleDocuments[0].id}`
    const {document} = (await request(`/api/documents/${id}`)).value
    await request(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({title: "My lesson", content: "<p>Saved edits</p>"}),
    })
    const {dataDirectory} = developmentServer
    const restart = async () => {
      await developmentServer.close()
      developmentServer = await createDevServer({port: 0, vite: false, dataDirectory})
      baseUrl = (await developmentServer.listen()).url
    }
    await restart()
    expect((await request(`/api/documents/${id}`)).value.document).toEqual(expect.objectContaining({
      id, title: "My lesson", content: "<p>Saved edits</p>", createdAt: document.createdAt,
    }))
    expect((await request("/api/documents")).value.documents).toHaveLength(exampleDocuments.length)
    await request(`/api/documents/${id}`, {method: "DELETE"})
    await restart()
    expect((await request(`/api/documents/${id}`)).value.document).toEqual(expect.objectContaining({
      id, title: document.title, content: document.content,
    }))
  })

  it("removes legacy server examples while preserving other saved documents", async () => {
    const created = (await request("/api/documents", {
      method: "POST",
      body: JSON.stringify({title: "My document", content: "<p>Keep this</p>"}),
    })).value.document
    const {dataDirectory} = developmentServer
    await developmentServer.close()
    const legacyIds = (await readdir(new URL("../examples/", import.meta.url)))
      .filter(filename => /^\d{2}-.+\.html$/.test(filename))
      .map(filename => `example-${filename.slice(0, -5)}`)
    legacyIds.push("preset-mozilla-mathml-test", "preset-kitchen-sink")
    const otherId = "example-my-own-lesson"
    for(const id of [...legacyIds, otherId]) {
      await writeFile(join(dataDirectory, "documents", `${id}.json`), JSON.stringify({...created, id}))
    }
    developmentServer = await createDevServer({port: 0, vite: false, dataDirectory})
    baseUrl = (await developmentServer.listen()).url
    const documents = (await request("/api/documents")).value.documents
    expect(documents).toHaveLength(exampleDocuments.length + 2)
    for(const id of legacyIds) expect((await request(`/api/documents/${id}`)).response.status).toBe(404)
    expect((await request(`/api/documents/${created.id}`)).value.document).toEqual(created)
    expect((await request(`/api/documents/${otherId}`)).value.document).toEqual({...created, id: otherId})
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

  it("resolves numbered distribution groups from the nearest authoritative sharing instruction", async () => {
    const documentRoom = "numbered-distribution-room", widget = "numbered-widget"
    const serverDocument = getYDoc(documentRoom)
    const localDocument = new Y.Doc()
    const mirror = new Y.Map()
    localDocument.getMap("domeditor").set("document", mirror)
    const body = new Y.XmlElement("body"), head = new Y.XmlElement("head")
    mirror.set("body", body); mirror.set("head", head); mirror.set("attributes", new Y.XmlElement("html"))
    const parent = new Y.XmlElement("section"), target = new Y.XmlElement("data-widget")
    parent.setAttribute("id", "group-container"); target.setAttribute("id", widget)
    body.insert(0, [parent]); parent.insert(0, [target])
    const config = {...emptyDistributionConfig("group-container"), scope: "group", groupSize: 2}
    const instruction = value => {
      const node = new Y.XmlElement("domeditor-comment")
      node.setAttribute("__domeditor_node_kind", "processing-instruction")
      node.setAttribute("__domeditor_processing_instruction_target", distributionTarget)
      node.insert(0, [new Y.XmlText(encodeDistributionConfig(value))])
      return node
    }
    head.insert(0, [instruction(config)])
    Y.applyUpdate(serverDocument, Y.encodeStateAsUpdate(localDocument))
    const resolve = groupingRevision => request("/api/widget-data/resolve", {
      method: "POST", headers: {"X-Test-User": "ada"},
      body: JSON.stringify({document: "numbered-distribution", documentRoom, widget, mode: "group", groupingRevision}),
    })
    const first = await resolve(distributionGroupingRevision(config))
    expect(first.response.status).toBe(200)
    expect(widgetGroupsFormed.mock.calls.at(-1)[1].rules).toMatchObject({groupBy: "members", number: 2})
    const override = {...config, target: widget, groupSize: 4}
    head.insert(1, [instruction(override)])
    Y.applyUpdate(serverDocument, Y.encodeStateAsUpdate(localDocument))
    expect((await resolve(distributionGroupingRevision(config))).response.status).toBe(409)
    const second = await resolve(distributionGroupingRevision(override))
    expect(second.response.status).toBe(200)
    expect(second.value.room).not.toBe(first.value.room)
    expect(widgetGroupsFormed.mock.calls.at(-1)[1].rules.number).toBe(4)
    localDocument.destroy()
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

  it("stores a reserved live-session document and serves it to GET and HEAD", async () => {
    const id = "live-http-document"
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const hostKey = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const html = "<!doctype html><html><body><main>Live lesson</main></body></html>"
    const created = await fetch(`${baseUrl}/api/live-sessions/${id}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({token, hostKey, html}),
    })

    expect(created.status).toBe(201)
    const {url} = await created.json()
    const liveUrl = new URL(url)
    expect(liveUrl.pathname).toBe("/live/")
    expect(liveUrl.searchParams.get("liveSession")).toBe(id)
    expect(liveUrl.searchParams.get("liveToken")).toBe(token)
    expect(liveUrl.searchParams.get("liveServer")).toBe(baseUrl.replace(/^http/, "ws"))

    const query = `?liveSession=${id}&liveToken=${token}`
    const get = await fetch(`${baseUrl}/live/${query}`)
    expect(get.status).toBe(200)
    expect(get.headers.get("Content-Type")).toMatch(/^text\/html\b/i)
    expect(get.headers.get("Cache-Control")).toBe("no-store")
    expect(get.headers.get("Referrer-Policy")).toBe("no-referrer")
    await expect(get.text()).resolves.toBe(html)

    const head = await fetch(`${baseUrl}/live/${query}`, {method: "HEAD"})
    expect(head.status).toBe(200)
    expect(head.headers.get("Cache-Control")).toBe("no-store")
    expect(head.headers.get("Referrer-Policy")).toBe("no-referrer")
    await expect(head.text()).resolves.toBe("")

    for(const [index, invalidBody] of [
      {token: "unsafe token", hostKey, html},
      {token, hostKey: "short", html},
      {token, hostKey, html: ""},
    ].entries()) {
      const invalid = await fetch(`${baseUrl}/api/live-sessions/live-http-invalid-${index}`, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(invalidBody),
      })
      expect(invalid.status).toBe(400)
    }
    const unsafeId = await fetch(`${baseUrl}/api/live-sessions/bad%2Fid`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({token, hostKey, html}),
    })
    expect(unsafeId.status).toBe(404)
  })

  it("protects a reserved live-session document and releases it after its last socket closes", async () => {
    const id = "live-http-release"
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const hostKey = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const create = async credentials => fetch(`${baseUrl}/api/live-sessions/${id}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({token, hostKey, html: "<p>Reserved</p>", ...credentials}),
    })

    expect((await create({})).status).toBe(201)
    expect((await create({token: "bbbbbbbbbbbbbbbbbbbbbbbb"})).status).toBe(403)
    expect((await create({hostKey: "iiiiiiiiiiiiiiiiiiiiiiii"})).status).toBe(403)
    const query = `?liveSession=${id}&liveToken=${token}`
    expect((await fetch(`${baseUrl}/live/${query.replace(token, "bbbbbbbbbbbbbbbbbbbbbbbb")}`)).status).toBe(404)

    const room = `live-session-${id}`
    const host = await openWebSocket(`${baseUrl.replace(/^http/, "ws")}/${room}?role=host&token=${token}&hostKey=${hostKey}`)
    expect((await fetch(`${baseUrl}/live/${query}`)).status).toBe(200)
    await closeWebSocket(host)
    await vi.waitFor(async () => expect((await fetch(`${baseUrl}/live/${query}`)).status).toBe(404))
  })

  it("accepts an HTTP live document above the WebSocket frame limit and still syncs learner activity", async () => {
    const id = "live-http-large-document"
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const hostKey = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const learnerKey = "llllllllllllllllllllllll"
    const html = `<html><body>${"x".repeat(8 * 1024 * 1024 + 1)}</body></html>`
    const created = await fetch(`${baseUrl}/api/live-sessions/${id}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({token, hostKey, html}),
    })
    expect(created.status).toBe(201)
    expect(await (await fetch(`${baseUrl}/live/?liveSession=${id}&liveToken=${token}`)).text()).toBe(html)

    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const hostDoc = new Y.Doc()
    hostDoc.getMap("live-session-meta").set("status", "active")
    const room = `live-session-${id}`
    const host = new WebsocketProvider(websocketUrl, room, hostDoc, {
      WebSocketPolyfill: WebSocketPackage, disableBc: true,
      params: {role: "host", token, hostKey},
    })
    const learnerDoc = new Y.Doc()
    let learner
    try {
      await vi.waitFor(() => expect(host.synced).toBe(true))
      learner = new WebsocketProvider(websocketUrl, room, learnerDoc, {
        WebSocketPolyfill: WebSocketPackage, disableBc: true,
        params: {role: "learner", token, learner: "ada", learnerKey},
      })
      learner.awareness.setLocalState({liveSession: {role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}}})
      await vi.waitFor(() => expect(learner.synced).toBe(true))
      learnerDoc.getArray("live-session-steps").push([{id: "large-doc-step", time: Date.now(), kind: "pointer", learner: "ada", pointer: {x: 0.25, y: 0.5}}])
      await vi.waitFor(() => expect(hostDoc.getArray("live-session-steps").length).toBe(1))
      expect(hostDoc.getMap("live-session-meta").get("baseHTML")).toBeUndefined()
      expect(hostDoc.getMap("live-session-meta").get("previewDependencies")).toBeUndefined()
      const serverMeta = getYDoc(room).getMap("live-session-meta")
      expect(serverMeta.get("baseHTML")).toBeUndefined()
      expect(serverMeta.get("previewDependencies")).toBeUndefined()
    }
    finally {
      learner?.destroy()
      host.destroy()
      learnerDoc.destroy()
      hostDoc.destroy()
    }
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

  it("does not reserve host or learner capabilities after a failed WebSocket handshake", async () => {
    const room = "live-session-failed-handshake"
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa", replacementToken = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const hostKey = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const invalidHandshake = path => new Promise((resolve, reject) => {
      const outgoing = httpRequest(`${baseUrl}/${room}${path}`, {
        headers: {Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13"},
      }, response => {
        response.resume()
        response.once("end", () => resolve(response.statusCode))
      })
      outgoing.once("error", reject)
      outgoing.end()
    })
    expect(await invalidHandshake(`?role=host&token=${token}&hostKey=${hostKey}`)).toBe(400)
    const websocketUrl = baseUrl.replace(/^http/, "ws")
    const host = await openWebSocket(`${websocketUrl}/${room}?role=host&token=${replacementToken}&hostKey=${hostKey}`)
    try {
      expect(await invalidHandshake(`?role=learner&token=${replacementToken}&learner=ada&learnerKey=${token}`)).toBe(400)
      const learner = await openWebSocket(`${websocketUrl}/${room}?role=learner&token=${replacementToken}&learner=ada&learnerKey=${hostKey}`)
      await closeWebSocket(learner)
    }
    finally { await closeWebSocket(host) }
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

  it.each([false, true])("accepts legacy widget activity while enforcing explicit distribution policies: %s", async configured => {
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa", hostKey = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const id = `widget-policy-${configured}`
    const policy = emptyDistributionConfig("root")
    const carrier = configured ? `<!--?${distributionTarget} ${encodeDistributionConfig(policy)}?-->` : ""
    const html = `<html id="root"><head>${carrier}</head><body><test-widget answer="0"></test-widget></body></html>`
    expect((await request(`/api/live-sessions/${id}`, {method: "PUT", body: JSON.stringify({token, hostKey, html})})).response.status).toBe(201)
    const hostDoc = new Y.Doc(), learnerDoc = new Y.Doc()
    const serverUrl = baseUrl.replace(/^http/, "ws"), room = `live-session-${id}`
    const host = new WebsocketProvider(serverUrl, room, hostDoc, {
      WebSocketPolyfill: WebSocketPackage, disableBc: true, params: {role: "host", token, hostKey},
    })
    let learner
    try {
      await vi.waitFor(() => expect(host.synced).toBe(true))
      learner = new WebsocketProvider(serverUrl, room, learnerDoc, {
        WebSocketPolyfill: WebSocketPackage, disableBc: true,
        params: {role: "learner", token, learner: "ada", learnerKey: "llllllllllllllllllllllll"},
      })
      learner.awareness.setLocalState({liveSession: {role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}}})
      await vi.waitFor(() => expect(learner.synced).toBe(true))
      const nextHTML = html.replace('answer="0"', 'answer="42"')
      learnerDoc.getMap("live-session-states").set("ada", {learner: "ada", time: Date.now(), html: nextHTML})
      if(configured) {
        await vi.waitFor(() => expect(learner.wsconnected).toBe(false))
        expect(hostDoc.getMap("live-session-states").has("ada")).toBe(false)
      }
      else await vi.waitFor(() => expect(hostDoc.getMap("live-session-states").get("ada")?.html).toBe(nextHTML))
    }
    finally {
      learner?.destroy(); host.destroy()
      learnerDoc.destroy(); hostDoc.destroy()
    }
  })

  it("keeps feedback off the broadcast document and sends it only to authenticated recipients, including reconnects", async () => {
    const frames = new Map()
    vi.stubGlobal("WebSocket", class extends WebSocketPackage {
      constructor(url) {
        super(url)
        const query = new URL(url).searchParams
        const recipient = query.get("learner") ?? "host"
        const messages = frames.get(recipient) ?? []
        frames.set(recipient, messages)
        this.on("message", data => messages.push(Buffer.from(data)))
      }
    })
    const saved = new Map()
    vi.stubGlobal("sessionStorage", {getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value)})
    const options = {id: "private-feedback", serverUrl: baseUrl.replace(/^http/, "ws"), token: "aaaaaaaaaaaaaaaaaaaaaaaa"}
    const sessions = []
    const create = extra => {
      const session = new LiveSession({...options, ...extra})
      sessions.push(session)
      return session
    }
    const learner = id => create({role: "learner", learner: {id, name: id, color: "#08c"}})
    const host = create({role: "host", hostKey: "hhhhhhhhhhhhhhhhhhhhhhhh"})
    let attacker
    try {
      await vi.waitFor(() => expect(host.status).toBe("connected"))
      const ada = learner("ada"), lin = learner("lin")
      await vi.waitFor(() => expect(host.learners.filter(person => person.connected)).toHaveLength(2))
      const feedback = host.sendFeedback("ada", "A confidential message addressed to Ada")
      expect(feedback).not.toBeNull()
      await vi.waitFor(() => expect(ada.feedback).toEqual([feedback]))
      expect(lin.feedback).toEqual([])
      expect(frames.get("lin").some(frame => frame.includes(feedback.text))).toBe(false)
      for(const session of [host, ada, lin]) {
        expect(Buffer.from(Y.encodeStateAsUpdate(session.doc)).includes(feedback.text)).toBe(false)
      }
      expect(Buffer.from(Y.encodeStateAsUpdate(getYDoc("live-session-private-feedback"))).includes(feedback.text)).toBe(false)

      ada.destroy()
      const rejoined = learner("ada"), grace = learner("grace")
      await vi.waitFor(() => expect(rejoined.feedback).toEqual([feedback]))
      await vi.waitFor(() => expect(grace.status).toBe("connected"))
      expect(grace.feedback).toEqual([])
      expect(frames.get("grace").some(frame => frame.includes(feedback.text))).toBe(false)
      expect(host.feedback).toEqual([feedback])

      attacker = await openWebSocket(`${options.serverUrl}/live-session-${options.id}?role=learner&token=${options.token}&learner=mallory&learnerKey=mmmmmmmmmmmmmmmmmmmmmmmm`)
      const closed = new Promise(resolve => attacker.once("close", resolve))
      attacker.send(encodeLiveSessionFeedback({...feedback, id: "forged-feedback", participant: "lin"}))
      expect(await closed).toBe(1008)
      expect(lin.feedback).toEqual([])
      expect(host.feedback).toEqual([feedback])
    }
    finally {
      attacker?.terminate()
      sessions.reverse().forEach(session => session.destroy())
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
