// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {deleteDocumentRecovery, listDocumentRecoveries, readDocumentRecovery, writeDocumentRecovery} from "./document-recovery"

afterEach(() => vi.unstubAllGlobals())

describe("document recovery storage", () => {
  it("requires IndexedDB instead of reporting a write as saved when unavailable", async() => {
    vi.stubGlobal("indexedDB", undefined)
    const record = {id: "draft", title: "Draft", updatedAt: 1}
    await expect(writeDocumentRecovery(record, "<p>content</p>")).rejects.toThrow("IndexedDB is unavailable")
    await expect(listDocumentRecoveries()).rejects.toThrow("IndexedDB is unavailable")
    await expect(readDocumentRecovery("draft")).rejects.toThrow("IndexedDB is unavailable")
    await expect(deleteDocumentRecovery("draft")).rejects.toThrow("IndexedDB is unavailable")
  })
})
