import {readFile, readdir} from "node:fs/promises"
import {readFileSync} from "node:fs"
import {isAbsolute, relative, resolve} from "node:path"
import {Marked, Renderer} from "marked"
import {parseFragment, serialize, serializeOuter} from "parse5"
import {createHighlighter} from "shiki"
import {renderSiteHeader, renderSiteFooter} from "./site-header.mjs"
import widgetKeywords from "../src/widget-keywords.json" with {type: "json"}

const home = "/docs/widgets/index.md"
const libraryPagePath = "/docs/widgets/introduction/library.md"
const quickStart = "/docs/widgets/introduction/quick-start.md"
const guideIndex = "/docs/widgets/guides/index.md"
const referenceIndex = "/docs/widgets/reference/index.md"
const adapterReference = "/docs/widgets/reference/adapters.md"
const litReference = "/docs/widgets/reference/lit.md"
const sandboxPage = "/docs/widgets/sandbox.md"
const keywordReference = "/docs/widgets/reference/keywords.md"
const keywordStyles = new URL("../src/package-keywords.css", import.meta.url)
const guideSprite = "/docs/images/widgets/capability-icons.svg"
const packageIcon = readFileSync(new URL(import.meta.resolve("@tabler/icons/outline/package.svg")), "utf8")
const maximizeIcon = readFileSync(new URL(import.meta.resolve("@tabler/icons/outline/maximize.svg")), "utf8")
const minimizeIcon = readFileSync(new URL(import.meta.resolve("@tabler/icons/outline/minimize.svg")), "utf8")
const uploadIcon = readFileSync(new URL(import.meta.resolve("@tabler/icons/outline/upload.svg")), "utf8")
const saveIcon = readFileSync(new URL(import.meta.resolve("@tabler/icons/outline/device-floppy.svg")), "utf8")
const guideIconId = name => `widget-guide-icon-${name}`
const guideName = path => /^\/docs\/widgets\/guides\/([\w-]+)\.md$/.exec(path)?.[1]
const guideIcon = (name, icons) => icons.ids.has(name)
  ? `<svg aria-hidden="true" width="16" height="16"><use href="#${guideIconId(name)}"></use></svg>` : ""
const libraries = [
  {value: "vanilla", label: "JS", icon: "javascript"},
  {value: "lit", label: "Lit", icon: "lit"},
  {value: "react", label: "React", icon: "react"},
  {value: "vue", label: "Vue", icon: "vue"},
  {value: "angular", label: "Angular", icon: "angular"},
  {value: "svelte", label: "Svelte", icon: "svelte"},
]
const adapterTitle = library => `C2. @webwriter/${library === "vanilla" ? "widget" : library}`
const sourceExtensions = {react: "jsx", vue: "vue", angular: "ts", svelte: "svelte"}
const sourcePattern = /\.(?:js|mjs|jsx|ts|tsx|vue|svelte)$/
const exampleFallback = "The examples on this page currently use JS."
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character])

const keywordIcons = new Map()
function renderGuideKeywords(path, href) {
  const guide = /^\/docs\/widgets\/guides\/([a-z-]+)\.md$/.exec(path)?.[1]
  if(!Object.hasOwn(widgetKeywords.guides, guide)) return ""
  const badges = widgetKeywords.guides[guide].map(keyword => {
    const {kind, label, file, pattern} = widgetKeywords.badges[keyword]
    if(!keywordIcons.has(file)) {
      const icon = new URL(import.meta.resolve(`@tabler/icons/outline/${file}.svg`))
      keywordIcons.set(file, readFileSync(icon, "utf8"))
    }
    const tag = href ? "a" : "span"
    const link = href ? ` href="${href(keywordReference + (pattern ? "#values-in-keyword-forms" : ""))}" title="${escapeHTML(pattern ?? keyword)}"` : ""
    return `<li><${tag} class="details-keyword" data-kind="${kind}"${link}><span class="details-keyword-icon" aria-hidden="true">${keywordIcons.get(file)}</span><span>${escapeHTML(label)}</span></${tag}></li>`
  })
  return `<ul class="details-keywords guide-keywords" aria-label="Widget keywords">${badges.join("")}</ul>`
}

