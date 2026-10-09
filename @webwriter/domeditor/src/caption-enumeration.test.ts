// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {captionEnumerationCSS, defaultCaptionEnumeration, isCaptionEnumeration, readCaptionEnumeration, writeCaptionEnumeration} from "./caption-enumeration"

describe("caption enumeration", () => {
  it("makes the figure numbering bold without changing caption text or table numbering", () => {
    const source = captionEnumerationCSS(defaultCaptionEnumeration())
    expect(source).toMatch(/figure > figcaption::before \{[^}]*font-weight: bold;/)
    expect(source).not.toMatch(/figure > figcaption \{[^}]*font-weight/)
    expect(source).not.toMatch(/table > caption::before \{[^}]*font-weight/)
  })

  it("round-trips independent series in a portable authored stylesheet", () => {
    const doc = document.implementation.createHTMLDocument()
    const config = defaultCaptionEnumeration()
    config.figure.start = 4
    config.figure.style = "upper-roman"
    config.table.enabled = false
    writeCaptionEnumeration(doc.head, config)
    writeCaptionEnumeration(doc.head, config)
    expect(doc.head.querySelectorAll("style")).toHaveLength(1)
    expect(readCaptionEnumeration(doc.head)).toEqual(config)
    const source = doc.head.querySelector("style")!.textContent!
    expect(source).toContain("ww-figures 3")
    expect(source).toContain("figure:has(> figcaption) { counter-increment: ww-figures 0; }")
    expect(source).toContain("figure > figcaption { counter-increment: ww-figures; }")
    expect(source).toContain("counter(ww-figures, upper-roman)")
    expect(source).not.toContain("table > caption")
    expect(source).toContain('figcaption:lang(de)::before')
  })

  it("puts more specific language overrides last regardless of configuration order", () => {
    const config = defaultCaptionEnumeration()
    config.figure.labels = {default: "Figure", "de-AT": "Figur", de: "Abb."}
    const source = captionEnumerationCSS(config)
    expect(source.indexOf(':lang(de)')).toBeLessThan(source.indexOf(':lang(de-AT)'))
  })

  it("escapes arbitrary label text without breaking HTML, CSS or configuration", () => {
    const doc = document.implementation.createHTMLDocument()
    const config = defaultCaptionEnumeration()
    config.figure.labels.default = '</style><script>"\\\n*/'
    config.figure.separator = '";} body {display:none} /*'
    writeCaptionEnumeration(doc.head, config)
    expect(doc.head.querySelector("style")!.textContent).not.toContain("</style>")
    expect(readCaptionEnumeration(doc.head)).toEqual(config)
    expect(captionEnumerationCSS(config)).toContain("\\3c ")
  })

  it("rejects invalid configuration and ignores unrelated or malformed styles", () => {
    const doc = document.implementation.createHTMLDocument()
    const config = defaultCaptionEnumeration()
    expect(isCaptionEnumeration(config)).toBe(true)
    expect(isCaptionEnumeration({...config, figure: {...config.figure, start: 0}})).toBe(false)
    expect(isCaptionEnumeration({...config, figure: {...config.figure, style: "url(evil)"}})).toBe(false)
    expect(isCaptionEnumeration({...config, figure: {...config.figure, labels: {default: "Fig.", 'en){}': "Bad"}}})).toBe(false)
    doc.head.innerHTML = '<style>body {color:red}</style><style data-ww-caption-enumeration>/* malformed */</style>'
    expect(readCaptionEnumeration(doc.head)).toBeUndefined()
  })
})
