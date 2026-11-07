import {hasPresentationState} from "../src/presentation-state.js"
import {documentThemes} from "../src/document-themes"
import {boardStyles, canvasStyles, slidesStyles} from "../src/document-layout"
import type {DOMEditor} from "../src/domeditor"

type FrameWindow = Window & {editor?: DOMEditor, editorError?: string}

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const layoutFrame = async () => { await nextFrame(); await nextFrame() }

/** Exercises the legacy widget options contract through the installed-widget
 * runtime, including selection, capture, popover cleanup, and serialization. */
export async function checkLegacyWidgetOptions() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;left:0;top:0;width:1440px;height:500px;border:0;max-width:none;opacity:0;pointer-events:none"
  document.body.append(frame)
  try {
    for(const theme of documentThemes) {
      for(const [width, mode] of [[1440, "document"], [900, "document"], [375, "document"], [900, "canvas"], [900, "slides"], [900, "board"]] as const) {
        frame.style.width = `${width}px`
        const widgetHTML = '<legacy-options-widget><!--keep--><p>Authored widget content</p></legacy-options-widget>'
        const content = mode === "slides" ? `<div class="ww-slides-viewport"><section class="ww-slide">${widgetHTML}</section></div>`
          : mode === "board" ? `<section class="ww-board-column"><h2>Column</h2><article class="ww-board-card">${widgetHTML}</article></section>` : widgetHTML
        const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
        frame.srcdoc = `<!doctype html><style>${theme.source}\n${canvasStyles}\n${slidesStyles}\n${boardStyles}</style><body class="${mode === "document" ? "" : "ww-" + mode}">${content}<p>Selection target</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>`
        await loaded
        const doc = frame.contentDocument!, view = frame.contentWindow as FrameWindow
        for(let attempt = 0; !view.editor && !view.editorError && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
        const editor = view.editor
        assert(editor && !view.editorError, `${theme.value}/${mode}/${width}: editor did not initialize (${view.editorError ?? "timeout"})`)
        if(!editor) throw new Error(`${theme.value}/${mode}/${width}: editor did not initialize`)
        editor.schema.extendWidgets([{tagName: "legacy-options-widget", editingConfig: {content: "flow*"}}])
        editor.features.widget.refresh()
        const widget = doc.querySelector<HTMLElement>("legacy-options-widget")!
        const shadow = widget.attachShadow({mode: "open"})
        shadow.innerHTML = `<style>
          :host {display:block; box-sizing:border-box; width:240px; padding:1rem; border:1px solid #cbd5e1; background:white; font:16px/1.5 system-ui}
          [part~="options"] {padding:.5rem; border:1px solid #cbd5e1; background:#f5f7fa}
          input {box-sizing:border-box; width:100%}
        </style><div part="options controls"><label>Answer<input value="42"></label><button>Reset</button></div><slot></slot>`
        const part = shadow.querySelector<HTMLElement>("[part~='options']")!
        const context = `${theme.value}/${mode}/${width}`
        await layoutFrame()
        assert(widget.getAttribute("contenteditable") === "", `${context}: installed widget was not made editable by runtime`)
        assert(view.getComputedStyle(part).display === "none", `${context}: unselected options are visible`)

        editor.features.selection.selectElement(widget)
        await layoutFrame()
        assert(part.matches(":popover-open") && view.getComputedStyle(part).display !== "none", `${context}: selected widget options did not open`)

        editor.features.selection.captureElement(widget)
        await layoutFrame()
        const bounds = () => ({host: widget.getBoundingClientRect(), options: part.getBoundingClientRect()})
        let {host: widgetBounds, options} = bounds()
        assert(hasPresentationState(widget, "element-capture-selected"), `${context}: capture marker was not set by selection runtime`)
        assert(part.matches(":popover-open") && view.getComputedStyle(part).display !== "none", `${context}: captured options did not open`)
        assert(options.width > 100 && options.height > 0, `${context}: options have no visible geometry`)
        assert(view.getComputedStyle(part).position === "fixed", `${context}: options are not outside widget layout`)
        assert(options.left >= 0 && options.top >= 0 && options.right <= width + 1 && options.bottom <= 500 + 1, `${context}: options escaped the viewport`)
        assert(view.getComputedStyle(part).overflowY === "auto", `${context}: options cannot scroll vertically`)
        assert(view.getComputedStyle(part).backgroundColor === "rgb(255, 255, 255)", `${context}: options lack their editor panel background`)

        const longControls = doc.createElement("div")
        longControls.style.height = "800px"
        longControls.textContent = "Long widget controls"
        part.append(longControls)
        assert(part.scrollHeight > part.clientHeight, `${context}: long controls do not overflow inside the panel`)
        part.scrollTop = 50
        assert(part.scrollTop > 0, `${context}: long controls cannot be scrolled`)

        const other = doc.createElement("legacy-options-widget")
        other.attachShadow({mode:"open"}).innerHTML = '<div part="options">Other widget options</div>'
        widget.after(other)
        const otherPart = other.shadowRoot!.querySelector<HTMLElement>("[part]")!
        editor.features.widget.refresh()
        editor.features.selection.captureElement(other)
        await layoutFrame()
        assert(!part.matches(":popover-open") && view.getComputedStyle(part).display === "none", `${context}: previous options remained open after capture moved`)
        assert(otherPart.matches(":popover-open"), `${context}: newly captured widget options stayed closed`)

        editor.features.selection.selectElement(doc.querySelector("p")!)
        await layoutFrame()
        assert(!otherPart.matches(":popover-open") && view.getComputedStyle(otherPart).display === "none", `${context}: clearing capture left options open`)
        assert(!hasPresentationState(widget, "element-capture-selected") && !hasPresentationState(other, "element-capture-selected"), `${context}: selection markers survived capture cleanup`)

        const serialized = editor.toHTML(true)
        assert(!serialized.includes("◆"), `${context}: selection/editability markers leaked into serialization`)
        assert(!new DOMParser().parseFromString(serialized, "text/html").querySelector('legacy-options-widget[contenteditable]'),
          `${context}: runtime contenteditable leaked into serialization`)
        assert(serialized.includes("<!--keep-->") && serialized.includes("Authored widget content"), `${context}: serialization changed authored widget content`)
        assert(doc.body.innerHTML.includes("<!--keep-->") && doc.body.innerHTML.includes("Authored widget content"), `${context}: selection changed authored content`)
        editor.destroy()
      }
    }
  }
  finally {
    const view = frame.contentWindow as FrameWindow | null
    view?.editor?.destroy()
    frame.remove()
  }
}
