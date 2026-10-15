import {readFile, readdir} from "node:fs/promises"
import {isAbsolute, relative, resolve} from "node:path"
import {Marked, Renderer} from "marked"
import {createHighlighter} from "shiki"
import {renderSiteHeader} from "./site-header.mjs"

const home = "/docs/widgets/index.md"
const libraries = [
  {value: "vanilla", label: "JS", icon: "javascript"},
  {value: "lit", label: "Lit", icon: "lit"},
  {value: "react", label: "React", icon: "react"},
  {value: "vue", label: "Vue", icon: "vue"},
  {value: "angular", label: "Angular", icon: "angular"},
  {value: "svelte", label: "Svelte", icon: "svelte"},
]
const sourceExtensions = {react: "jsx", vue: "vue", angular: "ts", svelte: "svelte"}
const sourcePattern = /\.(?:js|mjs|jsx|ts|tsx|vue|svelte)$/
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character])
function markdown(source, library = "lit") {
  const variants = [...source.matchAll(/<!-- library:([\w-]+) -->/g)].map(match => match[1])
  const selected = variants.includes(library) ? library : "vanilla"
  const result = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/<!-- library:([\w-]+) -->\r?\n([\s\S]*?)<!-- \/library -->/g,
      (_match, variant, content) => variant === selected ? content : "")
  return variants.length && selected !== library
    ? result.replace(/^(# .+)$/m, "$1\n\nThe examples on this page currently use JS.")
    : result
}

function libraryURL(href, path, library, staticBuild = false) {
  const url = new URL(href, `http://docs.local${path}`)
  if(url.origin !== "http://docs.local" || !url.pathname.startsWith("/docs/")
    && !["/README.md", "/packages.md"].includes(url.pathname)) return href
  const examples = "/docs/widgets/examples/"
  if(library !== "vanilla" && url.pathname.startsWith(examples)
    && /^(?:0[1-6]-[\w-]+\.js|hello\.js|ww-quiz\.js|package\.json|quiz-tests\.js|quiz\.html)$/.test(url.pathname.slice(examples.length))) {
    const name = url.pathname.slice(examples.length)
    url.pathname = `${examples}${library}/${sourceExtensions[library] && /^(?:0[1-6]-|hello\.js)/.test(name) ? name.replace(/\.js$/, `.${sourceExtensions[library]}`) : name}`
  }
  if(url.pathname.startsWith(examples) && sourcePattern.test(url.pathname)) url.searchParams.set("download", "1")
  url.searchParams.set("library", library)
  if(staticBuild && (url.pathname.endsWith(".md") || url.pathname.endsWith("/"))) {
    if(url.pathname.endsWith("/")) url.pathname += "index.md"
    url.pathname = url.pathname.replace(/\.md$/, `${library === "lit" ? "" : `.${library}`}.html`)
  }
  return url.pathname + url.search + url.hash
}

async function embedExamples(source, {root, path, library, highlighter}) {
  const pattern = /<!-- (script|include):(.*?) -->/g
  const matches = [...source.matchAll(pattern)]
  const examples = await Promise.all(matches.map(async ([, kind, href]) => {
    const url = new URL(libraryURL(href, path, library), `http://docs.local${path}`)
    const file = resolve(root, `.${url.pathname}`)
    const withinExamples = relative(resolve(root, "docs/widgets/examples"), file)
    if(url.origin !== "http://docs.local" || withinExamples.startsWith("..")
      || isAbsolute(withinExamples) || !(kind === "include" ? /\.md$/ : sourcePattern).test(file)) throw new Error("Invalid documentation example")
    const content = await readFile(file, "utf8")
    if(kind === "include") {
      // Included explanations keep links relative to their own example directory.
      return content.replace(/(\]\()([^\s)]+)(\))/g, (_match, start, href, end) => {
        const target = new URL(href, url)
        return `${start}${target.origin === "http://docs.local" ? target.pathname + target.search + target.hash : href}${end}`
      })
    }
    return highlighter.codeToHtml(content, {lang: ({jsx: "jsx", ts: "typescript", tsx: "tsx", vue: "vue", svelte: "svelte"})[file.split(".").at(-1)] ?? "javascript", theme: "github-light"})
  }))
  let index = 0
  return source.replace(pattern, () => examples[index++])
}

