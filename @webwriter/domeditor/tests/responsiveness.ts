import {defaultDocumentTheme} from "../src/document-themes"
import editorStyle from "../src/editor.css?raw"
import widgetTemplate from "../../core/model/templates/presets/lit/widgets/webwriter-widget.ts?raw"

// Browser measurements complement the stylesheet checks in document-themes.test.ts.
// This fixture deliberately needs no catalog downloads or editor services.
const widgetStyle = `
  ${widgetTemplate.match(/static styles = css`([\s\S]*?)`/)![1]}
  * { box-sizing: border-box; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
  .layout > * { min-inline-size: 0; padding: 1rem; background: #e0f2fe; overflow-wrap: anywhere; }
  .work { min-block-size: 10rem; background: #cffafe; }
  input { box-sizing: border-box; max-inline-size: 100%; min-inline-size: 0; font: inherit; }
  @container (inline-size >= 48rem) {
    .layout { grid-template-columns: 16rem minmax(0, 1fr); }
    .results { grid-column: 1 / -1; }
  }
  @container (inline-size >= 90rem) {
    .layout { grid-template-columns: 16rem minmax(0, 1fr) 16rem; }
    .results { grid-column: auto; }
  }
`

const prose = '<h1 id="heading">Responsive layout</h1><p id="prose">The default widget matches the reading column. A wide widget opts out of the maximum.</p>'
const wideDocumentStyle = "body > wide-widget, body > main { max-inline-size: unset; }"
const content = `${prose}<demo-widget></demo-widget><wide-widget></wide-widget><!-- keep this comment -->
  <main><h2>Main content</h2><p>Reading inside a landmark.</p><ul><li>Nested list<ul><li>Keep list structure</li></ul></li></ul><demo-widget id="themed"></demo-widget><wide-widget></wide-widget></main>
  <section><blockquote>Reading inside a section.</blockquote></section>
  <div id="column" style="inline-size: min(100%, 280px)"><demo-widget></demo-widget><wide-widget></wide-widget></div>
  <p>An inline widget: <inline-widget></inline-widget></p>
  <unknown-layout style="display: block"><p>Unfamiliar wrapper content</p></unknown-layout>
  <header>Header</header><article><div>Article content</div></article><footer>Footer</footer>
  <inline-widget></inline-widget>
  <svg viewBox="0 0 100 20" width="100"><text y="15">Keep SVG</text></svg>`

const closeTo = (actual: number, expected: number, message: string) => {
  if(Math.abs(actual - expected) > 1) throw new Error(`${message}: ${actual.toFixed(2)} instead of ${expected.toFixed(2)}`)
}

