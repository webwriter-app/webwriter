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
const keywordReference = "/docs/widgets/reference/keywords.md"
const keywordStyles = new URL("../src/package-keywords.css", import.meta.url)
const guideSprite = "/docs/images/widgets/capability-icons.svg"
const packageIcon = readFileSync(new URL(import.meta.resolve("@tabler/icons/outline/package.svg")), "utf8")
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

function libraryURL(href, path, library, staticBuild = false) {
  const url = new URL(href, `http://docs.local${path}`)
  if(url.origin !== "http://docs.local" || !url.pathname.startsWith("/docs/")
    && !["/README.md", "/packages.md"].includes(url.pathname)) return href
  const examples = "/docs/widgets/examples/"
  const isExample = url.pathname.startsWith(examples)
  const exampleLibrary = isExample && url.searchParams.get("library")
  if(exampleLibrary && libraries.some(({value}) => value === exampleLibrary)) library = exampleLibrary
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

function renderMarkdown(source, {path, library, highlighter, staticBuild, guideIcons, guide, capabilities}) {
  const headingIds = new Set()
  const libraryNotes = new Map()
  const iconRoot = staticBuild ? "/assets/docs" : "/dev-server"
  const libraryNoteLabel = ({icon, label}, id) =>
    `<span class="library-note-label"${id ? ` id="${id}"` : ""}><img src="${iconRoot}/icons/${icon}.svg" alt="" width="16" height="16">${label}</span>`
  const renderHeading = (depth, text, content) => {
    const slug = text.toLowerCase().replace(/<[^>]*>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-") || "section"
    let id = slug
    for(let suffix = 1; headingIds.has(id); suffix++) id = `${slug}-${suffix}`
    headingIds.add(id)
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
  const parser = new Marked({extensions: [{
    name: "codeSnippet",
    renderer({label, snippet}) {
      const caption = this.parser.parseInline(label.tokens)
      const code = this.parser.parse([snippet])
      return `<figure class="code-snippet"><figcaption class="code-snippet-label">${caption}</figcaption>\n${code}</figure>\n`
    },
  }], renderer: {
    code({text, lang}) {
      const language = lang?.split(/\s/)[0] || "text"
      return highlighter.codeToHtml(text, {
        lang: highlighter.getLoadedLanguages().includes(language) ? language : "text",
        theme: "github-light",
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
      const html = Renderer.prototype.link.call(this, {...token, href})
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
    heading({text, tokens, depth}) {
      return renderHeading(depth, text, this.parser.parseInline(tokens))
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

function renderPage({source, path, sections, library, highlighter, guideIcons, capabilities, missing = false, staticBuild = false,
  siteEntryURL = "/src/site-entry.ts", documentationURL = "/dev-server/documentation.js"}) {
  const title = new Marked().lexer(source).find(token => token.type === "heading" && token.depth === 1)?.text ?? "Documentation"
  const titleSuffix = path.startsWith("/docs/widgets/") ? "Widget documentation" : "WebWriter documentation"
  const libraryPage = sections.find(section => section.path === libraryPagePath)
  const quickStartPage = sections.find(section => section.path === quickStart)
  const menuSections = sections.filter(section => section !== libraryPage && section !== quickStartPage)
  const introPages = [libraryPage, {path: home, title: "Widgets"}, quickStartPage].filter(Boolean)
  const pages = [...introPages, ...menuSections.flatMap(section => [section, ...section.groups.flatMap(group => group.pages)])]
  const index = pages.findIndex(page => page.path === path)
  const section = sections.find(section => section.path.endsWith("/index.md")
    && path.startsWith(section.path.slice(0, -"index.md".length)))
  const href = value => escapeHTML(libraryURL(value, path, library, staticBuild))
  const link = (page, id) => {
    const guide = /^\/docs\/widgets\/guides\/([a-z\d-]+)\.md$/.exec(page.path)?.[1]
    const icon = guideIcons.ids.has(guide)
      ? `<svg aria-hidden="true" width="16" height="16"><use href="#${guideIconId(guide)}"></use></svg>`
      : ""
    const current = page.path === path
    const className = icon ? "guide-nav-link" : current && page.path.endsWith("/index.md") ? "nav-index-link" : ""
    return `<a href="${href(page.path)}"${id ? ` id="${id}"` : ""}${className ? ` class="${className}"` : ""}${current ? ' aria-current="page"' : ""}>${icon}${escapeHTML(page.title)}</a>`
  }
  const shortcuts = `<ul${quickStartPage ? ' class="nav-intro-row"' : ""}><li>${link({path: home, title: "Overview"})}</li>${quickStartPage ? `<li>${link(quickStartPage)}</li>` : ""}</ul>`
  let headingCount = 0
  const heading = content => `<div class="nav-heading" style="--nav-heading-index:${headingCount++}">${content}</div>`
  const menu = menuSections.map(section => {
    if(!section.path.endsWith("/index.md")) return link(section)
    const sectionHeading = heading(link(section))
    const groups = section.groups.map(group => {
      const label = group.title ? ` aria-label="${escapeHTML(group.title)}"` : ""
      const list = `<ul${label}>${group.pages.map(page => `<li>${link(page)}</li>`).join("")}</ul>`
      return group.title ? `<div class="nav-subsection">${heading(`<span>${escapeHTML(group.title)}</span>`)}${list}</div>` : list
    }).join("")
    return `<div class="nav-section">${sectionHeading}${groups}</div>`
  }).join("")
  const adjacent = (page, direction) => page ? `<a class="${direction.toLowerCase()}" href="${href(page.path)}"><span>${direction}</span>${escapeHTML(page.title)}</a>` : "<span></span>"
  const breadcrumb = section && section.path !== path
    ? `<nav class="breadcrumb" aria-label="Breadcrumb">${link(section)}</nav>` : ""
  const introNotice = [home, quickStart, libraryPagePath, "/docs/widgets/tutorial/index.md", guideIndex, referenceIndex].includes(path)
    ? '<div class="docs-intro-note" role="note">This documentation is for developers. It is available only in English.</div>' : ""
  const guide = section?.path === guideIndex && path !== guideIndex && !missing
  const {intro, body} = renderMarkdown(source, {path, library, highlighter, staticBuild, guideIcons, guide, capabilities})
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
    <div class="docs-layout site-content">
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
      <div class="page" tabindex="0" role="region" aria-label="Documentation content">
        <details class="mobile-navigation"><summary>Browse documentation</summary><nav aria-label="Mobile documentation">${menu}</nav></details>
        ${intro ? "" : breadcrumb}
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
          const [codeHighlighter, docsNav, guideIcons] = await Promise.all([highlighter(), navigation(root, [home, guideIndex].includes(path)), readGuideIcons(root)])
          source = await embedExamples(source, {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, ...docsNav, library, highlighter: codeHighlighter, guideIcons, missing})
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
      const emit = (fileName, source) => this.emitFile({type: "asset", fileName, source})
      for(const file of [...files.filter(file => file.endsWith(".md")), resolve(root, "README.md"), resolve(root, "packages.md")]) {
        const path = `/${relative(root, file)}`
        const content = await readFile(file, "utf8")
        for(const {value: library} of libraries) {
          const source = await embedExamples(markdown(content, library), {root, path, library, highlighter: codeHighlighter})
          const html = renderPage({source, path, ...docsNav, library, highlighter: codeHighlighter, guideIcons, staticBuild: true,
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
