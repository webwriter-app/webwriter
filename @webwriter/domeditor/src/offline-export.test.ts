// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "./domeditor"
import {restoreOriginalResourceURLs} from "./serialization"
import {bundleOfflineModules} from "./offline-module-bundler"

vi.mock("./offline-module-bundler", () => ({bundleOfflineModules: vi.fn()}))

let activeEditor: DOMEditor | undefined
const decodeData = (url: string) => atob(url.slice(url.indexOf(",") + 1).split("#")[0])
const imports = (css: string) => [...css.matchAll(/@import\s+url\("([^"]+)"\)/g)].map(match => decodeData(match[1]))
const exportDocument = async () => {
  activeEditor = new DOMEditor()
  return new DOMParser().parseFromString(await activeEditor.serializeHTML(true), "text/html")
}
const mockResources = (resources: Record<string, string | Uint8Array<ArrayBuffer>>) => vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
  const url = new URL(String(input), document.baseURI)
  const value = resources[url.pathname]
  if(value === undefined) throw new Error(`Unexpected fetch: ${url.href}`)
  return new Response(value, {headers: {"content-type": typeof value === "string" ? "text/css" : "image/png"}})
})

afterEach(() => {
  activeEditor?.destroy()
  activeEditor = undefined
  document.head.querySelectorAll("link, style, script[src]").forEach(element => element.remove())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("offline HTML resources", () => {
  it("bundles selected package modules once and restores their online entries on reopen", async () => {
    document.head.insertAdjacentHTML("beforeend", '<script type="module" src="https://cdn.example/a.js"></script><script type="module" src="https://cdn.example/b.js"></script>')
    activeEditor = new DOMEditor()
    ;(activeEditor.features.dependency as unknown as {dependencyPlan: unknown}).dependencyPlan = {
      entries: ["https://cdn.example/a.js", "https://cdn.example/b.js"],
      map: {imports: {lit: "https://cdn.example/lit.js"}},
    }
    vi.mocked(bundleOfflineModules).mockResolvedValue({js: "customElements.define('test-offline', class extends HTMLElement {})", css: ".widget {color: red}"})
    const exported = new DOMParser().parseFromString(await activeEditor.serializeHTML(true), "text/html")
    expect(bundleOfflineModules).toHaveBeenCalledOnce()
    expect(exported.querySelectorAll('script[type="module"]')).toHaveLength(1)
    expect(exported.querySelector<HTMLScriptElement>('script[type="module"]')!.src).toMatch(/^data:text\/javascript;base64,/)
    expect(exported.querySelector("style")!.textContent).toContain(".widget")
    restoreOriginalResourceURLs(exported)
    expect(exported.querySelector("style[data-webwriter-offline-package-style]")).toBeNull()
    expect(Array.from(exported.querySelectorAll<HTMLScriptElement>('script[type="module"]')).map(script => script.src)).toEqual([
      "https://cdn.example/a.js", "https://cdn.example/b.js",
    ])
  })

  it("embeds SVG raster images, preserves fragments and restores namespaced URLs", async () => {
    document.body.innerHTML = '<svg><image href="/image.png#crop"></image><image xlink:href="/other.png"></image><use href="#local"></use></svg>'
    mockResources({"/image.png": new Uint8Array([1]), "/other.png": new Uint8Array([2])})
    const exported = await exportDocument()
    const images = exported.querySelectorAll("image")
    expect(images[0].getAttribute("href")).toBe("data:image/png;base64,AQ==#crop")
    expect(images[1].getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("data:image/png;base64,Ag==")
    expect(exported.querySelector("use")!.getAttribute("href")).toBe("#local")
    restoreOriginalResourceURLs(exported)
    expect(images[0].getAttribute("href")).toBe("/image.png#crop")
    expect(images[1].getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("/other.png")
  })

  it.each(["use", "feImage"])("rejects unsupported external SVG %s dependencies explicitly", async tag => {
    document.body.innerHTML = `<svg><${tag} href="/sprite.svg#symbol"></${tag}></svg>`
    await expect(exportDocument()).rejects.toThrow("Offline export cannot embed external SVG")
  })

  it("rejects nested SVG images instead of silently exporting their online dependencies", async () => {
    document.body.innerHTML = '<svg><image href="/nested.svg"></image></svg>'
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('<svg><image href="/online.png"/></svg>', {headers: {"content-type": "image/svg+xml"}}))
    await expect(exportDocument()).rejects.toThrow("nested SVG resources")
  })

  it("resolves each imported stylesheet's assets against that file and preserves link semantics", async () => {
    document.head.insertAdjacentHTML("beforeend", '<link rel="alternate stylesheet" href="/css/main.css" media="print" title="Print" disabled integrity="sha384-original">')
    const fetcher = mockResources({
      "/css/main.css": '@import "nested/theme.css" screen;',
      "/css/nested/theme.css": ".icon { background: url(../img/icon.woff2); }",
      "/css/img/icon.woff2": new Uint8Array([1, 2, 3]),
    })
    const exported = await exportDocument()
    const link = exported.querySelector("link")!
    expect(link.getAttribute("rel")).toBe("alternate stylesheet")
    expect(link.getAttribute("media")).toBe("print")
    expect(link.getAttribute("title")).toBe("Print")
    expect(link.hasAttribute("disabled")).toBe(true)
    expect(link.hasAttribute("integrity")).toBe(false)
    const css = decodeData(link.getAttribute("href")!)
    expect(css).toContain(") screen;")
    expect(imports(css)[0]).toContain('url("data:image/png;base64,AQID")')
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      "/css/main.css", "/css/nested/theme.css", "/css/img/icon.woff2",
    ])
    restoreOriginalResourceURLs(exported)
    expect(link.getAttribute("href")).toBe("/css/main.css")
    expect(link.getAttribute("integrity")).toBe("sha384-original")
  })

  it("terminates cyclic imports without dropping repeated imports or changing their conditions", async () => {
    document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/a.css">')
    mockResources({
      "/a.css": '@import url("/b.css") layer(theme) supports(display: grid) screen; @import "/b.css" print;',
      "/b.css": '@import "/a.css"; .b { color: red; }',
    })
    const exported = await exportDocument()
    const css = decodeData(exported.querySelector("link")!.getAttribute("href")!)
    expect(css).toContain("layer(theme) supports(display: grid) screen;")
    expect(css).toContain(") print;")
    expect(imports(css)).toHaveLength(2)
    for(const imported of imports(css)) {
      expect(imported).toContain(".b { color: red; }")
      expect(imports(imported)).toEqual([""])
    }
  })

  it("uses the final stylesheet URL after redirects", async () => {
    document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/redirect.css">')
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if(new URL(String(input)).pathname === "/redirect.css") {
        const response = new Response('.x { background: url("icon.png"); }')
        Object.defineProperty(response, "url", {value: "https://cdn.example.com/theme/main.css"})
        return response
      }
      expect(String(input)).toBe("https://cdn.example.com/theme/icon.png")
      return new Response(new Uint8Array([1]), {headers: {"content-type": "image/png"}})
    })
    await exportDocument()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("handles quoted parentheses, escapes and image-set strings without fetching comments or content text", async () => {
    const source = '.icon { background: u\\72l("/image(a).png"); mask: url(/image\\(b\\).png); border-image: image-set("/small.png" 1x, url("/large.png") 2x); content: "url(/ignored.png)" } /* @import "/ignored.css"; */'
    document.head.insertAdjacentHTML("beforeend", `<style>${source}</style>`)
    const fetcher = mockResources({
      "/image(a).png": new Uint8Array([1]), "/image(b).png": new Uint8Array([2]),
      "/small.png": new Uint8Array([3]), "/large.png": new Uint8Array([4]),
    })
    const exported = await exportDocument()
    const css = exported.querySelector("style")!.textContent!
    expect(css.match(/data:image\/png;base64/g)).toHaveLength(4)
    expect(css).toContain('content: "url(/ignored.png)"')
    expect(css).toContain('/* @import "/ignored.css"; */')
    expect(fetcher).toHaveBeenCalledTimes(4)
    restoreOriginalResourceURLs(exported)
    expect(exported.querySelector("style")!.textContent).toBe(source)
  })

  it("embeds authored styles, mixed data srcsets and template resources and restores the source URLs", async () => {
    document.head.insertAdjacentHTML("beforeend", '<style>@import "/theme.css";</style>')
    document.body.innerHTML = '<p style="background-image: url(/inline.png)">Text</p><img srcset="data:image/png;base64,AQ== 1x, /large.png 2x"><template><img src="/inside.png"></template>'
    mockResources({
      "/theme.css": "body { background: url(/bg.png); }", "/bg.png": new Uint8Array([7]),
      "/inline.png": new Uint8Array([8]), "/large.png": new Uint8Array([9]), "/inside.png": new Uint8Array([10]),
    })
    const exported = await exportDocument()
    expect(imports(exported.querySelector("style")!.textContent!)[0]).toContain("data:image/png;base64,Bw==")
    expect(exported.querySelector("p")!.getAttribute("style")).toContain("data:image/png;base64,CA==")
    expect(exported.querySelector("img")!.getAttribute("srcset")).toBe("data:image/png;base64,AQ== 1x, data:image/png;base64,CQ== 2x")
    const templateImage = exported.querySelector("template")!.content.querySelector("img")!
    expect(templateImage.getAttribute("src")).toBe("data:image/png;base64,Cg==")
    expect(document.querySelector("p")!.getAttribute("style")).toBe("background-image: url(/inline.png)")
    restoreOriginalResourceURLs(exported)
    expect(exported.querySelector("p")!.getAttribute("style")).toBe("background-image: url(/inline.png)")
    expect(templateImage.getAttribute("src")).toBe("/inside.png")
    expect(exported.querySelector("style")!.textContent).toBe('@import "/theme.css";')
  })

  it.each(['import "./dependency.js"', 'export * from "./dependency.js"', 'import("./dependency.js")', 'console.log(import.meta.url)'])("reports unsupported module dependencies in %s", async source => {
    document.body.innerHTML = '<script type="module" src="/app.js"></script>'
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source))
    await expect(exportDocument()).rejects.toThrow("module dependency graph")
  })

  it("checks inline dynamic imports while ignoring strings, comments and non-executable script data", async () => {
    document.body.innerHTML = '<script type="module">const text = "import \'./ignored.js\'"; /* export from \'./ignored.js\' */</script><script type="application/json">{"import": "./data.json"}</script>'
    activeEditor = new DOMEditor()
    await expect(activeEditor.serializeHTML(true)).resolves.toContain("ignored.js")
    document.querySelector("script")!.textContent = 'import("./dependency.js")'
    await expect(activeEditor.serializeHTML(true)).rejects.toThrow("module dependency graph")
  })

  it("keeps external scripts as data resources so raw-text terminators cannot break saved HTML", async () => {
    document.body.innerHTML = '<script src="/app.js"></script><p>After</p>'
    const source = 'const markup = "</script><h1>inside a string</h1>"'
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source))
    const exported = await exportDocument()
    expect(decodeData(exported.querySelector("script")!.src)).toBe(source)
    expect(exported.querySelector("h1")).toBeNull()
    expect(exported.querySelector("p")!.textContent).toBe("After")
  })

  it("reports failed downloads and unsupported embedded documents instead of leaving an online dependency", async () => {
    document.body.innerHTML = '<img src="/missing.png">'
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Missing", {status: 404}))
    activeEditor = new DOMEditor()
    await expect(activeEditor.serializeHTML(true)).rejects.toThrow("404")
    expect(document.querySelector("img")!.getAttribute("src")).toBe("/missing.png")
    document.body.innerHTML = '<iframe src="https://example.com/remote.html"></iframe>'
    await expect(activeEditor.serializeHTML(true)).rejects.toThrow("iframe's resource dependencies")
  })
})