document.querySelector<HTMLButtonElement>("#run")!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement
  const status = document.querySelector("#status")!
  const report = document.querySelector("#report")!
  const stage = document.querySelector("#stage")!
  const results: string[] = []
  let failed = 0
  button.disabled = true
  status.textContent = "Running"
  const frame = document.createElement("iframe")
  frame.title = "Responsive layout fixture"
  stage.replaceChildren(frame)
  try {
    for(const editing of [false, true]) {
      for(const kind of ["ordinary", "wide-ordinary", "template", "wide-template"]) {
        const template = kind.endsWith("template")
        const wideDocument = kind.startsWith("wide-")
        const templateTag = kind === "wide-template" ? "wide-widget" : "demo-widget"
        const loaded = new Promise<void>(resolve => frame.onload = () => resolve())
        frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${defaultDocumentTheme.source}</style>${editing ? `<style>${editorStyle}</style>` : ""}${wideDocument ? `<style>${wideDocumentStyle}</style>` : ""}</head><body${editing && template ? ' class="◆template-active"' : ""}>${template ? `<${templateTag} role="document"></${templateTag}>` : content}</body></html>`
        await loaded
        const doc = frame.contentDocument!
        const win = doc.defaultView!
        // Match the editor's slotted body and keep widget internals in shadow DOM.
        if(editing) doc.body.attachShadow({mode: "open"}).append(doc.createElement("slot"))
        for(const widget of doc.querySelectorAll("demo-widget, wide-widget")) {
          const shadow = widget.attachShadow({mode: "open"})
          const theme = widget.id === "themed" ? defaultDocumentTheme.source : ""
          const optOut = widget.localName === "wide-widget" ? ":host { max-inline-size: unset; }" : ""
          shadow.innerHTML = `<style>${theme}${widgetStyle}${optOut}</style><div class="layout"><div class="controls"><label>Label <input value="Keep my value"></label></div><div class="work">Work area</div><div class="results">Results</div></div>`
        }
        for(const widget of doc.querySelectorAll("inline-widget")) {
          widget.attachShadow({mode: "open"}).append(doc.createTextNode("x"))
        }
        const original = doc.body.innerHTML
        const firstWidget = doc.querySelector<HTMLElement>("demo-widget, wide-widget")!
        const input = firstWidget.shadowRoot!.querySelector("input")!
        input.value = "Keep this local edit"
        input.focus()
        input.setSelectionRange(1, 4)
        for(const width of [280, 320, 640, 960, 1440, 1920, 2160, 2224, 2560]) {
          const name = `${editing ? "editing" : "standalone"}, ${kind}, ${width}px`
          try {
            frame.style.width = `${width}px`
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            const gutter = Math.min(32, Math.max(16, width * .02))
            const available = Math.min(2160, doc.documentElement.clientWidth - 2 * gutter)
            if(doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1) throw new Error("Document overflows horizontally")
            closeTo(doc.body.getBoundingClientRect().left, (doc.documentElement.clientWidth - doc.body.getBoundingClientRect().width) / 2, "Centered body")
            for(const child of doc.body.children) {
              const expectedMax = wideDocument && child.matches("wide-widget, main") ? "none" : "720px"
              if(win.getComputedStyle(child).maxInlineSize !== expectedMax) throw new Error(`Direct child maximum: ${child.localName}`)
              if(win.getComputedStyle(child).display === "block") {
                const bounds = child.getBoundingClientRect()
                closeTo(bounds.left, (doc.documentElement.clientWidth - bounds.width) / 2, `Centered direct child: ${child.localName}`)
              }
            }
            for(const host of doc.querySelectorAll<HTMLElement>("demo-widget, wide-widget")) {
              const parentWidth = host.parentElement!.clientWidth
                - parseFloat(win.getComputedStyle(host.parentElement!).paddingLeft)
                - parseFloat(win.getComputedStyle(host.parentElement!).paddingRight)
              const capped = host.localName !== "wide-widget" || (host.parentElement === doc.body && !wideDocument)
              const expectedWidth = capped ? Math.min(720, parentWidth) : parentWidth
              closeTo(host.getBoundingClientRect().width, expectedWidth, `${host.localName} allocation`)
              if(host.parentElement === doc.body) {
                closeTo(host.getBoundingClientRect().left, (doc.documentElement.clientWidth - expectedWidth) / 2, "Centered widget")
              }
              const layout = host.shadowRoot!.querySelector<HTMLElement>(".layout")!
              if(layout.scrollWidth > layout.clientWidth + 1) throw new Error("Widget internals overflow horizontally")
              const columns = win.getComputedStyle(layout).gridTemplateColumns.split(" ").length
              const hostWidth = layout.clientWidth
              const expectedColumns = hostWidth >= 1440 ? 3 : hostWidth >= 768 ? 2 : 1
              if(columns !== expectedColumns) throw new Error(`Container query columns: ${columns} instead of ${expectedColumns}`)
            }
            if(!template) {
              for(const selector of ["#heading", "#prose", "main > h2", "main > p", "main > ul", "section > blockquote"]) {
                closeTo(doc.querySelector(selector)!.getBoundingClientRect().width, Math.min(720, available), `Reading width ${selector}`)
              }
              closeTo(doc.querySelector("main > demo-widget")!.getBoundingClientRect().width, Math.min(720, available), "Landmark widget width")
              closeTo(doc.querySelector("main")!.getBoundingClientRect().width, wideDocument ? available : Math.min(720, available), "Landmark width")
              closeTo(doc.querySelector("main > wide-widget")!.getBoundingClientRect().width, wideDocument ? available : Math.min(720, available), "Wide landmark widget width")
              closeTo(doc.querySelector("#column > demo-widget")!.getBoundingClientRect().width, Math.min(280, available), "Nested widget width")
              for(const selector of ["unknown-layout > p", "header", "article", "footer"]) {
                closeTo(doc.querySelector(selector)!.getBoundingClientRect().width, Math.min(720, available), `Default child width ${selector}`)
              }
              for(const widget of doc.querySelectorAll("inline-widget")) {
                if(win.getComputedStyle(widget).display !== "inline") throw new Error("Inline widget became a block")
              }
            }
            if(doc.body.innerHTML !== original) throw new Error("Resizing changed authored content")
            if(firstWidget.shadowRoot!.activeElement !== input || input.value !== "Keep this local edit"
              || input.selectionStart !== 1 || input.selectionEnd !== 4) throw new Error("Resizing lost input focus or local state")
            results.push(`PASS ${name}`)
          }
          catch(error) { failed++; results.push(`FAIL ${name}: ${error}`) }
        }
        if(!template) {
          const override = doc.createElement("style")
          override.textContent = ':root { --ww-page-max: 1200px; --ww-prose-max: 35rem; --ww-page-gutter: 24px; } #prose { max-inline-size: 30rem; }' + wideDocumentStyle
          doc.head.append(override)
          closeTo(doc.querySelector("demo-widget")!.getBoundingClientRect().width, 560, "Default widget inherits authored reading token")
          closeTo(doc.querySelector("#themed")!.getBoundingClientRect().width, 560, "Theme in shadow DOM preserves inherited reading token")
          closeTo(doc.querySelector("wide-widget")!.getBoundingClientRect().width, 1200, "Wide widget respects authored page override")
          closeTo(doc.querySelector("#heading")!.getBoundingClientRect().width, 560, "Authored reading token")
          closeTo(doc.querySelector("#prose")!.getBoundingClientRect().width, 480, "Authored prose override")
          results.push(`PASS ${editing ? "editing" : "standalone"}, authored overrides`)
        }
        const largeText = doc.createElement("style")
        largeText.textContent = "html { font-size: 200%; }"
        doc.head.append(largeText)
        frame.style.width = "280px"
        if(doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1) throw new Error("Enlarged text overflows the narrow document")
        const layout = firstWidget.shadowRoot!.querySelector<HTMLElement>(".layout")!
        if(win.getComputedStyle(layout).gridTemplateColumns.split(" ").length !== 1) throw new Error("Enlarged text does not reflow")
        layout.querySelector<HTMLElement>(".work")!.style.minBlockSize = "1200px"
        if(doc.documentElement.scrollHeight <= frame.clientHeight || win.getComputedStyle(doc.documentElement).overflowY === "hidden") {
          throw new Error("Tall widget content is not scrollable")
        }
        results.push(`PASS ${editing ? "editing" : "standalone"}, ${kind}, enlarged text and tall content`)
      }
    }
  }
  catch(error) { failed++; results.push(`FAIL ${error}`) }
  finally {
    report.textContent = results.join("\n")
    status.textContent = `${results.length - failed} passed, ${failed} failed`
    button.disabled = false
  }
}
