// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "./domeditor"

let activeEditor: DOMEditor | undefined
afterEach(() => {
  activeEditor?.destroy()
  activeEditor = undefined
  document.head.querySelectorAll("link, style").forEach(element => element.remove())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("offline HTML resources", () => {
  it("inlines nested relative stylesheet imports and assets", async () => {
    document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/css/main.css" media="print">')
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input)
      if(url.endsWith("main.css")) return new Response('@import "nested/theme.css" screen;')
      if(url.endsWith("theme.css")) return new Response(".icon { background: url(../img/icon.woff2); }")
      return new Response(new Uint8Array([1, 2, 3]), {headers: {"content-type": "font/woff2"}})
    })
    const editor = activeEditor = new DOMEditor()
    const html = await editor.serializeHTML(true)
    expect(html).toContain("@media")
    expect(html).toContain("data:font/woff2;base64,AQID")
    expect(html).toContain('media="print"')
  })

  it("terminates cyclic imports while preserving import conditions and inlines styles", async () => {
    document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/a.css">')
    document.body.innerHTML = '<p style="background-image: url(\'/inline.png\')"></p>'
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input)
      if(url.endsWith("/a.css")) return new Response('@import url("/b.css") layer(theme);')
      if(url.endsWith("/b.css")) return new Response('@import "/a.css"; .a { color: red; }')
      return new Response(new Uint8Array([9]), {headers: {"content-type": "image/png"}})
    })
    const editor = activeEditor = new DOMEditor()
    const html = await editor.serializeHTML(true)
    expect(html).toContain("layer(theme)")
    expect(html).toContain('data:image/png;base64,CQ==')
  })

  it("reports module graphs that cannot be made self-contained", async () => {
    document.body.innerHTML = '<script type="module" src="/app.js"></script>'
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('import "./dependency.js"'))
    const editor = activeEditor = new DOMEditor()
    await expect(editor.serializeHTML(true)).rejects.toThrow("module dependency graph")
  })
})
