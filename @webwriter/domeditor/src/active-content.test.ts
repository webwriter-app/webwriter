// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {applyIframeSandboxPolicy, stripActiveContent} from "./active-content"
import {sanitizePackageSnippet} from "./packages"

describe("package embeds", () => {
  it.each(["dialog", "hgroup"])("unwraps %s in snippets and templates while sanitizing their children", tag => {
    expect(sanitizePackageSnippet(`<${tag}><p onclick="bad()">Keep</p><${tag}><b>Nested</b></${tag}><script>bad()</script></${tag}><template><${tag}><span>Later</span></${tag}></template>`))
      .toBe('<p>Keep</p><b>Nested</b><template><span>Later</span></template>')
  })

  it.each(["dialog", "hgroup"])("preserves existing %s markup when sanitizing a preview", tag => {
    const template = document.createElement("template")
    template.innerHTML = `<${tag}><p>Keep</p></${tag}>`
    stripActiveContent(template.content)
    expect(template.innerHTML).toBe(`<${tag}><p>Keep</p></${tag}>`)
  })

  it("retains PhET's remote iframe with its real origin", () => {
    const html = sanitizePackageSnippet('<iframe src="https://phet.colorado.edu/sims/html/neuron/latest/neuron_all.html" title="Neuron"></iframe>')
    expect(html).toBe('<iframe src="https://phet.colorado.edu/sims/html/neuron/latest/neuron_all.html" title="Neuron" sandbox="allow-scripts allow-same-origin"></iframe>')
  })

  it.each([
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=10",
    "https://esri.github.io/dam-busters/",
    "https://storymaps.arcgis.com/embed/view/example",
  ])("preserves remote origins without provider exceptions: %s", src => {
    expect(sanitizePackageSnippet(`<iframe src="${src}"></iframe>`))
      .toBe(`<iframe src="${src}" sandbox="allow-scripts allow-same-origin"></iframe>`)
  })

  it.each([
    "https://youtube.com/embed/dQw4w9WgXcQ",
    "https://evil.www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/embed/not-a-video-id",
    "https://www.youtube.com:8443/embed/dQw4w9WgXcQ",
  ])("applies the same policy to every remote HTTPS URL: %s", src => {
    expect(sanitizePackageSnippet(`<iframe src="${src}"></iframe>`))
      .toBe(`<iframe src="${src}" sandbox="allow-scripts allow-same-origin"></iframe>`)
  })

  it("rejects credentials and non-HTTPS URLs", () => {
    expect(sanitizePackageSnippet('<iframe src="https://user:pass@www.youtube.com/embed/dQw4w9WgXcQ"></iframe><iframe src="http://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'))
      .toBe("")
  })

  it("removes inline code and unrestricted sandbox permissions from remote embeds", () => {
    const html = sanitizePackageSnippet('<iframe src="https://example.com/lesson" srcdoc="<script>bad()</script>" onload="bad()" sandbox="allow-scripts allow-same-origin allow-top-navigation"></iframe>')
    expect(html).toBe('<iframe src="https://example.com/lesson" sandbox="allow-scripts allow-same-origin"></iframe>')
  })

  it.each(["", "/same-origin", "javascript:alert(1)", "data:text/html,test", "about:blank", "https://user:password@example.com"])("removes unsafe iframe source %s", src => {
    expect(sanitizePackageSnippet(`<iframe src="${src}"></iframe>`)).toBe("")
  })

  it("applies embed isolation inside inert templates as well", () => {
    expect(sanitizePackageSnippet('<template><iframe src="https://example.com/lesson"></iframe></template>'))
      .toBe('<template><iframe src="https://example.com/lesson" sandbox="allow-scripts allow-same-origin"></iframe></template>')
  })

  it.each(["", "allow-scripts", "allow-same-origin", "allow-scripts allow-popups"])("preserves stricter authored sandbox permissions: %s", sandbox => {
    const html = sanitizePackageSnippet(`<iframe src="https://example.com/lesson" sandbox="${sandbox}"></iframe>`)
    expect(html).toBe(`<iframe src="https://example.com/lesson" sandbox="${sandbox.toLowerCase().replace(" allow-popups", "")}"></iframe>`)
  })

  it("keeps application and content origins opaque, including in templates", () => {
    const root = document.createElement("template")
    root.innerHTML = '<iframe src="https://app.example/lesson" sandbox="allow-scripts allow-same-origin"></iframe><template><iframe src="https://editor.example/lesson"></iframe></template><iframe src="https://app.example.evil.test/lesson"></iframe>'
    stripActiveContent(root.content, {allowIframes: true, protectedIframeOrigins: ["https://app.example", "https://editor.example"]})
    expect(root.content.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts")
    expect(root.content.querySelector("template")?.content.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts")
    expect(root.content.querySelector("iframe:last-child")?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin")
  })

  it("applies policy to root frames and local HTML without replacing content or adding artifacts", () => {
    const root = document.createElement("template")
    root.innerHTML = '<custom-lesson><!--keep--><iframe title="Local" src="blob:https://example.com/id" sandbox="allow-scripts allow-same-origin"></iframe><template><iframe srcdoc="<p>Local</p>"></iframe></template></custom-lesson>'
    const frame = root.content.querySelector("iframe")!
    applyIframeSandboxPolicy(frame)
    applyIframeSandboxPolicy(root.content)
    expect(root.content.querySelector("iframe")).toBe(frame)
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
    expect(root.content.querySelector("custom-lesson")?.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    const inline = root.content.querySelector("template")!.content.querySelector("iframe")!
    expect(inline.getAttribute("srcdoc")).toBe("<p>Local</p>")
    expect(inline.getAttribute("sandbox")).toBe("allow-scripts")
    expect(root.innerHTML).not.toContain("◆")
  })

  it("keeps the default active-content policy closed to frames", () => {
    const fragment = document.createElement("template")
    fragment.innerHTML = '<iframe src="https://example.com"></iframe><p>Keep</p>'
    stripActiveContent(fragment.content)
    expect(fragment.innerHTML).toBe("<p>Keep</p>")
  })

  it.each([
    "blob:https://example.com/58b8f420-8b88-4d50-a38d-d4fd8427ddec",
    "data:text/html;charset=utf-8,%3Cp%3ELocal%3C/p%3E",
  ])("retains a local preview iframe in an opaque script sandbox: %s", src => {
    const fragment = document.createElement("template")
    fragment.innerHTML = `<iframe src="${src}" title="Local"></iframe>`

    stripActiveContent(fragment.content, {allowLocalIframes: true})
    expect(fragment.innerHTML).toBe(`<iframe src="${src}" title="Local" sandbox="allow-scripts"></iframe>`)

    stripActiveContent(fragment.content, {allowLocalIframes: true})
    expect(fragment.innerHTML).toBe(`<iframe src="${src}" title="Local" sandbox="allow-scripts"></iframe>`)
  })

  it("keeps local preview iframe exceptions narrow and strips active attributes", () => {
    const fragment = document.createElement("template")
    fragment.innerHTML = '<iframe src="data:text/htmlx,not-html" title="bad"></iframe><iframe src="data:image/svg+xml,%3Csvg/%3E"></iframe><iframe src="javascript:alert(1)"></iframe><iframe src="data:text/html,%3Cp%3ESafe%3C/p%3E" srcdoc="<script>bad()</script>" onload="bad()" sandbox="allow-same-origin allow-top-navigation"></iframe><p href="data:text/html,unsafe" onclick="bad()">Keep</p>'

    stripActiveContent(fragment.content, {allowLocalIframes: true})
    expect(fragment.innerHTML).toBe('<iframe src="data:text/html,%3Cp%3ESafe%3C/p%3E" sandbox=""></iframe><p>Keep</p>')
  })

  it("does not allow an unsandboxed root iframe to retain an unsafe data source", () => {
    const iframe = document.createElement("iframe")
    iframe.setAttribute("src", "data:text/html,%3Cp%3ELocal%3C/p%3E")

    stripActiveContent(iframe, {allowLocalIframes: true})
    expect(iframe.hasAttribute("src")).toBe(false)
    expect(iframe.hasAttribute("sandbox")).toBe(false)
  })

  it("does not enable local iframe URLs under the package embed policy", () => {
    expect(sanitizePackageSnippet('<iframe src="blob:https://example.com/id"></iframe><iframe src="data:text/html,%3Cp%3ELocal%3C/p%3E"></iframe>'))
      .toBe("")
  })

  it("sanitizes the root element attributes while preserving safe unfamiliar namespaced content", () => {
    const parsed = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:ww="urn:example:widget" viewBox="0 0 10 10" onload="run()" href="javascript:run()" style="background:url(javascript:run())"><!--keep--><g onclick="run()"><ww:widget data-safe="yes"><ww:part/></ww:widget><script>run()</script></g></svg>',
      "image/svg+xml",
    )
    const root = parsed.documentElement

    expect(stripActiveContent(root)).toBeGreaterThanOrEqual(5)
    expect(root.getAttribute("viewBox")).toBe("0 0 10 10")
    expect(root.hasAttribute("onload")).toBe(false)
    expect(root.hasAttribute("href")).toBe(false)
    expect(root.hasAttribute("style")).toBe(false)
    expect(root.querySelector("script, [onclick]")).toBeNull()
    const widget = root.querySelector("g")?.firstElementChild
    expect(widget?.localName).toBe("widget")
    expect(widget?.namespaceURI).toBe("urn:example:widget")
    expect(widget?.getAttribute("data-safe")).toBe("yes")
    expect(root.childNodes[0].nodeType).toBe(Node.COMMENT_NODE)
    expect(root.childNodes[0].textContent).toBe("keep")
  })

  it("accepts package examples with embedded media larger than one megabyte", () => {
    const html = `<media-widget data-image="${"a".repeat(1_000_000)}"></media-widget>`
    expect(sanitizePackageSnippet(html)).toBe(html)
  })
})
