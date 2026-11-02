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
  clearSelection = vi.fn()
  disconnectCollaboration = vi.fn(() => { this.connectionStatus = "disconnected"; this.provider.shouldConnect = false })
  constructor(_server: string, _room: string, _attrs: string[], _classes: string[], options: {root: HTMLElement}) {
    this.root = options.root; this.initialHTML = this.root.innerHTML; this.root.innerHTML = '<p>Original text</p><table><tbody><tr><td>Cell</td></tr></tbody></table><my-widget><p>Widget text</p></my-widget><p contenteditable="false">Read only</p>'; doubles.peers.push(this)
    this.provider.connect = vi.fn(() => { this.provider.shouldConnect = true; this.connectionStatus = "connected" })
  }
  relativePositionFromDOMPoint(node: Node, offset: number) { return {node, offset} }
  domPointFromRelativePosition(position: {node: Node, offset: number}) { return position }
}}))
vi.mock("../src/live-session", () => ({LiveSession: class {
  status = "connected"
  publish = vi.fn()
  destroy = vi.fn()
  constructor(readonly options: unknown) { doubles.learners.push(this) }
}}))
import {parseInvitation, ScenarioRunner} from "./scenarios"

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); doubles.peers.length = 0; doubles.learners.length = 0 })
function mockRequests() {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if(path === "/api/documents") return Response.json({document: {id: "scenario-id"}})
    if(init?.method === "DELETE") return new Response(null, {status: 204})
    return Response.json({sharing: {enabled: true}})
  })
}
const invitation = () => `${location.origin}/live/?liveSession=lesson&liveToken=${"a".repeat(32)}&liveServer=${encodeURIComponent(location.origin.replace(/^http/, "ws"))}`

describe("manual scenarios", () => {
  it("parses peer invitations for classroom participants", () => {
    const link = new URL(invitation())
    link.searchParams.delete("liveToken")
    link.hash = `liveKey=${"A".repeat(87)}&liveSecret=${"B".repeat(32)}`
    expect(parseInvitation(link.href)).toMatchObject({id: "lesson", peer: {hostPublicKey: "A".repeat(87), secret: "B".repeat(32)}})
  })
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

  it("selects before each continuous edit, obeys the interval, and pauses on disconnect", async () => {
    vi.stubGlobal("fetch", mockRequests())
    const runner = new ScenarioRunner(); await runner.start("collaboration"); const alex = await runner.add("")
    const peer = doubles.peers[0]
    vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0)
    runner.setSpeed(alex, 1000)
    const original = peer.root.querySelector("p").textContent
    runner.resume(alex)
    expect(peer.awareness.setLocalStateField).toHaveBeenLastCalledWith("selection", expect.objectContaining({anchor: expect.any(Object), focus: expect.any(Object)}))
    expect(peer.root.querySelector("p").textContent).toBe(original)
    vi.advanceTimersByTime(499); expect(peer.syncFromDOM).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(peer.syncFromDOM).toHaveBeenCalledOnce()
    expect(peer.root.querySelector("p").textContent).not.toBe(original)
    vi.advanceTimersByTime(500); expect(alex.running).toBe(true)
    runner.disconnect(alex)
    const count = peer.syncFromDOM.mock.calls.length
    vi.advanceTimersByTime(10000)
    expect(peer.syncFromDOM).toHaveBeenCalledTimes(count)
    expect(alex.running).toBe(false)
    expect(peer.clearSelection).toHaveBeenCalled()
    await runner.reset()
  })

  it("skips a selection changed by another edit and cancels timers on pause, removal, and reset", async () => {
    vi.stubGlobal("fetch", mockRequests())
    const runner = new ScenarioRunner(); await runner.start("collaboration"); const alex = await runner.add("")
    const peer = doubles.peers[0]
    vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0)
    runner.setSpeed(alex, 1000); runner.resume(alex)
    peer.root.querySelector("p").firstChild.data = "Changed remotely"
    vi.advanceTimersByTime(500)
    expect(peer.syncFromDOM).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500); runner.pause(alex)
    vi.advanceTimersByTime(5000); expect(peer.syncFromDOM).not.toHaveBeenCalled()
    runner.resume(alex); runner.remove(alex); vi.advanceTimersByTime(5000)
    expect(peer.syncFromDOM).not.toHaveBeenCalled()
    const sam = await runner.add(""); runner.resume(sam); await runner.reset(); vi.advanceTimersByTime(5000)
    expect(doubles.peers[1].syncFromDOM).not.toHaveBeenCalled()
  })

  it("selects and replaces a whole word and can append a sentence", async () => {
    vi.stubGlobal("fetch", mockRequests())
    const runner = new ScenarioRunner(); await runner.start("collaboration"); const alex = await runner.add("")
    const peer = doubles.peers[0], paragraph = peer.root.querySelector("p")
    vi.useFakeTimers()
    const random = vi.spyOn(Math, "random").mockReturnValue(0)
    runner.setSpeed(alex, 1000)
    random.mockReturnValueOnce(.55).mockReturnValueOnce(0)
    runner.resume(alex)
    const selection = peer.awareness.setLocalStateField.mock.calls.at(-1)[1]
    expect(selection.anchor.offset).toBe(0); expect(selection.focus.offset).toBe("Original".length)
    vi.advanceTimersByTime(500)
    expect(paragraph.textContent).toBe("together text")
    runner.pause(alex)
    random.mockReturnValueOnce(.70).mockReturnValueOnce(0).mockReturnValueOnce(0)
    runner.resume(alex); vi.advanceTimersByTime(500)
    expect(paragraph.textContent).toBe("together text Everyone can contribute an idea.")
    await runner.reset()
  })

  it("selects a whole table and applies a preset only while its target stays unchanged", async () => {
    vi.stubGlobal("fetch", mockRequests())
    const runner = new ScenarioRunner(); await runner.start("collaboration"); const alex = await runner.add("")
    const peer = doubles.peers[0], table = peer.root.querySelector("table")
    vi.useFakeTimers()
    const random = vi.spyOn(Math, "random").mockReturnValue(0)
    runner.setSpeed(alex, 1000)
    random.mockReturnValueOnce(.99).mockReturnValueOnce(.99).mockReturnValueOnce(.3)
    runner.resume(alex)
    const selection = peer.awareness.setLocalStateField.mock.calls.at(-1)[1]
    expect(selection.anchor.node).toBe(peer.root)
    expect(selection.focus.offset).toBe(selection.anchor.offset + 1)
    expect(peer.root.childNodes[selection.anchor.offset]).toBe(table)
    vi.advanceTimersByTime(500)
    expect(table.style.backgroundColor).not.toBe("")
    expect(table.style.borderStyle).toBe("solid")
    runner.pause(alex)
    random.mockReturnValueOnce(.99).mockReturnValueOnce(.99).mockReturnValueOnce(0)
    runner.resume(alex)
    table.style.backgroundColor = "red"
    peer.syncFromDOM.mockClear()
    vi.advanceTimersByTime(500)
    expect(table.style.backgroundColor).toBe("red")
    expect(peer.syncFromDOM).not.toHaveBeenCalled()
    await runner.reset()
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
