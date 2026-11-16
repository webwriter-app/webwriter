// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {createURLDigestMemo, deleteDocumentRecovery, listDocumentRecoveries, readDocumentRecovery, writeDocumentRecovery} from "./document-recovery"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sha256 = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
  byte => byte.toString(16).padStart(2, "0")).join("")
const dataURL = (label: string, length: number) => `data:text/plain,${label}`.padEnd(length, "x")

describe("inline media digest memo", () => {
  it("returns the SHA-256 of each distinct URL and hashes an unchanged URL once", async() => {
    const memo = createURLDigestMemo()
    const first = dataURL("first", 64), second = "data:text/plain,päivää \u{1F600}"
    const hash = vi.spyOn(crypto.subtle, "digest")
    const digests = await memo.digests([first, second, first])
    expect([...digests]).toEqual([[first, await sha256(first)], [second, await sha256(second)]])
    hash.mockClear()

    // A later write presents equal text in new strings, as a new serialization does.
    const html = `<img src="${first}"><img src="${second}">`
    const again = await memo.digests([html.slice(10, 10 + first.length), html.slice(html.lastIndexOf("data:"), -2)])
    expect([...again.values()]).toEqual([...digests.values()])
    expect(hash).not.toHaveBeenCalled()
    expect(memo.characters).toBe(first.length + second.length)

    const changed = first + "y", expected = await sha256(changed)
    hash.mockClear()
    expect((await memo.digests([changed])).get(changed)).toBe(expected)
    expect(hash).toHaveBeenCalledOnce()
  })

  it("stays within its limit by forgetting the URLs unused for longest", async() => {
    const memo = createURLDigestMemo(100)
    const [a, b, c] = ["a", "b", "c"].map(label => dataURL(label, 40))
    await memo.digests([a])
    await memo.digests([b])
    expect(memo.characters).toBe(80)
    await memo.digests([a])
    const expected = await sha256(c)
    const hash = vi.spyOn(crypto.subtle, "digest")
    // Room for c is made by b: a was used more recently.
    expect((await memo.digests([c])).get(c)).toBe(expected)
    expect(memo.characters).toBe(80)
    hash.mockClear()
    await memo.digests([a, c])
    expect(hash).not.toHaveBeenCalled()
    await memo.digests([b])
    expect(hash).toHaveBeenCalledOnce()
    expect(memo.characters).toBeLessThanOrEqual(100)
  })

  it("keeps a stable part of one write that exceeds the limit, and never an oversized URL", async() => {
    const memo = createURLDigestMemo(100)
    const urls = ["a", "b", "c"].map(label => dataURL(label, 40))
    const expected = await Promise.all(urls.map(sha256))
    const hash = vi.spyOn(crypto.subtle, "digest")
    for(let write = 0; write < 3; write++) {
      hash.mockClear()
      expect([...(await memo.digests(urls)).values()]).toEqual(expected)
      // Only the URL that did not fit is hashed again; the others are not evicted for it.
      expect(hash).toHaveBeenCalledTimes(write === 0 ? 3 : 1)
      expect(memo.characters).toBe(80)
    }
    const oversized = dataURL("oversized", 101)
    expect((await memo.digests([oversized])).get(oversized)).toBe(await sha256(oversized))
    expect(memo.characters).toBe(80)
    hash.mockClear()
    await memo.digests(urls.slice(0, 2))
    expect(hash).not.toHaveBeenCalled()
  })
})

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
