// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import * as Y from "yjs"
import {WidgetDataStorage, type WidgetDataPersistenceState} from "./widget-data-storage"

const stores: WidgetDataStorage[] = []
afterEach(() => { stores.splice(0).forEach(store => store.destroy()); localStorage.clear() })
const initialize = (doc: Y.Doc) => {
  if(!doc.getMap("data").has("value")) doc.getMap("data").set("value", new Y.Map(Object.entries({a: 1})))
}

describe("offline widget storage without browser IndexedDB", () => {
  it("keeps editing in memory and reports unavailable persistence instead of claiming a save", async () => {
    const store = new WidgetDataStorage()
    stores.push(store)
    const connection = store.connect("scope", initialize)
    const states: WidgetDataPersistenceState[] = []
    const stop = connection.observePersistence(state => states.push(state))
    expect(connection.ready).toBeUndefined()
    ;(connection.doc.getMap("data").get("value") as Y.Map<unknown>).set("a", 2)
    expect(connection.doc.getMap("data").toJSON()).toEqual({value: {a: 2}})
    expect(states.at(-1)?.state).toBe("error")
    await expect(store.flush()).rejects.toThrow("IndexedDB is unavailable")
    stop()
  })

  it("preserves a legacy snapshot until migration can actually commit", () => {
    const legacy = new Y.Doc()
    initialize(legacy)
    ;(legacy.getMap("data").get("value") as Y.Map<unknown>).set("a", 3)
    const text = JSON.stringify([...Y.encodeStateAsUpdate(legacy)])
    localStorage.setItem("scope", text)
    legacy.destroy()
    const store = new WidgetDataStorage(undefined, localStorage)
    stores.push(store)
    const connection = store.connect("scope", initialize)
    expect(connection.doc.getMap("data").toJSON()).toEqual({value: {a: 3}})
    expect(localStorage.getItem("scope")).toBe(text)
    expect(store.connect("scope", initialize)).toBe(connection)
  })

  it("holds readiness after an open failure and retries without initializing over unread data", async () => {
    let unavailable = true
    const factory = {open() {
      if(unavailable) throw new DOMException("Access denied", "SecurityError")
      throw new Error("retried")
    }} as unknown as IDBFactory
    const store = new WidgetDataStorage(factory)
    stores.push(store)
    const connection = store.connect("scope", initialize)
    let ready = false
    void connection.ready!.then(() => { ready = true })
    await expect(store.flush()).rejects.toThrow("Access denied")
    expect(connection.doc.getMap("data").size).toBe(0)
    expect(ready).toBe(false)
    unavailable = false
    await expect(store.flush()).rejects.toThrow("retried")
  })
})
