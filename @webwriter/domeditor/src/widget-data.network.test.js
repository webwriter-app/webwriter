// @vitest-environment happy-dom
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, describe, expect, it, vi} from "vitest"
import WebSocket from "ws"

const cleanups = []
const markup = '<test-widget id="widget"><script type="application/json" slot="data">{"left":0,"right":0}</script></test-widget>'
const block = root => root.querySelector('script[slot="data"]')
const waitForDataChange = element => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Timed out waiting for widget datachange")), 5000)
  element.addEventListener("datachange", () => { clearTimeout(timeout); resolve() }, {once: true})
  element.addEventListener("dataerror", event => { clearTimeout(timeout); reject(new Error(event.detail.message)) }, {once: true})
})
const waitForValue = async (element, expected) => {
  const end = Date.now() + 5000
  while(Date.now() < end) {
    if(JSON.stringify(JSON.parse(block(element).textContent)) === JSON.stringify(Object.fromEntries(Object.entries(expected).sort(([a], [b]) => a.localeCompare(b))))) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(expected)}; got ${block(element).textContent}`)
}

afterEach(async () => {
  for(const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe("networked widget data", () => {
  it("resolves and synchronizes scopes through the development server", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "domeditor-widget-data-"))
    vi.stubGlobal("WebSocket", WebSocket)
    const [{SharedDOMDoc, sharedDOMBody}, {createDevServer}] = await Promise.all([
      import("./domdoc"), import("../dev-server/server.mjs"),
    ])
    const server = await createDevServer({port: 0, vite: false, dataDirectory})
    const rooms = new WeakMap()
    server.websocketServer.on("connection", (socket, request) => rooms.set(socket, request.url))
    cleanups.push(async () => { await server.close(); await rm(dataDirectory, {recursive: true, force: true}) })
    const {url} = await server.listen()
    cleanups.push(() => vi.unstubAllGlobals())
    const serverURL = url.replace(/^http/, "ws")
    const makePeer = () => {
      const root = document.createElement("main")
      root.innerHTML = markup
      const doc = new SharedDOMDoc(serverURL, "lesson", [], ["◆"], {
        root,
        supportsWidgetData: element => element.localName === "test-widget",
      })
      cleanups.push(() => doc.destroy())
      return {root, doc, get widget() { return root.querySelector("test-widget") }, get block() { return block(root) }}
    }

    const first = makePeer()
    const firstInitial = waitForDataChange(first.root)
    await firstInitial
    const second = makePeer()
    const secondInitial = waitForDataChange(second.root)
    await secondInitial
    expect(first.block.textContent).toBe('{"left":0,"right":0}')
    expect(second.block.textContent).toBe('{"left":0,"right":0}')

    first.block.textContent = '{"left":1,"right":0}'
    first.doc.syncFromDOM()
    await waitForValue(second.root, {left: 1, right: 0})
    second.block.textContent = '{"left":1,"right":2}'
    second.doc.syncFromDOM()
    await waitForValue(first.root, {left: 1, right: 2})

    // A reconnect renews the server capability without publishing into another scope.
    for(const socket of server.websocketServer.clients) {
      if(rooms.get(socket)?.startsWith("/widget-data-")) socket.terminate()
    }
    await new Promise(resolve => setTimeout(resolve, 200))
    first.block.textContent = '{"left":3,"right":2}'
    first.doc.syncFromDOM()
    await waitForValue(second.root, {left: 3, right: 2})

    first.block.textContent = '{"left":91,"right":2,"private":"individual-only"}'
    first.doc.syncFromDOM()
    await waitForValue(second.root, {left: 91, right: 2, private: "individual-only"})
    expect(sharedDOMBody(first.doc.doc).toString()).not.toContain("individual-only")
    expect(sharedDOMBody(second.doc.doc).toString()).not.toContain("individual-only")

    first.widget.setAttribute("shared", "")
    first.doc.widgetData.sync()
    await waitForValue(first.root, {left: 0, right: 0})
    expect(sharedDOMBody(first.doc.doc).toString()).not.toContain("individual-only")
    first.doc.syncFromDOM()
    await waitForValue(second.root, {left: 0, right: 0})
  }, 20000)
})