function markdown(source, library = "lit") {
  const blocks = /^<!-- library:([\w-]+)( optional)? -->\r?\n([\s\S]*?)^<!-- \/library -->$/gm
  // Optional blocks add instructions without declaring a full page variant.
  const variants = [...source.matchAll(blocks)].flatMap(([, variant, optional]) => optional ? [] : [variant])
  const selected = variants.includes(library) ? library : "vanilla"
  const result = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(blocks, (_match, variant, optional, content) => variant === (optional ? library : selected)
      ? `\n\n<!-- library:${variant} -->\n\n${content}\n<!-- /library -->\n\n` : "")
  return variants.length && selected !== library
    ? result.replace(/^(# .+)$/m, `$1\n\n${exampleFallback}`)
    : result
}

async function documentationSource(root, path, library, content) {
  if(path === adapterReference && library === "lit") return readFile(resolve(root, `.${litReference}`), "utf8")
  const source = markdown(content ?? await readFile(resolve(root, `.${path}`), "utf8"), library)
  return path === adapterReference ? source.replace(/^<!-- (?:library:[\w-]+|\/library) -->\r?\n/gm, "") : source
}

function libraryURL(href, path, library, staticBuild = false) {
  const url = new URL(href, `http://docs.local${path}`)
  if(url.origin !== "http://docs.local" || !url.pathname.startsWith("/docs/")
    && !["/README.md", "/packages.md"].includes(url.pathname)) return href
  const examples = "/docs/widgets/examples/"
  const isExample = url.pathname.startsWith(examples)
  const targetLibrary = (isExample || url.pathname === adapterReference) && url.searchParams.get("library")
  if(targetLibrary && libraries.some(({value}) => value === targetLibrary)) library = targetLibrary
  if(library !== "vanilla" && isExample
    && /^(?:0[1-6]-[\w-]+\.js|hello\.js|ww-(?:quiz|ghost-disco)\.js|(?:ghost-disco-)?package\.json|(?:quiz|ghost-disco)(?:-tests\.js|\.html))$/.test(url.pathname.slice(examples.length))) {
    const name = url.pathname.slice(examples.length)
    url.pathname = `${examples}${library}/${sourceExtensions[library] && /^(?:0[1-6]-|hello\.js)/.test(name) ? name.replace(/\.js$/, `.${sourceExtensions[library]}`) : name}`
  }
  if(isExample && sourcePattern.test(url.pathname)) url.searchParams.set("download", "1")
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

function guideOpening(tokens) {
  const [heading, ...blocks] = tokens.filter(token => token.type !== "space")
  if(heading?.type !== "heading" || heading.depth !== 1) return {}
  let lead
  for(const block of blocks) {
    if(block.type !== "paragraph") break
    if(block.tokens.length === 1 && block.tokens[0].type === "image") return {heading, lead, illustration: block}
    if(!lead && block.text !== exampleFallback) lead = block
  }
  return {heading, lead}
}

// Each live example uses ordinary fences for its editor contents, with one shared HTML fence.
function liveExamples(tokens, library) {
  return tokens.flatMap((token, start) => {
    const title = token.type === "html" && /^<!-- live-example: (.+?) -->$/.exec(token.text.trim())?.[1]
    if(!title) return []
    let end = start + 1
    const blocks = []
    for(; tokens[end]?.type === "space" || tokens[end]?.type === "code"; end++) {
      if(tokens[end].type === "code") blocks.push(tokens[end])
    }
    if(tokens[end]?.type !== "html" || tokens[end].text.trim() !== "<!-- /live-example -->") return []
    const html = blocks.find(block => /^html(?: shared)?$/.test(block.lang?.trim()))
    const shared = blocks.flatMap(block => {
      const match = /^js shared(?: ([\w#@./-]+)(?: ([\w./-]+))?)?$/.exec(block.lang?.trim())
      return match ? [{specifier: match[1] ?? "@webwriter/weather-example", path: match[2], source: block.text}] : []
    })
    const setup = blocks.find(block => block.lang?.trim() === "js setup")
    const registration = blocks.find(block => block.lang?.trim() === `js ${library}-registration`)
    const files = blocks.flatMap(block => {
      const match = /^\S+ file (\S+)$/.exec(block.lang?.trim())
      return match ? [{path: match[1], source: block.text}] : []
    })
    const variant = blocks.find(block => block.lang?.trim().split(/\s+/)[1] === library)
    const source = variant ?? blocks.find(block => /^(?:js|javascript)(?: vanilla)?$/.test(block.lang?.trim()))
    if(!source || !html) return []
    const runtime = variant ? library : "vanilla"
    const language = source.lang.trim().split(/\s+/)[0]
    const manifest = blocks.find(block => block.lang?.trim() === "json package")
      ?? starterManifest(html.text, language, runtime, source.text + "\n" + (registration?.text ?? ""), shared)
    return [{start, end, type: "liveExample", title, source, html, shared, setup, registration, manifest, files,
      collaboration: html.lang.trim() === "html shared", runtime, language}]
  })
}

function starterManifest(html, language, runtime, source, shared) {
  const tags = [...new Set(Array.from(html.matchAll(/<([a-z][\w]*-[\w-]+)(?=[\s/>])/g), match => match[1]))]
  const [name = "widget-example"] = tags
  const extension = ({javascript: "js", typescript: "ts"})[language] ?? language
  const output = `./dist/${name}.js`
  const knownVersions = {lit: "^3.3.2", "@webwriter/lit": "^3.0.0", "@lit-labs/signals": "^0.3.0",
    "@webwriter/widget": "^1.0.0", "@webwriter/react": "^1.0.0", "@webwriter/vue": "^1.0.0", "@webwriter/angular": "^1.0.0", "@webwriter/svelte": "^1.0.0",
    react: "^19.3.1", "react-dom": "^19.3.1", vue: "^3.5.44", svelte: "^5.57.2",
    "@angular/compiler": "^22.2.2", "@angular/core": "^22.2.2", "@angular/elements": "^22.2.2",
    "@angular/platform-browser": "^22.2.2", "@angular/common": "^22.2.2", rxjs: "^7.8.2"}
  const packages = new Set(Array.from(source.matchAll(/\b(?:from|import)\s*["'](@[^/"']+\/[^/"']+|[\w-]+)(?:\/[^"']+)?["']/g), match => match[1]))
  if(runtime === "react") packages.add("react")
  if(runtime === "svelte") packages.add("svelte")
  if(runtime === "angular") { packages.add("@angular/common"); packages.add("rxjs") }
  const dependencies = Object.fromEntries([...packages].filter(name => Object.hasOwn(knownVersions, name)).map(name => [name, knownVersions[name]]))
  const sourcePath = `./${name}.${extension === "vue" ? "js" : extension}`
  const entry = Object.keys(dependencies).length || extension !== "js"
    ? {source: sourcePath, default: output} : sourcePath
  const manifest = {
    name: `@example/${name}`,
    version: "1.0.0",
    keywords: ["webwriter-widget"],
    exports: Object.fromEntries(tags.map(tag => [`./widgets/${tag}.js`, entry])),
  }
  if(Object.keys(dependencies).length) manifest.dependencies = dependencies
  const imports = shared.filter(({path, specifier}) => path && specifier.startsWith("#"))
  if(imports.length) manifest.imports = Object.fromEntries(imports.map(({specifier, path}) => [specifier, `./${path}`]))
  return {type: "code", lang: "json", text: JSON.stringify(manifest, null, 2)}
}

function packageFences(source) {
  return new Marked().lexer(source).filter(block => block.type === "code" && block.lang?.trim() === "json package")
}

function mergeManifest(manifest, patch) {
  const entries = []
  for(const [name, value] of Object.entries(patch)) {
    const current = Object.hasOwn(manifest, name) ? manifest[name] : undefined
    const merged = value && typeof value === "object" && !Array.isArray(value)
      && current && typeof current === "object" && !Array.isArray(current) ? mergeManifest(current, value) : value
    entries.push([name, merged])
  }
  return {...manifest, ...Object.fromEntries(entries)}
}

async function includeLiveExamples(source, options) {
  const {root, path} = options
  const links = /^<!-- live-example-link: (\S+) -->$/gm
  const linked = await Promise.all([...source.matchAll(links)].map(async ([, href]) => {
    const url = new URL(href, `http://docs.local${path}`)
    if(url.origin !== "http://docs.local" || !/^\/docs\/widgets\/(?:guides|tutorial)\/.+\.md$/.test(url.pathname)) {
      throw new Error("Invalid linked interactive example")
    }
    const linkedSource = await readFile(resolve(root, `.${url.pathname}`), "utf8")
    const example = /^<!-- live-example: .+? -->\r?\n[\s\S]*?^<!-- \/live-example -->$/m.exec(linkedSource)?.[0] ?? ""
    return includeLiveSources(example, {...options, path: url.pathname})
  }))
  let linkIndex = 0
  return includeLiveSources(source.replace(links, () => linked[linkIndex++]), options)
}

async function includeLiveSources(source, {root, path, library}) {
  const packageLinks = /^<!-- live-package: ([^\r\n]+?) -->$/gm
  const manifests = await Promise.all([...source.matchAll(packageLinks)].map(async ([, paths]) => {
    const parts = await Promise.all(paths.split(/\s+/).map(async href => {
      const url = new URL(href === "." ? path : href, `http://docs.local${path}`)
      if(url.origin !== "http://docs.local" || !/^\/docs\/widgets\/(?:examples\/[\w/-]+\.json|(?:tutorial|introduction)\/[\w-]+\.md)$/.test(url.pathname)) {
        throw new Error("Invalid live example package source")
      }
      if(url.pathname.endsWith(".json")) {
        const variant = new URL(libraryURL(url.pathname, path, library), url)
        return [JSON.parse(await readFile(resolve(root, `.${variant.pathname}`), "utf8"))]
      }
      const content = url.pathname === path ? source : markdown(await readFile(resolve(root, `.${url.pathname}`), "utf8"), library)
      return packageFences(content).map(block => JSON.parse(block.text))
    }))
    const manifest = parts.flat().reduce(mergeManifest, {})
    return `~~~json package\n${JSON.stringify(manifest, null, 2)}\n~~~`
  }))
  let packageIndex = 0
  source = source.replace(packageLinks, () => manifests[packageIndex++])
  source = source.replace(/^<!-- live-build-files -->$/gm, () => new Marked().lexer(source)
    .filter(block => block.type === "code" && /^(?:js|json) file [\w.-]+$/.test(block.lang?.trim()))
    .map(block => block.raw.trimEnd()).join("\n\n"))
  const fileLinks = /^<!-- live-file: ([\w-]+) ([\w./-]+) (\S+) -->$/gm
  const files = await Promise.all([...source.matchAll(fileLinks)].map(async ([, variant, name, href]) => {
    if(variant !== "all" && variant !== library) return ""
    const url = new URL(libraryURL(href, path, library), `http://docs.local${path}`)
    if(url.origin !== "http://docs.local" || !/^\/docs\/widgets\/examples\/[\w/.-]+$/.test(url.pathname)) throw new Error("Invalid live example file")
    const content = await readFile(resolve(root, `.${url.pathname}`), "utf8")
    return `~~~${name.split(".").at(-1)} file ${name}\n${content.trimEnd()}\n~~~`
  }))
  let fileIndex = 0
  source = source.replace(fileLinks, () => files[fileIndex++])
  const pattern = /^<!-- live-source: ([\w-]+) (\S+) -->$/gm
  const includes = await Promise.all([...source.matchAll(pattern)].map(async ([, variant, href]) => {
    const shared = variant.startsWith("shared-")
    if(!shared && variant !== library && variant !== `${library}-registration`) return ""
    const url = new URL(href, `http://docs.local${path}`)
    const file = resolve(root, `.${url.pathname}`)
    const within = relative(resolve(root, "docs/widgets/examples"), file)
    if(url.origin !== "http://docs.local" || within.startsWith("..") || isAbsolute(within)
      || !sourcePattern.test(file)) throw new Error("Invalid interactive example source")
    const content = await readFile(file, "utf8")
    const info = shared ? `js shared #${variant.slice("shared-".length)}` : `${file.split(".").at(-1)} ${variant}`
    return `~~~${info}\n${content.trimEnd()}\n~~~`
  }))
  let index = 0
  return source.replace(pattern, () => includes[index++])
}

async function sandboxExamples(root, files) {
  const pages = files ?? await filesIn(resolve(root, "docs"))
  const sources = await Promise.all(pages.filter(file => file.endsWith(".md") && relative(root, file) !== sandboxPage.slice(1))
    .map(async file => ({path: `/${relative(root, file)}`, source: await readFile(file, "utf8")})))
  const examples = sources.filter(({source}) => source.includes("<!-- live-example:"))
  return async library => (await Promise.all(examples.map(async ({path, source}) => {
    const expanded = await includeLiveSources(markdown(source, library), {root, path, library})
    return liveExamples(new Marked().lexer(expanded), library)
  }))).flat()
}

function renderMarkdown(source, {path, library, highlighter, staticBuild, guideIcons, guide, capabilities, sandbox}) {
  const headingIds = new Set()
  const tutorialStep = /^\/docs\/widgets\/tutorial\/(\d+)-[^/]+\.md$/.exec(path)?.[1]
  const subsectionNumbers = []
  let hasPageHeading = false
  const libraryNotes = new Map()
  const tutorialGuideLinks = new Map()
  let liveExampleCount = 0
  const iconRoot = staticBuild ? "/assets/docs" : "/dev-server"
  const libraryNoteLabel = ({icon, label}, id) =>
    `<span class="library-note-label"${id ? ` id="${id}"` : ""}><img src="${iconRoot}/icons/${icon}.svg" alt="" width="16" height="16">${label}</span>`
  const renderHeading = (depth, text, content) => {
    const slug = text.toLowerCase().replace(/<[^>]*>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-") || "section"
    let id = slug
    for(let suffix = 1; headingIds.has(id); suffix++) id = `${slug}-${suffix}`
    headingIds.add(id)
    if(depth === 1 && !hasPageHeading) {
      hasPageHeading = true
      return `<h1 id="${escapeHTML(id)}" class="docs-heading">${content}</h1>\n`
    }
    const title = escapeHTML(nodeText(parseFragment(content)).trim())
    const label = title ? ` aria-label="${title}"` : ""
    const linkLabel = title ? `Copy link to ${title}` : "Copy link to this heading"
    return `<h${depth} id="${escapeHTML(id)}" class="docs-heading"${label}><span class="docs-heading-link-status" role="status"></span><a class="docs-heading-link" href="#${encodeURIComponent(id)}" aria-label="${linkLabel}">#</a>${content}</h${depth}>\n`
  }
  const rewriteHTMLLinks = (text, basePath) => text.replace(/\b(src|href)=(["'])(.*?)\2/g, (match, attribute, quote, href) => {
    if(attribute === "href" && href.startsWith("#")) return match
    const url = libraryURL(href.replaceAll("&amp;", "&"), basePath, library, staticBuild)
    const [asset, icon] = url.split("#")
    const target = attribute === "href" && asset.startsWith(`${guideSprite}?`) && guideIcons.ids.has(icon)
      ? `#${guideIconId(icon)}` : url
    return `${attribute}=${quote}${escapeHTML(target)}${quote}`
  })
  const codeSnippet = (caption, content, attribute = "") =>
    `<figure class="code-snippet"${attribute}><figcaption class="code-snippet-label">${caption}</figcaption>\n${content}</figure>\n`
  const parser = new Marked({extensions: [
    {
      name: "codeSnippet",
      renderer({label, snippet}) {
        const inlineLabel = path.startsWith("/docs/widgets/tutorial/") && snippet.type === "code"
        return codeSnippet(this.parser.parseInline(label.tokens), this.parser.parse([snippet]),
          inlineLabel ? " data-inline-label" : "")
      },
    },
    {
      name: "liveExample",
      renderer({title, source, html, shared, setup, registration, runtime, language, collaboration, manifest, files}) {
        const prefix = `live-example-${++liveExampleCount}`
        const markupTab = (kind, label, active) =>
          `<button type="button" role="tab" id="${prefix}-${kind}-tab" data-live-code-tab="${kind}" aria-controls="${prefix}-${kind}" aria-selected="${active}"${active ? "" : ' tabindex="-1"'}>${label}</button>`
        const markupPanel = (kind, caption, content, active) =>
          codeSnippet(caption, content, ` data-live-${kind} id="${prefix}-${kind}"${active ? "" : " hidden"}`)
        const splitter = (kind, label, controls) =>
          `<div data-live-resize="${kind}" role="separator" aria-label="${label}" aria-controls="${controls}" aria-orientation="horizontal" aria-valuemin="0"></div>`
        const widgetSource = codeSnippet("Widget source", this.parser.parse([source]), ` data-live-source data-language="${escapeHTML(language)}" id="${prefix}-widget-source"`)
        const packageJSON = markupPanel("package", "package.json", this.parser.parse([manifest]), false)
        const documentHTML = markupPanel("html", "Document HTML", this.parser.parse([html]), true)
        const shadowDOM = markupPanel("shadow", "Rendered shadow DOM", '<pre><code></code></pre>\n', false)
        const titleControl = sandbox
          ? `<select data-live-picker aria-label="Example" name="example"><option value="default">${escapeHTML(title)}</option>${sandbox.map(({title}, index) => `<option value="${index}">${escapeHTML(title)}</option>`).join("")}</select>`
          : `<strong data-live-title>${escapeHTML(title)}</strong>`
        const extraCode = ({shared, setup, registration, files}) => shared.map(({specifier, path, source}) =>
          `<code data-live-shared="${escapeHTML(specifier)}"${path ? ` data-save-path="${escapeHTML(path)}"` : ""}>${escapeHTML(source)}</code>`).join("")
          + files.map(({path, source}) => `<code data-live-file="${escapeHTML(path)}">${escapeHTML(source)}</code>`).join("")
          + Object.entries({setup, registration}).filter(([, block]) => block)
            .map(([key, block]) => `<code data-live-${key}>${escapeHTML(block.text)}</code>`).join("")
        const alternatives = sandbox?.map(({source, html, runtime, language, collaboration, manifest, ...extra}, index) =>
          `<template data-live-option="${index}" data-library="${runtime}" data-language="${escapeHTML(language)}"${collaboration ? " data-live-collaboration" : ""}><code data-live-source>${escapeHTML(source.text)}</code><code data-live-html>${escapeHTML(html.text)}</code><template data-live-package>${this.parser.parse([manifest])}</template>${extraCode(extra)}</template>`).join("") ?? ""
        return `<div class="live-example" role="group" aria-label="Live widget example" data-live-library="${runtime}"${collaboration ? " data-live-collaboration" : ""}>
${shared.length || setup || registration || files.length ? `<template data-live-extra>${extraCode({shared, setup, registration, files})}</template>` : ""}
${alternatives}
<div class="live-example-controls" hidden>${titleControl}<div class="live-example-actions">
<button type="button" data-live-reset>Reset</button>
<div class="live-example-file-actions" role="group" aria-label="Widget files">
<button type="button" data-live-upload aria-label="Load widget files from a folder" title="Load widget files from a folder" hidden><span aria-hidden="true">${uploadIcon}</span></button>
<button type="button" data-live-save aria-label="Save widget files" title="Save widget files" hidden><span aria-hidden="true">${saveIcon}</span></button>
</div>
<button type="button" data-live-fullscreen aria-label="View fullscreen" title="View fullscreen" hidden><span aria-hidden="true">${maximizeIcon}${minimizeIcon}</span></button>
</div></div>
<p class="live-example-save-status" data-live-save-status role="status"></p>
<div data-live-workspace>
<div class="widget-source" id="${prefix}-source"><div class="code-snippet-label live-code-tabs" data-live-source-tabs role="tablist" aria-label="Widget files" hidden>${markupTab("widget-source", "Source", true)}${markupTab("package", "package.json", false)}</div>${widgetSource}${packageJSON}</div>
${splitter("source", "Resize widget source", `${prefix}-source`)}
<div class="widget-dom-example"><div class="code-snippet-label live-code-tabs" data-live-code-tabs role="tablist" aria-label="Widget markup" hidden>${markupTab("html", "HTML", true)}${markupTab("shadow", "Shadow DOM", false)}</div>${documentHTML}${shadowDOM}</div>
${splitter("preview", "Resize widget preview", `${prefix}-preview`)}
<figure class="code-snippet widget-preview" id="${prefix}-preview"><figcaption class="code-snippet-label"><span data-live-preview-label>Widget preview</span><span class="live-preview-mode" data-live-participants role="group" aria-label="Preview participants" hidden><button type="button" data-live-layout="single" aria-pressed="true">Single</button><button type="button" data-live-layout="shared" aria-pressed="false">Shared</button></span><span class="live-preview-mode" data-live-modes role="group" aria-label="Preview mode" hidden><button type="button" data-live-mode="editing" aria-pressed="true">Editing</button><button type="button" data-live-mode="reading" aria-pressed="false">Reading</button></span></figcaption><div data-live-preview></div><p class="live-example-status" data-live-status role="status"></p><dialog class="live-example-error" data-live-error popover="manual" aria-labelledby="${prefix}-error-title" aria-describedby="${prefix}-error-text" hidden><div class="live-example-error-header"><strong id="${prefix}-error-title">Preview error</strong><button type="button" data-live-dismiss-error>Dismiss</button></div><p id="${prefix}-error-text" tabindex="0"></p></dialog></figure>
</div>
</div>\n`
      },
    },
  ], renderer: {
    code({text, lang}) {
      const [language = "text", display] = lang?.trim().split(/\s+/) ?? []
      return highlighter.codeToHtml(text, {
        lang: highlighter.getLoadedLanguages().includes(language) ? language : "text",
        theme: "github-light",
        ...(display === "prompt" ? {transformers: [{
          pre(node) { this.addClassToHast(node, "cli-prompt") },
        }]} : {}),
      }) + "\n"
    },
    paragraph(token) {
      const paragraph = Renderer.prototype.paragraph.call(this, token)
      const note = libraryNotes.get(token)
      if(!note) return paragraph
      return `<div class="library-note" data-library="${note.value}" role="note">${libraryNoteLabel(note)}${paragraph}</div>\n`
    },
    blockquote(token) {
      const [marker, ...content] = token.tokens
      if(marker?.type === "paragraph" && marker.text === "[!INFO]") {
        return `<div class="docs-info" role="note">\n${this.parser.parse(content)}</div>\n`
      }
      if(marker?.type === "paragraph" && marker.text === "[!NPM]") {
        const [paragraph, extra] = content.filter(block => block.type !== "space")
        const [link, trailing] = paragraph?.tokens ?? []
        if(!extra && !trailing && paragraph?.type === "paragraph" && link?.type === "link"
          && link.href.startsWith("https://www.npmjs.com/package/")) {
          return `<a class="docs-package-banner" href="${escapeHTML(link.href)}"><span class="docs-package-banner-icon" aria-hidden="true">${packageIcon}</span><span>${this.parser.parseInline(link.tokens)}</span></a>\n`
        }
      }
      return Renderer.prototype.blockquote.call(this, token)
    },
    link(token) {
      const href = libraryURL(token.href, path, library, staticBuild)
      const title = path === referenceIndex && new URL(token.href, `http://docs.local${path}`).pathname === adapterReference
        ? adapterTitle(library) : undefined
      const tokens = title ? [{type: "text", raw: title, text: title}] : token.tokens
      const html = Renderer.prototype.link.call(this, {...token, href, tokens})
      return staticBuild && new URL(href, "http://docs.local").searchParams.get("download") === "1"
        ? html.replace("<a ", '<a download ') : html
    },
    html({text}) {
      if(path === libraryPagePath) {
        const marker = text.trim()
        const value = /^<!-- library-card:([\w-]+) -->$/.exec(marker)?.[1]
        const card = value && libraries.find(library => library.value === value)
        if(card) {
          const id = `library-card-${card.value}`
          return `<section class="library-note" data-library="${card.value}" aria-labelledby="${id}">\n${libraryNoteLabel(card, id)}\n`
        }
        if(marker === "<!-- /library-card -->") return "</section>\n"
      }
      if(capabilities && (path === home && text.trim() === capabilities.markup.trim()
        || path === guideIndex && text.trim() === "<!-- widget-capabilities -->")) {
        return rewriteHTMLLinks(renderCapabilityMap(capabilities, path, library, renderHeading), home)
      }
      return rewriteHTMLLinks(text, path)
    },
    heading(token) {
      const {text, tokens, depth} = token
      let content = this.parser.parseInline(tokens)
      if(tutorialStep && depth > 1) {
        const level = depth - 2
        subsectionNumbers[level] = (subsectionNumbers[level] ?? 0) + 1
        subsectionNumbers.length = level + 1
        content = `${Number(tutorialStep)}.${subsectionNumbers.join(".")} ${content}`
      }
      const heading = renderHeading(depth, text, content)
      const guide = tutorialGuideLinks.get(token)
      if(!guide) return heading
      const href = escapeHTML(libraryURL(guide.href, path, library, staticBuild))
      return `<div class="tutorial-heading">${heading}<a class="tutorial-guide-link" href="${href}">${guideIcon(guide.name, guideIcons)}<span>${escapeHTML(guide.title)}</span></a></div>\n`
    },
  }})
  // Repository Markdown is trusted; keep its authored HTML, including example iframes.
  let note
  const tokens = parser.lexer(source).filter(token => {
    if(token.type === "html") {
      const marker = token.text.trim()
      const libraryMarker = /^<!-- library:([\w-]+) -->$/.exec(marker)
      if(libraryMarker || marker === "<!-- /library -->") {
        note = libraries.find(({value}) => value === libraryMarker?.[1])
        return false
      }
    }
    if(note && token.type === "paragraph") {
      const [first, next] = token.tokens
      // Standalone images and bold code captions already have their own presentation.
      if(next || !["image", "strong"].includes(first?.type)) libraryNotes.set(token, note)
    }
    return true
  })
  // A guide link in its own paragraph directly after a tutorial heading labels that section.
  if(path.startsWith("/docs/widgets/tutorial/")) {
    for(let index = tokens.length - 1; index >= 0; index--) {
      const heading = tokens[index]
      if(heading.type !== "heading") continue
      const linkIndex = tokens[index + 1]?.type === "space" ? index + 2 : index + 1
      const paragraph = tokens[linkIndex]
      if(paragraph?.type !== "paragraph" || paragraph.tokens.length !== 1 || paragraph.tokens[0].type !== "link") continue
      const link = paragraph.tokens[0]
      const url = new URL(link.href, `http://docs.local${path}`)
      const name = guideName(url.pathname)
      if(url.origin !== "http://docs.local" || !name) continue
      const title = nodeText(parseFragment(parser.parseInline(link.text)))
      tutorialGuideLinks.set(heading, {name, href: url.pathname + url.search + url.hash, title})
      tokens.splice(linkIndex, 1)
    }
  }
  for(const example of liveExamples(tokens, library).reverse()) {
    tokens.splice(example.start, example.end - example.start + 1, example)
  }
  // A standalone bold caption can label either a Markdown fence or an embedded script.
  for(let index = tokens.length - 1; index > 0; index--) {
    const snippet = tokens[index]
    if(snippet.type !== "code" && !(snippet.type === "html" && snippet.text.startsWith('<pre class="shiki '))) continue
    const captionIndex = index - (tokens[index - 1].type === "space" ? 2 : 1)
    const caption = tokens[captionIndex]
    if(caption?.type !== "paragraph" || caption.tokens.length !== 1 || caption.tokens[0].type !== "strong") continue
    tokens.splice(captionIndex, index - captionIndex + 1, {type: "codeSnippet", label: caption.tokens[0], snippet})
    index = captionIndex
  }
  if(guide) {
    const {heading, lead, illustration} = guideOpening(tokens)
    if(lead && illustration) {
      const intro = {title: parser.parser([heading]), text: parser.parser([lead]), illustration: parser.parser([illustration])}
      return {intro, body: parser.parser(tokens.filter(token => token !== heading && token !== lead && token !== illustration))}
    }
  }
  return {body: parser.parser(tokens)}
}

function pageLinks(source, path) {
  const links = new Map()
  const parser = new Marked()
  parser.walkTokens(typeof source === "string" ? parser.lexer(source) : source, token => {
    if(token.type !== "link") return
    const url = new URL(token.href, `http://docs.local${path}`)
    if(url.origin === "http://docs.local" && url.pathname.endsWith(".md")) {
      links.set(url.pathname, {path: url.pathname, title: token.text})
    }
  })
  return [...links.values()]
}

function referencePageGroups(source, readPages) {
  const groups = []
  for(const token of new Marked().lexer(source)) {
    if(token.type === "heading" && token.depth === 2) groups.push({title: token.text, tokens: []})
    else groups.at(-1)?.tokens.push(token)
  }
  return groups.map(({title, tokens}) => ({title, pages: readPages(tokens)})).filter(group => group.pages.length)
}

const attribute = (node, name) => node.attrs?.find(attr => attr.name === name)?.value
const nodeText = node => node.nodeName === "#text" ? node.value
  : node.tagName === "img" ? attribute(node, "alt") ?? ""
  : (node.childNodes ?? []).map(nodeText).join("")
const descendants = (node, tag) => (node.childNodes ?? []).flatMap(child =>
  child.tagName === tag ? [child] : descendants(child, tag))
const isCapabilityMap = node => node.tagName === "nav" && attribute(node, "class")?.split(/\s+/).includes("widget-capabilities")

function capabilityGuidePath(anchor) {
  const href = attribute(anchor, "href")
  if(!href) return
  const url = new URL(href, `http://docs.local${home}`)
  if(url.origin === "http://docs.local" && /^\/docs\/widgets\/guides\/[\w-]+\.md$/.test(url.pathname)) return url.pathname
}

function renderCapabilityMap({markup, sources}, path, library, renderHeading) {
  const map = parseFragment(markup).childNodes.find(isCapabilityMap)
  if(path === guideIndex) {
    map.attrs = map.attrs.filter(({name}) => name !== "aria-labelledby")
    map.attrs.push({name: "aria-labelledby", value: "guides"})
  }
  const summaries = new Map(descendants(map, "p").map(paragraph => [attribute(paragraph, "id"), paragraph]))
  const parser = new Marked({renderer: {
    link({tokens}) { return this.parser.parseInline(tokens) },
    image({text}) { return escapeHTML(text) },
    html({text}) { return escapeHTML(text) },
  }})
  for(const anchor of descendants(map, "a")) {
    const guide = capabilityGuidePath(anchor)
    const summary = summaries.get(attribute(anchor, "aria-describedby"))
    const source = sources.get(guide)
    if(source) {
      const {heading, lead} = guideOpening(parser.lexer(markdown(source, library)))
      const label = anchor.childNodes.find(node => node.tagName === "span")
      if(heading && label) label.childNodes = parseFragment(parser.parseInline(heading.text)).childNodes
      if(summary && lead) summary.childNodes = parseFragment(parser.parser([lead])).childNodes[0].childNodes
    }
    const template = descendants(anchor, "template")[0]
    if(template && guide) template.content.childNodes.push(...parseFragment(renderGuideKeywords(guide)).childNodes)
  }
  for(const heading of descendants(map, "h4")) {
    const depth = path === guideIndex ? 2 : 4
    const anchored = parseFragment(renderHeading(depth, nodeText(heading), serialize(heading))).childNodes[0]
    const parent = heading.parentNode
    parent.childNodes[parent.childNodes.indexOf(heading)] = anchored
    anchored.parentNode = parent
  }
  return serializeOuter(map)
}

async function navigation(root, includePreviews = false) {
  const read = async path => markdown(await readFile(resolve(root, `.${path}`), "utf8"))
  const overview = await read(home)
  const map = new Marked().lexer(overview).filter(token => token.type === "html")
    .map(token => ({markup: token.text, node: parseFragment(token.text).childNodes.find(isCapabilityMap)}))
    .find(({node}) => node)
  const guideGroups = map ? descendants(map.node, "ul").map(list => descendants(list, "a").map(capabilityGuidePath).filter(Boolean)) : []
  const guides = Promise.all([...new Set(guideGroups.flat())].map(async path => {
    try { return [path, await readFile(resolve(root, `.${path}`), "utf8")] }
    catch(error) {
      if(error.code !== "ENOENT") throw error
      return [path, ""]
    }
  })).then(entries => new Map(entries))
  const sections = Promise.all(pageLinks(overview, home).map(async section => {
    if(!section.path.endsWith("/index.md")) return {...section, groups: []}
    const source = await read(section.path)
    const readPages = content => pageLinks(content, section.path).filter(page =>
      page.path !== section.path && page.path.startsWith(section.path.slice(0, -"index.md".length)))
    if(section.path === referenceIndex) {
      const groups = referencePageGroups(source, readPages)
      if(groups.length) return {...section, groups}
    }
    const pages = readPages(source)
    if(section.path !== guideIndex || !guideGroups.length) return {...section, groups: [{pages}]}
    const remaining = new Map(pages.map(page => [page.path, page]))
    const parser = new Marked()
    for(const [path, source] of await guides) {
      if(remaining.has(path)) continue
      const {heading} = guideOpening(parser.lexer(markdown(source)))
      if(heading) remaining.set(path, {path, title: heading.text})
    }
    const groups = guideGroups.map(paths => paths.flatMap(path => {
      const page = remaining.get(path)
      if(!page) return []
      remaining.delete(path)
      return [page]
    })).filter(group => group.length).map(pages => ({pages}))
    if(remaining.size) groups.push({pages: [...remaining.values()]})
    return {...section, groups}
  }))
  const [menu, sources] = await Promise.all([sections, guides])
  return {sections: menu, capabilities: includePreviews && map ? {markup: map.markup, sources} : undefined}
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

function renderPage({source, path, sections, library, highlighter, guideIcons, capabilities, sandbox, missing = false, staticBuild = false,
  siteEntryURL = "/src/site-entry.ts", documentationURL = "/dev-server/documentation.js"}) {
  const title = new Marked().lexer(source).find(token => token.type === "heading" && token.depth === 1)?.text ?? "Documentation"
  const titleSuffix = path.startsWith("/docs/widgets/") ? "Widget documentation" : "WebWriter documentation"
  const libraryPage = sections.find(section => section.path === libraryPagePath)
  const quickStartPage = sections.find(section => section.path === quickStart)
  const menuSections = sections.filter(section => section !== libraryPage && section !== quickStartPage)
  const introPages = [libraryPage, {path: home, title: "Widgets"}, quickStartPage].filter(Boolean)
  const pages = [...introPages, ...menuSections.flatMap(section => [section, ...section.groups.flatMap(group => group.pages)])]
  const currentPath = path === litReference ? adapterReference : path
  const index = pages.findIndex(page => page.path === currentPath)
  const activeSection = sections.find(section => section.path.endsWith("/index.md")
    && path.startsWith(section.path.slice(0, -"index.md".length)))
  const href = value => escapeHTML(libraryURL(value, path, library, staticBuild))
  const pageTitle = page => page.path === adapterReference ? adapterTitle(path === litReference ? "lit" : library) : page.title
  const link = (page, id) => {
    const icon = guideIcon(guideName(page.path), guideIcons)
    const current = page.path === currentPath
    const className = icon ? "guide-nav-link" : page.path === sandboxPage ? "nav-shortcut" : current && page.path.endsWith("/index.md") ? "nav-index-link" : ""
    const target = current && path === litReference ? `${page.path}?library=lit` : page.path
    return `<a href="${href(target)}"${id ? ` id="${id}"` : ""}${className ? ` class="${className}"` : ""}${current ? ' aria-current="page"' : ""}>${icon}${escapeHTML(pageTitle(page))}</a>`
  }
  const shortcuts = `<ul${quickStartPage ? ' class="nav-intro-row"' : ""}><li>${link({path: home, title: "Overview"})}</li>${quickStartPage ? `<li>${link(quickStartPage)}</li>` : ""}</ul>`
  let headingCount = 0
  const heading = content => `<div class="nav-heading" style="--nav-heading-index:${headingCount++}">${content}</div>`
  const menu = menuSections.map(section => {
    if(!section.path.endsWith("/index.md")) return link(section)
    const isReference = section.path === referenceIndex
    const sectionHeading = isReference ? "" : heading(link(section))
    const groups = section.groups.map(group => {
      const label = group.title ? ` aria-label="${escapeHTML(group.title)}"` : ""
      const list = `<ul${label}>${group.pages.map(page => `<li>${link(page)}</li>`).join("")}</ul>`
      if(!group.title) return list
      const title = escapeHTML(group.title)
      if(isReference) return `<p>${title}</p>${list}`
      return `<div class="nav-subsection">${heading(`<span>${title}</span>`)}${list}</div>`
    }).join("")
    if(isReference) {
      return `<details class="nav-reference"${section === activeSection && !missing ? " open" : ""}><summary>${escapeHTML(section.title)}</summary><div class="nav-reference-pages"><ul><li>${link({...section, title: "Reference overview"})}</li></ul>${groups}</div></details>`
    }
    return `<div class="nav-section">${sectionHeading}${groups}</div>`
  }).join("")
  const adjacent = (page, direction) => page ? `<a class="${direction.toLowerCase()}" href="${href(page.path)}"><span>${direction}</span>${escapeHTML(pageTitle(page))}</a>` : "<span></span>"
  const breadcrumb = activeSection && activeSection.path !== path
    ? `<nav class="breadcrumb" aria-label="Breadcrumb">${link(activeSection)}</nav>` : ""
  const iconRoot = staticBuild ? "/assets/docs" : "/dev-server"
  const activeAdapter = path === litReference ? "lit" : library
  const adapterNavigation = currentPath === adapterReference && !missing
    ? `<nav class="adapter-navigation" aria-label="Widget tooling by library">${libraries
      .map(({value, label, icon}) => `<a href="${href(`${adapterReference}?library=${value}`)}"${value === activeAdapter ? ' aria-current="page"' : ""}><img src="${iconRoot}/icons/${icon}.svg" alt="" width="16" height="16">${label}</a>`).join("")}</nav>`
    : ""
  const introNotice = [home, quickStart, libraryPagePath, "/docs/widgets/tutorial/index.md", guideIndex, referenceIndex].includes(path)
    ? '<div class="docs-intro-note" role="note">This documentation is for developers. It is available only in English.</div>' : ""
  const guide = activeSection?.path === guideIndex && path !== guideIndex && !missing
  const {intro, body} = renderMarkdown(source, {path, library, highlighter, staticBuild, guideIcons, guide, capabilities, sandbox})
  const guideIntro = intro
    ? `<header class="guide-intro"><div class="guide-intro-meta">${breadcrumb}${renderGuideKeywords(path, href)}</div><div class="guide-intro-content"><div class="guide-intro-text">${intro.title}${intro.text}</div>${intro.illustration}</div></header>` : ""
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHTML(title)} · ${titleSuffix}</title>
    <link rel="icon" href="/assets/app-icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="${staticBuild ? "/assets/docs" : "/dev-server"}/documentation.css">
    ${guide || capabilities && [home, guideIndex].includes(path) ? `<link rel="stylesheet" href="${staticBuild ? "/assets/docs" : "/src"}/package-keywords.css">` : ""}
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
    <script type="module"${path === libraryPagePath ? ' blocking="render"' : ""} src="${escapeHTML(documentationURL)}"></script>
  </head>
  <body class="site-layout">
    ${guideIcons.markup}
    <a class="skip-link" href="#content">Skip to content</a>
    ${renderSiteHeader("/docs/")}
    <div class="docs-layout site-content" tabindex="0" role="region" aria-label="Documentation content">
      <aside>
        <nav aria-label="Documentation">
          <div class="documentation-controls">
            <form class="library-switch" method="get" action="${href(path)}">
              ${libraryPage ? link(libraryPage, "library-label") : '<label id="library-label" for="library">Library</label>'}
              <select id="library" name="library" aria-labelledby="library-label">
                <button type="button"><selectedcontent></selectedcontent></button>
                ${libraries.map(({value, label, icon}) => `<option value="${value}"${library === value ? " selected" : ""}${staticBuild ? ` data-href="${escapeHTML(libraryURL(path, path, value, true))}"` : ""}><img src="${staticBuild ? "/assets/docs" : "/dev-server"}/icons/${icon}.svg" alt="" width="20" height="20">${label}</option>`).join("\n                ")}
              </select>
              <noscript>${staticBuild ? libraries.map(({value, label}) => `<a href="${escapeHTML(libraryURL(path, path, value, true))}">${label}</a>`).join(" ") : '<button type="submit">Apply</button>'}</noscript>
            </form>
            ${shortcuts}
          </div>
          <div class="documentation-sections" style="--nav-heading-count:${headingCount}">${menu}</div>
        </nav>
      </aside>
      <div class="page">
        <details class="mobile-navigation"><summary>Browse documentation</summary><nav aria-label="Mobile documentation">${menu}</nav></details>
        ${adapterNavigation ? `<div class="adapter-page-meta">${breadcrumb}${adapterNavigation}</div>` : intro ? "" : breadcrumb}
        <main id="content" tabindex="-1">${introNotice}<article${guide ? ' class="widget-guide"' : ""}>${guideIntro}${body}</article></main>
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
        "@codemirror/commands", "@codemirror/lang-html", "@codemirror/lang-javascript", "@codemirror/language", "@codemirror/view",
        "react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "vue/dist/vue.runtime.esm-browser.js",
        "@angular/compiler", "@angular/core", "@angular/elements", "@angular/platform-browser",
        "svelte", "svelte/internal/client", "svelte/internal/disclose-version", "svelte/internal/flags/legacy",
      ], exclude: ["@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js"]}}
    },
    async load(id) {
      // Compile tutorial sources only; document widgets arrive as browser-ready scripts.
      const file = id.split("?")[0]
      if(/[?&](?:raw|url)(?:[=&]|$)/.test(id)) return
      if(file.endsWith(".vue") && /\/docs\/widgets\/examples\/(?:disco\/)?vue\//.test(file)) {
        const {compileVue} = await import("../docs/widgets/examples/vue/compile.mjs")
        return {code: compileVue(await readFile(file, "utf8"), file), map: null}
      }
      if(file.endsWith(".ts") && /\/docs\/widgets\/examples\/(?:disco\/)?angular\//.test(file)) {
        const {transform} = await import("esbuild-wasm")
        return transform(await readFile(file, "utf8"), {
          loader: "ts", sourcefile: file, format: "esm", target: "es2022",
          tsconfigRaw: {compilerOptions: {experimentalDecorators: true, useDefineForClassFields: false}},
        })
      }
      if(!file.endsWith(".svelte") || !/\/docs\/widgets\/examples\/(?:disco\/)?svelte\//.test(file)) return
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
          try { source = await documentationSource(root, path, library) }
          catch(error) {
            if(error.code !== "ENOENT" && error.code !== "EISDIR") throw error
            source = "# Page not found\n\nChoose a page from the navigation or return to the [widget documentation](/docs/)."
            missing = true
          }
          const [codeHighlighter, docsNav, guideIcons, catalog] = await Promise.all([
            highlighter(), navigation(root, [home, guideIndex].includes(path)), readGuideIcons(root), path === sandboxPage && sandboxExamples(root),
          ])
          source = await includeLiveExamples(source, {root, path, library})
          source = await embedExamples(source, {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, ...docsNav, library, highlighter: codeHighlighter, guideIcons, missing,
            sandbox: catalog ? await catalog(library) : undefined})
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
      const [files, docsNav, codeHighlighter, guideIcons] = await Promise.all([
        filesIn(resolve(root, "docs")), navigation(root, true), highlighter(), readGuideIcons(root),
      ])
      const catalog = await sandboxExamples(root, files)
      const emit = (fileName, source) => this.emitFile({type: "asset", fileName, source})
      for(const file of [...files.filter(file => file.endsWith(".md")), resolve(root, "README.md"), resolve(root, "packages.md")]) {
        const path = `/${relative(root, file)}`
        const content = await readFile(file, "utf8")
        for(const {value: library} of libraries) {
          const expanded = await includeLiveExamples(await documentationSource(root, path, library, content), {root, path, library})
          const source = await embedExamples(expanded, {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, ...docsNav, library, highlighter: codeHighlighter, guideIcons, staticBuild: true,
            siteEntryURL, documentationURL, sandbox: path === sandboxPage ? await catalog(library) : undefined})
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
      emit("assets/docs/package-keywords.css", await readFile(keywordStyles))
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
