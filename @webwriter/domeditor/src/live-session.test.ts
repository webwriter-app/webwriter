import {afterEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {LiveSession} from "./live-session"

const sessions: LiveSession[] = []

afterEach(() => {
  sessions.splice(0).reverse().forEach(session => session.destroy())
  vi.unstubAllGlobals()
})

const create = (options: ConstructorParameters<typeof LiveSession>[0]) => {
  const session = new LiveSession(options)
  sessions.push(session)
  return session
}

describe("LiveSession", () => {
  it("keeps the HTTP document and widget sources out of server-backed Yjs synchronization", () => {
    let socketURL = ""
    vi.stubGlobal("WebSocket", class {constructor(url: string) {socketURL = url} send() {} close() {}})
    const large = "x".repeat(8 * 1024 * 1024)
    const host = create({id: "http-document", role: "host", serverUrl: "ws://localhost:1234", token: "live-session-token-0123456789",
      baseHTML: large, previewDependencies: {packages: [], importMap: {imports: {widget: large}}}, hostKey: "http-host-capability-0123456789",
    })
    expect(host.doc.getMap("live-session-meta").has("baseHTML")).toBe(false)
    expect(host.doc.getMap("live-session-meta").has("previewDependencies")).toBe(false)
    expect(Y.encodeStateAsUpdate(host.doc).byteLength).toBeLessThan(1024)
    expect(new URL(socketURL).searchParams.get("hostKey")).toBe("http-host-capability-0123456789")
  })

  it.each([false, true])("shares the host preview dependencies when learner joins first: %s", learnerFirst => {
    const options = {id: "preview-dependencies", role: "learner" as const,
      previewDependencies: {packages: [], importMap: {imports: {lit: "https://untrusted.test/lit.js"}}}}
    const early = learnerFirst ? create(options) : null
    const dependencies = {packages: [], importMap: {imports: {lit: "https://example.test/lit.js"}}}
    const host = create({id: options.id, role: "host", baseHTML: "<demo-widget></demo-widget>", previewDependencies: dependencies})
    const learner = early ?? create(options)
    expect(learner.previewDependencies).toEqual(dependencies)
    dependencies.importMap.imports.lit = "https://changed.test/lit.js"
    learner.previewDependencies!.importMap!.imports!.lit = "https://changed.test/lit.js"
    expect(host.previewDependencies!.importMap!.imports!.lit).toBe("https://example.test/lit.js")
    expect(learner.previewDependencies).toEqual(host.previewDependencies)
    learner.doc.getMap("live-session-meta").set("previewDependencies", options.previewDependencies)
    expect(host.previewDependencies!.importMap!.imports!.lit).toBe("https://example.test/lit.js")
  })

  it("delivers host feedback to the intended participant and keeps it out of the document timeline", async () => {
    const host = create({id: "feedback", role: "host", baseHTML: "<p>Document</p>"})
    const ada = create({id: "feedback", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})
    const lin = create({id: "feedback", role: "learner", learner: {id: "lin", name: "Lin", color: "#08c"}})
    const changes = vi.fn()
    ada.onChange(changes)
    const message = host.sendFeedback("ada", "  Good work!\nTry the next question.  ")!
    await Promise.resolve()
    expect(message.text).toBe("Good work!\nTry the next question.")
    expect(host.feedback).toEqual([message])
    expect(ada.feedback).toEqual([message])
    expect(lin.feedback).toEqual([])
    for(const session of [host, ada, lin]) {
      expect(session.doc.getArray("live-session-feedback").length).toBe(0)
      expect(new TextDecoder().decode(Y.encodeStateAsUpdate(session.doc))).not.toContain(message.text)
    }
    expect(changes).toHaveBeenCalled()
    expect(host.baseHTML).toBe("<p>Document</p>")
    expect(host.steps).toEqual([])
    const returned = ada.feedback
    returned[0].text = "Changed locally"
    expect(host.feedback[0].text).toBe(message.text)
    expect(ada.sendFeedback("lin", "Forged")).toBeNull()
    ada.doc.getArray("live-session-feedback").push([{...message, id: "forged", participant: "lin"}])
    expect(host.feedback).toEqual([message])
    expect(lin.feedback).toEqual([])
    const activity = ada.publish({kind: "pointer", pointer: {x: 0.2, y: 0.3}})
    // The forged update taints this peer; a clean participant can still edit.
    const cleanActivity = lin.publish({kind: "pointer", pointer: {x: 0.4, y: 0.5}})
    expect(host.steps.map(step => step.id)).toContain(cleanActivity.id)
    expect(host.steps.map(step => step.id)).not.toContain(activity.id)
  })

  it("replays only the recipient's feedback when a learner rejoins", () => {
    const host = create({id: "feedback-rejoin", role: "host"})
    const learner = (id: string) => create({id: host.id, role: "learner", learner: {id, name: id, color: "#08c"}})
    const ada = learner("ada")
    learner("lin")
    const message = host.sendFeedback("ada", "For Ada only")!
    ada.destroy()
    const rejoined = learner("ada")
    const unrelated = learner("grace")
    expect(rejoined.feedback).toEqual([message])
    expect(unrelated.feedback).toEqual([])
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(unrelated.doc))).not.toContain(message.text)
  })

  it("rejects empty, oversized, disconnected, unknown, and stopped-session feedback", () => {
    const host = create({id: "feedback-preconditions", role: "host", baseHTML: "<p>Document</p>"})
    const ada = create({id: "feedback-preconditions", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})
    expect(host.sendFeedback("unknown", "Hello")).toBeNull()
    expect(host.sendFeedback("ada", " ")).toBeNull()
    expect(host.sendFeedback("ada", "x".repeat(4001))).toBeNull()
    ada.stop()
    expect(host.sendFeedback("ada", "Disconnected")).toBeNull()
    host.stop()
    expect(host.sendFeedback("ada", "Stopped")).toBeNull()
    expect(host.feedback).toEqual([])
  })

  it("does not propagate direct learner mutations of host metadata", () => {
    const host = create({id: "protected", role: "host", baseHTML: "<p>Host</p>"})
    const learner = create({id: "protected", role: "learner", baseHTML: "<p>Untrusted</p>", learner: {id: "ada", name: "Ada", color: "#f00"}})
    learner.doc.getMap("live-session-meta").set("baseHTML", "<script>bad()</script>")
    expect(host.baseHTML).toBe("<p>Host</p>")
  })

  it("keeps hostless learner edits private and validates history when a host reconnects", () => {
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const first = create({id: "hostless", role: "learner", token, learner: {id: "ada", name: "Ada", color: "#f00"}})
    const second = create({id: "hostless", role: "learner", token, learner: {id: "lin", name: "Lin", color: "#08c"}})
    const forged = create({id: "hostless", role: "learner", token, learner: {id: "mallory", name: "Mallory", color: "#333"}})
    first.publish({kind: "document", html: "<p>Ada's work</p>"})
    second.publish({kind: "pointer", pointer: {x: 0.25, y: 0.5}})
    forged.publish({kind: "document", html: "<p>Untrusted work</p>"})
    forged.doc.getMap("live-session-meta").set("baseHTML", "<p>forged</p>")

    expect(second.baseHTML).toBeUndefined()

    const host = create({id: "hostless", role: "host", token, baseHTML: "<p>Host document</p>"})
    expect(host.baseHTML).toBe("<p>Host document</p>")
    expect(first.baseHTML).toBe("<p>Host document</p>")
    expect(second.baseHTML).toBe("<p>Host document</p>")
    expect(host.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({learner: "ada", html: "<p>Ada's work</p>"}),
      expect.objectContaining({learner: "lin", kind: "pointer", pointer: {x: 0.25, y: 0.5}}),
    ]))
    expect(host.states).toEqual(expect.arrayContaining([
      expect.objectContaining({learner: "ada", html: "<p>Ada's work</p>"}),
      expect.objectContaining({learner: "lin", pointer: {x: 0.25, y: 0.5}}),
    ]))
    expect(host.steps.some(step => step.learner === "mallory")).toBe(false)
    expect(second.steps.map(step => step.id)).toEqual(expect.arrayContaining(host.steps.map(step => step.id)))
    const next = first.publish({kind: "pointer", pointer: {x: 0.5, y: 0.75}})
    expect(host.steps.map(step => step.id)).toEqual(expect.arrayContaining([next.id]))
    expect(new Set(host.steps.map(step => step.id)).size).toBe(host.steps.length)
    expect(second.steps.map(step => step.id)).toContain(next.id)
    expect(new Set(second.steps.map(step => step.id)).size).toBe(second.steps.length)
  })

  it("keeps learner history unique and accepts later activity after host bootstrap", () => {
    const token = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const learner = create({id: "reconnect", role: "learner", token, learner: {id: "ada", name: "Ada", color: "#f00"}})
    const initial = learner.publish({kind: "document", html: "<p>Initial</p>"})
    const host = create({id: "reconnect", role: "host", token, baseHTML: "<p>Host</p>"})
    expect(host.steps.map(step => step.id)).toEqual([initial.id])
    const next = learner.publish({kind: "pointer", pointer: {x: 0.4, y: 0.6}})

    expect(host.steps.map(step => step.id)).toEqual([initial.id, next.id])
    expect(new Set(host.steps.map(step => step.id)).size).toBe(2)
    expect(host.states).toEqual([expect.objectContaining({
      learner: "ada", time: next.time, html: "<p>Initial</p>", pointer: {x: 0.4, y: 0.6},
    })])
  })

  it("stores base HTML, durable steps, and the latest learner state", () => {
    const host = create({id: "lesson", role: "host", baseHTML: "<p>Start</p>"})
    const learner = create({id: "lesson", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})

    const step = learner.publish({kind: "document", html: "<p>Answer</p>", cursor: {x: 20, y: 30}})
    expect(host.baseHTML).toBe("<p>Start</p>")
    expect(host.steps).toEqual([step])
    expect(host.states).toEqual([{
      learner: "ada",
      time: step.time,
      html: "<p>Answer</p>",
      cursor: {x: 20, y: 30},
    }])
  })

  it("keeps learners after they stop and marks live awareness state", () => {
    const host = create({id: "lesson", role: "host"})
    const learner = create({id: "lesson", role: "learner", learner: {id: "grace", name: "Grace", color: "#08c"}})

    expect(host.learners).toEqual([expect.objectContaining({id: "grace", connected: true})])
    learner.stop()
    expect(host.learners).toEqual([expect.objectContaining({id: "grace", connected: false})])
  })

  it("shares the host stop state with connected learners", () => {
    const host = create({id: "lesson", role: "host"})
    const learner = create({id: "lesson", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})

    host.stop()

    expect(learner.status).toBe("stopped")
    expect(() => learner.publish({kind: "pointer", pointer: {x: 0.2, y: 0.3}})).toThrow("stopped")
  })

  it("does not register the host as a learner and supports change cleanup", async () => {
    const host = create({id: "lesson", role: "host"})
    const listener = vi.fn()
    const unsubscribe = host.onChange(listener)
    host.publish({kind: "document", html: "<p>Host note</p>"})
    expect(host.learners).toEqual([])
    await Promise.resolve()
    expect(listener).toHaveBeenCalled()
    const calls = listener.mock.calls.length
    unsubscribe()
    host.publish({kind: "document", html: "<p>Another note</p>"})
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it("keeps a duplicate learner identity connected until its last client leaves", () => {
    const host = create({id: "lesson", role: "host"})
    const first = create({id: "lesson", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})
    const second = create({id: "lesson", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})

    first.stop()
    expect(host.learners).toEqual([expect.objectContaining({id: "ada", connected: true})])
    second.stop()
    expect(host.learners).toEqual([expect.objectContaining({id: "ada", connected: false})])
  })

  it("marks the full roster disconnected when the host stops", () => {
    const host = create({id: "lesson", role: "host"})
    create({id: "lesson", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})
    create({id: "lesson", role: "learner", learner: {id: "grace", name: "Grace", color: "#08c"}})

    host.stop()
    expect(host.learners).toEqual([
      expect.objectContaining({id: "ada", connected: false}),
      expect.objectContaining({id: "grace", connected: false}),
    ])
  })

  it("rejects ids that are unsafe in transport room names", () => {
    expect(() => new LiveSession({id: "lesson/other", role: "host"})).toThrow("safe id")
    expect(() => new LiveSession({id: "", role: "host"})).toThrow("safe id")
  })

  it("validates bearer tokens and learner identities", () => {
    expect(() => new LiveSession({id: "lesson", role: "host", token: "short"})).toThrow("token")
    expect(() => new LiveSession({id: "lesson", role: "learner", learner: {id: "bad/id", name: "Learner", color: "#fff"}})).toThrow("identity")
    expect(() => new LiveSession({id: "lesson", role: "learner", learner: {id: "learner", name: "x".repeat(201), color: "#fff"}})).toThrow("identity")
    expect(() => new LiveSession({id: "lesson", role: "learner", learner: {
      id: "learner", name: "Learner", color: "red; background-image: url(https://attacker.test/pixel)",
    }})).toThrow("identity")
  })

  it("does not exchange local transport updates across bearer tokens", () => {
    const first = create({id: "isolated", role: "host", token: "aaaaaaaaaaaaaaaaaaaaaaaa"})
    const second = create({id: "isolated", role: "learner", token: "bbbbbbbbbbbbbbbbbbbbbbbb", learner: {id: "learner", name: "Learner", color: "#fff"}})
    first.publish({kind: "document", html: "<p>secret</p>"})
    expect(second.steps).toEqual([])
  })

  it("does not create a serverless BroadcastChannel or accept raw channel updates", () => {
    const channels = new Map<string, Set<TestBroadcastChannel>>()
    class TestBroadcastChannel extends EventTarget {
      static created: TestBroadcastChannel[] = []
      constructor(readonly name: string) {
        super()
        TestBroadcastChannel.created.push(this)
        const peers = channels.get(name) ?? new Set<TestBroadcastChannel>()
        peers.add(this)
        channels.set(name, peers)
      }
      postMessage(data: unknown) {
        channels.get(this.name)?.forEach(peer => {
          if(peer !== this) peer.dispatchEvent(new MessageEvent("message", {data}))
        })
      }
      close() {
        channels.get(this.name)?.delete(this)
      }
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel)
    const token = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const host = create({id: "channel-blocked", role: "host", baseHTML: "<p>Host</p>", token})

    expect(TestBroadcastChannel.created).toHaveLength(0)

    const sender = new TestBroadcastChannel("webwriter-live-session:channel-blocked")
    const forged = new Y.Doc()
    Y.applyUpdate(forged, Y.encodeStateAsUpdate(host.doc))
    const before = Y.encodeStateVector(forged)
    forged.getMap("live-session-meta").set("baseHTML", "<script>forged</script>")
    sender.postMessage({
      type: "update",
      session: host.id,
      sender: "attacker",
      token,
      update: Array.from(Y.encodeStateAsUpdate(forged, before)),
    })

    expect(host.baseHTML).toBe("<p>Host</p>")
    sender.close()
    forged.destroy()
  })

  it("keeps a 100-learner roster and propagates incremental activity", () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    const host = create({id: "scale", role: "host"})
    const learners = Array.from({length: 100}, (_, index) => create({
      id: "scale",
      role: "learner",
      learner: {
        id: `learner-${index}`,
        name: `Learner ${index}`,
        color: "#2563eb",
      },
    }))

    const step = learners.at(-1)!.publish({kind: "pointer", pointer: {x: 0.4, y: 0.6}})
    expect(host.learners).toHaveLength(100)
    expect(host.steps.at(-1)).toEqual(step)
  })

  it("supports multiple event kinds and preserves prior state fields", () => {
    const learner = create({id: "lesson", role: "learner", learner: {id: "lin", name: "Lin", color: "#333"}})
    learner.publish({kind: "document", html: "<p>One</p>", scroll: {top: 100, height: 900}})
    learner.publish({kind: "pointer", pointer: {x: 40, y: 50}})
    learner.publish({kind: "click", click: {x: 40, y: 50, button: 0}})
    expect(learner.steps.map(step => step.kind)).toEqual(["document", "pointer", "click"])
    expect(learner.states[0]).toEqual(expect.objectContaining({
      html: "<p>One</p>",
      scroll: {top: 100, height: 900},
      pointer: {x: 40, y: 50},
      click: {x: 40, y: 50, button: 0},
    }))
  })
})
