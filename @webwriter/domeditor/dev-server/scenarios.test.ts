// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"

const doubles = vi.hoisted(() => ({peers: [] as any[], learners: [] as any[]}))
vi.mock("../src/domdoc", () => ({SharedDOMDoc: class {
  root: HTMLElement
  initialHTML: string
  provider = {synced: true, wsconnected: true, shouldConnect: true, connect: vi.fn()}
  connectionStatus = "connected"
  awareness = {setLocalStateField: vi.fn()}
  destroy = vi.fn()
  syncFromDOM = vi.fn()
  disconnectCollaboration = vi.fn(() => { this.connectionStatus = "disconnected"; this.provider.shouldConnect = false })
  constructor(_server: string, _room: string, _attrs: string[], _classes: string[], options: {root: HTMLElement}) {
    this.root = options.root; this.initialHTML = this.root.innerHTML; this.root.innerHTML = '<p>Original text</p><my-widget><p>Widget text</p></my-widget><p contenteditable="false">Read only</p>'; doubles.peers.push(this)
    this.provider.connect = vi.fn(() => { this.provider.shouldConnect = true; this.connectionStatus = "connected" })
  }
  relativePositionFromDOMPoint() { return {position: 3} }
}}))
vi.mock("../src/live-session", () => ({LiveSession: class {
  status = "connected"
  publish = vi.fn()
  destroy = vi.fn()
  constructor(readonly options: unknown) { doubles.learners.push(this) }
}}))
import {parseInvitation, ScenarioRunner} from "./scenarios"

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); doubles.peers.length = 0; doubles.learners.length = 0 })
function mockRequests() {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if(path === "/api/documents") return Response.json({document: {id: "scenario-id"}})
    if(init?.method === "DELETE") return new Response(null, {status: 204})
    return Response.json({sharing: {enabled: true}})
  })
}
const invitation = () => `${location.origin}/live/?liveSession=lesson&liveToken=${"a".repeat(32)}&liveServer=${encodeURIComponent(location.origin.replace(/^http/, "ws"))}`

describe("manual scenarios", () => {
  it("manages multiple collaborators and applies edits without touching widgets or read-only text", async () => {
    const fetch = mockRequests(); vi.stubGlobal("fetch", fetch)
    const runner = new ScenarioRunner(); const url = await runner.start("collaboration")
    expect(new URL(url).searchParams.get("open")).toContain("/api/documents/scenario-id")
    const alex = await runner.add(""); const sam = await runner.add("")
    expect(runner.participants).toHaveLength(2)
    expect(doubles.peers[0].initialHTML).toContain("Planning a community garden")
    expect(doubles.peers[0].initialHTML).toContain("<table>")
    expect(doubles.peers[0].awareness.setLocalStateField).toHaveBeenCalledWith("selection", expect.any(Object))
    vi.spyOn(Math, "random").mockReturnValue(0)
    runner.act(alex, "insert"); runner.act(alex, "delete"); runner.act(alex, "format")
    expect(doubles.peers[0].root.querySelector("p strong")).not.toBeNull()
    expect(doubles.peers[0].root.querySelector("my-widget")?.textContent).toBe("Widget text")
    expect(doubles.peers[0].root.querySelector('[contenteditable="false"]')?.textContent).toBe("Read only")
    runner.disconnect(alex)
    expect(() => runner.act(alex, "insert")).toThrow("connected")
    await runner.reconnect(alex)
    expect(doubles.peers[0].provider.connect).toHaveBeenCalledOnce()
    runner.remove(sam)
    expect(doubles.peers[1].destroy).toHaveBeenCalledOnce()
    await runner.reset()
    expect(doubles.peers[0].destroy).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenLastCalledWith("/api/documents/scenario-id", expect.objectContaining({method: "DELETE"}))
    expect(runner.participants).toHaveLength(0)
  })

  it("manages learner connections and publishes activities as the selected identity", async () => {
    vi.stubGlobal("fetch", mockRequests())
    const runner = new ScenarioRunner(); await runner.start("classroom")
    const alex = await runner.add(invitation()); const sam = await runner.add(invitation())
    expect(doubles.learners[0].options).toMatchObject({id: "lesson", role: "learner", learner: {name: "Alex"}})
    runner.act(alex, "pointer"); runner.act(alex, "click"); runner.act(sam, "scroll")
    expect(doubles.learners[0].publish.mock.calls.map((call: any[]) => call[0].kind)).toEqual(["pointer", "click"])
    expect(doubles.learners[1].publish).toHaveBeenCalledWith(expect.objectContaining({kind: "scroll"}))
    runner.disconnect(sam); expect(doubles.learners[1].destroy).toHaveBeenCalledOnce()
    await runner.reconnect(sam)
    expect(doubles.learners[2].options).toMatchObject({learner: {id: sam.identity.id}})
    await runner.reset()
    expect(doubles.learners[0].destroy).toHaveBeenCalledOnce()
    expect(doubles.learners[2].destroy).toHaveBeenCalledOnce()
  })


  it("restarts a scenario with a fresh document and no participants", async () => {
    const fetch = mockRequests(); vi.stubGlobal("fetch", fetch)
    const runner = new ScenarioRunner(); await runner.start("collaboration")
    await runner.add("")
    await runner.start("collaboration")
    expect(doubles.peers[0].destroy).toHaveBeenCalledOnce()
    expect(runner.participants).toHaveLength(0)
    expect(fetch.mock.calls.filter(([path, init]) => path === "/api/documents" && init?.method === "POST")).toHaveLength(2)
    expect(fetch.mock.calls.some(([path, init]) => path === "/api/documents/scenario-id" && init?.method === "DELETE")).toBe(true)
    await runner.reset()
  })

  it("rejects other servers and sessions and retains the document if deletion fails", async () => {
    expect(() => parseInvitation(`http://example.com/live/?liveSession=a&liveToken=${"a".repeat(32)}&liveServer=ws://example.com`, "http://localhost:1234")).toThrow()
    const fetch = mockRequests(); vi.stubGlobal("fetch", fetch)
    const runner = new ScenarioRunner(); await runner.start("classroom"); await runner.add(invitation())
    await expect(runner.add(invitation().replace("lesson", "other"))).rejects.toThrow("different session")
    fetch.mockImplementationOnce(async () => Response.json({error: {message: "failed"}}, {status: 500}))
    await expect(runner.reset()).rejects.toThrow("failed")
    expect(runner.documentId).toBe("scenario-id")
  })
})
