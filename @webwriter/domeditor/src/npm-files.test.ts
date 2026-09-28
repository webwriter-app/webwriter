import {describe, expect, it, vi} from "vitest"
import {canonicalNpmUrl, fetchNpmFile, npmMirrorUrls} from "./npm-files"

const file = "https://cdn.jsdelivr.net/npm/@lit/reactive-element@2.1.2/css-tag.js"

describe("npm file mirrors", () => {
  it("addresses the same file on every mirror and maps mirror URLs back to jsDelivr", () => {
    const mirrors = npmMirrorUrls(file)
    expect(mirrors).toContain("https://unpkg.com/@lit/reactive-element@2.1.2/css-tag.js")
    expect(mirrors).toContain("https://fastly.jsdelivr.net/npm/@lit/reactive-element@2.1.2/css-tag.js")
    expect(mirrors.map(canonicalNpmUrl)).toEqual(mirrors.map(() => file))
    expect(npmMirrorUrls("https://example.test/widget.js")).toEqual([])
    expect(canonicalNpmUrl("https://example.test/widget.js")).toBe("https://example.test/widget.js")
  })

  it("keeps jsDelivr answers, including a missing file, without contacting a mirror", async () => {
    const fetcher = vi.fn(async() => new Response(null, {status: 404}))
    expect((await fetchNpmFile(file, {}, fetcher as typeof fetch)).status).toBe(404)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("answers from the next mirror when jsDelivr fails, throttles or stalls", async () => {
    for(const primary of [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.resolve(new Response(null, {status: 503})),
      () => Promise.resolve(new Response(null, {status: 429})),
      (signal: AbortSignal) => new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    ]) {
      const fetcher = vi.fn(async(url: string, init: RequestInit = {}) => url === file
        ? primary(init.signal!)
        : url.startsWith("https://unpkg.com/") ? Promise.reject(new TypeError("Failed to fetch"))
          : new Response("export const css = 1", {headers: {"content-type": "text/javascript"}}))
      const response = await fetchNpmFile(file, {}, fetcher as typeof fetch, 20)
      expect(await response.text()).toBe("export const css = 1")
      expect(response.headers.get("content-type")).toBe("text/javascript")
      // A rebuilt response carries no URL, so the module keeps its jsDelivr address.
      expect(response.url).toBe("")
      expect(fetcher.mock.calls[2][0]).toBe("https://gcore.jsdelivr.net/npm/@lit/reactive-element@2.1.2/css-tag.js")
    }
  })

  it("returns jsDelivr's failure when no mirror has the file, and stops when the caller aborts", async () => {
    const failing = vi.fn(async(url: string) => new Response(null, {status: url === file ? 502 : 404}))
    expect((await fetchNpmFile(file, {}, failing as typeof fetch)).status).toBe(502)
    expect(failing).toHaveBeenCalledTimes(5)

    const controller = new AbortController()
    const aborting = vi.fn(async() => { controller.abort(); throw new DOMException("Aborted", "AbortError") })
    await expect(fetchNpmFile(file, {signal: controller.signal}, aborting as typeof fetch)).rejects.toThrow("Aborted")
    expect(aborting).toHaveBeenCalledTimes(1)
  })

  it("fetches other URLs unchanged", async () => {
    const fetcher = vi.fn(async() => new Response("ok"))
    await fetchNpmFile("https://example.test/widget.js", {}, fetcher as typeof fetch)
    expect(fetcher).toHaveBeenCalledWith("https://example.test/widget.js", {})
  })
})
