// @vitest-environment node
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createServer, request as httpRequest} from "node:http"
import {afterEach, expect, it, vi} from "vitest"
import {documentationPlugin} from "./documentation-plugin.mjs"
import {renderSiteFooter} from "./site-header.mjs"

let directory
let server
let activePlugin

afterEach(async () => {
  await activePlugin?.closeBundle?.()
  activePlugin = undefined
  if(server) await new Promise(resolve => server.close(resolve))
  server = undefined
  if(directory) rmSync(directory, {recursive: true, force: true})
  directory = undefined
})

async function fixture() {
  directory = mkdtempSync(join(tmpdir(), "documentation-plugin-"))
  const docs = join(directory, "docs", "widgets")
  const sectionOne = join(docs, "basics")
  const sectionTwo = join(docs, "advanced")
  for(const path of [sectionOne, sectionTwo]) mkdirSync(path, {recursive: true})
  writeFileSync(join(docs, "index.md"), `---\ntitle: Widget docs\n---\n# Widget documentation\n\n- [Basics](./basics/index.md)\n- [Advanced](./advanced/index.md)\n`)
  writeFileSync(join(sectionOne, "index.md"), `# Basics\n\n- [First page](./first.md)\n- [Second page](./second.md)\n`)
  const fence = String.fromCharCode(96).repeat(3)
  const firstPage = [
    "---", "draft: true", "---", "# First page", "", "## A heading!", "",
    "<!-- library:vanilla -->", "Vanilla-only instructions.", "",
    '<iframe src="./example.html" title="Example" loading="lazy"></iframe>', "<!-- /library -->", "",
    "<!-- library:lit -->", "Lit-only instructions.", "",
    '<iframe src="./lit-example.html" title="Lit example" loading="lazy"></iframe>', "<!-- /library -->", "",
    "[Example source](./example.js)", "[Second page](./second.md?step=2#setup)",
    "[State source](/docs/widgets/examples/04-state.js?download=1#state)",
    "[Preview](/docs/widgets/examples/preview.html?step=3#demo)",
    "[Package](/docs/widgets/examples/package.json)", "[External](https://example.com/guide?q=1#part)", "",
    `${fence}js`, 'const message = "hello"', fence, "", `${fence}made-up-language`,
    '<script>alert("unsafe")</script>', fence, "",
    '<details id="complete-script">', '<summary>Complete script</summary>', "",
    '<!-- script:../examples/04-state.js -->', "", '</details>', "",
  ].join("\n")
  writeFileSync(join(sectionOne, "first.md"), firstPage)
  writeFileSync(join(sectionOne, "second.md"), `# Second page\n\nA second page.\n`)
  writeFileSync(join(sectionTwo, "index.md"), `# Advanced\n\n- [Third page](./third.md)\n`)
  writeFileSync(join(sectionTwo, "third.md"), `# Third page\n`)
  writeFileSync(join(directory, "README.md"), `---\nprivate: true\n---\n# Project README\n\n## Getting started\n`)
  writeFileSync(join(directory, "packages.md"), "# Packages\n")
  writeFileSync(join(sectionOne, "example.html"), "<h1>Example</h1>")
  writeFileSync(join(sectionOne, "example.js"), "export const example = true")
  const examples = join(docs, "examples")
  const litExamples = join(examples, "lit")
  mkdirSync(litExamples, {recursive: true})
  writeFileSync(join(examples, "04-state.js"), "export const state = 'vanilla'")
  writeFileSync(join(examples, "preview.html"), "<h1>Vanilla preview</h1>")
  writeFileSync(join(examples, "package.json"), `{"name":"vanilla-example"}`)
  writeFileSync(join(litExamples, "04-state.js"), "export const state = 'lit'")
  writeFileSync(join(litExamples, "preview.html"), "<h1>Lit preview</h1>")
  writeFileSync(join(litExamples, "package.json"), `{"name":"lit-example"}`)
  for(const library of ["react", "vue", "angular", "svelte"]) {
    const frameworkExamples = join(examples, library)
    mkdirSync(frameworkExamples, {recursive: true})
    writeFileSync(join(frameworkExamples, `04-state.${({react: "jsx", vue: "vue", angular: "ts", svelte: "svelte"})[library]}`), `export const state = '${library}'`)
    writeFileSync(join(frameworkExamples, "package.json"), JSON.stringify({name: `${library}-example`}))
  }

  let middleware
  const transformIndexHtml = vi.fn(async (_url, html) => html)
  const viteServer = {
    config: {root: directory},
    middlewares: {use: handler => {middleware = handler}},
    transformIndexHtml,
    ws: {send: vi.fn()},
  }
  const plugin = documentationPlugin()
  activePlugin = plugin
  plugin.configureServer(viteServer)
  server = createServer((request, response) => {
    middleware(request, response, error => {
      if(error) {
        response.writeHead(500).end(String(error))
        return
      }
      response.writeHead(404, {"Content-Type": "text/plain"}).end("Vite fallback")
    })
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const {port} = server.address()
  return {base: `http://127.0.0.1:${port}`, transformIndexHtml, plugin, viteServer}
}

async function get(base, path, method = "GET") {
  const response = await fetch(new URL(path, base), {method, redirect: "manual"})
  return {status: response.status, headers: response.headers, body: await response.text()}
}

it("embeds the selected library's complete script in a highlighted disclosure", async () => {
  const {base} = await fixture()
  for(const library of ["vanilla", "lit", "react", "vue", "angular", "svelte"]) {
    const response = await get(base, `/docs/widgets/basics/first.md?library=${library}`)
    expect(response.status).toBe(200)
    const disclosure = response.body.match(/<details id="complete-script">([\s\S]*?)<\/details>/)?.[1]
    expect(disclosure).toContain('<summary>Complete script</summary>')
    expect(disclosure).toContain('class="shiki')
    expect(disclosure).toContain(`'${library}'`)
    expect(disclosure).not.toContain('<!-- script:')
  }
})

async function getRaw(base, path) {
  const {port} = new URL(base)
  return new Promise((resolve, reject) => {
    const request = httpRequest({hostname: "127.0.0.1", port, path, method: "GET"}, response => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", chunk => {body += chunk})
      response.on("end", () => resolve({status: response.statusCode, body}))
    })
    request.on("error", reject)
    request.end()
  })
}

it("redirects the documentation root to the widget landing page and preserves the query", async () => {
  const {base} = await fixture()
  const response = await get(base, "/docs/?from=readme")
  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("/docs/widgets/?from=readme")
})

it("renders linked sections, adjacent page navigation, frontmatter, headings, and authored iframes", async () => {
  const {base, transformIndexHtml} = await fixture()
  const response = await get(base, "/docs/widgets/basics/first.md")
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/html")
  expect(response.body).toContain('href="/docs/widgets/basics/index.md?library=lit"')
  expect(response.body).toContain('href="/docs/widgets/advanced/index.md?library=lit"')
  const pageNavigation = response.body.match(/<nav class="page-navigation" aria-label="Page navigation">([\s\S]*?)<\/nav>/)?.[1]
  expect(pageNavigation).toBeDefined()
  expect(pageNavigation).toContain('<a class="previous" href="/docs/widgets/basics/index.md?library=lit">')
  expect(pageNavigation).toContain('<a class="next" href="/docs/widgets/basics/second.md?library=lit">')
  expect(response.body).toContain('<h2 id="a-heading">A heading!</h2>')
  expect(response.body).not.toContain("draft: true")
  expect(response.body).toContain('<iframe src="/docs/widgets/basics/lit-example.html?library=lit" title="Lit example" loading="lazy"></iframe>')
  expect(response.body).toContain('<a href="/docs/widgets/basics/example.js?library=lit">Example source</a>')
  expect(response.body).toContain("Lit-only instructions.")
  expect(response.body).not.toContain("Vanilla-only instructions.")
  const header = response.body.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0]
  expect(header).toContain('aria-label="Main navigation"')
  expect(header).toContain('href="/docs/" aria-current="page">Documentation</a>')
  expect(header).toContain('class="button small" href="/editor/"')
  expect(header).not.toContain('library-switch')
  const sidebar = response.body.match(/<aside>[\s\S]*?<\/aside>/)?.[0] ?? ""
  expect(sidebar).toContain('class="library-switch"')
  expect(sidebar.indexOf('class="library-switch"')).toBeLessThan(sidebar.indexOf('aria-label="Documentation"'))
  expect(response.body).not.toContain('class="docs-toolbar"')
  expect(response.body.match(/<select\b/g)).toHaveLength(1)
  expect(response.body).toContain('<body class="site-layout">')
  expect(response.body).toContain('<div class="docs-layout site-content">')
  expect(response.body).toContain('<div class="page" tabindex="0" role="region" aria-label="Documentation content">')
  expect(response.body).toContain('href="/src/site-header.css"')
  expect(response.body).toContain(renderSiteFooter())
  expect(transformIndexHtml).toHaveBeenCalledOnce()
})

