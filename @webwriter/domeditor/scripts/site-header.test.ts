// @vitest-environment node
import {readFile} from "node:fs/promises"
import {expect, it} from "vitest"
import {renderSiteHeader, renderSiteFooter, siteHeaderPlugin} from "./site-header.mjs"
import exampleDocuments from "../src/example-documents.json"

it("renders an inert showcase before JavaScript with the live subjects and shared layout styles", async () => {
  const source = await readFile(new URL("../index.html", import.meta.url), "utf8")
  expect(source).toContain('<script type="module" blocking="render" src="/src/site-entry.ts"></script>')
  const result = siteHeaderPlugin().transformIndexHtml.handler(source, {path: "/"})
  const fallback = result.match(/<example-showcase>([\s\S]*?)<\/example-showcase>/)?.[1] ?? ""
  expect(fallback).toContain('class="example-showcase" inert aria-hidden="true"')
  expect([...fallback.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1])).toEqual(exampleDocuments.map(example => example.subject))
  expect(fallback).toContain('<div class="document"></div>')
  expect(fallback).toContain('href="/examples/">Explore the examples →</a>')
  expect(result).not.toContain("<!-- example-showcase -->")
  expect(await readFile(new URL("../src/landing.css", import.meta.url), "utf8")).toContain('@import "./components/example-showcase.css"')
  expect(await readFile(new URL("../src/components/example-preview.ts", import.meta.url), "utf8")).toContain('import showcaseStyles from "./example-showcase.css?raw"')
})

it("keeps localization render-blocking after Vite combines the landing scripts", () => {
  const result = siteHeaderPlugin().transformIndexHtml.handler('<script type="module" crossorigin src="/assets/index.js"></script><example-showcase><!-- example-showcase --></example-showcase>', {path: "/", bundle: {}})
  expect(result).toContain('<script blocking="render" type="module" crossorigin src="/assets/index.js">')
})

it("renders the landing and Widgets headers from the same navigation template", async () => {
  const plugin = siteHeaderPlugin()
  for(const [file, path] of [["../index.html", "/"], ["../gallery/index.html", "/gallery/"], ["../examples/index.html", "/examples/"], ["../legal_notice/index.html", "/legal_notice/"]]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8")
    expect(source).toContain("<!-- site-header -->")
    expect(source).toContain('<body class="site-layout">')
    expect(source).toMatch(/<div class="site-content" tabindex="0" role="region" aria-label="Page content">\s*<main[\s\S]*?<\/main>\s*<!-- site-footer -->\s*<\/div>/)
    const result = plugin.transformIndexHtml.handler(source, {path})
    const header = result.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0]
    expect(result.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0]).toBe(renderSiteFooter())
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
  expect(plugin.transformIndexHtml.handler("<p>No site header here</p>", {path: "/frame-shell.html"})).toBe("<p>No site header here</p>")
})

it("links the shared footer to the standalone legal notice without a tagline", async () => {
  const footer = renderSiteFooter()
  expect(footer).toContain('href="/legal_notice/">Legal notice</a>')
  expect(footer).toContain("© Frederic Salmen.")
  expect(footer).toContain("All rights reserved.")
  expect(footer).toMatch(/<div class="footer-legal"><small[^>]*>[\s\S]*?<\/small><a href="\/legal_notice\/">Legal notice<\/a><\/div>/)
  expect(footer).toContain("<site-language-switcher>")
  expect(footer).not.toContain("Make it interactive.")
  const legal = await readFile(new URL("../legal_notice/index.html", import.meta.url), "utf8")
  expect(legal).toContain('<h1>Legal notice</h1>')
  expect(legal).toContain('href="mailto:contact@webwriter.app"')
  expect(legal).toContain('href="tel:+492418021967"')
  expect(legal).toContain("Ahornstr. 55, 52074 Aachen")
  for(const heading of ["Liability for Content", "Liability for Links", "Copyright"]) {
    expect(legal).toContain(`<h2>${heading}</h2>`)
  }
  expect(legal).toContain("Last Updated: May 29, 2023")
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
