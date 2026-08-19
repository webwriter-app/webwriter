import {afterEach, describe, expect, it, vi} from "vitest"
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
