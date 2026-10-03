// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {documentOpenReference, parseDocumentOpenReference, readLocalDocumentReference, readRecentDocuments, recentDocumentAccessible, rememberRecentDocument, saveRecentDocuments, type RecentDocument, type RecentFileHandle} from "./recent-documents"
import type {BackendSession} from "./backend-client"

const fileHandle = (name = "Lesson.html"): RecentFileHandle => ({name,
  getFile: vi.fn().mockResolvedValue(new File(["<p>Lesson</p>"], name)),
  createWritable: vi.fn(), queryPermission: vi.fn().mockResolvedValue("granted"),
})
const local = (id: string, handle = fileHandle()): RecentDocument => ({id, title: handle.name, openedAt: 1, kind: "local", handle})
const cloud = (id = "cloud"): Extract<RecentDocument, {kind: "backend"}> => ({id, title: "Cloud lesson", openedAt: 2, kind: "backend", documentId: "doc", apiBaseUrl: "https://storage.example/api", userId: "ada"})
const session = {apiBaseUrl: "https://storage.example/api", user: {id: "ada"}} as BackendSession

function memoryDatabase(initial: unknown = []) {
  const values = new Map<string, unknown>([["recent", initial]])
  const close = vi.fn()
  const db = {objectStoreNames: {contains: () => true}, close, transaction: () => {
    const transaction: {oncomplete?: () => void, objectStore: () => unknown} = {objectStore: () => ({
      get: (key: string) => {const request = {result: values.get(key), onsuccess: undefined as (() => void) | undefined}; queueMicrotask(() => request.onsuccess?.()); return request},
      put: (next: unknown, key: string) => {values.set(key, next); queueMicrotask(() => transaction.oncomplete?.())},
    })}
    return transaction
  }}
  const factory = {open: () => {const request = {result: db, onsuccess: undefined as (() => void) | undefined}; queueMicrotask(() => request.onsuccess?.()); return request}} as unknown as IDBFactory
  return {factory, close, value: () => values.get("recent")}
}

describe("recent documents", () => {
  it("persists references and handles, restores opening order and rejects malformed records", async () => {
    const storage = memoryDatabase()
    const documents = [cloud(), local("local")]
    await saveRecentDocuments(documents, storage.factory)
    expect(storage.value()).toEqual(documents)
    expect(documents.every(document => !("content" in document))).toBe(true)
    expect(await readRecentDocuments(storage.factory)).toEqual(documents)
    expect(storage.close).toHaveBeenCalledTimes(2)
    const invalid = memoryDatabase([null, {id: "bad"}, {...local("bad"), handle: {}}, {...cloud("bad"), openedAt: NaN}, ...documents.slice().reverse()])
    expect(await readRecentDocuments(invalid.factory)).toEqual(documents)
  })

  it("keeps ten distinct most recently opened documents and distinguishes same-named local files", async () => {
    let documents: RecentDocument[] = []
    for(let i = 0; i < 12; i++) documents = await rememberRecentDocument(documents, local(String(i)))
    expect(documents.map(document => document.id)).toEqual(["11", "10", "9", "8", "7", "6", "5", "4", "3", "2"])
    const last = documents[5]
    documents = await rememberRecentDocument(documents, {...last, openedAt: 3})
    expect(documents[0]).toEqual({...last, openedAt: 3})
    expect(documents).toHaveLength(10)
    const reopened = fileHandle()
    reopened.isSameEntry = vi.fn().mockResolvedValue(true)
    expect(await rememberRecentDocument([local("old")], local("new", reopened))).toEqual([expect.objectContaining({id: "old", handle: reopened})])
    expect(await rememberRecentDocument([cloud()], {...cloud("new"), userId: "grace"})).toHaveLength(2)
  })

  it("only exposes readable file handles without prompting or reading document contents", async () => {
    const handle = fileHandle()
    expect(await recentDocumentAccessible(local("local", handle), null, new Set())).toBe(true)
    expect(handle.getFile).toHaveBeenCalledOnce()
    for(const permission of ["denied", "prompt"]) {
      vi.mocked(handle.queryPermission!).mockResolvedValue(permission as PermissionState)
      expect(await recentDocumentAccessible(local("local", handle), null, new Set())).toBe(false)
    }
    expect(handle.getFile).toHaveBeenCalledOnce()
    vi.mocked(handle.queryPermission!).mockResolvedValue("granted")
    vi.mocked(handle.getFile).mockRejectedValue(new Error("File deleted"))
    expect(await recentDocumentAccessible(local("local", handle), null, new Set())).toBe(false)
  })

  it("requires the same connected account and storage, and an existing cloud document", async () => {
    const ids = new Set(["doc"])
    expect(await recentDocumentAccessible(cloud(), session, ids)).toBe(true)
    expect(await recentDocumentAccessible(cloud(), null, ids)).toBe(false)
    expect(await recentDocumentAccessible(cloud(), {...session, user: {id: "grace", name: "Grace"}}, ids)).toBe(false)
    expect(await recentDocumentAccessible(cloud(), {...session, apiBaseUrl: "https://other.example/api"}, ids)).toBe(false)
    expect(await recentDocumentAccessible(cloud(), session, new Set())).toBe(false)
  })

  it("restores local links after their handles leave the recent list", async () => {
    const storage = memoryDatabase()
    const old = local("old")
    await saveRecentDocuments([old], storage.factory)
    await saveRecentDocuments(Array.from({length: 10}, (_, i) => local(String(i))), storage.factory)
    expect(await readRecentDocuments(storage.factory)).not.toContainEqual(old)
    expect(await readLocalDocumentReference("old", storage.factory)).toEqual(old)
    expect(await readLocalDocumentReference("missing", storage.factory)).toBeNull()
  })

  it("encodes local and cloud links and preserves endpoint paths and document ids", () => {
    expect(parseDocumentOpenReference(documentOpenReference(local("file-id")))).toEqual({kind: "local", id: "file-id"})
    const document = {...cloud(), apiBaseUrl: "https://storage.example/nested/api/", documentId: "folder/a b?"}
    expect(documentOpenReference(document)).toBe("https://storage.example/nested/api/documents/folder%2Fa%20b%3F")
    expect(parseDocumentOpenReference(documentOpenReference(document))).toEqual({kind: "backend", apiBaseUrl: "https://storage.example/nested/api", documentId: "folder/a b?"})
    for(const value of ["local:", "file:///tmp/doc", "javascript:alert(1)", "https://u:p@storage.example/api/documents/a", "https://storage.example/api/documents/", "https://storage.example/api/documents/%ZZ", "https://storage.example/api/documents/a?token=secret"]) {
      expect(parseDocumentOpenReference(value)).toBeNull()
    }
  })

  it("handles unavailable storage without preventing an open", async () => {
    const unavailable = {open: () => {throw new Error("Storage blocked")}} as unknown as IDBFactory
    expect(await readRecentDocuments(unavailable)).toEqual([])
    await expect(saveRecentDocuments([cloud()], unavailable)).resolves.toBeUndefined()
  })
})
