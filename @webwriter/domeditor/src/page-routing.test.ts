import {describe, expect, it} from "vitest"
import {legacyEditorURL} from "./page-routing"

describe("legacy editor URLs", () => {
  it.each(["open", "session", "liveSession", "liveToken", "share", "source"])("routes root URLs containing %s to the editor", parameter => {
    const result = legacyEditorURL(new URL(`https://example.test/?${parameter}=`))
    expect(result?.pathname).toBe("/editor/")
  })

  it("preserves empty and repeated parameters, encoding, and the hash", () => {
    const input = "https://example.test/index.html?open=&open=https%3A%2F%2Fdocs.test%2Fa%3Fx%3D1&other=a+b#part%20one"
    const result = legacyEditorURL(input)
    expect(result).toBeInstanceOf(URL)
    expect(result!.pathname).toBe("/editor/")
    expect(result!.search).toBe("?open=&open=https%3A%2F%2Fdocs.test%2Fa%3Fx%3D1&other=a+b")
    expect(result!.hash).toBe("#part%20one")
  })

  it("does not redirect editor paths or unrelated root queries", () => {
    for(const input of [
      "https://example.test/editor/?open=doc",
      "https://example.test/other/?session=room",
      "https://example.test/?marketing=campaign",
      "https://example.test/index.html?campaign=one",
    ]) expect(legacyEditorURL(input)).toBeNull()
  })

  it("accepts relative root URLs and leaves the input URL unchanged", () => {
    const input = new URL("https://example.test/?source=local#top")
    const result = legacyEditorURL(input)
    expect(result?.href).toBe("https://example.test/editor/?source=local#top")
    expect(input.pathname).toBe("/")
  })
})
