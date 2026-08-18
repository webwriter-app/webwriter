// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {serializeDoctype} from "./serialization"

describe("serializeDoctype()", () => {
  it("omits a missing doctype", () => {
    expect(serializeDoctype(null)).toBe("")
  })

  it.each([
    ["HTML5", "html", "", "", "<!DOCTYPE html>"],
    ["a public identifier", "html", "-//W3C//DTD XHTML 1.0 Strict//EN", "", '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">'],
    ["a system identifier", "svg", "", "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd", '<!DOCTYPE svg SYSTEM "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'],
    ["public and system identifiers", "html", "-//W3C//DTD XHTML 1.0 Strict//EN", "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd", '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">'],
  ])("serializes %s syntax", (_case, name, publicId, systemId, expected) => {
    const doctype = document.implementation.createDocumentType(name, publicId, systemId)

    expect(serializeDoctype(doctype)).toBe(expected)
  })
})
