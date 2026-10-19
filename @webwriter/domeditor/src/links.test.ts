import {describe, expect, it} from "vitest"
import {normalizeLinkHref} from "./links"

describe("link address normalization", () => {
  it.each([
    ["example.com", "https://example.com"],
    [" www.example.com/path?q=one#part ", "https://www.example.com/path?q=one#part"],
    ["//example.com/path", "https://example.com/path"],
    ["http://example.com/path", "http://example.com/path"],
    ["https:/example.com/path", "https://example.com/path"],
    ["HTTPS://example.com/path", "https://example.com/path"],
    ["example.com:8443/path", "https://example.com:8443/path"],
    ["localhost:8080/path", "https://localhost:8080/path"],
    ["example.com/a b", "https://example.com/a%20b"],
    ["#chapter", "#chapter"],
    ["mailto:reader@example.com", "mailto:reader@example.com"],
    ["tel:+491234", "tel:+491234"],
    ["ftp://example.com/file", "ftp://example.com/file"],
    ["file:///tmp/file", "file:///tmp/file"],
  ])("interprets %s as %s", (input, expected) => {
    expect(normalizeLinkHref(input)).toBe(expected)
    expect(normalizeLinkHref(expected)).toBe(expected)
  })

  it.each(["", " ", "#", "/relative", "../relative", "?query", "not a host", "https://", "javascript:alert(1)", "data:text/html,example", "example.com:99999/path"])("rejects %s without resolving against the frame", input => {
    expect(normalizeLinkHref(input)).toBeNull()
  })
})
