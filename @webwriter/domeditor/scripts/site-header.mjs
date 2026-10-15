import {readFile} from "node:fs/promises"

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
    transformIndexHtml(html, context) {
      return html.replace("<!-- site-header -->", () => renderSiteHeader(context.path))
    },
    async generateBundle() {
      this.emitFile({type: "asset", fileName: "assets/site-header.css", source:
        await readFile(new URL("../src/site-header.css", import.meta.url), "utf8")})
    },
  }
}