function renderMarkdown(source, {path, library, highlighter, staticBuild}) {
  const headings = new Map()
  const parser = new Marked({renderer: {
    code({text, lang}) {
      const language = lang?.split(/\s/)[0] || "text"
      return highlighter.codeToHtml(text, {
        lang: highlighter.getLoadedLanguages().includes(language) ? language : "text",
        theme: "github-light",
      }) + "\n"
    },
    link(token) {
      const href = libraryURL(token.href, path, library, staticBuild)
      const html = Renderer.prototype.link.call(this, {...token, href})
      return staticBuild && new URL(href, "http://docs.local").searchParams.get("download") === "1"
        ? html.replace("<a ", '<a download ') : html
    },
    html({text}) {
      return text.replace(/\b(src|href)=(["'])(.*?)\2/g, (_match, attribute, quote, href) =>
        `${attribute}=${quote}${escapeHTML(libraryURL(href.replaceAll("&amp;", "&"), path, library, staticBuild))}${quote}`)
    },
    heading({text, tokens, depth}) {
      const slug = text.toLowerCase().replace(/<[^>]*>/g, "")
        .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-") || "section"
      const count = headings.get(slug) ?? 0
      headings.set(slug, count + 1)
      return `<h${depth} id="${escapeHTML(slug + (count ? `-${count}` : ""))}">${this.parser.parseInline(tokens)}</h${depth}>\n`
    },
  }})
  // Repository Markdown is trusted; keep its authored HTML, including example iframes.
  return parser.parse(source)
}

function pageLinks(source, path) {
  const links = new Map()
  const parser = new Marked()
  parser.walkTokens(parser.lexer(source), token => {
    if(token.type !== "link") return
    const url = new URL(token.href, `http://docs.local${path}`)
    if(url.origin === "http://docs.local" && url.pathname.endsWith(".md")) {
      links.set(url.pathname, {path: url.pathname, title: token.text})
    }
  })
  return [...links.values()]
}

async function navigation(root) {
  const read = async path => markdown(await readFile(resolve(root, `.${path}`), "utf8"))
  const sections = pageLinks(await read(home), home)
  return Promise.all(sections.map(async section => ({
    ...section,
    pages: section.path.endsWith("/index.md")
      ? pageLinks(await read(section.path), section.path).filter(page =>
        page.path !== section.path && page.path.startsWith(section.path.slice(0, -"index.md".length)))
      : [],
  })))
}

function renderPage({source, path, sections, library, highlighter, missing = false, staticBuild = false}) {
  const title = new Marked().lexer(source).find(token => token.type === "heading" && token.depth === 1)?.text ?? "Documentation"
  const pages = [{path: home, title: "Widgets"}, ...sections.flatMap(section => [section, ...section.pages])]
  const index = pages.findIndex(page => page.path === path)
  const section = sections.find(section => section.path.endsWith("/index.md")
    && path.startsWith(section.path.slice(0, -"index.md".length)))
  const href = value => escapeHTML(libraryURL(value, path, library, staticBuild))
  const link = page => `<a href="${href(page.path)}"${page.path === path ? ' aria-current="page"' : ""}>${escapeHTML(page.title)}</a>`
  const menu = `<ul><li>${link({path: home, title: "Overview"})}</li>${sections.map(section =>
    section.path.endsWith("/index.md")
      ? `<li class="nav-section">${link(section)}<ul>${section.pages.map(page => `<li>${link(page)}</li>`).join("")}</ul></li>`
      : `<li>${link(section)}</li>`,
  ).join("")}</ul>`
  const adjacent = (page, direction) => page ? `<a class="${direction.toLowerCase()}" href="${href(page.path)}"><span>${direction}</span>${escapeHTML(page.title)}</a>` : "<span></span>"
  const breadcrumb = section && section.path !== path ? [section] : []
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHTML(title)} · WebWriter documentation</title>
    <link rel="icon" href="/assets/app-icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="${staticBuild ? "/assets/docs" : "/dev-server"}/documentation.css">
    <link rel="stylesheet" href="${staticBuild ? "/assets/site-header.css" : "/src/site-header.css"}">
    <script type="module" src="${staticBuild ? "/assets/docs" : "/dev-server"}/documentation.js"></script>
    <script type="module" src="${staticBuild ? "/assets/site-entry.js" : "/src/site-entry.ts"}"></script>
  </head>
  <body class="site-layout">
    <a class="skip-link" href="#content">Skip to content</a>
    ${renderSiteHeader("/docs/")}
    <div class="docs-layout site-content">
      <aside>
          <form class="library-switch" method="get" action="${href(path)}">
            <label for="library">Library</label>
            <select id="library" name="library" aria-label="Rendering library">
              <button type="button"><selectedcontent></selectedcontent></button>
              ${libraries.map(({value, label, icon}) => `<option value="${value}"${library === value ? " selected" : ""}${staticBuild ? ` data-href="${escapeHTML(libraryURL(path, path, value, true))}"` : ""}><img src="${staticBuild ? "/assets/docs" : "/dev-server"}/icons/${icon}.svg" alt="" width="20" height="20">${label}</option>`).join("\n            ")}
            </select>
            <noscript>${staticBuild ? libraries.map(({value, label}) => `<a href="${escapeHTML(libraryURL(path, path, value, true))}">${label}</a>`).join(" ") : '<button type="submit">Apply</button>'}</noscript>
          </form>
        <nav aria-label="Documentation">${menu}</nav>
      </aside>
      <div class="page" tabindex="0" role="region" aria-label="Documentation content">
        <details class="mobile-navigation"><summary>Browse documentation</summary><nav aria-label="Mobile documentation">${menu}</nav></details>
        ${breadcrumb.length ? `<nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumb.map(link).join('<span aria-hidden="true">/</span>')}</nav>` : ""}
        <main id="content" tabindex="-1"><article>${renderMarkdown(source, {path, library, highlighter, staticBuild})}</article></main>
        ${!missing && index !== -1 ? `<nav class="page-navigation" aria-label="Page navigation">${adjacent(pages[index - 1], "Previous")}${adjacent(pages[index + 1], "Next")}</nav>` : ""}
        <footer class="site-footer"><site-language-switcher></site-language-switcher></footer>
      </div>
    </div>
  </body>
</html>`
}

async function filesIn(directory) {
  const entries = await readdir(directory, {withFileTypes: true})
  return (await Promise.all(entries.filter(entry => !entry.name.startsWith(".")
    && !["node_modules", "dist"].includes(entry.name) && (entry.isDirectory() || entry.isFile()))
    .map(entry => entry.isDirectory() ? filesIn(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat()
}

/** Use the same renderer for development requests and static production pages. */
export function documentationPlugin() {
  let config
  let highlighting
  const highlighter = () => highlighting ??= createHighlighter({
    themes: ["github-light"],
    langs: ["javascript", "typescript", "jsx", "tsx", "vue", "svelte", "html", "css", "json", "jsonc", "bash", "xml"],
  })
  return {
    name: "documentation",
    configResolved(value) { config = value },
    config() {
      // Preload dynamically selected tutorial imports so first navigation does
      // not replace Vite's dependency cache while a preview is loading.
      return {optimizeDeps: {include: [
        "react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "vue/dist/vue.runtime.esm-browser.js",
        "@angular/compiler", "@angular/core", "@angular/elements", "@angular/platform-browser",
        "svelte", "svelte/internal/client", "svelte/internal/disclose-version", "svelte/internal/flags/legacy",
      ]}}
    },
    async load(id) {
      // Compile tutorial sources only; document widgets arrive as browser-ready scripts.
      const file = id.split("?")[0]
      if(/[?&](?:raw|url)(?:[=&]|$)/.test(id)) return
      if(file.endsWith(".vue") && file.includes("/docs/widgets/examples/vue/")) {
        const {compileVue} = await import("../docs/widgets/examples/vue/compile.mjs")
        return {code: compileVue(await readFile(file, "utf8"), file), map: null}
      }
      if(file.endsWith(".ts") && file.includes("/docs/widgets/examples/angular/")) {
        const {transform} = await import("esbuild-wasm")
        return transform(await readFile(file, "utf8"), {
          loader: "ts", sourcefile: file, format: "esm", target: "es2022",
          tsconfigRaw: {compilerOptions: {experimentalDecorators: true, useDefineForClassFields: false}},
        })
      }
      if(!file.endsWith(".svelte") || !file.includes("/docs/widgets/examples/svelte/")) return
      const {compile} = await import("svelte/compiler")
      const result = compile(await readFile(file, "utf8"), {filename: file, generate: "client", customElement: true, dev: true})
      return {code: result.js.code, map: result.js.map}
    },
    configureServer(server) {
      const root = server.config.root
      server.middlewares.use(async (request, response, next) => {
        if(!["GET", "HEAD"].includes(request.method)) return next()
        const url = new URL(request.url, "http://localhost")
        const library = libraries.find(({value}) => value === url.searchParams.get("library"))?.value ?? "lit"
        if(["raw", "url", "import"].some(key => url.searchParams.has(key))) return next()
        let path
        try { path = decodeURIComponent(request.url.split("?")[0]) }
        catch { response.writeHead(400).end("Invalid documentation path"); return }
        if(path === "/docs" || path === "/docs/") {
          response.writeHead(302, {Location: `/docs/widgets/${url.search}`}).end()
          return
        }
        const inDocs = path.startsWith("/docs/")
        if(!inDocs && !["/README.md", "/packages.md"].includes(path)) return next()
        if(path.startsWith("/docs/widgets/examples/") && url.searchParams.get("download") === "1") {
          const file = resolve(root, `.${path}`)
          const withinExamples = relative(resolve(root, "docs/widgets/examples"), file)
          if(path.includes("\0") || withinExamples.startsWith("..") || isAbsolute(withinExamples)
            || !sourcePattern.test(file)) {
            response.writeHead(404).end("Example source not found")
            return
          }
          try {
            const content = await readFile(file, "utf8")
            const filename = path.split("/").at(-1).replace(/["\r\n]/g, "")
            response.writeHead(200, {"Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`})
            response.end(request.method === "HEAD" ? undefined : content)
          }
          catch(error) {
            if(error.code === "ENOENT") response.writeHead(404).end("Example source not found")
            else next(error)
          }
          return
        }
        if(inDocs && !path.endsWith(".md")) {
          if(path.endsWith("/")) path += "index.md"
          else if(path.split("/").at(-1).includes(".")) return next()
          else {
            response.writeHead(302, {Location: `${url.pathname}/${url.search}`}).end()
            return
          }
        }
        const file = resolve(root, `.${path}`)
        const withinDocs = relative(resolve(root, "docs"), file)
        if(path.includes("\0") || inDocs && (withinDocs.startsWith("..") || isAbsolute(withinDocs))) {
          response.writeHead(404).end("Documentation page not found")
          return
        }
        try {
          let source, missing = false
          try { source = markdown(await readFile(file, "utf8"), library) }
          catch(error) {
            if(error.code !== "ENOENT" && error.code !== "EISDIR") throw error
            source = "# Page not found\n\nChoose a page from the navigation or return to the [widget documentation](/docs/)."
            missing = true
          }
          const codeHighlighter = await highlighter()
          source = await embedExamples(source, {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, sections: await navigation(root), library, highlighter: codeHighlighter, missing})
          const body = await server.transformIndexHtml(url.pathname, html)
          response.writeHead(missing ? 404 : 200, {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"})
          response.end(request.method === "HEAD" ? undefined : body)
        }
        catch(error) { next(error) }
      })
    },
    async generateBundle() {
      const root = config.root
      const files = await filesIn(resolve(root, "docs"))
      const sections = await navigation(root)
      const codeHighlighter = await highlighter()
      const emit = (fileName, source) => this.emitFile({type: "asset", fileName, source})
      for(const file of [...files.filter(file => file.endsWith(".md")), resolve(root, "README.md"), resolve(root, "packages.md")]) {
        const path = `/${relative(root, file)}`
        const content = await readFile(file, "utf8")
        for(const {value: library} of libraries) {
          const source = await embedExamples(markdown(content, library), {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, sections, library, highlighter: codeHighlighter, staticBuild: true})
          const output = new URL(libraryURL(path, path, library, true), "http://docs.local").pathname.slice(1)
          emit(output, html)
          if(path === home) emit(`docs/index${library === "lit" ? "" : `.${library}`}.html`, html)
        }
      }
      // Downloads retain their original source; executable previews are Vite HTML entries.
      for(const file of files.filter(file => !file.endsWith(".md")
        && !["docs/widgets/examples/preview.html", "docs/widgets/examples/hello.html"].includes(relative(root, file)))) {
        emit(relative(root, file), await readFile(file))
      }
      for(const name of ["documentation.css", "documentation.js", ...libraries.map(({icon}) => `icons/${icon}.svg`)]) {
        emit(`assets/docs/${name}`, await readFile(resolve(root, "dev-server", name)))
      }
    },
    async closeBundle() {
      if(highlighting) (await highlighting).dispose()
      highlighting = undefined
    },
    handleHotUpdate({file, server}) {
      if(file.endsWith(".md") && (file.startsWith(`${resolve(server.config.root, "docs")}/`)
        || ["README.md", "packages.md"].some(name => file === resolve(server.config.root, name)))) {
        server.ws.send({type: "full-reload"})
        return []
      }
    },
  }
}
