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
    '**State module**', "", '<!-- script:../examples/04-state.js -->', "", '</details>', "",
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

function adapterReferenceFixture() {
  const docs = join(directory, "docs/widgets")
  const reference = join(docs, "reference")
  mkdirSync(reference)
  writeFileSync(join(docs, "index.md"), "# Widgets\n\n- [Reference](reference/index.md)\n")
  writeFileSync(join(reference, "index.md"), "# Reference\n\n## C. Tooling\n\n- [C1. Build](build-test.md)\n- [C2. Widget adapters](adapters.md)\n")
  writeFileSync(join(reference, "build-test.md"), "# C1. Build\n")
  writeFileSync(join(reference, "adapters.md"), [
    "<!-- library:vanilla -->", "# C2. @webwriter/widget", "<!-- /library -->", "",
    "<!-- library:react -->", "# C2. @webwriter/react", "", "React tooling.", "<!-- /library -->", "",
    "<!-- library:angular -->", "# C2. @webwriter/angular", "<!-- /library -->", "",
  ].join("\n"))
  writeFileSync(join(reference, "lit.md"), "# C2. @webwriter/lit\n\n## Standalone widget drawer\n")
}

it("shows one C2 reference for the selected library and keeps Lit deep links", async () => {
  const {base} = await fixture()
  adapterReferenceFixture()
  const reference = "/docs/widgets/reference/"
  const react = await get(base, `${reference}adapters.md?library=react`)
  expect(react.status).toBe(200)
  expect(react.body).toContain('class="docs-heading">C2. @webwriter/react</h1>')
  expect(react.body).toContain('<p>React tooling.</p>')
  expect(react.body).not.toContain('class="library-note"')
  const meta = react.body.match(/<div class="adapter-page-meta">(.*?)<\/div>/)?.[1]
  expect(meta).toContain('<nav class="breadcrumb"')
  expect(meta).toContain('<nav class="adapter-navigation" aria-label="Widget tooling by library">')
  expect(meta).toContain(`href="${reference}adapters.md?library=angular"><img src="/dev-server/icons/angular.svg" alt="" width="16" height="16">Angular</a>`)
  expect(meta).toContain('library=react" aria-current="page"><img')
  expect([...meta.matchAll(/adapters\.md\?library=(\w+)/g)].map(match => match[1])).toEqual([
    "vanilla", "lit", "react", "vue", "angular", "svelte",
  ])
  const index = await get(base, `${reference}index.md?library=angular`)
  expect(index.body).toContain(`<a href="${reference}adapters.md?library=angular">C2. @webwriter/angular</a>`)
  const vanilla = await get(base, `${reference}adapters.md?library=vanilla`)
  expect(vanilla.body).toContain('class="docs-heading">C2. @webwriter/widget</h1>')
  const lit = await get(base, `${reference}adapters.md?library=lit`)
  expect(lit.body).toContain('id="standalone-widget-drawer"')
  const legacy = await get(base, `${reference}lit.md?library=react`)
  expect(legacy.body).toContain('id="standalone-widget-drawer"')
  expect(legacy.body).toContain(`href="${reference}adapters.md?library=lit" aria-current="page">C2. @webwriter/lit</a>`)
})