it("selects the requested library, renders only its conditional content, and rewrites local Lit links", async () => {
  const {base} = await fixture()
  const response = await get(base, "/docs/widgets/basics/first.md?library=lit")
  expect(response.status).toBe(200)
  expect(response.body).toContain("Lit-only instructions.")
  expect(response.body).not.toContain("Vanilla-only instructions.")
  expect(response.body).toContain('<iframe src="/docs/widgets/basics/lit-example.html?library=lit" title="Lit example" loading="lazy"></iframe>')
  expect(response.body).not.toContain('<iframe src="./example.html"')
  const select = response.body.match(/<select\b[^>]*>[\s\S]*?<\/select>/)?.[0]
  expect(select).toContain('name="library"')
  expect(select).toContain('aria-label="Rendering library"')
  expect(response.body).toContain("Rendering library")
  expect(select).toContain('<option value="vanilla">')
  expect(select).toContain('<option value="lit" selected')
  expect(select).toContain('<selectedcontent></selectedcontent>')
  expect(select).toContain('src="/dev-server/icons/javascript.svg" alt="" width="20" height="20"')
  expect(select).toContain('src="/dev-server/icons/lit.svg" alt="" width="20" height="20"')
  expect(response.body).toContain('<img src="/assets/app-icon.svg"')

  expect(response.body).toContain('href="/docs/widgets/basics/second.md?step=2&library=lit#setup"')
  expect(response.body).toContain('href="/docs/widgets/examples/lit/04-state.js?download=1&library=lit#state"')
  expect(response.body).toContain('href="/docs/widgets/examples/preview.html?step=3&library=lit#demo"')
  expect(response.body).toContain('href="/docs/widgets/examples/lit/package.json?library=lit"')
  expect(response.body).toContain('href="https://example.com/guide?q=1#part"')
})

