import {readFile} from "node:fs/promises"
import exampleDocuments from "../src/example-documents.json" with {type: "json"}

/** Reserve the live showcase's exact layout before its custom element is defined. */
function renderExampleShowcase() {
  return `<div class="example-showcase" inert aria-hidden="true">
      <div class="example-stage">
        <div class="example-frame"><div class="document"></div></div>
        <div class="caption"><a href="/examples/">Explore the examples →</a></div>
      </div>
      <div class="subjects" role="group" aria-label="Example subject">${exampleDocuments.map((example, index) => `<button aria-pressed="${index === 0}">${example.subject}</button>`).join("")}</div>
    </div>`
}

/** Shared by the static pages and the development/production docs renderer. */
export function renderSiteHeader(path = "/") {
  const links = [
    {href: "/examples/", label: "Examples"},
    {href: "/gallery/", label: "Widgets"},
    {href: "/docs/", label: "Documentation"},
    {href: "/editor/", label: "Open WebWriter", editor: true},
  ]
  return `<header class="site-header">
      <a class="brand" href="/" aria-label="WebWriter by Edumix home"><img src="/assets/app-icon.svg" alt="" width="32" height="32"><span class="brand-name">WebWriter<span class="brand-subtitle">by Edumix</span></span></a>
      <nav aria-label="Main navigation">${links.map(({href, label, editor}) => `<a${editor ? ' class="button small"' : ""} href="${href}"${path === href.slice(0, -1) || path.startsWith(href) ? ' aria-current="page"' : ""}>${label}${editor ? ' <span aria-hidden="true">↗</span>' : ""}</a>`).join("")}</nav>
    </header>`
}

export function siteHeaderPlugin() {
  return {
    name: "site-header",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const showcase = html.includes("<!-- example-showcase -->")
        let result = html.replace("<!-- site-header -->", () => renderSiteHeader(context.path))
          .replace("<!-- example-showcase -->", renderExampleShowcase)
        // Vite combines the entry scripts and drops their original attributes.
        // Keep localization ahead of the first paint in the production page too.
        if(showcase && context.bundle) result = result.replace(/<script\b(?=[^>]*\btype="module")[^>]*>/g,
          tag => tag.includes('blocking="render"') ? tag : tag.replace("<script", '<script blocking="render"'))
        return result
      },
    },
    async generateBundle() {
      this.emitFile({type: "asset", fileName: "assets/site-header.css", source:
        await readFile(new URL("../src/site-header.css", import.meta.url), "utf8")})
    },
  }
}
