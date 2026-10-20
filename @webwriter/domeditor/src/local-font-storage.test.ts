// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {readFontFiles, saveFontFile, type FontFileHandle, type StoredFontFile} from "./local-font-storage"

const file = (name = "Display.woff2") => new File(["font data"], name, {type: "font/woff2"})
const handle = (name = "Display.woff2"): FontFileHandle => ({name, kind: "file", getFile: async() => file(name)})

function memoryDatabase(initial: unknown[] = []) {
  const values = new Map(initial.map((record, index) => [
    record && typeof record === "object" && typeof (record as {id?: unknown}).id === "string"
      ? (record as {id: string}).id
      : `invalid-${index}`,
    record,
  ]))
  const close = vi.fn()
  const db = {
    objectStoreNames: {contains: () => true},
    close,
    transaction: () => {
      const transaction: {oncomplete?: () => void, onerror?: () => void, onabort?: () => void, objectStore: () => unknown} = {
        objectStore: () => ({
          getAll: () => {
            const request: {result: unknown[], onsuccess?: () => void, onerror?: () => void} = {result: [...values.values()]}
            queueMicrotask(() => request.onsuccess?.())
            return request
          },
          put: (record: StoredFontFile) => {
            values.set(record.id, record)
            queueMicrotask(() => transaction.oncomplete?.())
          },
        }),
      }
      return transaction
    },
  }
  const factory = {open: () => {
    const request: {result: typeof db, onsuccess?: () => void} = {result: db}
    queueMicrotask(() => request.onsuccess?.())
    return request
  }} as unknown as IDBFactory
  return {factory, close, values}
}

afterEach(() => vi.unstubAllGlobals())

describe("local font storage", () => {
  it("stores and reads both file handles and File input imports", async() => {
    const storage = memoryDatabase()
    const handleRecord = {id: "handle-font", name: "Display.woff2", handle: handle()}
    const fileRecord = {id: "input-font", name: "Text.woff2", file: file("Text.woff2")}
    await saveFontFile(handleRecord, storage.factory)
    await saveFontFile(fileRecord, storage.factory)

    const loaded = await readFontFiles(storage.factory)
    expect(loaded).toEqual([handleRecord, fileRecord])
    expect(storage.close).toHaveBeenCalledTimes(3)
  })

  it("filters malformed IndexedDB records", async() => {
    const storage = memoryDatabase([
      {id: "valid", name: "Display.woff2", file: file()},
      {id: "no-source", name: "Missing.woff2"},
      {id: "bad-handle", name: "Invalid.woff2", handle: {name: "Invalid.woff2"}},
      {id: "bad-name", name: "", file: file()},
      null,
    ])

    await expect(readFontFiles(storage.factory)).resolves.toEqual([{id: "valid", name: "Display.woff2", file: expect.any(File)}])
    expect(storage.close).toHaveBeenCalledOnce()
  })

  it("returns an empty list on unavailable or failed reads", async() => {
    vi.stubGlobal("indexedDB", undefined)
    await expect(readFontFiles()).resolves.toEqual([])
    const unavailable = {open: () => {throw new Error("blocked")}} as unknown as IDBFactory
    await expect(readFontFiles(unavailable)).resolves.toEqual([])

    const db = {close: vi.fn(), transaction: () => {throw new Error("transaction failed")}}
    const factory = {open: () => {
      const request: {result: typeof db, onsuccess?: () => void} = {result: db}
      queueMicrotask(() => request.onsuccess?.())
      return request
    }} as unknown as IDBFactory
    await expect(readFontFiles(factory)).resolves.toEqual([])
    expect(db.close).toHaveBeenCalledOnce()
  })

  it("rejects invalid records and unavailable storage", async() => {
    await expect(saveFontFile({id: "bad", name: "Bad.woff2"})).rejects.toThrow("Invalid imported font record")
    vi.stubGlobal("indexedDB", undefined)
    await expect(saveFontFile({id: "good", name: "Good.woff2", file: file()})).rejects.toThrow("IndexedDB is unavailable")
  })

  it.each(["error", "abort"] as const)("rejects a transaction %s and closes the database", async eventName => {
    const failure = new DOMException("storage failed", "QuotaExceededError")
    const db = {
      close: vi.fn(),
      transaction: () => {
        const transaction: {error: DOMException, objectStore: () => {put: () => void}, oncomplete?: () => void,
          onerror?: () => void, onabort?: () => void} = {
          error: failure,
          objectStore: () => ({put: () => {}}),
        }
        queueMicrotask(() => (eventName === "error" ? transaction.onerror : transaction.onabort)?.())
        return transaction
      },
    }
    const factory = {open: () => {
      const request: {result: typeof db, onsuccess?: () => void} = {result: db}
      queueMicrotask(() => request.onsuccess?.())
      return request
    }} as unknown as IDBFactory

    await expect(saveFontFile({id: "font", name: "Display.woff2", file: file()}, factory)).rejects.toBe(failure)
    expect(db.close).toHaveBeenCalledOnce()
  })
})
