import {readFile, readdir} from "node:fs/promises"
import {isAbsolute, relative, resolve} from "node:path"
import {Marked, Renderer} from "marked"
import {parseFragment, serializeOuter} from "parse5"
import {createHighlighter} from "shiki"
import {renderSiteHeader, renderSiteFooter} from "./site-header.mjs"

const home = "/docs/widgets/index.md"
const guideIndex = "/docs/widgets/guides/index.md"
const guideSprite = "/docs/images/widgets/capability-icons.svg"
const guideIconId = name => `widget-guide-icon-${name}`
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
const exampleFallback = "The examples on this page currently use JS."
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
    ? result.replace(/^(# .+)$/m, `$1\n\n${exampleFallback}`)
    : result
}

function libraryURL(href, path, library, staticBuild = false) {
  const url = new URL(href, `http://docs.local${path}`)
  if(url.origin !== "http://docs.local" || !url.pathname.startsWith("/docs/")
    && !["/README.md", "/packages.md"].includes(url.pathname)) return href
  const examples = "/docs/widgets/examples/"
  if(library !== "vanilla" && url.pathname.startsWith(examples)
    && /^(?:0[1-6]-[\w-]+\.js|hello\.js|ww-(?:quiz|ghost-disco)\.js|(?:ghost-disco-)?package\.json|(?:quiz|ghost-disco)(?:-tests\.js|\.html))$/.test(url.pathname.slice(examples.length))) {
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

function renderMarkdown(source, {path, library, highlighter, staticBuild, guideIcons, guide}) {
  const headings = new Map()
  let omitTableHeader = path === home
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
    table(token) {
      const html = Renderer.prototype.table.call(this, token)
      if(!omitTableHeader) return html
      omitTableHeader = false
      return html.replace(/<thead>[\s\S]*?<\/thead>\n/, "")
    },
    html({text}) {
      return text.replace(/\b(src|href)=(["'])(.*?)\2/g, (_match, attribute, quote, href) => {
        const url = libraryURL(href.replaceAll("&amp;", "&"), path, library, staticBuild)
        const [asset, icon] = url.split("#")
        const target = attribute === "href" && asset.startsWith(`${guideSprite}?`) && guideIcons.ids.has(icon)
          ? `#${guideIconId(icon)}` : url
        return `${attribute}=${quote}${escapeHTML(target)}${quote}`
      })
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
  const tokens = parser.lexer(source)
  if(guide) {
    const [heading, ...blocks] = tokens.filter(token => token.type !== "space")
    if(heading?.type === "heading" && heading.depth === 1) {
      let lead
      for(const block of blocks) {
        if(block.type !== "paragraph") break
        if(block.tokens.length === 1 && block.tokens[0].type === "image") {
          if(!lead) break
          const title = parser.parser([heading])
          const text = parser.parser([lead])
          const illustration = parser.parser([block])
          const body = parser.parser(tokens.filter(token => token !== heading && token !== lead && token !== block))
          return {intro: {title, text, illustration}, body}
        }
        if(!lead && block.text !== exampleFallback) lead = block
      }
    }
  }
  return {body: parser.parser(tokens)}
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

function capabilityGuideGroups(source) {
  const map = new Marked().lexer(source)
    .filter(token => token.type === "html")
    .flatMap(token => parseFragment(token.text).childNodes)
    .find(node => node.tagName === "nav" && node.attrs.some(attr =>
      attr.name === "class" && attr.value.split(/\s+/).includes("widget-capabilities")))
  if(!map) return []
  const descendants = (node, tag) => (node.childNodes ?? []).flatMap(child =>
    child.tagName === tag ? [child] : descendants(child, tag))
  return descendants(map, "ul").map(list => descendants(list, "a").flatMap(anchor => {
    const href = anchor.attrs.find(attr => attr.name === "href")?.value
    if(!href) return []
    const url = new URL(href, `http://docs.local${home}`)
    return url.origin === "http://docs.local" ? [url.pathname] : []
  }))
}

async function navigation(root) {
  const read = async path => markdown(await readFile(resolve(root, `.${path}`), "utf8"))
  const overview = await read(home)
  const sections = pageLinks(overview, home)
  const guideGroups = capabilityGuideGroups(overview)
  return Promise.all(sections.map(async section => {
    const pages = section.path.endsWith("/index.md")
      ? pageLinks(await read(section.path), section.path).filter(page =>
        page.path !== section.path && page.path.startsWith(section.path.slice(0, -"index.md".length)))
      : []
    if(section.path !== guideIndex || !guideGroups.length) return {...section, groups: [pages]}
    const remaining = new Map(pages.map(page => [page.path, page]))
    const groups = guideGroups.map(paths => paths.flatMap(path => {
      const page = remaining.get(path)
      if(!page) return []
      remaining.delete(path)
      return [page]
    })).filter(group => group.length)
    if(remaining.size) groups.push([...remaining.values()])
    return {...section, groups}
  }))
}

async function readGuideIcons(root) {
  let source
  try { source = await readFile(resolve(root, `.${guideSprite}`), "utf8") }
  catch(error) {
    if(error.code !== "ENOENT") throw error
    return {markup: "", ids: new Set()}
  }
  const svg = parseFragment(source).childNodes.find(node => node.tagName === "svg")
  const ids = new Set()
  if(!svg) return {markup: "", ids}
  for(const symbol of svg.childNodes.filter(node => node.tagName === "symbol")) {
    const id = symbol.attrs.find(attr => attr.name === "id")
    if(!id) continue
    ids.add(id.value)
    id.value = guideIconId(id.value)
  }
  svg.attrs.push({name: "width", value: "0"}, {name: "height", value: "0"},
    {name: "aria-hidden", value: "true"}, {name: "style", value: "position:absolute"})
  return {markup: serializeOuter(svg), ids}
}

function renderPage({source, path, sections, library, highlighter, guideIcons, missing = false, staticBuild = false,
  siteEntryURL = "/src/site-entry.ts", documentationURL = "/dev-server/documentation.js"}) {
  const title = new Marked().lexer(source).find(token => token.type === "heading" && token.depth === 1)?.text ?? "Documentation"
  const pages = [{path: home, title: "Widgets"}, ...sections.flatMap(section => [section, ...section.groups.flat()])]
  const index = pages.findIndex(page => page.path === path)
  const section = sections.find(section => section.path.endsWith("/index.md")
    && path.startsWith(section.path.slice(0, -"index.md".length)))
  const href = value => escapeHTML(libraryURL(value, path, library, staticBuild))
  const link = page => {
    const guide = /^\/docs\/widgets\/guides\/([a-z\d-]+)\.md$/.exec(page.path)?.[1]
    const icon = guideIcons.ids.has(guide)
      ? `<svg aria-hidden="true" width="16" height="16"><use href="#${guideIconId(guide)}"></use></svg>`
      : ""
    return `<a href="${href(page.path)}"${icon ? ' class="guide-nav-link"' : ""}${page.path === path ? ' aria-current="page"' : ""}>${icon}${escapeHTML(page.title)}</a>`
  }
  const menu = `<ul><li>${link({path: home, title: "Overview"})}</li>${sections.map(section =>
    section.path.endsWith("/index.md")
      ? `<li class="nav-section">${link(section)}${section.groups.map(group => `<ul>${group.map(page => `<li>${link(page)}</li>`).join("")}</ul>`).join("")}</li>`
      : `<li>${link(section)}</li>`,
  ).join("")}</ul>`
  const adjacent = (page, direction) => page ? `<a class="${direction.toLowerCase()}" href="${href(page.path)}"><span>${direction}</span>${escapeHTML(page.title)}</a>` : "<span></span>"
  const breadcrumb = section && section.path !== path
    ? `<nav class="breadcrumb" aria-label="Breadcrumb">${link(section)}</nav>` : ""
  const guide = section?.path === guideIndex && path !== guideIndex && !missing
  const {intro, body} = renderMarkdown(source, {path, library, highlighter, staticBuild, guideIcons, guide})
  const guideIntro = intro
    ? `<header class="guide-intro">${breadcrumb}${intro.title}<div class="guide-intro-content">${intro.text}${intro.illustration}</div></header>` : ""
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHTML(title)} · WebWriter documentation</title>
    <link rel="icon" href="/assets/app-icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="${staticBuild ? "/assets/docs" : "/dev-server"}/documentation.css">
    <link rel="stylesheet" href="${staticBuild ? "/assets/site-header.css" : "/src/site-header.css"}">
    <script id="docs-site-entry" type="module" blocking="render" src="${escapeHTML(siteEntryURL)}"></script>
    <script>
      (() => {
        const entry = document.getElementById("docs-site-entry")
        if ("blocking" in entry) return
        // In older browsers, reveal the shared chrome after its locale is ready.
        const root = document.documentElement
        root.classList.add("docs-localizing")
        const reveal = () => root.classList.remove("docs-localizing")
        entry.addEventListener("load", reveal, {once: true})
        entry.addEventListener("error", reveal, {once: true})
      })()
    </script>
    <script type="module" src="${escapeHTML(documentationURL)}"></script>
  </head>
  <body class="site-layout">
    ${guideIcons.markup}
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
        ${intro ? "" : breadcrumb}
        <main id="content" tabindex="-1"><article${guide ? ' class="widget-guide"' : ""}>${guideIntro}${body}</article></main>
        ${!missing && index !== -1 ? `<nav class="page-navigation" aria-label="Page navigation">${adjacent(pages[index - 1], "Previous")}${adjacent(pages[index + 1], "Next")}</nav>` : ""}
        ${renderSiteFooter()}
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
          const [codeHighlighter, sections, guideIcons] = await Promise.all([highlighter(), navigation(root), readGuideIcons(root)])
          source = await embedExamples(source, {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, sections, library, highlighter: codeHighlighter, guideIcons, missing})
          const body = await server.transformIndexHtml(url.pathname, html)
          response.writeHead(missing ? 404 : 200, {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"})
          response.end(request.method === "HEAD" ? undefined : body)
        }
        catch(error) { next(error) }
      })
    },
    async generateBundle(_options, bundle) {
      const root = config.root
      const entryURL = name => {
        const entry = Object.values(bundle).find(item => item.type === "chunk" && item.isEntry && item.name === name)
        if(!entry) return this.error(`Missing documentation script entry: ${name}`)
        return `${config.base}${entry.fileName}`
      }
      const siteEntryURL = entryURL("site-entry")
      const documentationURL = entryURL("documentation")
      const [files, sections, codeHighlighter, guideIcons] = await Promise.all([
        filesIn(resolve(root, "docs")), navigation(root), highlighter(), readGuideIcons(root),
      ])
      const emit = (fileName, source) => this.emitFile({type: "asset", fileName, source})
      for(const file of [...files.filter(file => file.endsWith(".md")), resolve(root, "README.md"), resolve(root, "packages.md")]) {
        const path = `/${relative(root, file)}`
        const content = await readFile(file, "utf8")
        for(const {value: library} of libraries) {
          const source = await embedExamples(markdown(content, library), {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, sections, library, highlighter: codeHighlighter, guideIcons, staticBuild: true,
            siteEntryURL, documentationURL})
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
      for(const name of ["documentation.css", ...libraries.map(({icon}) => `icons/${icon}.svg`)]) {
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
