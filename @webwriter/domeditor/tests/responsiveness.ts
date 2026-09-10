import {defaultDocumentTheme} from "../src/document-themes"
import editorStyle from "../src/editor.css?raw"

// Browser measurements complement the stylesheet checks in document-themes.test.ts.
// This fixture deliberately needs no catalog downloads or editor services.
const widgetStyle = `
  :host { display: block; box-sizing: border-box; inline-size: 100%; min-inline-size: 0; max-inline-size: 100%; block-size: auto; container-type: inline-size; }
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

const prose = '<h1 id="heading">Responsive layout</h1><p id="prose">The reading column stays narrow while the widget uses the available width.</p>'
const content = `${prose}<demo-widget></demo-widget><!-- keep this comment -->
  <main><h2>Main content</h2><p>Reading inside a landmark.</p><ul><li>Nested list<ul><li>Keep list structure</li></ul></li></ul><demo-widget></demo-widget></main>
  <section><blockquote>Reading inside a section.</blockquote></section>
  <div id="column" style="inline-size: min(100%, 280px)"><demo-widget></demo-widget></div>
  <unknown-layout><p>Unfamiliar wrapper content</p></unknown-layout>
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
      for(const template of [false, true]) {
        const loaded = new Promise<void>(resolve => frame.onload = () => resolve())
        frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${defaultDocumentTheme.source}</style>${editing ? `<style>${editorStyle}</style>` : ""}</head><body${editing && template ? ' class="◆template-active"' : ""}>${template ? '<demo-widget role="document"></demo-widget>' : content}</body></html>`
        await loaded
        const doc = frame.contentDocument!
        const win = doc.defaultView!
        // Match the editor's slotted body and keep widget internals in shadow DOM.
        if(editing) doc.body.attachShadow({mode: "open"}).append(doc.createElement("slot"))
        for(const widget of doc.querySelectorAll("demo-widget")) {
          const shadow = widget.attachShadow({mode: "open"})
          shadow.innerHTML = `<style>${widgetStyle}</style><div class="layout"><div class="controls"><label>Label <input value="Keep my value"></label></div><div class="work">Work area</div><div class="results">Results</div></div>`
        }
        const original = doc.body.innerHTML
        const firstWidget = doc.querySelector<HTMLElement>("demo-widget")!
        const input = firstWidget.shadowRoot!.querySelector("input")!
        input.value = "Keep this local edit"
        input.focus()
        input.setSelectionRange(1, 4)
        for(const width of [280, 320, 640, 960, 1440, 1920, 2160, 2224, 2560]) {
          const name = `${editing ? "editing" : "standalone"}, ${template ? "template" : "ordinary"}, ${width}px`
          try {
            frame.style.width = `${width}px`
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            const gutter = Math.min(32, Math.max(16, width * .02))
            const available = Math.min(2160, doc.documentElement.clientWidth - 2 * gutter)
            const widget = doc.querySelector<HTMLElement>("demo-widget")!
            const style = win.getComputedStyle(widget)
            const innerWidth = widget.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            closeTo(innerWidth, available, "Widget allocation")
            closeTo(widget.getBoundingClientRect().left + parseFloat(style.paddingLeft), (doc.documentElement.clientWidth - available) / 2, "Centered content")
            if(doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1) throw new Error("Document overflows horizontally")
            for(const host of doc.querySelectorAll<HTMLElement>("demo-widget")) {
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
              closeTo(doc.querySelector("main > demo-widget")!.getBoundingClientRect().width, available, "Landmark widget width")
              closeTo(doc.querySelector("#column > demo-widget")!.getBoundingClientRect().width, Math.min(280, available), "Nested widget width")
              closeTo(doc.querySelector("unknown-layout > p")!.getBoundingClientRect().width, available, "Unfamiliar wrapper width")
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
          override.textContent = ':root { --ww-page-max: 1200px; --ww-prose-max: 35rem; --ww-page-gutter: 24px; } #prose { max-inline-size: 30rem; }'
          doc.head.append(override)
          closeTo(doc.querySelector("demo-widget")!.getBoundingClientRect().width, 1200, "Authored page override")
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
        results.push(`PASS ${editing ? "editing" : "standalone"}, ${template ? "template" : "ordinary"}, enlarged text and tall content`)
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