it("embeds the selected library's complete script in a highlighted disclosure", async () => {
  const {base} = await fixture()
  for(const library of ["vanilla", "lit", "react", "vue", "angular", "svelte"]) {
    const response = await get(base, `/docs/widgets/basics/first.md?library=${library}`)
    expect(response.status).toBe(200)
    const disclosure = response.body.match(/<details id="complete-script">([\s\S]*?)<\/details>/)?.[1]
    expect(disclosure).toContain('<summary>Complete script</summary>')
    expect(disclosure).toMatch(/<figure class="code-snippet"><figcaption class="code-snippet-label">State module<\/figcaption>\s*<pre class="shiki[\s\S]*?<\/pre>\s*<\/figure>/)
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
  expect(response.body).toContain('<h1 id="first-page" class="docs-heading">First page</h1>')
  expect(response.body).toContain('<h2 id="a-heading" class="docs-heading" aria-label="A heading!">')
  expect(response.body).toContain('<a class="docs-heading-link" href="#a-heading" aria-label="Copy link to A heading!">#</a>A heading!</h2>')
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
  expect(sidebar.indexOf('class="library-switch"')).toBeLessThan(sidebar.indexOf('>Overview</a>'))
  expect(sidebar.indexOf('>Overview</a>')).toBeLessThan(sidebar.indexOf('class="documentation-sections"'))
  expect(response.body).not.toContain('class="docs-toolbar"')
  expect(response.body.match(/<select\b/g)).toHaveLength(1)
  expect(response.body).toContain('<body class="site-layout">')
  expect(response.body).toContain('<div class="docs-layout site-content" tabindex="0" role="region" aria-label="Documentation content">')
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
  expect(select).toContain('aria-labelledby="library-label"')
  expect(response.body).toContain('<label id="library-label" for="library">Library</label>')
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

it("links the library picker label and orders Library, Overview, and Quick start before the other pages", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  mkdirSync(join(docs, "introduction"))
  writeFileSync(join(docs, "introduction/widgets.md"), "# What is a widget?\n")
  writeFileSync(join(docs, "introduction/library.md"), "# Library\n\nWidgets are Web Components.\n")
  writeFileSync(join(docs, "introduction/quick-start.md"), "# Quick start\n")
  for(const name of ["tutorial", "guides", "reference"]) {
    const index = join(docs, name, "index.md")
    mkdirSync(join(docs, name), {recursive: true})
    writeFileSync(index, `# ${name}\n`)
  }
  writeFileSync(join(docs, "index.md"), "# Widgets\n\n- [What is a widget?](introduction/widgets.md)\n- [Library](introduction/library.md)\n- [Quick start](introduction/quick-start.md)\n- [Basics](basics/index.md)\n")

  const libraryPage = "/docs/widgets/introduction/library.md"
  const introPages = [libraryPage, "/docs/widgets/index.md", "/docs/widgets/introduction/quick-start.md"]
  const paths = [...introPages, "/docs/widgets/introduction/widgets.md", "/docs/widgets/basics/index.md"]
  const query = "?library=vue"
  for(const [index, path] of paths.entries()) {
    const response = await get(base, path + query)
    expect(response.status).toBe(200)
    const notice = '<div class="docs-intro-note" role="note">This documentation is for developers. It is available only in English.</div>'
    if(introPages.includes(path)) {
      expect(response.body).toContain(`<main id="content" tabindex="-1">${notice}<article><h1`)
    }
    else expect(response.body).not.toContain(notice)
    for(const label of ["Documentation", "Mobile documentation"]) {
      const menu = response.body.match(new RegExp(`<nav aria-label="${label}">([\\s\\S]*?)<\\/nav>`))?.[1]
      expect(menu).toMatch(/>What is a widget\?<\/a><div class="nav-section">/)
      if(label === "Documentation") {
        const current = path === libraryPage ? ' aria-current="page"' : ""
        expect(menu).toContain(`<a href="${libraryPage + query}" id="library-label"${current}>Library</a>`)
        expect(menu).toContain('<select id="library" name="library" aria-labelledby="library-label">')
        expect(menu).toMatch(/<form class="library-switch"[\s\S]*?<\/form>\s*<ul class="nav-intro-row"><li><a[^>]*>Overview<\/a><\/li><li><a[^>]*>Quick start<\/a><\/li><\/ul>/)
        expect(menu).toMatch(/<div class="documentation-sections"[^>]*><a[^>]*>What is a widget\?<\/a>/)
      }
      else expect(menu).not.toMatch(/nav-intro-row|library-switch/)
      expect(menu.match(/>Library<\/a>/g) ?? []).toHaveLength(label === "Documentation" ? 1 : 0)
    }
    const adjacent = response.body.match(/<nav class="page-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
    if(index > 0) expect(adjacent).toContain(`<a class="previous" href="${paths[index - 1] + query}">`)
    else expect(adjacent).not.toContain('class="previous"')
    if(index < paths.length - 1) expect(adjacent).toContain(`<a class="next" href="${paths[index + 1] + query}">`)
    if(path.startsWith("/docs/widgets/introduction/")) {
      const breadcrumb = response.body.match(/<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
      expect(breadcrumb).toBeUndefined()
    }
  }

  const notice = '<div class="docs-intro-note" role="note">This documentation is for developers. It is available only in English.</div>'
  for(const path of ["/docs/widgets/tutorial/index.md", "/docs/widgets/guides/index.md", "/docs/widgets/reference/index.md"]) {
    const response = await get(base, path + query)
    expect(response.status).toBe(200)
    expect(response.body).toContain(`<main id="content" tabindex="-1">${notice}<article><h1`)
  }

})

it("shows each Library card with its own source regardless of the selected library", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  const introduction = join(docs, "introduction")
  mkdirSync(introduction)
  writeFileSync(join(docs, "examples/vue/registration.js"), "export const registration = 'vue-entry'")
  const variants = ["vanilla", "lit", "react", "vue", "angular", "svelte"]
  const cards = variants.map(library => [
    `<!-- library-card:${library} -->`, "", `${library} description.`, "",
    "**Sample file**", "", `<!-- script:../examples/04-state.js?library=${library} -->`, "",
    ...(library === "vue" ? ["<!-- script:../examples/vue/registration.js -->", ""] : []),
    "<!-- /library-card -->",
  ].join("\n"))
  writeFileSync(join(introduction, "library.md"), "# Library\n\n" + cards.join("\n\n"))

  const {status, body} = await get(base, "/docs/widgets/introduction/library.md?library=angular")
  expect(status).toBe(200)
  const sections = [...body.matchAll(/<section class="library-note" data-library="([^"]+)" aria-labelledby="([^"]+)">([\s\S]*?)<\/section>/g)]
  expect(sections.map(([, library]) => library)).toEqual(variants)
  for(const [, library, id, content] of sections) {
    expect(content).toContain(`class="library-note-label" id="${id}"`)
    expect(content).toContain(`<p>${library} description.</p>`)
    expect(content).not.toContain("<details>")
    expect(content).toContain('<figcaption class="code-snippet-label">Sample file</figcaption>')
    expect(content).toContain(`'${library}'`)
  }
  expect(sections.find(([, library]) => library === "vue")?.[3]).toContain("'vue-entry'")
  expect(body).not.toContain("<!-- library-card:")
})

it("nests reference pages under named sections and follows their order for adjacent links", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  const reference = join(docs, "reference")
  mkdirSync(reference)
  writeFileSync(join(docs, "index.md"), "# Widgets\n\n- [Reference](reference/index.md)\n- [Sandbox](sandbox.md)\n")
  writeFileSync(join(docs, "sandbox.md"), "# Sandbox\n")
  const groups = [
    ["A. Package interface", "distribution", "Distribution"],
    ["B. Class interface", "runtime", "Runtime interface"],
    ["C. Element interface", "data", "Data and events"],
    ["D. Tooling", "build-test", "Build and test"],
  ]
  writeFileSync(join(reference, "index.md"), "# Reference\n\n" + groups.map(([name, path, title]) =>
    `## ${name}\n\n- [${title}](${path}.md)\n`).join("\n"))
  for(const [, path, title] of groups) writeFileSync(join(reference, `${path}.md`), `# ${title}\n`)

  const {body} = await get(base, "/docs/widgets/reference/runtime.md?library=vue")
  const menus = [...body.matchAll(/<nav aria-label="(?:Documentation|Mobile documentation)">([\s\S]*?)<\/nav>/g)]
  expect(menus).toHaveLength(2)
  for(const [, menu] of menus) {
    const disclosure = menu.match(/<details class="nav-reference" open><summary>Reference<\/summary>([\s\S]*?)<\/details>/)?.[1]
    expect(disclosure).toContain('href="/docs/widgets/reference/index.md?library=vue">Reference overview</a>')
    expect(disclosure).toContain('href="/docs/widgets/reference/runtime.md?library=vue" aria-current="page"')
    expect([...disclosure.matchAll(/<p>([^<]+)<\/p><ul aria-label="([^"]+)"><li><a href="([^"]+)"/g)]
      .map(([, title, label, href]) => [title, label, href])).toEqual(groups.map(([title, path]) =>
      [title, title, `/docs/widgets/reference/${path}.md?library=vue`]))
  }
  expect(body).toContain('class="previous" href="/docs/widgets/reference/distribution.md?library=vue"')
  expect(body).toContain('class="next" href="/docs/widgets/reference/data.md?library=vue"')
  const overview = await get(base, "/docs/widgets/reference/index.md?library=vue")
  expect(overview.body.match(/<details class="nav-reference" open>/g)).toHaveLength(2)
  const sandbox = await get(base, "/docs/widgets/sandbox.md?library=vue")
  expect(sandbox.status).toBe(200)
  expect(sandbox.body.match(/<details class="nav-reference">/g)).toHaveLength(2)
  expect(sandbox.body).toMatch(/<summary>Reference<\/summary>[\s\S]*?<\/details><a [^>]*class="nav-shortcut" aria-current="page">Sandbox<\/a>/)
  expect(sandbox.body).toContain('class="previous" href="/docs/widgets/reference/build-test.md?library=vue"')
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

it("labels optional framework prose and keeps shared text and examples outside the note", async () => {
  const {base} = await fixture()
  writeFileSync(join(directory, "docs/widgets/basics/second.md"), `# Setup

Shared instructions.

<!-- library:vue optional -->
Save the [source](./first.md) as \`component.vue\`.

**\`registration.js\`**

\`\`\`js
export const registration = true
\`\`\`
<!-- /library -->

Continue with the shared steps.
`)

  const vue = await get(base, "/docs/widgets/basics/second.md?library=vue")
  const note = vue.body.match(/<div class="library-note"[\s\S]*?<\/div>/)?.[0]
  expect(note).toContain('data-library="vue" role="note"')
  expect(note).toContain('<img src="/dev-server/icons/vue.svg" alt="" width="16" height="16">Vue')
  expect(note).toContain('<a href="/docs/widgets/basics/first.md?library=vue">source</a> as <code>component.vue</code>')
  expect(note).not.toMatch(/Shared instructions|shared steps|<pre|registration\.js/)
  expect(vue.body).toMatch(/<\/div>\s*<figure class="code-snippet"><figcaption class="code-snippet-label"><code>registration\.js<\/code><\/figcaption>\s*<pre/)
  expect(vue.body).not.toContain("currently use JS")

  const lit = await get(base, "/docs/widgets/basics/second.md?library=lit")
  expect(lit.body).toContain("Shared instructions.")
  expect(lit.body).toContain("Continue with the shared steps.")
  expect(lit.body).not.toMatch(/library-note|currently use JS|registration\.js|component\.vue/)
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
  expect(response.body).toContain('<h2 id="getting-started" class="docs-heading" aria-label="Getting started">')
  expect(response.body).toContain('href="#getting-started" aria-label="Copy link to Getting started">#</a>Getting started</h2>')
  expect(response.body).not.toContain("private: true")
})

it("gives repeated headings distinct fragments and keeps formatted heading labels readable", async () => {
  const {base} = await fixture()
  writeFileSync(join(directory, "docs/widgets/basics/second.md"), "# Configure `<widget>` &amp; save\n\n## Café\n\n## Café\n\n## Café-1\n\n## Configure `<widget>` &amp; save\n")
  const {body} = await get(base, "/docs/widgets/basics/second.md?library=vue")
  expect(body).toContain('<h1 id="configure-amp-save" class="docs-heading">Configure <code>&lt;widget&gt;</code> &amp; save</h1>')
  expect(body).toContain('aria-label="Copy link to Configure &lt;widget&gt; &amp; save">#</a>Configure <code>&lt;widget&gt;</code> &amp; save</h2>')
  expect([...body.matchAll(/<h2 id="([^"]+)"/g)].map(match => match[1])).toEqual(["café", "café-1", "café-1-1", "configure-amp-save-1"])
  expect([...body.matchAll(/href="#(caf[^"]+)"/g)].map(match => match[1])).toEqual(["caf%C3%A9", "caf%C3%A9-1", "caf%C3%A9-1-1"])
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
  expect(page.body).toContain("<title>Basics · Widget documentation</title>")
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
  expect(second.body).toContain("<title>Renamed page · Widget documentation</title>")
  expect(second.body).toContain('href="/docs/widgets/basics/first.md?library=lit" aria-current="page">Renamed page</a>')
  expect(second.body).toContain("Renamed page")
  expect(second.body).not.toContain("First page")
})

it("lays out a guide's Markdown introduction with its breadcrumb and opening illustration", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  mkdirSync(join(docs, "guides"))
  writeFileSync(join(docs, "index.md"), "# Widgets\n\n[Guides](guides/index.md)\n")
  writeFileSync(join(docs, "guides/index.md"), "# Guides\n\n[Illustrated guide](illustrated.md)\n\n[Text guide](text.md)\n")
  writeFileSync(join(docs, "guides/illustrated.md"), `# Illustrated guide

A **lead** with a [link](text.md).

A second paragraph.

![Opening illustration](./opening.svg)

## Details

![Later illustration](./details.svg)

<!-- library:vanilla -->
An example in JavaScript.
<!-- /library -->
`)
  writeFileSync(join(docs, "guides/text.md"), "# Text guide\n\nA lead without an illustration.\n")

  const illustrated = await get(base, "/docs/widgets/guides/illustrated.md?library=vue")
  expect(illustrated.status).toBe(200)
  const [, intro, body] = illustrated.body.match(/<article class="widget-guide"><header class="guide-intro">([\s\S]*?)<\/header>([\s\S]*?)<\/article>/)!
  expect(intro).toContain('<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/docs/widgets/guides/index.md?library=vue">Guides</a>')
  expect(intro).toContain('<div class="guide-intro-content"><div class="guide-intro-text"><h1 id="illustrated-guide" class="docs-heading">Illustrated guide</h1>')
  expect(intro).toContain('<p>A <strong>lead</strong> with a <a href="/docs/widgets/guides/text.md?library=vue">link</a>.</p>')
  expect(intro).toContain('<img src="./opening.svg" alt="Opening illustration">')
  expect(intro).not.toContain("A second paragraph")
  expect(intro).not.toContain("currently use JS")
  expect(body).toContain("A second paragraph")
  expect(body).toContain("The examples on this page currently use JS.")
  expect(body).toContain('<img src="./details.svg" alt="Later illustration">')
  expect(body).not.toContain("opening.svg")

  const text = await get(base, "/docs/widgets/guides/text.md?library=vue")
  expect(text.body).not.toContain('class="guide-intro"')
  expect(text.body).toMatch(/<nav class="breadcrumb"[^>]*>[\s\S]*?<\/nav>\s*<main/)
})

it("renders guide keyword badges from the shared package keyword data", async () => {
  const {base} = await fixture()
  const guides = join(directory, "docs/widgets/guides")
  mkdirSync(guides)
  writeFileSync(join(directory, "docs/widgets/index.md"), "# Widgets\n\n[Guides](guides/index.md)\n")
  writeFileSync(join(guides, "index.md"), "# Guides\n\n[Convert & import/export](conversions.md)\n")
  writeFileSync(join(guides, "conversions.md"), "# Convert & import/export\n\nConvert widget content.\n\n![Diagram](./opening.svg)\n")

  const {body} = await get(base, "/docs/widgets/guides/conversions.md?library=vue")
  expect(body).toContain('href="/src/package-keywords.css"')
  const badges = body.match(/<ul class="details-keywords guide-keywords"[\s\S]*?<\/ul>/)?.[0]
  expect(badges).toContain('data-kind="conversion" href="/docs/widgets/reference/keywords.md?library=vue#values-in-keyword-forms"')
  expect(badges).toContain('title="widget-convertible-to-[media/type | &lt;element-name&gt;]"')
  expect(badges).toContain("icon-tabler-file-export")
  expect(badges).toContain("icon-tabler-file-import")
  expect(body).toContain('</nav><ul class="details-keywords guide-keywords"')
  expect(body).toContain('</ul></div><div class="guide-intro-content"><div class="guide-intro-text">')
})

it("renders overview info boxes, paired code examples, illustrated guides, and authored table headers", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  mkdirSync(join(docs, "guides"))
  const icons = join(directory, "docs/images/widgets")
  mkdirSync(icons, {recursive: true})
  const guideNames = ["content", "focus", "state", "printing"]
  writeFileSync(join(icons, "capability-icons.svg"), `<svg xmlns="http://www.w3.org/2000/svg">${guideNames
    .map(guide => `<symbol id="${guide}" viewBox="0 0 24 24"><path d="M1 1h5"/></symbol>`).join("")}</svg>`)
  writeFileSync(join(docs, "index.md"), `# Widget documentation

> [!INFO]
>
> This documentation is intended for developers. It is available only in English.

> An ordinary quotation.

[Guides](guides/index.md) give instructions for widget features.

[Sandbox](sandbox.md)

| Example header |
|---|
| Example row |

<!-- live-example: Weather -->

~~~js
customElements.define("ww-weather", class extends HTMLElement {})
~~~

~~~js vue
const vueWeatherFixture = "Selected Vue source"
~~~

~~~html
<ww-weather></ww-weather>
~~~

<!-- /live-example -->

<nav class="widget-capabilities" aria-labelledby="what-widgets-can-do">
  <h4>Authoring</h4>
  <ul><li><a href="guides/content.md" aria-describedby="content-preview"><svg><use href="../images/widgets/capability-icons.svg#content"></use></svg><template><img src="../images/widgets/content.svg" alt=""></template><span>Short label</span></a><p id="content-preview" class="widget-capabilities-summary">Short description.</p></li><li><a href="guides/focus.md">Focus</a></li></ul>
  <h4>Participation</h4>
  <ul><li><a href="guides/state.md">State</a></li></ul>
</nav>
`)
  writeFileSync(join(docs, "sandbox.md"), `# Sandbox

<!-- live-example: Hello world -->

~~~js vanilla
customElements.define("ww-hello", class extends HTMLElement {})
~~~

~~~html
<ww-hello></ww-hello>
~~~

<!-- /live-example -->
`)
  writeFileSync(join(docs, "guides/index.md"), `# Guides

<!-- widget-capabilities -->

[Printing](printing.md)
`)
  for(const guide of guideNames) {
    writeFileSync(join(docs, `guides/${guide}.md`), `# ${guide}\n`)
  }
  writeFileSync(join(docs, "guides/content.md"), `# Nest content

Use a [slot](focus.md) to display **authored content**. Authors can edit that content in place.

![Content diagram](./opening.svg)

This second paragraph belongs to the guide body.
`)

  const overview = await get(base, "/docs/widgets/?library=vue")
  expect(overview.body).toContain('>Widget documentation</h1>\n<div class="docs-info" role="note">\n<p>This documentation is intended for developers. It is available only in English.</p>\n</div>')
  expect(overview.body).toContain('<blockquote>\n<p>An ordinary quotation.</p>\n</blockquote>')
  const tables = [...overview.body.matchAll(/<table>[\s\S]*?<\/table>/g)].map(match => match[0])
  expect(tables).toHaveLength(1)
  expect(tables[0]).toContain("<th>Example header</th>")
  const example = overview.body.match(/<div class="live-example"[^>]*>([\s\S]*?)<nav class="widget-capabilities"/)?.[1] ?? ""
  expect(example).toContain('<div class="live-example-controls" hidden><strong data-live-title>Weather</strong>')
  const fileActions = example.match(/<div class="live-example-file-actions" role="group" aria-label="Widget files">([\s\S]*?)<\/div>/)?.[1] ?? ""
  const fileButtons = [...fileActions.matchAll(/<button([^>]*)><span aria-hidden="true">([\s\S]*?)<\/span><\/button>/g)]
  expect(fileButtons).toHaveLength(2)
  expect(fileButtons[0][1]).toContain('data-live-upload aria-label="Load widget files from a folder"')
  expect(fileButtons[0][2]).toContain('icon-tabler-upload')
  expect(fileButtons[1][1]).toContain('data-live-save aria-label="Save widget files"')
  expect(fileButtons[1][2]).toContain('icon-tabler-device-floppy')
  expect(example).not.toContain('data-live-picker')
  const source = example.match(/<figure class="code-snippet" data-live-source data-language="js" id="live-example-1-widget-source">([\s\S]*?)<\/figure>/)?.[1] ?? ""
  expect(source).toContain('<figcaption class="code-snippet-label">Widget source</figcaption>')
  expect(source).toContain('class="shiki')
  expect(source).toContain('vueWeatherFixture')
  expect(source).not.toContain('customElements')
  expect(overview.body).toContain('data-live-library="vue"')
  const vanilla = await get(base, "/docs/widgets/?library=vanilla")
  expect(vanilla.body).toContain('data-live-library="vanilla"')
  expect(vanilla.body).toContain('customElements')
  expect(vanilla.body).not.toContain('vueWeatherFixture')
  const comparison = example.match(/<div class="widget-dom-example">([\s\S]*?)<figure class="code-snippet widget-preview"/)?.[1] ?? ""
  expect(comparison).toContain('data-live-code-tabs role="tablist"')
  expect(comparison).toContain('data-live-code-tab="html" aria-controls="live-example-1-html" aria-selected="true"')
  expect(comparison).toContain('data-live-shadow id="live-example-1-shadow" hidden')
  expect([...comparison.matchAll(/<figcaption class="code-snippet-label">([^<]+)<\/figcaption>/g)].map(match => match[1]))
    .toEqual(["Document HTML", "Rendered shadow DOM"])
  expect(comparison).toMatch(/data-live-html[\s\S]*?<pre class="shiki[\s\S]*?(?:&lt;|&#x3C;)[\s\S]*?ww-weather/)
  expect(comparison).toContain('data-live-shadow')
  expect(example).toContain('data-live-resize="source" role="separator" aria-label="Resize widget source"')
  expect(example).toContain('data-live-resize="preview" role="separator" aria-label="Resize widget preview"')
  expect(example).toContain('<div data-live-preview></div>')
  expect(example).toContain('data-live-mode="editing" aria-pressed="true">Editing</button>')
  expect(example).toContain('data-live-mode="reading" aria-pressed="false">Reading</button>')
  expect(example).toContain('<button type="button" data-live-reset>Reset</button>')
  expect(example).not.toContain("<script")
  expect(example).not.toContain("<ww-weather>")
  expect(overview.body).toContain('<p><a href="/docs/widgets/guides/index.md?library=vue">Guides</a> give instructions for widget features.</p>')
  expect(overview.body).toContain('<script id="docs-site-entry" type="module" blocking="render" src="/src/site-entry.ts">')
  expect(overview.body).toContain('<article>')
  expect(overview.body.split("<article>")[1]).toContain('<use href="#widget-guide-icon-content">')
  expect(overview.body).toContain('<symbol id="widget-guide-icon-content"')
  expect(overview.body).not.toContain('capability-icons.svg?library=vue')
  const guides = await get(base, "/docs/widgets/guides/index.md?library=vue")
  expect(guides.body).not.toContain('class="live-example"')
  expect(guides.body).not.toMatch(/<table>|<h2[^>]*>What widgets can do/)
  expect(guides.body).toContain('<nav class="widget-capabilities" aria-labelledby="guides">')
  expect(guides.body).toContain('class="nav-index-link" aria-current="page">Guides</a>')
  expect(overview.body).toContain('class="nav-index-link" aria-current="page">Overview</a>')
  const sandbox = await get(base, "/docs/widgets/sandbox.md?library=vue")
  expect(sandbox.body).toContain('<select data-live-picker aria-label="Example" name="example"><option value="default">Hello world</option><option value="0">Weather</option></select>')
  expect(sandbox.body).toContain('<template data-live-option="0" data-library="vue" data-language="js"><code data-live-source>const vueWeatherFixture')
  for(const page of [overview, guides]) {
    const map = page.body.match(/<nav class="widget-capabilities"[\s\S]*?<\/nav>/)?.[0]
    expect(map).toContain('href="/docs/widgets/guides/content.md?library=vue"')
    expect(map).toContain('src="/docs/images/widgets/content.svg?library=vue"')
    expect(map).toContain('Use a slot to display <strong>authored content</strong>. Authors can edit that content in place.')
    expect(map).toContain('</template><span>Nest content</span></a>')
    expect(map).not.toMatch(/Short label|Short description|This second paragraph/)
    expect(map).toMatch(/<template><img[^>]*><ul[^>]*>.*?<span class="details-keyword" data-kind="content">[\s\S]*?Has content[\s\S]*?<\/template>/)
  }
  expect(overview.body).toContain('<h4 id="authoring" class="docs-heading"')
  expect(guides.body).toContain('<h2 id="authoring" class="docs-heading"')
  expect(guides.body).toContain('href="#authoring" aria-label="Copy link to Authoring">#</a>Authoring</h2>')

  const state = await get(base, "/docs/widgets/guides/state.md?library=vue")
  const menus = [...state.body.matchAll(/<nav aria-label="(?:Documentation|Mobile documentation)">([\s\S]*?)<\/nav>/g)]
  expect(menus).toHaveLength(2)
  for(const [, menu] of menus) {
    const groups = [...menu.matchAll(/<ul>(<li><a href="\/docs\/widgets\/guides\/(?!index\.md)[\s\S]*?)<\/ul>/g)]
    expect(groups.map(([, group]) => [...group.matchAll(/href="#widget-guide-icon-([a-z-]+)"/g)]
      .map(([, guide]) => guide))).toEqual([["content", "focus"], ["state"], ["printing"]])
    expect(menu).toContain('class="guide-nav-link" aria-current="page"><svg aria-hidden="true"')
    expect(menu).toContain('</svg>Nest content</a>')
    expect(menu).not.toContain('class="nav-index-link"')
    expect(menu).not.toMatch(/Authoring|Participation/)
  }
  expect(state.body).toContain('class="previous" href="/docs/widgets/guides/focus.md?library=vue"')
  expect(state.body).toContain('class="next" href="/docs/widgets/guides/printing.md?library=vue"')
})

it("reuses editable tutorial and quick start sources and lists interactive examples once in Sandbox", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  mkdirSync(join(docs, "tutorial"), {recursive: true})
  mkdirSync(join(docs, "introduction"), {recursive: true})
  mkdirSync(join(docs, "examples"), {recursive: true})
  mkdirSync(join(docs, "guides"), {recursive: true})
  const example = title => `<!-- live-example: ${title} -->

~~~js vanilla
const source = "hello"
~~~

~~~html
<ww-example></ww-example>
~~~

<!-- /live-example -->`
  writeFileSync(join(docs, "sandbox.md"), "# Sandbox\n\n" + example("Hello world"))
  writeFileSync(join(docs, "guides/dependencies.md"), "# Dependencies\n\n" + example("Optional module"))
  writeFileSync(join(docs, "guides/old-dependencies.md"), "# Dependencies\n\n<!-- live-example-link: dependencies.md -->\n")
  writeFileSync(join(docs, "examples/disco.jsx"), 'export const disco = <p>Editable JSX</p>\n')
  writeFileSync(join(docs, "examples/react/hello.jsx"), 'export const hello = <p>Hello from React</p>\n')
  writeFileSync(join(docs, "introduction/quick-start.md"), `# Quick start

## Step 1: Set up the widget package

~~~sh prompt
npm install
npx @webwriter/build dev
~~~

<!-- live-example: Hello widget -->

<!-- live-source: react ../examples/react/hello.jsx -->

~~~html
<ww-hello></ww-hello>
~~~

<!-- /live-example -->
`)
  writeFileSync(join(docs, "tutorial/index.md"), `# Build Ghost Disco

<!-- live-example-link: steps/collaboration.md -->
`)
  mkdirSync(join(docs, "tutorial/steps"))
  writeFileSync(join(docs, "tutorial/steps/collaboration.md"), `# Support collaboration

<!-- live-example: Ghost Disco -->

<!-- live-source: react ../../examples/disco.jsx -->

~~~json package
{"name":"@example/ghost-disco"}
~~~

~~~js file build.mjs
export const build = true
~~~

~~~js shared #dance-moves
export const firstMove = "Float"
~~~

~~~js setup
const previewHost = true
~~~

~~~html shared
<ww-ghost-disco></ww-ghost-disco>
~~~

<!-- /live-example -->
`)

  const tutorial = await get(base, "/docs/widgets/tutorial/index.md?library=react")
  expect(tutorial.body).toContain('data-live-library="react"')
  expect(tutorial.body).toContain('data-live-collaboration')
  expect(tutorial.body).toContain('data-live-layout="shared" aria-pressed="false">Shared')
  expect(tutorial.body).toContain('data-live-source data-language="jsx"')
  expect(tutorial.body).toContain("Editable JSX")
  expect(tutorial.body).toContain("<code data-live-setup>const previewHost = true</code>")
  expect(tutorial.body).toContain('<code data-live-shared="#dance-moves">export const firstMove = &quot;Float&quot;</code>')
  expect(tutorial.body).toContain('data-live-source-tabs role="tablist" aria-label="Widget files"')
  expect(tutorial.body).toContain('data-live-package id="live-example-1-package" hidden')
  expect(tutorial.body).toContain('@example/ghost-disco')
  expect(tutorial.body).toContain('<code data-live-file="build.mjs">export const build = true</code>')
  expect(tutorial.body).toContain('aria-label="Save widget files"')
  expect(tutorial.body).toContain('<div data-live-preview></div><p class="live-example-status" data-live-status role="status"')
  expect(tutorial.body).toContain('<dialog class="live-example-error" data-live-error popover="manual" aria-labelledby="live-example-1-error-title" aria-describedby="live-example-1-error-text" hidden>')
  expect(tutorial.body).toContain('<button type="button" data-live-dismiss-error>Dismiss</button>')
  const step = await get(base, "/docs/widgets/tutorial/steps/collaboration.md?library=react")
  expect(step.body).toContain("Editable JSX")
  const quickStart = await get(base, "/docs/widgets/introduction/quick-start.md?library=react")
  const commands = quickStart.body.match(/<pre class="shiki[^"]* cli-prompt"[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1]
  expect(commands?.replace(/<[^>]+>/g, "")).toBe("npm install\nnpx @webwriter/build dev")
  expect(quickStart.body).toContain("<strong data-live-title>Hello widget</strong>")
  expect(quickStart.body).toContain('data-live-source data-language="jsx"')
  expect(quickStart.body).toContain("Hello from React")
  const linked = await get(base, "/docs/widgets/guides/old-dependencies.md?library=react")
  expect(linked.body).toContain("<strong data-live-title>Optional module</strong>")
  const sandbox = await get(base, "/docs/widgets/sandbox.md?library=react")
  expect(sandbox.body.match(/<option value="\d+">Ghost Disco<\/option>/g)).toHaveLength(1)
  expect(sandbox.body).toMatch(/<option value="\d+">Hello widget<\/option>/)
  expect(sandbox.body).toMatch(/<template data-live-option="\d+" data-library="react" data-language="jsx" data-live-collaboration>/)
  expect(sandbox.body.match(/>Optional module<\/option>/g)).toHaveLength(1)
  expect(sandbox.body).toContain("const previewHost = true")
  expect(sandbox.body).toContain('data-live-shared="#dance-moves"')
  expect(sandbox.body).toContain('<template data-live-package><pre')
})

it("numbers tutorial navigation and headings while preserving guide links and heading anchors", async () => {
  const {base} = await fixture()
  const docs = join(directory, "docs/widgets")
  mkdirSync(join(docs, "tutorial"))
  writeFileSync(join(docs, "index.md"), "# Widget docs\n\n[Tutorial](./tutorial/index.md)")
  writeFileSync(join(docs, "tutorial/index.md"), "# Tutorial\n\n- [2. Authoring](02-authoring.md)")
  mkdirSync(join(directory, "docs/images/widgets"), {recursive: true})
  writeFileSync(join(directory, "docs/images/widgets/capability-icons.svg"), '<svg><symbol id="focus" viewBox="0 0 16 16"></symbol></svg>')
  writeFileSync(join(docs, "tutorial/02-authoring.md"), `# 2. Authoring

[Support editing](../guides/editing.md)

Read [the guide](../guides/editing.md) for details.

## Handle input

[Handle selection & input](../guides/focus.md#move-the-document-selection)

**\`ww-ghost-disco.vue\`**

\`\`\`html
<button>Float</button>
\`\`\`

### Move the caret

## Results
`)
  const {body} = await get(base, "/docs/widgets/tutorial/02-authoring.md?library=vue")
  expect(body).toContain('<div class="tutorial-heading"><h1 id="2-authoring" class="docs-heading">2. Authoring</h1>\n<a class="tutorial-guide-link" href="/docs/widgets/guides/editing.md?library=vue"><span>Support editing</span></a></div>')
  expect(body).toContain('<a class="docs-heading-link" href="#handle-input" aria-label="Copy link to 2.1 Handle input">#</a>2.1 Handle input</h2>\n<a class="tutorial-guide-link" href="/docs/widgets/guides/focus.md?library=vue#move-the-document-selection">')
  expect(body).toContain('<use href="#widget-guide-icon-focus"></use></svg><span>Handle selection &amp; input</span>')
  expect(body).toContain('href="/docs/widgets/tutorial/02-authoring.md?library=vue" aria-current="page">2. Authoring</a>')
  expect(body).toContain('href="#move-the-caret" aria-label="Copy link to 2.1.1 Move the caret"')
  expect(body).toContain('href="#results" aria-label="Copy link to 2.2 Results"')
  expect(body).toContain('<p>Read <a href="/docs/widgets/guides/editing.md?library=vue">the guide</a> for details.</p>')
  expect(body).toContain('<figure class="code-snippet" data-inline-label><figcaption class="code-snippet-label"><code>ww-ghost-disco.vue</code></figcaption>')
})

it("renders an npm package banner as a native link with a decorative package icon", async () => {
  const {base} = await fixture()
  writeFileSync(join(directory, "docs/widgets/basics/second.md"), `# Build

> [!NPM]
>
> [View \`@webwriter/build\` on npm](https://www.npmjs.com/package/@webwriter/build)

Build the exports.
`)
  const {body} = await get(base, "/docs/widgets/basics/second.md?library=vue")
  expect(body).toContain('>Build</h1>\n<a class="docs-package-banner" href="https://www.npmjs.com/package/@webwriter/build">')
  expect(body).toContain('<span class="docs-package-banner-icon" aria-hidden="true"><svg')
  expect(body).toContain('icon-tabler-package')
  expect(body).toContain('<span>View <code>@webwriter/build</code> on npm</span></a>')
  expect(body).not.toContain("[!NPM]")
})

it("emits static documentation variants, navigation, assets, and original example downloads", async () => {
  const {plugin} = await fixture()
  adapterReferenceFixture()
  writeFileSync(join(directory, "docs/widgets/index.md"), "# Widgets\n\n- [Basics](basics/index.md)\n- [Reference](reference/index.md)\n")
  const assets = join(directory, "dev-server")
  mkdirSync(join(assets, "icons"), {recursive: true})
  writeFileSync(join(assets, "documentation.css"), 'body {color: black}')
  writeFileSync(join(assets, "documentation.js"), '// documentation navigation')
  for(const icon of ["javascript", "lit", "react", "vue", "angular", "svelte"]) {
    writeFileSync(join(assets, `icons/${icon}.svg`), `<svg id="${icon}"></svg>`)
  }
  mkdirSync(join(directory, "docs/images"))
  writeFileSync(join(directory, "docs/images/diagram.svg"), '<svg id="diagram"></svg>')
  plugin.configResolved({root: directory, base: "/"})
  const emitted = new Map()
  await plugin.generateBundle.call({emitFile: asset => emitted.set(asset.fileName, asset.source)}, {}, {
    site: {type: "chunk", isEntry: true, name: "site-entry", fileName: "assets/site-entry-a1b2c3d4.js"},
    documentation: {type: "chunk", isEntry: true, name: "documentation", fileName: "assets/documentation-e5f6g7h8.js"},
  })

  for(const library of ["lit", "vanilla", "react", "vue", "angular", "svelte"]) {
    const suffix = library === "lit" ? "" : `.${library}`
    const page = emitted.get(`docs/widgets/basics/first${suffix}.html`)
    expect(page).toContain('<title>First page · Widget documentation</title>')
    expect(page).toContain('<h1 id="first-page" class="docs-heading">First page</h1>')
    expect(page).toContain('href="#a-heading" aria-label="Copy link to A heading!"')
    expect(page).toContain(`href="/docs/widgets/basics/second${suffix}.html?step=2&library=${library}#setup"`)
    expect(page).toContain(`data-href="/docs/widgets/basics/first.react.html?library=react"`)
    const breadcrumb = page.match(/<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
    expect(breadcrumb).toBe(`<a href="/docs/widgets/basics/index${suffix}.html?library=${library}">Basics</a>`)
    expect(page).toContain('href="/packages/">Widgets</a>')
    expect(page).toContain('href="/editor/">Open WebWriter')
    expect(page).toContain('href="/assets/docs/documentation.css"')
    const noteIcon = library === "lit" ? "lit" : "javascript"
    expect(page).toContain(`<span class="library-note-label"><img src="/assets/docs/icons/${noteIcon}.svg" alt="" width="16" height="16">`)
    expect(page).toContain('href="/assets/site-header.css"')
    expect(page).toContain('src="/assets/documentation-e5f6g7h8.js"')
    expect(page).toContain('src="/assets/site-entry-a1b2c3d4.js"')
    expect(page).toContain('type="module" blocking="render" src="/assets/site-entry-a1b2c3d4.js"')
    expect(page).not.toContain('src="/assets/site-entry.js"')
    expect(page).not.toContain('src="/assets/docs/documentation.js"')
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
  expect(emitted.get("assets/docs/package-keywords.css").toString()).toContain(".details-keyword")
  expect(emitted.get("assets/docs/icons/react.svg").toString()).toContain('id="react"')
  const reactAdapter = emitted.get("docs/widgets/reference/adapters.react.html")
  expect(reactAdapter).toContain('class="docs-heading">C2. @webwriter/react</h1>')
  expect(reactAdapter.match(/<details class="nav-reference" open>/g)).toHaveLength(2)
  expect(reactAdapter).toContain('href="/docs/widgets/reference/adapters.angular.html?library=angular"><img src="/assets/docs/icons/angular.svg"')
  expect(emitted.get("docs/widgets/reference/adapters.html")).toContain('id="standalone-widget-drawer"')
  expect(emitted.get("docs/widgets/reference/lit.react.html")).toContain('id="standalone-widget-drawer"')
})
