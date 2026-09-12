// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {
  isLocalPackageDirectoryHandle,
  readLocalPackageDirectories,
  saveLocalPackageDirectory,
} from "./local-package-storage"
import type {LocalPackageDirectoryHandle} from "./local-package-worker"

const handle = (): LocalPackageDirectoryHandle => ({
  kind: "directory",
  getDirectoryHandle: async() => handle(),
  getFileHandle: async() => ({getFile: async() => new Blob()}),
})

function indexedDatabase(database: unknown): IDBFactory {
  return {open: () => {
    const request: {result: unknown, onsuccess?: () => void} = {result: database}
    queueMicrotask(() => request.onsuccess?.())
    return request
  }} as unknown as IDBFactory
}

describe("local package storage", () => {
  it("reads valid records and filters malformed values", async() => {
    const root = handle()
    const database = {
      transaction: () => ({objectStore: () => ({getAll: () => {
        const request: {result: unknown[], onsuccess?: () => void, onerror?: () => void} = {
          result: [{id: "demo", handle: root}, {id: "", handle: root}, {id: "file", handle: {...root, kind: "file"}}],
        }
        queueMicrotask(() => request.onsuccess?.())
        return request
      }})}),
      close: vi.fn(),
    }

    await expect(readLocalPackageDirectories(indexedDatabase(database))).resolves.toEqual([{id: "demo", handle: root}])
    expect(database.close).toHaveBeenCalledOnce()
  })

  it("falls back to an empty list when a read request fails", async() => {
    const database = {
      transaction: () => ({objectStore: () => ({getAll: () => {
        const request: {onsuccess?: () => void, onerror?: () => void} = {}
        queueMicrotask(() => request.onerror?.())
        return request
      }})}),
      close: vi.fn(),
    }

    await expect(readLocalPackageDirectories(indexedDatabase(database))).resolves.toEqual([])
    expect(database.close).toHaveBeenCalledOnce()
  })

  it("closes the database when a write operation throws", async() => {
    const database = {
      transaction: () => ({objectStore: () => ({put: () => { throw new Error("write failed") }})}),
      close: vi.fn(),
    }

    await expect(saveLocalPackageDirectory({id: "demo", handle: handle()}, indexedDatabase(database))).rejects.toThrow("write failed")
    expect(database.close).toHaveBeenCalledOnce()
  })

  it("guards directory handles", () => {
    expect(isLocalPackageDirectoryHandle(handle())).toBe(true)
    expect(isLocalPackageDirectoryHandle({kind: "file", getDirectoryHandle() {}, getFileHandle() {}})).toBe(false)
  })
})