it("places standalone pages before sections in menus and adjacent navigation", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  mkdirSync(join(docs, "introduction"))
  writeFileSync(join(docs, "introduction/widgets.md"), "# What is a widget?\n")
  writeFileSync(join(docs, "introduction/quick-start.md"), "# Quick start\n")
  writeFileSync(join(docs, "index.md"), "# Widgets\n\n- [What is a widget?](introduction/widgets.md)\n- [Quick start](introduction/quick-start.md)\n- [Basics](basics/index.md)\n")

  const paths = ["/docs/widgets/index.md", "/docs/widgets/introduction/widgets.md",
    "/docs/widgets/introduction/quick-start.md", "/docs/widgets/basics/index.md"]
  for(const [index, path] of paths.entries()) {
    const response = await get(base, path + "?library=lit")
    expect(response.status).toBe(200)
    for(const label of ["Documentation", "Mobile documentation"]) {
      const menu = response.body.match(new RegExp(`<nav aria-label="${label}">([\\s\\S]*?)<\\/nav>`))?.[1]
      expect(menu).toMatch(/>Overview<\/a><\/li><li><a[^>]*>What is a widget\?<\/a><\/li><li><a[^>]*>Quick start<\/a><\/li><li class="nav-section">/)
    }
    const adjacent = response.body.match(/<nav class="page-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
    if(index > 0) expect(adjacent).toContain(`<a class="previous" href="${paths[index - 1]}?library=lit">`)
    if(index < paths.length - 1) expect(adjacent).toContain(`<a class="next" href="${paths[index + 1]}?library=lit">`)
    if(index === 1 || index === 2) {
      const breadcrumb = response.body.match(/<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
      expect(breadcrumb).toBeUndefined()
    }
  }
})

it("defaults missing and unsupported library choices to Lit", async () => {
  const {base} = await fixture()
  for(const query of ["", "?library=unknown"]) {
    const response = await get(base, `/docs/widgets/basics/first.md${query}`)
    expect(response.status).toBe(200)
    expect(response.body).toContain("Lit-only instructions.")
    expect(response.body).not.toContain("Vanilla-only instructions.")
    const select = response.body.match(/<select\b[^>]*>[\s\S]*?<\/select>/)?.[0]
    expect(select).toContain('<option value="lit" selected')
    expect(select).toContain('<option value="vanilla">')
    expect(response.body).toContain('href="/docs/widgets/basics/second.md?step=2&library=lit#setup"')
    expect(response.body).toContain('href="/docs/widgets/examples/lit/04-state.js?download=1&library=lit#state"')
    expect(response.body).toContain('src="/docs/widgets/basics/lit-example.html?library=lit"')
    expect(response.body).toContain('href="/docs/widgets/examples/lit/package.json?library=lit"')
  }
})

it("retains an explicit JS choice across links, downloads, and inline previews", async () => {
  const {base} = await fixture()
  const response = await get(base, "/docs/widgets/basics/first.md?library=vanilla")
  expect(response.status).toBe(200)
  expect(response.body).toContain("Vanilla-only instructions.")
  expect(response.body).not.toContain("Lit-only instructions.")
  expect(response.body).toContain('<option value="vanilla" selected')
  expect(response.body).toContain('href="/docs/widgets/basics/second.md?step=2&library=vanilla#setup"')
  expect(response.body).toContain('href="/docs/widgets/examples/04-state.js?download=1&library=vanilla#state"')
  expect(response.body).toContain('href="/docs/widgets/examples/preview.html?step=3&library=vanilla#demo"')
  expect(response.body).toContain('src="/docs/widgets/basics/example.html?library=vanilla"')
  expect(response.body).toContain('href="/docs/widgets/examples/package.json?library=vanilla"')
})

it("offers all six libraries and retains framework choices across documentation links and embeds", async () => {
  const {base} = await fixture()
  const libraries = [["vanilla", "JS", "javascript"], ["lit", "Lit", "lit"],
    ["react", "React", "react"], ["vue", "Vue", "vue"],
    ["angular", "Angular", "angular"], ["svelte", "Svelte", "svelte"]]
  for(const [library, label, icon] of libraries) {
    const response = await get(base, `/docs/widgets/basics/first.md?library=${library}`)
    expect(response.status).toBe(200)
    const select = response.body.match(/<select\b[^>]*>[\s\S]*?<\/select>/)?.[0]
    expect(select?.match(/<option\b/g)).toHaveLength(6)
    expect(select).toContain(`<option value="${library}" selected><img src="/dev-server/icons/${icon}.svg" alt="" width="20" height="20">${label}</option>`)
    if(["vanilla", "lit"].includes(library)) continue
    expect(response.body).toContain("The examples on this page currently use JS.")
    expect(response.body).toContain("Vanilla-only instructions.")
    expect(response.body).not.toContain("Lit-only instructions.")
    expect(response.body).toContain(`href="/docs/widgets/basics/second.md?step=2&library=${library}#setup"`)
    expect(response.body).toContain(`src="/docs/widgets/basics/example.html?library=${library}"`)
    expect(response.body).toContain(`href="/docs/widgets/examples/${library}/04-state.${({react: "jsx", vue: "vue", angular: "ts", svelte: "svelte"})[library]}?download=1&library=${library}#state"`)
    expect(response.body).toContain(`href="/docs/widgets/examples/preview.html?step=3&library=${library}#demo"`)
    expect(response.body).toContain('href="https://example.com/guide?q=1#part"')
    expect(response.body).not.toContain("<!-- library:")
  }
})

it("renders framework-specific Markdown when it is available and keeps shared pages free of fallback notes", async () => {
  const {base} = await fixture()
  writeFileSync(join(directory, "docs/widgets/basics/second.md"), [
    "# Framework examples", "<!-- library:vanilla -->", "JS instructions.", "<!-- /library -->",
    ...["react", "vue", "angular", "svelte"].flatMap(library => [
      `<!-- library:${library} -->`, `${library} instructions.`, "<!-- /library -->",
    ]),
  ].join("\n"))
  for(const library of ["react", "vue", "angular", "svelte"]) {
    const response = await get(base, `/docs/widgets/basics/second.md?library=${library}`)
    expect(response.body).toContain(`${library} instructions.`)
    expect(response.body).not.toContain("JS instructions.")
    expect(response.body).not.toContain("The examples on this page currently use JS.")
    expect(response.body).not.toContain("<!-- library:")
    const shared = await get(base, `/docs/widgets/advanced/third.md?library=${library}`)
    expect(shared.body).not.toContain("The examples on this page currently use JS.")
  }
})

it("includes only the selected framework explanation and resolves its source links", async () => {
  const {base} = await fixture()
  writeFileSync(join(directory, "docs/widgets/examples/react/setup.md"), '# React setup\n\n[Source](./04-state.jsx)\n')
  writeFileSync(join(directory, "docs/widgets/examples/vue/setup.md"), '# Vue setup\n')
  writeFileSync(join(directory, "docs/widgets/basics/second.md"), [
    '# Setup', '<!-- library:react -->', '<!-- include:../examples/react/setup.md -->', '<!-- /library -->',
    '<!-- library:vue -->', '<!-- include:../examples/vue/setup.md -->', '<!-- /library -->',
  ].join('\n'))
  const response = await get(base, '/docs/widgets/basics/second.md?library=react')
  expect(response.status).toBe(200)
  expect(response.body).toContain('React setup')
  expect(response.body).not.toContain('Vue setup')
  expect(response.body).not.toContain('<!-- include:')
  expect(response.body).toContain('href="/docs/widgets/examples/react/04-state.jsx?download=1&library=react"')
})

it("downloads original example sources instead of transformed browser modules", async () => {
  const {base} = await fixture()
  const source = 'import {createRoot} from "react-dom/client"\nexport const answer = "false"\n'
  writeFileSync(join(directory, 'docs/widgets/examples/react/04-state.jsx'), source)
  const response = await get(base, '/docs/widgets/examples/react/04-state.jsx?download=1&library=react')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/plain')
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="04-state.jsx"')
  expect(response.body).toBe(source)
  const head = await get(base, '/docs/widgets/examples/react/04-state.jsx?download=1', 'HEAD')
  expect(head.status).toBe(200)
  expect(head.body).toBe('')
})

it("compiles only documentation Svelte components and leaves raw source requests alone", async () => {
  const {plugin} = await fixture()
  const file = join(directory, 'docs/widgets/examples/svelte/hello.svelte')
  writeFileSync(file, '<svelte:options customElement={{tag: "ww-hello"}} />\n<p>Hello!</p>')
  const compiled = await plugin.load(file + '?library=svelte')
  expect(compiled.code).toContain("customElements.define('ww-hello'")
  expect(compiled.code).toContain('svelte/internal/client')
  expect(await plugin.load(file + '?raw')).toBeUndefined()
  expect(await plugin.load(join(directory, 'src/component.svelte'))).toBeUndefined()
})

it("compiles Vue single-file components with native slots and shadow styles", async () => {
  const {plugin} = await fixture()
  const file = join(directory, 'docs/widgets/examples/vue/hello.vue')
  writeFileSync(file, '<script setup>import {ref} from "vue"; const greeting = ref("Hello")</script>\n<template><p>{{greeting}} <slot>world</slot></p></template>\n<style>:host {display:block}</style>')
  const compiled = await plugin.load(file)
  expect(compiled.code).toContain('vue/dist/vue.runtime.esm-browser.js')
  expect(compiled.code).toContain('styles')
  expect(compiled.code).toContain(':host {display:block}')
  expect(compiled.code).toContain('renderSlot') // Vue's custom-element runtime emits a native slot.
  expect(await plugin.load(file + '?raw')).toBeUndefined()
  expect(await plugin.load(join(directory, 'src/component.vue'))).toBeUndefined()
})

it("compiles tutorial TypeScript with legacy Angular decorators", async () => {
  const {plugin} = await fixture()
  const file = join(directory, 'docs/widgets/examples/angular/hello.ts')
  writeFileSync(file, 'import {Component, Input} from "@angular/core"\n@Component({selector:"ww-test", template:"Hello"})\nclass Hello { @Input() answer: string = "false" }')
  const compiled = await plugin.load(file)
  expect(compiled.code).toContain('__decorateClass')
  expect(compiled.code).toContain('Input()')
  expect(compiled.code).not.toContain('answer: string')
  expect(await plugin.load(file + '?raw')).toBeUndefined()
  expect(await plugin.load(join(directory, 'src/component.ts'))).toBeUndefined()
})

it("highlights known fenced code and safely escapes unknown languages", async () => {
  const {base} = await fixture()
  const response = await get(base, "/docs/widgets/basics/first.md")
  expect(response.status).toBe(200)
  expect(response.body).toMatch(/<pre class="shiki[^\"]*"[\s\S]*?<span[^>]*style="color:/)
  expect(response.body).toContain('style="color:#D73A49">const</span>')
  expect(response.body).toContain('style="color:#005CC5"> message</span>')
  expect(response.body).toContain('&#x3C;script>alert("unsafe")&#x3C;/script>')
  expect(response.body).not.toContain('<script>alert("unsafe")</script>')
})

it("renders the root README with heading anchors and strips frontmatter", async () => {
  const {base} = await fixture()
  const response = await get(base, "/README.md")
  expect(response.status).toBe(200)
  expect(response.body).toContain("<title>Project README · WebWriter documentation</title>")
  expect(response.body).toContain('<h2 id="getting-started">Getting started</h2>')
  expect(response.body).not.toContain("private: true")
})

it("returns a rendered 404 for a missing documentation page", async () => {
  const {base} = await fixture()
  const response = await get(base, "/docs/widgets/basics/missing.md")
  expect(response.status).toBe(404)
  expect(response.body).toContain("Page not found")
  const navigation = response.body.match(/<nav aria-label="Documentation">([\s\S]*?)<\/nav>/)?.[1]
  expect(navigation).toBeDefined()
  expect(navigation).not.toContain('aria-current="page"')
  expect(response.body).not.toContain('class="page-navigation"')
})

it("lets relative HTML and JavaScript example requests fall through to Vite", async () => {
  const {base} = await fixture()
  for(const path of ["/docs/widgets/basics/example.html", "/docs/widgets/basics/example.js"]) {
    const response = await get(base, path)
    expect(response.status).toBe(404)
    expect(response.body).toBe("Vite fallback")
  }
})

it("serves section directories and redirects the slashless route", async () => {
  const {base} = await fixture()
  const redirect = await get(base, "/docs/widgets/basics")
  expect(redirect.status).toBe(302)
  expect(redirect.headers.get("location")).toBe("/docs/widgets/basics/")
  const page = await get(base, "/docs/widgets/basics/")
  expect(page.status).toBe(200)
  expect(page.body).toContain("<title>Basics · WebWriter documentation</title>")
  expect(page.body).toContain('href="/docs/widgets/basics/first.md?library=lit"')
})

it("returns headers for HEAD requests without a response body", async () => {
  const {base} = await fixture()
  const response = await get(base, "/docs/widgets/basics/first.md", "HEAD")
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/html")
  expect(response.body).toBe("")
})

it("lets raw, import, and url queries fall through to Vite", async () => {
  const {base} = await fixture()
  for(const query of ["?raw", "?import", "?url"]) {
    const response = await get(base, `/docs/widgets/basics/first.md${query}`)
    expect(response.status).toBe(404)
    expect(response.body).toBe("Vite fallback")
  }
})

it("reloads for documentation Markdown changes and ignores unrelated files", async () => {
  const {plugin, viteServer} = await fixture()
  const docsResult = plugin.handleHotUpdate({file: join(directory, "docs/widgets/basics/first.md"), server: viteServer})
  expect(docsResult).toEqual([])
  expect(viteServer.ws.send).toHaveBeenCalledWith({type: "full-reload"})
  viteServer.ws.send.mockClear()
  expect(plugin.handleHotUpdate({file: join(directory, "src/example.md"), server: viteServer})).toBeUndefined()
  expect(viteServer.ws.send).not.toHaveBeenCalled()
})

it("keeps encoded traversal requests inside the documentation tree", async () => {
  const {base} = await fixture()
  const response = await getRaw(base, "/docs/widgets/%2e%2e/%2e%2e/README.md")
  expect(response.status).toBe(404)
  expect(response.body).not.toContain("Project README")
})

it("reads changed Markdown and navigation on later requests", async () => {
  const {base} = await fixture()
  const first = await get(base, "/docs/widgets/basics/first.md")
  expect(first.body).toContain("First page")
  writeFileSync(join(directory, "docs/widgets/basics/first.md"), "# Renamed page\n")
  writeFileSync(join(directory, "docs/widgets/basics/index.md"), "# Basics\n\n- [Renamed page](./first.md)\n")
  const second = await get(base, "/docs/widgets/basics/first.md")
  expect(second.body).toContain("<title>Renamed page · WebWriter documentation</title>")
  expect(second.body).toContain('href="/docs/widgets/basics/first.md?library=lit" aria-current="page">Renamed page</a>')
  expect(second.body).toContain("Renamed page")
  expect(second.body).not.toContain("First page")
})

it("emits static documentation variants, navigation, assets, and original example downloads", async () => {
  const {plugin} = await fixture()
  const assets = join(directory, "dev-server")
  mkdirSync(join(assets, "icons"), {recursive: true})
  writeFileSync(join(assets, "documentation.css"), 'body {color: black}')
  writeFileSync(join(assets, "documentation.js"), '// documentation navigation')
  for(const icon of ["javascript", "lit", "react", "vue", "angular", "svelte"]) {
    writeFileSync(join(assets, `icons/${icon}.svg`), `<svg id="${icon}"></svg>`)
  }
  mkdirSync(join(directory, "docs/images"))
  writeFileSync(join(directory, "docs/images/diagram.svg"), '<svg id="diagram"></svg>')
  plugin.configResolved({root: directory})
  const emitted = new Map()
  await plugin.generateBundle.call({emitFile: asset => emitted.set(asset.fileName, asset.source)})

  for(const library of ["lit", "vanilla", "react", "vue", "angular", "svelte"]) {
    const suffix = library === "lit" ? "" : `.${library}`
    const page = emitted.get(`docs/widgets/basics/first${suffix}.html`)
    expect(page).toContain('<title>First page · WebWriter documentation</title>')
    expect(page).toContain(`href="/docs/widgets/basics/second${suffix}.html?step=2&library=${library}#setup"`)
    expect(page).toContain(`data-href="/docs/widgets/basics/first.react.html?library=react"`)
    const breadcrumb = page.match(/<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
    expect(breadcrumb).toBe(`<a href="/docs/widgets/basics/index${suffix}.html?library=${library}">Basics</a>`)
    expect(page).toContain('href="/gallery/">Widgets</a>')
    expect(page).toContain('href="/editor/">Open WebWriter')
    expect(page).toContain('href="/assets/docs/documentation.css"')
    expect(page).toContain('href="/assets/site-header.css"')
    expect(page).toContain('src="/assets/docs/documentation.js"')
    expect(page).toContain(renderSiteFooter())
    expect(page).not.toContain('/dev-server/')
    expect(page).not.toContain('<!-- script:')
    expect(page).toContain('<a download href="/docs/widgets/examples/')
    expect(emitted.get(`docs/index${suffix}.html`)).toBe(emitted.get(`docs/widgets/index${suffix}.html`))
    expect(emitted.get(`README${suffix}.html`)).toContain('Project README')
  }
  expect(emitted.get("docs/widgets/examples/react/04-state.jsx").toString()).toBe("export const state = 'react'")
  expect(emitted.get("docs/images/diagram.svg").toString()).toContain('id="diagram"')
  expect(emitted.get("assets/docs/documentation.css").toString()).toContain('color: black')
  expect(emitted.get("assets/docs/icons/react.svg").toString()).toContain('id="react"')
})
