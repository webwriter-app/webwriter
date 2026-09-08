// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {stripActiveContent} from "./active-content"
import {sanitizePackageSnippet} from "./packages"

describe("package embeds", () => {
  it("retains PhET's remote iframe in a script sandbox", () => {
    const html = sanitizePackageSnippet('<iframe src="https://phet.colorado.edu/sims/html/neuron/latest/neuron_all.html" title="Neuron"></iframe>')
    expect(html).toBe('<iframe src="https://phet.colorado.edu/sims/html/neuron/latest/neuron_all.html" title="Neuron" sandbox="allow-scripts"></iframe>')
  })

  it("removes inline code and unrestricted sandbox permissions from remote embeds", () => {
    const html = sanitizePackageSnippet('<iframe src="https://example.com/lesson" srcdoc="<script>bad()</script>" onload="bad()" sandbox="allow-scripts allow-same-origin allow-top-navigation"></iframe>')
    expect(html).toBe('<iframe src="https://example.com/lesson" sandbox="allow-scripts"></iframe>')
  })

  it.each(["", "/same-origin", "javascript:alert(1)", "data:text/html,test", "about:blank", "https://user:password@example.com"])("removes unsafe iframe source %s", src => {
    expect(sanitizePackageSnippet(`<iframe src="${src}"></iframe>`)).toBe("")
  })

  it("applies embed isolation inside inert templates as well", () => {
    expect(sanitizePackageSnippet('<template><iframe src="https://example.com/lesson"></iframe></template>'))
      .toBe('<template><iframe src="https://example.com/lesson" sandbox="allow-scripts"></iframe></template>')
  })

  it("keeps the default active-content policy closed to frames", () => {
    const fragment = document.createElement("template")
    fragment.innerHTML = '<iframe src="https://example.com"></iframe><p>Keep</p>'
    stripActiveContent(fragment.content)
    expect(fragment.innerHTML).toBe("<p>Keep</p>")
  })

  it("accepts package examples with embedded media larger than one megabyte", () => {
    const html = `<media-widget data-image="${"a".repeat(1_000_000)}"></media-widget>`
    expect(sanitizePackageSnippet(html)).toBe(html)
  })
})
