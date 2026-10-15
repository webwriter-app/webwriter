// @vitest-environment node
import {readFile} from "node:fs/promises"
import {expect, it} from "vitest"
import {renderSiteHeader, siteHeaderPlugin} from "./site-header.mjs"

it("renders the landing and Widgets headers from the same navigation template", async () => {
  const plugin = siteHeaderPlugin()
  for(const [file, path] of [["../index.html", "/"], ["../gallery/index.html", "/gallery/"], ["../examples/index.html", "/examples/"]]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8")
    expect(source).toContain("<!-- site-header -->")
    expect(source).toContain('<body class="site-layout">')
    expect(source).toMatch(/<div class="site-content" tabindex="0" role="region" aria-label="Page content">\s*<main[\s\S]*?<\/main>\s*<footer>[\s\S]*?<\/footer>\s*<\/div>/)
    const result = plugin.transformIndexHtml(source, {path})
    const header = result.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0]
    expect(result).not.toContain("<!-- site-header -->")
    expect(header).toContain('aria-label="Main navigation"')
    expect([...header.matchAll(/href="([^"]+)"/g)].map(match => match[1])).toEqual(["/", "/examples/", "/gallery/", "/docs/", "/editor/"])
    expect(header).toContain("WebWriter")
    expect(header).toContain("by Edumix")
    if(path === "/gallery/") expect(header).toContain('href="/gallery/" aria-current="page">Widgets</a>')
    if(path === "/examples/") expect(header).toContain('href="/examples/" aria-current="page">Examples</a>')
  }
  const docs = renderSiteHeader("/docs/widgets/tutorial/01-setup.md")
  expect(docs).toContain('href="/docs/" aria-current="page">Documentation</a>')
  expect(plugin.transformIndexHtml("<p>No site header here</p>", {path: "/frame-shell.html"})).toBe("<p>No site header here</p>")
})

it("emits the shared stylesheet for static documentation", async () => {
  const assets = []
  await siteHeaderPlugin().generateBundle.call({emitFile: asset => assets.push(asset)})
  expect(assets).toHaveLength(1)
  expect(assets[0].fileName).toBe("assets/site-header.css")
  const source = await readFile(new URL("../src/site-header.css", import.meta.url), "utf8")
  expect(assets[0].source).toBe(source)
  expect(await readFile(new URL("../src/landing.css", import.meta.url), "utf8")).toContain('@import "./site-header.css"')
})
