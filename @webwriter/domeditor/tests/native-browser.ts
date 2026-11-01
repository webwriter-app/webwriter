import {captionEnumerationCSS, defaultCaptionEnumeration} from "../src/caption-enumeration"
import {attributionAttributes} from "../src/attribution.js"
import {graphicShapeSections} from "../src/graphic"
import listMarkerStyleSource from "../src/document-list-markers.css?raw"
type Check = {name: string, error?: string}
import {DOMEditor} from "../src/domeditor"
import {Schema} from "../src/schema"
import type {DomEditor} from "../src/components/dom-editor"
import type {RibbonButton} from "../src/components/ribbon-button"
import {$, caretRect, pathFromNode, cloneWithoutEditorMarkers} from "../src/utility"
import {defaultDocumentTheme, documentThemes, documentWidgetStyleSource} from "../src/document-themes"
import {boardStyles, canvasStyles, slidesStyles} from "../src/document-layout"
import {floatSideFromStyles} from "../src/element-styles"
import {initializeEditorMessage, replayHostDrag, replayHostPointer, executeCompleteEvent, executeFailureEvent, isProofreadingStateChangeMessage, proofreadingStateChangeEvent, selectionChangeEvent, type ProofreadingAction} from "../src/editor-bridge"
import {SharedDOMDoc} from "../src/domdoc"
import {buildTableMap} from "../src/table"
import * as Y from "yjs"
import localFontURL from "temml/dist/Temml.woff2?url"
import {checkMediaAutoplay} from "./media-autoplay"
import {checkBoardMedia} from "./board-media"
import {checkBoardAnchors} from "./board-anchors"
import {checkElementAnchors} from "./element-anchors"
import {checkPopupAnchors} from "./popup-anchors"
import {checkParagraphCut} from "./paragraph-cut"
import {checkHistorySelection} from "./history-selection"
import {checkListClipboard} from "./list-clipboard"
import {checkHeadingClipboard} from "./heading-clipboard"
import {checkParagraphClipboard} from "./paragraph-clipboard"
import {checkListDeletion} from "./list-deletion"
import {checkListEditing} from "./list-editing"
import {checkSoftLineBreak} from "./soft-line-break"
import {checkParagraphStylePresets} from "./paragraph-style-presets"
import {checkParagraphIndent} from "./paragraph-indent"
import {checkGraphicShapeFills} from "./graphic-shape-presets"
import {checkGraphicArrowheads} from "./graphic-arrowheads"
import {checkGraphicPaint} from "./graphic-paint"
import {checkGraphicBounds, checkEmptyGraphicLayout} from "./graphic-bounds"
import {checkGraphicPie} from "./graphic-pie"
import {checkGraphicChord} from "./graphic-chord"
import {checkGraphicArrowPOIs} from "./graphic-arrow-pois"
import {checkGraphicPOIEdges} from "./graphic-poi-edges"
import {checkGraphicCurvedPOIs} from "./graphic-curved-pois"
import {checkGraphicPOIDodge} from "./graphic-poi-dodge"
import {checkGraphicSpeechBubbles} from "./graphic-speech-bubbles"
import {checkGraphicKeyboardDrag} from "./graphic-keyboard-drag"
import {checkGraphicKeyboardHeld} from "./graphic-keyboard-held"
import {checkGraphicTextBox} from "./graphic-text-box"
import {checkGraphicLabels} from "./graphic-labels"
import {checkGraphicLabelResizePerformance} from "./graphic-label-resize-performance"
import {checkGraphicEmptyLabelCaret} from "./graphic-empty-label-caret"
import {checkGraphicText} from "./graphic-text"
import {checkGraphicImage} from "./graphic-image"
import {checkGraphicGrid} from "./graphic-grid"
import {checkKeyboardTabs} from "./keyboard-tabs"
import {checkGraphicBrushes} from "./graphic-brushes"
import {checkGraphicResizeMirror} from "./graphic-resize-mirror"
import {checkGraphicPOIRotation} from "./graphic-poi-rotation"
import {checkLayoutGrid} from "./layout-grid"
import {checkSlideEditing} from "./slide-editing"
import {checkCanvasStartingView} from "./canvas-starting-view"
import {checkSavedDocumentChecker} from "./saved-document-checker"

const checks: Check[] = []
const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const check = async (name: string, run: () => void | Promise<void>) => {
  const filter = new URLSearchParams(location.search).get("filter")
  if(filter && !name.includes(filter)) return
  // History and preview checks can replace the document's live nodes.
  fixture = document.querySelector<HTMLElement>("#fixture")!
  document.querySelector("#status")!.textContent = `Running: ${name}`
  if(new URLSearchParams(location.search).has("run")) await fetch("/__native-progress", {method: "POST", body: name})
  try { await run(); checks.push({name}) }
  catch(error) { checks.push({name, error: String(error)}) }
}
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
let fixture = document.querySelector<HTMLElement>("#fixture")!
const layoutFrame = async () => { await nextFrame(); await nextFrame() }

await check("converted list items support repeated Backspace without clicking", checkListDeletion)
await check("heading clipboard preserves gap headings and joins existing text", checkHeadingClipboard)
await check("paragraph clipboard preserves separate paragraphs at a text caret", checkParagraphClipboard)
await check("list editing splits and indents selected items", checkListEditing)
await check("soft breaks render a new line on the first press and accept native typing", checkSoftLineBreak)
await check("multi-paragraph style presets stay within the selected siblings", checkParagraphStylePresets)
await check("Tab indents paragraphs without moving the centered prose column", checkParagraphIndent)
await check("undo and redo restore and reveal selections in nested scrollers", checkHistorySelection)
await check("SVG shape fills keep overlaps solid and intentional holes open", checkGraphicShapeFills)
await check("canvas starting view frames resize, delete and open without shifting", checkCanvasStartingView)
await check("SVG arrowheads select their connector, fit its outline and resize independently", checkGraphicArrowheads)

await check("SVG stroke colors preserve line placement and selection", checkGraphicPaint)
await check("SVG preset bounding boxes fit their native contours during insertion and editing", checkGraphicBounds)
await check("SVG empty graphic layout stays stable when the first shape is inserted", checkEmptyGraphicLayout)
await check("SVG Pie POI sweeps continuously from small slices to a full circle", checkGraphicPie)
await check("SVG Chord endpoint POIs retain their ellipse through circular edits", checkGraphicChord)
await check("SVG block arrow POIs independently edit shaft and arrowhead dimensions", checkGraphicArrowPOIs)
await check("SVG preset POIs stay on their actual contours through adjustments", checkGraphicPOIEdges)
await check("SVG curved shape POIs follow contours while dragging and undoing", checkGraphicCurvedPOIs)
await check("SVG POIs dodge resize handles at geometric endpoints", checkGraphicPOIDodge)
await check("SVG speech bubbles attach their connector to the edge facing the tip", checkGraphicSpeechBubbles)
await check("SVG rotated POI edits keep unedited geometry fixed on screen", checkGraphicPOIRotation)
await check("shape keyboard drops stay within the captured graphic", checkGraphicKeyboardDrag)
await check("shape keys preview and place at the cursor without Alt", checkGraphicKeyboardHeld)
await check("SVG shape text entry keeps capture and native typing stable", checkGraphicText)
await check("SVG embedded images retain selection while entering their source", checkGraphicImage)
await check("SVG snapping follows the visible grid through viewport changes", checkGraphicGrid)
await check("Tab cycles captured graphic and formula keyboard tabs without changing content", checkKeyboardTabs)
await check("Drawing brush keys are temporary and inserted shapes keep their defaults", checkGraphicBrushes)
await check("Crossing graphic resize edges reflects shapes and preserves fixed anchors", checkGraphicResizeMirror)
await check("SVG shape text boxes fit content and wrap while preserving native editing", checkGraphicTextBox)
await check("SVG shape text labels wrap and shrink within their geometry", checkGraphicLabels)
await check("SVG shape text resize reuses glyph metrics and preserves undo", async()=>{await checkGraphicLabelResizePerformance()})
await check("SVG shape text empty label carets stay centered through rotation and zoom", checkGraphicEmptyLabelCaret)

await check("canvas multiline text keeps partial selections after formatting", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = '<!doctype html><body><p>Before selected text across multiple wrapped lines after</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "multiline fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, paragraph = doc.querySelector("p")!
    assert(editor.setDocumentLayout("canvas", "document"), "multiline fixture did not convert")
    paragraph.style.width = "180px"
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
    await layoutFrame()
    const text = paragraph.firstChild!
    const selectedText = text.textContent!.slice(7, 47)
    doc.getSelection()!.setBaseAndExtent(text, 7, text, 47)
    await layoutFrame()
    for(const size of ["24px", "32px", "18px"]) {
      assert(editor.features.mark.setStyleMark("font-size", size), `font size ${size} was not applied`)
      await layoutFrame()
      assert(doc.getSelection()!.toString() === selectedText, `selection changed after ${size}: ${doc.getSelection()!.toString()}`)
      assert(editor.features.mark.getState().canMark, `font size ${size} lost mark state`)
    }
    for(const backwards of [false, true]) {
      paragraph.innerHTML = "Heading<br><em>Selected line</em><br>After"
      const line = paragraph.querySelector("em")!.firstChild!
      doc.getSelection()!.setBaseAndExtent(line, backwards ? 13 : 0, line, backwards ? 0 : 13)
      await layoutFrame()
      for(const size of ["24px", "32px", "18px"]) {
        assert(editor.features.mark.setStyleMark("font-size", size), `line font size ${size} was not applied`)
        await layoutFrame()
        assert(doc.getSelection()!.toString() === "Selected line", "formatting changed the selected line")
        assert(editor.features.mark.getState().canMark, `line font size ${size} lost mark state`)
        const range = doc.getSelection()!.getRangeAt(0)
        assert(!Array.from(paragraph.querySelectorAll("br")).some(node => range.intersectsNode(node)), "selection acquired an adjacent line break")
      }
      paragraph.innerHTML = "Before<br><em>middle</em><br>After"
      const first = paragraph.firstChild!, last = paragraph.lastChild!
      const breaks = Array.from(paragraph.querySelectorAll("br"))
      doc.getSelection()!.setBaseAndExtent(backwards ? last : first, backwards ? 3 : 2,
        backwards ? first : last, backwards ? 2 : 3)
      await layoutFrame()
      const multilineText = doc.getSelection()!.toString()
      assert(editor.features.mark.getState().canMark, "line breaks disabled formatting")
      assert(editor.features.mark.toggleMark("b"), "bold across line breaks was not applied")
      await layoutFrame()
      for(const size of ["24px", "32px"]) {
        assert(editor.features.mark.setStyleMark("font-size", size), `multiline font size ${size} was not applied`)
        await layoutFrame()
        assert(doc.getSelection()!.toString() === multilineText, `formatting changed the multiline selection: ${JSON.stringify(doc.getSelection()!.toString())}`)
        assert(editor.features.mark.getState().canMark, "multiline formatting lost mark state")
        const range = doc.getSelection()!.getRangeAt(0)
        assert(breaks.every(node => range.intersectsNode(node)), "multiline selection lost its line breaks")
      }
      assert(editor.features.mark.toggleMark("b"), "bold across line breaks was not removed")
      assert(editor.features.mark.removeMarks(), "multiline formatting was not cleared")
      await layoutFrame()
      assert(doc.getSelection()!.toString() === multilineText && editor.features.mark.getState().canMark,
        "clearing multiline formatting lost the selection")
      assert(paragraph.querySelectorAll("br").length === 2 && breaks.every(node => node.isConnected), "formatting replaced line breaks")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("editing suppresses native autoplay while preserving attributes and explicit playback", checkMediaAutoplay)
await check("saved document issue checker loads without reloading the editor", checkSavedDocumentChecker)
await check("Board media shrinks with card height in editing and standalone documents", checkBoardMedia)
await check("Board controls and transform frames follow CSS anchors through layout changes", checkBoardAnchors)
await check("Element controls follow native CSS anchors through scrolling and DOM changes", checkElementAnchors)
await check("Ribbon menus and combobox popups follow anchors through viewport changes", checkPopupAnchors)

await check("legacy widget options use document gutters and sit beside freeform widgets", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "height: 500px; max-width: none"
  document.body.append(frame)
  try {
    for(const theme of documentThemes) {
      for(const [width, mode] of [[1440, "document"], [900, "document"], [375, "document"], [900, "canvas"], [900, "slides"], [900, "board"]] as const) {
        frame.style.width = `${width}px`
        const widgetHTML = '<legacy-options-widget contenteditable=""><!--keep--><p>Authored widget content</p></legacy-options-widget>'
        const content = mode === "slides" ? `<div class="ww-slides-viewport"><section class="ww-slide">${widgetHTML}</section></div>`
          : mode === "board" ? `<section class="ww-board-column"><h2>Column</h2><article class="ww-board-card">${widgetHTML}</article></section>` : widgetHTML
        const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
        frame.srcdoc = `<!doctype html><style>${theme.source}\n${canvasStyles}\n${slidesStyles}\n${boardStyles}</style><body class="${mode === "document" ? "" : `ww-${mode}`}">${content}</body>`
        await loaded
        const doc = frame.contentDocument!, view = frame.contentWindow!
        const widget = doc.querySelector<HTMLElement>("legacy-options-widget")!
        const root = widget.attachShadow({mode: "open"})
        root.innerHTML = `<style>
          :host {display: block; box-sizing: border-box; padding: 1rem; border: 1px solid #cbd5e1; background: white; font: 16px/1.5 system-ui}
          :host(:not([contenteditable])) [part] {display: none}
          [part] {padding: .5rem; border: 1px solid #cbd5e1; background: #f5f7fa}
          input {box-sizing: border-box; width: 100%}
        </style><div part="options controls"><label>Answer<input value="42"></label><button>Reset</button></div><slot></slot>`
        if(mode !== "document") widget.style.cssText = "width: 240px; left: 20px; top: 20px"
        const part = root.querySelector<HTMLElement>("[part]")!
        const context = `${theme.value}/${mode}/${width}`
        assert(view.getComputedStyle(part).display === "none", `${context}: unselected options are visible`)
        widget.classList.add("◆element-selected")
        widget.focus()
        assert(view.getComputedStyle(part).display === "none", `${context}: ordinary selection or focus exposed options`)
        widget.classList.add("◆element-capture-selected")
        const authoredHTML = doc.body.innerHTML
        await layoutFrame()
        const bounds = () => ({host: widget.getBoundingClientRect(), options: part.getBoundingClientRect()})
        let {host, options} = bounds()
        assert(options.width > 100 && options.height > 0, `${context}: options disappeared`)
        assert(view.getComputedStyle(part).backgroundColor === "rgb(255, 255, 255)", `${context}: options do not have a white background`)
        assert(view.getComputedStyle(part).overflowY === "auto", `${context}: options cannot scroll vertically`)
        assert(parseFloat(view.getComputedStyle(part).paddingInlineEnd) > parseFloat(view.getComputedStyle(part).paddingInlineStart), `${context}: options lack additional right padding`)
        if(width >= 1200 || mode !== "document") {
          assert(options.left > host.right + 1, `${context}: options are not to the right of the widget`)
          assert(Math.abs(options.top - host.top) <= 2, `${context}: options do not align with the widget top`)
          assert(Math.abs(options.height - host.height) <= 2, `${context}: options do not share the widget height`)
        }
        else {
          assert(view.getComputedStyle(part).position === "static", `${context}: compact options left normal flow`)
          assert(options.right <= host.right + 1, `${context}: compact options overflow the widget`)
        }
        assert(doc.body.innerHTML === authoredHTML, `${context}: layout changed authored content`)
        if(width >= 1200 || mode !== "document") {
          const longControls = doc.createElement("div")
          longControls.style.height = "800px"
          longControls.textContent = "Long widget controls"
          part.append(longControls)
          for(const height of [240, 120]) {
            widget.style.height = `${height}px`
            await layoutFrame()
            ;({host, options} = bounds())
            assert(Math.abs(options.height - host.height) <= 2, `${context}: options did not follow a resized widget`)
            assert(part.scrollHeight > part.clientHeight, `${context}: long controls did not overflow inside the panel`)
            part.scrollTop = 50
            assert(part.scrollTop > 0, `${context}: long controls cannot be scrolled`)
          }
          widget.style.removeProperty("height")
          longControls.remove()
          await layoutFrame()
        }
        if(width >= 1200) {
          const gutterLeft = options.left
          widget.style.width = "360px"
          await layoutFrame()
          ;({host, options} = bounds())
          assert(Math.abs(options.left - gutterLeft) <= 1, `${context}: a narrow widget moved options out of the gutter`)
          assert(options.right <= width, `${context}: gutter options overflow the page`)
          frame.style.width = "375px"
          await layoutFrame()
          assert(view.getComputedStyle(part).position === "static", `${context}: options did not reflow after resizing`)
        }
        const other = doc.createElement("legacy-options-widget")
        other.setAttribute("contenteditable", "")
        other.attachShadow({mode: "open"}).innerHTML = '<div part="options">Other widget options</div>'
        widget.after(other)
        const otherPart = other.shadowRoot!.querySelector<HTMLElement>("[part]")!
        assert(view.getComputedStyle(otherPart).display === "none", `${context}: another widget's options are visible`)
        widget.classList.remove("◆element-capture-selected")
        other.classList.add("◆element-capture-selected")
        assert(view.getComputedStyle(part).display === "none", `${context}: previous widget's options remained visible`)
        assert(view.getComputedStyle(otherPart).display !== "none", `${context}: newly captured options stayed hidden`)
        other.classList.remove("◆element-capture-selected")
        assert(view.getComputedStyle(otherPart).display === "none", `${context}: clearing capture left options visible`)
        widget.classList.add("◆element-capture-selected")
        widget.removeAttribute("contenteditable")
        assert(view.getComputedStyle(part).display === "none", `${context}: theme overrode the widget's reader presentation`)
        if(mode === "document" || mode === "board") {
          other.remove()
          widget.setAttribute("contenteditable", "")
          frame.style.width = `${width}px`
          for(const placement of [
            {classes: "ww-float-left", style: "", side: "left"},
            {classes: "ww-float-right", style: "", side: "right"},
            {classes: "", style: "float: left", side: "left"},
            {classes: "", style: "float:right", side: "right"},
            {classes: "ww-float-left", style: "float: right", side: "left"},
            {classes: "ww-float-right", style: "float:left", side: "right"},
          ]) {
            widget.className = `◆element-selected ◆element-capture-selected ${placement.classes}`
            widget.setAttribute("style", placement.style)
            const floatHTML = doc.body.innerHTML
            await layoutFrame()
            ;({host, options} = bounds())
            const side = view.getComputedStyle(widget).float
            assert(side === (width < 600 ? "none" : width < 1200 ? "right" : placement.side), `${context}: unexpected responsive float for ${JSON.stringify(placement)}`)
            if(side === "left") assert(options.left > host.right + 1, `${context}: left-floated options did not open to the right`)
            else if(side === "right") assert(options.right < host.left - 1, `${context}: right-floated options did not open to the left`)
            else assert(view.getComputedStyle(part).position === "static", `${context}: in-flow options did not retain the narrow layout`)
            if(side !== "none") {
              assert(Math.abs(options.height - host.height) <= 2, `${context}: floated options lost their shared height`)
              assert(options.left >= 0 && options.right <= width, `${context}: floated options extend beyond the page`)
            }
            assert(doc.body.innerHTML === floatHTML, `${context}: float options changed authored content`)
            widget.classList.remove("◆element-capture-selected")
            assert(view.getComputedStyle(part).display === "none", `${context}: floated options remained visible after capture ended`)
          }
        }
      }
    }
  }
  finally { frame.remove() }
})

await check("bundled document themes always render light colors", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width: 100%; height: 420px"
  document.body.append(frame)
  try {
    for(const theme of documentThemes) {
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.srcdoc = `<!doctype html><style>${theme.source}</style><h1>Light document</h1><p>Readable text and native controls.</p><input value="Text"><select><option>Option</option></select><details open><summary>Details</summary>Content</details>`
      await loaded
      const doc = frame.contentDocument!, view = frame.contentWindow!
      const appearance = () => [doc.documentElement, doc.body, ...doc.querySelectorAll("h1, input, select, details")]
        .map(element => {
          const style = view.getComputedStyle(element)
          assert(style.colorScheme === "light only", `${theme.value}: ${element.localName} allows a non-light color scheme: ${style.colorScheme}`)
          return [style.color, style.backgroundColor, style.borderColor]
        })
      const light = appearance()
      const background = [doc.body, doc.documentElement].map(element => view.getComputedStyle(element).backgroundColor)
        .find(color => color !== "rgba(0, 0, 0, 0)") ?? ""
      assert(/^rgb\(/.test(background) && background.match(/\d+/g)!.every(channel => Number(channel) >= 240), `${theme.value}: document background is not light: ${background}`)
      doc.documentElement.setAttribute("data-theme", "dark")
      doc.body.classList.add("holiday-css-dark")
      doc.querySelector("details")!.setAttribute("data-theme", "dark")
      assert(JSON.stringify(appearance()) === JSON.stringify(light), `${theme.value}: legacy dark theme attributes changed the palette`)
    }
  }
  finally { frame.remove() }
})

for(const large of [false, true]) await check(large
  ? "standalone live learners receive large initial documents over HTTP and synchronize activity"
  : "standalone live learners open the document without editor controls or an iframe", async () => {
  const {LiveSession, liveSessionHostKey} = await import("../src/live-session")
  const {previewFrameHTML} = await import("../src/frame-document")
  const {pairedLoopbackOrigin} = await import("../src/frame-origins")
  const serverUrl = new URL(location.href).searchParams.get("liveServer")!
  const httpOrigin = new URL(serverUrl.replace(/^ws/, "http")).origin
  const script = `data:text/javascript,${encodeURIComponent(`import {label} from "live-label";
    customElements.define("standalone-live-widget", class extends HTMLElement {
      connectedCallback() {
        this.attachShadow({mode:"open"}).innerHTML = '<style>:host{display:block;width:240px;height:80px}</style><button>' + label + '</button>';
        const button = this.shadowRoot.querySelector('button');
        button.onclick = () => {this.setAttribute('answer','42'); this.dispatchEvent(new Event('input',{bubbles:true}));};
        window.addEventListener('message', event => {
          if(event.source !== window.opener || event.data !== 'report-live-ended') return;
          let attempts = 0;
          const reportEnded = () => {
            const notice = document.body.shadowRoot?.querySelector('.◆live-session-ended');
            if(!notice && ++attempts < 100) {setTimeout(reportEnded, 20); return;}
            window.opener.postMessage({type:'live-learner-ended', text:notice?.textContent,
              visible:!!notice && notice.getBoundingClientRect().height > 0,
              retained:this.isConnected && this.getAttribute('answer') === '42',
              authoredNotice:document.body.innerHTML.includes('Session ended')}, '*');
          };
          reportEnded();
        });
        requestAnimationFrame(async () => {
          const apiBlocked = await fetch(${JSON.stringify(new URL("/api/documents", httpOrigin).href)})
            .then(response => response.status === 403, () => true);
          window.opener.postMessage({type:'live-learner-check', topLevel:window===parent,
            noEditor:!customElements.get('dom-editor') && !document.querySelector('dom-editor,app-ribbon,iframe'),
            apiBlocked, title:document.title, text:button.textContent, width:this.getBoundingClientRect().width}, '*');
          button.click();
        });
      }
    });` + (large ? `\n/*${"x".repeat(9 * 1024 * 1024)}*/` : ""))}`
  const dependencies = {packages: [{name: "live-fixture", version: "1", label: "Live fixture", authors: [], keywords: [], links: {}, scripts: [script], styles: [],
    members: [{id: "widget", packageName: "live-fixture", packageVersion: "1", exportName: "./widget", kind: "widget" as const, label: "Widget", insertable: true, tagName: "standalone-live-widget", scriptUrl: script}]}],
    importMap: {imports: {"live-label": `data:text/javascript,${encodeURIComponent('export const label="Answer the question"')}`}}}
  const token = "standalone-live-token-0123456789"
  const id = `standalone-${crypto.randomUUID()}`
  const source = new DOMParser().parseFromString('<!doctype html><html lang="en"><head><title>Live lesson</title><style>body{margin:24px;font:18px system-ui;background:#f8fafc}article{max-width:640px;margin:auto;padding:24px;background:white}</style></head><body><article><h1>Live lesson</h1><p>Explore the question below.</p><!--keep--><standalone-live-widget></standalone-live-widget></article></body></html>', "text/html")
  const html = previewFrameHTML(source, {...dependencies, standalone: true, bridgeNonce: "", hostOrigin: location.origin,
    frameOrigin: pairedLoopbackOrigin(new URL(httpOrigin))!, entryURL: "", learnerEntryURL: new URL("../src/live-learner-entry.ts", import.meta.url).href, executeScripts: true})
  const publication = await fetch(new URL(`/api/live-sessions/${id}`, httpOrigin), {method: "PUT", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({token, hostKey: liveSessionHostKey(id, token), html})})
  assert(publication.ok, `initial HTTP document publication failed (${publication.status})`)
  const {url: learnerURL} = await publication.json()
  const host = new LiveSession({id, role: "host", serverUrl, token})
  let learnerWindow: Window | null = null
  let receive: ((event: MessageEvent) => void) | undefined
  let receiveEnded: ((event: MessageEvent) => void) | undefined
  let endedTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = performance.now() + 10000
    while(host.status !== "connected" && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert(host.status === "connected", "live host did not connect")
    const origin = new URL(learnerURL).origin
    const report = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("standalone learner did not render")), 10000)
      receive = event => {
        if(event.source !== learnerWindow || event.origin !== origin || event.data?.type !== "live-learner-check") return
        clearTimeout(timeout)
        resolve(event.data)
      }
      window.addEventListener("message", receive)
    })
    learnerWindow = window.open(learnerURL, "live-learner-check")
    assert(learnerWindow, "learner window did not open")
    const result = await report
    assert(result.apiBlocked, "learner content could read application documents")
    assert(result.topLevel && result.noEditor, "learner was wrapped in an editor or iframe")
    assert(result.title === "Live lesson" && result.text === "Answer the question" && result.width === 240, "learner document or widget did not render")
    assert(!host.doc.getMap("live-session-meta").has("baseHTML") && !host.doc.getMap("live-session-meta").has("previewDependencies"), "initial document was sent through Yjs")
    while(!host.states.some(state => state.widgets?.some(widget => widget.html?.includes('answer="42"'))) && performance.now() < deadline + 5000) await new Promise(resolve => setTimeout(resolve, 20))
    assert(host.states.some(state => state.widgets?.some(widget => widget.html?.includes('answer="42"'))), "host did not receive the standalone learner's widget interaction")
    const endedReport = new Promise<Record<string, unknown>>((resolve, reject) => {
      endedTimeout = setTimeout(() => reject(new Error("learner did not show the ended-session message")), 5000)
      receiveEnded = event => {
        if(event.source !== learnerWindow || event.origin !== origin || event.data?.type !== "live-learner-ended") return
        clearTimeout(endedTimeout)
        resolve(event.data)
      }
      window.addEventListener("message", receiveEnded)
    })
    host.stop()
    learnerWindow!.postMessage("report-live-ended", origin)
    const ended = await endedReport
    assert(ended.visible && String(ended.text).includes("Session ended") && String(ended.text).includes("host"), `learner did not see a clear host-stop message: ${JSON.stringify(ended)}`)
    assert(ended.retained && !ended.authoredNotice, "ended-session message changed the authored learner document")
  }
  finally {
    if(receive) window.removeEventListener("message", receive)
    if(receiveEnded) window.removeEventListener("message", receiveEnded)
    clearTimeout(endedTimeout)
    learnerWindow?.close()
    host.destroy()
  }
})

await check("live learners render host widgets with shared dependencies and a fresh preview policy", async () => {
  const {LiveSession} = await import("../src/live-session")
  const {previewFrameHTML} = await import("../src/frame-document")
  const moduleURL = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`
  const script = moduleURL(`import {label} from "live-widget-label";
    customElements.define("live-test-widget", class extends HTMLElement {
      connectedCallback() {
        const root = this.attachShadow({mode: "open"});
        root.innerHTML = '<style>:host {display:block;width:240px;height:80px;background:rgb(240, 248, 255)}</style><button>' + label + '</button>';
      }
    });`)
  const dependencies = {
    packages: [{name: "live-fixture", version: "1", label: "Live fixture", authors: [], keywords: [], links: {}, scripts: [script], styles: [],
      members: [{id: "widget", packageName: "live-fixture", packageVersion: "1", exportName: "./widget", kind: "widget" as const, label: "Widget", insertable: true, tagName: "live-test-widget", scriptUrl: script}]}],
    importMap: {imports: {"live-widget-label": moduleURL('export const label = "Learner widget ready"')}},
  }
  const options = {bridgeNonce: "host-preview-nonce", hostOrigin: location.origin, frameOrigin: location.origin,
    entryURL: new URL("../src/preview-entry.ts", import.meta.url).href, executeScripts: true, ...dependencies}
  const source = new DOMParser().parseFromString('<section><!--keep--><live-test-widget></live-test-widget></section>', "text/html")
  const host = new LiveSession({id: "native-live-widgets", role: "host", baseHTML: previewFrameHTML(source, options), previewDependencies: dependencies})
  const learner = new LiveSession({id: host.id, role: "learner"})
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:640px;height:240px"
  frame.srcdoc = previewFrameHTML(new DOMParser().parseFromString(learner.baseHTML!, "text/html"),
    {...options, bridgeNonce: "learner-preview-nonce", ...learner.previewDependencies!})
  fixture.append(frame)
  try {
    const deadline = performance.now() + 5000
    while(!frame.contentDocument?.querySelector("live-test-widget")?.shadowRoot && performance.now() < deadline) await nextFrame()
    const widget = frame.contentDocument?.querySelector("live-test-widget")
    assert(widget?.shadowRoot?.querySelector("button")?.textContent === "Learner widget ready", "learner widget did not load its module and mapped dependency")
    await layoutFrame()
    assert(widget!.getBoundingClientRect().width === 240 && widget!.getBoundingClientRect().height === 80, "learner widget has no rendered dimensions")
    assert(frame.contentDocument!.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length === 1, "host preview policy still blocks learner scripts")
    assert(frame.contentDocument!.body.innerHTML === source.body.innerHTML, "preview changed the authored widget structure")
  }
  finally { frame.remove(); learner.destroy(); host.destroy() }
})

await check("live learners initialize bundled local widgets without host resources", async () => {
  const {LiveSession} = await import("../src/live-session")
  const {bundleLocalPreviewPackages, previewFrameHTML} = await import("../src/frame-document")
  const {LOCAL_PACKAGE_ROUTE_PREFIX} = await import("../src/local-package-worker")
  const base = `${location.origin}${LOCAL_PACKAGE_ROUTE_PREFIX}live-fixture/`
  const script = `${base}widget.js?revision=1`
  const packages = [{name: "local-fixture", version: "1", label: "Local fixture", authors: [], keywords: [], links: {}, scripts: [script], styles: [],
    members: [{id: "widget", packageName: "local-fixture", packageVersion: "1", exportName: "./widget", kind: "widget" as const, label: "Widget", insertable: true, tagName: "live-local-widget", scriptUrl: script}]}]
  const source = new DOMParser().parseFromString('<section><!--keep--><live-local-widget><p>Authored content</p></live-local-widget></section>', "text/html")
  const bodyHTML = source.body.innerHTML
  const dependencies = await bundleLocalPreviewPackages(source, packages, {imports: {"live-local-label": `${base}label.js`}}, location.href)
  const options = {bridgeNonce: "", hostOrigin: location.origin, frameOrigin: location.origin,
    entryURL: "", standalone: true, executeScripts: true, ...dependencies}
  const host = new LiveSession({id: "native-live-local", role: "host", baseHTML: previewFrameHTML(source, options), previewDependencies: dependencies})
  const learner = new LiveSession({id: host.id, role: "learner"})
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:640px;height:240px"
  frame.srcdoc = previewFrameHTML(new DOMParser().parseFromString(learner.baseHTML!, "text/html"), {...options, ...learner.previewDependencies!})
  fixture.append(frame)
  try {
    const deadline = performance.now() + 5000
    while(!frame.contentDocument?.querySelector("live-local-widget")?.shadowRoot && performance.now() < deadline) await nextFrame()
    const root = frame.contentDocument!
    const widget = root.querySelector("live-local-widget")!
    assert(widget?.shadowRoot?.querySelector("button")?.textContent === "Local learner widget ready", "bundled local custom element did not initialize")
    await layoutFrame()
    const style = frame.contentWindow!.getComputedStyle(widget)
    assert(style.color === "rgb(23, 55, 96)" && style.backgroundImage.includes("data:image/svg+xml"), "imported widget CSS and image were not embedded")
    assert(widget.getBoundingClientRect().width === 240 && widget.getBoundingClientRect().height === 80, "local widget has no rendered dimensions")
    assert(!root.querySelector(`script[src*="${LOCAL_PACKAGE_ROUTE_PREFIX}"], link[href*="${LOCAL_PACKAGE_ROUTE_PREFIX}"]`), "learner still loads host-only widget resources")
    assert(root.body.innerHTML === bodyHTML, "bundling changed the authored DOM")
    assert(packages[0].scripts[0] === script, "bundling replaced the host development runtime")
  }
  finally { frame.remove(); learner.destroy(); host.destroy() }
})

await check("LitElementWw uses native registries and shared data handlers without the adapter", async () => {
  assert(!("createElement" in ShadowRoot.prototype), "test must run before the legacy adapter")
  const runtimeURL = new URL("../../lit/index.js", import.meta.url).href
  const runtime: typeof import("../../lit/index") = await import(/* @vite-ignore */ runtimeURL)
  const {LitElementWw} = runtime
  const {html, css} = await import("lit")
  const {WidgetDataBindings} = await import("../src/widget-data")
  assert(!("option" in runtime) && !("action" in runtime), "decorator exports remain")
  class InternalChild extends HTMLElement {}
  class OtherChild extends HTMLElement {}
  class NativeBaseWidget extends LitElementWw {
    static scopedElements = {"native-base-child": InternalChild}
    static styles = css`native-base-child { display: block; width: 9px; }`
    snapshots: string[] = []
    pending: string[] = []
    failures: string[] = []
    locales: string[] = []
    localize = {getLocale: () => this.lang, setLocale: async (locale: string) => { this.locales.push(locale) }}
    dataChanged(value: string | null) { this.snapshots.push(value ?? "") }
    dataPending(context: import("../../lit/index").WidgetDataContext) { this.pending.push(context.mode) }
    dataError(error: Error) { this.failures.push(error.message) }
    render() { return html`<native-base-child></native-base-child><slot></slot>` }
  }
  class DerivedWidget extends NativeBaseWidget {
    static scopedElements = {"native-base-child": OtherChild}
  }
  customElements.define("native-base-widget", NativeBaseWidget)
  customElements.define("native-derived-widget", DerivedWidget)
  const parent = document.createElement("section")
  parent.lang = "de"
  parent.contentEditable = "true"
  const widget = document.createElement("native-base-widget") as NativeBaseWidget
  widget.id = "native-base-test"
  widget.innerHTML = '<p>Authored<!-- preserved --></p><script type="application/json" slot="data" data-author="keep">{"value":1}</script>'
  const second = document.createElement("native-base-widget") as NativeBaseWidget
  const derived = document.createElement("native-derived-widget") as DerivedWidget
  parent.append(widget, second, derived)
  const docs = new Map<string, Y.Doc>()
  let finishScope!: () => void
  const bindings = new WidgetDataBindings(parent, element => element === widget, {resolve: request => {
    const doc = new Y.Doc()
    docs.set(request.mode, doc)
    return request.mode === "all" ? {doc, ready: new Promise<void>(resolve => { finishScope = resolve })} : {doc}
  }})
  bindings.sync() // Initial snapshot arrives before the widget connects.
  fixture.append(parent)
  try {
    await Promise.all([widget.updateComplete, second.updateComplete, derived.updateComplete])
    assert(widget.shadowRoot!.querySelector("native-base-child") instanceof InternalChild, "native scoped child failed")
    assert(derived.shadowRoot!.querySelector("native-base-child") instanceof OtherChild, "subclass inherited the wrong registry")
    assert(widget.registry === second.registry && widget.registry !== derived.registry, "registry caching crosses concrete classes")
    assert(!customElements.get("native-base-child"), "internal child leaked into global registry")
    assert(getComputedStyle(widget.shadowRoot!.querySelector("native-base-child")!).width === "9px", "native scoped styles failed")
    assert(widget.editable && widget.lang === "de" && !widget.hasAttribute("lang"), "inherited context failed")
    parent.contentEditable = "false"
    parent.lang = "en"
    await layoutFrame()
    assert(!widget.editable && widget.lang === "en" && widget.locales.at(-1) === "en", "inherited context did not update")
    widget.lang = ""
    parent.lang = "fr"
    await layoutFrame()
    assert(widget.lang === "", "explicit empty language did not stop inheritance")
    widget.removeAttribute("lang")
    await layoutFrame()
    assert(widget.lang === "fr", "language inheritance did not resume")
    assert(widget.dataReady && JSON.parse(widget.snapshots.at(-1)!).value === 1, "late connected widget missed initial shared state")
    const block = widget.querySelector("script")!
    widget.data = '{"value":2}'
    bindings.sync()
    await layoutFrame()
    assert(widget.querySelector("script") === block && block.getAttribute("data-author") === "keep", "normal data write replaced its block")
    assert(JSON.parse(widget.snapshots.at(-1)!).value === 2, "accepted local write did not call dataChanged")
    const individual = docs.get("individual")!
    individual.transact(() => (individual.getMap("data").get("value") as Y.Map<unknown>).set("value", 3), "remote")
    await layoutFrame()
    assert(JSON.parse(widget.snapshots.at(-1)!).value === 3, "remote snapshot did not call dataChanged")
    widget.setAttribute("shared", "")
    assert(!widget.dataReady && widget.pending.at(-1) === "all", "scope change did not invalidate readiness")
    let refused = false
    try { widget.data = '{"value":99}' } catch(error) { refused = (error as DOMException).name === "InvalidStateError" }
    assert(refused, "pending data accepted a write")
    finishScope()
    await layoutFrame()
    assert(widget.dataReady && JSON.parse(widget.data!).value === 1, "new scope copied another participant's state")
    assert(widget.querySelector("p")!.innerHTML === "Authored<!-- preserved -->", "widget helper changed authored content")
    parent.remove()
    const count = widget.snapshots.length
    block.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode: "all"}}))
    assert(widget.snapshots.length === count && !widget.dataReady, "disconnected widget retained shared data handlers")
    fixture.append(parent)
    await layoutFrame()
    assert(widget.dataReady && widget.snapshots.length > count, "reconnected widget did not request current data")
  }
  finally { bindings.destroy(); parent.remove(); docs.forEach(doc => doc.destroy()) }
})

await check("Lit documentation examples render and synchronize with LitElementWw", async () => {
  type Quiz = HTMLElement & {updateComplete: Promise<boolean>, dataReady: boolean, editable: boolean, answer: string, resetAnswer(): void}
  const frame = document.createElement("iframe")
  frame.style.cssText = "width: 620px; height: 440px; border: 0"
  fixture.append(frame)
  const load = async (path: string) => {
    const loaded = new Promise<void>(resolve => frame.onload = () => resolve())
    frame.src = path
    await loaded
    const tag = path.includes("hello.html") ? "ww-hello" : "ww-quiz"
    await Promise.race([
      frame.contentWindow!.customElements.whenDefined(tag),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Example did not define ${tag}: ${path}`)), 5000)),
    ])
    if(path.endsWith("step=6")) {
      for(let attempt = 0; attempt < 120; attempt++) {
        if(frame.contentDocument!.querySelectorAll("ww-quiz").length === 2) break
        await nextFrame()
      }
    }
    await layoutFrame()
    return frame.contentDocument!
  }
  try {
    const hello = await load("/docs/widgets/examples/hello.html")
    const greeting = hello.querySelector("ww-hello") as Quiz
    await greeting.updateComplete
    assert(greeting.shadowRoot?.textContent?.includes("Hello,"), "Lit hello example did not render")
    assert("registry" in greeting, "Lit hello example does not use LitElementWw")
    for(let step = 1; step <= 6; step++) {
      const doc = await load(`/docs/widgets/examples/preview.html?step=${step}`)
      const widgets = [...doc.querySelectorAll<Quiz>("ww-quiz")]
      await Promise.all(widgets.map(widget => widget.updateComplete))
      const widget = widgets[0]!
      assert(widget.shadowRoot?.textContent?.includes(step === 1 ? "Quiz widget" : "True"), `Lit step ${step} did not render: ${widget.outerHTML}; shadow=${widget.shadowRoot?.innerHTML}`)
      assert("registry" in widget, `Lit step ${step} does not use LitElementWw`)
      if(step === 1) continue
      const view = frame.contentWindow!
      assert(view.getComputedStyle(widget).backgroundColor === "rgb(255, 255, 255)", `Lit step ${step} lost its styles`)
      assert(widget.scrollWidth <= widget.clientWidth, `Lit step ${step} overflows its preview`)
      if(step < 4) continue
      widget.shadowRoot!.querySelector<HTMLButtonElement>('button[value="false"]')!.click()
      await layoutFrame()
      assert(widget.shadowRoot!.querySelector("output")!.textContent === "Correct!", `Lit step ${step} did not accept the answer`)
      if(step === 6) {
        assert(widgets.length === 2 && widgets.every(widget => widget.dataReady), "Lit collaboration preview did not initialize both participants")
        assert(widgets[1]!.shadowRoot!.querySelector("output")!.textContent === "Correct!", "Lit shared answer did not reach the other participant")
        widgets[1]!.shadowRoot!.querySelector<HTMLButtonElement>('button[value="true"]')!.click()
        await layoutFrame()
        assert(widget.shadowRoot!.querySelector("output")!.textContent === "Try again.", "Lit peer answer did not synchronize back")
      }
      if(step >= 5) {
        widget.answer = "true"
        await widget.updateComplete
        widget.resetAnswer()
        await widget.updateComplete
        assert(widget.getAttribute("answer") === "false", `Lit step ${step} action did not reflect its answer`)
      }
      doc.querySelector("main")!.contentEditable = "true"
      await layoutFrame()
      assert(widget.editable && widget.shadowRoot!.querySelector(".controls")!.hasAttribute("hidden"), `Lit step ${step} ignored inherited editability`)
    }
  }
  finally { frame.remove() }
})

await check("legacy and native scoped registries coexist without replacing browser globals", async () => {
  const globals = {HTMLElement, CustomElementRegistry, customElements}
  const {default: adapter} = await import("../src/scoped-custom-element-registry.js?raw")
  const script = document.createElement("script")
  script.textContent = adapter
  document.head.append(script)
  const attachShadow = Element.prototype.attachShadow
  // Reinstalling must not add another wrapper.
  const again = document.createElement("script")
  again.textContent = adapter
  document.head.append(again)
  assert(Element.prototype.attachShadow === attachShadow, "adapter was installed twice")
  assert(HTMLElement === globals.HTMLElement && CustomElementRegistry === globals.CustomElementRegistry
    && customElements === globals.customElements, "adapter replaced native globals")
  const legacyURL = new URL("./fixtures/legacy-lit.js", import.meta.url).href
  const {LitElement, html, css} = await import("lit")
  const {LitElementWw}: {LitElementWw: typeof LitElement} = await import(/* @vite-ignore */ legacyURL)
  class LegacyChild extends HTMLElement {
    static observedAttributes = ["value"]
    changes: (string | null)[][] = []
    attributeChangedCallback(name: string, old: string | null, value: string | null) { this.changes.push([name, old, value]) }
  }
  class NativeChild extends HTMLElement {}
  class GlobalChild extends HTMLElement {}
  customElements.define("registry-test-child", GlobalChild)
  const registry = new CustomElementRegistry()
  registry.define("registry-test-child", NativeChild)
  class LegacyWidget extends LitElementWw {
    declare registry: CustomElementRegistry
    static scopedElements = {"registry-test-child": LegacyChild}
    static styles = css`registry-test-child { display: block; width: 7px; }`
    render() { return html`<registry-test-child value="one"></registry-test-child><slot></slot>` }
  }
  class NativeWidget extends LitElement {
    static shadowRootOptions = {mode: "open", customElementRegistry: registry} as ShadowRootInit
    createRenderRoot() {
      const root = super.createRenderRoot()
      this.renderOptions.creationScope = {
        importNode: (node, deep) => document.importNode(node, {customElementRegistry: registry, selfOnly: !deep}),
      }
      return root
    }
    render() { return html`<registry-test-child></registry-test-child>` }
  }
  customElements.define("registry-legacy-widget", LegacyWidget)
  customElements.define("registry-native-widget", NativeWidget)
  const legacy = document.createElement("registry-legacy-widget") as InstanceType<typeof LegacyWidget>
  const native = document.createElement("registry-native-widget") as NativeWidget
  legacy.innerHTML = '<p lang="de">Authored content<!-- preserved --></p>'
  const authored = legacy.innerHTML
  fixture.append(legacy, native)
  try {
    await Promise.all([legacy.updateComplete, native.updateComplete])
    assert(legacy.shadowRoot!.querySelector("registry-test-child") instanceof LegacyChild, "old Lit bundle did not use its scoped definition")
    assert(native.shadowRoot!.querySelector("registry-test-child") instanceof NativeChild, "native Lit used the wrong definition")
    assert(document.createElement("registry-test-child") instanceof GlobalChild, "global definition was changed")
    const legacyChild = legacy.shadowRoot!.querySelector("registry-test-child") as LegacyChild
    legacyChild.setAttribute("value", "two")
    assert(JSON.stringify(legacyChild.changes) === JSON.stringify([["value", null, "one"], ["value", "one", "two"]]), "native attribute callbacks were duplicated or lost")
    assert(getComputedStyle(legacyChild).width === "7px", "old Lit styles were not adopted")
    const root = legacy.shadowRoot as ShadowRoot & {
      registry: CustomElementRegistry, customElements: CustomElementRegistry,
      createElement(name: string): Element,
      createElementNS(namespace: string, name: string): Element,
      importNode(node: Node, deep?: boolean): Node,
    }
    assert(root.registry === root.customElements && root.registry === legacy.registry, "legacy registry aliases differ")
    assert(root.createElement("registry-test-child") instanceof LegacyChild, "scoped createElement failed")
    assert(root.createElementNS("http://www.w3.org/2000/svg", "svg").namespaceURI === "http://www.w3.org/2000/svg", "scoped creation changed namespaces")
    const template = document.createElement("template")
    template.innerHTML = '<section><!-- retained --><registry-test-child></registry-test-child><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg><registry-late-child></registry-late-child></section>'
    const deep = root.importNode(template.content, true) as DocumentFragment
    assert(deep.querySelector("registry-test-child") instanceof LegacyChild, "deep template import used the global definition")
    assert(deep.querySelector("section")!.firstChild!.nodeType === Node.COMMENT_NODE, "template comment was lost")
    assert(deep.querySelector("path")!.namespaceURI === "http://www.w3.org/2000/svg", "template import lost SVG namespace")
    const shallow = root.importNode(template.content) as DocumentFragment
    assert(!shallow.childNodes.length, "default import depth changed")
    root.append(deep)
    class LateChild extends HTMLElement {}
    root.registry.define("registry-late-child", LateChild)
    assert(root.querySelector("registry-late-child") instanceof LateChild, "late definitions did not upgrade connected scoped elements")
    const child = root.querySelector("registry-test-child")
    legacy.remove()
    fixture.append(legacy)
    await legacy.updateComplete
    assert(root.querySelector("registry-test-child") === child, "reconnection rebuilt widget content")
    assert(legacy.innerHTML === authored, "adapter changed authored light DOM")
    assert(customElements.get("registry-test-child") === GlobalChild, "legacy scope leaked into the global registry")
    // A saved document must bootstrap compatibility before evaluating an old bundle.
    const {appendSerializedAssets} = await import("../src/serialization")
    const saved = document.implementation.createHTMLDocument()
    saved.body.innerHTML = "<registry-export-widget><p>Saved content</p></registry-export-widget>"
    const moduleURL = URL.createObjectURL(new Blob([`
      import {LitElementWw} from ${JSON.stringify(legacyURL)};
      class SavedWidget extends LitElementWw { render() { return "Legacy saved widget" } }
      customElements.define("registry-export-widget", SavedWidget);
    `], {type: "text/javascript"}))
    const savedFrame = document.createElement("iframe")
    try {
      appendSerializedAssets(saved, [{scripts: [moduleURL], styles: [], members: [{kind: "widget", tagName: "registry-export-widget"}]} as unknown as import("../src/packages").WebWriterPackage])
      const loaded = new Promise<void>(resolve => savedFrame.addEventListener("load", () => resolve(), {once: true}))
      savedFrame.srcdoc = "<!doctype html>" + saved.documentElement.outerHTML
      fixture.append(savedFrame)
      await loaded
      const widget = savedFrame.contentDocument!.querySelector("registry-export-widget")!
      assert(widget.shadowRoot?.textContent?.includes("Legacy saved widget"), "saved export did not initialize an old Lit widget")
      assert(widget.innerHTML === "<p>Saved content</p>", "saved export changed authored widget children")
      assert(!savedFrame.contentDocument!.querySelector('script[src*="scoped-custom-element-registry"]'), "saved export loaded the full legacy polyfill")
    }
    finally { savedFrame.remove(); URL.revokeObjectURL(moduleURL) }

  }
  finally { legacy.remove(); native.remove(); script.remove(); again.remove() }
})

await check("Settings tabs share the heading and embed AI provider cards in Cloud", async () => {
  const {AppRibbon} = await import("../src/components/ribbon")
  const ribbon = new AppRibbon()
  fixture.append(ribbon)
  try {
    await ribbon.updateComplete
    await (ribbon as any).showRibbonDialog("settings")
    const root = ribbon.shadowRoot!
    const dialog = root.querySelector<HTMLDialogElement>("#settings-dialog")!
    const panel = root.querySelector<import("../src/components/settings-panel").SettingsPanel>("settings-panel")!
    await panel.updateComplete
    await layoutFrame()
    const heading = root.querySelector<HTMLElement>("#settings-dialog-title")!.getBoundingClientRect()
    const tabs = root.querySelector<HTMLElement>('[role="tablist"]')!.getBoundingClientRect()
    assert(tabs.left > heading.right && Math.abs((tabs.top + tabs.bottom) / 2 - (heading.top + heading.bottom) / 2) < 1,
      "Settings tabs are not beside the heading")
    assert(root.querySelector(".reset-settings-button")!.textContent === "Reset", "Reset settings was not renamed")
    const version = root.querySelector<HTMLElement>(".settings-version")!
    const licensesLink = root.querySelector<HTMLButtonElement>(".licenses-link")!
    const versionRect = version.getBoundingClientRect(), licensesRect = licensesLink.getBoundingClientRect()
    assert(licensesLink.textContent === "View licenses" && licensesRect.top >= versionRect.bottom
      && Math.abs((versionRect.left + versionRect.right) / 2 - (licensesRect.left + licensesRect.right) / 2) < 1
      && parseFloat(getComputedStyle(licensesLink).fontSize) < parseFloat(getComputedStyle(version).fontSize),
      "View licenses is not smaller and centered beneath the WebWriter version")
    licensesLink.click()
    const licenses = panel.shadowRoot!.querySelector<HTMLDialogElement>("#licenses-dialog")!
    assert(licenses.open, "the header licenses link does not open licenses")
    const licensesClose = licenses.querySelector<HTMLButtonElement>('[aria-label="Close licenses"]')!
    assert(licensesClose.querySelector("svg") && !licensesClose.textContent!.trim(), "licenses Close is not an X icon")
    licensesClose.click()
    assert(!licenses.open && dialog.open, "licenses X does not close only the licenses dialog")
    assert(panel.shadowRoot!.querySelectorAll('[role="tabpanel"]:not([hidden])').length === 1, "multiple settings tabs are visible")
    root.querySelector<HTMLButtonElement>("#settings-tab-cloud")!.click()
    await ribbon.updateComplete
    await panel.updateComplete
    const ai = panel.querySelector("ai-settings-dialog")!
    await ai.updateComplete
    await layoutFrame()
    assert(dialog.open && !ai.shadowRoot!.querySelector("dialog"), "AI settings opened a second modal")
    assert(panel.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="ai"]')!.assignedElements().includes(ai), "AI settings are outside Cloud")
    const cloudSection = panel.shadowRoot!.querySelector<HTMLElement>('[aria-label="Identity and cloud services"]')!
    const aiHeading = ai.shadowRoot!.querySelector<HTMLElement>("#ai-settings-title")!
    assert(aiHeading.getBoundingClientRect().top - cloudSection.getBoundingClientRect().bottom >= 23,
      "AI providers heading lacks vertical whitespace above it")
    const cloudField = panel.shadowRoot!.querySelector<HTMLElement>("#local-username")!
    const localCard = cloudField.closest<HTMLElement>(".cloud-service")!
    const localLabel = localCard.querySelector<HTMLElement>("label")!
    const localName = cloudField.getBoundingClientRect()
    const localText = localLabel.getBoundingClientRect()
    assert(getComputedStyle(localCard).paddingTop === "12px" && getComputedStyle(localCard).borderTopWidth === "1px",
      "Local does not share cloud-card padding and border")
    assert(localName.left > localText.right && Math.abs((localName.top + localName.bottom) / 2 - (localText.top + localText.bottom) / 2) < 1,
      "Local and username are not centered on one line")
    const addLabel = panel.shadowRoot!.querySelector<HTMLElement>(".add-provider-label")!.getBoundingClientRect()
    const addButtons = panel.shadowRoot!.querySelector<HTMLElement>(".provider-types")!.getBoundingClientRect()
    assert(addButtons.left > addLabel.right && Math.abs((addButtons.top + addButtons.bottom) / 2 - (addLabel.top + addLabel.bottom) / 2) < 1,
      "Add a cloud service is not centered beside its button group")
    const aiField = ai.shadowRoot!.querySelector<HTMLElement>("input")!
    assert(getComputedStyle(aiField).fontSize === getComputedStyle(cloudField).fontSize
      && getComputedStyle(aiField).borderTopColor === getComputedStyle(cloudField).borderTopColor,
      "AI and cloud fields use different form styles")
    const card = ai.shadowRoot!.querySelector<HTMLElement>(".content")!
    const content = root.querySelector<HTMLElement>(".settings-dialog-main")!
    assert(card.getBoundingClientRect().width <= content.clientWidth && getComputedStyle(card).overflow === "visible",
      "AI provider card has a nested scroller or overflows Settings")
    dialog.style.width = "min(24rem, calc(100vw - 2rem))"
    await layoutFrame()
    assert(dialog.scrollWidth <= dialog.clientWidth, "Settings controls overflow at narrow widths")
    const {createAIProvider} = await import("../src/ai-provider")
    const longName = "VeryLongProviderName".repeat(12)
    const first = ai.store!.upsert({...createAIProvider("custom"), name: longName, baseUrl: `https://example.org/${"long-path".repeat(30)}`, models: ["very-long-model-name".repeat(30)]})
    ai.store!.upsert({...createAIProvider("custom"), name: "Other provider"})
    await ai.store!.activate(first.id)
    await ai.updateComplete
    await layoutFrame()
    const cards = [...ai.shadowRoot!.querySelectorAll<HTMLDetailsElement>(".provider-card")]
    assert(cards.length === 2 && cards.every(card => !card.open), "provider cards are not collapsed by default")
    cards[0].querySelector<HTMLElement>("summary")!.click()
    await layoutFrame()
    await ai.updateComplete
    const editor = cards[0].querySelector("ai-settings-dialog")!
    await editor.updateComplete
    await layoutFrame()
    assert(editor.shadowRoot!.querySelector("form"), "provider settings are not inside their expandable card")
    assert(cards[0].scrollWidth <= cards[0].clientWidth && dialog.scrollWidth <= dialog.clientWidth,
      "expanded provider card overflows with long names, URLs or model IDs")
    cards[1].querySelector<HTMLInputElement>('input[type="radio"]')!.click()
    await layoutFrame()
    assert(ai.store!.activeProvider?.name === "Other provider" && !cards[1].open, "radio selection toggles the card or does not activate the provider")
    assert(cards[0].open && editor.shadowRoot!.querySelector("form"), "activating another provider discards an expanded card")
    root.querySelector<HTMLButtonElement>("#settings-tab-commands")!.click()
    await ribbon.updateComplete
    await panel.updateComplete
    assert(!panel.shadowRoot!.querySelector<HTMLElement>("#settings-commands")!.hidden
      && panel.shadowRoot!.querySelector<HTMLElement>("#settings-cloud")!.hidden, "Commands tab does not hide Cloud")
    const commandsTab = root.querySelector<HTMLButtonElement>("#settings-tab-commands")!
    const save = panel.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Configure shortcut for Save"]')!
    const {loadAppSettings} = await import("../src/app-settings")
    for(const key of ["9", "Escape", "Backspace", "Delete"]) {
      const originalShortcut = panel.settings.shortcuts["document.save"]
      commandsTab.focus()
      save.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
      save.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, cancelable: true}))
      save.click()
      await panel.updateComplete
      assert(panel.shadowRoot!.activeElement === save, "shortcut recording did not take keyboard focus")
      panel.shadowRoot!.activeElement!.dispatchEvent(new KeyboardEvent("keydown", {
        key, code: key === "9" ? "Digit9" : key, altKey: key === "9", shiftKey: key === "9",
        bubbles: true, composed: true, cancelable: true,
      }))
      await panel.updateComplete
      await ribbon.updateComplete
      const expected = key === "Escape" ? originalShortcut : key === "9" ? "Alt+Shift+9" : ""
      assert(panel.settings.shortcuts["document.save"] === expected
        && loadAppSettings().shortcuts["document.save"] === expected, `shortcut ${key} was not applied and persisted`)
      assert(!save.hasAttribute("data-recording") && dialog.open, `shortcut ${key} left recording active or closed Settings`)
    }
    const closed = new Promise<void>(resolve => dialog.addEventListener("close", () => resolve(), {once: true}))
    dialog.close()
    await closed
    await ribbon.updateComplete
    assert(!ai.isConnected && !ai.open, "closing Settings leaves AI configuration active")
  }
  finally {ribbon.remove()}
})

await check("AI messages use normal padding without template whitespace", async () => {
  const {AppRibbon} = await import("../src/components/ribbon")
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const ribbon = new AppRibbon()
  const toolbox = new DomEditorToolbox()
  toolbox.activeTool = "AI"
  fixture.append(ribbon, toolbox)
  try {
    await Promise.all([ribbon.updateComplete, toolbox.updateComplete])
    ribbon.aiToolboxTarget = toolbox.shadowRoot!.querySelector<HTMLElement>(".ai-toolbox-content")!
    ribbon.aiChatOpen = true
    ribbon.appendAIResponse("A short reply.")
    await ribbon.updateComplete
    await layoutFrame()
    const message = ribbon.aiToolboxTarget.querySelector<HTMLElement>(".ai-chat-message")!
    const role = message.querySelector<HTMLElement>(".ai-chat-message-role")!
    const content = message.querySelector<HTMLElement>(".ai-chat-message-content")!
    const css = getComputedStyle(message)
    assert(css.whiteSpace === "normal", "message template whitespace is preserved")
    assert(getComputedStyle(content).whiteSpace === "pre-wrap", "intentional reply line breaks are not preserved")
    assert(Math.abs(role.getBoundingClientRect().top - message.getBoundingClientRect().top - parseFloat(css.paddingTop) - 1) < 1,
      "role label has extra space above its normal padding")
    assert(content.getBoundingClientRect().top - role.getBoundingClientRect().bottom <= 5,
      "reply has extra whitespace below its role label")
    const expectedHeight = role.getBoundingClientRect().height + content.getBoundingClientRect().height
      + parseFloat(getComputedStyle(role).marginBottom) + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)
      + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth)
    assert(Math.abs(message.getBoundingClientRect().height - expectedHeight) < 1,
      "AI reply has spacing beyond its text, label and normal padding")
    const host = ribbon as unknown as {handleAIDocumentTool: (call: unknown, chatId: string) => Promise<unknown>}
    let finishPreview!: (result: {status: string}) => void
    ribbon.aiEditReviewHandler = async action => action === "preview"
      ? new Promise(resolve => {finishPreview = resolve})
      : {status: action === "accept" ? "applied" : "rejected"}
    const call = {id: "test-edit", name: "replace_current_document", arguments: {summary: "Add a heading", html: "<h1>Heading</h1>"}}
    const queued = host.handleAIDocumentTool(call, "chat-1")
    await ribbon.updateComplete
    const editMessage = ribbon.aiToolboxTarget!.querySelector<HTMLElement>('[data-edit-phase="queued"]')!
    assert(editMessage && editMessage.textContent!.includes("Queued:"), "queued message is missing")
    finishPreview({status: "previewing"})
    await queued
    await ribbon.updateComplete
    await layoutFrame()
    assert(ribbon.aiToolboxTarget!.querySelector('[data-edit-phase="review"]') === editMessage,
      "review was appended instead of replacing the queued message")
    assert(!ribbon.aiToolboxTarget!.querySelector(".ai-prompt-input"), "review buttons do not replace the toolbox input")
    const checkActions = (expected: string[]) => {
      const buttons = Array.from(ribbon.aiToolboxTarget!.querySelectorAll<HTMLButtonElement>(".ai-edit-action"))
      assert(JSON.stringify(buttons.map(button => button.querySelector("span")!.textContent)) === JSON.stringify(expected), "AI action buttons are missing")
      for(const button of buttons) {
        const css = getComputedStyle(button)
        const label = button.querySelector<HTMLElement>("span")!
        assert(css.whiteSpace === "nowrap" && label.getBoundingClientRect().height <= parseFloat(css.lineHeight) + 1,
          "AI action label wraps onto multiple lines")
        assert(button.getBoundingClientRect().height <= 25, "AI action button is not compact")
      }
    }
    checkActions(["Accept", "Go to", "Reject"])
    ribbon.aiToolboxTarget!.querySelector<HTMLButtonElement>('.ai-toolbox-review [data-kind="approve"]')!.click()
    await layoutFrame()
    await ribbon.updateComplete
    assert(ribbon.aiToolboxTarget!.querySelector('[data-edit-phase="accepted"]') === editMessage,
      "acceptance was appended instead of replacing the review message")
    assert(ribbon.aiToolboxTarget!.querySelector(".ai-prompt-input"), "composer was not restored after acceptance")
    checkActions(["Go to", "Undo change"])
  }
  finally {ribbon.remove(); toolbox.remove()}
})

await check("Closed AI bar shows status and anchored reply speech bubbles", async () => {
  const {AppRibbon} = await import("../src/components/ribbon")
  const ribbon = new AppRibbon()
  fixture.append(ribbon)
  try {
    await ribbon.updateComplete
    const host = ribbon as unknown as {aiBusy: boolean, aiProgress: string}
    host.aiBusy = true
    host.aiProgress = "Detailed progress for hovering"
    await ribbon.updateComplete
    const status = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-bar-status")!
    assert(status.textContent === "Thinking..." && status.title === host.aiProgress, "closed AI bar does not show compact progress")
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    assert(!input.readOnly && !input.disabled, "Thinking prevents typing a subsequent message")
    input.value = "A subsequent message"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await ribbon.updateComplete
    assert(!ribbon.shadowRoot!.querySelector(".ai-bar-status"), "Thinking obscures the queued draft")
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Queue chat message"]')!.click()
    await ribbon.updateComplete
    assert(input.value === "" && ribbon.shadowRoot!.querySelector(".ai-bar-status"), "queueing does not restore the Thinking bar")
    assert((ribbon as any).queuedAIPrompts.length === 1, "message was not queued")
    const newChat = ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!
    assert(!newChat.disabled, "New chat is disabled while Thinking")
    newChat.click()
    await ribbon.updateComplete
    assert(!ribbon.shadowRoot!.querySelector(".ai-bar-status"), "another chat's Thinking status appears in the new chat")
    const busySwitcher = ribbon.shadowRoot!.querySelector<HTMLSelectElement>(".ai-chat-switcher")!
    assert(!busySwitcher.disabled, "chat switching is disabled while Thinking")
    busySwitcher.value = "chat-1"
    busySwitcher.dispatchEvent(new Event("change", {bubbles: true}))
    await ribbon.updateComplete
    assert(ribbon.shadowRoot!.querySelector(".ai-bar-status"), "originating chat lost its Thinking status after switching")
    ;(ribbon as any).clearQueuedAIPrompts()
    host.aiBusy = false
    ribbon.appendAIResponse("Here is the reply.\nIt stays available while you edit.")
    await ribbon.updateComplete
    await layoutFrame()
    const bubble = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-bar-reply")!
    const bar = ribbon.shadowRoot!.querySelector<HTMLElement>("#ai-chat-panel")!
    const icon = bar.querySelector<HTMLElement>(".ai-chat-brand-button")!
    assert(bubble.matches(":popover-open"), "reply bubble is clipped inside the ribbon instead of using the top layer")
    const checkGeometry = () => {
      const reply = bubble.getBoundingClientRect()
      const input = bar.getBoundingClientRect()
      const origin = icon.getBoundingClientRect()
      assert(Math.abs(reply.left - input.left) < 1 && Math.abs(reply.width - input.width) < 1,
        `reply does not share the AI bar's position and width: ${JSON.stringify({reply: reply.toJSON(), input: input.toJSON()})}`)
      const spike = getComputedStyle(bubble, "::before")
      const spikeX = reply.left + parseFloat(getComputedStyle(bubble).borderLeftWidth) + parseFloat(spike.left) + parseFloat(spike.borderLeftWidth)
      assert(Math.abs(spikeX - (origin.left + origin.width / 2)) <= 1.5, "speech-bubble spike does not point to the AI icon")
      assert(reply.top > input.bottom, "speech bubble overlaps the AI bar")
    }
    checkGeometry()
    ribbon.style.width = "calc(100% - 100px)"
    await layoutFrame()
    checkGeometry()
    bubble.querySelector<HTMLButtonElement>(".ai-bar-reply-close")!.click()
    await ribbon.updateComplete
    assert(!ribbon.shadowRoot!.querySelector(".ai-bar-reply"), "dismissed reply remains visible")
    ;(ribbon as any).startNewAIChat()
    ribbon.appendAIResponse("Reply for the second chat")
    await ribbon.updateComplete
    assert(ribbon.shadowRoot!.querySelector(".ai-bar-reply-content")!.textContent === "Reply for the second chat", "new chat displays another chat's reply")
    const switcher = ribbon.shadowRoot!.querySelector<HTMLSelectElement>(".ai-chat-switcher")!
    switcher.value = "chat-1"
    switcher.dispatchEvent(new Event("change", {bubbles: true}))
    await ribbon.updateComplete
    assert(!ribbon.shadowRoot!.querySelector(".ai-bar-reply"), "switching chats resurrects a dismissed reply")
    const firstChat = (ribbon as any).aiChats.find((chat: {id: string}) => chat.id === "chat-1")
    assert(firstChat && !firstChat.messages.some((message: {content: string}) => message.content.includes("Reply for the second chat")), "chat history includes another chat's messages")
  }
  finally {ribbon.remove()}
})

await check("Document toolbox combines metadata and layouts with primary and detailed options", async () => {
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const toolbox = new DomEditorToolbox()
  toolbox.activeTool = "Edit"
  toolbox.documentSelected = true
  toolbox.elementAttributes = {path: [], localName: "body", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Document", attributes: {}}
  fixture.append(toolbox)
  try {
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<import("../src/components/ribbon-drawer").RibbonDrawer>('ribbon-drawer[data-specialized="document"]')!
    await drawer.updateComplete
    await layoutFrame()
    const common = drawer.querySelector<import("../src/components/document-head-editor").DocumentHeadEditor>('document-head-editor[mode="common"]')!
    await common.updateComplete
    assert(drawer.shadowRoot!.querySelector(".pane-icon svg"), "Document toolbox lacks its heading icon")
    assert(drawer.querySelector(".document-reset"), "Document toolbox lacks Reset")
    assert(!toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"], ribbon-drawer[label="Layouts"], [action^="set-document-template:"]'), "legacy document drawers remain")
    assert(!drawer.querySelector("element-attribute-editor"), "separate document language controls remain")
    const primary = drawer.querySelector<HTMLElement>(".document-primary")!.getBoundingClientRect()
    assert(Math.abs(common.getBoundingClientRect().width - primary.width) < 1, "metadata fields do not fill the toolbox")
    const language = common.shadowRoot!.querySelector<HTMLElement>('document-head-combobox[label="Language"]')!
    assert(language.getBoundingClientRect().width > 80, "metadata Language field is clipped")
    const license = common.shadowRoot!.querySelector<import("../src/components/document-head-editor").DocumentHeadCombobox>('document-head-combobox[label="License"]')!
    await license.updateComplete
    license.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await license.updateComplete
    await layoutFrame()
    const licenseDescriptions = Array.from(license.shadowRoot!.querySelectorAll<HTMLElement>(".option-description"))
    assert(licenseDescriptions.length === 7, "license picker is missing definitions")
    const licensePopup = license.shadowRoot!.querySelector<HTMLElement>(".listbox")!.getBoundingClientRect()
    const licenseControl = license.getBoundingClientRect()
    assert(Math.abs(licensePopup.right - Math.max(licenseControl.right, licensePopup.width)) < 1,
      `license picker is detached from its field: ${JSON.stringify({popup: licensePopup.toJSON(), control: licenseControl.toJSON()})}`)
    assert(licensePopup.left >= 0 && licensePopup.right <= innerWidth, "license picker overflows the viewport")
    for(const description of licenseDescriptions) {
      assert(getComputedStyle(description).whiteSpace === "normal", "license definition cannot wrap")
      assert(getComputedStyle(description).fontStyle === "italic", "license definition is not italic")
      assert(description.scrollWidth <= description.clientWidth && description.scrollHeight <= description.clientHeight,
        "license definition is clipped")
    }
    assert(licenseDescriptions[5].clientHeight > parseFloat(getComputedStyle(licenseDescriptions[5]).lineHeight), "long license definition does not wrap in the toolbox")
    license.close()
    await license.updateComplete
    const more = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!
    assert(more.hidden, "detailed document options start expanded")
    drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    await drawer.updateComplete
    await layoutFrame()
    assert(!more.hidden, "Options does not reveal detailed document controls")
    const advanced = drawer.querySelector<import("../src/components/document-head-editor").DocumentHeadEditor>('document-head-editor[mode="advanced"]')!
    await advanced.updateComplete
    assert(advanced.getBoundingClientRect().height > 50, "advanced metadata is not visible")
    const description = advanced.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!
    assert(description.rows === 3, "Description is not a three-line textarea")
    assert(Math.abs(description.getBoundingClientRect().width - advanced.getBoundingClientRect().width) < 1,
      "Description does not span the toolbox width")
    assert(description.clientHeight >= parseFloat(getComputedStyle(description).lineHeight) * 3,
      "Description cannot display three lines")
    assert(!drawer.querySelector(".layout-preview-toggle, .document-layout-zoom, .document-layout-picker"), "removed document controls remain")
    assert(!advanced.shadowRoot!.querySelector(".generator-entry, .add-toolbar"), "removed metadata controls remain")
    const cards = Array.from(drawer.querySelectorAll<HTMLButtonElement>(".document-layout-change"))
    assert(cards.length === 4, "layout switch does not show four cards")
    assert(cards.filter(card => card.getAttribute("aria-pressed") === "true").length === 1, "active layout is not highlighted")
    for(const card of cards) {
      const box = card.getBoundingClientRect()
      const label = card.querySelector<HTMLElement>(".layout-preset-name")!
      const text = label.getBoundingClientRect()
      assert(Math.abs((box.left + box.right) / 2 - (text.left + text.right) / 2) < 1
        && Math.abs((box.top + box.bottom) / 2 - (text.top + text.bottom) / 2) < 1, "layout label is not centered in its card")
      assert(label.scrollWidth <= label.clientWidth, "layout label is clipped")
    }
  }
  finally {toolbox.remove()}
})

await check("Border controls are narrow and dropdown chevrons overlay field values", async () => {
  const {ElementStyleEditor} = await import("../src/components/element-style-editor")
  const {StyleCombobox} = await import("../src/components/style-combobox")
  const {RibbonCombobox} = await import("../src/components/ribbon-combobox")
  const editor = new ElementStyleEditor()
  editor.mode = "compact"
  editor.propertyNames = ["border-width"]
  editor.style.width = "220px"
  const style = new StyleCombobox()
  style.unit = "px"
  style.placeholder = "Default"
  const ribbon = new RibbonCombobox()
  ribbon.options = [{label: "A long font name", value: "long"}]
  fixture.append(editor, style, ribbon)
  try {
    await Promise.all([editor.updateComplete, style.updateComplete, ribbon.updateComplete])
    await layoutFrame()
    const root = editor.shadowRoot!
    const line = root.querySelector<HTMLElement>(".border-picker")!
    const color = root.querySelector<HTMLElement>(".border-color-picker")!
    assert(Math.abs(line.getBoundingClientRect().width - color.getBoundingClientRect().width) < .1, "line and color controls differ in width")
    assert(line.getBoundingClientRect().width <= 16, "border controls are not narrower")
    const sample = line.querySelector<HTMLElement>(".border-sample")!
    assert(sample.getBoundingClientRect().height > sample.getBoundingClientRect().width, "border line sample is not vertical")
    const input = style.shadowRoot!.querySelector<HTMLInputElement>("input")!
    const unit = style.shadowRoot!.querySelector<HTMLElement>(".unit")!
    assert(Math.abs(input.getBoundingClientRect().right - unit.getBoundingClientRect().left) < .1, "chevron reserves a column beside the value")
    for(const combo of [style, ribbon]) {
      const overlay = combo.shadowRoot!.querySelector<HTMLElement>(".dropdown-chevron")!
      const css = getComputedStyle(overlay)
      assert(css.position === "absolute" && css.borderRadius === "50%", "chevron is not a round overlay")
      assert(css.backgroundColor.includes("0.8"), "chevron background is not translucent")
      assert(getComputedStyle(combo.shadowRoot!.querySelector(combo === style ? "input" : ".combobox")!).paddingRight === "3.2px", "field padding was not reduced")
    }
  }
  finally {editor.remove(); style.remove(); ribbon.remove()}
})

await check("Ribbon text colors share the toolbox palette and commit chosen colors", async () => {
  const {RibbonCombobox} = await import("../src/components/ribbon-combobox")
  for(const name of ["color", "background-color"]) {
    const combo = new RibbonCombobox()
    combo.name = name
    combo.variant = "color"
    combo.options = [{label: "Black", value: "#000000"}]
    fixture.append(combo)
    try {
      await combo.updateComplete
      combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
      await combo.updateComplete
      await layoutFrame()
      const custom = combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Custom"]')!
      const swatches = combo.shadowRoot!.querySelectorAll<HTMLElement>(".color-swatch")
      assert(swatches.length === 70, "palette does not match the toolbox colors")
      for(const value of ["", "transparent", "rgba(0, 0, 0, 0)", "rgb(55, 60, 68)"]) {
        combo.value = value
        await combo.updateComplete
        assert(!combo.shadowRoot!.querySelector('.color-swatch[aria-pressed="true"]'), `${name}: ${value || "default"} selected an unrelated swatch`)
      }
      combo.value = "rgb(0, 0, 0)"
      await combo.updateComplete
      assert(combo.shadowRoot!.querySelector('[aria-label="Color #000000"]')!.getAttribute("aria-pressed") === "true", `${name}: explicit black was not selected`)
      const swatch = swatches[0].getBoundingClientRect()
      assert(swatch.width > 10 && Math.abs(swatch.width - swatch.height) < .1, "palette swatches are not visible squares")
      const icon = custom.querySelector("svg")!.getBoundingClientRect()
      assert(icon.width === 16 && icon.height === 16, "Custom icon does not match the toolbox size")
      const input = combo.shadowRoot!.querySelector<HTMLInputElement>('input[type="color"]')!
      let opened = false
      Object.defineProperty(input, "showPicker", {value: () => {opened = true}})
      custom.click()
      assert(opened, "Custom did not open the native picker")
      const anchor = input.getBoundingClientRect()
      const popup = combo.shadowRoot!.querySelector<HTMLElement>(".listbox")!.getBoundingClientRect()
      assert(Math.abs(anchor.left - popup.right - 4) < .1, "custom picker does not anchor to the right of its palette")
      assert(Math.abs(anchor.bottom - custom.getBoundingClientRect().top) < .1, "custom picker is not aligned with the Custom row")
      let detail: unknown
      combo.addEventListener("ribbon-combobox-change", event => {detail = (event as CustomEvent).detail})
      input.value = "#12ab34"
      input.dispatchEvent(new Event("change", {bubbles: true}))
      await combo.updateComplete
      assert(JSON.stringify(detail) === JSON.stringify({name, value: "#12ab34"}), "custom color was not committed")
      assert(combo.shadowRoot!.querySelector(".listbox") === null, "palette remained open after committing")
    }
    finally {combo.remove()}
  }
})

await check("Editor UI prevents text selection while preserving editable fields and the document", async () => {
  await Promise.all([
    import("../src/components/ribbon"), import("../src/components/settings-panel"),
    import("../src/components/document-head-editor"), import("../src/components/element-style-editor"),
    import("../src/components/element-attribute-editor"), import("../src/components/link-keyboard"),
    import("../src/components/widget-grouping-dialog"), import("../src/components/developer-console"),
  ])
  const stage = document.createElement("section")
  stage.contentEditable = "false"
  fixture.append(stage)
  const tags = ["app-ribbon", "settings-panel", "document-head-editor", "document-head-combobox",
    "element-style-editor", "element-attribute-editor", "dom-editor-link-keyboard",
    "widget-grouping-dialog", "developer-console", "package-search", "ribbon-button"]
  const controls = tags.map(tag => document.createElement(tag))
  stage.append(...controls)
  let editor: DOMEditor | undefined
  try {
    await Promise.all(controls.map(control => (control as HTMLElement & {updateComplete: Promise<unknown>}).updateComplete))
    await layoutFrame()
    let fields = 0
    const inspect = (root: ShadowRoot) => {
      for(const element of root.querySelectorAll<HTMLElement>("*")) {
        if(element.matches("input, textarea, select")) {
          fields++
          assert(getComputedStyle(element).userSelect === "text", `${element.localName} in ${root.host.localName} lost text selection`)
        }
        if(element.shadowRoot) inspect(element.shadowRoot)
      }
    }
    for(const control of controls) {
      assert(getComputedStyle(control).userSelect === "none", `${control.localName} permits UI text selection`)
      inspect(control.shadowRoot!)
    }
    assert(fields > 10, `only ${fields} native fields were checked`)
    const console = stage.querySelector("developer-console")!
    for(const panel of console.shadowRoot!.querySelectorAll(".test-content, .element-content")) {
      assert(getComputedStyle(panel).userSelect === "none", "console text remains selectable")
    }
    // Rich editable UI must opt back into selection, including its descendants.
    const rich = document.createElement("div")
    rich.contentEditable = "plaintext-only"
    rich.innerHTML = "<span>Editable UI</span>"
    controls.at(-1)!.shadowRoot!.append(rich)
    assert(getComputedStyle(rich).userSelect === "text"
      && getComputedStyle(rich.firstElementChild!).userSelect === "text", "editable UI lost selection")

    editor = new DOMEditor()
    const appendixControl = document.createElement("section")
    appendixControl.innerHTML = "<span>Editor UI</span><input value='Editable input'><textarea>Editable textarea</textarea><div contenteditable='true'><b>Editable content</b></div>"
    editor.addAppendix(appendixControl)
    assert(getComputedStyle(appendixControl.firstElementChild!).userSelect === "none", "appendix label remains selectable")
    assert(getComputedStyle(appendixControl.querySelector("input")!).userSelect === "text", "appendix field lost selection")
    assert(getComputedStyle(appendixControl.querySelector("b")!).userSelect === "text", "nested editable appendix content lost selection")
    assert(getComputedStyle(fixture).userSelect === "text", "authored document lost text selection")
    const menu = (target: Element) => target.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true}))
    assert(menu(appendixControl.querySelector("input")!), "appendix input context menu was suppressed")
    assert(menu(appendixControl.querySelector("textarea")!), "appendix textarea context menu was suppressed")
    assert(menu(appendixControl.querySelector("b")!), "editable appendix content context menu was suppressed")
    // Happy DOM does not support case-insensitive attribute selectors fully.
    for(const value of ["", "TRUE", "plaintext-only"]) {
      appendixControl.querySelector("[contenteditable]")!.setAttribute("contenteditable", value)
      assert(menu(appendixControl.querySelector("b")!), `editable appendix content (${value}) context menu was suppressed`)
    }
    const readonly = document.createElement("span")
    readonly.contentEditable = "false"
    appendixControl.querySelector("[contenteditable]")!.append(readonly)
    assert(!menu(readonly), "noneditable UI inside an editable field still opens its default context menu")
    assert(!menu(appendixControl.querySelector("span")!), "appendix label still opens its default context menu")
    assert(menu(fixture), "authored document context menu was suppressed")
  }
  finally { editor?.destroy(); stage.remove() }
})

await check("File actions align with the font size controls", async () => {
  const heightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")
  Object.defineProperty(window, "innerHeight", {configurable: true, value: 900})
  const {AppRibbon} = await import("../src/components/ribbon")
  const ribbon = new AppRibbon()
  ribbon.fileName = "Unnamed File"
  ribbon.settings = {...ribbon.settings, disableAI: true}
  ribbon.expanded = true
  ribbon.activeMenu = "Start"
  fixture.append(ribbon)
  try {
    await ribbon.updateComplete
    ribbon.expanded = true
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<import("../src/components/ribbon-drawer").RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    await layoutFrame()
    const centers = [ribbon.shadowRoot!.querySelector(".file-save-action")!, ribbon.shadowRoot!.querySelector(".file-share-action")!, drawer.querySelector('[action="increaseFontSize"]')!, drawer.querySelector('[action="decreaseFontSize"]')!]
      .map(element => {const rect = element.getBoundingClientRect(); return rect.left + rect.width / 2})
    assert(Math.abs(centers[0] - centers[2]) < .5 && Math.abs(centers[1] - centers[3]) < .5,
      `file actions do not align with font controls: ${JSON.stringify(centers)}`)
  }
  finally {
    ribbon.remove()
    if(heightDescriptor) Object.defineProperty(window, "innerHeight", heightDescriptor)
    else Reflect.deleteProperty(window, "innerHeight")
  }
})

await check("Toolbox choices distinguish defaults from explicit matching values", async () => {
  const {ElementStyleEditor} = await import("../src/components/element-style-editor")
  const {elementStyleCategories} = await import("../src/element-styles")
  const controls = new ElementStyleEditor()
  controls.mode = "compact"
  controls.definitions = elementStyleCategories.flatMap(category => [...category.basic, ...category.advanced])
  controls.propertyNames = ["text-align"]
  const initial = {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {"text-align": "start"}, context: {display: "block", parentDisplay: "block"}}
  controls.state = initial
  fixture.append(controls)
  try {
    await controls.updateComplete
    const active = () => controls.shadowRoot!.querySelector<HTMLButtonElement>('.specialized-choice-group button[aria-pressed="true"]')!
    assert(getComputedStyle(active()).backgroundColor === "rgb(229, 229, 229)", "default choice is not light grey")
    controls.addEventListener("element-style-change", event => {
      const {property, mutation} = (event as CustomEvent<import("../src/components/element-style-editor").ElementStyleChangeDetail>).detail
      if(property && mutation && typeof mutation !== "string") controls.state = {...initial, inline: {[property]: mutation}}
    })
    active().click()
    await controls.updateComplete
    assert(getComputedStyle(active()).backgroundColor === "rgb(226, 237, 248)", "explicit matching choice is not light blue")
    controls.state = initial
    await controls.updateComplete
    assert(getComputedStyle(active()).backgroundColor === "rgb(229, 229, 229)", "clearing the choice did not restore grey")
  }
  finally {controls.remove()}
})

await check("Style dropdowns draw a single border and focus ring", async () => {
  const {ElementStyleEditor} = await import("../src/components/element-style-editor")
  const {elementStyleCategories} = await import("../src/element-styles")
  const controls = new ElementStyleEditor()
  controls.definitions = elementStyleCategories.flatMap(category => [...category.basic, ...category.advanced])
  controls.mode = "compact"
  controls.propertyNames = ["line-height"]
  controls.state = {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
  fixture.append(controls)
  try {
    await controls.updateComplete
    const wrapper = controls.shadowRoot!.querySelector<HTMLElement>(".specialized-input")!
    const combo = wrapper.querySelector<import("../src/components/style-combobox").StyleCombobox>("style-combobox")!
    await combo.updateComplete
    const control = combo.shadowRoot!.querySelector<HTMLElement>(".control")!
    for(const side of ["Top", "Right", "Bottom", "Left"]) {
      assert(getComputedStyle(wrapper).getPropertyValue(`border-${side.toLowerCase()}-width`) === "0px", "dropdown wrapper draws a second border")
    }
    assert(parseFloat(getComputedStyle(control).borderTopWidth) > 0, "dropdown lost its own border")
    combo.shadowRoot!.querySelector<HTMLInputElement>("input")!.focus()
    await combo.updateComplete
    assert(getComputedStyle(wrapper).boxShadow === "none", "dropdown wrapper draws a second focus ring")
    assert(getComputedStyle(control).outlineWidth === "2px", "dropdown lost its keyboard focus ring")
    combo.close()
  }
  finally { controls.remove() }
})

await check("custom filters persist and toggle after native CSS serialization", async () => {
  const {ElementStyleEditor} = await import("../src/components/element-style-editor")
  const {filterPresetsStorageKey, filterPresetLabel, loadFilterPresets} = await import("../src/filter-presets")
  const previous = localStorage.getItem(filterPresetsStorageKey)
  localStorage.removeItem(filterPresetsStorageKey)
  const controls = new ElementStyleEditor()
  const target = document.createElement("p")
  target.style.setProperty("filter", "sepia(1)", "important")
  controls.mode = "compact"
  controls.propertyNames = ["filter"]
  controls.style.width = "216px"
  const project = () => controls.state = {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {filter: {value: target.style.filter, priority: "important"}}, computed: {}, context: {display: "block", parentDisplay: "block"}}
  project()
  controls.addEventListener("element-style-change", event => {
    const {mutation} = (event as CustomEvent<import("../src/components/element-style-editor").ElementStyleChangeDetail>).detail
    if(mutation === null) target.style.removeProperty("filter")
    else if(typeof mutation === "string") target.style.filter = mutation
    else target.style.setProperty("filter", mutation.value, mutation.priority)
    project()
  })
  fixture.append(controls)
  try {
    await controls.updateComplete
    const root = controls.shadowRoot!
    root.querySelector<HTMLButtonElement>(".effect-trigger")!.click()
    await controls.updateComplete
    root.querySelector<HTMLButtonElement>(".effect-custom")!.click()
    await controls.updateComplete
    await controls.updateComplete
    const dialog = root.querySelector<HTMLDialogElement>(".filter-dialog")!
    assert(dialog.open && dialog.matches(":modal"), "custom filter did not open as a native modal")
    const select = dialog.querySelector("select")!
    select.value = "drop-shadow"
    select.dispatchEvent(new Event("change", {bubbles: true}))
    await controls.updateComplete
    const inputs = dialog.querySelectorAll<HTMLInputElement>('input[type="number"]')
    for(const [index, value] of ["-3", "5.5", "8"].entries()) {
      inputs[index].value = value
      inputs[index].dispatchEvent(new Event("input", {bubbles: true}))
    }
    await controls.updateComplete
    await layoutFrame()
    const bounds = dialog.getBoundingClientRect()
    assert(bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
      "filter dialog escaped the viewport")
    assert(dialog.scrollWidth <= dialog.clientWidth, "filter dialog overflows horizontally")
    dialog.querySelector<HTMLButtonElement>('[type="submit"]')!.click()
    await controls.updateComplete
    assert(!dialog.open && loadFilterPresets().length === 1, "confirm did not close and save the filter")
    assert(target.style.filter.includes("rgb(0, 0, 0)") && target.style.filter.startsWith("sepia(1)"), "filter lost its native serialization or existing stack")
    const label = filterPresetLabel(loadFilterPresets()[0])
    const preset = () => root.querySelector<HTMLButtonElement>(`[title="${label}"]`)!
    assert(preset().getAttribute("aria-pressed") === "true", "native color serialization hid the active custom filter")
    root.querySelector<HTMLButtonElement>(".effect-trigger")!.click()
    await controls.updateComplete
    preset().dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true}))
    await controls.updateComplete
    assert(!root.querySelector<HTMLElement>(".effect-popup")!.hidden, "preset pointerdown dismissed the picker")
    preset().click()
    await controls.updateComplete
    assert(target.style.filter === "sepia(1)", "toggling custom filter removed other filters or added a duplicate")
    preset().click()
    await controls.updateComplete
    const preview = root.querySelector<HTMLElement>(".effect-trigger .filter-preview")!
    assert(preview.style.filter === target.style.filter, "preview lost the complete native filter stack")
    controls.remove()
    fixture.append(controls)
    await controls.updateComplete
    assert(preset().getAttribute("aria-pressed") === "true", "saved custom filter did not survive reconnection")
  }
  finally {
    controls.remove()
    if(previous === null) localStorage.removeItem(filterPresetsStorageKey)
    else localStorage.setItem(filterPresetsStorageKey, previous)
  }
})

await check("marker image uploads preview before applying", async () => {
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const toolbox = new DomEditorToolbox()
  toolbox.activeTool = "Edit"
  toolbox.activeMenu = "Edit"
  toolbox.elementAttributes = {path: [0], localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml", name: "List", attributes: {}}
  toolbox.elementStyle = {target: {localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
  fixture.append(toolbox)
  try {
    await toolbox.updateComplete
    const controls = toolbox.shadowRoot!.querySelector<import("../src/components/element-style-editor").ElementStyleEditor>('ribbon-drawer[data-specialized="ul"] element-style-editor')!
    await controls.updateComplete
    controls.shadowRoot!.querySelector<HTMLButtonElement>(".marker-more")!.click()
    await controls.updateComplete
    controls.shadowRoot!.querySelector<HTMLButtonElement>(".marker-image-option")!.click()
    await controls.updateComplete
    const dialog = controls.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!
    assert(dialog.open, "image marker dialog did not open")
    const source = await (await fetch("/tests/fixtures/circle-check.svg")).text()
    const picker = dialog.querySelector<HTMLInputElement>('[name="file"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([source], "circle-check.svg", {type: "image/svg+xml"}))
    picker.files = transfer.files
    picker.dispatchEvent(new Event("change", {bubbles: true}))
    // Returning from the native file chooser can refresh the bridge's style projection.
    toolbox.elementStyle = {...toolbox.elementStyle, target: {...toolbox.elementStyle.target!, float: "none"},
      computed: {"list-style-type": "disc", "list-style-image": "none", "font-size": "16px"}}
    await toolbox.updateComplete
    await controls.updateComplete
    assert(dialog.open, "style refresh closed the upload dialog")
    const preview = dialog.querySelector<HTMLImageElement>(".marker-image-preview img")!
    for(let attempt = 0; attempt < 100 && !preview.getAttribute("src"); attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(preview.src.startsWith("data:image/svg+xml;base64,"), "uploaded SVG did not become a data URL preview")
    await preview.decode()
    assert(preview.naturalWidth === 24 && preview.naturalHeight === 24, "circle-check SVG did not render")
    assert(dialog.open, "upload closed the dialog before confirmation")
    let applied: any
    toolbox.addEventListener("element-style-change", event => {applied = (event as CustomEvent).detail})
    await layoutFrame()
    const previewBox = preview.closest("figure")!.getBoundingClientRect()
    const dialogBox = dialog.getBoundingClientRect(), dialogStyle = getComputedStyle(dialog)
    const contentWidth = dialogBox.width - parseFloat(dialogStyle.paddingLeft) - parseFloat(dialogStyle.paddingRight)
      - parseFloat(dialogStyle.borderLeftWidth) - parseFloat(dialogStyle.borderRightWidth)
    assert(Math.abs(previewBox.width - previewBox.height) < 1, "preview is not square")
    assert(Math.abs(previewBox.width - contentWidth * .3) < 1, "preview is not 30% of the dialog content width")
    assert(Math.abs(previewBox.top - dialogBox.top - parseFloat(dialogStyle.paddingTop) - parseFloat(dialogStyle.borderTopWidth)) < 1,
      "preview is not at the dialog's top edge")
    assert(Math.abs(dialogBox.right - previewBox.right - parseFloat(dialogStyle.paddingRight) - parseFloat(dialogStyle.borderRightWidth)) < 1,
      "preview is not at the dialog's right edge")
    assert(!applied, "preview applied the marker without confirmation")
    dialog.querySelector<HTMLButtonElement>('[type="submit"]')!.click()
    assert(applied?.styles?.["--ww-list-marker-image"].value === `url(${JSON.stringify(preview.src)})`, "Use marker did not apply the previewed SVG")
    const style = document.createElement("style")
    style.textContent = defaultDocumentTheme.source + "\n" + listMarkerStyleSource
    const list = document.createElement("ul")
    for(const [name, declaration] of Object.entries(applied.styles) as [string, {value: string, priority: string}][]) list.style.setProperty(name, declaration.value, declaration.priority)
    list.innerHTML = '<li><span>fghf</span><br>second line</li>'
    fixture.append(style, list)
    try {
      for(const size of [16, 24, 32]) {
        list.style.fontSize = `${size}px`
        list.style.lineHeight = "1.5"
        for(const direction of ["ltr", "rtl"]) {
          list.dir = direction
          await layoutFrame()
          const item = list.firstElementChild!
          const marker = getComputedStyle(item, "::before")
          const markerCenter = parseFloat(marker.top) + parseFloat(marker.height) / 2
          assert(Math.abs(markerCenter - size * 1.5 / 2) < 1, `image marker missed the first line's center at ${size}px/${direction}`)
          assert(parseFloat(marker.width) === size && parseFloat(marker.height) === size, "marker did not scale with the text")
          assert(item.childNodes.length === 3 && item.firstElementChild?.localName === "span", "marker styling changed item contents")
        }
      }
    }
    finally {list.remove(); style.remove()}
    assert(!dialog.open, "confirmation did not close the dialog")
  }
  finally {toolbox.remove()}
})

await check("insertion and saved-reader controls align inside symmetric scrollbar gutters", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:450px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  let saved: HTMLIFrameElement | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "reader gutter fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, theme = doc.createElement("style")
    theme.setAttribute("data-ww-theme", "base"); theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    doc.body.innerHTML = '<h1 id="heading">Reader controls</h1><figure id="photo"><img alt="Photo" width="400" height="160" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'160\'%3E%3Crect width=\'400\' height=\'160\' fill=\'skyblue\'/%3E%3C/svg%3E"></figure><p style="width:400px;height:1200px">Scrollable document</p>'
    await layoutFrame()
    for(const gutter of ["stable both-edges", "auto"]) {
      doc.documentElement.style.scrollbarGutter = gutter
      await layoutFrame()
      const anchor = doc.querySelector("h1")!.getBoundingClientRect()
      editor.features.insertion.menu.setPosition(anchor.left, anchor.bottom + 6)
      const menu = editor.features.insertion.menu.getBoundingClientRect()
      assert(Math.abs(menu.left - anchor.left) < 1, "insertion menu drifted from its command anchor")
    }
    doc.documentElement.style.removeProperty("scrollbar-gutter")
    saved = document.createElement("iframe"); saved.style.cssText = frame.style.cssText
    saved.setAttribute("sandbox", "allow-scripts allow-same-origin")
    const loaded = new Promise<void>(resolve => saved!.addEventListener("load", () => resolve(), {once:true}))
    saved.srcdoc = await editor.serializeHTML(); fixture.append(saved); await loaded
    const savedDoc = saved.contentDocument!, savedView = saved.contentWindow! as Window & {PointerEvent: typeof PointerEvent}
    for(let attempt = 0; !savedDoc.body.shadowRoot?.querySelector(".◆document-pane") && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const appendix = savedDoc.body.shadowRoot!
    assert(appendix?.querySelector(".◆document-pane"), "saved reader did not initialize")
    Object.defineProperty(savedView.navigator, "clipboard", {configurable:true, value:{writeText: async () => {}}})
    for(const gutter of ["stable both-edges", "auto"]) {
      savedDoc.documentElement.style.scrollbarGutter = gutter
      for(const scroll of [0, 40]) {
        savedView.scrollTo(0, scroll); await layoutFrame()
        const media = savedDoc.querySelector("img")!.getBoundingClientRect()
        savedDoc.dispatchEvent(new savedView.PointerEvent("pointermove", {bubbles:true, clientX:media.right - 60, clientY:media.top + 20}))
        await layoutFrame()
        const heading = savedDoc.querySelector("h1")!.getBoundingClientRect()
        const link = appendix.querySelector<HTMLAnchorElement>('.◆document-reader-control a')!
        assert(Math.abs(link.getBoundingClientRect().left - Math.max(0, heading.left - 30)) < 1, "saved permalink drifted from the reading column")
        const fullscreen = appendix.querySelector<HTMLButtonElement>('.◆document-reader-control button')!.getBoundingClientRect()
        assert(Math.abs(fullscreen.left - (media.right - 40)) < 1, "saved fullscreen button drifted from its media")
        const body = savedDoc.body.getBoundingClientRect(), bodyStyle = savedView.getComputedStyle(savedDoc.body)
        const edge = Math.min(savedView.innerWidth - 20, body.right - parseFloat(bodyStyle.paddingRight) - parseFloat(bodyStyle.borderRightWidth))
        const paneElement = appendix.querySelector<HTMLElement>(".◆document-pane")!, pane = paneElement.getBoundingClientRect()
        assert(Math.abs(pane.right - edge) < 1, `saved action pane drifted from the page edge: ${pane.right} vs ${edge}; ${paneElement.getAttribute("style")}; hidden=${paneElement.hidden}; gutter=${gutter}`)
        link.click(); await Promise.resolve(); await layoutFrame()
        const feedback = appendix.querySelector<HTMLElement>(".◆document-reader-feedback")!
        assert(!feedback.hidden, "copy feedback was not shown")
        const bubble = feedback.getBoundingClientRect(), anchor = link.getBoundingClientRect()
        const arrow = parseFloat(feedback.style.getPropertyValue("--arrow-position"))
        assert(Math.abs(bubble.left + arrow - anchor.left - anchor.width / 2) < 1, `saved feedback arrow drifted from its link: ${JSON.stringify({bubble: bubble.toJSON(), anchor: anchor.toJSON(), arrow, gutter, scroll})}`)
      }
    }
    const figure = savedDoc.querySelector<HTMLElement>("figure#photo")!
    const image = figure.querySelector("img")!
    const permalink = appendix.querySelector<HTMLAnchorElement>('.◆document-reader-control[aria-label="figure controls"] a')!
    const fullscreenButton = appendix.querySelector<HTMLButtonElement>('.◆document-reader-control[aria-label="figure controls"] button')!
    figure.style.transform = "translateX(26px)"
    await layoutFrame()
    const transformedMedia = image.getBoundingClientRect()
    assert(Math.abs(fullscreenButton.getBoundingClientRect().left - (transformedMedia.right - 40)) < 1
      && Math.abs(fullscreenButton.getBoundingClientRect().top - (transformedMedia.top + 8)) < 1,
    "saved fullscreen button did not follow transformed media")
    assert(Math.abs(permalink.getBoundingClientRect().top - figure.getBoundingClientRect().top) < 1
      && permalink.style.top !== "" && fullscreenButton.style.left !== "",
    "saved reader controls did not use measured positions for transformed anchors")
    figure.style.removeProperty("transform")
    await layoutFrame()
    assert(permalink.style.top === "" && fullscreenButton.style.left === ""
      && figure.classList.toString().includes("◆anchor-target-"),
    "saved reader controls did not restore native anchors after the transform")
    figure.style.translate = "26px 0px"
    await layoutFrame()
    const translatedMedia = image.getBoundingClientRect()
    assert(Math.abs(fullscreenButton.getBoundingClientRect().left - (translatedMedia.right - 40)) < 1
      && fullscreenButton.style.left !== "",
    "saved fullscreen button did not follow an individual translate")
    figure.style.removeProperty("translate")
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    saved?.remove(); frame.remove()
  }
})

await check("standalone SVG arrowheads remain visible in canvas previews and exports", async () => {
  const {previewFrameHTML} = await import("../src/frame-document")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:450px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  const readers: HTMLIFrameElement[] = []
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "arrow editing fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const theme = doc.createElement("style")
    theme.setAttribute("data-ww-theme", "base"); theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    editor.setDocumentLayout("canvas", "document")
    doc.body.replaceChildren()
    for(const [index, shape] of (["line-start-arrow", "line-end-arrow", "line-both-arrows"] as const).entries()) {
      const graphic = editor.features.graphic.createGraphic(shape)
      Object.assign(graphic.style, {position: "absolute", left: "50px", top: `${80 + index * 100}px`, rotate: "5deg"})
      doc.body.append(graphic)
    }
    await layoutFrame()
    for(const graphic of doc.querySelectorAll("svg")) {
      const matrix = graphic.querySelector("polyline")!.getScreenCTM()!
      assert(Math.abs(Math.hypot(matrix.a, matrix.b) - Math.hypot(matrix.c, matrix.d)) < .001,
        "minimum editing dimensions distort narrow arrowheads")
    }
    const saved = editor.toHTML()
    const preview = previewFrameHTML(new DOMParser().parseFromString(saved, "text/html"), {
      bridgeNonce: "arrow-preview", hostOrigin: location.origin, frameOrigin: location.origin,
      packages: [], importMap: null, entryURL: "", executeScripts: false,
    })
    for(const html of [preview, saved]) {
      const reader = document.createElement("iframe")
      readers.push(reader)
      reader.style.cssText = frame.style.cssText
      const loaded = new Promise<void>(resolve => reader.addEventListener("load", () => resolve(), {once: true}))
      reader.srcdoc = html; fixture.append(reader); await loaded; await layoutFrame()
      for(const graphic of reader.contentDocument!.querySelectorAll("svg")) {
        const line = graphic.querySelector("polyline")!, marker = graphic.querySelector("marker")!
        assert(line && marker, "reader lost an arrow or its definition")
        assert(Number(marker.getAttribute("markerHeight")) * Number(line.getAttribute("stroke-width")) <= graphic.height.baseVal.value,
          "standalone viewport excludes the arrowheads")
        assert(reader.contentWindow!.getComputedStyle(graphic).overflow === "visible", "document theme clips arrowheads to the line's thin viewport")
      }
    }
  }
  finally {
    ;(frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    readers.forEach(reader => reader.remove()); frame.remove()
  }
})

await check("SVG shape outlines and handles align inside symmetric scrollbar gutters", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:600px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, PointerEvent: typeof PointerEvent}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "SVG gutter fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    doc.body.innerHTML = '<p style="height:80px">Before graphic</p><svg viewBox="0 0 600 400" style="width:600px;height:400px"><rect x="100" y="80" width="160" height="120" fill="skyblue"></rect><ellipse cx="400" cy="240" rx="60" ry="40"></ellipse></svg><p style="height:1200px">After graphic</p>'
    const graphic = doc.querySelector("svg")!, shape = graphic.querySelector("rect")!
    shape.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles:true, button:0, pointerId:1}))
    doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles:true, pointerId:1}))
    assert(editor.features.graphic.selectedShape === shape, "SVG shape was not selected")
    for(const gutter of ["stable both-edges", "auto", "stable both-edges"]) {
      doc.documentElement.style.scrollbarGutter = gutter
      for(const scroll of [0, 80]) {
        graphic.style.rotate = scroll ? "12deg" : "0deg"
        view.scrollTo(0, scroll)
        await layoutFrame()
        const overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
        const polygon = overlay.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
        const matrix = shape.getScreenCTM()!, outlineMatrix = polygon.getScreenCTM()!
        const expected = {x: matrix.a * 100 + matrix.c * 80 + matrix.e, y: matrix.b * 100 + matrix.d * 80 + matrix.f}
        const point = polygon.points.getItem(0)
        const actual = {x: outlineMatrix.a * point.x + outlineMatrix.c * point.y + outlineMatrix.e, y: outlineMatrix.b * point.x + outlineMatrix.d * point.y + outlineMatrix.f}
        assert(Math.abs(actual.x - expected.x) < 1 && Math.abs(actual.y - expected.y) < 1, `SVG outline drifted with ${gutter}: ${actual.x},${actual.y} vs ${expected.x},${expected.y}`)
        const handle = overlay.querySelector<HTMLElement>('[data-graphic-handle="resize-nw"]')!.getBoundingClientRect()
        assert(Math.abs(handle.left + handle.width / 2 - expected.x) < 1 && Math.abs(handle.top + handle.height / 2 - expected.y) < 1, "SVG resize handle drifted from the shape")
        const port = overlay.querySelector<HTMLElement>('[data-graphic-port="e"]')!.getBoundingClientRect()
        const length = Math.hypot(matrix.a, matrix.b)
        const portX = matrix.a * 260 + matrix.c * 140 + matrix.e + matrix.a / length * 14
        const portY = matrix.b * 260 + matrix.d * 140 + matrix.f + matrix.b / length * 14
        assert(Math.abs(port.left + port.width / 2 - portX) < 1 && Math.abs(port.top + port.height / 2 - portY) < 1, "SVG connection port drifted from the shape")
      }
    }
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove()
  }
})

await check("SVG drag previews preserve rotated graphic viewports in canvas and slides", async () => {
  for(const mode of ["canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:1000px;height:700px;border:0;max-width:none"
    frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    fixture.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, PointerEvent: typeof PointerEvent}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, `${mode}: preview fixture did not initialize`)
      const editor = view.editor!, doc = frame.contentDocument!
      doc.body.innerHTML = '<svg viewBox="100 50 1200 600" style="width:600px;height:360px"><!--keep--><rect x="400" y="250" width="160" height="100" fill="skyblue"/><ellipse cx="900" cy="400" rx="60" ry="40" fill="orange"/></svg>'
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: layout conversion failed`)
      const graphic = doc.querySelector("svg")!, shape = graphic.querySelector("rect")!
      Object.assign(graphic.style, {left: "200px", top: "200px", rotate: "30deg", scale: "1.1 0.9", transform: "translate(12px, 8px)", transformOrigin: "25% 75%"})
      editor.features.selection.captureElement(graphic)
      for(const aspect of ["xMidYMid meet", "none", "xMaxYMin slice"]) {
        graphic.setAttribute("preserveAspectRatio", aspect)
        for(const zoom of [100, 140]) {
          editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "set-zoom", zoom})
          const translate = graphic.currentTranslate as unknown as {x: number, y: number}
          translate.x += 17
          translate.y -= 11
          shape.removeAttribute("transform")
          shape.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 1}))
          doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, pointerId: 1}))
          await layoutFrame()
          const before = editor.toHTML(true)
          const rotate = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="rotate"]')!
          const handle = rotate.getBoundingClientRect()
          const start = {x: handle.left + handle.width / 2, y: handle.top + handle.height / 2}
          const matrix = graphic.getScreenCTM()!
          const local = new DOMPoint(start.x, start.y).matrixTransform(matrix.inverse())
          rotate.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 2, clientX: start.x, clientY: start.y}))
          for(const angle of [15, 45, 90]) {
            const radians = angle * Math.PI / 180
            const point = new DOMPoint(
              480 + (local.x - 480) * Math.cos(radians) - (local.y - 300) * Math.sin(radians),
              300 + (local.x - 480) * Math.sin(radians) + (local.y - 300) * Math.cos(radians),
            ).matrixTransform(matrix)
            doc.dispatchEvent(new view.PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 2, clientX: point.x, clientY: point.y}))
            await layoutFrame()
            const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
            assert(preview, `${mode}/${aspect}/${zoom}: drag preview is missing`)
            const actual = preview.getScreenCTM()!, expected = graphic.getScreenCTM()!
            for(const key of ["a", "b", "c", "d", "e", "f"] as const) {
              assert(Math.abs(actual[key] - expected[key]) < .01, `${mode}/${aspect}/${zoom}: preview ${key} drifted: ${actual[key]} vs ${expected[key]}`)
            }
            assert(preview.querySelector("rect")!.getAttribute("transform") === `rotate(${angle} 480 300)`, `${mode}: preview rotation is incorrect`)
            assert(editor.toHTML(true) === before, `${mode}: dragging changed authored HTML`)
          }
          const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
          const bounds = preview.querySelector("rect")!.getBoundingClientRect()
          doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, pointerId: 2}))
          await layoutFrame()
          const committed = shape.getBoundingClientRect()
          for(const key of ["x", "y", "width", "height"] as const) {
            assert(Math.abs(committed[key] - bounds[key]) < .1, `${mode}/${aspect}/${zoom}: shape jumped on release (${key})`)
          }
          assert(!editor.appendix.querySelector(".◆graphic-preview") && !doc.querySelector(".◆graphic-preview-source"), `${mode}: preview artifacts survived release`)
          assert(!editor.toHTML(true).includes("◆") && !editor.doc.body.toString().includes("◆"), `${mode}: preview artifacts entered saved or shared HTML`)
        }
      }
    }
    finally {
      (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
      frame.remove()
    }
  }
})

await check("SVG overflow fades while retaining native shape selection", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:700px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, PointerEvent: typeof PointerEvent}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "SVG overflow fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    doc.body.innerHTML = '<svg viewBox="100 50 600 300" style="display:block;margin:150px auto;width:600px;height:300px;overflow:hidden;filter:grayscale(0.2)"><!--keep--><rect x="40" y="100" width="120" height="80" fill="red"/><rect x="640" y="200" width="120" height="80" fill="blue"/><rect x="250" y="0" width="80" height="100" fill="green"/><g transform="rotate(15 450 330)"><rect x="410" y="280" width="80" height="100" fill="orange"/></g></svg>'
    const graphic = doc.querySelector("svg")!, shapes = Array.from(graphic.querySelectorAll("rect"))
    const authored = graphic.getAttribute("style")
    editor.features.selection.captureElement(graphic)
    editor.features.graphic.actions.toggleGraphicOption({type:"toggleGraphicOption", name:"grid"})
    await layoutFrame()
    const presentation = view.getComputedStyle(graphic)
    assert(graphic.getAttribute("style") === authored, "editing changed authored styles")
    assert(presentation.overflow === "visible", `editing still clips SVG overflow: ${graphic.className.baseVal}; ${presentation.filter}`)
    assert(presentation.filter.startsWith("grayscale(0.2) url("), "overflow fading replaced the authored filter")
    const source = decodeURIComponent(presentation.filter.match(/data:image\/svg\+xml,([^"#]+)/)![1])
    assert(source.includes('flood-opacity="0.35"') && source.includes('width="600" height="300" result="inside"'), "overflow opacity or viewport boundary is incorrect")
    const points = [{x:60,y:140}, {x:740,y:240}, {x:290,y:20}, {x:450,y:365}]
    for(let index = 0; index < shapes.length; index++) {
      const matrix = shapes[index].getScreenCTM()!, point = points[index]
      const x = matrix.a * point.x + matrix.c * point.y + matrix.e
      const y = matrix.b * point.x + matrix.d * point.y + matrix.f
      const hit = doc.elementFromPoint(x, y)
      assert(hit === shapes[index], `overflow at edge ${index} is not a native shape hit target`)
      hit!.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles:true, button:0, pointerId:1, clientX:x, clientY:y}))
      doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles:true, pointerId:1, clientX:x, clientY:y}))
      assert(editor.features.graphic.selectedShape?.contains(shapes[index]), `overflow at edge ${index} could not be selected`)
    }
    const shape = shapes[0], rect = shape.getBoundingClientRect()
    shape.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles:true, button:0, pointerId:2, clientX:rect.left + 10, clientY:rect.top + 20}))
    doc.dispatchEvent(new view.PointerEvent("pointermove", {bubbles:true, buttons:1, pointerId:2, clientX:rect.left - 30, clientY:rect.top + 20}))
    await layoutFrame()
    const preview = editor.appendix.querySelector(".◆graphic-preview")!
    assert(preview && view.getComputedStyle(preview).filter.includes("#overflow"), "drag preview lost overflow fading")
    doc.dispatchEvent(new view.PointerEvent("pointercancel", {bubbles:true, pointerId:2}))
    editor.features.graphic.actions.navigateGraphic({type:"navigateGraphic", operation:"zoom-in"})
    graphic.style.rotate = "12deg"
    graphic.style.width = "500px"
    await layoutFrame()
    const updated = decodeURIComponent(view.getComputedStyle(graphic).filter.match(/data:image\/svg\+xml,([^"#]+)/)![1])
    assert(updated.includes('width="500" height="300" result="inside"'), "overflow boundary did not follow resize, rotation and zoom")
    assert(!editor.toHTML(true).includes("#overflow"), "overflow presentation entered saved HTML")
    const resizedStyle = graphic.getAttribute("style")
    editor.features.graphic.disable()
    assert(!view.getComputedStyle(graphic).filter.includes("#overflow"), "overflow filter survived feature teardown")
    assert(graphic.getAttribute("style") === resizedStyle, "teardown changed authored styles")
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove()
  }
})

await check("editing affordances align with media inside symmetric scrollbar gutters", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:450px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "gutter affordance fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    doc.body.innerHTML = '<p style="height:100px">Before media</p><picture style="width:400px;height:220px"><img></picture><p style="height:1200px">After media</p>'
    const picture = doc.querySelector("picture")!
    editor.features.selection.captureElement(picture)
    for(const gutter of ["stable both-edges", "auto", "stable both-edges"]) {
      doc.documentElement.style.scrollbarGutter = gutter
      for(const scroll of [0, 80]) {
        view.scrollTo(0, scroll)
        await layoutFrame()
        editor.features.transformation.updateInfo()
        editor.features.media.refreshPlaceholder()
        const target = picture.getBoundingClientRect()
        for(const element of [editor.features.transformation.overlay, editor.features.selection.selectionCaret!, editor.features.media.placeholder.element]) {
          const box = element.getBoundingClientRect()
          for(const key of ["left", "top", "width", "height"] as const) assert(Math.abs(box[key] - target[key]) < 1, `${element.className} ${key} drifted with ${gutter}: ${box[key]} vs ${target[key]}`)
        }
      }
    }
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove()
  }
})

await check("document background reaches the left edge without shifting the reading column", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:400px;border:0;max-width:none"
  const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once:true}))
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style></head><body><p>Centered reading column</p></body>`
  fixture.append(frame)
  try {
    await loaded
    const doc = frame.contentDocument!, view = frame.contentWindow!, paragraph = doc.querySelector("p")!
    assert(view.getComputedStyle(doc.documentElement).scrollbarGutter === "stable", "document did not reserve the trailing scrollbar gutter")
    for(const theme of documentThemes) {
      doc.querySelector("head style")!.textContent = theme.source
      assert(view.getComputedStyle(doc.body).backgroundColor === "rgba(0, 0, 0, 0)", `${theme.value} document body did not stay transparent`)
      const color = theme.value === "sakura" ? "rgb(249, 249, 249)" : "rgb(255, 255, 255)"
      assert(view.getComputedStyle(doc.documentElement).backgroundColor === color, `${theme.value} did not paint its document background on html`)
      assert(Math.abs(doc.documentElement.getBoundingClientRect().left) < 1, `${theme.value} left a leading scrollbar gutter`)
    }
    doc.documentElement.style.backgroundColor = "rgb(213, 230, 247)"
    assert(view.getComputedStyle(doc.documentElement).backgroundColor === "rgb(213, 230, 247)", "document root did not paint the page background")
    const before = paragraph.getBoundingClientRect()
    const content = doc.createElement("div")
    content.style.height = "2000px"
    doc.body.append(content)
    await layoutFrame()
    const after = paragraph.getBoundingClientRect()
    assert(Math.abs((after.left + after.right) / 2 - view.innerWidth / 2) < 1,
      `scrolling document column is not centered in its viewport (${(after.left + after.right) / 2} vs ${view.innerWidth / 2}; balance ${view.getComputedStyle(doc.body).getPropertyValue("--ww-leading-gutter-balance")}; padding ${view.getComputedStyle(doc.body).paddingInlineStart})`)
    assert(Math.abs(before.left - after.left) < 1 && Math.abs(before.width - after.width) < 1, "scrollbar appearance shifted the reading column")
    for(const width of [480, 1400]) {
      frame.style.width = `${width}px`
      await layoutFrame()
      const rect = paragraph.getBoundingClientRect()
      assert(Math.abs((rect.left + rect.right) / 2 - view.innerWidth / 2) < 1,
        `document column is not centered at ${width}px`)
    }
    for(const mode of ["ww-canvas", "ww-slides", "ww-board"]) {
      doc.body.className = mode
      assert(view.getComputedStyle(doc.documentElement).scrollbarGutter === "auto", `${mode} inherited document scrollbar gutters`)
    }
  }
  finally { frame.remove() }
})

await check("empty Details retains summary height and padding in standalone documents", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:720px;height:600px;max-width:none;border:0"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "empty Details fixture did not initialize")
    const doc = frame.contentDocument!, theme = doc.createElement("style")
    theme.setAttribute("data-ww-theme", "base")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    doc.body.innerHTML = '<details><summary></summary></details><details><summary><br></summary></details><details><summary>Heading</summary></details><details style="padding:16px 24px 32px"><summary></summary></details>'
    await layoutFrame()
    const saved = document.createElement("iframe")
    saved.style.cssText = frame.style.cssText
    saved.setAttribute("sandbox", "allow-same-origin")
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once:true}))
    saved.srcdoc = await view.editor!.serializeHTML()
    fixture.append(saved)
    try {
      await loaded
      for(const width of [720, 360]) {
        saved.style.width = `${width}px`
        await layoutFrame()
        const savedDoc = saved.contentDocument!, savedView = saved.contentWindow!
        const details = Array.from(savedDoc.querySelectorAll("details"))
        const filled = details[2].getBoundingClientRect()
        for(const element of details) {
          const summary = element.querySelector("summary")!
          const style = savedView.getComputedStyle(element), summaryStyle = savedView.getComputedStyle(summary)
          const box = element.getBoundingClientRect(), heading = summary.getBoundingClientRect()
          const lineHeight = parseFloat(summaryStyle.lineHeight)
          assert(heading.height >= lineHeight - 1, "empty summary collapsed around its floated disclosure icon")
          assert(heading.top >= box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) - 1, "summary lost top padding")
          assert(heading.bottom <= box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom) + 1, "summary lost bottom padding")
          if(!element.hasAttribute("style")) assert(Math.abs(box.height - filled.height) < 1, "empty Details height differs from a one-line heading")
          summary.click()
          assert(element.open, "empty summary no longer toggles native disclosure")
          element.open = false
        }
      }
    }
    finally { saved.remove() }
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove()
  }
})

await check("table presets respect whole-table and cell selections without changing layout", async () => {
  const {ElementStyleEditor} = await import("../src/components/element-style-editor")
  const controls = new ElementStyleEditor()
  controls.mode = "compact"
  controls.showPresets = true
  controls.propertyNames = []
  controls.style.cssText = "display:block;width:280px"
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:600px;height:400px;max-width:none"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style></head><body><section><!--keep--><table style="width:100%"><thead><tr><th colspan="2">Heading</th></tr></thead><tbody><tr><td style="width:40%"><p>First cell</p></td><td>Second cell</td></tr></tbody></table><p>After table</p></section><script type="module" src="/tests/native-browser-frame.ts?proofreading-disabled"></script></body>`
  fixture.append(controls, frame)
  try {
    for(let attempt = 0; attempt < 200 && !frame.contentWindow?.editor; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const editor = frame.contentWindow?.editor
    assert(editor, `table preset editor failed: ${frame.contentWindow?.editorError}`)
    const doc = frame.contentDocument!, view = frame.contentWindow!
    const table = doc.querySelector("table")!, cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("th, td"))
    const descendants = Array.from(table.querySelectorAll("*"))
    controls.addEventListener("element-style-change", event => {
      editor!.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: (event as CustomEvent).detail.styles})
    })
    for(const selection of ["table", "cell", "all cells"]) {
      table.removeAttribute("style")
      table.style.width = "100%"
      for(const cell of cells) cell.removeAttribute("style")
      cells[1].style.width = "40%"
      editor!.features.table.clearCellSelection(false)
      if(selection === "table") {
        const range = doc.createRange()
        range.selectNode(table)
        doc.getSelection()!.removeAllRanges()
        doc.getSelection()!.addRange(range)
      }
      else editor!.features.table.selectCells(selection === "cell" ? cells[1] : cells[0], selection === "cell" ? cells[1] : cells[2])
      const selected = selection === "cell" ? [cells[1]] : cells
      controls.state = editor!.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true})
      await controls.updateComplete
      while(!controls.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Previous style presets"]')!.disabled) {
        controls.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Previous style presets"]')!.click()
        await controls.updateComplete
      }
      for(let page = 0; page < 4; page++) {
        for(const button of controls.shadowRoot!.querySelectorAll<HTMLButtonElement>(".style-gallery button")) {
          button.click()
          const expected = selection === "table" ? table.style.backgroundColor : cells[1].style.backgroundColor
          for(const cell of selected) {
            const computed = view.getComputedStyle(cell), box = cell.getBoundingClientRect(), tableBox = table.getBoundingClientRect()
            assert(computed.backgroundColor === expected, `${selection}: preset color is hidden by theme cell paint`)
            assert(computed.display === "table-cell" && computed.paddingTop === "8px", `${selection}: preset broke cell layout or padding`)
            assert(box.width > 0 && box.height > 0 && box.left >= tableBox.left - 1 && box.right <= tableBox.right + 1,
              `${selection}: cell escaped table bounds`)
            for(const property of ["margin", "position", "transform", "box-shadow", "border-radius"]) {
              assert(!cell.style.getPropertyValue(property), `${selection}: preset added cell ${property}`)
            }
          }
          assert(cells[1].style.width === "40%" && !cells[0].style.width && !cells[2].style.width, "preset changed authored cell sizing")
          assert(table.style.width === "100%" && !table.style.margin, "preset changed table sizing or margins")
          if(selection === "cell") assert(!cells[0].style.backgroundColor && !cells[2].style.backgroundColor && !table.style.backgroundColor,
            "individual preset escaped the selected cell")
          assert(descendants.every((node, index) => table.querySelectorAll("*")[index] === node), "preset rebuilt authored table content")
          assert(controls.shadowRoot!.querySelector<HTMLElement>(".style-gallery")!.scrollWidth <= 280, "preset gallery overflows the toolbox")
        }
        if(page < 3) {
          controls.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Next style presets"]')!.click()
          await controls.updateComplete
        }
      }
    }
    assert(!editor!.toHTML(true).includes("◆"), "table preset export contains editing markers")
  }
  finally {frame.contentWindow?.editor?.destroy(); frame.remove(); controls.remove()}
})

await check("details remain intact after applying style presets", async () => {
  const {ElementStyleEditor} = await import("../src/components/element-style-editor")
  const controls = new ElementStyleEditor()
  controls.mode = "compact"
  controls.showPresets = true
  controls.propertyNames = []
  controls.state = {target: {localName: "details", namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:600px;height:400px;max-width:none"
  const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style></head><body><details><summary>Summary</summary>Bare text<p>Body</p><!--keep--></details></body>`
  fixture.append(controls, frame)
  try {
    await loaded
    await controls.updateComplete
    const doc = frame.contentDocument!, details = doc.querySelector("details")!, summary = details.querySelector("summary")!
    const children = Array.from(details.childNodes)
    controls.addEventListener("element-style-change", event => {
      const styles = (event as CustomEvent<{styles: Record<string, {value: string, priority: string}>}>).detail.styles
      for(const [name, declaration] of Object.entries(styles)) details.style.setProperty(name, declaration.value, declaration.priority)
    })
    for(let page = 0; page < 4; page++) {
      for(const button of controls.shadowRoot!.querySelectorAll<HTMLButtonElement>(".style-gallery button")) {
        button.click()
        for(const direction of ["ltr", "rtl"]) {
          doc.documentElement.dir = direction
          for(const open of [false, true]) {
            details.open = open
            const box = details.getBoundingClientRect(), heading = summary.getBoundingClientRect()
            const range = doc.createRange()
            range.selectNodeContents(summary)
            const text = range.getBoundingClientRect()
            assert(heading.left >= box.left && heading.right <= box.right, `summary escaped preset border (${direction}, open=${open})`)
            assert(text.left >= box.left && text.right <= box.right, `summary text escaped preset border (${direction}, open=${open})`)
            summary.click()
            assert(details.open !== open, "preset broke native disclosure toggling")
            assert(children.every((child, index) => details.childNodes[index] === child), "preset changed authored disclosure content")
          }
        }
      }
      if(page < 3) {
        controls.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Next style presets"]')!.click()
        await controls.updateComplete
      }
    }
  }
  finally { frame.remove(); controls.remove() }
})

await check("saved document module references do not poison trusted widget loading", async () => {
  const {editorFrameHTML} = await import("../src/frame-document")
  const script = `data:text/javascript,${encodeURIComponent('customElements.define("saved-document-widget", class extends HTMLElement {})')}`
  const pkg = {name: "saved-document-fixture", version: "1.0.0", label: "Fixture", authors: [], keywords: [], links: {},
    scripts: [script], styles: [], members: []}
  const frame = document.createElement("iframe")
  const authored = `<script type="module" class="authored" src="${script}">window.authoredModuleRan = true</script>`
  frame.srcdoc = editorFrameHTML(`<html><head>${authored}</head><body><saved-document-widget></saved-document-widget>${authored.replace('class="authored" ', '')}</body></html>`, {
    bridgeNonce: crypto.randomUUID(), hostOrigin: location.origin, revision: 0, language: "en", packages: [pkg],
    entryURL: new URL("./native-browser-frame.ts?proofreading-disabled", import.meta.url).href, executeScripts: true,
  })
  fixture.append(frame)
  try {
    await new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, authoredModuleRan?: boolean}
    assert(view.editor, `saved document editor did not initialize: ${view.editorError}`)
    const doc = frame.contentDocument!
    assert(doc.head.querySelector("script.authored")?.outerHTML === authored, "authored head module attributes changed")
    assert(doc.body.querySelector("script")?.outerHTML === authored.replace('class="authored" ', ''), "authored body module attributes changed")
    assert(!doc.querySelector(".◆pending-module"), "temporary module markers were not cleaned up")
    assert(!doc.querySelector("saved-document-widget")?.matches(":defined"), "authored module ran before the trusted loader")
    await view.editor!.getActionHandler("load-widgets")({type: "load-widgets", widgets: [{name: pkg.name, version: pkg.version}], packages: [pkg], importMap: {}})
    assert(doc.querySelector("saved-document-widget")?.matches(":defined"), "saved document widget was not registered")
    assert(!view.authoredModuleRan, "authored inline module content executed")
    const exported = view.editor!.toHTML(false, false)
    assert(exported.includes(authored), "serialization lost the authored module")
    assert(!exported.includes("◆pending-module"), "serialization retained module startup artifacts")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("collaborated scripts remain inert with namespace prefixes, clones and later edits", async () => {
  const root = document.createElement("main"), result = document.createElement("output")
  result.id = "native-script-execution"
  root.innerHTML = "<p>seed</p>"
  fixture.append(root, result)
  const shared = new SharedDOMDoc("", "native-script-audit", [], ["◆"], {root, connect: false})
  const source = 'document.querySelector("#native-script-execution").textContent += "executed;"'
  try {
    // Confirm this fixture permits script execution, so CSP cannot mask a failure.
    const control = document.createElement("script")
    control.textContent = source
    root.append(control)
    assert(result.textContent === "executed;", "positive execution control failed")
    control.remove()
    result.textContent = ""
    for(const [namespace, name] of [
      ["http://www.w3.org/1999/xhtml", "script"],
      ["http://www.w3.org/1999/xhtml", "h:script"],
      ["http://www.w3.org/2000/svg", "script"],
      ["http://www.w3.org/2000/svg", "svg:script"],
    ]) {
      const script = new Y.XmlElement("script")
      script.setAttribute("__domeditor_namespace", namespace)
      script.setAttribute("__domeditor_qualified_name", name)
      script.insert(0, [new Y.XmlText(source)])
      shared.doc.transact(() => shared.body.insert(shared.body.length, [script]), "remote-client")
      const rendered = root.lastElementChild!
      assert(rendered.namespaceURI === namespace && rendered.localName === "script", "script namespace changed")
      assert(rendered.prefix === (name.includes(":") ? name.split(":")[0] : null), "script prefix changed")
      root.append(rendered.cloneNode(true))
      rendered.textContent = source
      rendered.setAttribute(namespace.includes("svg") ? "href" : "src", `data:text/javascript,${encodeURIComponent(source)}`)
      root.append(rendered.cloneNode(true))
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    assert(result.textContent === "", `authored script executed: ${result.textContent}`)
  }
  finally { shared.destroy(); root.remove(); result.remove() }
})

const dragTextInside = (editor: DOMEditor, element: HTMLElement) => {
  const doc = element.ownerDocument, text = element.firstChild!, range = doc.createRange()
  editor.features.selection.selectElement(element)
  element.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
  assert(doc.defaultView!.getComputedStyle(editor.features.selection.hoverCaret!).display === "none", "selected root retains a dotted hover outline")
  assert(!editor.appendix.querySelector('[part~="node-drag-surface"]'), "item interior is covered by a node drag surface")
  range.setStart(text, 1); range.collapse(true)
  const start = range.getBoundingClientRect()
  range.setStart(text, 7)
  const end = range.getBoundingClientRect(), y = start.top + start.height / 2
  const hit = doc.elementFromPoint(start.left, y)!
  assert(element === hit || element.contains(hit), "item interior is covered by an overlay")
  const style = element.getAttribute("style")
  hit.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 19, clientX: start.left, clientY: y}))
  for(const [x, outsideY] of [[start.left - 2000, y], [start.left + 2000, y], [start.left, y - 2000], [start.left, y + 2000]]) {
    doc.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 19, clientX: x, clientY: outsideY}))
    const selection = doc.getSelection()!
    assert(element.contains(selection.anchorNode) && element.contains(selection.focusNode), "text drag escaped its starting canvas/slide root")
  }
  doc.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 19, clientX: end.left, clientY: y}))
  doc.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 19, clientX: end.left, clientY: y}))
  assert(!doc.getSelection()?.isCollapsed && element.contains(doc.getSelection()!.anchorNode) && element.contains(doc.getSelection()!.focusNode), "dragging inside an item did not select text")
  assert(element.getAttribute("style") === style, "dragging text moved or resized the item")
  const edge = editor.features.transformation.overlay.querySelector<HTMLElement>(".◆transform-overlay-edge")!
  assert(edge.dataset.transformMode === "move" && getComputedStyle(edge).cursor === "grab", "item borders do not offer moving")
  const overlay = editor.features.transformation.overlay, box = element.getBoundingClientRect()
  for(const name of ["mover", "orderer"]) assert(getComputedStyle(overlay.querySelector(`#◆transform-overlay-${name}`)!).display === "none", "obsolete move/layers affordance is visible")
  for(const direction of ["up", "down", "left", "right"]) {
    const handle = overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}-${direction}`)!, rect = handle.getBoundingClientRect()
    assert(!handle.hidden && handle.dataset.transformMode === "scale", "edge-center resize affordance is missing")
    assert(direction === "up" || direction === "down" ? Math.abs(rect.left + rect.width / 2 - (box.left + box.width / 2)) < 1
      : Math.abs(rect.top + rect.height / 2 - (box.top + box.height / 2)) < 1, "resize affordance is not centered on its edge")
  }
  const rotator = overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!, topHandle = overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-up-up")!
  const rotateRect = rotator.getBoundingClientRect(), topRect = topHandle.getBoundingClientRect(), stem = getComputedStyle(rotator, "::after")
  const scale = rotateRect.height / parseFloat(getComputedStyle(rotator).height)
  const ends = [parseFloat(stem.top), parseFloat(stem.top) + parseFloat(stem.height)].map(y => rotateRect.top + y * scale)
  assert(Math.abs(rotateRect.left + rotateRect.width / 2 - (topRect.left + topRect.width / 2)) < 1
    && ends.some(y => y >= topRect.top - 1 && y <= topRect.bottom + 1), "rotation stem does not connect to the top resize handle")
}

const checkFreeformCapture = async (editor: DOMEditor, parent: HTMLElement) => {
  const doc = parent.ownerDocument
  const widget = doc.createElement("native-capture-parity-widget"), button = doc.createElement("button")
  button.textContent = "Widget control"
  widget.attachShadow({mode: "closed"}).append(button)
  const graphic = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
  graphic.setAttribute("viewBox", "0 0 180 80")
  graphic.innerHTML = '<rect width="180" height="80" fill="blue"/>'
  for(const [element, target] of [[widget, button], [graphic, graphic.firstElementChild!]] as const) {
    const point = editor.features.canvas.active ? editor.features.canvas.clientPoint(100, 100) : {x: 100, y: 100}
    element.style.cssText = `position:absolute;left:${point.x}px;top:${point.y}px;width:180px;height:80px;margin:0`
    parent.append(element)
    try {
      editor.features.selection.selectElement(element)
      await layoutFrame()
      const box = target.getBoundingClientRect()
      target.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 81, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2}))
      if(target === button) button.focus()
      doc.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 81}))
      await layoutFrame()
      assert(editor.features.selection.captureSelectedElement === element, "freeform item did not enter capture through its content")
      const frame = editor.features.transformation.overlay
      assert(getComputedStyle(frame).outlineStyle === "solid", "captured freeform item does not have the document's solid outline")
      editor.features.selection.selectionCaret!.querySelector(".◆capture-edge")!
        .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
      assert(!editor.features.selection.isCaptureSelection, "freeform frame did not release capture")
      assert(getComputedStyle(frame).outlineStyle === "dotted", "element-selected freeform item retained a capture outline")
    }
    finally { element.remove() }
  }
}

customElements.define("native-audit-widget", class extends HTMLElement {
  connectedCallback() { if(!this.shadowRoot) this.attachShadow({mode: "open"}).innerHTML = "<button>private</button>" }
})

const editor = new DOMEditor()

await check("drag selection defers node selection until release", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "Drag across this element"
  fixture.append(paragraph)
  const details: Array<{nodeSelected?: boolean, element?: unknown}> = []
  const listener = (event: Event) => details.push((event as CustomEvent).detail)
  window.addEventListener(selectionChangeEvent, listener)
  try {
    await layoutFrame()
    const text = paragraph.firstChild!
    $.move(text, 1)
    const rect = caretRect(text, 1)
    const dispatch = (type: string, buttons: number) => paragraph.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, cancelable: true, pointerType: "mouse", pointerId: 71,
      button: 0, buttons, clientX: rect.left, clientY: rect.top + rect.height / 2,
    }))
    dispatch("pointerdown", 1)
    assert(editor.features.selection.isInDragSelection, "pointerdown did not start the document drag")
    dispatch("lostpointercapture", 1)
    const previousPresence = JSON.stringify(editor.doc.awareness.getLocalState()?.selection)
    $.selectElement(paragraph)
    document.dispatchEvent(new Event("selectionchange"))
    assert(editor.features.selection.isInDragSelection, "capture loss ended a held drag")
    assert(!paragraph.classList.contains("◆element-selected") && !document.body.classList.contains("◆node-selection-active"), "drag displayed a node selection")
    assert(!details.at(-1)?.nodeSelected && !details.at(-1)?.element, "drag published a node selection to the host")
    assert(JSON.stringify(editor.doc.awareness.getLocalState()?.selection) === previousPresence, "drag published an element selection to collaborators")

    dispatch("pointerup", 0)
    assert(!editor.features.selection.isInDragSelection, "pointerup left the drag active")
    assert(paragraph.classList.contains("◆element-selected") && details.at(-1)?.nodeSelected, "release did not publish the final node selection")
    assert(JSON.stringify(editor.doc.awareness.getLocalState()?.selection) !== previousPresence, "release did not publish the final selection to collaborators")
  }
  finally {
    window.removeEventListener(selectionChangeEvent, listener)
    paragraph.remove()
  }
})

await check("widget shadow interactions capture hosts while slotted children stay editable", async () => {
  editor.schema.extendWidgets([{tagName: "native-content-capture-widget", editingConfig: {content: "flow*"}}])
  for(const mode of ["open", "closed"] as const) {
    const widget = document.createElement("native-content-capture-widget")
    widget.tabIndex = -1
    widget.innerHTML = '<p>Authored <b>child text</b></p>'
    const root = widget.attachShadow({mode})
    root.innerHTML = '<div role="toolbar">Top bar</div><input value="2000"><slot></slot>'
    const input = root.querySelector("input")!, paragraph = widget.querySelector("p")!
    fixture.append(widget)
    try {
      await layoutFrame()
      root.querySelector('[role="toolbar"]')!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
      widget.focus()
      document.getSelection()!.setPosition(widget.parentNode!, Array.from(widget.parentNode!.childNodes).indexOf(widget))
      document.dispatchEvent(new Event("selectionchange"))
      await layoutFrame()
      assert(editor.features.selection.captureSelectedWidget === widget, `${mode} top-bar host focus lost capture`)
      assert(!document.body.classList.contains("◆gap-caret-visible"), `${mode} top bar painted a gap instead of capture`)
      assert(editor.features.selection.selectionCaret!.getAttribute("part")!.includes("selection-caret-capture"), `${mode} top bar lost the capture outline`)
      assert(getComputedStyle(widget).outlineStyle === "none", `${mode} top bar retained the native inner focus outline`)
      input.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
      input.focus()
      input.setSelectionRange(1, 3)
      document.dispatchEvent(new Event("selectionchange"))
      assert(editor.features.selection.captureSelectedWidget === widget, `${mode} shadow input did not capture its host`)
      assert(input.selectionStart === 1 && input.selectionEnd === 3, `${mode} shadow input lost its native selection`)
      assert(widget.classList.contains("◆element-capture-selected"), "capture outline marker is missing")
      const caret = editor.features.selection.selectionCaret!
      assert(getComputedStyle(caret).display !== "none", "capture outline is hidden")
      assert(caret.getBoundingClientRect().width > 0, "capture outline has no width")
      const beforeinput = new InputEvent("beforeinput", {bubbles: true, composed: true, cancelable: true, inputType: "insertText", data: "1"})
      input.dispatchEvent(beforeinput)
      assert(!beforeinput.defaultPrevented, "capture blocked native shadow input")

      paragraph.querySelector("b")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
      input.blur()
      const text = paragraph.querySelector("b")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 1, text, 5)
      document.dispatchEvent(new Event("selectionchange"))
      await layoutFrame()
      assert(!editor.features.selection.isCaptureSelection, "slotted authored child retained widget capture")
      assert(document.getSelection()!.toString() === "hild", "slotted child text selection was changed")
      assert(!editor.toHTML(true).includes("◆"), "capture artifacts leaked into serialized content")
    }
    finally { input.blur(); widget.remove() }
  }
})

await check("widget-created hints retain their caret and inherit popup text colors", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:700px;height:350px"
  frame.srcdoc = '<!doctype html><body><p>Outside</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "hint fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const widgets = [
      {tagName: "native-hint-task", editingConfig: {content: "flow*"}},
      {tagName: "native-hint-content", editingConfig: {content: "p"}},
    ]
    editor.schema.extendWidgets(widgets)
    const theme = doc.createElement("style"), widgetStyle = doc.createElement("style")
    widgetStyle.textContent = documentWidgetStyleSource(widgets)
    doc.head.append(theme, widgetStyle)
    const task = doc.createElement("native-hint-task")
    const root = task.attachShadow({mode: "open"})
    root.innerHTML = '<button>Add hint</button><div style="color:rgb(250, 250, 250);background:#444;max-width:200px;padding:8px"><slot name="hint"></slot></div>'
    doc.body.append(task)
    editor.features.widget.refresh()
    const button = root.querySelector("button")!
    button.addEventListener("click", () => {
      const hint = doc.createElement("native-hint-content")
      hint.slot = "hint"
      hint.attachShadow({mode: "open"}).innerHTML = '<slot></slot>'
      task.append(hint)
      doc.getSelection()!.setBaseAndExtent(hint, 0, hint, 0)
    })
    button.dispatchEvent(new doc.defaultView!.PointerEvent("pointerdown", {button: 0, bubbles: true, composed: true, cancelable: true}))
    button.focus()
    button.click()
    await layoutFrame()
    const hint = task.firstElementChild!, paragraph = hint.querySelector("p")!
    assert(paragraph && doc.getSelection()!.anchorNode === paragraph, "widget-created caret did not enter its required paragraph")
    assert(!editor.features.selection.isCaptureSelection, "hint selection retained shadow button capture")
    doc.execCommand("insertText", false, "Helpful hint")
    assert(paragraph.textContent === "Helpful hint", "native typing escaped the hint")
    for(const preset of documentThemes) {
      theme.textContent = preset.source
      assert(view.getComputedStyle(paragraph).color === "rgb(250, 250, 250)", `${preset.value} theme overrode the popup text color`)
    }
    paragraph.style.color = "rgb(255, 200, 100)"
    assert(view.getComputedStyle(paragraph).color === "rgb(255, 200, 100)", "widget defaults overrode an authored color")
    assert(!editor.toHTML(true).includes("◆"), "hint editing artifacts leaked into serialization")
  }
  finally {
    ;(frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove()
  }
})

await check("nested widget pages keep insertion, splitting and deletion inside their hosts", async () => {
  const originalSchema = editor.schema
  const placeholder = editor.features.media.placeholder
  editor.schema = new Schema()
  editor.schema.extendWidgets([
    {tagName: "native-organizer", editingConfig: {content: "native-organizer-page*"}},
    {tagName: "native-organizer-page", editingConfig: {content: "flow*"}},
  ])
  const organizer = document.createElement("native-organizer")
  organizer.innerHTML = '<native-organizer-page node-id="first"></native-organizer-page><native-organizer-page node-id="second"><p>Other page</p></native-organizer-page>'
  const page = organizer.firstElementChild as HTMLElement
  const other = organizer.lastElementChild!
  const root = organizer.attachShadow({mode: "open", slotAssignment: "manual"})
  root.innerHTML = '<section style="padding:32px"><slot></slot><button>Private toolbar</button></section>'
  root.querySelector("slot")!.assign(page, other)
  const pageRoot = page.attachShadow({mode: "open"})
  pageRoot.innerHTML = '<slot></slot><input value="Private UI">'
  fixture.append(organizer)
  editor.features.widget.refresh()
  const key = (key: string, extra = {}) => {
    const event = new KeyboardEvent("keydown", {key, bubbles: true, composed: true, cancelable: true, ...extra})
    page.dispatchEvent(event)
    return event
  }
  try {
    await layoutFrame()
    page.focus()
    $.move(page)
    const input = new InputEvent("beforeinput", {inputType: "insertText", data: "abcd", bubbles: true, composed: true, cancelable: true})
    page.dispatchEvent(input)
    assert(input.defaultPrevented && page.querySelector("p")?.textContent === "abcd", "typing did not materialize a page paragraph")
    $.move(page.querySelector("p")!.firstChild!, 2)
    assert(key("Enter", {ctrlKey: true, metaKey: true}).defaultPrevented, "page host Enter was ignored")
    assert(page.querySelectorAll("p").length === 2 && page.children[0].textContent === "ab" && page.children[1].textContent === "cd", "Enter did not split inside the page")
    assert(organizer.children.length === 2 && organizer.lastElementChild === other, "Enter split a widget host")
    key("Backspace")
    assert(page.querySelectorAll("p").length === 1 && page.textContent === "abcd", "Backspace did not reverse the paragraph split")
    $.move(page.querySelector("p")!.firstChild!, 2)
    editor.features.manipulation.actions.insert({type: "insert", html: '<img alt="Example" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2240%22/%3E">'})
    assert(page.querySelector("img") && page.querySelectorAll("p").length === 2, "image insertion escaped the page")
    assert(!editor.features.selection.isCaptureSelection, "page text editing became widget capture")
    const image = page.querySelector("img")!
    image.removeAttribute("src")
    placeholder.showFor(image.closest("picture") ?? image)
    placeholder.root.querySelector<HTMLInputElement>(".url")!.value = new URL("/assets/app-icon-transparent.svg", location.href).href
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
    assert(image.hasAttribute("src"), "image source picker retained the schema from before package loading")
    $.move(page.querySelector("p")!.firstChild!, 0)
    key("Backspace")
    assert(page.textContent === "abcd" && other.textContent === "Other page", "boundary deletion changed a sibling page")
    page.replaceChildren()
    $.move(page)
    key("Backspace")
    key("Delete")
    assert(page.isConnected && document.getSelection()!.anchorNode === page, "empty page deletion lost the page or caret")
    key("Enter")
    assert(page.firstElementChild?.localName === "p", "empty page Enter did not create an editing target")
    const graphic = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    graphic.setAttribute("viewBox", "0 0 100 100")
    graphic.innerHTML = '<rect width="100" height="100" fill="steelblue"/>'
    graphic.style.cssText = "display:block;width:240px;height:120px"
    page.style.cssText = "display:block;padding:40px 16px"
    for(const [placement, surface] of [["before", "page"], ["after", "page"], ["before", "slot padding"], ["after", "slot padding"]] as const) {
      page.replaceChildren(graphic)
      await layoutFrame()
      editor.features.selection.captureElement(graphic)
      const rect = graphic.getBoundingClientRect()
      const boundary = surface === "page" ? rect : page.getBoundingClientRect()
      const pointer = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0,
        clientX: rect.left + rect.width / 2, clientY: placement === "before" ? boundary.top - 10 : boundary.bottom + 10})
      ;(surface === "page" ? page : root.querySelector("section")!).dispatchEvent(pointer)
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true}))
      assert(pointer.defaultPrevented, `${placement} page gap was left to native text selection`)
      assert($.anchor === page && $.anchorOffset === (placement === "before" ? 0 : 1) && $.isGapSelection, `${placement} graphic gap escaped its page`)
      assert(!editor.features.selection.isCaptureSelection && graphic.classList.contains(`◆gap-${placement}-selected`), `${placement} gap retained graphic or widget capture`)
      assert(document.body.classList.contains("◆gap-caret-visible"), `${placement} page gap caret is hidden`)
      page.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Inserted", bubbles: true, composed: true, cancelable: true}))
      assert(page.querySelector("p")?.textContent === "Inserted" && graphic.isConnected, "typing at a graphic gap did not stay in the page")
    }
    const paragraph = page.querySelector("p")!
    const textRange = document.createRange()
    textRange.selectNodeContents(paragraph)
    const textRect = textRange.getBoundingClientRect()
    const textPointer = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0,
      clientX: textRect.left + textRect.width / 2, clientY: textRect.top + textRect.height / 2})
    paragraph.dispatchEvent(textPointer)
    assert(!textPointer.defaultPrevented && !editor.features.selection.isInDragSelection, "slotted text clicks lost native selection")
    const privateInput = pageRoot.querySelector("input")!
    privateInput.focus()
    const privateKey = new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, composed: true, cancelable: true})
    privateInput.dispatchEvent(privateKey)
    assert(!privateKey.defaultPrevented, "page commands intercepted private shadow input")
    assert(!editor.toHTML(true).includes("◆"), "page editing markers leaked into serialized content")
  }
  finally { pageRoot.querySelector("input")!.blur(); organizer.remove(); editor.schema = originalSchema }
})

await check("global directional shorthands preserve authored overrides in native CSSOM", () => {
  const target = document.createElement("aside")
  document.body.append(target)
  try {
    target.setAttribute("style", "margin: 2px; margin-top: 3px")
    editor.features.manipulation.setElementStyles(target, {margin: "8px"})
    assert(target.style.getPropertyValue("margin-top") === "3px", "global margin replaced the authored top override")
    assert(target.style.getPropertyValue("margin-right") === "8px", `global margin did not update the right side: ${target.style.cssText}`)
    assert(getComputedStyle(target).marginBottom === "8px", "global margin did not affect the computed bottom side")

    target.setAttribute("style", "margin: 2px; margin-top: 3px")
    editor.features.manipulation.setElementStyles(target, {margin: "8px"})
    editor.features.manipulation.setElementStyles(target, {"margin-top": "4px"})
    editor.features.manipulation.setElementStyles(target, {opacity: "0.5"})
    editor.features.manipulation.setElementStyles(target, {margin: "10px"})
    assert(target.style.getPropertyValue("margin-top") === "4px", "successive global margin edit lost the direction after an opacity edit")
    assert(target.style.getPropertyValue("margin-right") === "10px", "successive global margin edit left a stale shorthand-expanded side")
    const styleState = editor.features.manipulation.getStyleState(["margin"], target, false)
    assert(styleState.authoredProperties?.includes("margin-top") && !styleState.authoredProperties.includes("margin-right"),
      "authored-property metadata included sides expanded from the global shorthand")

    target.setAttribute("style", "padding: 16px; padding-left: 8px")
    const paddingState = editor.features.manipulation.getStyleState(["padding"], target, false)
    assert(paddingState.authoredProperties?.join(",") === "padding,padding-left", "padding metadata does not match its raw declarations")
    assert(paddingState.inline.padding?.value === "16px", "padding shorthand projection lost its raw value")
    assert(paddingState.inline["padding-left"]?.value === "8px", "explicit padding-left projection lost its authored value")

    target.setAttribute("style", "margin: 2px; margin-top: 3px; margin-right: 4px; margin-bottom: 5px; margin-left: 6px")
    editor.features.manipulation.setElementStyles(target, {margin: "8px"})
    assert(["top", "right", "bottom", "left"].map(side => target.style.getPropertyValue(`margin-${side}`)).join(",") === "3px,4px,5px,6px",
      "global margin changed an authored side when every side was specified")
  }
  finally {target.remove()}
})

await check("gap carets track their authored boundary", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1200px!important;max-width:none;height:400px"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p></p></body>`
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {InputEvent: typeof InputEvent}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "gap fixture did not initialize")
    const doc = frame.contentDocument!, selection = doc.getSelection()!, feature = view.editor!.features.selection
    const emptyStyle = doc.createElement("style")
    doc.head.append(emptyStyle)
    for(const html of ["<p></p>", "<p><br></p>", "<p> </p>", "<p><span></span></p>", "<p></p><p></p>", "<p>Populated</p>", "<p>Before</p><p>After</p>",
      '<p style="margin-bottom:0px"></p>', '<p style="margin-bottom:47px"></p>',
      '<p style="--ww-block-spacing:3em;font-size:24px"></p>', "<h2>Heading</h2>", "<hr>",
      '<!--keep--><p></p>\n<!--keep too-->',
      '<p style="width:240px;height:80px">Resized</p>',
      '<hr style="width:240px">',
      '<ul><li>First</li><li>Last</li></ul>', '<ol><li>First</li><li>Last</li></ol>',
      '<dl><dt>Term</dt><dd>Definition</dd></dl>',
      '<ul><!--empty--></ul>',
      '<p style="width:100%;max-width:none">Wide block</p>',
      '<section><div id="gap-container" style="padding:24px;border:3px solid"><!--keep--><p style="width:200px;margin-inline:auto">Nested resized block</p></div></section>',
      '<main id="gap-container"><p style="width:240px">Resized in a landmark</p></main>']) {
      doc.body.innerHTML = html
      let container = doc.querySelector("#gap-container") ?? doc.body
      for(const offset of html.includes("<h2") || html.startsWith("<hr") ? [1] : Array.from({length: container.childNodes.length + 1}, (_, index) => index)) {
        selection.setPosition(container, offset)
        feature.processSelection(undefined, {scrollIntoView: false})
        await layoutFrame()
        // CSSOM changes and late layout can move an empty block without a
        // DOM mutation. Its box must not pull the caret out of the column.
        if(html === "<p></p>") {
          emptyStyle.sheet!.insertRule("p:empty { inline-size: 320px }")
          await layoutFrame()
        }
        const anchor = doc.querySelector<HTMLElement>(".◆gap-before-selected, .◆gap-after-selected")!
        assert(anchor, `missing gap anchor: html=${html}, offset=${offset}, selection=${selection.anchorNode?.nodeName}:${selection.anchorOffset}`)
        const box = anchor.getBoundingClientRect(), caret = feature.gapCaret!.getBoundingClientRect()
        const expected = anchor.classList.contains("◆gap-before-selected") ? box.top
          : box.bottom + (parseFloat(view.getComputedStyle(feature.gapCaret!).marginTop) || 0)
        assert(Math.abs(caret.top - expected) < 1,
          `gap caret is detached from its insertion boundary: offset=${offset}, caret=${caret.left},${caret.top}, anchor=${box.left},${expected}`)
        doc.body.dispatchEvent(new view.InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "Inserted"}))
        const inserted = Array.from(container.children).find(element => element.textContent === "Inserted")!
        assert(inserted && Math.abs(inserted.getBoundingClientRect().top - caret.top) < 1,
          `insertion misses the gap caret: html=${html}, offset=${offset}, caret=${caret.top}, inserted=${inserted?.getBoundingClientRect().top}`)
        assert(Math.abs(inserted.getBoundingClientRect().left - caret.left) < 1,
          `gap caret misses the content column: html=${html}, offset=${offset}, caret=${caret.left}, inserted=${inserted.getBoundingClientRect().left}`)
        feature.processSelection(undefined, {scrollIntoView: false})
        assert(!doc.querySelector(".◆gap-before-selected, .◆gap-after-selected"), "gap markers survived typing")
        assert(!view.editor!.toHTML(true).includes("◆"), "gap presentation leaked into serialized HTML")
        if(emptyStyle.sheet!.cssRules.length) emptyStyle.sheet!.deleteRule(0)
        doc.body.innerHTML = html
        container = doc.querySelector("#gap-container") ?? doc.body
      }
    }
    // Real hit testing resolves whitespace to list item text in Chromium.
    // Both pointer and keyboard navigation must retain the outer list gap.
    const listView = view as Window & typeof globalThis
    for(const tag of ["ul", "ol", "dl", "menu"]) {
      for(const placement of ["before", "after"] as const) {
        const before = placement === "before", itemTag = tag === "dl" ? "dt" : "li"
        doc.body.innerHTML = `<p>Before</p><${tag}><!--keep--><${itemTag}><b>Item</b></${itemTag}></${tag}><p>After</p>`
        const list = doc.querySelector(tag)!, text = list.querySelector("b")!.firstChild!
        const parent = list.parentElement!, index = Array.from(parent.childNodes).indexOf(list)
        const authored = list.innerHTML
        selection.setPosition(text, before ? 0 : 4)
        doc.dispatchEvent(new listView.KeyboardEvent("keydown", {key: before ? "ArrowUp" : "ArrowDown", bubbles: true, cancelable: true}))
        assert(selection.anchorNode === parent && selection.anchorOffset === index + (before ? 0 : 1), `${tag}: keyboard missed ${placement} gap`)
        assert(list.classList.contains(`◆gap-${placement}-selected`), `${tag}: missing ${placement} gap marker`)
        await layoutFrame()
        const box = list.getBoundingClientRect(), caret = feature.gapCaret!.getBoundingClientRect()
        assert(caret.width > 0 && Math.abs(caret.top - (before ? box.top : box.bottom + (parseFloat(view.getComputedStyle(list).marginBottom) || 0))) < 1,
          `${tag}: ${placement} gap caret misses list boundary`)
        selection.setPosition(text, 2)
        const x = box.left + box.width / 2, y = before ? box.top - 4 : box.bottom + 4
        const target = doc.elementFromPoint(x, y) ?? parent
        target.dispatchEvent(new listView.PointerEvent("pointerdown", {button: 0, pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, bubbles: true, cancelable: true}))
        target.dispatchEvent(new listView.PointerEvent("pointerup", {button: 0, pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, bubbles: true, cancelable: true}))
        assert(selection.anchorNode === parent && selection.anchorOffset === index + (before ? 0 : 1), `${tag}: pointer missed ${placement} gap`)
        doc.body.dispatchEvent(new view.InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "Outside"}))
        assert((before ? list.previousElementSibling : list.nextElementSibling)?.textContent === "Outside", `${tag}: typing did not stay outside the list`)
        assert(list.innerHTML === authored, `${tag}: gap editing changed list contents`)
        assert(!view.editor!.toHTML(true).includes("◆"), `${tag}: gap markers leaked into HTML`)
      }
    }
    doc.body.innerHTML = "<p>one one</p><!--keep--><p><span>two</span></p>"
    const second = doc.querySelectorAll("p")[1], text = second.querySelector("span")!.firstChild!
    selection.setPosition(doc.body, doc.body.childNodes.length)
    feature.processSelection(undefined, {scrollIntoView: false})
    assert(second.classList.contains("◆gap-after-selected"), "trailing gap did not select the second paragraph")
    const up = new (view as Window & typeof globalThis).KeyboardEvent("keydown", {key: "ArrowUp", bubbles: true, cancelable: true})
    doc.dispatchEvent(up)
    assert(up.defaultPrevented, "ArrowUp from the trailing gap was left to native navigation")
    assert(selection.anchorNode === text && selection.anchorOffset === 0, "ArrowUp skipped the adjacent paragraph")
    assert(!view.editor!.toHTML(true).includes("◆"), "gap navigation leaked markers into HTML")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("crop preview reveals the source and restores content outside the frame", async () => {
  // Let the separate lifecycle fixture finish taking its initial focus before
  // starting a gesture that correctly cancels on external selection changes.
  const lifecycle = document.querySelector<HTMLIFrameElement>("#lifecycle")!
  for(let attempt = 0; attempt < 100 && !lifecycle.contentWindow?.editor; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  document.body.focus({preventScroll: true})
  const image = document.createElement("img")
  image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="red"/><rect x="100" y="50" width="200" height="100" fill="blue"/></svg>')}`
  await image.decode()
  image.style.cssText = "width:200px;height:100px;object-fit:fill;object-position:0% 0%;object-view-box:inset(25%)"
  const picture = document.createElement("picture")
  picture.append(image)
  fixture.append(picture)
  try {
    editor.features.selection.captureElement(picture)
    await layoutFrame()
    const handle = editor.features.transformation.overlay.querySelector<HTMLElement>('[data-crop-direction="up-left"]')!
    const box = handle.getBoundingClientRect()
    const before = editor.toHTML(true)
    handle.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, clientX: box.left, clientY: box.top}))
    assert(document.body.classList.contains("◆transform-cropping-up-left"), "crop gesture did not start")
    await layoutFrame()
    const preview = editor.features.transformation.overlay.querySelector("canvas")!
    assert(!preview.hidden && preview.getBoundingClientRect().left < image.getBoundingClientRect().left,
      "original source is not revealed outside the cropped element")
    const pixel = preview.getContext("2d")!.getImageData(1, 1, 1, 1).data
    assert(pixel[0] === 255 && pixel[2] === 0, "preview does not show the previously cropped red source")
    document.dispatchEvent(new MouseEvent("pointermove", {bubbles: true, clientX: box.left - 100, clientY: box.top - 50}))
    assert(editor.toHTML(true) === before, "preview changed authored content before commit")
    document.dispatchEvent(new MouseEvent("pointerup", {bubbles: true}))
    await layoutFrame()
    assert(image.style.getPropertyValue("object-view-box") === "inset(0% 25% 25% 0%)", "outward drag did not restore source content")
    assert(preview.hidden && preview.width === 0, "crop preview was not cleared after commit")
  }
  finally { picture.remove(); editor.features.selection.processSelection() }
})

await check("video crop controls remain available after repeated crops", async () => {
  const video = document.createElement("video")
  video.controls = true
  video.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
  video.style.cssText = "width:320px;height:180px;object-fit:contain"
  Object.defineProperties(video, {videoWidth: {value: 640}, videoHeight: {value: 480}})
  fixture.append(video)
  try {
    editor.features.selection.captureElement(video)
    await layoutFrame()
    for(let attempt = 0; attempt < 2; attempt++) {
      const previous = video.style.getPropertyValue("object-view-box")
      const handle = editor.features.transformation.overlay.querySelector<HTMLElement>('[data-crop-direction="up-left"]')!
      const frame = handle.parentElement!
      assert(!frame.hidden, `crop controls hidden at attempt ${attempt}: ${video.style.cssText}; computed crop=${getComputedStyle(video).getPropertyValue("object-view-box")}; position=${getComputedStyle(video).objectPosition}`)
      const box = handle.getBoundingClientRect()
      assert(editor.appendix.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === handle,
        `crop handle cannot receive pointer input at attempt ${attempt}`)
      // Synthetic mouse events exercise native layout without requiring an
      // active browser pointer for setPointerCapture.
      handle.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, clientX: box.left, clientY: box.top}))
      document.dispatchEvent(new MouseEvent("pointermove", {bubbles: true, clientX: box.left + 20, clientY: box.top + 10}))
      document.dispatchEvent(new MouseEvent("pointerup", {bubbles: true}))
      await layoutFrame()
      assert(video.style.getPropertyValue("object-view-box") !== previous, "crop was not applied")
    }
    video.removeAttribute("src")
    await layoutFrame()
    assert(editor.features.transformation.overlay.querySelector<HTMLElement>(".◆transform-overlay-crop-frame")!.hidden,
      "empty video still exposes crop controls")
    assert(!editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: "inset(10%)"}),
      "empty video still accepts crop commands")
  }
  finally { video.remove(); editor.features.selection.processSelection() }
})

await check("media interiors capture while outline edges element-select", async () => {
  const audio = document.createElement("audio")
  audio.controls = true
  audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
  fixture.append(audio)
  try {
    editor.features.selection.captureElement(audio)
    document.dispatchEvent(new Event("selectionchange"))
    await layoutFrame()
    const selection = editor.features.selection
    assert(getComputedStyle(audio, "::selection").backgroundColor === "rgba(0, 0, 0, 0)",
      "captured media still has a blue selection fill")
    const box = audio.getBoundingClientRect()
    assert(box.width > 0 && box.height > 0, "native audio controls are invisible")
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    assert(hit === audio, `capture blocks native controls with ${hit?.localName}`)
    const down = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0})
    audio.dispatchEvent(down)
    assert(!down.defaultPrevented && selection.captureSelectedElement === audio, "native pointer action lost capture")
    const edge = selection.selectionCaret!.querySelector('[part~="selection-capture-edge-top"]')!
    edge.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
    assert(!selection.isCaptureSelection && $.selectedElement === audio, "outline did not element-select")
    const nodeOverlay = editor.appendix.querySelector('[part~="atomic-selection-overlay"]')!
    assert(nodeOverlay && getComputedStyle(nodeOverlay).backgroundColor !== "rgba(0, 0, 0, 0)",
      "element selection did not restore its blue selection fill")
    document.dispatchEvent(new Event("selectionchange"))
    await layoutFrame()
    const shield = Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆media-interaction-shield"))
      .find(surface => Math.abs(surface.getBoundingClientRect().top - box.top) < 1)!
    assert(shield, "element selection did not shield native controls")
    shield.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
    shield.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true}))
    document.dispatchEvent(new Event("selectionchange"))
    await layoutFrame()
    assert(selection.captureSelectedElement === audio && !shield.isConnected, "interior did not restore native interaction")
    assert(!editor.toHTML(true).includes("◆"), "selection artifacts leaked into serialization")
    const figure = document.createElement("figure"), caption = document.createElement("figcaption")
    audio.before(figure)
    figure.append(audio, caption)
    caption.textContent = "Captioned native audio controls"
    try {
      for(const above of [false, true]) {
        if(above) figure.prepend(caption)
        selection.captureElement(audio)
        await layoutFrame()
        const outline = selection.selectionCaret!.getBoundingClientRect(), bounds = figure.getBoundingClientRect()
        for(const key of ["left", "top", "width", "height"] as const) {
          assert(Math.abs(outline[key] - bounds[key]) < 1, `capture outline excludes the ${above ? "above" : "below"} caption (${key})`)
        }
        assert(selection.captureSelectedElement === audio, "caption outline replaced the native capture owner")
        const mediaBox = audio.getBoundingClientRect()
        assert(document.elementFromPoint(mediaBox.left + mediaBox.width / 2, mediaBox.top + mediaBox.height / 2) === audio,
          "caption outline blocks native audio controls")
        selection.selectionCaret!.querySelector('[part~="selection-capture-edge-bottom"]')!
          .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
        assert(!selection.isCaptureSelection && $.selectedElement === figure, "caption outline edge did not select the whole figure")
      }
    }
    finally { figure.replaceWith(audio) }
  }
  finally { audio.remove(); editor.features.selection.processSelection() }
})

await check("figure permalinks align with padded caption numbering", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:600px;height:500px;max-width:none"
  frame.srcdoc = `<!doctype html><head><style>${captionEnumerationCSS(defaultCaptionEnumeration())}
    figure {width:360px;margin:40px} img {display:block;width:360px;height:100px}
    figcaption {font:32px/40px system-ui;padding:20px 0;border-top:2px solid}
    </style></head><body><figure id="photo"><img><figcaption>Hello world with enough caption text to wrap onto a second line.</figcaption></figure>
    <script type="module">import {mountDocumentReader} from "/src/document-viewer.js"; import {createAnchorPositioner} from "/src/anchor-positioning.js"; window.reader = mountDocumentReader([], "", null, {}, createAnchorPositioner);</script></body>`
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {reader?: {destroy(): void}}
    for(let attempt = 0; !view.reader && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.reader, "caption permalink fixture did not initialize")
    const doc = frame.contentDocument!, figure = doc.querySelector("figure")!, caption = doc.querySelector("figcaption")!
    for(const above of [false, true]) {
      if(above) figure.prepend(caption)
      await layoutFrame()
      const range = doc.createRange()
      range.setStart(caption.firstChild!, 0)
      range.setEnd(caption.firstChild!, 1)
      const text = range.getBoundingClientRect()
      const link = doc.body.shadowRoot!.querySelector<HTMLAnchorElement>('.◆document-reader-control a')!.getBoundingClientRect()
      assert(Math.abs(link.top + link.height / 2 - (text.top + text.height / 2)) <= 3,
        `permalink is misaligned with the caption first line: link=${link.top}, text=${text.top}`)
    }
    view.reader!.destroy()
  }
  finally { frame.remove() }
})

await check("whitespace beside a lone floated figure selects document start", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1400px;height:400px;max-width:none"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><figure style="float:right;width:200px;height:200px"><img><figcaption>Keep</figcaption></figure></body>'
  document.body.append(frame)
  let frameEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `float-only editor did not initialize: ${view.editorError}`)
    frameEditor = view.editor!
    const doc = frame.contentDocument!
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    for(const side of ["left", "right"]) {
      doc.body.style.direction = side === "left" ? "rtl" : "ltr"
      doc.body.innerHTML = `<figure style="float:${side};width:200px;height:200px"><img><figcaption>Keep</figcaption></figure>`
      const figure = doc.querySelector("figure")!
      doc.getSelection()!.setBaseAndExtent(doc.body, 0, doc.body, 1)
      frameEditor.features.selection.processSelection(undefined, {scrollIntoView: false})
      assert(frameEditor.features.manipulation.setFloat(figure, side === "left" ? "far-left" : "far-right"), "could not float the figure")
      const paragraph = figure.nextElementSibling as HTMLParagraphElement
      assert(paragraph?.localName === "p" && paragraph.textContent === "", "floating the only top-level item did not create an empty paragraph")
      await layoutFrame()
      const x = side === "left" ? 1300 : 30, y = 150
      const event = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 21, clientX: x, clientY: y})
      doc.body.dispatchEvent(event)
      doc.body.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 21, clientX: x, clientY: y}))
      await layoutFrame()
      assert(doc.getSelection()!.isCollapsed && doc.getSelection()!.anchorNode === paragraph && doc.getSelection()!.anchorOffset === 0,
        "whitespace click did not place the native caret in the empty paragraph")
      const beforeInput = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "Start"})
      paragraph.dispatchEvent(beforeInput)
      if(!beforeInput.defaultPrevented) doc.execCommand("insertText", false, "Start")
      assert(paragraph.textContent === "Start", `typing at the paragraph caret did not insert text after the float: body=${doc.body.innerHTML}, selection=${doc.getSelection()!.anchorNode?.nodeName}@${doc.getSelection()!.anchorOffset}`)
      assert(figure.querySelector("figcaption")!.textContent === "Keep", "typing replaced the figure caption")
    }
  }
  finally { frameEditor?.destroy(); frame.remove() }
})

await check("document resizing and graphic fitting preserve normal flow", async () => {
  const graphic = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  graphic.setAttribute("viewBox", "0 0 240 120")
  graphic.innerHTML = '<rect x="20" y="20" width="80" height="40"/>'
  graphic.style.cssText = "display:block;width:240px;height:120px;margin-inline:auto"
  fixture.append(graphic)
  try {
    document.getSelection()!.setBaseAndExtent(fixture, fixture.childNodes.length - 1, fixture, fixture.childNodes.length)
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    editor.features.transformation.startTransform(graphic)
    const handle = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    const rect = graphic.getBoundingClientRect()
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 51, clientX: rect.right, clientY: rect.bottom}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 51, clientX: rect.right - 40, clientY: rect.bottom - 20}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 51}))
    await layoutFrame()
    assert(!graphic.style.position && !graphic.style.left && !graphic.style.top, "resizing positioned a document graphic")
    editor.features.transformation.fitGraphicBounds(graphic, {x: 20, y: 20, width: 80, height: 40}, graphic.getScreenCTM()!)
    assert(!graphic.style.position && !graphic.style.left && !graphic.style.top, "fitting positioned a document graphic")
    assert(getComputedStyle(graphic).position === "static", "document graphic left normal flow")
  }
  finally { graphic.remove(); editor.features.transformation.clearTransform() }
})

await check("text containers resize horizontally and fit their content", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  document.body.append(frame)
  try {
    for(const mode of ["document"] as const) {
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.srcdoc = '<!doctype html><body><p>Text</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
      await loaded
      const view = frame.contentWindow! as Window & typeof globalThis
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, "text resizing fixture did not initialize")
      const editor = view.editor!, doc = frame.contentDocument!, theme = doc.createElement("style")
      theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
      for(const tag of ["p", "h2"]) {
        const target = doc.createElement(tag)
        target.textContent = "Text wraps naturally when its container becomes narrower. ".repeat(5)
        target.style.cssText = "width:520px;height:50px;min-height:40px;max-height:60px;left:40px;top:40px"
        doc.querySelector("p")!.replaceWith(target)
        editor.features.selection.captureElement(target)
        await layoutFrame()
        const feature = editor.features.transformation, before = target.getBoundingClientRect()
        if(mode === "document") {
          const copyright = editor.appendix.querySelector<HTMLElement>(".◆attribution-ui .copyright")!.getBoundingClientRect()
          const deleter = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-delete")!.getBoundingClientRect()
          assert(Math.abs(copyright.left + copyright.width / 2 - (deleter.left + deleter.width / 2)) < 1, `${tag}: copyright is not aligned below the delete control`)
          assert(Math.abs(copyright.top + copyright.height / 2 - (before.top + before.bottom) / 2) < 1, `${tag}: copyright is not at the right midpoint`)
        }
        const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
        assert(handles.length === 1 && handles[0].dataset.resizeDirection === "down-right", `${mode}/${tag}: vertical handles remain visible`)
        const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
        // Mouse handlers avoid synthetic pointer capture while exercising the native layout.
        handle.addEventListener("mousedown", event => feature.handleScaleStart(event), {once: true})
        handle.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: before.right, clientY: before.top}))
        feature.handleScaleDrag(new view.MouseEvent("mousemove", {clientX: before.right - (mode === "document" ? 80 : 160), clientY: before.top + 90, shiftKey: true}))
        feature.handleScaleEnd()
        await layoutFrame()
        const resized = target.getBoundingClientRect()
        assert(Math.abs(resized.width - before.width + 160) < 1, `${mode}/${tag}: width did not follow the handle (${before.width} -> ${resized.width}; ${target.style.cssText})`)
        assert(target.style.height === "auto" && resized.height > before.height && target.scrollHeight <= target.clientHeight + 1, `${mode}/${tag}: text height is constrained`)
        if(mode !== "document") assert(Math.abs(resized.top - before.top) < 1, `${mode}/${tag}: wrapping moved the top edge`)
        editor.features.manipulation.cycleCaption()
        await layoutFrame()
        const figure = target.parentElement!
        assert(figure.localName === "figure", `${tag}: caption did not wrap the text`)
        assert(Math.abs(figure.getBoundingClientRect().width - resized.width) < 1, `${tag}: caption frame lost the resized width`)
        assert(Math.abs(target.getBoundingClientRect().width - resized.width) < 1, `${tag}: caption changed the text width`)
        assert(Math.abs(figure.querySelector("figcaption")!.getBoundingClientRect().width - resized.width) < 1, `${tag}: caption has a separate width`)
        editor.features.manipulation.setCaption("none", undefined, {preserveSelection: true})
        await layoutFrame()
        assert(target.parentElement === doc.body && Math.abs(target.getBoundingClientRect().width - resized.width) < 1, `${tag}: removing the caption lost the resize`)
        target.textContent += "More text grows the container. ".repeat(20)
        await layoutFrame()
        assert(target.getBoundingClientRect().height > resized.height, `${mode}/${tag}: added text did not grow`)
        target.textContent = "Short"
        await layoutFrame()
        assert(target.getBoundingClientRect().height < resized.height, `${mode}/${tag}: removed text did not shrink`)
        if(tag === "p") target.replaceWith(doc.createElement("p"))
      }
      editor.destroy()
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("canvas and slide text exposes eight functional resize handles", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  document.body.append(frame)
  try {
    for(const mode of ["canvas", "slides"] as const) {
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.srcdoc = '<!doctype html><body><p>Text</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
      await loaded
      const view = frame.contentWindow! as Window & typeof globalThis, doc = frame.contentDocument!
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, "eight-handle fixture did not initialize")
      const editor = view.editor!, theme = doc.createElement("style")
      theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
      assert(editor.setDocumentLayout(mode, "document"), "eight-handle fixture did not convert")
      if(mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
      else editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
      for(const tag of ["p", "h2", "math", "resize-widget"]) {
        const target = tag === "math" ? doc.createElementNS("http://www.w3.org/1998/Math/MathML", "math") : doc.createElement(tag)
        if(tag === "math") { target.setAttribute("display", "block"); target.innerHTML = '<mi>x</mi>' }
        else target.innerHTML = 'Text <em>with formatting</em><!--keep--><unfamiliar-inline>and content</unfamiliar-inline>'
        doc.querySelector("p")!.replaceWith(target)
        const children = Array.from(target.childNodes), feature = editor.features.transformation
        for(const direction of ["up-left", "up-up", "up-right", "right-right", "down-right", "down-down", "down-left", "left-left"]) {
          target.style.cssText = "display:block;width:320px;height:100px;left:480px;top:140px"
          editor.features.selection.captureElement(target)
          feature.updateInfo()
          await layoutFrame()
          const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
          const context = `${mode}/${tag}/${direction}`
          assert(handles.length === 8, `${context}: missing resize handles`)
          const before = target.getBoundingClientRect(), handle = handles.find(handle => handle.dataset.resizeDirection === direction)!
          const rect = handle.getBoundingClientRect(), style = view.getComputedStyle(handle)
          assert(rect.width === 8 && rect.height === 8 && style.visibility === "visible", `${context}: resize handle is not visible at its normal size`)
          const x = direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0
          const y = direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0
          assert(Math.abs(rect.left + rect.width / 2 - (x < 0 ? before.left : x > 0 ? before.right : (before.left + before.right) / 2)) < 4,
            `${context}: handle does not follow its horizontal edge`)
          assert(Math.abs(rect.top + rect.height / 2 - (y < 0 ? before.top : y > 0 ? before.bottom : (before.top + before.bottom) / 2)) < 4,
            `${context}: handle does not follow its vertical edge`)
          handle.addEventListener("mousedown", event => feature.handleScaleStart(event), {once: true})
          handle.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: rect.left + 4, clientY: rect.top + 4}))
          feature.handleScaleDrag(new view.MouseEvent("mousemove", {clientX: rect.left + 4 + x * 40, clientY: rect.top + 4 + y * 30}))
          feature.handleScaleEnd()
          await layoutFrame()
          const after = target.getBoundingClientRect()
          assert(Math.abs(after.width - before.width - (x ? 40 : 0)) < 1 && Math.abs(after.height - before.height - (y ? 30 : 0)) < 1,
            `${context}: resize dimensions did not follow the pointer`)
          assert(Math.abs((x < 0 ? after.right - before.right : after.left - before.left)) < 1
            && Math.abs((y < 0 ? after.bottom - before.bottom : after.top - before.top)) < 1,
            `${context}: opposite edges moved (${before.left},${before.top},${before.right},${before.bottom} -> ${after.left},${after.top},${after.right},${after.bottom}; ${target.style.cssText})`)
          assert(Array.from(target.childNodes).every((child, index) => child === children[index]), `${context}: authored content changed`)
          assert(!editor.toHTML(true).match(/◆|transform-overlay/), `${context}: editing artifacts leaked`)
        }
        target.replaceWith(doc.createElement("p"))
      }
      editor.destroy()
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("block formulas expose block controls and resize horizontally", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  document.body.append(frame)
  try {
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    frame.srcdoc = '<!doctype html><body><p>Before</p><math display="block"><!--keep--><mfrac><mi>x</mi><mn>2</mn></mfrac></math><p>After</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    await loaded
    const view = frame.contentWindow! as Window & typeof globalThis, doc = frame.contentDocument!
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "formula fixture did not initialize")
    const editor = view.editor!, theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    const target = doc.querySelector<MathMLElement>("math")!, children = Array.from(target.childNodes)
    const feature = editor.features.transformation
    // MathML can retain line-height: normal; its resolved padding includes .5lh.
    const lineHeight = 2 * (parseFloat(view.getComputedStyle(target).paddingTop) - 2)
    const centered = () => {
      const block = target.getBoundingClientRect(), row = target.firstElementChild!.getBoundingClientRect()
      assert(block.height >= 2 * lineHeight + 4, "formula block lost its doubled minimum height")
      assert(Math.abs(row.left + row.width / 2 - block.left - block.width / 2) < 1, "formula is not horizontally centered")
      assert(Math.abs(row.top + row.height / 2 - block.top - block.height / 2) < 1, "formula is not vertically centered")
    }
    editor.features.selection.selectElement(target)
    await layoutFrame()
    assert(feature.target === target, "block formula has no transform target")
    centered()
    for(const name of ["mover", "caption", "delete"]) {
      const button = feature.overlay.querySelector<HTMLButtonElement>(`#◆transform-overlay-${name}`)!
      assert(!button.hidden && button.getBoundingClientRect().width > 0, `${name} control is hidden`)
    }
    const mover = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!, transfer = new view.DataTransfer()
    mover.dispatchEvent(new view.DragEvent("dragstart", {bubbles: true, composed: true, cancelable: true, dataTransfer: transfer}))
    const dragged = new view.DOMParser().parseFromString(transfer.getData("text/html"), "text/html")
    assert(dragged.querySelector('math[display="block"] mfrac'), `move control did not start a native formula drag: ${transfer.getData("text/html")}`)
    mover.dispatchEvent(new view.DragEvent("dragend", {bubbles: true, composed: true, dataTransfer: transfer}))
    const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
    assert(handles.length === 1 && handles[0].getAttribute("part")!.includes("transform-overlay-scale-text"), "formula has vertical resize controls")
    const before = target.getBoundingClientRect(), handle = handles[0]
    handle.addEventListener("mousedown", event => feature.handleScaleStart(event), {once: true})
    handle.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: before.right, clientY: before.bottom}))
    feature.handleScaleDrag(new view.MouseEvent("mousemove", {clientX: before.right - 40, clientY: before.bottom + 90, shiftKey: true, altKey: true}))
    feature.handleScaleEnd()
    await layoutFrame()
    const resized = target.getBoundingClientRect()
    centered()
    assert(parseFloat(view.getComputedStyle(target).minHeight) >= 2 * lineHeight, "horizontal resize disabled the formula minimum height")
    assert(Math.abs(resized.width - before.width + 80) < 1, `formula width did not follow centered resize: ${before.width} -> ${resized.width}`)
    assert(Math.abs(resized.height - before.height) < 1 && target.style.height === "auto" && !target.style.scale, "vertical movement stretched the formula")
    feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-caption")!.click()
    await layoutFrame()
    assert(target.parentElement!.localName === "figure" && target.nextElementSibling!.localName === "figcaption", "formula caption was not added")
    assert(Array.from(target.childNodes).every((node, index) => node === children[index]), "captioning rebuilt formula content")
    assert(feature.target === target.parentElement, "captioning lost figure controls")
    assert(!editor.toHTML(true).includes("◆"), "formula controls leaked into serialization")
    feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!.click()
    assert(!target.isConnected && doc.querySelector("p")!.textContent === "Before", "delete control did not remove just the formula")
    const empty = doc.createElementNS("http://www.w3.org/1998/Math/MathML", "math")
    empty.setAttribute("display", "block")
    doc.body.append(empty)
    editor.features.math.refresh()
    await layoutFrame()
    const emptyBounds = empty.getBoundingClientRect()
    assert(Math.abs(emptyBounds.height - (2 * lineHeight + 4)) < 1, "empty formula height was not doubled")
    doc.getSelection()!.setPosition(empty, 0)
    editor.features.selection.processSelection()
    editor.features.math.refresh()
    const caret = editor.features.math.structuralTextRect(empty, 0)
    assert(caret && caret.height > 0 && Math.abs(caret.top + caret.height / 2 - emptyBounds.top - emptyBounds.height / 2) < 1, "empty formula caret is not vertically centered")
    editor.destroy()
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("images stretch independently of their intrinsic aspect ratio", async () => {
  for(const mode of ["document", "canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:700px"
    document.body.append(frame)
    try {
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
      await loaded
      const view = frame.contentWindow! as Window & typeof globalThis, doc = frame.contentDocument!
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, "image resize fixture did not initialize")
      const editor = view.editor!, theme = doc.createElement("style")
      theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
      if(mode !== "document") assert(editor.setDocumentLayout(mode, "document"), "image fixture did not convert")
      if(mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
      if(mode === "slides") editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
      for(const tag of ["img", "picture"]) {
        const target = doc.createElement(tag)
        const image = tag === "img" ? target as HTMLImageElement : target.appendChild(doc.createElement("img"))
        image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="skyblue"/><circle cx="100" cy="50" r="40" fill="navy"/></svg>')}`
        image.style.objectFit = "contain"
        target.style.cssText = "width:200px;height:auto;margin-inline:auto"
        const parent = doc.querySelector(".ww-slide") ?? doc.body
        parent.append(target)
        await image.decode()
        editor.features.selection.captureElement(target)
        await layoutFrame()
        const transform = editor.features.transformation
        for(const [dx, dy] of [[60, -20], [-40, 30], [0, 40], [40, 0]]) {
          const before = target.getBoundingClientRect()
          const handle = transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
          handle.addEventListener("mousedown", event => transform.handleScaleStart(event), {once: true})
          handle.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: before.right, clientY: before.bottom}))
          transform.handleScaleDrag(new view.MouseEvent("mousemove", {clientX: before.right + dx, clientY: before.bottom + dy, altKey: true}))
          transform.handleScaleEnd()
          await layoutFrame()
          const after = target.getBoundingClientRect(), content = image.getBoundingClientRect()
          const dw = mode === "document" ? 2 * dx : dx
          assert(Math.abs(after.width - before.width - dw) < 1 && Math.abs(after.height - before.height - dy) < 1, `${tag}: image did not follow both dimensions (${before.width}×${before.height} -> ${after.width}×${after.height})`)
          assert(Math.abs(content.width - after.width) < 1 && Math.abs(content.height - after.height) < 1, `${tag}: image did not fill its resized box`)
          assert(getComputedStyle(image).objectFit === "fill", `${tag}: image retained its intrinsic ratio`)
        }
        for(const [dx, dy] of [[60, -20], [-40, -10], [0, 30]]) {
          const before = target.getBoundingClientRect()
          const handle = transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
          handle.addEventListener("mousedown", event => transform.handleScaleStart(event), {once: true})
          handle.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: before.right, clientY: before.bottom}))
          transform.handleScaleDrag(new view.MouseEvent("mousemove", {clientX: before.right + dx, clientY: before.bottom + dy, shiftKey: true, altKey: true}))
          transform.handleScaleEnd()
          await layoutFrame()
          const after = target.getBoundingClientRect(), content = image.getBoundingClientRect()
          assert(Math.abs(after.width / after.height - before.width / before.height) < .01, `${mode}/${tag}: Shift changed the current aspect ratio`)
          assert(Math.abs(after.width - before.width) > 1 && Math.abs(after.height - before.height) > 1, `${mode}/${tag}: Shift did not resize both dimensions`)
          assert(Math.abs(content.width - after.width) < 1 && Math.abs(content.height - after.height) < 1, `${mode}/${tag}: Shift left the image outside its box`)
          assert(!target.style.scale, `${mode}/${tag}: Shift used CSS scale instead of maximum dimensions`)
        }
        target.remove()
        transform.clearTransform()
      }
    }
    finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
  }
})

await check("resize handles follow alignment and centered edges track the cursor", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1440px;height:800px;max-width:none"
  document.body.append(frame)
  try {
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once:true}))
    frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    await loaded
    const view = frame.contentWindow! as Window & typeof globalThis, doc = frame.contentDocument!
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "aligned resize fixture did not initialize")
    const editor = view.editor!, theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    for(const width of [1440, 900, 375]) {
      frame.style.width = `${width}px`
      for(const placement of ["left", "center", "right", "far-left", "far-right"] as const) {
        const target = doc.createElement("picture"), image = target.appendChild(doc.createElement("img"))
        image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="skyblue"/><circle cx="100" cy="50" r="40" fill="navy"/></svg>')}`
        target.style.cssText = "width:200px;height:auto"
        doc.body.append(target)
        await image.decode()
        const floated = placement.startsWith("far-")
        editor.features.manipulation.setFloat(target, floated ? placement as "far-left" | "far-right" : "none", floated ? undefined : placement as "left" | "center" | "right")
        editor.features.selection.captureElement(target)
        await layoutFrame()
        const transform = editor.features.transformation
        const effective = floated ? view.getComputedStyle(target).float : placement
        const centered = effective === "center" || effective === "none"
        const right = effective === "right"
        const handles = Array.from(transform.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
        assert(handles.length === 1 && handles[0].dataset.resizeDirection === (right ? "down-left" : "down-right"), `${placement}: wrong resize corner`)
        const handleBox = handles[0].getBoundingClientRect()
        const hit = doc.body.shadowRoot!.elementFromPoint(handleBox.left + handleBox.width / 2, handleBox.top + handleBox.height / 2)
        assert(hit === handles[0], `${placement}: resize handle is covered by ${hit?.getAttribute("part") ?? hit?.localName}`)
        const borderHit = doc.body.shadowRoot!.elementFromPoint(handleBox.left + .5, handleBox.top + .5)
        assert(borderHit === handles[0], `${placement}: resize corner covered by ${borderHit?.getAttribute("part") ?? borderHit?.localName}`)
        for(const distance of [30, -20]) {
          const before = target.getBoundingClientRect(), handle = handles[0]
          const startX = right ? before.left : before.right, dx = right ? -distance : distance
          handle.addEventListener("mousedown", event => transform.handleScaleStart(event), {once:true})
          handle.dispatchEvent(new view.MouseEvent("mousedown", {button:0, clientX:startX, clientY:before.bottom}))
          transform.handleScaleDrag(new view.MouseEvent("mousemove", {clientX:startX + dx, clientY:before.bottom + 10, altKey:true}))
          transform.handleScaleEnd()
          await layoutFrame()
          const after = target.getBoundingClientRect()
          assert(Math.abs((right ? after.left : after.right) - startX - dx) < 1, `${placement}: dragged edge missed the cursor`)
          assert(Math.abs(after.bottom - before.bottom - 10) < 1, `${placement}: bottom edge missed the cursor`)
          if(centered) assert(Math.abs(after.left + after.width / 2 - before.left - before.width / 2) < 1, "centered resize moved its center")
          else assert(Math.abs((right ? after.right : after.left) - (right ? before.right : before.left)) < 1, `${placement}: fixed edge moved`)
          assert(!target.style.position && !target.style.left && !target.style.right, `${placement}: resizing left document flow`)
        }
        transform.clearTransform()
        target.remove()
      }
    }
    const graphic = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
    graphic.setAttribute("width", "359")
    graphic.setAttribute("height", "202")
    doc.body.append(graphic)
    editor.features.selection.captureElement(graphic)
    await layoutFrame()
    const handle = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    const box = handle.getBoundingClientRect()
    assert(doc.body.shadowRoot!.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === handle,
      "graphic resize affordance is covered at its center")
    assert(doc.body.shadowRoot!.elementFromPoint(box.left + .5, box.top + .5) === handle,
      "graphic resize affordance is covered at its inner corner")
    assert(!editor.features.transformation.overlay.querySelector(".◆transform-overlay-edge[title]"),
      "graphic move border exposes a lingering native tooltip")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("iframes default to 16:9 and resize vertically in document flow", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:900px;height:1000px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><iframe id="empty"></iframe><iframe id="loaded" src="about:blank"></iframe><iframe id="sized" height="220" style="width:400px"></iframe><iframe id="styled" style="height:240px;width:400px"></iframe><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow!
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "iframe resize fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const theme = doc.createElement("style")
    theme.setAttribute("data-ww-theme", "base")
    doc.head.append(theme)
    for(const preset of documentThemes) {
      theme.textContent = preset.source
      for(const width of [375, 900]) {
        frame.style.width = `${width}px`
        await layoutFrame()
        for(const id of ["empty", "loaded"]) {
          const rect = doc.getElementById(id)!.getBoundingClientRect()
          assert(rect.width > 0 && Math.abs(rect.width * 9 / 16 - rect.height) < 1, `${preset.value}/${width}/${id}: default iframe is not 16:9 (${rect.width} × ${rect.height})`)
        }
        assert(Math.abs(doc.getElementById("sized")!.getBoundingClientRect().height - 220) < 1, "16:9 default replaced authored height attribute")
        assert(Math.abs(doc.getElementById("styled")!.getBoundingClientRect().height - 240) < 1, "16:9 default replaced authored CSS height")
      }
    }
    theme.textContent = defaultDocumentTheme.source
    const target = doc.querySelector<HTMLIFrameElement>("#empty")!
    editor.features.selection.selectElement(target)
    const transform = editor.features.transformation
    for(const delta of [100, -60]) {
      const before = target.getBoundingClientRect()
      const handle = transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
      handle.addEventListener("mousedown", event => transform.handleScaleStart(event), {once: true})
      handle.dispatchEvent(new MouseEvent("mousedown", {button: 0, clientX: before.right, clientY: before.bottom}))
      transform.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, clientX: before.right, clientY: before.bottom + delta, altKey: true}))
      transform.handleScaleEnd()
      await layoutFrame()
      const after = target.getBoundingClientRect()
      assert(Math.abs(after.height - before.height - delta) < 1, `iframe height did not change by ${delta}px`)
      assert(Math.abs(after.width - before.width) < 1 && Math.abs(after.top - before.top) < 1, "vertical resizing changed iframe width or flow position")
      assert(!target.style.position && !target.style.top && !target.style.left, "iframe resize left normal flow")
    }
    const saved = document.createElement("iframe")
    saved.style.cssText = frame.style.cssText
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once: true}))
    saved.srcdoc = editor.toHTML()
    document.body.append(saved)
    try {
      await loaded
      assert(Math.abs(saved.contentDocument!.getElementById("empty")!.getBoundingClientRect().height - target.getBoundingClientRect().height) < 1, "standalone export lost resized iframe height")
      const rect = saved.contentDocument!.getElementById("loaded")!.getBoundingClientRect()
      assert(Math.abs(rect.width * 9 / 16 - rect.height) < 1, "standalone export lost 16:9 default")
    }
    finally { saved.remove() }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("cancelled resizing accepts the first delete activation", async () => {
  const feature = editor.features.transformation
  for(const tag of ["p", "demo-widget"]) {
    const target = document.createElement(tag)
    target.style.cssText = "display:block;width:240px;height:120px"
    target.innerHTML = 'Content<!--keep--><unfamiliar-node>child</unfamiliar-node>'
    fixture.append(target)
    try {
      editor.features.selection.captureElement(target)
      const initialStyle = target.style.cssText
      const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
      const rect = target.getBoundingClientRect()
      // Public mouse handlers avoid synthetic events requiring native pointer capture.
      handle.addEventListener("mousedown", event => feature.handleScaleStart(event), {once: true})
      handle.dispatchEvent(new MouseEvent("mousedown", {button: 0, clientX: rect.right, clientY: rect.bottom}))
      feature.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, clientX: rect.right - 40, clientY: rect.bottom - 20}))
      assert(target.style.maxWidth !== "", `${tag}: resize did not start`)
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
      assert(target.style.cssText === initialStyle, `${tag}: cancellation did not restore styles`)
      assert(editor.features.selection.captureSelectedElement === target, `${tag}: cancellation lost selection`)
      const deleter = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!
      deleter.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 52}))
      deleter.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, composed: true, button: 0, pointerId: 52}))
      deleter.click()
      assert(!target.isConnected && feature.target === null, `${tag}: first Delete activation was ignored`)
      assert(!target.className.includes("◆"), `${tag}: deleted target retained editor markers`)
    }
    finally { target.remove(); feature.clearTransform() }
  }
})

await check("media and graphics enforce minimum editing dimensions", async () => {
  for(const [tag, width, height] of [
    ["audio", 175, 35], ["video", 175, 70], ["img", 32, 32], ["picture", 32, 32],
    ["svg", 32, 32], ["iframe", 320, 70], ["embed", 320, 70], ["object", 320, 70],
  ] as const) {
    const element = tag === "svg" ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement(tag)
    element.style.cssText = "display:block;width:1px;height:1px;max-width:1px;max-height:1px"
    if(tag === "svg") element.setAttribute("viewBox", "0 0 1600 900")
    if(tag === "picture") element.innerHTML = "<img>"
    if(tag === "embed") {
      element.setAttribute("type", "image/svg+xml")
      element.setAttribute("src", "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E")
    }
    if(tag === "audio" || tag === "video") element.setAttribute("controls", "")
    fixture.append(element)
    await layoutFrame()
    // Website normalization can replace EMBED/OBJECT with an IFRAME.
    const target = element.isConnected ? element : fixture.lastElementChild as HTMLElement
    try {
      for(const empty of [false, true]) {
        target.classList.toggle("◆media-empty", empty)
        const style = getComputedStyle(target), rect = target.getBoundingClientRect()
        assert(style.minHeight === `${height}px`, `${tag} minimum height differs (${empty})`)
        assert(rect.width >= width && rect.height >= height, `${tag} rendered below its minimum (${rect.width}x${rect.height})`)
      }
    }
    finally { target.remove(); element.remove() }
  }
})

await check("empty media controls wrap to fit their element", async () => {
  const media = document.createElement("picture")
  media.innerHTML = "<img>"
  media.style.cssText = "height:180px;max-width:none"
  fixture.append(media)
  const placeholder = editor.features.media.placeholder
  try {
    for(const width of [800, 320, 120, 800]) {
      media.style.width = `${width}px`
      $.selectElement(media)
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      placeholder.showFor(media)
      await layoutFrame(); await layoutFrame()
      const buttons = placeholder.root.querySelector(".file-options")!.getBoundingClientRect()
      const url = placeholder.root.querySelector(".url-row")!.getBoundingClientRect()
      const host = placeholder.element.getBoundingClientRect()
      const wraps = host.width < buttons.width + 340 // 20rem URL basis, the separator, and flex gaps
      assert(wraps ? url.top >= buttons.bottom : Math.abs(url.top - buttons.top) < 2,
        `URL input did not ${wraps ? "wrap" : "fit beside the buttons"} at ${width}px: ${JSON.stringify({host: host.toJSON(), buttons: buttons.toJSON(), url: url.toJSON()})}`)
      assert(url.left >= host.left && url.right <= host.right && buttons.left >= host.left && buttons.right <= host.right,
        `media controls overflow at ${width}px`)
      assert(url.width > buttons.width || width === 120, "wrapped URL input does not use the available width")
    }
    for(const type of ["picture", "audio", "video"]) {
      const shallow = document.createElement(type)
      if(type === "picture") shallow.innerHTML = "<img>"
      fixture.append(shallow)
      try {
        for(const height of [32, 54, 80]) {
          for(const width of [1000, 800, 600, 320, 200, 120]) {
            shallow.style.cssText = `width:${width}px;height:${height}px;max-width:none`
            $.selectElement(shallow)
            editor.features.selection.processSelection(undefined, {scrollIntoView: false})
            placeholder.showFor(shallow)
            await layoutFrame()
            const host = placeholder.element.getBoundingClientRect()
            const buttons = placeholder.root.querySelector(".file-options")!.getBoundingClientRect()
            const url = placeholder.root.querySelector(".url-row")!.getBoundingClientRect()
            assert(Math.abs(url.top - buttons.top) < 2, `${type} controls wrapped at ${width}x${height}`)
            for(const rect of [buttons, url]) {
              assert(rect.left >= host.left - 1 && rect.right <= host.right + 1 && rect.top >= host.top - 1 && rect.bottom <= host.bottom + 1,
                `${type} controls overflow at ${width}x${height}`)
            }
            assert(getComputedStyle(placeholder.element).overflow === "clip", "empty media controls allow scrolling")
            if(width >= 600) assert(url.width >= 320, "URL input shortened before button labels yielded")
            const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
            assert(input.placeholder === (url.width < 240 ? "URL" : `Enter ${type === "picture" ? "image" : type} URL`), "URL hint does not match input space")
            for(const button of placeholder.root.querySelectorAll<HTMLElement>(".file-options button:not([hidden])")) {
              const buttonRect = button.getBoundingClientRect(), icon = button.querySelector("svg")!.getBoundingClientRect()
              assert(icon.left >= buttonRect.left && icon.right <= buttonRect.right && buttonRect.left >= buttons.left && buttonRect.right <= buttons.right,
                `${type} icon button is clipped at ${width}x${height}`)
            }
            const labels = placeholder.root.querySelectorAll<HTMLElement>(".file-options button:not([hidden]) .label")
            assert(Array.from(labels).every(label => getComputedStyle(label).display === (host.width <= 832 ? "none" : "block")),
              `button labels did not yield before the URL at ${width}x${height}`)
          }
        }
      }
      finally { shallow.remove() }
    }
  }
  finally {
    placeholder.hide()
    media.remove()
  }
})

await check("tiny images open media inputs in a speech bubble", async () => {
  // The independent lifecycle fixture initializes an editor and takes focus.
  const frame = document.querySelector<HTMLIFrameElement>("#lifecycle")
  if(frame && frame.contentDocument?.readyState !== "complete") await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("lifecycle fixture did not load")), 2000)
    frame.addEventListener("load", () => { clearTimeout(timer); resolve() }, {once: true})
  })
  const picture = document.createElement("picture")
  picture.innerHTML = "<img>"
  picture.style.cssText = "width:32px;height:32px;max-width:none"
  fixture.append(picture)
  const placeholder = editor.features.media.placeholder
  try {
    editor.features.selection.captureElement(picture)
    await layoutFrame()
    placeholder.showFor(picture)
    const expand = placeholder.root.querySelector<HTMLButtonElement>(".expand")!
    const content = placeholder.root.querySelector<HTMLElement>(".content")!
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    const host = placeholder.element.getBoundingClientRect(), button = expand.getBoundingClientRect()
    assert(getComputedStyle(expand).display === "grid", "tiny image did not retain its source button")
    assert(content.matches(":popover-open") && placeholder.root.activeElement === input, "selecting a tiny image did not open and focus its URL input")
    assert(button.left >= host.left && button.right <= host.right && button.top >= host.top && button.bottom <= host.bottom, "tiny image button escapes its image")
    const icon = expand.querySelector("svg")!.getBoundingClientRect()
    assert(icon.left >= button.left && icon.right <= button.right && icon.top >= button.top && icon.bottom <= button.bottom, "tiny image button clips its icon")
    const passive = getComputedStyle(picture, "::after")
    assert(parseFloat(passive.width) > 0 && parseFloat(passive.width) <= 32 && parseFloat(passive.height) > 0 && parseFloat(passive.height) <= 32 && passive.backgroundSize === "contain", `passive image icon does not fit 32px: ${passive.width}x${passive.height}`)
    assert(placeholder.root.activeElement === input, `media bubble lost focus immediately: ${document.activeElement?.localName}, ${editor.appendix.activeElement?.localName}`)
    await layoutFrame()
    assert(content.matches(":popover-open"), "media inputs did not open in the top layer")
    const popup = content.getBoundingClientRect()
    assert(popup.width > host.width && popup.left >= 0 && popup.right <= window.innerWidth && popup.top >= 0 && popup.bottom <= window.innerHeight, "media bubble is clipped or outside the viewport")
    for(const control of content.querySelectorAll<HTMLElement>(".file-options, .url-row")) {
      const rect = control.getBoundingClientRect()
      assert(rect.left >= popup.left && rect.right <= popup.right && rect.top >= popup.top && rect.bottom <= popup.bottom, "media bubble clips its inputs")
    }
    assert(getComputedStyle(content, "::before").content === '\"\"', "media bubble has no pointer")
    assert(placeholder.root.activeElement === input && input.placeholder === "Enter image URL", "media bubble did not focus the full URL input")
    content.hidePopover()
    await layoutFrame()
    assert(expand.getAttribute("aria-expanded") === "false" && !placeholder.element.hasAttribute("data-popup-open"), "native dismissal did not reset the media button")
    expand.click()
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    assert(!content.matches(":popover-open") && placeholder.root.activeElement === expand, "Escape did not close the bubble and restore button focus")
    expand.click()
    placeholder.hide()
    assert(!content.matches(":popover-open"), "hiding media controls leaked an open bubble")
    assert(!editor.toHTML(true).includes("media-inputs"), "media bubble leaked into serialized content")
  }
  finally { placeholder.hide(); picture.remove() }
})

await check("empty caption numbering is visible as a grey editing placeholder", async () => {
  const previousLanguage = document.documentElement.getAttribute("lang")
  const previousStyle = document.head.querySelector("style[data-ww-caption-enumeration]")?.textContent
  const figure = document.createElement("figure")
  figure.innerHTML = '<p>Image</p><figcaption style="color:#102030"></figcaption>'
  fixture.append(figure)
  const caption = figure.querySelector("figcaption")!
  try {
    document.documentElement.removeAttribute("lang")
    editor.features.head.actions.setCaptionEnumeration({type: "setCaptionEnumeration", value: defaultCaptionEnumeration()})
    $.move(caption, 0)
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    await layoutFrame()
    let style = getComputedStyle(caption, "::before")
    assert(style.content.includes("Fig."), `caption number replaced by caret fallback: ${style.content}`)
    assert(style.visibility === "visible", "empty caption numbering is hidden")
    assert(style.color === "rgb(136, 136, 136)", "empty caption numbering is not grey")
    assert(getComputedStyle(caption).caretColor === "rgba(0, 0, 0, 0)", "native caret remains before the caption prefix")
    assert(style.display === "inline-block" && style.whiteSpace === "pre", "caption prefix does not reserve the text origin")
    assert(style.borderInlineEndWidth === "1px", "caption caret is not at the end of the prefix")
    assert(style.borderInlineStartWidth === "0px", "caption caret is still before the prefix")
    caption.classList.add("◆", "◆pointer-hovered")
    await layoutFrame()
    assert(getComputedStyle(editor.features.selection.hoverCaret!).display === "none", "figure caption shows a dotted hover outline")
    caption.classList.remove("◆pointer-hovered")
    caption.textContent = "Caption text"
    $.move(caption.firstChild!, 1)
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    await layoutFrame()
    style = getComputedStyle(caption, "::before")
    assert(style.content.includes("Fig."), "filled caption lost its number")
    assert(style.visibility === "visible", "filled caption number is hidden")
    assert(style.color === "rgb(16, 32, 48)", "filled caption still uses placeholder grey")
    assert(getComputedStyle(caption).caretColor !== "rgba(0, 0, 0, 0)", "native caption caret was not restored after typing")
    assert(style.borderInlineEndWidth === "0px", "placeholder caret remains after typing")
    assert(!editor.toHTML(true).includes("◆caption-placeholder"), "caption preview marker was serialized")
  }
  finally {
    figure.remove()
    const style = document.head.querySelector("style[data-ww-caption-enumeration]")
    if(previousStyle === undefined) style?.remove()
    else if(style) style.textContent = previousStyle
    if(previousLanguage === null) document.documentElement.removeAttribute("lang")
    else document.documentElement.setAttribute("lang", previousLanguage)
    await layoutFrame()
  }
})

await check("cut paragraphs retain a visible native caret position", checkParagraphCut)
await check("list markers survive native cut and paste", checkListClipboard)

await check("paragraph boundary deletion reverses Enter in Document and Board", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "paragraph fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    for(const mode of ["document", "board"] as const) {
      if(mode === "board") assert(editor.setDocumentLayout("board", "document"), "board did not convert")
      const root = mode === "board" ? editor.features.board.cards(editor.features.board.columns()[0])[0] : doc.body
      for(const html of ["helloworld", "hello<b>world</b>"]) for(const key of ["Backspace", "Delete"]) {
        root.innerHTML = `<p class="authored">${html}</p>`
        const paragraph = root.firstElementChild!
        const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
        let text = walker.nextNode()!, offset = 5
        while(offset > text.textContent!.length) { offset -= text.textContent!.length; text = walker.nextNode()! }
        selection.collapse(text, offset)
        paragraph.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
        assert(root.querySelectorAll("p").length === 2, `${mode}: Enter did not split ${html} before ${key}: ${root.innerHTML}`)
        editor.doc.syncFromDOM(); editor.doc.stopCapturing()
        if(key === "Delete") selection.collapse(text, offset)
        root.querySelectorAll("p")[key === "Backspace" ? 1 : 0]
          .dispatchEvent(new view.KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
        assert(root.querySelectorAll("p").length === 1 && root.textContent === "helloworld",
          `${mode}: ${key} did not join the split paragraphs: ${root.innerHTML}`)
        const caret = selection.getRangeAt(0).cloneRange()
        caret.selectNodeContents(root.querySelector("p")!)
        caret.setEnd(selection.focusNode!, selection.focusOffset)
        assert(caret.toString() === "hello", `${mode}: ${key} misplaced the join caret`)
        assert(root.querySelector("b")?.textContent === (html.includes("<b>") ? "world" : undefined),
          `${mode}: ${key} lost inline formatting`)
        assert(root.querySelector("p")!.classList.contains("authored"), `${mode}: ${key} lost the paragraph's authored class`)
        editor.doc.syncFromDOM(); editor.doc.undo()
        assert(root.querySelectorAll("p").length === 2 && root.textContent === "helloworld", `${mode}: ${key} join did not undo`)
        editor.doc.redo()
        assert(root.querySelectorAll("p").length === 1 && root.textContent === "helloworld", `${mode}: ${key} join did not redo`)
      }
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("triple clicks preserve native paragraph selections in Document and Board", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "paragraph selection fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    for(const mode of ["document", "board"] as const) {
      if(mode === "board") assert(editor.setDocumentLayout("board", "document"), "board did not convert")
      const root = mode === "board" ? editor.features.board.cards(editor.features.board.columns()[0])[0] : doc.body
      for(const html of ['<p>Hello world!</p><p>Test!</p>', '<div><!--keep--><p>Hello world!</p>\n<p><b>Te</b>st!</p>\n<p>After</p></div>']) {
        root.innerHTML = html
        await layoutFrame()
        const paragraph = root.querySelectorAll("p")[1]
        const text = paragraph.querySelector("b")?.firstChild ?? paragraph.firstChild!
        const hit = doc.createRange()
        hit.setStart(text, 1); hit.setEnd(text, 2)
        const rect = hit.getBoundingClientRect()
        for(const detail of [3, 4]) {
          // Establish the browser's native paragraph boundaries before CLICK.
          selection.collapse(text, 1)
          selection.modify("move", "backward", "paragraphboundary")
          selection.modify("extend", "forward", "paragraphboundary")
          const before = selection.getRangeAt(0).cloneRange()
          assert(selection.toString() === "Test!", `${mode}: native paragraph setup failed`)
          paragraph.dispatchEvent(new view.MouseEvent("click", {bubbles: true, composed: true, cancelable: true,
            detail, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2}))
          await layoutFrame()
          const after = selection.getRangeAt(0)
          assert(selection.toString() === "Test!" && before.startContainer === after.startContainer
            && before.startOffset === after.startOffset && before.endContainer === after.endContainer
            && before.endOffset === after.endOffset, `${mode}: click ${detail} changed the native paragraph selection to ${JSON.stringify(selection.toString())}`)
        }
      }
      const image = '<img width="200" height="100" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'100\'%3E%3Crect width=\'200\' height=\'100\' fill=\'skyblue\'/%3E%3C/svg%3E">'
      for(const html of [`<picture>${image}</picture>`, `<figure><picture>${image}</picture></figure>`]) {
        root.innerHTML = `<section><!--keep--><p>Before</p>\n<p><b>Te</b>st!</p>\n${html}<p>After</p></section>`
        await layoutFrame()
        const paragraph = root.querySelectorAll("p")[1]
        const text = paragraph.querySelector("b")!.firstChild!
        const picture = root.querySelector("picture")!
        selection.collapse(text, 1)
        selection.modify("move", "backward", "paragraphboundary")
        // Like native triple-click, paragraph granularity includes the break
        // and can place its end at offset zero inside the following picture.
        selection.modify("extend", "forward", "paragraph")
        assert(selection.toString().trim() === "Test!", `${mode}: image-adjacent paragraph setup failed`)
        await layoutFrame()
        const range = selection.getRangeAt(0)
        const parent = picture.parentNode!
        const index = Array.from(parent.childNodes).indexOf(picture)
        assert(selection.toString().trim() === "Test!" && range.comparePoint(parent, index + 1) === 1,
          `${mode}: paragraph selection included the following image`)
        assert(!picture.classList.contains("◆atomic-range-selected") && !editor.features.selection.captureSelectedElement,
          `${mode}: paragraph selection highlighted or captured the following image`)
      }
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("character deletion preserves adjacent spaces", async () => {
  const paragraph = document.createElement("p")
  document.body.append(paragraph)
  try {
    for(const html of ["hello x", "hello <b>x</b>", "hello x world", "hello <b>x</b> world", "hello&nbsp;x", "hello  x", "hello <span> </span>x", "hello x<br>"]) {
      for(const direction of ["backward", "forward"] as const) {
        paragraph.innerHTML = html
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
        let text = walker.nextNode()!
        while(!text.textContent!.includes("x")) text = walker.nextNode()!
        const offset = text.textContent!.indexOf("x") + (direction === "backward" ? 1 : 0)
        $.move(text, offset)
        editor.features.manipulation.delete(direction)
        await layoutFrame()
        const expected = html.includes("world") ? "hello  world" : html.includes("  ") || html.includes("<span>") ? "hello  " : "hello "
        assert(paragraph.textContent?.replace(/\u00a0/g, " ") === expected,
          `${direction} deletion changed spaces in ${html}: ${JSON.stringify(paragraph.textContent)}`)
      }
    }
    for(const html of ["hello x", "hello <b>x</b>", "hello <b> x</b>"]) {
      paragraph.innerHTML = html
      $.move(paragraph, paragraph.childNodes.length)
      editor.features.manipulation.delete("backward")
      assert(paragraph.textContent?.replace(/\u00a0/g, " ") === (html.includes("> x") ? "hello  " : "hello "), `element caret deletion changed spaces in ${html}: ${JSON.stringify(paragraph.textContent)}`)
    }
    for(const html of ["hello word", "hello <b>word</b>", "hello word ", "hello <b>word</b> "]) {
      paragraph.innerHTML = html
      const text = paragraph.querySelector("b")?.firstChild ?? paragraph.firstChild!
      $.move(text, text.textContent!.indexOf("word") + 4)
      for(let length = 3; length >= 0; length--) {
        document.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true}))
        await layoutFrame()
        const expected = `hello ${"word".slice(0, length)}${html.endsWith(" ") ? " " : ""}`
        assert(paragraph.textContent?.replace(/\u00a0/g, " ") === expected,
          `repeated deletion changed spaces in ${html}: ${JSON.stringify(paragraph.textContent)} instead of ${JSON.stringify(expected)}`)
      }
    }
    for(const html of ["hello w", "hello <b>w</b>", "hello <!--keep--><b><i>w</i></b>"]) {
      paragraph.innerHTML = html
      const text = paragraph.querySelector("i")?.firstChild ?? paragraph.querySelector("b")?.firstChild ?? paragraph.firstChild!
      $.move(text, text.textContent!.length)
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true}))
      await layoutFrame()
      document.execCommand("insertText", false, "x")
      assert(paragraph.textContent?.replace(/\u00a0/g, " ") === "hello x", `typing after deletion lost the space in ${html}: ${JSON.stringify(paragraph.textContent)}`)
    }
  }
  finally { paragraph.remove() }
})

await check("attribution is limited to top-level elements and follows nesting", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:600px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>Ready</p></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "top-level attribution fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const data = {name: "Ada", year: "2026", license: "MIT", contact: "mailto:ada@example.com"}
    for(const existing of [false, true]) {
      doc.body.innerHTML = '<section><p>Nested element</p></section><p style="min-height:160px">Licensed element</p>'
      const top = doc.querySelector("section")!, nested = top.firstElementChild!, source = doc.body.lastElementChild!
      for(const [key, value] of Object.entries(data)) source.setAttribute(attributionAttributes[key as keyof typeof data], value)
      if(existing) top.setAttribute(attributionAttributes.license, "CC0-1.0")
      editor.doc.syncFromDOM()
      await layoutFrame()
      const ui = editor.appendix.querySelector<HTMLElement>(".◆attribution-ui")!
      for(const captured of [false, true]) {
        if(captured) editor.features.selection.captureElement(nested)
        else editor.features.selection.selectElement(nested)
        doc.dispatchEvent(new view.Event("selectionchange"))
        await layoutFrame()
        assert(ui.querySelector<HTMLElement>(".bridge")!.hidden, "nested selection offers attribution")
      }
      editor.features.selection.selectSectionElement(top)
      doc.dispatchEvent(new view.Event("selectionchange"))
      await layoutFrame()
      if(!existing) {
        const add = ui.querySelector<HTMLButtonElement>(".copyright")!
        assert(!ui.querySelector<HTMLElement>(".bridge")!.hidden, "top-level section has no attribution affordance")
        add.click()
        assert(!ui.querySelector<HTMLElement>(".popup")!.hidden, "top-level section cannot open attribution")
        ui.querySelector<HTMLButtonElement>(".close")!.click()
      }
      const end = editor.doc.beginUndoGroup()
      top.append(source)
      end()
      for(const name of Object.values(attributionAttributes)) assert(!source.hasAttribute(name), "nested element retained attribution metadata")
      assert(top.getAttribute(attributionAttributes.license) === (existing ? "CC0-1.0" : "MIT"), "nested attribution did not respect the top-level license")
      assert(top.getAttribute(attributionAttributes.name) === (existing ? null : "Ada"), "nested attribution was merged with an existing license")
      await layoutFrame(); await layoutFrame()
      const notes = ui.querySelectorAll(".attribution-note:not(.attribution-contact-note)")
      assert(notes.length === 1, "nesting left a duplicate attribution display")
      editor.doc.undo()
      assert(doc.body.lastElementChild!.getAttribute(attributionAttributes.license) === "MIT", "undo did not restore the attribution to its original element")
      editor.doc.redo()
      assert(doc.querySelector("section")!.getAttribute(attributionAttributes.license) === (existing ? "CC0-1.0" : "MIT"), "redo lost the top-level attribution")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("toolbox attribution opens for multiple elements and deletes metadata together", async () => {
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const frame = document.createElement("iframe"), toolbox = new DomEditorToolbox()
  frame.style.cssText = "width:900px;height:600px;border:0"
  frame.srcdoc = '<!doctype html><body><p>First</p><p>Second</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  toolbox.style.width = "220px"
  fixture.append(frame, toolbox)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "toolbox attribution fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, elements = Array.from(doc.querySelectorAll("p"))
    doc.getSelection()!.setBaseAndExtent(elements[0].firstChild!, 0, elements[1].firstChild!, 6)
    toolbox.activeTool = "Edit"
    toolbox.elementStyle = editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true})
    toolbox.selectedElementTypes = editor.features.manipulation.getSelectedElementTypes()
    toolbox.addEventListener("layout-action", () => editor.features.attribution.actions.openAttribution({type: "openAttribution"}))
    await toolbox.updateComplete
    const ui = editor.appendix.querySelector<HTMLElement>(".◆attribution-ui")!, popup = ui.querySelector<HTMLElement>(".popup")!
    editor.addAppendix(doc.createElement("div"))
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Edit attribution"]')!.click()
    await layoutFrame()
    assert(!popup.hidden && popup.matches(":popover-open") && view.getComputedStyle(popup).display !== "none", "toolbox attribution did not remain visible")
    assert(popup.querySelector(".selection-summary")!.textContent!.includes("2 elements"), "dialog lost the multiple selection")
    const remove = popup.querySelector<HTMLButtonElement>(".delete")!, save = popup.querySelector<HTMLButtonElement>(".save")!
    const removeBox = remove.getBoundingClientRect(), saveBox = save.getBoundingClientRect()
    assert(removeBox.left < saveBox.left && Math.abs(removeBox.bottom - saveBox.bottom) < 1, "Delete and Save are not aligned at the bottom left and right")
    popup.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Shared author"
    save.click()
    assert(elements.every(element => element.getAttribute(attributionAttributes.name) === "Shared author"), "attribution was not saved to every selected element")
    doc.getSelection()!.setBaseAndExtent(elements[0].firstChild!, 0, elements[1].firstChild!, 6)
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Edit attribution"]')!.click()
    remove.click()
    assert(elements.every(element => !element.hasAttribute(attributionAttributes.name)), "Delete did not remove every selected attribution")
    assert(!editor.toHTML(true).includes("◆attribution-ui"), "attribution controls leaked into authored HTML")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove(); toolbox.remove() }
})

await check("attribution inputs keep visible carets during element and capture selection", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "Attributed element"
  paragraph.style.minHeight = "160px"
  paragraph.setAttribute(attributionAttributes.name, "Ada")
  document.body.append(paragraph)
  try {
    for(const captured of [false, true]) {
      if(captured) editor.features.selection.captureElement(paragraph)
      else editor.features.selection.selectElement(paragraph)
      document.dispatchEvent(new Event("selectionchange"))
      await layoutFrame()
      const ui = editor.appendix.querySelector<HTMLElement>(".◆attribution-ui")!
      ui.querySelector<HTMLElement>(".attribution-note")!.click()
      const popup = ui.querySelector<HTMLElement>(".popup")!
      assert(!popup.hidden && document.body.classList.contains("◆node-selection-active"), "opening attribution discarded the element selection")
      assert(paragraph.classList.contains("◆element-capture-selected") === captured, "opening attribution changed the selection kind")
      for(const field of popup.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])')) {
        field.focus()
        field.setSelectionRange(field.value.length, field.value.length)
        await layoutFrame()
        const style = getComputedStyle(field)
        assert(editor.appendix.activeElement === field, `attribution ${field.name} did not retain focus (capture: ${captured}, popup: ${popup.hidden}, active: ${editor.appendix.activeElement?.outerHTML})`)
        assert(style.caretColor === "auto" || style.caretColor === style.color, `attribution ${field.name} caret is invisible during ${captured ? "capture" : "element"} selection: ${style.caretColor}`)
        assert(getComputedStyle(document.body).caretColor === "rgba(0, 0, 0, 0)", "attribution input restored the document's background caret")
      }
      const picker = popup.querySelector<import("../src/components/attribution-license-picker").AttributionLicensePicker>("attribution-license-picker")!
      await picker.updateComplete
      const controls = [popup.querySelector<HTMLInputElement>('input[name="name"]')!, popup.querySelector<HTMLInputElement>('input[name="year"]')!,
        picker.shadowRoot!.querySelector<HTMLInputElement>("input")!, popup.querySelector<HTMLInputElement>('input[name="contact"]')!,
        popup.querySelector<HTMLButtonElement>(".delete")!, popup.querySelector<HTMLButtonElement>(".save")!, popup.querySelector<HTMLButtonElement>(".close")!]
      controls[0].focus()
      for(const shiftKey of [false, true]) {
        for(let step = 0; step < controls.length; step++) {
          const index = shiftKey ? (controls.length - step) % controls.length : step
          controls[index].dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", shiftKey, bubbles: true, composed: true, cancelable: true}))
          const next = controls[(index + (shiftKey ? -1 : 1) + controls.length) % controls.length]
          assert((next.getRootNode() as ShadowRoot).activeElement === next, `attribution Tab order skipped ${next.getAttribute("name") ?? next.className} (capture: ${captured}, reverse: ${shiftKey})`)
          assert(!popup.hidden, "Tab dismissed the attribution dialog")
        }
      }
      popup.querySelector<HTMLButtonElement>(".close")!.click()
    }
    assert(paragraph.getAttribute(attributionAttributes.name) === "Ada", "focusing attribution inputs changed authored metadata")
  }
  finally { paragraph.remove() }
})

await check("attribution license picker wraps definitions on a third line and offers only current CC licenses", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "Licensed element"
  paragraph.style.minHeight = "160px"
  paragraph.setAttribute(attributionAttributes.license, "CC-BY-4.0")
  document.body.append(paragraph)
  try {
    editor.features.selection.selectElement(paragraph)
    document.dispatchEvent(new Event("selectionchange"))
    await layoutFrame()
    const ui = editor.appendix.querySelector<HTMLElement>(".◆attribution-ui")!
    ui.querySelector<HTMLElement>(".attribution-note")!.click()
    const popup = ui.querySelector<HTMLElement>(".popup")!
    const picker = popup.querySelector<import("../src/components/attribution-license-picker").AttributionLicensePicker>("attribution-license-picker")!
    await picker.updateComplete
    const control = picker.shadowRoot!.querySelector<HTMLInputElement>("input")!
    assert(control.readOnly, "attribution license picker accepts arbitrary licenses")
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    await layoutFrame()
    const pickerPopup = picker.shadowRoot!.querySelector<HTMLElement>(".listbox")!.getBoundingClientRect()
    const pickerControl = control.getBoundingClientRect()
    assert(pickerPopup.bottom <= pickerControl.top || pickerPopup.top >= pickerControl.bottom, "attribution license popup overlaps its control")
    const choices = Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".option"))
    assert(choices.length === 8 && choices[7].textContent!.includes("No license"), "attribution picker lost its CC licenses or clear choice")
    const reserved = choices[7].querySelector<HTMLElement>(".option-description")!
    assert(reserved?.textContent === "All rights reserved" && getComputedStyle(reserved).fontStyle === "italic", "No license is missing its italic rights description")
    assert(!choices.some(choice => choice.textContent!.includes("MIT")), "attribution picker still offers MIT")
    for(const choice of choices.slice(0, -1)) {
      const name = choice.querySelector<HTMLElement>(".option-name")!
      const description = choice.querySelector<HTMLElement>(".option-description")!
      assert(getComputedStyle(description).fontStyle === "italic", "attribution license definition is not italic")
      assert(!/\byou(?:r)?\b/i.test(description.textContent!), "attribution license definition addresses the user")
      assert(description.getBoundingClientRect().top >= name.getBoundingClientRect().bottom, "definition does not begin on the third line")
      assert(getComputedStyle(description).whiteSpace === "normal" && description.scrollWidth <= description.clientWidth
        && description.scrollHeight <= description.clientHeight, "attribution license definition is clipped")
    }
    const longDescription = choices[5].querySelector<HTMLElement>(".option-description")!
    assert(longDescription.clientHeight > parseFloat(getComputedStyle(longDescription).lineHeight), "long attribution definition does not wrap")
    control.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, composed: true, cancelable: true}))
    control.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true}))
    await picker.updateComplete
    assert(!popup.hidden && popup.matches(":popover-open"), "choosing a license submitted or dismissed the attribution dialog")
    assert(paragraph.getAttribute(attributionAttributes.license) === "CC-BY-4.0", "choosing a license saved before Save")
    assert(popup.querySelector<HTMLInputElement>('input[name="license"]')!.value === "CC0-1.0", "keyboard selection did not update the license field")
    popup.querySelector<HTMLButtonElement>(".save")!.click()
    assert(popup.hidden && paragraph.getAttribute(attributionAttributes.license) === "CC0-1.0", "Save did not apply the chosen CC license")
    await picker.updateComplete
    assert(!picker.shadowRoot!.querySelector(".listbox"), "closing the dialog left its license popup open")
  }
  finally { paragraph.remove() }
})

await check("block splitting retains attribution only on the original part", async () => {
  const frame = document.createElement("iframe")
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>Ready</p></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "split fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, section = doc.body
    const select = (element: Element, offset: number) => doc.getSelection()!.setPosition(element.firstChild!, offset)
    for(const input of ["key", "beforeinput", "command"]) for(const offset of [0, 3, 6]) {
      section.innerHTML = '<p class="authored" data-other="keep">abcdef</p>'
      const paragraph = section.firstElementChild!
      for(const [key, name] of Object.entries(attributionAttributes)) paragraph.setAttribute(name, key === "license" ? "MIT" : key)
      select(paragraph, offset)
      if(input === "command") editor.features.manipulation.insert()
      else {
        const event = input === "key" ? new view.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
          : new view.InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true})
        paragraph.dispatchEvent(event)
        assert(event.defaultPrevented, `attributed ${input} split was left to the browser`)
      }
      await layoutFrame()
      const [left, right] = Array.from(section.children)
      assert(section.children.length === 2 && left === paragraph, "split replaced the original block or created extra blocks")
      assert(left.textContent === "abcdef".slice(0, offset) && right.textContent === "abcdef".slice(offset), "split changed the content")
      for(const name of Object.values(attributionAttributes)) assert(left.hasAttribute(name) && !right.hasAttribute(name), "split copied or removed original attribution metadata")
      assert(right.getAttribute("data-other") === "keep" && right.classList.contains("authored"), "split lost unrelated authored attributes")
      const marker = Array.from(left.classList).find(name => name.startsWith("◆attribution-"))!
      assert(marker && !Array.from(right.classList).some(name => name.startsWith("◆attribution-")), "new block inherited an attribution marker")
      const note = editor.appendix.querySelector<HTMLElement>(`[part="attribution-note-${marker.slice("◆attribution-".length)}"]`)!
      assert(note && note.textContent!.includes("MIT"), "original block lost its attribution display")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("new paragraphs and line breaks reveal the caret at the document end", async () => {
  const section = document.createElement("section")
  section.style.paddingTop = `${window.innerHeight}px`
  section.innerHTML = "<p>End of document</p>"
  document.body.append(section)
  try {
    for(const shiftKey of [false, true]) {
      const paragraph = section.lastElementChild!
      $.move(paragraph, paragraph.childNodes.length)
      paragraph.scrollIntoView({block: "end", behavior: "instant"})
      for(let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", shiftKey, bubbles: true, cancelable: true}))
        await layoutFrame()
        const selection = document.getSelection()!
        const margin = 1.25 * parseFloat(getComputedStyle(document.documentElement).fontSize)
        let rect = caretRect(selection.focusNode!, selection.focusOffset)
        // Selection scrolling uses smooth motion; wait for its visible result.
        for(let attempt = 0; attempt < 60 && (rect.top < margin - 1 || rect.bottom > window.innerHeight - margin + 1); attempt++) {
          await nextFrame()
          rect = caretRect(selection.focusNode!, selection.focusOffset)
        }
        assert(rect.height > 0 && rect.top >= margin - 1 && rect.bottom <= window.innerHeight - margin + 1,
          `caret outside viewport after Enter (shift: ${shiftKey}): ${rect.top}–${rect.bottom}`)
      }
    }
  }
  finally {
    section.remove()
    window.scrollTo({top: 0, behavior: "instant"})
  }
})
editor.schema.extendWidgets([{tagName: "native-audit-widget"}])

await check("native MathML editing preserves inline rendering and argument hit targets", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = 'Before <math><mi id="math-operand">x</mi></math> after'
  fixture.append(paragraph)
  const math = paragraph.querySelector("math")!
  $.move(math.firstChild!.firstChild!, 1)
  editor.features.math.execute("structure:frac")
  editor.features.math.execute("text:12")
  assert(math.querySelector("mfrac > mrow > #math-operand"), "operand was rebuilt")
  assert(math.querySelector("mfrac")!.children.length === 2, "fraction arity changed")
  editor.features.math.execute("move:up")
  editor.features.math.execute("structure:sup")
  await layoutFrame()
  const slot = math.querySelector(".◆math-slot")!
  assert(slot && slot.getBoundingClientRect().width > 0 && slot.getBoundingClientRect().height > 0, "empty argument has no native hit target")
  assert(editor.appendix.querySelector(".◆math-overlay"), "formula presentation missing from appendix")
  assert(!paragraph.querySelector(".◆math-overlay"), "formula UI leaked into content")
  assert(!editor.features.selection.captureSelectedElement, "inline formula has capture selection")
  assert(!math.classList.contains("◆element-selected"), "inline formula has a node outline")
  assert(getComputedStyle(math).backgroundColor === "rgb(238, 238, 238)", "editing formula background is missing")
  assert(getComputedStyle(slot).caretColor === "rgba(0, 0, 0, 0)", "native empty argument caret competes with the measured caret")
  assert(getComputedStyle(math).padding === "2px", "formula padding is not 2px on all sides")
  assert(!$.isGapSelection, "empty formula argument became a gap")
  const rect = slot.getBoundingClientRect()
  slot.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8, clientX: rect.left + 2, clientY: rect.top + rect.height / 2}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "3", bubbles: true, cancelable: true}))
  assert(math.querySelector("msup")?.textContent?.includes("3"), "clicking the argument did not place an editing caret")
  editor.features.math.execute("exit")
  assert(paragraph.textContent?.startsWith("Before ") && paragraph.textContent?.endsWith(" after"), "inline siblings changed")
  assert(!editor.appendix.querySelector(".◆math-overlay"), "formula presentation survived exit")
  assert(!editor.features.selection.captureSelectedElement, "formula retained capture after exit")
  assert(getComputedStyle(math).backgroundColor === "rgba(0, 0, 0, 0)", "formula kept its editing background after exit")
  paragraph.remove()
})

await check("typed formula brackets stretch to their own content and stay paired under scripts", async () => {
  const paragraph = document.createElement("p")
  paragraph.style.fontSize = "32px"
  paragraph.innerHTML = '<math><mrow></mrow></math>'
  fixture.append(paragraph)
  try {
    const math = paragraph.querySelector("math")!
    const row = math.firstElementChild!
    const edit = (command: string) => assert(editor.features.math.execute(command), `command failed: ${command}`)
    const type = (text: string) => { for(const character of text) document.dispatchEvent(new KeyboardEvent("keydown", {key: character, bubbles: true, cancelable: true})) }
    $.move(row, 0)
    type("(")
    edit("structure:frac")
    edit("structure:frac")
    type("1")
    edit("move:down")
    type("2")
    $.move(row.querySelector("mfrac")!.children[1], 0)
    edit("structure:frac")
    type("3")
    edit("move:down")
    type("4")
    $.move(row, row.childNodes.length)
    type(")+(x+1/2")
    edit("move:right")
    type(")^2")
    await document.fonts.ready
    await layoutFrame()
    const first = row.children[0]
    const second = row.children[2].firstElementChild!.firstElementChild!
    for(const group of [first, second]) {
      assert(group.localName === "mrow", "typed pair has no content row")
      const open = group.firstElementChild!.getBoundingClientRect()
      const close = group.lastElementChild!.getBoundingClientRect()
      assert(Math.abs(open.height - close.height) < 1, `paired brackets differ in height: ${open.height}/${close.height}`)
      assert(Math.abs(open.top - close.top) < 1, "paired brackets differ in vertical alignment")
    }
    assert(first.firstElementChild!.getBoundingClientRect().height > second.firstElementChild!.getBoundingClientRect().height + 4,
      "shorter bracket group stretched to the neighboring nested fraction")
    assert(!editor.toHTML(true).includes("◆"), "formula markers leaked into serialized content")
  }
  finally { paragraph.remove() }
})

await check("whole formulas receive one blue selection layer", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const display of ["inline", "block"]) for(const content of ["<mrow><mi>rterteet</mi></mrow>", "<mrow><mfrac><mi>abc</mi><mi>d</mi></mfrac><msup><mi>x</mi><mn>2</mn></msup></mrow>"]) {
      paragraph.innerHTML = `before <math display="${display}">${content}</math> after`
      const math = paragraph.querySelector("math")!
      for(const contents of [false, true]) {
        if(contents) document.getSelection()!.setBaseAndExtent(math, 0, math, math.childNodes.length)
        else $.selectElement(math)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        await layoutFrame()
        const overlays = editor.appendix.querySelectorAll<HTMLElement>('[part~="atomic-selection-overlay"]')
        assert(overlays.length === 1, "whole formula has more than one selection layer")
        const selected = overlays[0].getBoundingClientRect(), bounds = math.getBoundingClientRect()
        assert(["left", "top", "width", "height"].every(key => Math.abs(selected[key as keyof DOMRect] as number - (bounds[key as keyof DOMRect] as number)) < 1), "selection layer does not fit the formula")
        assert(getComputedStyle(overlays[0]).backgroundColor === "rgba(0, 120, 215, 0.3)", "formula does not use the shared selection blue")
        assert(getComputedStyle(math).backgroundColor === "rgba(0, 0, 0, 0)", "editing background darkens the selected formula")
        for(const node of [math, ...math.querySelectorAll("*")]) assert(getComputedStyle(node, "::selection").backgroundColor === "rgba(0, 0, 0, 0)", "native descendant selection adds another blue layer")
        const text = math.querySelector("mi")!.firstChild!
        document.getSelection()!.setBaseAndExtent(text, 0, text, 1)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        assert(!editor.appendix.querySelector('[part~="atomic-selection-overlay"]'), "partial selection retained a whole-formula overlay")
        assert(getComputedStyle(text.parentElement!, "::selection").backgroundColor !== "rgba(0, 0, 0, 0)", "partial text selection is hidden")
      }
    }
  }
  finally { paragraph.remove(); editor.features.selection.processSelection(undefined, {scrollIntoView: false}); editor.features.math.refresh() }
})

await check("empty formula carets fit their space and blink across presentation refreshes", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const display of ["inline", "block"]) for(const direction of ["ltr", "rtl"]) for(const content of ["", "<mrow></mrow>", "<mrow><mrow></mrow></mrow>", "<mstyle><mrow></mrow></mstyle>", "<mtext></mtext>", "<mfrac><mrow></mrow><mi>a</mi></mfrac>"]) {
      if(display === "inline" && content === "<mtext></mtext>") continue // Inline text tokens use the native text caret.
      paragraph.innerHTML = `a<math display="${display}" style="direction:${direction};${display === "block" ? "max-width:240px" : ""}">${content}</math>a`
      const math = paragraph.querySelector("math")!
      const position = math.querySelector("mrow:empty, mtext:empty") ?? math
      $.move(position, 0)
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      editor.features.math.refresh()
      await layoutFrame()
      let caret = editor.appendix.querySelector<HTMLElement>('[part="math-caret"]')!
      assert(caret, "empty formula has no measured caret")
      if(display === "block" && !content.includes("mfrac")) {
        const bounds = math.getBoundingClientRect(), rect = caret.getBoundingClientRect()
        const container = paragraph.getBoundingClientRect()
        assert(Math.abs((bounds.left + bounds.right) / 2 - (container.left + container.right) / 2) < 1,
          "empty block formula box is not centered in its container")
        assert(Math.abs(rect.left - (bounds.left + bounds.right) / 2) < 1,
          "empty block formula caret is not centered")
        assert(Math.abs((rect.top + rect.bottom) / 2 - (bounds.top + bounds.bottom) / 2) < 1,
          "empty block formula caret is not vertically centered")
        const height = bounds.height
        $.move(paragraph.lastChild!, 1)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        const placeholder = editor.appendix.querySelector<HTMLElement>('[part="math-placeholder"]')!
        const symbol = placeholder.querySelector("svg")!.getBoundingClientRect()
        assert(!placeholder.hidden && Math.abs((symbol.left + symbol.right) / 2 - (bounds.left + bounds.right) / 2) < 1,
          "empty block formula symbol is not centered")
        assert(Math.abs(math.getBoundingClientRect().height - height) < 1,
          "empty block formula changes height when focus leaves")
        $.move(position, 0)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        await layoutFrame()
        caret = editor.appendix.querySelector<HTMLElement>('[part="math-caret"]')!
      }
      if(!content.includes("mfrac")) {
        const container = display === "block" ? math : position
        const bounds = container.getBoundingClientRect(), rect = caret.getBoundingClientRect(), style = getComputedStyle(container)
        const top = bounds.top + (container === math ? parseFloat(style.paddingTop) : 0)
        const bottom = bounds.bottom - (container === math ? parseFloat(style.paddingBottom) : 0)
        assert(rect.top >= top - 0.5 && rect.bottom <= bottom + 0.5,
          `empty ${display} formula caret hangs below its space (${content}): ${rect.top}–${rect.bottom}, space ${top}–${bottom}`)
      }
      const animation = caret.getAnimations()[0]
      assert(animation, "caret animation cannot resolve its shadow-root keyframes")
      animation.pause()
      animation.currentTime = 750
      assert(getComputedStyle(caret).opacity === "0", "caret never enters its hidden blink phase")
      editor.features.math.refresh()
      assert(editor.appendix.querySelector('[part="math-caret"]') === caret && caret.getAnimations()[0] === animation,
        "refresh replaced the caret or restarted its blink")
      assert(getComputedStyle(caret).opacity === "0", "refresh reset the blink phase")
      animation.currentTime = 250
      assert(getComputedStyle(caret).opacity === "1", "caret never enters its visible blink phase")
      $.move(paragraph.lastChild!, 1)
      editor.features.math.refresh()
      assert(!editor.appendix.querySelector('[part="math-caret"]'), "caret survives leaving the formula")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("empty roots keep their baseline and one caret across focus and formula edges", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const direction of ["ltr", "rtl"]) for(const size of [16, 32]) {
      paragraph.innerHTML = `a<math style="direction:${direction};font-size:${size}px"><mrow><mroot><mrow></mrow><mi>a</mi></mroot></mrow></math>a`
      const math = paragraph.querySelector("math")!, row = math.firstElementChild!, root = math.querySelector("mroot")!, slot = root.firstElementChild!
      const textBounds = () => {
        const range = document.createRange()
        range.selectNodeContents(paragraph.firstChild!)
        return range.getBoundingClientRect()
      }
      const activate = (node: Node, offset: number) => {
        $.move(node, offset)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
      }
      activate(paragraph.lastChild!, 1)
      const unfocused = root.getBoundingClientRect(), baseline = textBounds()
      activate(slot, 0)
      const focused = root.getBoundingClientRect()
      assert(Math.abs(focused.top - textBounds().top - (unfocused.top - baseline.top)) < 1
        && Math.abs(focused.height - unfocused.height) < 1, "unfocused empty radical changes baseline or size")
      const overlayCarets = () => Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span")).filter(element => element.style.background)
      const caret = overlayCarets()[0].getBoundingClientRect()
      const beforeSlot = slot.getBoundingClientRect()
      editor.features.math.execute("text:x")
      const range = document.createRange()
      range.selectNodeContents(slot.firstChild!.firstChild!)
      const character = range.getBoundingClientRect()
      range.collapse(true)
      assert(Math.abs(caret.height - Math.min(character.height, beforeSlot.height)) < 1,
        "radicand caret does not use the available character height")
      assert(caret.top >= beforeSlot.top - 0.5 && caret.bottom <= beforeSlot.bottom + 0.5
        && Math.abs((caret.top + caret.bottom) / 2 - (beforeSlot.top + beforeSlot.bottom) / 2) < 0.5,
        "radicand caret hangs below the current placeholder")
      assert(Math.abs(caret.left - beforeSlot.left - (range.getBoundingClientRect().left - slot.getBoundingClientRect().left) - 1) < 1,
        "radicand caret has the wrong horizontal position")
      slot.replaceChildren()
      for(const [node, offset] of [[math, 1], [row, 1], [paragraph.lastChild!, 0], [slot, 0]] as [Node, number][]) {
        activate(node, offset)
        await layoutFrame()
        const shared = editor.features.selection.selectionCaret
        const sharedVisible = shared?.getAttribute("part")?.includes("selection-caret-text") && getComputedStyle(shared).display !== "none"
        assert(overlayCarets().length + Number(Boolean(sharedVisible)) <= 1, "formula edge shows two appendix carets")
        if(overlayCarets().length || sharedVisible) {
          assert(getComputedStyle(paragraph).caretColor === "rgba(0, 0, 0, 0)", "native formula-edge caret can paint in the surrounding paragraph")
        }
      }
      activate(paragraph.lastChild!, 1)
      assert(!math.classList.contains("◆math-structural-caret") && !editor.appendix.querySelector(".◆math-overlay"), "leaving the formula retains its caret")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("structural formula carets match inserted text without duplicate capture carets", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const display of ["inline", "block"]) for(const direction of ["ltr", "rtl"]) {
      for(const offset of [0, 1]) for(const content of [
        "<mfrac><mi>a</mi><mi>b</mi></mfrac>",
        "<mroot><mi>x</mi><mn>3</mn></mroot>",
        "<msup><mi>x</mi><mn>2</mn></msup>",
        "<munderover><mo>∑</mo><mi>i</mi><mi>n</mi></munderover>",
        "<mfrac><mfrac><mi>a</mi><mi>b</mi></mfrac><mi>c</mi></mfrac>",
      ]) {
        paragraph.innerHTML = `<math display="${display}" style="direction:${direction};font-size:32px"><mrow>${content}<mi>z</mi></mrow></math>`
        const math = paragraph.querySelector("math")!, row = math.firstElementChild!
        $.move(row, offset)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        const rootBefore = row.getBoundingClientRect()
        const baselineBefore = row.lastElementChild!.getBoundingClientRect()
        const carets = Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span"))
          .filter(element => element.style.background)
        assert(carets.length === 1, "expected exactly one structural caret")
        assert(getComputedStyle(row).caretColor === "rgba(0, 0, 0, 0)", "capture restores a second native caret")
        const caret = carets[0].getBoundingClientRect()
        const before = math.innerHTML.replace(/ class="[^"]*"/g, "")
        editor.features.math.refresh()
        assert(math.innerHTML.replace(/ class="[^"]*"/g, "") === before, "measuring the caret changed authored content")
        editor.features.math.execute("text:x")
        const text = document.getSelection()!.focusNode!
        const range = document.createRange()
        range.selectNodeContents(text)
        const character = range.getBoundingClientRect()
        range.collapse(true)
        assert(Math.abs(caret.height - character.height) < 1, "caret inherits the structure height")
        assert(Math.abs(caret.top - baselineBefore.top - (character.top - row.lastElementChild!.getBoundingClientRect().top)) < 1,
          "caret does not use the inserted character baseline")
        assert(Math.abs(caret.left - rootBefore.left - (range.getBoundingClientRect().left - row.getBoundingClientRect().left)) < 1,
          "caret does not use the insertion position")
        // Populated MathML tokens also use the measured appendix caret. Check
        // ownership after typing, rather than requiring a duplicate native caret.
        assert(math.classList.contains("◆math-structural-caret")
          && editor.appendix.querySelectorAll('[part="math-caret"]').length === 1
          && getComputedStyle(text.parentElement!).caretColor === "rgba(0, 0, 0, 0)", "typed formula does not retain exactly one caret")
      }
    }
    for(const display of ["inline", "block"]) for(const inside of [false, true]) for(const start of [false, true]) for(const direction of ["ltr", "rtl"]) {
      if(display === "block" && !inside) continue // Block exteriors are paragraph gaps.
      paragraph.innerHTML = `<span>before</span><math display="${display}" style="font-size:32px;direction:${direction}"><mfrac><mi>a</mi><mfrac><mi>b</mi><mi>c</mi></mfrac></mfrac></math><span>after</span>`
      const math = paragraph.querySelector("math")!
      const index = Array.from(paragraph.childNodes).indexOf(math)
      $.move(inside ? math : paragraph, inside ? start ? 0 : math.childNodes.length : index + Number(!start))
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      editor.features.math.refresh()
      const caret = (editor.appendix.querySelector('[part="math-caret"]') ?? editor.features.selection.selectionCaret)!.getBoundingClientRect()
      const referenceRange = document.createRange()
      referenceRange.selectNodeContents(paragraph.firstElementChild!.firstChild!)
      const reference = referenceRange.getBoundingClientRect()
      let text: Node
      if(inside) {
        editor.features.math.execute("text:x")
        text = document.getSelection()!.focusNode!
      }
      else {
        text = document.createTextNode("x")
        document.getSelection()!.getRangeAt(0).insertNode(text)
      }
      const range = document.createRange()
      range.selectNodeContents(text)
      const character = range.getBoundingClientRect()
      assert(Math.abs(caret.height - character.height) < 1, "formula edge caret inherits formula height")
      assert(Math.abs(caret.top - reference.top - (character.top - referenceRange.getBoundingClientRect().top)) < 1,
        "formula edge caret does not follow the inserted character baseline")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("formula carets follow canvas and slide zoom", async () => {
  for(const mode of ["canvas", "slides"]) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:1100px;max-width:none;height:800px"
    const content = `<p style="position:absolute;left:${mode === "slides" ? 500 : 120}px;top:100px;width:400px;font-size:32px"></p>`
    frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style></head><body class="ww-${mode}">${mode === "slides" ? `<div class="ww-slides-viewport"><section class="ww-slide" id="slide">${content}</section></div>` : content}<script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>`
    fixture.append(frame)
    try {
      const view = frame.contentWindow!
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, `${mode}: fixture did not initialize`)
      const editor = view.editor!, doc = frame.contentDocument!, paragraph = doc.querySelector("p")!
      await layoutFrame()
      const navigate = (operation: "actual-size") => mode === "canvas"
        ? editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation})
        : editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation})
      for(const deltaY of [350, -350, 0]) for(const display of ["inline", "block"]) for(const content of [
        '<mrow><mfrac><mi>a</mi><mi>b</mi></mfrac><mi>z</mi></mrow>',
        '<mrow><msup><mi>x</mi><mn>2</mn></msup><mi>z</mi></mrow>',
      ]) {
        navigate("actual-size")
        paragraph.innerHTML = `<math display="${display}">${content}</math>`
        const math = paragraph.querySelector("math")!, row = math.firstElementChild!
        const positions: [Node, number][] = [[row, 0], [row, 1], [row, 2], [row.lastChild!.firstChild!, 0], [row.lastChild!.firstChild!, 1]]
        if(display === "block") positions.push([math, 0], [math, 1])
        for(const [index, [node, offset]] of positions.entries()) {
          if(index === 0) {
            const bounds = math.getBoundingClientRect()
            math.dispatchEvent(new WheelEvent("wheel", {bubbles: true, cancelable: true, ctrlKey: true, deltaY,
              clientX: bounds.left, clientY: bounds.top}))
          }
          doc.getSelection()!.setBaseAndExtent(node, offset, node, offset)
          editor.features.selection.processSelection(undefined, {scrollIntoView: false})
          editor.features.math.refresh()
          await layoutFrame()
          const caretElement = editor.appendix.querySelector<HTMLElement>('[part="math-caret"]')!
          assert(caretElement, `${mode}: missing caret`)
          const container = node === math ? math : row
          const caret = caretElement.getBoundingClientRect(), before = container.getBoundingClientRect()
          const baseline = row.lastElementChild!.getBoundingClientRect()
          assert(editor.features.math.execute("text:x"), `${mode}: insertion failed`)
          const text = doc.getSelection()!.focusNode!, range = doc.createRange()
          range.selectNodeContents(text)
          const character = range.getBoundingClientRect()
          range.collapse(true)
          const context = `${mode}/${display}/${deltaY}/${node.nodeName}:${offset}`
          assert(Math.abs(caret.height - character.height) < 1, `${context}: caret height ${caret.height} differs from text ${character.height}`)
          assert(Math.abs(caret.top - baseline.top - (character.top - row.lastElementChild!.getBoundingClientRect().top)) < 1, `${context}: caret baseline is misaligned`)
          assert(Math.abs(caret.left - before.left - (range.getBoundingClientRect().left - container.getBoundingClientRect().left)) < 1, `${context}: caret insertion position is misaligned`)
          text.parentElement!.remove()
        }
      }
      for(const deltaY of [350, -350, 0]) {
        navigate("actual-size")
        paragraph.innerHTML = '<math display="block"><mrow></mrow></math>'
        const math = paragraph.firstElementChild!, row = math.firstElementChild!
        doc.getSelection()!.setBaseAndExtent(row, 0, row, 0)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        const authored = editor.toHTML(true), origin = math.getBoundingClientRect()
        math.dispatchEvent(new WheelEvent("wheel", {bubbles: true, cancelable: true, ctrlKey: true, deltaY,
          clientX: origin.left, clientY: origin.top}))
        await layoutFrame()
        const caret = editor.appendix.querySelector('[part="math-caret"]')!.getBoundingClientRect()
        const bounds = math.getBoundingClientRect()
        assert(Math.abs(caret.left - bounds.left - bounds.width / 2) < 1, `${mode}: empty caret is not horizontally centered after zoom`)
        assert(Math.abs(caret.top + caret.height / 2 - bounds.top - bounds.height / 2) < 1, `${mode}: empty caret is not vertically centered after zoom`)
        assert(editor.toHTML(true) === authored, `${mode}: zoom measurement changed authored content`)
        editor.features.math.execute("text:x")
        const range = doc.createRange()
        range.selectNodeContents(doc.getSelection()!.focusNode!)
        assert(Math.abs(caret.height - range.getBoundingClientRect().height) < 1, `${mode}: empty caret height does not follow zoom`)
      }
      editor.doc.syncFromDOM()
      assert(!editor.toHTML(true).includes("math-caret") && !editor.doc.body.toString().includes("◆"), `${mode}: measurement artifacts leaked`)
    }
    finally {frame.contentWindow?.editor?.destroy(); frame.remove()}
  }
})

await check("formula clicks distinguish script endings and select whole formulas", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  for(const name of ["msub", "msup", "msubsup"]) {
    paragraph.innerHTML = `Before <math><mrow><${name}><mi>x</mi><mi>ij</mi>${name === "msubsup" ? "<mi>k</mi>" : ""}</${name}><mo>+</mo><mi>y</mi></mrow></math> after`
    const math = paragraph.querySelector("math")!
    const row = math.firstElementChild!, script = row.firstElementChild!, token = script.children[1]
    await layoutFrame()
    assert(getComputedStyle(token).cursor === "text", "formula hover does not use the text cursor")
    const bounds = token.getBoundingClientRect()
    const click = (x: number, y: number, detail = 1) => {
      token.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8, clientX: x, clientY: y}))
      token.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
      token.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, detail, clientX: x, clientY: y}))
    }
    click(bounds.right, bounds.top + bounds.height / 2)
    assert($.focus === token.firstChild && $.focusOffset === 2, `${name}: did not reach the script's final character`)
    click(script.getBoundingClientRect().right + 2, bounds.top + bounds.height / 2)
    assert($.focus === row && $.focusOffset === 1, `${name}: did not reach the row after the script`)
    assert(math.classList.contains("◆math-structural-caret"), "structural caret is not drawn")
    const caret = editor.appendix.querySelector<HTMLElement>(".◆math-overlay > span")!
    const baseRange = document.createRange()
    baseRange.selectNodeContents(script.firstElementChild!)
    assert(Math.abs(caret.getBoundingClientRect().top - baseRange.getBoundingClientRect().top) < 1, "structural caret uses the base text baseline")
    click(bounds.left, bounds.top + bounds.height / 2, 2)
    const selected = document.getSelection()!.getRangeAt(0)
    assert(selected.cloneContents().textContent === math.textContent && !selected.collapsed,
      `double click did not select the whole formula: ${selected.cloneContents().textContent} (${selected.startContainer.nodeName}:${selected.startOffset}–${selected.endContainer.nodeName}:${selected.endOffset})`)
    assert(!math.classList.contains("◆math-structural-caret"), "structural caret survived range selection")
  }
  paragraph.remove()
})

await check("inline formula edges use text selections and block formula edges use gaps", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = '<math><mi>x</mi></math>'
  fixture.append(paragraph)
  const math = paragraph.firstElementChild!
  for(const display of ["inline", "block"]) {
    math.setAttribute("display", display)
    await layoutFrame()
    for(const after of [false, true]) {
      const rect = math.getBoundingClientRect()
      const x = display === "block" ? rect.left + rect.width / 2 : after ? rect.right - 1 : rect.left + 1
      const y = display === "block" ? after ? rect.bottom - 1 : rect.top + 1 : rect.top + rect.height / 2
      math.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8, clientX: x, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
      editor.features.selection.processSelection()
      assert($.anchor === paragraph && $.anchorOffset === (after ? 1 : 0), `pointer did not reach the ${after ? "after" : "before"} ${display} boundary`)
      assert($.isGapSelection === (display === "block"), `${display} formula boundary has the wrong selection kind`)
      assert(!editor.features.selection.captureSelectedElement, "formula boundary retained capture")
      assert(!math.querySelector(".◆gap-before-selected, .◆gap-after-selected"), "gap marker leaked into formula")
      if(display === "inline") {
        await layoutFrame()
        const caret = editor.features.selection.selectionCaret!
        const height = caret.getBoundingClientRect().height
        assert(height >= parseFloat(getComputedStyle(paragraph).fontSize), `formula-only outside caret is too short: ${height}px, formula ${math.getBoundingClientRect().height}px`)
        $.move(math, 0)
        editor.features.selection.processSelection()
        await layoutFrame()
        assert(caret.getBoundingClientRect().height >= parseFloat(getComputedStyle(paragraph).fontSize), `formula-only inside start caret is too short: ${caret.getBoundingClientRect().height}px`)
        $.move(paragraph, after ? 1 : 0)
        editor.features.selection.processSelection()
        const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "a"})
        paragraph.dispatchEvent(input)
        if(!input.defaultPrevented) document.execCommand("insertText", false, "a")
        assert(math.textContent === "x", "typing at an inline boundary entered the formula")
        const inserted = after ? math.nextSibling : math.previousSibling
        assert(inserted?.textContent === "a", "inline boundary did not accept surrounding text")
        inserted!.remove()
      }
    }
  }
  math.setAttribute("display", "inline")
  for(const fontSize of [16, 32]) {
    paragraph.style.fontSize = `${fontSize}px`
    for(const [node, offset] of [[paragraph, 0], [math, 0], [paragraph, 1]] as const) {
      $.move(node, offset)
      editor.features.selection.processSelection()
      await layoutFrame()
      const caret = editor.features.selection.selectionCaret!.getBoundingClientRect()
      assert(caret.height >= fontSize, `formula boundary caret ignored ${fontSize}px paragraph text: ${caret.height}px`)
      // Exact height and baseline are checked against an actual insertion in
      // the structural-caret check; prose and math can use different fonts.
    }
  }
  paragraph.style.removeProperty("font-size")
  paragraph.prepend("before")
  paragraph.append("after")
  await layoutFrame()
  const before = paragraph.firstChild as Text, after = paragraph.lastChild as Text
  const token = math.querySelector("mi")!.firstChild!
  const arrow = (key: string) => document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
  $.move(before, before.length)
  arrow("ArrowRight")
  assert($.anchor === math && $.anchorOffset === 0, "entering inline math added an outside parent stop")
  arrow("End")
  assert($.anchor === token && $.anchorOffset === 1, "End added a duplicate formula-end stop")
  assert(!editor.features.selection.selectionCaret!.style.fontSize, "formula boundary font size survived leaving the boundary")
  arrow("ArrowRight")
  assert($.anchor === after && $.anchorOffset === 0, "leaving inline math did not reuse following text")
  arrow("ArrowLeft")
  assert($.anchor === token && $.anchorOffset === 1, "backward entry added a duplicate formula-end stop")
  arrow("Home")
  arrow("ArrowLeft")
  assert($.anchor === before && $.anchorOffset === before.length, "leaving inline math did not reuse preceding text")
  const bounds = math.getBoundingClientRect()
  const outside = $.pointFromCoords(bounds.right - 1, bounds.top + bounds.height / 2, math, editor.schema)
  assert(outside?.node === after && outside.offset === 0, "pointer boundary did not reuse following text")
  paragraph.remove()
})

await check("inline formulas retain distinct inner and outer text insertion positions", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  for(const placement of ["only", "first", "middle", "last", "marked"]) {
    for(const position of ["before", "start", "end", "after"]) {
      paragraph.innerHTML = '<math><mrow><mi>x</mi></mrow></math>'
      const math = paragraph.firstElementChild!
      if(["middle", "last", "marked"].includes(placement)) paragraph.prepend("before")
      if(["first", "middle", "marked"].includes(placement)) paragraph.append("after")
      if(placement === "marked") {
        const mark = document.createElement("em")
        math.replaceWith(mark)
        mark.append(math)
      }
      const parent = math.parentNode!
      const index = Array.from(parent.childNodes).indexOf(math)
      const inside = position === "start" || position === "end"
      const node = inside ? math : parent
      const offset = inside ? position === "start" ? 0 : math.childNodes.length : index + (position === "after" ? 1 : 0)
      $.move(node, offset)
      editor.features.selection.processSelection()
      editor.features.math.refresh()
      await layoutFrame()
      const formulaBounds = math.getBoundingClientRect()
      const contentBounds = math.firstElementChild!.getBoundingClientRect()
      const padding = [contentBounds.left - formulaBounds.left, contentBounds.top - formulaBounds.top,
        formulaBounds.right - contentBounds.right, formulaBounds.bottom - contentBounds.bottom]
      assert(padding.every(value => value >= 1.9), `filled formula has insufficient inner padding: ${JSON.stringify(padding)}`)
      assert($.anchor === node && $.anchorOffset === offset, `${placement}/${position} caret moved`)
      assert($.isTextSelection && !$.isGapSelection && !editor.features.selection.captureSelectedElement, `${placement}/${position} is not text selection`)
      assert(math.classList.contains("◆math-editing") === inside, `${placement}/${position} has the wrong editing background`)
      const caret = editor.features.selection.selectionCaret!.getBoundingClientRect()
      assert(caret.width > 0 && caret.height > 0, `${placement}/${position} caret is invisible`)
      if(inside) assert(caret.left >= formulaBounds.left + 1.9 && caret.right <= formulaBounds.right - 1.9, `${placement}/${position} caret overlaps the formula padding`)
      else if(position === "before") assert(caret.right <= formulaBounds.left - 0.9, `${placement}/before caret needs an outside margin`)
      else assert(caret.left >= formulaBounds.right + 0.9, `${placement}/after caret needs an outside margin`)
      const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "a"})
      paragraph.dispatchEvent(input)
      if(!input.defaultPrevented) document.execCommand("insertText", false, "a")
      assert(math.textContent === (inside ? position === "start" ? "ax" : "xa" : "x"), `${placement}/${position} inserted on the wrong side of the formula boundary`)
    }
  }
  paragraph.remove()
})

await check("typing after a formula inserted at paragraph end stays outside MathML", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "Before"
  fixture.append(paragraph)
  $.move(paragraph.firstChild!, 6)
  editor.features.math.insert()
  editor.features.math.execute("text:x")
  const math = paragraph.querySelector("math")!
  assert(math.nextSibling instanceof Text && !math.nextSibling.length, "insertion did not retain the split empty text node")
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true}))
  await layoutFrame()
  const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "prose"})
  paragraph.dispatchEvent(input)
  if(!input.defaultPrevented) document.execCommand("insertText", false, "prose")
  assert(math.textContent === "x", "typing after exiting appended to the formula")
  assert(math.nextSibling?.textContent === "prose", "prose was not inserted after the formula")
  paragraph.remove()
})

await check("blank space around a formula paragraph selects gaps for every click count", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = 'Before <math><mi>x</mi></math>'
  paragraph.style.marginBlock = "100px"
  document.body.append(paragraph)
  const math = paragraph.querySelector("math")!
  math.after(document.createTextNode(""))
  paragraph.scrollIntoView({block: "center"})
  await layoutFrame()
  const rect = math.getBoundingClientRect()
  const x = rect.right + 40
  for(const y of [paragraph.getBoundingClientRect().top - 4, rect.top + rect.height / 2, paragraph.getBoundingClientRect().bottom + 4]) {
    const above = y < paragraph.getBoundingClientRect().top
    const below = y > paragraph.getBoundingClientRect().bottom
    const node = above || below ? document.body : paragraph
    const offset = above || below ? Array.from(document.body.childNodes).indexOf(paragraph) + (below ? 1 : 0) : 2
    for(const detail of [1, 2, 3, 1]) {
      $.move(math.firstChild!.firstChild!, 1)
      const point = $.pointFromCoords(x, y, paragraph, editor.schema)
      assert(point?.node === node && point.offset === offset && (above || below || point.overrideNative),
        `blank-space hit resolved to ${point?.node.nodeName}/${point?.offset}, override ${point?.overrideNative}`)
      const down = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, clientX: x, clientY: y, detail})
      paragraph.dispatchEvent(down)
      assert(down.defaultPrevented, `${detail} click allowed native caret placement`)
      paragraph.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true, clientX: x, clientY: y, detail}))
      paragraph.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: x, clientY: y, detail}))
      paragraph.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, clientX: x, clientY: y, detail}))
      await layoutFrame()
      assert($.anchor === node && $.anchorOffset === offset && $.isEmpty, `${detail} click returned to the formula`)
      assert($.isGapSelection === (above || below), `${detail} click has the wrong selection kind`)
    }
  }
  paragraph.remove()
  window.scrollTo(0, 0)
})

await check("leaving an empty inline formula removes it without moving the text caret", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = 'before<math><mrow></mrow></math>after'
  fixture.append(paragraph)
  const math = paragraph.querySelector("math")!
  $.move(math, 0)
  editor.features.math.refresh()
  editor.features.math.execute("exit")
  await layoutFrame()
  assert(!math.isConnected && paragraph.textContent === "beforeafter", "empty inline formula was retained or surrounding text changed")
  assert($.anchor === paragraph.lastChild && $.anchorOffset === 0, "removing an empty formula moved the surrounding text caret")
  paragraph.remove()
})

await check("audio insertion retains element selection at the document start", async () => {
  const frame = document.createElement("iframe")
  frame.src = "/editor/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "app editor did not initialize")
    await (app as any).waitForEditorWindow()
    assert(String(await app!.execute({type: "serializeDocument"})).includes("<p></p>"), "document did not start empty")
    ;(app as any).focusEditor()
    const button = frame.contentDocument!.createElement("button")
    frame.contentDocument!.body.append(button)
    button.focus()
    await new Promise(resolve => setTimeout(resolve, 50))
    ;(app as any).handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: "Audio"}}))
    await new Promise(resolve => setTimeout(resolve, 500))
    assert((app as any).nodeSelection, `app lost audio selection: ${JSON.stringify((app as any).selectionPath)}`)
    assert((app as any).selectionPath.at(-1)?.name === "Audio", "the selected element is not audio")
  }
  finally { frame.remove() }
})

await check("link keyboard preserves iframe selections and applies document, web, and reference links", async () => {
  const {LinkKeyboard, linkHistoryKey} = await import("../src/components/link-keyboard")
  const priorHistory = localStorage.getItem(linkHistoryKey)
  localStorage.removeItem(linkHistoryKey)
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:200px"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p><a>Link text</a></p><h2 id="intro">Introduction</h2></body>'
  const keyboard = new LinkKeyboard()
  fixture.append(frame, keyboard)
  const errors: string[] = []
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `link editor did not initialize: ${view.editorError}`)
    const local = view.editor!, doc = frame.contentDocument!, anchor = doc.querySelector("a")!
    const text = anchor.firstChild!, selection = doc.getSelection()!
    await layoutFrame()
    doc.body.focus(); selection.setBaseAndExtent(text, 2, text, 2)
    keyboard.state = local.features.mark.getLinkState()
    await keyboard.updateComplete
    await layoutFrame()
    assert(keyboard.shadowRoot!.activeElement === keyboard.shadowRoot!.querySelector('[aria-label="Web address"]'),
      `opening the link keyboard did not focus Web address: host=${document.activeElement?.localName}, field=${keyboard.shadowRoot!.activeElement?.outerHTML}`)
    assert(selection.anchorNode === text && selection.anchorOffset === 2 && selection.focusNode === text && selection.focusOffset === 2,
      "focusing Web address changed the authored document selection")
    keyboard.addEventListener("link-keyboard-command", event => {
      try { local.features.mark.editLink((event as CustomEvent).detail); keyboard.state = local.features.mark.getLinkState() }
      catch(error) { errors.push(String(error)) }
    })
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>("#tab-document")!.click()
    await keyboard.updateComplete
    const search = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Search document links"]')!
    search.focus(); search.value = "Intro"; search.dispatchEvent(new Event("input"))
    await keyboard.updateComplete
    assert(selection.anchorNode === text && selection.anchorOffset === 2, "host keyboard input lost the iframe caret")
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".target")!.click()
    assert(anchor.getAttribute("href") === "#intro", "document target was not applied")
    keyboard.state = local.features.mark.getLinkState()
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>("#tab-web")!.click()
    await keyboard.updateComplete
    const url = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Web address"]')!
    url.focus(); url.value = "example.test/source"; url.dispatchEvent(new Event("input"))
    const applyWeb = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Apply web link"]')!
    for(const width of [760, 360]) {
      keyboard.style.width = `${width}px`
      await layoutFrame()
      const labelRow = keyboard.shadowRoot!.querySelector<HTMLElement>(".web-label-row")!
      const options = keyboard.shadowRoot!.querySelector<HTMLElement>(".web-options")!
      assert(labelRow.scrollWidth <= labelRow.clientWidth + 1, `Web options overflowed at width ${width}`)
      assert(Math.abs(options.getBoundingClientRect().right - labelRow.getBoundingClientRect().right) <= 1, "Web options are not right aligned")
      assert(Math.abs(applyWeb.getBoundingClientRect().right - url.getBoundingClientRect().right) <= 1, "Web arrow is not at the end of the input")
    }
    applyWeb.click()
    assert(anchor.getAttribute("href") === "https://example.test/source", "web address was not normalized to an absolute HTTPS URL")
    keyboard.state = local.features.mark.getLinkState()
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[role="tab"]:last-child')!.click()
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Add reference"]')!.click()
    await keyboard.updateComplete
    const dialog = keyboard.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!
    assert(dialog.open, "reference + did not open a native dialog")
    assert(selection.anchorNode === text && selection.anchorOffset === 2, "reference dialog lost the iframe caret")
    const title = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Title"]')!
    title.value = "Reference source"; title.dispatchEvent(new Event("input"))
    const link = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Link (optional)"]')!
    link.value = ""; link.dispatchEvent(new Event("input"))
    dialog.querySelector<HTMLButtonElement>(".actions button:last-child")!.click()
    await keyboard.updateComplete
    assert(!dialog.open, "successful reference addition did not close the dialog")
    assert(anchor.getAttribute("href")?.startsWith("#ref-"), "reference without a web representation did not get a fragment")
    assert(JSON.parse(anchor.dataset.reference!).title === "Reference source", "reference metadata was not applied")
    assert(anchor.textContent === "Link text" && !doc.body.innerHTML.includes("link-keyboard"), "keyboard changed authored text or leaked UI")
    const automaticBlock = doc.createElement("p"), untouchedBlock = doc.createElement("p")
    automaticBlock.textContent = "Visit auto.example.test/path and email reader+tag@example.test."
    untouchedBlock.textContent = "https://untouched.example.test"
    doc.body.append(automaticBlock, untouchedBlock)
    const automaticText = automaticBlock.firstChild as Text
    selection.setBaseAndExtent(automaticText, automaticText.length, automaticText, automaticText.length)
    automaticBlock.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    await layoutFrame()
    assert(automaticBlock.querySelector("a")?.getAttribute("href") === "https://auto.example.test/path", "typed URL was not automatically linked")
    assert(automaticBlock.querySelectorAll("a")[1]?.getAttribute("href") === "mailto:reader+tag@example.test", "typed email address was not automatically linked with mailto")
    assert(!untouchedBlock.querySelector("a"), "automatic linking scanned an unrelated text block")
    assert(selection.anchorNode?.textContent === "." && selection.anchorOffset === 1 && selection.isCollapsed,
      "automatic linking moved the native caret")
    assert(!errors.length, errors.join("; "))
    for(const width of [760, 360]) {
      keyboard.style.width = `${width}px`
      await layoutFrame()
      const section = keyboard.shadowRoot!.querySelector<HTMLElement>("section")!
      assert(section.scrollWidth <= section.clientWidth + 1, `keyboard overflowed at width ${width}`)
      assert(keyboard.getBoundingClientRect().height > 250, "keyboard lost its math-style bottom panel size")
      const panel = keyboard.shadowRoot!.querySelector<HTMLElement>(".panel")!
      const bar = panel.querySelector<HTMLElement>(".search-bar")!
      const values = panel.querySelector<HTMLElement>(".targets")!
      assert(values.clientHeight > 100 && getComputedStyle(values).overflowY === "auto", "suggestions do not fill a scrollable panel")
      assert(bar.getBoundingClientRect().bottom <= values.getBoundingClientRect().top + 1, "suggestions overlap the search bar")
      const inputPositions: number[] = []
      for(const tab of ["web", "document", "reference"]) {
        keyboard.shadowRoot!.querySelector<HTMLButtonElement>(`#tab-${tab}`)!.click()
        await keyboard.updateComplete
        await layoutFrame()
        inputPositions.push(keyboard.shadowRoot!.querySelector<HTMLElement>(".search-bar")!.getBoundingClientRect().top - keyboard.getBoundingClientRect().top)
      }
      assert(Math.max(...inputPositions) - Math.min(...inputPositions) <= 1, `input shifted between tabs at width ${width}`)
    }
    const remembered = new LinkKeyboard()
    remembered.state = {active: true, identity: "remembered", href: "", attributes: {}, text: "", targets: []}
    fixture.append(remembered); await remembered.updateComplete
    assert(remembered.history.urls.includes("https://example.test/source"), "Web URL was not remembered across keyboard instances")
    remembered.shadowRoot!.querySelector<HTMLButtonElement>("#tab-reference")!.click(); await remembered.updateComplete
    assert(remembered.shadowRoot!.querySelector(".target")?.textContent?.includes("Reference source"), "reference was not remembered across keyboard instances")
    remembered.remove()
  }
  finally {
    frame.contentWindow?.editor?.destroy(); frame.remove(); keyboard.remove()
    if(priorHistory === null) localStorage.removeItem(linkHistoryKey)
    else localStorage.setItem(linkHistoryKey, priorHistory)
  }
})

await check("editor command preserves a live selection", () => {
  const text = document.querySelector("#before")!.firstChild!
  const selection = getSelection()!
  selection.setBaseAndExtent(text, 2, text, 2)
  const inserted = document.createElement("span")
  inserted.textContent = " inserted"
  editor.features.manipulation.insert(inserted)
  assert(selection.anchorNode?.isConnected && selection.focusNode?.isConnected, "command left disconnected selection endpoints")
  assert(document.querySelector("#before > span")?.textContent === " inserted", `command did not insert at the selected caret: ${document.body.innerHTML}`)
})

await check("touch caret and ranges use shared pointer selection", async () => {
  const lifecycle = document.querySelector<HTMLIFrameElement>("#lifecycle")!
  for(let attempt = 0; attempt < 100 && !lifecycle.contentWindow?.editor; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  const paragraph = document.createElement("p")
  paragraph.innerHTML = '<b>before</b><!--keep--><i>after</i>'
  fixture.append(paragraph)
  try {
    paragraph.scrollIntoView({block: "center", behavior: "instant"})
    await layoutFrame()
    const before = paragraph.querySelector("b")!.firstChild!, after = paragraph.querySelector("i")!.firstChild!
    const range = document.createRange()
    const point = (node: Node) => {
      range.setStart(node, 2); range.collapse(true)
      const rect = range.getBoundingClientRect()
      return {clientX: rect.left, clientY: rect.top + rect.height / 2}
    }
    let start = point(before), end = point(after)
    const touch = (type: string, coordinates = start) => {
      const event = new PointerEvent(type, {bubbles: true, composed: true, cancelable: true,
        button: 0, pointerId: 71, pointerType: "touch", isPrimary: true, ...coordinates})
      paragraph.dispatchEvent(event)
      return event
    }
    assert(touch("pointerdown").defaultPrevented, "touch did not retain the editor caret")
    const touchStart = new TouchEvent("touchstart", {bubbles: true, cancelable: true,
      touches: [new Touch({identifier: 71, target: paragraph, ...start})]})
    paragraph.dispatchEvent(touchStart)
    assert(touchStart.defaultPrevented, "touch selection left native panning enabled")
    touch("pointerup")
    assert($.anchor === before && $.anchorOffset === 2 && $.isEmpty, "touch tap did not place the caret at the hit-tested point")
    for(let tap = 0; tap < 2; tap++) {
      start = point(before)
      touch("pointerdown"); touch("pointerup")
      await layoutFrame()
      const caret = editor.features.selection.selectionCaret!
      assert(caret?.classList.contains("◆selection-caret-text") && getComputedStyle(caret).display !== "none"
        && caret.getBoundingClientRect().height > 0, `touch release hid the shared text caret: ${caret?.getAttribute("part")}, ${caret && getComputedStyle(caret).display}, ${caret?.getBoundingClientRect().height}, focus ${document.activeElement?.localName}`)
      assert(caret.getRootNode() === editor.appendix && !editor.toHTML(true).includes("◆touch-caret-visible"), "touch caret leaked into authored HTML")
    }
    start = point(before); end = point(after)
    touch("pointerdown")
    touch("pointermove", end)
    touch("pointerup", end)
    assert($.anchor === before && $.anchorOffset === 2 && $.focus === after && $.focusOffset === 2, "touch drag did not use shared range selection")
    assert(!editor.features.selection.isInDragSelection && !document.body.classList.contains("◆selection-dragging"), "touch selection did not clean up")
    const relay = (event: "pointerdown" | "pointermove" | "pointerup", coordinates = start) => replayHostPointer({
      event, x: coordinates.clientX, y: coordinates.clientY, pointerId: 72, buttons: event === "pointerup" ? 0 : 1,
    })
    for(let tap = 0; tap < 2; tap++) {
      start = point(before)
      relay("pointerdown"); relay("pointerup")
      await layoutFrame()
      assert($.anchor === before && $.anchorOffset === 2 && $.isEmpty
        && document.body.classList.contains("◆touch-caret-visible"), "relayed touch tap lost the shared caret")
    }
    start = point(before); end = point(after)
    relay("pointerdown"); relay("pointermove", end); relay("pointerup", end)
    assert($.anchor === before && $.anchorOffset === 2 && $.focus === after && $.focusOffset === 2
      && !editor.features.selection.isInDragSelection, "relayed touch did not retain and clean up the shared range")
  }
  finally {paragraph.remove()}
})

await check("modifier clicks select table cells and outer borders", async () => {
  const table = document.createElement("table")
  table.innerHTML = '<tbody><tr><th rowspan="2"><button>Run</button></th><td>B</td></tr><tr><td>C</td></tr></tbody>'
  table.style.cssText = "width:320px;border:2px solid black"
  table.querySelectorAll<HTMLElement>("td, th").forEach(cell => cell.style.cssText = "padding:20px;border:1px solid black")
  fixture.append(table)
  const cell = table.querySelector("th")!
  const button = cell.querySelector("button")!
  let activations = 0
  button.addEventListener("click", () => activations++)
  const click = (target: Element, x: number, y: number) => {
    for(const type of ["pointerdown", "pointerup", "click"]) {
      const event = new PointerEvent(type, {button: 0, bubbles: true, composed: true, cancelable: true,
        ctrlKey: true, metaKey: true, clientX: x, clientY: y})
      target.dispatchEvent(event)
      assert(event.defaultPrevented, `${type} reached native activation`)
    }
  }
  try {
    for(const collapse of ["collapse", "separate"]) for(const captionSide of ["none", "top", "bottom"]) {
      table.style.borderCollapse = collapse
      table.style.borderSpacing = "8px"
      table.caption?.remove()
      if(captionSide !== "none") {
        const caption = table.createCaption()
        caption.textContent = "Table caption"
        caption.style.captionSide = captionSide
      }
      table.scrollIntoView()
      await layoutFrame()
      const rect = table.getBoundingClientRect(), box = cell.getBoundingClientRect()
      const top = captionSide === "top" ? table.caption!.getBoundingClientRect().bottom : rect.top
      const bottom = captionSide === "bottom" ? table.caption!.getBoundingClientRect().top : rect.bottom
      click(button, box.left + box.width / 2, box.top + box.height / 2)
      assert(editor.features.table.selectedCells.length === 1 && editor.features.table.selectedCells[0] === cell, `${collapse}: cell interior did not select its cell`)
      const next = table.querySelector("td")!.getBoundingClientRect()
      click(table, (box.right + next.left) / 2, next.top + next.height / 2)
      assert(editor.features.table.hasCellSelection, `${collapse}: inner border selected the table`)
      for(const [x, y] of [[rect.left + 1, (top + bottom) / 2], [rect.right - 1, (top + bottom) / 2],
        [rect.left + rect.width / 2, top + 1], [rect.left + rect.width / 2, bottom - 1]]) {
        click(table, x, y)
        assert($.selectedElement === table && !editor.features.table.hasCellSelection, `${collapse}: outer border did not select the table`)
      }
      click(button, box.left + box.width / 2, box.top + box.height / 2)
      assert(editor.features.table.selectedCells[0] === cell, `${collapse}: table selection prevented cell selection`)
    }
    assert(!activations, "modifier-click activated a cell control")
    assert(!editor.toHTML(true).includes("◆"), "cell selection markers leaked into serialization")
  }
  finally {
    editor.features.table.clearCellSelection(false)
    table.remove()
    $.selectDocumentStart()
    editor.features.selection.processSelection()
  }
})

await check("table insertion controls follow rotated edges and preview lines", async () => {
  const parent = document.createElement("div")
  parent.style.cssText = "width:480px;margin:180px auto"
  parent.innerHTML = '<table style="width:320px;border-spacing:8px;border:2px solid black"><caption>Rotated table</caption><tbody><tr><th colspan="2">Merged heading</th></tr><tr><td>Left cell</td><td>Right cell</td></tr></tbody></table>'
  const table = parent.querySelector("table")!
  table.querySelectorAll<HTMLElement>("td, th").forEach(cell => cell.style.cssText = "height:48px;padding:12px;border:1px solid black;background:#f1f5f9")
  fixture.append(parent)
  const near = (actual: number, expected: number, label: string) => assert(Math.abs(actual - expected) < 1.5, `${label}: ${actual} != ${expected}`)
  try {
    for(const rtl of [false, true]) for(const angle of [0, 45, 90, 135, -75]) {
      table.style.direction = rtl ? "rtl" : "ltr"
      table.style.rotate = "none"
      parent.style.transform = "none"
      await layoutFrame()
      const original = table.getBoundingClientRect()
      const rows = Array.from(table.rows, row => row.getBoundingClientRect())
      const cells = Array.from(table.rows[1].cells, cell => cell.getBoundingClientRect())
      const columns = rtl ? [cells[0].right, (cells[0].left + cells[1].right) / 2, cells[1].left]
        : [cells[0].left, (cells[0].right + cells[1].left) / 2, cells[1].right]
      const boundaries = [...columns.map(x => ({x, y: rows[0].top - 8})),
        ...[rows[0].top, (rows[0].bottom + rows[1].top) / 2, rows[1].bottom].map(y => ({x: original.left - 8, y}))]
      const scale = rtl ? 1.25 : 1
      table.style.rotate = `${angle}deg`
      parent.style.transform = `scale(${scale})`
      $.selectElement(table)
      editor.features.selection.processSelection()
      table.scrollIntoView({block: "center"})
      table.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, composed: true}))
      await layoutFrame()
      const live = table.getBoundingClientRect()
      const radians = angle * Math.PI / 180
      const a = Math.cos(radians) * scale, b = Math.sin(radians) * scale
      const project = (point: {x: number, y: number}) => {
        const x = point.x - original.left - original.width / 2, y = point.y - original.top - original.height / 2
        return {x: live.left + live.width / 2 + a * x - b * y, y: live.top + live.height / 2 + b * x + a * y}
      }
      const overlay = editor.appendix.querySelector<HTMLElement>(".◆table-gaps")!
      const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>("button"))
      assert(!overlay.hidden && buttons.length === 6, `${angle}: insertion controls are missing`)
      buttons.forEach((button, index) => {
        const expected = project(boundaries[index]), rect = button.getBoundingClientRect()
        near(rect.left + rect.width / 2, expected.x, `${angle}/${rtl}/${index} x`)
        near(rect.top + rect.height / 2, expected.y, `${angle}/${rtl}/${index} y`)
        button.focus({preventScroll: true})
        const line = button.querySelector("span")!.getBoundingClientRect()
        const end = project(index < 3 ? {x: boundaries[index].x, y: rows[1].bottom}
          : {x: original.right, y: boundaries[index].y})
        near(line.left + line.width / 2, (expected.x + end.x) / 2, `${angle}/${rtl}/${index} preview x`)
        near(line.top + line.height / 2, (expected.y + end.y) / 2, `${angle}/${rtl}/${index} preview y`)
      })
      assert(!table.querySelector("button, span"), "insertion UI leaked into authored content")
      assert(!editor.toHTML(true).includes("table-gaps"), "insertion UI leaked into serialization")
    }
    const before = table.rows.length
    editor.appendix.querySelector<HTMLButtonElement>('.◆table-gaps button[aria-label="Insert row 2"]')!.click()
    assert(table.rows.length === before + 1, "rotated row control did not insert a row")
  }
  finally {
    parent.remove()
    $.selectDocumentStart()
    editor.features.selection.processSelection()
  }
})

await check("selection feature treats custom element as atomic", async () => {
  const widget = fixture.querySelector("native-audit-widget")!
  $.selectElement(widget)
  editor.features.selection.processSelection()
  assert($.isElementSelection && $.selectedElement === widget, "selection feature did not select the widget host")
  assert(widget.classList.contains("◆element-selected"), "selection marker missing from widget host")
  assert(widget.shadowRoot!.querySelector("button"), "widget shadow DOM missing")
  assert(widget.getAttribute("contenteditable") === "false", "editor changed authored widget editability")
  const paragraph = document.createElement("p")
  paragraph.innerHTML = '<b>before</b><native-audit-widget></native-audit-widget><video></video><i>after</i>'
  fixture.append(paragraph)
  try {
    const button = widget.shadowRoot!.querySelector("button")!
    editor.features.selection.captureElement(widget)
    button.focus()
    const destination = paragraph.querySelector("b")!.firstChild!
    const drop = document.createRange()
    drop.setStart(destination, 2)
    drop.collapse(true)
    editor.features.selection.selectDropRange(drop, {scrollIntoView: false})
    assert(editor.features.selection.captureSelectedWidget === null, "drop caret retained widget capture")
    assert(widget.shadowRoot!.activeElement !== button, "drop caret retained shadow button focus")
    assert($.anchor === destination && $.anchorOffset === 2, "drop caret did not reach its text destination")
    for(const mode of ["closed", "nested open", "nested closed"] as const) {
      const host = document.createElement("native-drop-widget")
      const shadow = host.attachShadow({mode: mode === "closed" ? "closed" : "open"})
      const nested = mode.startsWith("nested") ? document.createElement("native-nested-drop-widget") : null
      const focusRoot = nested ? nested.attachShadow({mode: mode === "nested closed" ? "closed" : "open"}) : shadow
      if(nested) shadow.append(nested)
      const control = document.createElement("button")
      control.textContent = "Widget control"
      focusRoot.append(control)
      paragraph.append(host)
      try {
        editor.features.selection.captureElement(host)
        control.focus()
        assert(document.activeElement === host && focusRoot.activeElement === control, `${mode} shadow control did not receive focus`)
        editor.features.selection.selectDropRange(drop, {scrollIntoView: false})
        assert(editor.features.selection.captureSelectedWidget === null, `${mode} drop retained capture`)
        assert(document.activeElement !== host && focusRoot.activeElement !== control, `${mode} drop retained shadow focus`)
        assert($.anchor === destination && $.anchorOffset === 2, `${mode} drop lost its destination`)
      }
      finally { host.remove() }
    }
    const leaves = [paragraph.querySelector("native-audit-widget")!, paragraph.querySelector("video")!]
    let step = 0
    const press = (key: string) => {
      step++
      const before = $.toString()
      const event = new KeyboardEvent("keydown", {key, shiftKey: true, bubbles: true, cancelable: true})
      document.dispatchEvent(event)
      assert(event.defaultPrevented, `Step ${step}: ${key} did not extend across an atomic element from ${before} to ${$.toString()} (capture: ${editor.features.selection.isCaptureSelection})`)
    }
    for(const backward of [false, true]) {
      $.move(paragraph, backward ? 3 : 1)
      press(backward ? "ArrowLeft" : "ArrowRight")
      document.dispatchEvent(new KeyboardEvent("keyup", {key: "Shift", bubbles: true}))
      await layoutFrame()
      assert($.anchor === paragraph && $.anchorOffset === (backward ? 3 : 1), "Shift-arrow moved its anchor")
      assert($.isBackwards === backward, "selection refresh lost the Shift-arrow direction")
      press(backward ? "ArrowLeft" : "ArrowRight")
      assert(leaves.every(element => element.classList.contains("◆atomic-range-selected")), "consecutive leaves were not selected")
      press(backward ? "ArrowRight" : "ArrowLeft")
      press(backward ? "ArrowRight" : "ArrowLeft")
      assert($.isEmpty && $.anchorOffset === (backward ? 3 : 1), "reversing Shift-arrow did not shrink to its anchor")
      assert(leaves.every(element => !element.classList.contains("◆atomic-range-selected")), "shrinking left an atomic marker")
    }
  }
  finally { paragraph.remove(); $.selectElement(widget); editor.features.selection.processSelection() }
})

await check("node drag borders leave native text and table editing reachable", async () => {
  for(const tag of ["p", "h2", "table"]) {
    const element = document.createElement(tag)
    element.style.cssText = "width:360px;line-height:32px;padding:12px"
    element.innerHTML = tag === "table" ? "<tbody><tr><td>editable text</td></tr></tbody>" : "editable text"
    fixture.append(element)
    const block = element.querySelector("td") ?? element, text = block.firstChild!
    try {
      $.selectElement(element)
      editor.features.selection.processSelection()
      element.scrollIntoView({block: "center", behavior: "instant"})
      await layoutFrame()
      const surface = editor.appendix.querySelector<HTMLElement>('[part~="node-drag-surface"]')!
      assert(surface?.draggable, "selected flow content lost native dragging")
      const range = document.createRange()
      range.setStart(text, 3); range.setEnd(text, 4)
      const rect = range.getBoundingClientRect()
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      const hit = document.elementFromPoint(x, y)
      assert(hit === block || block.contains(hit), `${tag} text is covered by its drag surface`)
      hit!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 91, clientX: x, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 91, clientX: x, clientY: y}))
      assert(document.getSelection()?.isCollapsed && block.contains($.anchor), `${tag} click did not enter text editing`)
      assert(document.execCommand("insertText", false, "X") && block.textContent?.includes("X"), `${tag} typing was blocked`)
      assert(!surface.isConnected, `${tag} retained its drag surface after entering text`)
      assert(!editor.toHTML(true).includes("clip-path"), "drag clipping leaked into authored HTML")
    }
    finally { element.remove() }
  }
})

await check("paragraph and heading drags join text at the native caret", async () => {
  for(const [sourceTag, targetTag] of [["p", "p"], ["p", "h2"], ["h2", "p"], ["h2", "h3"]]) {
    for(const offset of [0, 3, 6]) {
      const section = document.createElement("section")
      section.innerHTML = `<${sourceTag}><b>source</b></${sourceTag}><${targetTag}>target</${targetTag}>`
      fixture.append(section)
      const source = section.firstElementChild!, target = section.lastElementChild!, text = target.firstChild!
      try {
        $.selectElement(source)
        editor.features.selection.processSelection()
        target.scrollIntoView({block: "center", behavior: "instant"})
        await layoutFrame()
        const surface = editor.appendix.querySelector<HTMLElement>('[part~="node-drag-surface"]')!
        assert(surface?.draggable, "text block has no drag surface")
        const dataTransfer = new DataTransfer()
        surface.dispatchEvent(new DragEvent("dragstart", {dataTransfer, bubbles: true, composed: true, cancelable: true}))
        const letter = document.createRange()
        letter.setStart(text, offset === 6 ? 5 : offset)
        letter.setEnd(text, offset === 6 ? 6 : offset + 1)
        const rect = letter.getBoundingClientRect()
        const init = {dataTransfer, clientX: offset === 6 ? rect.right - .1 : rect.left + .1,
          clientY: rect.top + rect.height / 2, bubbles: true, composed: true, cancelable: true}
        target.dispatchEvent(new DragEvent("dragover", init))
        assert($.anchor === text && $.anchorOffset === offset, `${sourceTag}/${targetTag}/${offset}: preview missed native caret`)
        assert(!editor.appendix.querySelector("#◆float-drop-preview"), "text join showed a float preview")
        target.dispatchEvent(new DragEvent("drop", init))
        const expected = "target".slice(0, offset) + "source" + "target".slice(offset)
        assert(target.textContent === expected && !source.isConnected, `${sourceTag}/${targetTag}/${offset}: text did not join`)
        assert(target.querySelector("b")?.textContent === "source", "join lost inline formatting")
        assert(document.getSelection()?.isCollapsed && target.contains($.anchor), "join lost its text caret")
        assert(document.execCommand("insertText", false, "!") && target.textContent === "target".slice(0, offset) + "source!" + "target".slice(offset), "typing did not continue after joined text")
        assert(!document.body.classList.contains("◆drop-selection-active"), "join retained the drop marker")
      }
      finally { section.remove() }
    }
  }
})

await check("layout based hit testing returns the rendered target", async () => {
  await nextFrame()
  const target = document.querySelector<HTMLElement>("#hit-target")!
  const rect = target.getBoundingClientRect()
  assert(rect.width > 0 && rect.height > 0, "target has no rendered box")
  assert(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === target, "elementFromPoint missed target")
  const point = $.pointFromCoords(rect.left + rect.width / 2, rect.top + rect.height / 2, target, editor.schema)
  assert(point?.node, "editor hit testing returned no point")
})

await check("clicks below closed details keep hidden media collapsed", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:700px;height:600px;max-width:none"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><details style="padding:16px 24px 32px"><summary>Heading</summary><!--keep--><video controls width="320" height="180"></video></details></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow!
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `disclosure editor did not initialize: ${view.editorError}`)
    const frameEditor = view.editor!, doc = frame.contentDocument!
    const details = doc.querySelector("details")!, video = details.querySelector("video")!
    await layoutFrame()
    for(const source of [null, "data:video/mp4;base64,"]) {
      if(source) video.setAttribute("src", source)
      else video.removeAttribute("src")
      await layoutFrame()
      const authored = frameEditor.toHTML(true)
      const rect = video.getBoundingClientRect()
      assert(rect.height > 0, "hidden media fixture has no retained layout box")
      for(const x of [rect.left + 4, rect.left + rect.width / 2, rect.right - 4]) for(const y of [rect.top + 8, rect.top + rect.height / 2, rect.bottom - 4]) {
        const target = frameEditor.appendix.elementFromPoint(x, y) ?? doc.elementFromPoint(x, y)!
        assert(!target.closest(".◆media-interaction-shield"), "hidden video retained an interactive appendix shield")
        const down = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 84, clientX: x, clientY: y})
        target.dispatchEvent(down)
        target.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, composed: true, button: 0, pointerId: 84, clientX: x, clientY: y}))
        await layoutFrame()
        const selection = doc.getSelection()!
        assert(down.defaultPrevented && selection.isCollapsed && selection.anchorNode === doc.body && selection.anchorOffset === 1,
          `click did not retain the outer details gap: ${selection.anchorNode?.nodeName} ${selection.anchorOffset}`)
        assert(!details.open && !frameEditor.features.selection.captureSelectedElement, "click opened details or captured hidden media")
        assert(frameEditor.toHTML(true) === authored, "click changed authored HTML")
      }
    }
    details.open = true
    await layoutFrame()
    assert(frameEditor.appendix.querySelector(".◆media-interaction-shield"), "expanded media did not regain its interaction shield")
    details.open = false
    await layoutFrame()
    assert(!frameEditor.appendix.querySelector(".◆media-interaction-shield"), "closing details retained its media shield")
    const summary = details.querySelector("summary")!
    for(const backward of [false, true]) {
      summary.textContent = "Heading"
      doc.getSelection()!.setBaseAndExtent(details, Number(backward), details, Number(!backward))
      frameEditor.features.selection.processSelection()
      assert(!details.open, "selecting the summary's parent range opened the disclosure")
      frameEditor.features.manipulation.delete()
      assert(!details.open && details.querySelector("summary") === summary && !summary.textContent,
        "clearing the selected summary opened or replaced the disclosure")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("focused AI previews preserve widgets, contextual HTML, and rendered styles", async () => {
  const paragraph = document.createElement("p")
  paragraph.id = "ai-native-paragraph"
  paragraph.textContent = "Before AI"
  const table = document.createElement("table")
  table.innerHTML = '<tbody><tr id="ai-native-row"><td>A</td></tr></tbody>'
  fixture.append(paragraph, table)
  const widget = fixture.querySelector("native-audit-widget")!
  const target = (selector: string) => (editor.features.state.actions.inspectAIElements({type: "inspectAIElements", selector})).elements[0].target
  try {
    const paragraphTarget = target("#ai-native-paragraph")
    editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "native-ai", summary: "Improve the exercise.", availableWidgets: ["native-audit-widget"], operations: [
      {type: "set_text", target: paragraphTarget, text: "Proposed AI"},
      {type: "set_styles", target: paragraphTarget, styles: {color: "rgb(255, 0, 0)"}},
      {type: "insert_html", target: target("#ai-native-row"), position: "append", html: "<td>B</td>"},
      {type: "insert_html", target: paragraphTarget, position: "after", html: '<native-audit-widget id="ai-native-widget"></native-audit-widget>'},
    ]})
    await layoutFrame()
    const inserted = fixture.querySelector("#ai-native-widget")!
    assert(paragraph.isConnected && widget.isConnected, "preview replaced existing nodes")
    assert(inserted.shadowRoot?.querySelector("button"), "proposed widget did not upgrade on insertion")
    assert(table.querySelectorAll("td").length === 2, "table insertion lost its parsing context")
    assert(getComputedStyle(paragraph).color === "rgb(255, 0, 0)", "proposed styles did not render")
    assert(!editor.doc.body.toString().includes("Proposed AI"), "preview leaked into collaboration")
    assert(editor.appendix.querySelector(".◆ai-review-toolbar"), "review controls are missing from the appendix")
    editor.features.state.actions.acceptAIEdit({type: "acceptAIEdit", editId: "native-ai"})
    assert(fixture.querySelector("#ai-native-widget") === inserted, "acceptance recreated the inserted widget")
    assert(paragraph.isConnected && widget.isConnected, "acceptance replaced an existing instance")
    editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "native-ai-reject", summary: "Revise the paragraph.", operations: [
      {type: "set_text", target: target("#ai-native-paragraph"), text: "Rejected AI"},
    ]})
    editor.features.state.actions.rejectAIEdit({type: "rejectAIEdit", editId: "native-ai-reject"})
    assert(paragraph.textContent === "Proposed AI", "rejection lost accepted content")
    editor.features.state.actions.undoAIEdit({type: "undoAIEdit", editId: "native-ai"})
    assert(paragraph.textContent === "Before AI", "selective undo did not restore the paragraph")
    assert(!editor.toHTML(true).includes("◆"), "AI markers leaked into serialization")
  }
  finally {
    for(const editId of ["native-ai", "native-ai-reject"]) {
      try { editor.features.state.actions.rejectAIEdit({type: "rejectAIEdit", editId}) }
      catch { /* A successful check has already settled both previews. */ }
    }
    fixture.querySelector("#ai-native-widget")?.remove()
    paragraph.remove()
    table.remove()
  }
})

await check("shape labels retain capture while typing and selecting text", async () => {
  $.selectRange(fixture, fixture.childNodes.length)
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = $.selectedElement as SVGSVGElement
  try {
    graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
    let proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    const text = graphic.querySelector("text")!
    await layoutFrame()
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "L", bubbles: true, cancelable: true}))
    document.execCommand("insertText", false, "Label text")
    await layoutFrame()
    assert(text.textContent === "Label text", "typing did not reach the SVG label")
    assert(editor.features.selection.captureSelectedElement === graphic, "typing lost graphic capture")
    const caret = editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!
    assert(getComputedStyle(caret).animationName === "blink", "the label caret does not blink")
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    await layoutFrame()
    assert(getComputedStyle(text).cursor === "text" && getComputedStyle(text).pointerEvents !== "none", "closed label is not a text target")
    assert(getComputedStyle(text, "::selection").backgroundColor === "rgba(0, 0, 0, 0)", "shape selection highlights its label")
    const point = (index: number) => {
      const start = text.getStartPositionOfChar(index), end = text.getEndPositionOfChar(index)
      return new DOMPoint(start.x + (end.x - start.x) * .1, (start.y + end.y) / 2).matrixTransform(text.getScreenCTM()!)
    }
    const start = point(8), end = point(2)
    text.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 98, clientX: start.x, clientY: start.y, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 98, clientX: end.x, clientY: end.y, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 98}))
    await layoutFrame()
    proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    assert(proxy, "one click did not reopen label editing")
    const selected = editor.features.graphic.textEditingRange!.toString()
    assert(selected === "bel te", `drag selected the wrong text: ${selected}`)
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true}))
    assert(editor.features.graphic.textEditingRange!.toString() === "el te", "backwards Shift selection lost its anchor")
    editor.features.selection.processSelection()
    assert(editor.features.selection.captureSelectedElement === graphic && graphic.classList.contains("◆element-capture-selected"), "text selection lost graphic capture")
    proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "!", cancelable: true}))
    assert(text.textContent === "Lab!xt", "typing did not replace the selected text")
    const word = point(5)
    text.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 99, clientX: word.x, clientY: word.y, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 99}))
    text.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0, cancelable: true}))
    assert(editor.features.graphic.textEditingRange!.toString() === "xt", "double-click did not select the label word")
    text.dispatchEvent(new MouseEvent("click", {bubbles: true, button: 0, detail: 3, cancelable: true}))
    assert(editor.features.graphic.textEditingRange!.toString() === "Lab!xt", "triple-click did not select the label line")
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    assert(!graphic.querySelector('[class*="◆graphic-text-editing"]'), "label editing marker was not cleaned up")
  }
  finally {
    graphic.remove()
    $.selectDocumentStart()
    editor.features.selection.processSelection()
  }
})

await check("ribbon dropdowns join their triggers without gaps at viewport edges", async () => {
  const {RibbonButton} = await import("../src/components/ribbon-button")
  for(const options of [
    {variant: "insertion", left: 42.25, top: 100.5, width: 92.5},
    {variant: "package", active: true, muted: true, iconAction: "pin-snippet", left: 40, top: 100, width: 140},
    {variant: "toolbar", dropdownOnClick: true, left: 40, top: 100, width: 320},
    {variant: "default", compact: true, left: window.innerWidth - 40, top: 100, width: 32},
    {variant: "tab", left: 40, top: window.innerHeight - 48, width: 100},
  ]) {
    const button = new RibbonButton()
    Object.assign(button, {label: "Paragraph", action: "element:p", submenu: ["Heading 1", "Heading 2"], ...options})
    Object.assign(button.style, {position: "fixed", left: `${options.left}px`, top: `${options.top}px`, width: `${options.width}px`})
    document.body.append(button)
    try {
      await button.updateComplete
      const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
      const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(options.dropdownOnClick ? ".main-button" : ".submenu-trigger")!
      trigger.click()
      await button.updateComplete
      await layoutFrame()
      const menu = button.shadowRoot!.querySelector<HTMLElement>("ribbon-menu")!
      const box = row.getBoundingClientRect(), popup = menu.getBoundingClientRect()
      const above = row.dataset.connected === "above"
      assert(row.dataset.connected === (options.variant === "tab" ? "above" : "below"), `${options.variant}: wrong placement`)
      assert(menu.matches(":popover-open"), "menu left the browser's top layer")
      assert(Math.abs((above ? popup.bottom - box.top : box.bottom - popup.top) - 1) < .01, "trigger and menu do not share exactly one border pixel")
      assert(popup.width >= box.width && popup.left >= 8 && popup.right <= document.documentElement.clientWidth - 8, "menu does not contain its trigger within the viewport")
      const style = getComputedStyle(row), surface = getComputedStyle(menu.shadowRoot!.querySelector<HTMLElement>(".menu")!)
      assert(style.backgroundColor === surface.backgroundColor && style.backgroundColor === "rgb(255, 255, 255)", "open trigger does not match the menu's white background")
      assert(style.opacity === "1", "muted trigger makes the joined border translucent")
      assert(style.borderLeftColor === surface.borderLeftColor && style.boxShadow === "none", "trigger's border does not match its menu")
      assert(parseFloat(getComputedStyle(menu, "::before").width) === box.width - 2, "shared border mask does not match trigger interior")
      const joinLeft = parseFloat(menu.style.getPropertyValue("--ribbon-menu-join-left"))
      assert(Math.abs(joinLeft - (box.left - popup.left + 1)) < 1,
        `shared border mask is not aligned with the trigger: ${JSON.stringify({joinLeft, triggerLeft: box.left, popupLeft: popup.left, expected: box.left - popup.left + 1})}`)
      const corners = above ? [surface.borderBottomLeftRadius, surface.borderBottomRightRadius] : [surface.borderTopLeftRadius, surface.borderTopRightRadius]
      if(popup.left === box.left) assert(corners[0] === "0px", "joined left corner retains a rounded gap")
      if(popup.right === box.right) assert(corners[1] === "0px", "joined right corner retains a rounded gap")
      button.closeSubmenu()
      await button.updateComplete
      assert(!row.hasAttribute("data-connected") && menu.hidden && !menu.matches(":popover-open"), "closing the menu retains connected styling")
    }
    finally { button.remove() }
  }
})

await check("shape ribbon galleries scroll only when the viewport cannot fit their contents", async () => {
  const shapeButtons=graphicShapeSections.flatMap(section=>section.rows.flatMap((row,rowIndex)=>[
    ...row.map((option,column)=>({label:option.label,category:section.label,path:option.path,pathFill:option.pathFill,galleryRowStart:column===0})),
    ...(section.label==="Basic" && rowIndex===0?[{label:"Import graphic",category:section.label,galleryColumns:3 as const}]:[]),
  ]))
  for(const height of [1000,480]) {
    const frame=document.createElement("iframe")
    frame.style.cssText=`width:1600px;height:${height}px;border:0;max-width:none`
    frame.srcdoc=height===1000
      ? '<!doctype html><style>body{margin:16px;font:16px system-ui}</style><app-ribbon></app-ribbon><script type="module" src="/src/components/ribbon.ts"></script>'
      : '<!doctype html><style>body{margin:16px;font:16px system-ui}</style><ribbon-button></ribbon-button><script type="module" src="/src/components/ribbon-button.ts"></script>'
    document.body.append(frame)
    const view=frame.contentWindow as Window & typeof globalThis
    try {
      const customElement=height===1000?"app-ribbon":"ribbon-button"
      for(let attempt=0;!view.customElements.get(customElement) && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
      assert(view.customElements.get(customElement),"Shape gallery fixture did not initialize")
      const doc=frame.contentDocument!
      for(let attempt=0;!doc.querySelector(customElement) && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
      let graphic:RibbonButton
      if(height===1000) {
        const ribbon=doc.querySelector<import("../src/components/ribbon").AppRibbon>("app-ribbon")!
        ribbon.activeMenu="Start"
        await ribbon.updateComplete
        graphic=ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Graphic"]')!
      }
      else {
        graphic=doc.querySelector<RibbonButton>("ribbon-button")!
        graphic.label="Graphic"
        graphic.submenu=shapeButtons
        await graphic.updateComplete
      }
      await graphic.updateComplete
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())))
      graphic.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-toggle")!.click()
      await graphic.updateComplete
      const menu=graphic.shadowRoot!.querySelector<import("../src/components/ribbon-menu").RibbonMenu>("ribbon-menu")!
      await menu.updateComplete
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())))
      const surface=menu.shadowRoot!.querySelector<HTMLElement>(".menu")!,bounds=menu.getBoundingClientRect()
      assert(bounds.top>=7.9 && bounds.bottom<=height-7.9,`${height}: shape gallery leaves the viewport`)
      assert(surface.scrollWidth<=surface.clientWidth+1,`${height}: shape gallery scrolls horizontally`)
      if(height===1000) assert(surface.scrollHeight<=surface.clientHeight+1,"Shape gallery scrolls despite having enough vertical space")
      else {
        assert(surface.scrollHeight>surface.clientHeight+1,"Shape gallery does not scroll in a short viewport")
        const items=surface.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
        items[items.length-1].focus()
        const last=items[items.length-1].getBoundingClientRect(),visible=surface.getBoundingClientRect()
        assert(last.bottom<=visible.bottom && last.top>=visible.top,"Final shape is not reachable in the short gallery")
      }
      assert(menu.shadowRoot!.querySelectorAll('[role="separator"]').length===3,"Gallery section dividers changed")
    }
    finally {frame.remove()}
  }
})

await check("font dropdowns join their white controls at viewport edges", async () => {
  const {RibbonCombobox} = await import("../src/components/ribbon-combobox")
  const {RibbonDrawer} = await import("../src/components/ribbon-drawer")
  const {fontFamilyOptions, fontSizeOptions} = await import("../src/marks")
  for(const name of ["font-family", "font-size"]) for(const placement of ["below", "above", "right"]) {
    const combo = new RibbonCombobox()
    Object.assign(combo, {name, label: name, options: name === "font-family" ? fontFamilyOptions : fontSizeOptions})
    Object.assign(combo.style, {position: "fixed", width: name === "font-size" ? "56px" : "90px",
      left: `${placement === "right" ? window.innerWidth - 98 : 40.25}px`,
      top: `${placement === "above" ? window.innerHeight - 48 : 100.5}px`})
    document.body.append(combo)
    try {
      await combo.updateComplete
      const font = combo.shadowRoot!.querySelector("font-combobox")
      const field = font ?? combo.shadowRoot!.querySelector("font-size-combobox")!
      // The editing document's scrollbar gutters offset fixed-position origins.
      const desiredLeft = placement === "right" ? window.innerWidth - 98 : 40.25
      combo.style.left = `${parseFloat(combo.style.left) + desiredLeft - combo.getBoundingClientRect().left}px`
      await field.updateComplete
      if(font) {
        // Geometry checks use an empty cached catalog, without network requests.
        Object.assign(font, {loaded: true, fontAccess: {}})
      }
      const root = field.shadowRoot!
      const trigger = root.querySelector<HTMLInputElement>("input")!
      const control = root.querySelector<HTMLElement>(".control")!
      const closed = getComputedStyle(control)
      const topCorners = [closed.borderTopLeftRadius, closed.borderTopRightRadius]
      const placeholder = getComputedStyle(trigger, "::placeholder")
      assert(placeholder.fontSize === getComputedStyle(trigger).fontSize && placeholder.color === "rgb(107, 119, 135)",
        `${name}: font placeholder does not match the input size and muted color`)
      assert(trigger.value === "" && trigger.matches(":placeholder-shown")
        && trigger.placeholder === (font ? "Default font" : "Size"), `${name}: default is not shown as a placeholder`)
      trigger.click()
      await combo.updateComplete
      await field.updateComplete
      await layoutFrame()
      const menu = root.querySelector<HTMLElement>(".listbox")!
      if(font) {
        const headings = menu.querySelectorAll<HTMLElement>(".group-label")
        assert(Math.abs(headings[0].getBoundingClientRect().height - headings[1].getBoundingClientRect().height) < .1,
          "standard and custom font headings do not align")
      }
      assert([...menu.querySelectorAll(".option-group")].every(group => getComputedStyle(group).scrollbarWidth === "thin"),
        `${name}: font list scrollbars are not thin`)
      const box = control.getBoundingClientRect(), popup = menu.getBoundingClientRect()
      const above = placement === "above"
      assert(control.dataset.connected === (above ? "above" : "below"), `${name}: wrong font popup placement`)
      assert(Math.abs((above ? popup.bottom - box.top : box.bottom - popup.top) - 1) < .1,
        `${name}: font dropdown does not share a border with its control`)
      assert(popup.left >= 8 && popup.right <= window.innerWidth - 8,
        `${name}/${placement}: font dropdown overflows the viewport (${popup.left}–${popup.right}, width ${window.innerWidth})`)
      const surface = getComputedStyle(menu), style = getComputedStyle(control)
      assert(style.backgroundColor === "rgb(255, 255, 255)" && surface.backgroundColor === style.backgroundColor,
        `${name}: open font control does not match the white dropdown`)
      assert(style.borderLeftColor === surface.borderLeftColor && style.outlineStyle === "none",
        `${name}: open font control does not use the dropdown border`)
      assert(style.borderTopLeftRadius === topCorners[0] && style.borderTopRightRadius === topCorners[1],
        `${name}: opening changes the input's top corner radii`)
      const join = getComputedStyle(menu, "::before")
      assert((above ? surface.borderBottomWidth : surface.borderTopWidth) === "0px"
        && (above ? surface.paddingBottom : surface.paddingTop) === "1px",
        `${name}: a dividing border remains between the field and its dropdown`)
      assert((above ? join.bottom : join.top) === "0px" && join.left === "0px"
        && join.backgroundImage.includes("rgb(255, 255, 255)")
        && Math.abs(parseFloat(menu.style.getPropertyValue("--popup-join-width")) - box.width + 2) < .1,
        `${name}: the joining surface is clipped outside the popup or does not match its control`)
      if(font) {
        const column = menu.querySelector(".option-group")!.getBoundingClientRect()
        assert(Math.abs(column.width - box.width + 2) < .1, "the standard font column does not match the input's inner width")
        if(placement !== "right") assert(Math.abs(column.right - box.right + 1) < .1, "the standard font divider does not align with the input's right border")
        const times = menu.querySelector<HTMLElement>('[title="Times New Rom."] .option-code')!
        assert(times && times.scrollHeight <= times.clientHeight && times.scrollWidth <= times.clientWidth,
          "the shortened Times New Roman label overflows its column")
        for(const query of ["Georgia", "no font matches this", ""]) {
          trigger.value = query
          trigger.dispatchEvent(new InputEvent("input", {bubbles: true}))
          await field.updateComplete; await layoutFrame()
          const filtered = menu.getBoundingClientRect()
          assert(Math.abs(filtered.width - popup.width) < .1 && Math.abs(filtered.height - popup.height) < .1
            && Math.abs(menu.querySelector(".option-group")!.getBoundingClientRect().width - column.width) < .1,
            "searching resized the font menu or its standard-font column")
        }
        combo.close()
        await field.updateComplete
        trigger.value = "Georgia"
        trigger.dispatchEvent(new InputEvent("input", {bubbles: true}))
        await field.updateComplete; await layoutFrame()
        const typedOpen = root.querySelector<HTMLElement>(".listbox")!.getBoundingClientRect()
        assert(Math.abs(typedOpen.height - popup.height) < .1 && Math.abs(typedOpen.width - popup.width) < .1,
          "typing into a closed font picker skipped retaining its unfiltered size")
      }
      const scroller = name === "font-size" ? menu.querySelector<HTMLElement>(".option-group") : null
      if(scroller) {
        const scrollBox = scroller.getBoundingClientRect()
        assert(Math.abs(scrollBox.right - popup.right + 1) < .1 && Math.abs(scrollBox.top - popup.top - 1) < .1
          && Math.abs(scrollBox.bottom - popup.bottom + 1) < .1, "font size scrollbar is inset from the dropdown border")
        assert(Math.abs(popup.width - box.width) < .1, "font size dropdown does not match its input width")
        assert(scroller.scrollWidth === scroller.clientWidth, "narrow font size options overflow horizontally")
        assert([...scroller.querySelectorAll<HTMLElement>(".option-code")].every(label => label.scrollWidth <= label.clientWidth),
          "narrow font size options truncate their labels")
        assert(menu.querySelector('[role="option"]')?.getAttribute("title") === "Default", "font size reset option is not labeled Default")
        scroller.scrollTop = scroller.scrollHeight
        await layoutFrame()
        assert(scroller.scrollTop > 0 && menu.scrollTop === 0, "font sizes do not scroll independently of their joined border")
        const mask = getComputedStyle(menu, "::before")
        assert((above ? mask.bottom : mask.top) === "0px", "scrolling moves the font dropdown's shared border mask")
      }
      if(name === "font-size") {
        let value: string | undefined
        combo.addEventListener("ribbon-combobox-change", event => { value = (event as CustomEvent<{value: string}>).detail.value })
        trigger.value = "17.5pt"
        trigger.dispatchEvent(new InputEvent("input", {bubbles: true}))
        await field.updateComplete
        assert(root.querySelectorAll('[role="option"]').length === fontSizeOptions.length, "typing a font size filters out presets")
        trigger.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
        await field.updateComplete
        assert(value === "17.5px" && trigger.value === "17.5", "typed font size did not ignore its unit and use pixels")
      }
      combo.close()
      await combo.updateComplete
      await field.updateComplete
      assert(!control.hasAttribute("data-connected") && !root.querySelector(".listbox"), `${name}: closing retains connected styling`)
      trigger.focus()
      await field.updateComplete
      combo.close()
      await field.updateComplete
      const focus = getComputedStyle(control)
      assert(control.matches(":focus-within") && focus.outlineStyle === "solid" && parseFloat(focus.outlineWidth) > 0
        && parseFloat(focus.outlineOffset) + parseFloat(focus.outlineWidth) <= 0,
        `${name}: the focus ring extends outside the input and can be clipped by the ribbon`)
      trigger.click()
      await field.updateComplete; await layoutFrame()
      assert(root.querySelector(".listbox"), `${name}: font control did not reopen before disabling`)
      combo.disabled = true
      await combo.updateComplete
      await field.updateComplete
      const disabled = getComputedStyle(control)
      assert(trigger.disabled && root.querySelector<HTMLButtonElement>(".toggle")!.disabled,
        `${name}: unavailable font input or toggle remains enabled`)
      assert(disabled.opacity === "0.6" && disabled.color === "rgb(154, 164, 177)"
        && disabled.backgroundColor === "rgb(247, 247, 247)", `${name}: disabled appearance is missing`)
      assert(!field.hasAttribute("open") && !root.querySelector(".listbox"), `${name}: disabling retains the open dropdown`)
      // Disabled styling must win even while an open attribute is being removed.
      field.setAttribute("open", "")
      assert(getComputedStyle(control).backgroundColor === "rgb(247, 247, 247)", `${name}: an open attribute turns the disabled field white`)
      field.removeAttribute("open")
      trigger.click()
      await field.updateComplete
      assert(!root.querySelector(".listbox"), `${name}: disabled font control opens its dropdown`)
    }
    finally { combo.remove() }
  }
  const drawer = new RibbonDrawer(), combo = new RibbonCombobox()
  Object.assign(drawer, {layout: "marks"})
  Object.assign(drawer.style, {position: "fixed", left: "40px", top: "100px", height: "90px", width: "var(--ribbon-drawer-expanded-width)"})
  Object.assign(combo, {name: "font-family", label: "Font family", options: fontFamilyOptions, className: "font-family"})
  drawer.append(combo)
  document.body.append(drawer)
  try {
    await drawer.updateComplete; await combo.updateComplete
    const field = combo.shadowRoot!.querySelector("font-combobox")!
    Object.assign(field, {loaded: true, fontAccess: {}})
    await field.updateComplete
    const input = field.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.click()
    await field.updateComplete; await layoutFrame()
    const edge = drawer.shadowRoot!.querySelector(".drawer")!.getBoundingClientRect()
    for(const query of ["", "Georgia", "no matching fonts"]) {
      if(query) {
        input.value = query
        input.dispatchEvent(new InputEvent("input", {bubbles: true}))
        await field.updateComplete; await layoutFrame()
      }
      const menu = field.shadowRoot!.querySelector(".listbox")!.getBoundingClientRect()
      assert(Math.abs(menu.left - edge.left - (edge.right - menu.right)) < .1,
        `the font dropdown does not have equal spacing to the marks drawer's left and right edges (${menu.left - edge.left}, ${edge.right - menu.right}; drawer width ${edge.width}; menu width ${menu.width})`)
    }
  }
  finally { drawer.remove() }
})

await check("font searches split installed and web results without scrolling", async () => {
  const {FontCombobox} = await import("../src/components/font-combobox")
  const combo = new FontCombobox()
  Object.assign(combo.style, {position: "fixed", left: "80px", top: "100px", width: "90px"})
  Object.assign(combo, {loaded: true, fontAccess: {}, devicePermissionGranted: true,
    devices: Array.from({length: 20}, (_, i) => ({family: `Search Installed ${i}`, blob: () => { throw new Error("Unexpected font read") }})),
    fonts: Array.from({length: 20}, (_, i) => ({familyName: `Search Web ${i}`, category: "sans-serif", weights: [400], styles: ["normal"]})),
  })
  document.body.append(combo)
  try {
    await combo.updateComplete
    const root = combo.shadowRoot!, input = root.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.click()
    await combo.updateComplete; await layoutFrame()
    const popup = root.querySelector<HTMLElement>(".listbox")!, before = popup.getBoundingClientRect()
    assert(root.querySelectorAll('[aria-label="Custom fonts"] [role="option"]').length === 40, "unfiltered fonts are missing")
    const custom = root.querySelector<HTMLElement>('[aria-label="Custom fonts"]')!
    const sections = [...custom.querySelectorAll<HTMLElement>(".font-section")]
    const [installedHeading, webHeading] = sections.map(section => section.querySelector<HTMLElement>(".section-label")!)
    const groupHeading = custom.querySelector<HTMLElement>(".group-label")!
    const pinnedTop = custom.getBoundingClientRect().top + groupHeading.getBoundingClientRect().height
    const webStart = sections[1].getBoundingClientRect().top
    assert([installedHeading, webHeading].every(heading => getComputedStyle(heading).fontWeight === "700"), "font section headings are not bold")
    custom.scrollTop = 84
    await layoutFrame()
    assert(Math.abs(installedHeading.getBoundingClientRect().top - pinnedTop) < .1, "installed heading does not stay below the custom-font heading")
    custom.scrollTop = webStart - pinnedTop - webHeading.getBoundingClientRect().height / 2
    await layoutFrame()
    assert(installedHeading.getBoundingClientRect().top < pinnedTop
      && installedHeading.getBoundingClientRect().bottom <= webHeading.getBoundingClientRect().top,
      "the next font section does not push out the previous heading")
    custom.scrollTop = webStart - pinnedTop + 84
    await layoutFrame()
    assert(Math.abs(webHeading.getBoundingClientRect().top - pinnedTop) < .1, "web heading does not stick at its section's top")
    assert(Math.abs(groupHeading.getBoundingClientRect().top - custom.getBoundingClientRect().top) < .1, "section scrolling covers the custom-font heading")
    custom.scrollTop = 0
    for(const query of ["Search", "no matching fonts", "Search Installed", "Search"]) {
      input.value = query
      input.dispatchEvent(new InputEvent("input", {bubbles: true}))
      await combo.updateComplete; await layoutFrame(); await combo.updateComplete
      const panels = [...root.querySelectorAll<HTMLElement>(".search-section")]
      assert(panels.length === 2, "search results are not split into two sections")
      assert(Math.abs(panels[0].getBoundingClientRect().height - panels[1].getBoundingClientRect().height) < .1,
        "installed and web results do not each use half of the search area")
      assert(Math.abs(popup.getBoundingClientRect().height - before.height) < .1, "split search changed the popup height")
      for(const panel of panels) {
        const options = [...panel.querySelectorAll<HTMLElement>('[role="option"]')]
        const heading = panel.querySelector<HTMLElement>(".section-label")!
        const capacity = Math.floor((panel.clientHeight - heading.getBoundingClientRect().height) / 28)
        assert(options.length === (query === "no matching fonts" || query === "Search Installed" && panel === panels[1] ? 0 : capacity), "result count does not fill the available whole rows")
        assert(panel.scrollHeight === panel.clientHeight && getComputedStyle(panel).overflowY === "hidden", "search section still scrolls")
        assert(options.every(option => option.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom), "a partial search result is visible")
      }
      const visible = [...root.querySelectorAll<HTMLElement>('[role="option"]')]
      if(query === "Search") {
        for(let i = 0; i < visible.length; i++) input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
        await combo.updateComplete
        assert(root.querySelector("[data-active]") === visible[0], "keyboard navigation includes hidden results")
      }
    }
    input.value = ""
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await combo.updateComplete; await layoutFrame()
    assert(!root.querySelector(".search-results") && root.querySelectorAll('[aria-label="Custom fonts"] [role="option"]').length === 40,
      "clearing the query does not restore the complete scrollable list")
  }
  finally { combo.remove() }
})

await check("font list previews only load the active web font", async () => {
  const {FontCombobox} = await import("../src/components/font-combobox")
  const originalFetch = window.fetch
  let requests = 0
  window.fetch = async (input, options) => {
    if(String(input).startsWith("https://fonts.bunny.net/css?")) {
      requests++
      return new Response(`@font-face {font-family: Preview; font-style: normal; font-weight: 400; src: url("${new URL(localFontURL, location.href).href}") format("woff2");}`)
    }
    return originalFetch(input, options)
  }
  const field = new FontCombobox()
  Object.assign(field, {loaded: true, fontAccess: {}, fonts: [
    {familyName: "Web Preview One", category: "serif", weights: [400, 700], styles: ["normal", "italic"]},
    {familyName: "Web Preview Two", category: "serif", weights: [400], styles: ["normal"]},
  ], devices: [{family: "Device Preview", blob: () => { throw new Error("List preview must not read installed font bytes") }}]})
  document.body.append(field)
  try {
    await field.updateComplete
    const input = field.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.click()
    await layoutFrame()
    const root = field.shadowRoot!
    const options = root.querySelectorAll<HTMLButtonElement>('[aria-label="Custom fonts"] [role="option"]')
    const first = [...options].find(option => option.title === "Web Preview One")!
    const second = [...options].find(option => option.title === "Web Preview Two")!
    assert(requests === 0 && first.style.fontFamily === "" && second.style.fontFamily === "", "inactive web fonts load previews")
    assert(getComputedStyle(root.querySelector('[title="Georgia"]')!).fontFamily === "Georgia, serif", "standard font item does not use its font")
    assert(getComputedStyle(root.querySelector('[title="Device Preview"]')!).fontFamily.includes("Device Preview"), "installed font item does not use its font")
    first.dispatchEvent(new PointerEvent("pointerenter"))
    for(let count = 0; count < 120 && !first.style.fontFamily.includes("webwriter-font-preview-"); count++) await nextFrame()
    const family = first.style.fontFamily.split(",")[0]
    const loaded = await document.fonts.load(`12px ${family}`, "Web Preview One")
    assert(requests === 1 && loaded.length > 0 && loaded.every(face => face.status === "loaded"), "active web preview did not load its font")
    assert(second.style.fontFamily === "", "preview also styled an inactive web font")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
    for(let count = 0; count < 120 && !second.style.fontFamily.includes("webwriter-font-preview-"); count++) await nextFrame()
    assert(requests === 2 && first.style.fontFamily === "" && second.style.fontFamily.includes("webwriter-font-preview-"),
      `keyboard navigation did not move the font preview (${requests} requests, first ${first.style.fontFamily}, second ${second.style.fontFamily}, active ${root.querySelector('[data-active]')?.textContent})`)
    assert(loaded.every(face => !document.fonts.has(face)), "previous preview faces remain registered")
    const current = [...document.fonts].filter(face => face.family.includes("webwriter-font-preview-"))
    field.close()
    await field.updateComplete
    assert(current.length > 0 && current.every(face => !document.fonts.has(face)), "closing retains preview fonts")
    assert(!document.head.querySelector('link[href^="https://fonts.bunny.net/css"]'), "list previews added a document stylesheet")
  }
  finally { field.remove(); window.fetch = originalFetch }
})

await check("local fonts embed selected bytes and load under the editor CSP", async () => {
  const {FontCombobox} = await import("../src/components/font-combobox")
  const {embedFontFiles} = await import("../src/local-fonts")
  const {readFontFiles, saveFontFile} = await import("../src/local-font-storage")
  const {editorFrameHTML} = await import("../src/frame-document")
  const bytes = await (await fetch(localFontURL)).blob()
  const font = await embedFontFiles([bytes])
  const id = crypto.randomUUID()
  await saveFontFile({id, name: font.family, file: new File([bytes], "Temml.woff2", {type: "font/woff2"})})
  const stored = (await readFontFiles()).find(record => record.id === id)
  assert(stored?.file && stored.file.size === bytes.size, "font file input fallback did not survive IndexedDB structured cloning")
  if(navigator.storage?.getDirectory) {
    const directory = await navigator.storage.getDirectory()
    const handle = await directory.getFileHandle(`${id}.woff2`, {create: true})
    const writer = await handle.createWritable()
    await writer.write(bytes); await writer.close()
    await saveFontFile({id: `${id}-handle`, name: font.family, handle})
    const restored = (await readFontFiles()).find(record => record.id === `${id}-handle`)!.handle!
    assert((await restored.getFile()).size === bytes.size, "font handle did not survive IndexedDB structured cloning")
    await directory.removeEntry(handle.name)
  }
  let reads = 0, queries = 0
  const field = new FontCombobox(), frame = document.createElement("iframe")
  Object.assign(field, {loaded: true, fontAccess: {
    navigator: {permissions: {query: async () => ({state: "prompt"})}},
    queryLocalFonts: async () => {
      queries++
      return [{family: font.family, fullName: font.family, style: "Regular", postscriptName: font.family, blob: async () => { reads++; return bytes }}]
    },
  }})
  Object.assign(field.style, {position: "fixed", left: "40px", top: "100px", width: "90px"})
  document.body.append(field)
  try {
    await field.updateComplete
    assert(queries === 0, "installed fonts were queried before opening the picker")
    field.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!.click()
    await layoutFrame()
    const custom = field.shadowRoot!.querySelector('[aria-label="Custom fonts"]')!
    const load = custom.querySelector<HTMLButtonElement>(".browse-fonts")!
    assert(queries === 0 && load.textContent?.includes("Load installed fonts") && getComputedStyle(load).fontStyle === "italic"
      && load.querySelector("svg"), "installed fonts did not wait for the explicit load action")
    load.click()
    await layoutFrame()
    assert(queries === 1 && reads === 0, "enumerating installed fonts read font bytes")
    assert(custom.querySelector('[aria-label="Import font file"]'), "custom fonts heading has no import button")
    assert(custom.querySelector('[role="option"]')?.textContent?.includes(font.family), "installed font is not the first custom option")
    let selected: {value: string, fontStylesheet: string} | undefined
    field.addEventListener("font-change", event => { selected = (event as CustomEvent).detail })
    custom.querySelector<HTMLButtonElement>('[role="option"]')!.click()
    for(let count = 0; count < 120 && !selected; count++) await nextFrame()
    assert(selected?.fontStylesheet.startsWith("data:text/css;base64,") && reads === 1, "installed font did not embed its selected bytes")
    const source = `<!doctype html><html><head><link rel="stylesheet" href="${selected!.fontStylesheet}"></head><body><p style='font-family: ${selected!.value}'>Font sample x</p></body></html>`
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    frame.srcdoc = editorFrameHTML(source, {bridgeNonce: "font-csp-test", revision: 0, language: "en", packages: [],
      hostOrigin: location.origin, entryURL: new URL("../src/editor-entry.ts", location.href).href, executeScripts: false})
    document.body.append(frame)
    await loaded
    const doc = frame.contentDocument!
    const faces = await doc.fonts.load(`16px ${JSON.stringify(font.family)}`, "x")
    assert(faces.length > 0 && faces.every(face => face.status === "loaded"), "embedded font was blocked by the editor CSP or failed to decode")
    assert(getComputedStyle(doc.querySelector("p")!).fontFamily.includes(font.family), "embedded font family was not applied")
    assert(!field.shadowRoot!.querySelector('[role="option"]'), "closing retains local font options in the DOM")
  }
  finally {
    field.remove(); frame.remove()
  }
})

await check("ribbon shapes retain their aspect ratio under the document theme", async () => {
  const theme = document.createElement("style")
  theme.textContent = defaultDocumentTheme.source
  document.head.append(theme)
  try {
    for(const shape of ["ellipse", "rounded-rectangle", "line"] as const) {
      $.selectRange(document.body, document.body.childNodes.length)
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape})
      const graphic = $.selectedElement as SVGSVGElement
      try {
        await layoutFrame()
        const rect = graphic.getBoundingClientRect()
        const width = Number(graphic.getAttribute("width")), height = Number(graphic.getAttribute("height"))
        if(shape === "line") {
          // The editor gives flat shapes a 32px minimum editing viewport. The
          // line keeps its authored viewBox dimensions and fits uniformly in
          // that taller viewport instead of being stretched to fill it.
          const matrix = graphic.getScreenCTM()!
          const scaleX = Math.hypot(matrix.a, matrix.b), scaleY = Math.hypot(matrix.c, matrix.d)
          assert(rect.width >= width - 1 && rect.height >= 32
            && Math.abs(scaleX - scaleY) < .01
            && graphic.getAttribute("preserveAspectRatio") === "xMidYMid meet",
          `line did not preserve its aspect ratio in the minimum editing viewport (${width} × ${height} → ${rect.width} × ${rect.height})`)
        }
        else assert(Math.abs(rect.width - width) < 1 && Math.abs(rect.height - height) < 1,
          `${shape} stretched from ${width} × ${height} to ${rect.width} × ${rect.height}`)
      }
      finally { graphic.remove() }
    }
  }
  finally {
    theme.remove()
    $.selectDocumentStart()
    editor.features.selection.processSelection()
  }
})

await check("standalone SVG affordances refit rotated elements and resize beyond their original size", async () => {
  $.selectRange(fixture, fixture.childNodes.length)
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "ellipse"})
  const graphic = fixture.querySelector<SVGSVGElement>("svg")!
  assert(graphic, "standalone SVG was not inserted")
  Object.assign(graphic.style, {left: "200px", top: "200px", rotate: "30deg"})
  const authoredPosition = {position: graphic.style.position, left: graphic.style.left, top: graphic.style.top, rotate: graphic.style.rotate}
  editor.features.selection.selectElement(graphic)
  await layoutFrame()
  assert($.selectedElement === graphic && !editor.features.selection.isCaptureSelection, "shape did not retain ordinary element selection")
  assert(!editor.appendix.querySelector('[part~="atomic-selection-overlay"]'), "standalone selection has a blue fill")
  const originalWidth = parseFloat(getComputedStyle(graphic).width)
  const original = graphic.getScreenCTM()!
  const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="radius-x"]')!
  const box = handle.getBoundingClientRect()
  const start = {x: box.left + box.width / 2, y: box.top + box.height / 2}
  const end = {x: start.x + original.a * 180, y: start.y + original.b * 180}
  handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 91, clientX: start.x, clientY: start.y}))
  document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 91, clientX: end.x, clientY: end.y}))
  await layoutFrame()
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 91}))
  await layoutFrame()
  const current = graphic.getScreenCTM()!
  for(const key of ["a", "b", "c", "d"] as const) {
    assert(Math.abs(current[key] - original[key]) < .1, `refitting changed the shape's ${key} scale/rotation transform`)
  }
  assert(getComputedStyle(graphic).position === "static"
    && graphic.style.position === authoredPosition.position && graphic.style.left === authoredPosition.left
    && graphic.style.top === authoredPosition.top && graphic.style.rotate === authoredPosition.rotate,
  "refitting changed the standalone graphic's normal-flow positioning styles")
  assert(parseFloat(getComputedStyle(graphic).width) > originalWidth + 300, "radius edit did not grow the element")
  const ellipse = graphic.querySelector("ellipse")!
  assert(Number(ellipse.getAttribute("rx")) > 290, "radius remained constrained to the original viewport")
  const resizer = editor.features.transformation.overlay.querySelector<HTMLElement>('#◆transform-overlay-scale-down-right')!
  const resizeBox = resizer.getBoundingClientRect()
  const x = resizeBox.left + resizeBox.width / 2, y = resizeBox.top + resizeBox.height / 2
  const beforeResize = parseFloat(getComputedStyle(graphic).width)
  // Synthetic pointers cannot acquire native capture; exercise the same
  // transformation methods with a mouse gesture and real rendered geometry.
  resizer.addEventListener("mousedown", event => editor.features.transformation.handleScaleStart(event), {once: true})
  resizer.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: x, clientY: y}))
  const selectionMutations: MutationRecord[] = []
  const selectionObserver = new MutationObserver(records => selectionMutations.push(...records))
  selectionObserver.observe(graphic, {attributes: true, attributeFilter: ["class"], attributeOldValue: true})
  try {
    for(let step = 1; step <= 3; step++) {
      editor.features.transformation.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, clientX: x + step * 60, clientY: y + step * 60}))
      await layoutFrame()
      assert($.selectedElement === graphic, "resizing changed the selected element")
    }
    selectionMutations.push(...selectionObserver.takeRecords())
    assert(selectionMutations.every(record => record.oldValue?.split(/\s+/).includes("◆element-selected")), "resizing temporarily removed the selection marker")
  }
  finally { selectionObserver.disconnect() }
  editor.features.transformation.handleScaleEnd()
  await layoutFrame()
  assert(parseFloat(getComputedStyle(graphic).width) > beforeResize + 100, "standard resizing could not enlarge the shape")
  assert($.selectedElement === graphic, "resizing lost the element selection")
  graphic.remove()
  $.selectDocumentStart()
  editor.features.selection.processSelection()
})

await check("bundled layouts render under the strict editor CSP without widgets", async () => {
  const {editorFrameHTML} = await import("../src/frame-document")
  const {boardStyles, canvasStyles, slidesStyles} = await import("../src/document-layout")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:930px;height:470px"
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin")
  document.body.append(frame)
  const options = {bridgeNonce: crypto.randomUUID(), hostOrigin: location.origin, revision: 0, language: "en", packages: [],
    entryURL: new URL("./native-browser-frame.ts?proofreading-disabled", import.meta.url).href, executeScripts: true}
  const load = async (html: string) => {
    frame.srcdoc = editorFrameHTML(html, options)
    await new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, authoredScriptRan?: boolean}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 160; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `strict editor did not initialize: ${view.editorError}`)
    await layoutFrame()
    return {view, doc: frame.contentDocument!, editor: view.editor!}
  }
  try {
    let current = await load('<!doctype html><html><head><style>body {border-top:37px solid red}</style><script>window.authoredScriptRan = true</script></head><body><h1>Heading</h1><p>Card content</p></body></html>')
    for(const mode of ["board", "canvas", "slides"] as const) {
      assert(current.editor.setDocumentLayout(mode, "document"), `${mode}: conversion failed`)
      const verify = () => {
        const {view, doc} = current
        assert(!view.authoredScriptRan, `${mode}: authored script executed`)
        assert(view.getComputedStyle(doc.body).borderTopWidth === "0px", `${mode}: authored stylesheet was permitted`)
        if(mode === "board") {
          const column = doc.querySelector<HTMLElement>("section.ww-board-column")!, card = column.querySelector("article.ww-board-card")!
          assert(view.getComputedStyle(doc.body).display === "flex", "board did not use its horizontal layout")
          assert(view.getComputedStyle(column).display === "flex" && Math.abs(column.getBoundingClientRect().width - 450) < 1, "board column size or layout is wrong")
          assert(view.getComputedStyle(card).backgroundColor === "rgb(255, 255, 255)", "board card background is missing")
          const add = doc.body.shadowRoot!.querySelector<HTMLElement>('[part~=board-add-column]')!.getBoundingClientRect()
          assert(add.left >= column.getBoundingClientRect().right && Math.abs(add.width - column.getBoundingClientRect().width) < 1,
            "add-column control overlaps the column or has the wrong width")
        }
        else if(mode === "canvas") {
          assert(view.getComputedStyle(doc.body).position === "relative", "canvas has no positioning context")
          assert(view.getComputedStyle(doc.querySelector("h1")!).position === "absolute", "canvas content is not positioned")
          const background = doc.body.shadowRoot!.querySelector<HTMLElement>('[part=canvas-background]')!
          assert(view.getComputedStyle(background).backgroundImage.includes("radial-gradient"), "canvas background is missing")
        }
        else {
          assert(view.getComputedStyle(doc.body).display === "grid", "slides did not use their viewport layout")
          const slide = doc.querySelector("section.ww-slide")!
          assert(view.getComputedStyle(slide).width === "1280px", "slide size is wrong")
          assert(view.getComputedStyle(doc.querySelector("h1")!).position === "absolute", "slide content is not positioned")
          current.editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
          assert(Math.abs(slide.getBoundingClientRect().width - 1280) < 1, "slide layout overrides local zoom")
          current.editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "fit-content"})
        }
      }
      await layoutFrame()
      verify()
      const saved = current.editor.toHTML(false, false)
      assert(saved.includes({board: boardStyles, canvas: canvasStyles, slides: slidesStyles}[mode]), `${mode}: portable layout styles were lost`)
      current.editor.destroy()
      current = await load(saved)
      const readerId = mode === "board" ? "webwriter-layout-print" : mode === "canvas" ? "webwriter-canvas-viewer" : null
      if(readerId) assert(!current.doc.getElementById(readerId), `${mode}: saved reader script entered the editing frame`)
      verify()
      assert(current.editor.setDocumentLayout("document", mode), `${mode}: return to document failed`)
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("local HTML websites load as isolated blob and saved data frames", async () => {
  const {editorFrameHTML} = await import("../src/frame-document")
  const frame = document.createElement("iframe")
  const nonce = "local-website-csp-test"
  const token = crypto.randomUUID()
  const options = {bridgeNonce: nonce, revision: 0, language: "en", packages: [], hostOrigin: location.origin,
    entryURL: new URL("./native-browser-frame.ts", location.href).href, executeScripts: true}
  const reports: {source: MessageEventSource | null, isolated: boolean, text: string}[] = []
  const onMessage = (event: MessageEvent) => {
    if(event.data?.token === token) reports.push({source: event.source, ...event.data})
  }
  window.addEventListener("message", onMessage)
  const load = async (html: string) => {
    frame.contentWindow?.editor?.destroy()
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    frame.srcdoc = editorFrameHTML(html, options)
    if(!frame.isConnected) document.body.append(frame)
    await loaded
    for(let count = 0; count < 200; count++) {
      const editor = frame.contentWindow?.editor
      if(editor && frame.contentDocument?.querySelector('meta[name="webwriter-editor-bridge"]')) return editor
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error("website editor did not initialize")
  }
  const waitForWebsite = async (count: number) => {
    for(let attempt = 0; attempt < 200 && reports.length < count; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const report = reports[count - 1]
    assert(report?.source === frame.contentDocument?.querySelector("iframe")?.contentWindow, "local HTML did not load under the frame CSP")
    assert(report.isolated && report.text.includes("Local lesson"), "local HTML lost its content or can access the editor")
  }
  try {
    const editor = await load("<body><p>Before</p></body>")
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "iframe"})
    // Sign only this diagnostic script so it can report from the opaque child
    // under the editing frame's inherited CSP without loosening script-src.
    const html = `<!doctype html><body><p style="color:rgb(24,100,48)">Local lesson</p><script nonce="${nonce}">let isolated = false; try { parent.document.body } catch { isolated = true }; top.postMessage({token:${JSON.stringify(token)}, isolated, text:document.body.innerText}, "*")</script></body>`
    const view = frame.contentWindow as Window & typeof globalThis
    assert(editor.features.media.actions.setMediaFile({type: "setMediaFile", file: new view.File([html], "lesson.html", {type: "text/html"})}), "local file upload failed")
    assert(frame.contentDocument?.querySelector("iframe")?.getAttribute("src")?.startsWith("blob:"), "upload did not use a blob URL")
    await waitForWebsite(1)
    const saved = await editor.serializeHTML()
    assert(new DOMParser().parseFromString(saved, "text/html").querySelector("iframe")?.getAttribute("src")?.startsWith("data:text/html;"), "save did not embed the local file")
    await load(saved)
    await waitForWebsite(2)
    // Also exercise the host-to-editor File transfer across the real origins.
    const appFrame = document.createElement("iframe")
    appFrame.src = "/editor/"
    document.body.append(appFrame)
    try {
      let app: DomEditor | null = null
      for(let count = 0; count < 200; count++) {
        app = appFrame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
        if((app as any)?.editorWindow) break
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      assert(app && (app as any).editorWindow, "app editor did not initialize")
      const host = app as any
      await host.waitForEditorWindow()
      await app!.execute({type: "insertMedia", media: "iframe"})
      const file = new File([html.replace(nonce, host.bridgeNonce)], "lesson.html", {type: "text/html"})
      assert(await app!.execute({type: "setMediaFile", file}), "host file upload failed")
      for(let count = 0; count < 200 && reports.length < 3; count++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(reports[2]?.isolated && reports[2]?.text.includes("Local lesson"), "host-uploaded HTML did not load in its isolated frame")
    }
    finally { appFrame.remove() }
  }
  finally {
    window.removeEventListener("message", onMessage)
    frame.contentWindow?.editor?.destroy()
    frame.remove()
  }
})

await check("uploaded videos survive installing and removing packages", async () => {
  const frame = document.createElement("iframe")
  frame.src = "/editor/"
  document.body.append(frame)
  const video = document.createElement("video")
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "app editor did not initialize")
    const host = app as any
    await host.waitForEditorWindow()
    const file = await (await fetch("/src/assets/layouts/slides.mp4")).blob()
    await app!.execute({type: "insertMedia", media: "video"})
    assert(await app!.execute({type: "setMediaFile", file}), "video upload failed")
    const readSource = async () => {
      const result = await app!.execute({type: "readAIDocument"}) as {html: string}
      return new DOMParser().parseFromString(result.html, "text/html").querySelector("video")!.getAttribute("src")!
    }
    const original = await readSource()
    assert(original.startsWith("blob:"), "upload was not stored as an iframe-owned object URL")
    const packages = [...host.installedPackages]
    const pkg = {name: "@test/media-reload", version: "1.0.0", label: "Media reload", description: "",
      authors: [], keywords: [], links: {}, scripts: [], styles: [], members: []}
    for(const next of [[...packages, pkg], packages]) {
      const previousRevision = host.frameRevision
      await host.reloadEditor(next)
      assert(host.frameRevision === previousRevision + 1, "package change did not reload the editor iframe")
      const source = await readSource()
      assert(source.startsWith("data:video/mp4;base64,"), "reloaded video retained an outgoing realm's object URL")
      const saved = await (await fetch(source)).blob()
      assert(saved.size === file.size && saved.type === file.type, "package reload lost video bytes or MIME type")
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("reloaded video metadata timed out")), 4000)
        video.onloadedmetadata = () => {clearTimeout(timer); resolve()}
        video.onerror = () => {clearTimeout(timer); reject(new Error("reloaded video could not be decoded"))}
        video.src = source
        video.load()
      })
      assert(video.videoWidth > 0 && video.videoHeight > 0 && video.duration > 0, "reloaded video is not playable")
    }
  }
  finally {video.removeAttribute("src"); video.load(); frame.remove()}
})

await check("canvas and slide element selections keep Delete borderless", async () => {
  for(const mode of ["canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:700px"
    frame.srcdoc = '<!doctype html><body><picture id="selected-image"><img></picture><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, `${mode}: editor did not initialize: ${view.editorError}`)
      const editor = view.editor!, doc = frame.contentDocument!, target = doc.querySelector<HTMLElement>("#selected-image")!
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: layout conversion failed`)
      const range = doc.createRange()
      range.selectNode(target)
      doc.getSelection()!.removeAllRanges()
      doc.getSelection()!.addRange(range)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      await layoutFrame()
      assert(target.classList.contains("◆element-selected"), `${mode}: image is not element-selected`)
      const deleter = editor.features.transformation.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!
      const style = view.getComputedStyle(deleter)
      assert(!deleter.hidden && style.display !== "none", `${mode}: Delete is hidden`)
      for(const side of ["Top", "Right", "Bottom", "Left"] as const) {
        assert(style[`border${side}Width`] === "0px", `${mode}: element selection paints a border around Delete`)
      }
    }
    finally {frame.contentWindow?.editor?.destroy(); frame.remove()}
  }
})

await check("canvas and slide captions remain available through toolbox commands", async () => {
  for(const mode of ["canvas", "slides"] as const) for(const tag of ["picture", "p"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "position:fixed;left:0;top:0;width:900px;height:700px"
    frame.srcdoc = `<!doctype html><body><${tag} id="caption-item">${tag === "picture" ? "<img>" : "Text"}</${tag}><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>`
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, `${mode}: editor did not initialize: ${view.editorError}`)
      const editor = view.editor!, doc = frame.contentDocument!, target = doc.querySelector<HTMLElement>("#caption-item")!
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: layout conversion failed`)
      Object.assign(target.style, {position: "absolute", left: "200px", top: "200px", width: "240px", height: "100px", margin: "0"})
      editor.features.selection.selectElement(target)
      await layoutFrame()
      const overlay = editor.features.transformation.overlay
      const control = overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-caption")!
      assert(control.hidden && view.getComputedStyle(control).display === "none", `${mode}: caption affordance is still visible`)
      control.click()
      assert(!target.parentElement!.querySelector("figcaption"), `${mode}: hidden caption control still adds captions`)
      // Keep the new editable caption in view so focus does not scroll the
      // viewport while comparing the content's rendered placement.
      const rect = target.getBoundingClientRect(), scale = rect.height / 100
      target.style.top = `${parseFloat(target.style.top) + (120 - rect.top) / scale}px`
      await layoutFrame()
      const before = target.getBoundingClientRect()
      assert(editor.features.manipulation.actions.setCaption({type: "setCaption", position: "below", alignment: "left"}), `${mode}: toolbox caption command failed`)
      await layoutFrame()
      const figure = target.parentElement!, caption = figure.querySelector<HTMLElement>(":scope > figcaption")!
      assert(figure.localName === "figure" && caption && figure.lastElementChild === caption, `${mode}: caption was not added to the layout item`)
      const after = target.getBoundingClientRect()
      assert((["left", "top", "width", "height"] as const).every(key => Math.abs(after[key] - before[key]) < 1), `${mode}: adding a caption moved or resized the image: ${JSON.stringify({before, after})}`)
      assert(editor.features.transformation.target === figure && control.hidden, `${mode}: captioning lost the selected layout item`)
      assert(doc.execCommand("insertText", false, "Image caption") && caption.textContent?.includes("Image caption"), `${mode}: caption is not natively editable`)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      await layoutFrame()
      assert(overlay.getAttribute("part")!.includes("transform-overlay-content-selected"), `${mode}: caption typing did not use grey content selection`)
      for(const action of overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-button, [part~=transform-overlay-crop]")) {
        assert(view.getComputedStyle(action).visibility === "hidden", `${mode}: grey content selection exposes ${action.id || action.getAttribute("part")}`)
      }
      const resize = overlay.querySelector<HTMLElement>(".◆transform-overlay-scale:not([hidden])")!
      assert(resize && view.getComputedStyle(resize).visibility === "visible", `${mode}: grey content selection hid the resize handles`)
      for(const captured of [false, true]) {
        if(captured) editor.features.selection.captureElement(figure)
        else editor.features.selection.selectElement(figure)
        await layoutFrame()
        assert(control.hidden && view.getComputedStyle(control).display === "none", `${mode}: selected element restored caption affordance (capture: ${captured})`)
        const deleter = overlay.querySelector<HTMLElement>("#◆transform-overlay-delete")!
        assert(view.getComputedStyle(deleter).visibility === "visible", `${mode}: selected element did not restore other affordances`)
      }
      assert(!editor.toHTML(true).includes("transform-overlay"), `${mode}: caption control leaked into authored HTML`)
    }
    finally {frame.contentWindow?.editor?.destroy(); frame.remove()}
  }
})

await check("canvas and slide copyright controls share freeform placement", async () => {
  for(const mode of ["canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "position:fixed;left:0;top:0;width:900px;height:700px"
    frame.srcdoc = '<!doctype html><body><picture id="copyright-item"><img></picture><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, `${mode}: editor did not initialize: ${view.editorError}`)
      const editor = view.editor!, doc = frame.contentDocument!, target = doc.querySelector<HTMLElement>("#copyright-item")!
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: layout conversion failed`)
      Object.assign(target.style, {position: "absolute", left: "200px", top: "200px", width: "240px", height: "100px", margin: "0"})
      editor.features.selection.selectElement(target)
      doc.dispatchEvent(new Event("selectionchange"))
      await layoutFrame(); await layoutFrame()
      const overlay = editor.features.transformation.overlay
      const control = overlay.querySelector<HTMLButtonElement>('[part~="transform-overlay-attribution-freeform"]')!
      assert(control && !control.hidden, `${mode}: copyright is missing from the shared overlay`)
      const rotator = overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!
      for(const top of [120, 2, 120]) {
        const rect = target.getBoundingClientRect()
        const scale = rect.height / 100
        target.style.top = `${parseFloat(target.style.top) + (top - rect.top) / scale}px`
        await layoutFrame()
        editor.features.transformation.updateInfo()
        const style = view.getComputedStyle(control)
        const box = control.getBoundingClientRect(), item = target.getBoundingClientRect()
        assert(style.width === "16px" && style.height === "16px", `${mode}: copyright does not share freeform sizing`)
        assert(Math.abs((box.left + box.right) / 2 - (item.left - 3 * scale)) < 1, `${mode}: copyright control is not at the top-left corner`)
        assert(style.borderTopWidth === "0px" && style.backgroundColor === "rgba(0, 0, 0, 0)", `${mode}: copyright retains its circular background or border`)
        assert(top === 2 ? box.top > item.top && box.top >= 0 : box.bottom < item.top, `${mode}: copyright did not flip inward at the viewport top`)
        const stem = view.getComputedStyle(control, "::after")
        assert(stem.content !== "none" && stem.width === "2px" && parseFloat(stem.height) > 0, `${mode}: copyright has no connector`)
        assert(stem.backgroundColor === view.getComputedStyle(rotator, "::after").backgroundColor, `${mode}: copyright connector has a different color`)
        assert(view.getComputedStyle(control.querySelector("svg")!).display === "none", `${mode}: duplicate copyright icon remains`)
      }
      control.click()
      const popup = editor.appendix.querySelector<HTMLElement>('.◆attribution-ui .popup')!
      assert(!popup.hidden, `${mode}: copyright does not open its dialog`)
      assert(!editor.toHTML(true).includes("transform-overlay"), `${mode}: copyright control leaked into authored HTML`)
      editor.features.attribution.disable()
      assert(!control.isConnected, `${mode}: disabling attribution left its control in the overlay`)
    }
    finally {frame.contentWindow?.editor?.destroy(); frame.remove()}
  }
})

await check("canvas and slide delete affordances follow rotation placement", async () => {
  for(const mode of ["canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "position:fixed;left:0;top:0;width:900px;height:700px"
    frame.srcdoc = '<!doctype html><body><p id="delete-item">Selected text</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, `${mode}: editor did not initialize: ${view.editorError}`)
      const editor = view.editor!, doc = frame.contentDocument!, target = doc.querySelector<HTMLElement>("#delete-item")!
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: layout conversion failed`)
      if(mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
      else editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
      target.style.cssText = "position:absolute;left:200px;top:200px;width:240px;height:100px;margin:0"
      doc.getSelection()!.setPosition(target.firstChild!, 2)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      const overlay = editor.features.transformation.overlay
      const deleter = overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!
      const rotator = overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!
      const corner = overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-up-right")!
      assert(view.getComputedStyle(deleter).visibility === "hidden", `${mode}: Delete remains actionable while editing text`)
      editor.features.selection.selectElement(target)
      for(const zoom of [false, true]) {
        if(zoom && mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
        else if(zoom) editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "zoom-in"})
        for(const width of [80, 240]) for(const top of [120, 2]) {
          target.style.width = `${width}px`
          await layoutFrame()
          const box = target.getBoundingClientRect(), scale = box.height / 100
          target.style.left = `${parseFloat(target.style.left) + (120 - box.left) / scale}px`
          target.style.top = `${parseFloat(target.style.top) + (top - box.top) / scale}px`
          await layoutFrame()
          editor.features.transformation.updateInfo()
          const button = deleter.getBoundingClientRect(), resize = corner.getBoundingClientRect()
          const style = view.getComputedStyle(deleter), rotateStyle = view.getComputedStyle(rotator)
          assert(!deleter.hidden && style.display !== "none", `${mode}: Delete is hidden`)
          assert(style.top === rotateStyle.top && style.width === rotateStyle.width && style.height === rotateStyle.height,
            `${mode}: Delete does not share rotation sizing and responsive placement`)
          assert(style.borderTopWidth === "0px" && style.backgroundColor === "rgba(0, 0, 0, 0)", `${mode}: Delete retains the document control's circular background`)
          const stem = view.getComputedStyle(deleter, "::after"), pixelScale = button.height / parseFloat(style.height)
          const ends = [parseFloat(stem.top), parseFloat(stem.top) + parseFloat(stem.height)].map(y => button.top + y * pixelScale)
          assert(Math.abs(button.left + button.width / 2 - resize.left - resize.width / 2) < 1
            && ends.some(y => y >= resize.top - 1 && y <= resize.bottom + 1), `${mode}: Delete stem misses the top-right resize handle`)
          assert(button.top >= 0 && (top === 2 ? button.top > resize.bottom : button.bottom < resize.top), `${mode}: Delete did not flip inside the viewport with rotation`)
          for(const pseudo of ["::before", "::after"]) assert(view.getComputedStyle(deleter, pseudo).backgroundColor === view.getComputedStyle(rotator, pseudo).backgroundColor,
            `${mode}: Delete icon or stem does not match rotation color`)
          const hit = editor.appendix.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2)
          assert(hit === deleter, `${mode}: Delete cannot receive pointer input (width=${width}, top=${top}, zoom=${zoom}, hit=${hit?.localName}, rect=${JSON.stringify(button)})`)
        }
      }
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      const initial = editor.toHTML(true)
      deleter.click()
      assert(!target.isConnected && editor.features.transformation.target === null, `${mode}: Delete did not remove the current item`)
      editor.doc.syncFromDOM()
      assert(!editor.toHTML(true).includes("transform-overlay") && !editor.doc.body.toString().includes("◆"), `${mode}: affordances leaked into authored content`)
      editor.doc.undo()
      await layoutFrame()
      assert(editor.toHTML(true) === initial, `${mode}: Delete could not be undone`)
    }
    finally {frame.contentWindow?.editor?.destroy(); frame.remove()}
  }
})

await check("New discards the previous canvas iframe and its document state", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1280px;height:900px"
  frame.src = "/editor/"
  fixture.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "editor did not initialize")
    const host = app as any
    await host.waitForEditorWindow()
    frame.contentWindow!.confirm = () => true
    await host.reloadDocument('<!doctype html><html lang="fr" data-old="yes"><head><title>Old canvas</title><style data-old>body {color:red}</style></head><body class="ww-canvas"><div><div><old-widget answer="42"><!--old--><p>Old canvas content</p></old-widget></div></div></body></html>')
    const originalSource = await app!.execute({type: "serializeDocument"})
    await host.reloadEditor([])
    assert(host.frameState, "package reload did not retain the previous document state")
    assert(await app!.execute({type: "serializeDocument"}) === originalSource, "package reload changed authored content")
    host.fileDirty = true

    for(let iteration = 0; iteration < 2; iteration++) {
      const previousFrame = app!.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
      const previousWindow = previousFrame.contentWindow!
      const previousOrigin = new URL(previousFrame.src).origin
      await host.newDocument("document")
      await app!.updateComplete
      const freshFrame = app!.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
      assert(freshFrame !== previousFrame && !previousFrame.isConnected, "New reused the previous iframe")
      assert(freshFrame.contentWindow !== previousWindow, "New retained the previous window identity")
      host.handleEditorMessage(new MessageEvent("message", {
        source: previousWindow, origin: previousOrigin,
        data: {type: "editor-frame-snapshot", bridgeNonce: host.bridgeNonce, treeChanged: true,
          html: '<html><body class="ww-canvas"><div><div>Old delayed content</div></div></body></html>'},
      }))
      await layoutFrame()
      const source = await app!.execute({type: "serializeDocument"}) as string
      const doc = new DOMParser().parseFromString(source, "text/html")
      assert(!doc.querySelector("[data-old], old-widget, div") && !source.includes("Old canvas"), "previous authored content survived New")
      assert(doc.body.className === "" && doc.body.textContent === "", "New retained the canvas layout or content")
      assert(!host.frameState && !host.fileDirty, "New retained previous editor state or became dirty")
      assert(host.documentLayout.mode === "document" && host.documentLayout.canConvert, "New cannot select a layout")
      assert(app!.shadowRoot!.querySelector(".document-layouts-panel:not([inert])"), "New hid the layout controls")
      await app!.execute({type: "undo"})
      assert(!(await app!.execute({type: "serializeDocument"}) as string).includes("Old canvas"), "undo restored the discarded document")
    }
    await host.newDocument("canvas")
    assert(host.documentLayout.mode === "canvas" && !host.fileDirty, "New could not initialize a clean canvas")
    await host.newDocument("document")
    assert(host.documentLayout.mode === "document" && host.documentLayout.canConvert && !host.fileDirty,
      "New could not discard the generated canvas")
  }
  finally { frame.remove() }
})

await check("iframe lifecycle reaches load and cleans up", async () => {
  const frame = document.querySelector<HTMLIFrameElement>("#lifecycle")!
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("iframe load timed out")), 2000)
    if(frame.contentDocument?.readyState === "complete") { clearTimeout(timer); resolve(); return }
    frame.addEventListener("load", () => { clearTimeout(timer); resolve() }, {once: true})
  })
  assert(frame.contentDocument?.querySelector("p")?.textContent === "ready", "iframe document did not load")
  const frameWindow = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, reinitializeEditor?: () => void}
  for(let attempt = 0; !frameWindow.editor && attempt < 40; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
  assert(frameWindow.editor, `iframe editor did not initialize${frameWindow.editorError ? `: ${frameWindow.editorError}` : ""}`)
  const iframeEditor = frameWindow.editor!
  iframeEditor.destroy()
  assert(!frame.contentDocument?.querySelector("[class*='◆']"), "iframe destroy left authored markers")
  assert(!frame.contentDocument?.body.shadowRoot?.querySelector("[class*='◆']"), "iframe destroy left appendix markers")
  assert(frameWindow.reinitializeEditor, "iframe reinitialization function missing")
  frameWindow.reinitializeEditor!()
  frameWindow.editor!.destroy()
  frame.remove()
  assert(!frame.isConnected && !document.querySelector("#lifecycle"), "iframe was not removed")
})

await check("editing frame blocks meta refresh and retains same-document navigation", async () => {
  const frameOrigin = `http://localhost:${location.port}`
  const frames = new Set<HTMLIFrameElement>()
  const makeFrame = (kind: "editor" | "preview") => {
    const frame = document.createElement("iframe")
    frames.add(frame)
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin")
    frame.src = `${frameOrigin}/frame-shell.html?kind=${kind}&revision=0#nonce=${crypto.randomUUID()}`
    fixture.append(frame)
    return frame
  }
  const waitForMessage = <T>(frame: HTMLIFrameElement, type: string, timeoutMs = 4000) => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", receive)
      reject(new Error(`timed out waiting for ${type}`))
    }, timeoutMs)
    const receive = (event: MessageEvent) => {
      if(event.source !== frame.contentWindow || event.origin !== (frame.srcdoc ? location.origin : frameOrigin) || event.data?.type !== type) return
      clearTimeout(timer)
      window.removeEventListener("message", receive)
      resolve(event.data as T)
    }
    window.addEventListener("message", receive)
  })
  const install = async (frame: HTMLIFrameElement, html: string) => {
    const ready = waitForMessage<{type: string, revision: string}>(frame, "webwriter-frame-shell-ready")
    await ready
    frame.contentWindow!.postMessage({type: "webwriter-frame-document", html}, frameOrigin)
  }
  try {
    const crossOrigin = `http://127.0.0.1:${location.port}`
    for(const [delay, targetOrigin] of [["0", crossOrigin], ["0.5", frameOrigin], ["0.5", crossOrigin], ["0", frameOrigin]] as const) {
      const frame = makeFrame(targetOrigin === crossOrigin ? "editor" : "preview")
      const destination = `${targetOrigin}/?meta-refresh-target=${crypto.randomUUID()}`
      const source = `<!doctype html><html><head><meta http-equiv="refresh" content="${delay};url=${destination}" data-authored="yes"></head><body>authored<script>setTimeout(() => parent.postMessage({type:'refresh-frame-state', href:location.href, metaContent:document.querySelector('meta[http-equiv=refresh]')?.content, hasRefresh:!!document.querySelector('meta[http-equiv=refresh]')}, '*'), 1100)</script></body></html>`
      await install(frame, source)
      const report = waitForMessage<{type: string, href: string, metaContent: string, hasRefresh: boolean}>(frame, "refresh-frame-state", 1800)
      const state = await report
      assert(state.hasRefresh && state.metaContent === `${delay};url=${destination}`, `editor frame did not retain authored ${delay}s refresh metadata`)
      assert(new URL(state.href).pathname === "/frame-shell.html", `editor frame followed ${delay}s refresh to ${state.href}`)
      frame.remove()
    }

    const frame = makeFrame("editor")
    await install(frame, `<!doctype html><html><head></head><body><a id="fragment" href="#inside">fragment</a><script>location.hash = 'inside';parent.postMessage({type:'fragment-frame-state',href:location.href}, '*')</script></body></html>`)
    const fragmentState = waitForMessage<{type: string, href: string}>(frame, "fragment-frame-state")
    const state = await fragmentState
    assert(new URL(state.href).hash === "#inside", "same-document fragment navigation was blocked")

    const replaced = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("parent iframe src replacement was blocked")), 2000)
      frame.addEventListener("load", () => { clearTimeout(timer); resolve() }, {once: true})
    })
    frame.src = "about:blank"
    await replaced
    assert(frame.contentDocument?.URL === "about:blank", "trusted parent replacement did not load")
    frame.remove()

    for(const kind of ["editor", "preview", "srcdoc"] as const) {
      const links = kind === "srcdoc" ? document.createElement("iframe") : makeFrame(kind)
      if(kind === "srcdoc") {
        frames.add(links)
        links.setAttribute("sandbox", "allow-scripts allow-same-origin")
        fixture.append(links)
      }
      const source = `<!doctype html><body><script type="module">
        ${kind === "srcdoc" ? `const {openFrameLinksInNewTabs} = await import('${location.origin}/src/frame-links.ts'); openFrameLinksInNewTabs(window);` : ""}
        const opened = [];
        window.open = (...args) => { opened.push(args); return null };
        setTimeout(() => {
          for(const target of ['_self', '_top', '_parent', 'named', '_blank']) {
            const a = document.createElement('a'); a.href = 'https://example.test/' + target; a.target = target;
            document.body.append(a); a.click();
          }
          const host = document.createElement('demo-widget'); document.body.append(host);
          const shadow = host.attachShadow({mode:'open'}); shadow.innerHTML = '<a href="https://widget.test">Widget</a>';
          shadow.querySelector('a').click();
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.innerHTML = '<a href="https://svg.test"><text>SVG</text></a>'; document.body.append(svg);
          svg.querySelector('text').dispatchEvent(new MouseEvent('auxclick', {button:1, bubbles:true, cancelable:true}));
          const chapter = document.createElement('p'); chapter.id = 'chapter'; chapter.style.marginTop = '2000px'; chapter.textContent = 'Chapter'; document.body.append(chapter);
          const fragment = document.createElement('a'); fragment.href = '#chapter'; fragment.target = '_blank'; document.body.append(fragment); fragment.click();
          setTimeout(() => parent.postMessage({type:'frame-link-state', opened, href:location.href, scrollY, targets:[...document.querySelectorAll('a[target]')].map(a => a.target)}, '*'), 50);
        }, 50);
      </script></body>`
      const result = waitForMessage<{opened: string[][], href: string, scrollY: number, targets: string[]}>(links, "frame-link-state")
      if(kind === "srcdoc") links.srcdoc = source
      else await install(links, source)
      const state = await result
      assert(state.opened.length === 7 && state.opened.every(args => args[1] === "_blank" && args[2] === "noopener,noreferrer"), `${kind} did not redirect external links to a new tab`)
      assert(new URL(state.href).pathname === (kind === "srcdoc" ? "srcdoc" : "/frame-shell.html") && state.href.endsWith("#chapter"), `${kind} fragment did not stay in the frame`)
      assert(state.scrollY > 1000, `${kind} fragment did not scroll to its target`)
      assert(state.targets.join(",") === "_self,_top,_parent,named,_blank,_blank", `${kind} changed authored link targets`)
      links.remove()
    }
  }
  finally { frames.forEach(frame => frame.remove()) }
})

await check("dead-key composition stays outside authored formulas", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const data of ["^2", "â", "release", "cancel"]) {
      paragraph.innerHTML = "<math><mi>x</mi><mi>a</mi></math>"
      const math = paragraph.querySelector("math")!
      $.move(math.lastElementChild!.firstChild!, 1)
      document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "Dead", code: "IntlBackslash", keyCode: 229, bubbles: true, cancelable: true}))
      document.body.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, cancelable: true, data: ""}))
      const input = editor.appendix.querySelector<HTMLTextAreaElement>('textarea[aria-label="Formula exponent input"]')!
      assert(input && editor.appendix.activeElement === input, "native composition did not move to the appendix input")
      await layoutFrame()
      assert(math.querySelector(".◆math-slot"), "exponent placeholder disappeared during composition")
      if(data === "cancel") {
        const prose = document.createTextNode("outside")
        paragraph.append(prose)
        paragraph.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}))
        $.move(prose, 2)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        await layoutFrame()
        assert(!input.isConnected && !editor.features.math.isComposingPower, "composition input lingered after leaving the formula")
        assert(!editor.appendix.querySelector(".◆math-overlay") && !math.querySelector(".◆math-slot"), "formula presentation lingered after leaving")
        input.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true, data: "^2"}))
        assert(document.getSelection()!.focusNode === prose && math.textContent === "xa", "late composition returned to the old formula")
        continue
      }
      if(data === "release") {
        input.value = "^"
        input.dispatchEvent(new KeyboardEvent("keyup", {key: "Dead", code: "IntlBackslash", isComposing: true, bubbles: true}))
        await layoutFrame()
        const slot = math.querySelector("msup > mrow:last-child")!
        assert(!input.isConnected && document.activeElement === document.body, "formula did not regain focus after releasing the dead key")
        assert(document.getSelection()!.focusNode === slot && document.getSelection()!.focusOffset === 0, "caret did not return to the exponent start")
        document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "2", code: "Digit2", bubbles: true, cancelable: true}))
        assert(slot.textContent === "2", "first exponent character was lost after focus restoration")
        continue
      }
      for(const value of ["^", data]) {
        input.dispatchEvent(new CompositionEvent("compositionupdate", {bubbles: true, data: value}))
        input.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: false, isComposing: true, inputType: "insertCompositionText", data: value}))
        input.value = value
        input.dispatchEvent(new InputEvent("input", {bubbles: true, isComposing: true, inputType: "insertCompositionText", data: value}))
        assert(math.textContent === "xa", "composition changed the formula before commit")
      }
      input.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true, data}))
      assert(!input.isConnected, "composition input was not removed")
      assert(math.querySelector("msup > mrow:last-child")?.textContent === (data === "^2" ? "2" : "a"), "exponent was lost or duplicated")
      assert(math.querySelector("msup > mrow:first-child")?.textContent === "a", "composition corrupted the base")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("repeated canvas modifier selections preserve item placement and camera", async () => {
  for(const tag of ["ul", "p", "canvas-selection-widget"]) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:600px"
    const content = tag === "ul" ? '<li>First<!--keep--></li><li>Second <em>item</em></li>' : 'Text<!--keep--><em>content</em>'
    frame.srcdoc = `<!doctype html><body class="ww-canvas"><${tag} style="position:absolute;left:160px;top:100px;width:320px">${content}</${tag}><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>`
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & typeof globalThis
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, "canvas editor did not initialize")
      const editor = view.editor!, doc = frame.contentDocument!, item = doc.querySelector<HTMLElement>(tag)!
      await layoutFrame()
      const slot = editor.appendix.querySelector<HTMLSlotElement>("slot")!
      const children = Array.from(item.childNodes), style = item.style.cssText
      editor.doc.syncFromDOM()
      const html = editor.toHTML(true), shared = editor.doc.body.toString()
      for(const zoom of [1, 1.31]) {
        if(zoom !== 1) {
          slot.dispatchEvent(new view.WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true,
            ctrlKey: true, deltaY: -Math.log(zoom) / .002, clientX: 300, clientY: 250}))
          slot.dispatchEvent(new view.WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaX: 40, deltaY: 20}))
          await layoutFrame()
        }
        const camera = slot.style.transform, initial = item.getBoundingClientRect()
        for(let i = 0; i < 6; i++) {
          const rect = item.getBoundingClientRect()
          // The left padding selects the list itself, toggling the final item
          // off on every second click, as in issue #256.
          const options = {bubbles: true, composed: true, cancelable: true, pointerId: 91, button: 0,
            ctrlKey: true, metaKey: true, clientX: rect.left + 10, clientY: rect.top + 10}
          item.dispatchEvent(new view.PointerEvent("pointerdown", options))
          item.dispatchEvent(new view.PointerEvent("pointerup", options))
          item.dispatchEvent(new view.MouseEvent("click", options))
          await layoutFrame()
          assert((i % 2 === 0) === item.classList.contains("◆element-selected"), `${tag}: modifier click did not toggle selection`)
          assert(slot.style.transform === camera, `${tag} at ${zoom}: selection ${i} moved the camera: ${camera} -> ${slot.style.transform}`)
          const after = item.getBoundingClientRect()
          assert(Math.abs(after.left - initial.left) < .01 && Math.abs(after.top - initial.top) < .01,
            `${tag} at ${zoom}: selection ${i} moved the rendered item`)
          assert(item.style.cssText === style && children.every((node, index) => item.childNodes[index] === node),
            `${tag}: selection changed authored placement or content`)
          editor.doc.syncFromDOM()
          assert(editor.toHTML(true) === html && editor.doc.body.toString() === shared, `${tag}: selection changed serialized or shared HTML`)
        }
      }
      editor.destroy()
      assert(!doc.querySelector(".◆element-selected, .◆element-capture-selected, .◆transform-target"), `${tag}: selection markers survived teardown`)
    }
    finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
  }
})

await check("canvas box selection retains disjoint ranges and stays in the document top layer", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body class="ww-canvas"><p style="position:absolute;left:40px;top:40px;width:100px;height:60px;margin:0">first</p><p style="position:absolute;left:40px;top:350px;width:100px;height:60px;margin:0">hole</p><p style="position:absolute;left:170px;top:40px;width:100px;height:60px;margin:0;z-index:2147483647">last</p></body>'
  document.body.append(frame)
  let canvasEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `canvas editor did not initialize: ${view.editorError}`)
    canvasEditor = view.editor!
    await layoutFrame()
    const doc = frame.contentDocument!, [first, hole, last] = Array.from(doc.querySelectorAll("p"))
    const a = first.getBoundingClientRect(), b = last.getBoundingClientRect()
    const left = Math.min(a.left, b.left) - 10, top = Math.min(a.top, b.top) - 10
    const right = Math.max(a.right, b.right) + 10, bottom = Math.max(a.bottom, b.bottom) + 10
    doc.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, pointerId: 91, button: 0, clientX: left, clientY: top}))
    doc.body.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 91, buttons: 1, clientX: right, clientY: bottom}))
    const box = canvasEditor.appendix.querySelector<HTMLElement>('[part="selection-box"]')!
    assert(box?.matches(":popover-open"), "selection box is not in the document top layer")
    const boxRect = box.getBoundingClientRect()
    assert(Math.abs(boxRect.left - left) < 1 && Math.abs(boxRect.top - top) < 1
      && Math.abs(boxRect.width - (right - left)) < 1 && Math.abs(boxRect.height - (bottom - top)) < 1,
      `selection box does not start at the pointer: expected=${left},${top}, actual=${boxRect.left},${boxRect.top}`)
    assert(getComputedStyle(box).pointerEvents === "none" && box.getRootNode() === doc.body.shadowRoot, "selection box intercepts content or escapes the appendix")
    assert(canvasEditor.appendix.querySelectorAll('[part~="box-selection-preview"]').length === 2, "box preview missed an enclosed item")
    assert(!first.classList.contains("◆element-selected") && !last.classList.contains("◆element-selected") && !hole.classList.contains("◆element-selected"), "box committed a selection before release")
    doc.body.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 91, clientX: right, clientY: bottom}))
    await layoutFrame()
    assert(!box.isConnected && first.classList.contains("◆element-selected") && last.classList.contains("◆element-selected"), "selection did not survive pointerup and native refresh")
    assert(canvasEditor.appendix.querySelectorAll('[part~="multi-selection-overlay"]').length === 2, "selected items do not have separate overlays")
    const selection = canvasEditor.doc.snapshot().selection
    assert(selection?.ranges?.length === 2, "snapshot lost disjoint ranges")
    assert(!canvasEditor.toHTML().includes("selection-box"), "marquee leaked into serialized content")
  }
  finally { canvasEditor?.destroy(); frame.remove() }
})

await check("freeform box selections transform as a group", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:700px"
  document.body.append(frame)
  try {
    for(const mode of ["canvas", "slides"] as const) {
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.srcdoc = '<!doctype html><body><group-widget>Widget<!--keep--></group-widget><p>Outside</p><p>Last</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
      await loaded
      const view = frame.contentWindow! as Window & typeof globalThis, doc = frame.contentDocument!
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, "group fixture did not initialize")
      const editor = view.editor!, feature = editor.features.transformation
      assert(editor.setDocumentLayout(mode, "document"), "group fixture did not convert")
      if(mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
      else editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "zoom-in"})
      const first = doc.querySelector<HTMLElement>("group-widget")!, [outside, last] = Array.from(doc.querySelectorAll("p"))
      first.attachShadow({mode: "open"}).innerHTML = "<span>Widget content</span>"
      first.style.cssText = "position:absolute;display:block;left:200px;top:140px;width:100px;height:60px;margin:0;rotate:20deg;scale:1.1;transform:skewX(10deg);transform-origin:10px 5px"
      last.style.cssText = "position:absolute;left:400px;top:200px;width:100px;height:60px;margin:0"
      outside.style.cssText = "position:absolute;left:200px;top:450px;width:100px;height:60px;margin:0"
      await layoutFrame()
      const before = [first, last].map(element => element.getBoundingClientRect())
      const left = Math.min(...before.map(rect => rect.left)) - 10, top = Math.min(...before.map(rect => rect.top)) - 10
      const right = Math.max(...before.map(rect => rect.right)) + 10, bottom = Math.max(...before.map(rect => rect.bottom)) + 10
      doc.body.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, cancelable: true, pointerId: 91, button: 0, clientX: left, clientY: top}))
      doc.body.dispatchEvent(new view.PointerEvent("pointermove", {bubbles: true, pointerId: 91, clientX: right, clientY: bottom}))
      doc.body.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, pointerId: 91, clientX: right, clientY: bottom}))
      await layoutFrame()
      assert(!feature.overlay.hasAttribute("visibility"), `${mode}: group controls are hidden`)
      const bounds = feature.overlay.getBoundingClientRect()
      assert(Math.abs(bounds.left - left - 10) < 1 && Math.abs(bounds.right - right + 10) < 1, `${mode}: frame does not surround the group`)
      const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale"))
      assert(handles.length === 8 && handles.every(handle => handle.hidden && view.getComputedStyle(handle).display === "none"), `${mode}: group resize handles are visible`)
      const children = Array.from(first.parentNode!.childNodes), content = first.innerHTML, initial = editor.toHTML(true)
      feature.handleMoveStart(new view.MouseEvent("mousedown", {button: 0, clientX: right, clientY: bottom}))
      feature.handleMoveDrag(new view.MouseEvent("mousemove", {clientX: right + 40, clientY: bottom + 30, altKey: true}))
      feature.handleMoveEnd()
      for(const [i, element] of [first, last].entries()) {
        const rect = element.getBoundingClientRect()
        assert(Math.abs(rect.left - before[i].left - 40) < 1 && Math.abs(rect.top - before[i].top - 30) < 1, `${mode}: group move lost a member or zoom compensation`)
      }
      const moved = editor.toHTML(true)
      editor.doc.undo()
      assert(editor.toHTML(true) === initial, `${mode}: one undo did not restore the entire move`)
      editor.doc.redo()
      assert(editor.toHTML(true) === moved, `${mode}: redo did not restore the group move`)
      await layoutFrame()
      const resizeBefore = editor.toHTML(true), group = feature.overlay.getBoundingClientRect()
      const handle = handles.find(handle => handle.dataset.resizeDirection === "down-right")!
      handle.addEventListener("mousedown", event => feature.handleScaleStart(event), {once: true})
      handle.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: group.right, clientY: group.bottom}))
      feature.handleScaleDrag(new view.MouseEvent("mousemove", {clientX: group.right + 60, clientY: group.bottom + 30, altKey: true}))
      feature.handleScaleEnd()
      assert(editor.toHTML(true) === resizeBefore, `${mode}: a hidden handle resized the group`)
      const rotateBefore = [first, last].map(element => element.getBoundingClientRect())
      const rotation = feature.overlay.getBoundingClientRect(), cx = rotation.left + rotation.width / 2, cy = rotation.top + rotation.height / 2
      feature.handleRotateStart(new view.MouseEvent("mousedown", {button: 0, clientX: cx, clientY: cy - 50}))
      feature.handleRotateDrag(new view.MouseEvent("mousemove", {clientX: cx + 50, clientY: cy, altKey: true}))
      feature.handleRotateEnd()
      for(const [i, element] of [first, last].entries()) {
        const rect = element.getBoundingClientRect(), before = rotateBefore[i]
        assert(Math.abs(rect.left + rect.width / 2 - (cx - (before.top + before.height / 2 - cy))) < 1
          && Math.abs(rect.top + rect.height / 2 - (cy + (before.left + before.width / 2 - cx))) < 1, `${mode}: rotation did not orbit the group center`)
      }
      assert(Array.from(first.parentNode!.childNodes).every((node, i) => node === children[i]) && first.innerHTML === content, `${mode}: transforms changed authored structure`)
      assert(outside.style.left === "200px" && outside.style.top === "450px", `${mode}: transforms affected an unselected item`)
      assert(editor.doc.snapshot().selection?.ranges?.length === 2, `${mode}: gesture collapsed the group selection`)
      assert(!editor.toHTML(true).match(/◆|transform-overlay/), `${mode}: group controls leaked into serialization`)
      editor.destroy()
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("canvas slot preserves hit testing and document coordinates at different zoom levels", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "Canvas text"
  paragraph.style.cssText = "width:240px;margin:0"
  document.body.append(paragraph)
  const rotated = document.createElement("aside")
  rotated.textContent = "Rotated"
  rotated.style.cssText = "width:180px;height:60px;rotate:20deg;margin:12px"
  document.body.append(rotated)
  const originalDifference = {x: rotated.getBoundingClientRect().left - paragraph.getBoundingClientRect().left,
    y: rotated.getBoundingClientRect().top - paragraph.getBoundingClientRect().top}
  const originalChildren = Array.from(document.body.childNodes)
  try {
    assert(editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"}), "canvas conversion failed")
    assert(originalChildren.every((node, i) => document.body.childNodes[i] === node), "conversion rebuilt content")
    const difference = {x: rotated.getBoundingClientRect().left - paragraph.getBoundingClientRect().left,
      y: rotated.getBoundingClientRect().top - paragraph.getBoundingClientRect().top}
    assert(Math.abs(difference.x / editor.features.canvas.zoom - originalDifference.x) < 1
      && Math.abs(difference.y / editor.features.canvas.zoom - originalDifference.y) < 1, "conversion displaced an authored transform")
    editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
    paragraph.style.left = "-300px"
    paragraph.style.top = "-200px"
    const slot = editor.appendix.querySelector<HTMLSlotElement>("slot")!
    // Pan to a negative authored position without changing it.
    slot.dispatchEvent(new WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaX: -500, deltaY: -400}))
    await layoutFrame()
    const before = paragraph.getBoundingClientRect()
    assert(before.width > 200 && before.height > 0, "slotted paragraph has no usable box")
    const point = editor.features.canvas.clientPoint(before.left, before.top)
    assert(Math.abs(point.x + 300) < 1 && Math.abs(point.y + 200) < 1, `negative canvas coordinate is wrong: ${JSON.stringify(point)}`)
    editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
    await layoutFrame()
    const zoomed = paragraph.getBoundingClientRect()
    assert(Math.abs(zoomed.width / before.width - 1.2) < .01, "camera did not scale slotted content")
    const zoomPoint = editor.features.canvas.clientPoint(zoomed.left, zoomed.top)
    assert(Math.abs(zoomPoint.x + 300) < 1 && Math.abs(zoomPoint.y + 200) < 1, "zoom changed authored coordinates")
    editor.features.canvas.reveal(zoomed)
    await layoutFrame()
    const rect = paragraph.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + 10, rect.top + rect.height / 2)
    assert(hit === paragraph || paragraph.contains(hit), `hit testing missed canvas text: ${hit?.outerHTML}`)
    $.move(paragraph.firstChild!, 3)
    editor.features.selection.processSelection()
    assert(getSelection()?.anchorNode === paragraph.firstChild, "canvas text lost its native selection")
    assert(editor.features.transformation.target === paragraph && !paragraph.classList.contains("◆element-selected"), "canvas caret does not show item controls independently of node selection")
    assert(getComputedStyle(editor.features.transformation.overlay).outlineStyle === "dotted", "canvas text selection lacks the dotted item outline")
    assert(getComputedStyle(paragraph).caretColor !== "rgba(0, 0, 0, 0)", "canvas item controls hide the text caret")
    for(const surface of [document.body, slot]) {
      $.selectRange(document.body, 0)
      const range = document.createRange(), text = paragraph.firstChild!
      range.setStart(text, 1); range.collapse(true)
      const start = range.getBoundingClientRect()
      range.setStart(text, 7)
      const end = range.getBoundingClientRect(), y = start.top + start.height / 2
      surface.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 29, clientX: start.left, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 29, clientX: end.left, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 29, clientX: end.left, clientY: y}))
      assert(!getSelection()?.isCollapsed && paragraph.contains(getSelection()!.anchorNode) && paragraph.contains(getSelection()!.focusNode),
        `canvas drag through ${surface.localName} did not stay inside its item`)
    }
    dragTextInside(editor, paragraph)
    const contentFrame = editor.features.transformation.overlay
    assert(contentFrame.part.contains("transform-overlay-content-selected"), "inner canvas selection did not show the root frame")
    await new Promise(resolve => setTimeout(resolve, 200))
    const contentFrameColor = getComputedStyle(contentFrame).outlineColor
    const rotation = contentFrame.querySelector<HTMLElement>("#◆transform-overlay-rotator")!
    for(const pseudo of ["::before", "::after"]) {
      assert(getComputedStyle(rotation, pseudo).backgroundColor === contentFrameColor, "canvas rotation icon or stem does not match the grey frame")
    }
    const resizeBefore = paragraph.getBoundingClientRect()
    const resizer = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    assert(getComputedStyle(resizer).backgroundColor === contentFrameColor, "content-selection handles do not match the grey frame")
    resizer.addEventListener("mousedown", event => editor.features.transformation.handleScaleStart(event), {once: true})
    resizer.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: resizeBefore.right, clientY: resizeBefore.bottom}))
    editor.features.transformation.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: resizeBefore.right + 120, clientY: resizeBefore.bottom + 60}))
    editor.features.transformation.handleScaleEnd()
    const resizeAfter = paragraph.getBoundingClientRect()
    assert(Math.abs(resizeAfter.width - resizeBefore.width - 120) < 1
      && Math.abs(resizeAfter.height - resizeBefore.height - 60) < 1, "zoomed canvas resize did not grow the rendered item")
    assert(Math.abs(resizeAfter.left - resizeBefore.left) < 1 && Math.abs(resizeAfter.top - resizeBefore.top) < 1, "canvas resize moved its opposite corner")
    assert($.selectedElement === paragraph && !contentFrame.part.contains("transform-overlay-content-selected"), "resizing did not promote the canvas root to element selection")
    assert(contentFrame.getAnimations().length > 0 && resizer.getAnimations().length > 0, "canvas selection color changed without a transition")
    await new Promise(resolve => setTimeout(resolve, 200))
    assert(getComputedStyle(resizer).backgroundColor !== contentFrameColor, "selected root retained grey handles")
    dragTextInside(editor, paragraph)
    const mover = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    mover.addEventListener("mousedown", event => editor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 320, clientY: 200}))
    editor.features.transformation.handleMoveEnd()
    const movedSelection = getSelection()!
    assert(movedSelection.anchorNode === paragraph.firstChild && movedSelection.anchorOffset === 1
      && movedSelection.focusNode === paragraph.firstChild && movedSelection.focusOffset === 7,
    "moving did not restore the exact canvas text range")
    assert(editor.features.transformation.target === paragraph
      && contentFrame.part.contains("transform-overlay-content-selected") && !paragraph.classList.contains("◆element-selected"),
    "moving did not retain the canvas content selection and root ownership")
    assert(Math.abs(parseFloat(paragraph.style.left) - (-300 + 120 / editor.features.canvas.zoom)) < 1, `zoomed move used screen instead of document units: ${paragraph.style.left}`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert(getComputedStyle(resizer).backgroundColor === getComputedStyle(contentFrame).outlineColor,
      "moved canvas content selection does not retain grey content handles")
    // Continue the camera-edge gesture checks from an explicit item selection;
    // the move above intentionally leaves the native text range active.
    editor.features.selection.selectElement(paragraph)
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    mover.addEventListener("mousedown", event => editor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: window.innerWidth - 20, clientY: 200}))
    const cameraBeforeEdge = slot.style.transform
    editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, clientX: window.innerWidth - 1, clientY: 200}))
    await layoutFrame()
    assert(slot.style.transform !== cameraBeforeEdge, "dragging at the edge did not pan the canvas")
    editor.features.transformation.handleMoveEnd()
    const cameraAfterDrag = slot.style.transform
    await layoutFrame()
    assert(slot.style.transform === cameraAfterDrag, "edge panning continued after release")
    paragraph.style.height = "120px"
    for(const direction of ["left", "right", "up", "down", "diagonal"]) {
      const current = paragraph.getBoundingClientRect()
      paragraph.style.left = `${parseFloat(paragraph.style.left) + (200 - current.left) / editor.features.canvas.zoom}px`
      paragraph.style.top = `${parseFloat(paragraph.style.top) + (200 - current.top) / editor.features.canvas.zoom}px`
      const start = paragraph.getBoundingClientRect()
      const x = start.left + start.width / 2, y = start.top + start.height / 2
      const dx = direction === "left" ? 10 - x : direction === "right" || direction === "diagonal" ? window.innerWidth - 10 - x : 0
      const dy = direction === "up" ? 10 - y : direction === "down" || direction === "diagonal" ? window.innerHeight - 10 - y : 0
      assert(Math.abs(x + dx - (direction === "left" ? 10 : direction === "right" || direction === "diagonal" ? window.innerWidth - 10 : x)) < 1
        && Math.abs(y + dy - (direction === "up" ? 10 : direction === "down" || direction === "diagonal" ? window.innerHeight - 10 : y)) < 1,
      "edge-pan pointer did not reach the requested viewport edge")
      editor.features.transformation.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: x, clientY: y}))
      const camera = editor.features.canvas.clientPoint(0, 0)
      editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: x + dx, clientY: y + dy}))
      const atEdge = paragraph.getBoundingClientRect()
      await layoutFrame()
      const firstPan = slot.style.transform
      await layoutFrame()
      assert(slot.style.transform !== firstPan, `${direction}: panning stopped while holding the item at the edge`)
      const panned = editor.features.canvas.clientPoint(0, 0)
      assert(dx ? (panned.x - camera.x) * dx > 0 : Math.abs(panned.x - camera.x) < .01, `${direction}: wrong horizontal pan`)
      assert(dy ? (panned.y - camera.y) * dy > 0 : Math.abs(panned.y - camera.y) < .01, `${direction}: wrong vertical pan`)
      const held = paragraph.getBoundingClientRect()
      assert(Math.abs(held.left - atEdge.left) < 1 && Math.abs(held.top - atEdge.top) < 1, `${direction}: panning displaced the item from the pointer`)
      editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: x, clientY: y}))
      const centered = slot.style.transform
      await layoutFrame()
      assert(slot.style.transform === centered, `${direction}: panning continued after moving away from the edge`)
      editor.features.transformation.handleMoveEnd()
      const released = slot.style.transform
      await layoutFrame()
      assert(slot.style.transform === released, `${direction}: panning continued after release`)
    }
    const deletionTarget = document.createElement("p")
    deletionTarget.textContent = "Text"
    Object.assign(deletionTarget.style, {position: "absolute", left: "-20000px", top: "-20000px"})
    document.body.append(deletionTarget)
    try {
      $.selectRange(deletionTarget.firstChild!, 1, deletionTarget.firstChild!, 3)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      const beforeDelete = slot.style.transform
      deletionTarget.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true}))
      await layoutFrame()
      assert(deletionTarget.textContent === "Tt", "Backspace did not delete selected canvas text")
      assert(slot.style.transform === beforeDelete, "Backspace moved the canvas while deleting text")
      $.selectElement(deletionTarget)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: true})
      assert(document.querySelector(".◆snippet-hovered") === deletionTarget && getComputedStyle(editor.features.selection.hoverCaret!).display === "block",
        "selected canvas root suppresses the future snippet outline")
      editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: false})
      assert(!deletionTarget.classList.contains("◆snippet-hovered"), "canvas snippet preview was not cleared")
      deletionTarget.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true}))
      await layoutFrame()
      assert(!deletionTarget.isConnected, "Backspace did not delete the canvas root")
      assert(slot.style.transform === beforeDelete, "Backspace moved the canvas while deleting a root")
    }
    finally { deletionTarget.remove() }
    const exported = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    assert(exported.body.classList.contains("ww-canvas") && !exported.body.outerHTML.includes("canvas-controls")
      && !exported.documentElement.classList.contains("◆canvas-active"), "serialization mixed camera and authored layout")
    await checkFreeformCapture(editor, document.body)
  }
  finally {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    paragraph.remove(); rotated.remove()
  }
})

await check("canvas Enter inserts a line break and conversion returns normal flow", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "FirstSecond"
  document.body.append(paragraph)
  try {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    paragraph.style.left = "120px"; paragraph.style.top = "100px"; paragraph.style.margin = "0px"
    $.move(paragraph.firstChild!, 5)
    const siblings = Array.from(paragraph.parentNode!.childNodes)
    paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    assert(paragraph.innerHTML === "First<br>Second", "canvas Enter did not insert a line break")
    assert(Array.from(paragraph.parentNode!.childNodes).every((node, index) => node === siblings[index])
      && paragraph.parentNode!.childNodes.length === siblings.length, "canvas Enter split the root element")
    $.move(paragraph.lastChild!, 3)
    paragraph.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true}))
    assert(paragraph.innerHTML === "First<br>Sec<br>ond", "canvas native paragraph input did not insert a line break")
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    assert(getComputedStyle(paragraph).position === "static", "document conversion retained absolute placement")
    assert(!document.documentElement.classList.contains("◆canvas-active"), "document conversion retained camera marker")
  }
  finally {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    paragraph.remove()
  }
})

await check("empty floated and freeform text roots render the first break", async () => {
  const original = fixture.innerHTML
  try {
    for(const mode of ["float", "canvas", "slides"] as const) {
      editor.setDocumentLayout("document", editor.getDocumentLayoutState().mode)
      fixture.innerHTML = '<p style="line-height:20px;margin:0"></p>'
      const paragraph = fixture.querySelector("p")!
      if(mode === "float") paragraph.style.float = "right"
      else assert(editor.setDocumentLayout(mode, "document"), `${mode}: empty text fixture did not convert`)
      $.move(paragraph)
      const before = paragraph.getBoundingClientRect().height
      const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
      paragraph.dispatchEvent(event)
      await layoutFrame()
      assert(event.defaultPrevented, `${mode}: Enter was not handled`)
      assert(paragraph.querySelectorAll("br").length === 2, `${mode}: first empty break did not include its rendered terminal break: ${paragraph.innerHTML}`)
      assert(paragraph.getBoundingClientRect().height > before, `${mode}: first empty break did not render a line`)
      assert(paragraph.contains($.anchor), `${mode}: first empty break moved the caret outside the text root`)
      if(mode !== "float") assert(editor.setDocumentLayout("document", mode), `${mode}: empty text fixture did not return to document layout`)
    }
  }
  finally {
    editor.setDocumentLayout("document", editor.getDocumentLayoutState().mode)
    fixture.innerHTML = original
  }
})


await check("canvas and slide Enter preserves empty lists and repeated breaks", async () => {
  for(const mode of ["canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:700px"
    frame.srcdoc = '<!doctype html><body><ul><!--keep--></ul><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, `${mode}: list fixture did not initialize`)
      const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: list fixture did not convert`)
      const list = doc.querySelector("ul")!, parent = list.parentNode!
      const siblings = Array.from(parent.childNodes), style = list.getAttribute("style")
      selection.collapse(list, list.childNodes.length)
      let firstHeight = 0
      for(const [index, input] of ["key", "insertParagraph", "insertLineBreak"].entries()) {
        const event = input === "key" ? new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
          : new InputEvent("beforeinput", {inputType: input, bubbles: true, cancelable: true})
        list.dispatchEvent(event)
        await layoutFrame()
        const item = list.querySelector("li")!
        assert(event.defaultPrevented, `${mode}: ${input} was not handled`)
        assert(item && list.querySelectorAll("li").length === 1, `${mode}: ${input} exited or split the list`)
        assert(item.querySelectorAll("br").length === index + 2 && !item.querySelector("p"), `${mode}: ${input} did not insert the requested break and its terminal line break`)
        assert(item.contains(selection.anchorNode), `${mode}: ${input} moved the caret outside the item`)
        assert(list.getAttribute("style") === style, `${mode}: ${input} changed list placement`)
        assert(Array.from(parent.childNodes).length === siblings.length
          && siblings.every((node, index) => parent.childNodes[index] === node), `${mode}: ${input} changed neighboring roots`)
        if(index === 0) firstHeight = item.getBoundingClientRect().height
        else assert(item.getBoundingClientRect().height > firstHeight, `${mode}: repeated breaks did not grow the text box`)
      }
    }
    finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
  }
})

let savedCanvasHTML = ""
await check("ribbon elements drop on the blank canvas slot", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p></p></body>'
  document.body.append(frame)
  let canvasEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `canvas editor did not initialize: ${view.editorError}`)
    canvasEditor = view.editor!
    assert(canvasEditor.features.canvas.actions.startCanvas({type: "startCanvas"}), "empty canvas could not start")
    await layoutFrame()
    const doc = frame.contentDocument!, slot = doc.body.shadowRoot!.querySelector<HTMLSlotElement>("slot:not([name])")!
    const data = new DataTransfer()
    data.setData("application/x-webwriter-element-tag", "h2")
    data.setData("application/x-webwriter-element-tag-h2", "h2")
    data.setData("text/html", "<h2></h2>")
    const rect = slot.getBoundingClientRect()
    const init = {dataTransfer: data, clientX: rect.left + 240, clientY: rect.top + 180, bubbles: true, cancelable: true, composed: true}
    const over = new DragEvent("dragover", init)
    slot.dispatchEvent(over)
    assert(over.defaultPrevented, "canvas slot did not accept the ribbon drag")
    slot.dispatchEvent(new DragEvent("drop", init))
    const heading = doc.body.querySelector<HTMLElement>("h2")
    assert(heading?.style.position === "absolute", "canvas slot did not insert the dropped heading")
  }
  finally { canvasEditor?.destroy(); frame.remove() }
})

await check("relayed ribbon elements drop onto the selected element beneath editor overlays", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>before</p><h2>selected</h2><p>after</p></body>'
  document.body.append(frame)
  let frameEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `overlay drop editor did not initialize: ${view.editorError}`)
    frameEditor = view.editor!
    const doc = frame.contentDocument!, heading = doc.querySelector("h2")!
    doc.getSelection()!.setBaseAndExtent(doc.body, 1, doc.body, 2)
    frameEditor.features.selection.processSelection()
    await layoutFrame(); await layoutFrame()
    const rect = heading.getBoundingClientRect()
    const x = rect.right - 2, y = rect.top + rect.height / 2
    assert(doc.elementFromPoint(x, y) === doc.body, "the selected element is not covered by an editor overlay")
    const data = {"application/x-webwriter-element-tag": "table", "application/x-webwriter-element-tag-table": "table", "text/html": "<table></table>"}
    assert(replayHostDrag({event: "dragover", x, y, data}, doc), "drag over the selected element was not accepted")
    assert(doc.body.classList.contains("◆drop-selection-active"), "drag over the selected element shows no drop caret")
    assert(replayHostDrag({event: "drop", x, y, data}, doc), "drop on the selected element was not accepted")
    assert(doc.body.querySelector("table") && heading.isConnected,
      `drop on the selected element did not insert the table: ${doc.body.innerHTML}`)
    doc.body.innerHTML = '<picture style="width:600px;height:320px"><img></picture>'
    const image = doc.querySelector("picture")!
    doc.getSelection()!.setBaseAndExtent(doc.body, 0, doc.body, 1)
    frameEditor.features.selection.processSelection()
    await layoutFrame(); await layoutFrame()
    const imageBox = image.getBoundingClientRect()
    const inputBox = frameEditor.features.media.placeholder.root.querySelector("input")!.getBoundingClientRect()
    const nativeData = {"application/x-webwriter-ribbon-insertion": "element:h2"}
    // A media-only document has no text caret to recover in the surrounding
    // whitespace. Browsers are allowed to return no native caret there.
    const nativeCaret = doc.caretPositionFromPoint.bind(doc)
    Object.defineProperty(doc, "caretPositionFromPoint", {configurable: true, value: () => null})
    const nativeHits = doc.elementsFromPoint.bind(doc)
    Object.defineProperty(doc, "elementsFromPoint", {configurable: true, value: () => [doc.body]})
    for(const [dropX, dropY] of [[inputBox.left + inputBox.width / 2, inputBox.top + inputBox.height / 2], [imageBox.left + imageBox.width / 2, imageBox.bottom + 160]]) {
      const imageIndex = Array.from(doc.body.childNodes).indexOf(image)
      doc.getSelection()!.setBaseAndExtent(doc.body, imageIndex, doc.body, imageIndex + 1)
      frameEditor.features.selection.processSelection()
      await layoutFrame(); await layoutFrame()
      const before = doc.querySelectorAll("h2").length
      assert(replayHostDrag({event: "dragover", x: dropX, y: dropY, data: nativeData}, doc), "drag over selected image was rejected")
      assert(doc.body.classList.contains("◆drop-selection-active"), "selected image prevented the drop caret")
      assert(replayHostDrag({event: "drop", x: dropX, y: dropY, data: nativeData}, doc), "drop near selected image was rejected")
      assert(doc.querySelectorAll("h2").length === before + 1 && image.isConnected, "selected image prevented native insertion")
    }
    Object.defineProperty(doc, "caretPositionFromPoint", {configurable: true, value: nativeCaret})
    Object.defineProperty(doc, "elementsFromPoint", {configurable: true, value: nativeHits})
    doc.body.innerHTML = "<p></p>"
    frameEditor.features.selection.processSelection()
    await layoutFrame(); await layoutFrame()
    const imageData = {"application/x-webwriter-ribbon-insertion": "element:picture"}
    replayHostDrag({event: "dragover", x: 300, y: 300, data: imageData}, doc)
    replayHostDrag({event: "drop", x: 300, y: 300, data: imageData}, doc)
    await layoutFrame(); await layoutFrame()
    assert(doc.querySelector("picture"), "initial image drop failed")
    for(const tag of ["h1", "table", "details", "picture", "p"]) {
      const count = doc.querySelectorAll(tag).length
      const nextData = {"application/x-webwriter-ribbon-insertion": `element:${tag}`}
      replayHostDrag({event: "dragover", x: 300, y: 400, data: nextData}, doc)
      assert(doc.body.classList.contains("◆drop-selection-active"), `image drop blocked ${tag} caret`)
      replayHostDrag({event: "drop", x: 300, y: 400, data: nextData}, doc)
      assert(doc.querySelectorAll(tag).length > count, `image drop blocked ${tag} insertion`)
      await layoutFrame(); await layoutFrame()
    }
  }
  finally { frameEditor?.destroy(); frame.remove() }
})

await check("ribbon snippets drop at the caret and center in freeform layouts", async () => {
  for(const mode of ["document", "canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:600px"
    frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>before after</p></body>'
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, "drop fixture did not initialize")
      const editor = view.editor!, doc = frame.contentDocument!
      if(mode !== "document") assert(editor.setDocumentLayout(mode, "document"), "drop layout could not be set")
      await layoutFrame()
      const target = mode === "slides" ? doc.querySelector<HTMLElement>(".ww-slide")! : doc.body
      const paragraph = doc.querySelector("p")!, range = doc.createRange()
      range.setStart(paragraph.firstChild!, 7); range.collapse(true)
      const caret = range.getBoundingClientRect(), rect = target.getBoundingClientRect()
      const x = mode === "document" ? caret.left : Math.max(rect.left + 250, 250)
      const y = mode === "document" ? caret.top + caret.height / 2 : Math.max(rect.top + 150, 150)
      let message: {position: import("../src/editor-bridge").RibbonDropPosition} | undefined
      editor.postHostMessage = data => {
        if((data as {type?: string}).type === "editor-ribbon-drop") message = data as typeof message
      }
      const data = new DataTransfer()
      data.setData("application/x-webwriter-ribbon-insertion", "user-snippet:saved")
      const surface = mode === "canvas" ? editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")! : paragraph
      const init = {dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true}
      const over = new DragEvent("dragover", init)
      surface.dispatchEvent(over)
      assert(over.defaultPrevented, "ribbon insertion drag was not accepted")
      if(mode === "document") assert(doc.getSelection()?.anchorNode === paragraph.firstChild && doc.getSelection()?.anchorOffset === 7, "moving drop caret is absent")
      surface.dispatchEvent(new DragEvent("drop", init))
      assert(message, "ribbon drop did not request insertion")
      const html = mode === "document" ? '<em>inserted </em>' : '<p style="width:120px;height:60px;margin:0">Saved <b>snippet</b><!--keep--></p>'
      assert(await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html, position: message!.position}), "drop insertion failed")
      await layoutFrame()
      if(mode === "document") assert(paragraph.textContent === "before inserted after", "drop did not insert at the moving caret")
      else {
        const inserted = target.lastElementChild as HTMLElement, box = inserted.getBoundingClientRect()
        assert(Math.abs(box.left + box.width / 2 - x) < 1 && Math.abs(box.top + box.height / 2 - y) < 1, "drop is not centered at pointer coordinates")
        assert(inserted.innerHTML.includes("<!--keep-->"), "drop lost nested snippet content")
        for(const action of ["insert-graphic-shape:rectangle", "insert-math:frac", "list-style:ol:lower-alpha"]) {
          // Keep prior graphics away from the next independent layout drop.
          for(const graphic of target.querySelectorAll<SVGSVGElement>(":scope > svg")) graphic.style.left = `${parseFloat(graphic.style.left) + 1000}px`
          range.selectNodeContents(target); range.collapse(false)
          editor.features.selection.selectDropRange(range, {scrollIntoView: false})
          data.setData("application/x-webwriter-ribbon-insertion", action)
          surface.dispatchEvent(new DragEvent("drop", init))
          await layoutFrame()
          const root = target.lastElementChild as HTMLElement, box = root.getBoundingClientRect()
          assert(Math.abs(box.left + box.width / 2 - x) < 1 && Math.abs(box.top + box.height / 2 - y) < 1, `${mode}: ${action} is not centered (${box.left + box.width / 2}, ${box.top + box.height / 2} vs ${x}, ${y}; ${root.outerHTML})`)
          assert(action.startsWith("insert-graphic") ? root.localName === "svg" : action.startsWith("insert-math") ? root.querySelector("mfrac") : root.localName === "ol", `${action} did not create its element`)
          if(action.startsWith("insert-graphic")) assert(doc.getSelection()?.toString() === "" && root.parentNode === doc.getSelection()?.anchorNode, "shape drop lost its element selection")
          else assert(root.contains(doc.getSelection()?.anchorNode ?? null) && doc.getSelection()?.isCollapsed,
            `${action} lost its editing caret while centering: ${root.outerHTML}; ${doc.getSelection()?.anchorNode?.nodeName}@${doc.getSelection()?.anchorOffset}, collapsed=${doc.getSelection()?.isCollapsed}`)
        }
        for(const tag of ["table", "details", "h2", "math", "svg"]) {
          for(const graphic of target.querySelectorAll<SVGSVGElement>(":scope > svg")) graphic.style.left = `${parseFloat(graphic.style.left) + 1000}px`
          range.selectNodeContents(target); range.collapse(false)
          editor.features.selection.selectDropRange(range, {scrollIntoView: false})
          const elementData = new DataTransfer()
          elementData.setData("application/x-webwriter-ribbon-insertion", `element:${tag}`)
          target.dispatchEvent(new DragEvent("drop", {...init, dataTransfer: elementData}))
          await layoutFrame()
          const root = target.lastElementChild!
          if(tag === "svg") assert(editor.features.selection.captureSelectedElement === root, "graphic drop lost its capture selection")
          else {
            const content = tag === "table" ? root.querySelector("td") : tag === "details" ? root.querySelector("summary") : tag === "math" ? root.querySelector("mrow") : root
            assert(content?.contains(doc.getSelection()?.anchorNode ?? null) && doc.getSelection()?.isCollapsed, `${mode}: ${tag} lost its editing caret while centering`)
            if(tag === "table") assert(editor.features.table.hasCellSelection, "table drop did not select the first cell")
          }
        }
      }
      message = undefined
      for(let index = 0; index < 3; index++) {
        if(mode !== "document") {
          for(const graphic of target.querySelectorAll<SVGSVGElement>(":scope > svg")) graphic.style.left = `${parseFloat(graphic.style.left) + 1000}px`
          range.selectNodeContents(target); range.collapse(false)
          editor.features.selection.selectDropRange(range, {scrollIntoView: false})
        }
        data.setData("application/x-webwriter-ribbon-insertion", "package:prepared")
        data.setData("text/html", "<x-prepared-drop>Prepared widget</x-prepared-drop>")
        target.dispatchEvent(new DragEvent("dragover", init))
        target.dispatchEvent(new DragEvent("drop", init))
        await layoutFrame()
        assert(target.querySelectorAll("x-prepared-drop").length === index + 1, `${mode}: repeated prepared drop failed`)
        assert(!message, "prepared drop unnecessarily requested host insertion")
      }
      assert(!doc.body.classList.contains("◆drop-selection-active"), "drop selection marker leaked")
    }
    finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
  }
})

await check("typing after moving a text box preserves its text and position", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  document.body.append(frame)
  try {
    for(const mode of ["canvas", "slides"] as const) {
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p id="moving-text">Before <em>formatted</em><!--keep--> text</p><p id="neighbor">Keep neighbor</p></body>'
      await loaded
      const view = frame.contentWindow! as Window & typeof globalThis, doc = frame.contentDocument!
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, `${mode}: text fixture did not initialize`)
      const editor = view.editor!, feature = editor.features.transformation
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: conversion failed`)
      if(mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
      else editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
      const paragraph = doc.querySelector<HTMLElement>("#moving-text")!, neighbor = doc.querySelector<HTMLElement>("#neighbor")!
      paragraph.style.cssText = "position:absolute;left:400px;top:140px;width:240px;height:100px;margin:0"
      neighbor.style.cssText = "position:absolute;left:700px;top:300px;width:180px;height:100px;margin:0"
      const neighborHTML = neighbor.outerHTML, parent = paragraph.parentNode!, children = Array.from(parent.childNodes)
      const selection = doc.getSelection()!, text = paragraph.lastChild!
      selection.setPosition(text, text.textContent!.length)
      assert(doc.execCommand("insertText", false, " first"), `${mode}: initial typing failed`)
      await layoutFrame()
      const caret = selection.anchorNode!, offset = selection.anchorOffset, before = paragraph.getBoundingClientRect()
      const initial = editor.toHTML(true)
      const edge = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
      edge.addEventListener("mousedown", event => feature.handleMoveStart(event), {once: true})
      edge.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: before.right, clientY: before.top}))
      feature.handleMoveDrag(new view.MouseEvent("mousemove", {altKey: true, clientX: before.right + 40, clientY: before.top + 30}))
      feature.handleMoveEnd()
      await layoutFrame()
      assert(selection.anchorNode === caret && selection.anchorOffset === offset && selection.isCollapsed, `${mode}: moving replaced the text caret with a box selection`)
      const moved = paragraph.getBoundingClientRect(), movedHTML = editor.toHTML(true), placement = paragraph.getAttribute("style")
      assert(paragraph.style.left === "440px" && paragraph.style.top === "170px"
        && Math.abs(moved.width - before.width) < 1, `${mode}: moving did not retain authored dimensions and offsets`)
      const event = new view.InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: " second"})
      doc.body.dispatchEvent(event)
      assert(!event.defaultPrevented, `${mode}: typing entered the structural replacement path`)
      assert(doc.execCommand("insertText", false, " second"), `${mode}: typing after moving failed`)
      await layoutFrame()
      editor.doc.syncFromDOM()
      const typed = editor.toHTML(true)
      assert(paragraph.isConnected && paragraph.textContent === "Before formatted text first second", `${mode}: typing replaced existing content`)
      assert(paragraph.getAttribute("style") === placement && Math.abs(paragraph.getBoundingClientRect().left - moved.left) < 1, `${mode}: typing reset placement`)
      assert(neighbor.outerHTML === neighborHTML && Array.from(parent.childNodes).every((node, i) => node === children[i]), `${mode}: moving and typing changed a neighbor or rebuilt the box`)
      assert(!typed.includes("◆") && !editor.doc.body.toString().includes("◆"), `${mode}: editing artifacts leaked`)
      editor.doc.undo()
      assert(editor.toHTML(true) === movedHTML, `${mode}: undo of typing lost the move`)
      editor.doc.undo()
      assert(editor.toHTML(true) === initial, `${mode}: undo of the move lost earlier typing`)
      editor.doc.redo(); editor.doc.redo()
      assert(editor.toHTML(true) === typed, `${mode}: redo lost typing or placement`)
      editor.destroy()
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("a clean canvas retains its initial item when moving and typing without inserting links", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  // No script or other in-flow metadata in BODY to mask the empty-flow check.
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p></p></body>'
  document.body.append(frame)
  let canvasEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `canvas editor did not initialize: ${view.editorError}`)
    canvasEditor = view.editor!
    const doc = frame.contentDocument!, paragraph = doc.querySelector("p")!
    assert(canvasEditor.features.canvas.actions.startCanvas({type: "startCanvas"}), "empty canvas could not start")
    await layoutFrame()
    const before = paragraph.getBoundingClientRect()
    const edge = canvasEditor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    edge.addEventListener("mousedown", event => canvasEditor!.features.transformation.handleMoveStart(event), {once: true})
    edge.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    canvasEditor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 224, clientY: 216}))
    canvasEditor.features.transformation.handleMoveEnd()
    await layoutFrame()
    const moved = paragraph.getBoundingClientRect()
    assert(paragraph.isConnected && moved.height > 0 && Math.abs(moved.left - before.left - 24) < 1
      && Math.abs(moved.top - before.top - 16) < 1, `moving the initial canvas item loses its visible box: before=${JSON.stringify(before.toJSON())}, after=${JSON.stringify(moved.toJSON())}, connected=${paragraph.isConnected}, style=${paragraph.getAttribute("style")}, content=${paragraph.innerHTML}, target=${canvasEditor.features.transformation.target?.localName}`)
    assert(doc.getSelection()?.anchorNode === doc.body && !doc.getSelection()!.isCollapsed
      && canvasEditor.features.transformation.target === paragraph, "moving the initial item did not select its root")
    const type = async (target: HTMLElement, value: string) => {
      const anchor = target.lastChild ?? target
      doc.getSelection()!.setBaseAndExtent(anchor, anchor.textContent?.length ?? 0, anchor, anchor.textContent?.length ?? 0)
      const event = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: value})
      target.dispatchEvent(event)
      assert(!event.defaultPrevented, "canvas typing entered the virtual-document insertion path")
      assert(doc.execCommand("insertText", false, value), "native canvas text insertion failed")
      await layoutFrame()
      assert(target.isConnected && target.getBoundingClientRect().height > 0 && target.contains(doc.getSelection()!.anchorNode), "typing loses the canvas item or caret")
      const emptyCaret = canvasEditor!.features.selection.emptyDocumentCaret
      assert(!emptyCaret || view.getComputedStyle(emptyCaret).display === "none", "canvas text retains the empty-document caret")
      assert(!doc.body.querySelector("link"), "typing inserted a link into canvas content")
    }
    await type(paragraph, "Hello")
    await type(paragraph, " world")
    doc.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    doc.body.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await layoutFrame()
    const backgroundCaret = canvasEditor.features.selection.emptyDocumentCaret
    assert(view.getComputedStyle(doc.body).cursor === "default", "canvas background does not use the arrow cursor")
    assert(view.getComputedStyle(canvasEditor.appendix.querySelector("slot")!).cursor === "default", "canvas camera does not use the arrow cursor")
    assert(view.getComputedStyle(paragraph).cursor === "auto", "canvas text lost its native cursor")
    assert(backgroundCaret && view.getComputedStyle(backgroundCaret).display === "none", "blank canvas shows a background caret")
    assert(view.getComputedStyle(paragraph).caretColor === "rgba(0, 0, 0, 0)", "blank canvas selection paints a caret in positioned text")
    doc.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 2, paragraph.firstChild!, 2)
    await layoutFrame()
    assert(view.getComputedStyle(backgroundCaret!).display === "none", "text selection retains the background caret")
    assert(view.getComputedStyle(paragraph).caretColor !== "rgba(0, 0, 0, 0)", "text selection did not restore its native caret")
    canvasEditor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    const second = doc.querySelectorAll("p")[1]
    await type(second, "Second")
    assert(paragraph.textContent === "Hello world" && second.textContent === "Second", "canvas text is missing")
    assert(Math.abs(paragraph.getBoundingClientRect().left - moved.left) < 1 && Math.abs(paragraph.getBoundingClientRect().top - moved.top) < 1, "typing displaced the initial canvas item")
    canvasEditor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    const empty = doc.body.lastElementChild!
    empty.append(doc.createElement("br"))
    await layoutFrame()
    assert(empty.isConnected && empty.contains(doc.getSelection()!.anchorNode), "the active empty paragraph was removed")
    doc.getSelection()!.setBaseAndExtent(second.firstChild!, 2, second.firstChild!, 2)
    await layoutFrame()
    assert(!empty.isConnected, "the empty canvas paragraph survived losing focus")
    assert(doc.querySelectorAll("p").length === 2 && doc.getSelection()!.anchorNode === second.firstChild
      && doc.getSelection()!.anchorOffset === 2, "empty paragraph cleanup changed the new editing position")
    canvasEditor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    const nextEmpty = doc.body.lastElementChild!
    canvasEditor.features.selection.selectElement(paragraph)
    await layoutFrame()
    assert(!nextEmpty.isConnected && canvasEditor.features.transformation.target === paragraph,
      "cleanup disturbed the newly selected element's move controls")
    canvasEditor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
    for(const x of [10, doc.documentElement.clientWidth - 10]) {
      canvasEditor.features.selection.selectElement(paragraph)
      const y = doc.documentElement.clientHeight - 150
      const hit = canvasEditor.appendix.elementFromPoint(x, y) ?? doc.elementFromPoint(x, y)!
      const slot = canvasEditor.appendix.querySelector<HTMLSlotElement>("slot")!
      assert(hit === slot || hit === doc.body || hit === doc.documentElement, "background test point hits authored content")
      const camera = slot.style.transform
      const down = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 41, clientX: x, clientY: y})
      hit.dispatchEvent(down)
      const mouse = new MouseEvent("mousedown", {bubbles: true, composed: true, cancelable: true, button: 0, clientX: x, clientY: y})
      hit.dispatchEvent(mouse)
      hit.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, composed: true, pointerId: 41, clientX: x, clientY: y}))
      hit.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true, detail: 2, clientX: x, clientY: y}))
      await layoutFrame()
      assert(down.defaultPrevented && mouse.defaultPrevented, "blank canvas permits native nearest-text selection")
      assert(doc.getSelection()!.isCollapsed && doc.getSelection()!.anchorNode === doc.body
        && canvasEditor.features.transformation.target === null, "blank canvas selected a nearby item")
      assert(slot.style.transform === camera, "blank canvas click moved the camera")
    }
    const lastEmpty = doc.createElement("p")
    doc.body.replaceChildren(lastEmpty)
    doc.getSelection()!.setBaseAndExtent(lastEmpty, 0, lastEmpty, 0)
    await layoutFrame()
    doc.getSelection()!.setBaseAndExtent(doc.body, 1, doc.body, 1)
    await layoutFrame()
    assert(doc.body.childElementCount === 0, "removing the final empty canvas paragraph inserted a replacement")
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    const saved = document.createElement("iframe")
    saved.setAttribute("sandbox", "allow-same-origin")
    saved.srcdoc = canvasEditor.toHTML()
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once: true}))
    document.body.append(saved)
    try {
      await loaded
      const savedDoc = saved.contentDocument!, savedView = saved.contentWindow!
      const background = savedView.getComputedStyle(savedDoc.documentElement)
      assert(background.backgroundImage.includes("radial-gradient"), "saved canvas lost its dots")
      assert(background.backgroundSize === "20px 20px" && background.backgroundRepeat === "repeat", "saved canvas does not tile its dotted background")
      assert(!saved.contentDocument!.body.shadowRoot, "saved canvas background depends on editor UI")
      assert(savedView.getComputedStyle(savedDoc.body).backgroundColor === "rgba(0, 0, 0, 0)", "canvas body obscures the viewport dots")
      const item = savedDoc.createElement("p")
      item.textContent = "Canvas content"
      item.style.cssText = "position:absolute;left:20px;top:20px;width:120px;margin:0"
      savedDoc.body.append(item)
      for(const [width, height] of [[400, 300], [1500, 900]]) {
        saved.style.cssText = `width:${width}px;height:${height}px;border:0`
        await layoutFrame()
        const root = savedDoc.documentElement
        assert(root.scrollWidth === root.clientWidth && root.scrollHeight === root.clientHeight, "fitting canvas content creates unnecessary scrolling")
        const body = savedDoc.body.getBoundingClientRect()
        assert(body.left === 0 && body.top === 0 && body.width === root.clientWidth && body.height >= root.clientHeight, "canvas retains page margins or fixed dimensions")
        item.style.left = `${width + 100}px`
        item.style.top = `${height + 100}px`
        await layoutFrame()
        assert(root.scrollWidth >= width + 220 && root.scrollHeight > height + 100, "canvas clips overflowing content")
        savedView.scrollTo(root.scrollWidth, root.scrollHeight)
        assert(savedView.scrollX > 0 && savedView.scrollY > 0, "overflowing canvas content is not scrollable")
        item.style.left = item.style.top = "20px"
        savedView.scrollTo(0, 0)
      }
      savedDoc.body.classList.remove("ww-canvas")
      assert(!savedView.getComputedStyle(savedDoc.documentElement).backgroundImage.includes("radial-gradient"), "document mode retains canvas dots")
    }
    finally { saved.remove() }
    doc.body.innerHTML = '<p style="position:absolute;left:-400px;top:-300px;width:200px">Exported canvas</p>'
    savedCanvasHTML = await canvasEditor.serializeHTML(true)
  }
  finally { canvasEditor?.destroy(); frame.remove() }
})

await check("hotspot popovers use grey editing placeholders and compact controls", async () => {
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:450px;max-width:none"
  frame.srcdoc = '<!doctype html><body><img src="/tests/fixtures/image-map.svg" width="360" height="210" usemap="#plan"><map name="plan"><area shape="rect" coords="500,40,680,340"></map><script type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  const toolbox = new DomEditorToolbox()
  toolbox.style.width = "300px"
  toolbox.activeTool = "Edit"; toolbox.activeMenu = "Edit"
  fixture.append(toolbox)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "hotspot editor fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, image = doc.querySelector("img")!
    editor.features.selection.captureElement(image)
    const area = editor.features.media.getState()!.imageMap!.areas[0]
    editor.features.media.actions.addImageMapPopover({type:"addImageMapPopover", path:area.path, expected:area.attributes})
    await layoutFrame()
    const paragraph = doc.querySelector("[popover] p")!
    const hint = view.getComputedStyle(paragraph, "::before")
    assert(hint.content === '"Hotspot content"' && hint.visibility === "visible" && hint.color === "rgb(169, 169, 169)", "empty hotspot placeholder is not visible grey text")
    assert(paragraph.textContent === "" && !editor.toHTML(true).includes("Hotspot content"), "placeholder text leaked into authored HTML")
    toolbox.media = {type:"img", attributes:{}, imageMap:{name:"plan", shared:false, areas:[{path:area.path, attributes:{shape:"rect", coords:"500,40,680,340", popovertarget:"details"}}]}}
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[data-specialized="img"]')!
    drawer.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show advanced image controls"]')!.click()
    await layoutFrame()
    assert(!toolbox.shadowRoot!.querySelector('[aria-label="Hotspot: Link URL"]'), "popover still exposes its Link URL")
    assert(!toolbox.shadowRoot!.querySelector('[aria-label="Open hotspot 1 popover"]'), "popover still exposes an Open button")
    const border = toolbox.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Hotspot: Border"]')!
    const background = toolbox.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Hotspot: Background"]')!
    assert(border?.checked && background?.checked, "overlay visibility checkboxes are not enabled by default")
    const borderBox = border.parentElement!.getBoundingClientRect(), backgroundBox = background.parentElement!.getBoundingClientRect()
    assert(borderBox.width > 0 && Math.abs(borderBox.top - backgroundBox.top) < 1 && backgroundBox.left > borderBox.right,
      "Border and Background do not share one row")
    assert(background.getBoundingClientRect().right <= toolbox.getBoundingClientRect().right, "hotspot checkbox overflows its controls")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove(); toolbox.remove() }
})

await check("image hotspots scale and open popovers in preview and standalone reading mode", async () => {
  const {appendSerializedAssets} = await import("../src/serialization")
  const {previewFrameHTML} = await import("../src/frame-document")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:500px;max-width:none"
  fixture.append(frame)
  try {
    for(const preview of [true, false]) {
      const source = new DOMParser().parseFromString('<html><body><img src="/tests/fixtures/image-map.svg" width="360" height="210" usemap="#plan"><map name="plan"><span><!--keep--><area shape="rect" coords="500,40,680,340" href="#details" popovertarget="details" alt="Details"></span><area shape="circle" coords="100,100,40" href="#link" alt="Link"></map><div id="details" popover="auto">Hotspot content</div><p id="link">Link destination</p></body></html>', "text/html")
      const authored = source.body.innerHTML
      let html: string
      if(preview) html = previewFrameHTML(source, {bridgeNonce:"hotspot-check", hostOrigin:location.origin, frameOrigin:location.origin,
        entryURL:new URL("../src/preview-entry.ts", import.meta.url).href, packages:[], importMap:null, executeScripts:true})
      else { appendSerializedAssets(source, []); html = source.documentElement.outerHTML }
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once:true}))
      frame.srcdoc = html
      await loaded
      await layoutFrame()
      const doc = frame.contentDocument!, view = frame.contentWindow! as Window & typeof globalThis
      const image = doc.querySelector("img")!
      assert(image.naturalWidth === 720, "image fixture did not load at its intrinsic size")
      const root = doc.body.shadowRoot!.querySelector(".◆image-map-reader")!.shadowRoot!
      for(const width of [360, 180]) {
        image.width = width
        await layoutFrame()
        const box = image.getBoundingClientRect()
        const svg = root.querySelector("svg")!
        assert(Math.abs(svg.getBoundingClientRect().width - box.width) < 1, "hotspot overlay did not resize with the image")
        const hit = root.elementFromPoint(box.left + 590 * box.width / 720, box.top + 190 * box.height / 420)!
        assert(hit.closest("a")?.getAttribute("aria-label") === "Details", "scaled hotspot is not the pointer hit target")
        hit.dispatchEvent(new view.MouseEvent("click", {bubbles:true, composed:true, cancelable:true}))
        const popover = doc.querySelector<HTMLElement>("#details")!
        assert(popover.matches(":popover-open"), "reading-mode hotspot did not open its popover")
        assert(popover.getBoundingClientRect().right <= view.innerWidth, "hotspot popover overflowed the viewport")
        popover.hidePopover()
      }
      const area = doc.querySelector("area")!
      for(const part of ["border", "background", "both"]) {
        area.className = part === "both" ? "ww-hotspot-no-border ww-hotspot-no-background" : `ww-hotspot-no-${part}`
        await layoutFrame()
        const hidden = root.querySelector('a[aria-label="Details"] rect')!
        const painted = view.getComputedStyle(hidden)
        assert((painted.stroke === "none") === (part !== "background"), "border visibility did not change independently")
        assert((painted.fill === "rgba(0, 0, 0, 0)") === (part !== "border"), "background visibility did not change independently")
        hidden.dispatchEvent(new view.MouseEvent("click", {bubbles:true, composed:true, cancelable:true}))
        assert(doc.querySelector("#details")!.matches(":popover-open"), "hiding overlay decoration disabled its popover")
        doc.querySelector<HTMLElement>("#details")!.hidePopover()
      }
      area.removeAttribute("class")
      await layoutFrame()
      const link = root.querySelector('a[aria-label="Link"]')!
      assert(link?.getAttribute("href") === "#link", "link-only hotspot was lost")
      link.dispatchEvent(new view.MouseEvent("click", {bubbles:true, composed:true, cancelable:true}))
      await layoutFrame()
      assert(view.location.hash === "#link", "link-only hotspot did not navigate to its destination")
      image.width = 360
      doc.body.style.minHeight = "1200px"
      view.scrollTo(0, 80)
      await layoutFrame()
      const overlay = root.querySelector("svg")!, scrolled = image.getBoundingClientRect()
      assert(!overlay.style.left && !overlay.style.top, "ordinary hotspot shell still uses measured coordinates")
      assert(Math.abs(overlay.getBoundingClientRect().top - scrolled.top) < 1
        && Math.abs(overlay.getBoundingClientRect().left - scrolled.left) < 1, "hotspot shell lost its image during scrolling")
      assert(cloneWithoutEditorMarkers(doc.body, true).innerHTML === authored, "reading-mode hotspot UI changed the authored DOM")
    }
  }
  finally { frame.remove() }
})

await check("canvas hotspot clicks preserve the camera in preview and standalone reading mode", async () => {
  const {appendSerializedAssets} = await import("../src/serialization")
  const {previewFrameHTML} = await import("../src/frame-document")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:500px;max-width:none"
  fixture.append(frame)
  try {
    for(const preview of [true, false]) {
      const source = new DOMParser().parseFromString(`<!doctype html><style>${canvasStyles}</style><body class="ww-canvas"><img src="/tests/fixtures/image-map.svg" width="360" height="210" style="position:absolute;left:200px;top:150px" usemap="#plan"><map name="plan"><area shape="rect" coords="500,40,680,340" popovertarget="details" alt="Details"></map><div id="details" popover="auto">Hotspot content</div></body>`, "text/html")
      let html: string
      if(preview) html = previewFrameHTML(source, {bridgeNonce:"canvas-hotspot-check", hostOrigin:location.origin, frameOrigin:location.origin,
        entryURL:new URL("../src/preview-entry.ts", import.meta.url).href, packages:[], importMap:null, executeScripts:true})
      else { appendSerializedAssets(source, []); html = source.documentElement.outerHTML }
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once:true}))
      frame.srcdoc = html
      await loaded
      await layoutFrame()
      const doc = frame.contentDocument!, view = frame.contentWindow! as Window & typeof globalThis
      const image = doc.querySelector("img")!
      assert(image.naturalWidth === 720, "canvas image fixture did not load")
      const appendix = doc.body.shadowRoot!, slot = appendix.querySelector("slot")!
      const root = appendix.querySelector(".◆image-map-reader")!.shadowRoot!
      const link = root.querySelector<SVGAElement>('a[aria-label="Details"]')!
      const camera = slot.style.transform, before = image.getBoundingClientRect(), authored = doc.body.innerHTML
      const hotspot = link.getBoundingClientRect()
      const point = {clientX:hotspot.left + 4, clientY:hotspot.top + 4}
      const down = root.elementFromPoint(point.clientX, point.clientY)!
      assert(down.closest<SVGAElement>("a") === link, "canvas hotspot is not the initial pointer target")
      down.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles:true, composed:true, cancelable:true, button:0, ...point}))
      // A dispatched click alone skips the native focus that caused #288.
      link.focus()
      assert(root.activeElement === link && doc.activeElement === doc.body, "hotspot focus was not retargeted through the appendix")
      await layoutFrame()
      const after = image.getBoundingClientRect()
      assert(slot.style.transform === camera && after.left === before.left && after.top === before.top,
        "focusing the canvas hotspot moved the camera before pointerup")
      const up = root.elementFromPoint(point.clientX, point.clientY)!
      assert(up.closest<SVGAElement>("a") === link, "canvas hotspot moved away from the pointer")
      up.dispatchEvent(new view.PointerEvent("pointerup", {bubbles:true, composed:true, cancelable:true, button:0, ...point}))
      up.dispatchEvent(new view.MouseEvent("click", {bubbles:true, composed:true, cancelable:true, button:0, ...point}))
      assert(doc.querySelector("#details")!.matches(":popover-open"), "canvas hotspot click did not open its popover")
      assert(slot.style.transform === camera, "opening the canvas hotspot popover moved the camera")
      assert(doc.body.innerHTML === authored, "canvas hotspot interaction changed authored content")
    }
  }
  finally { frame.remove() }
})

await check("exported canvas runs its standalone viewer without editor dependencies", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px;border:0"
  frame.srcdoc = savedCanvasHTML
  const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
  document.body.append(frame)
  try {
    await loaded
    const doc = frame.contentDocument!, view = frame.contentWindow!
    const appendix = doc.body.shadowRoot!
    assert(appendix, "export did not initialize its reader")
    assert(!doc.querySelector('script[src]'), "reader depends on an external script")
    const item = doc.body.querySelector("p")!, original = item.outerHTML
    const rect = item.getBoundingClientRect()
    assert(rect.left >= 0 && rect.top >= 0 && rect.right < 900, "reader did not fit negative canvas coordinates")
    assert(Math.abs((rect.left + rect.right) / 2 - view.innerWidth / 2) < 1
      && Math.abs((rect.top + rect.bottom) / 2 - view.innerHeight / 2) < 1, "reader did not center fitted content")
    const slot = appendix.querySelector("slot")!
    const before = slot.style.transform
    appendix.querySelector<HTMLButtonElement>('button[name="zoom-in"]')!.click()
    assert(slot.style.transform !== before && appendix.querySelector("output")!.textContent === "120%", "reader zoom control did not move the camera")
    const zoomed = slot.style.transform
    slot.dispatchEvent(new WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaY: 100}))
    assert(slot.style.transform !== zoomed, "reader did not pan with the wheel")
    appendix.querySelector<HTMLButtonElement>('button[name="fit-content"]')!.click()
    const fitted = item.getBoundingClientRect()
    assert(Math.abs((fitted.left + fitted.right) / 2 - view.innerWidth / 2) < 1
      && Math.abs((fitted.top + fitted.bottom) / 2 - view.innerHeight / 2) < 1, "Fit did not recenter content after panning and zooming")
    assert(item.outerHTML === original, "reader changed authored placement")
    assert(!appendix.querySelector('button[name="text"]'), "reader exposes editing controls")
    assert(view.getComputedStyle(doc.documentElement).overflow === "clip", "reader viewport is not clipped")
    doc.body.classList.remove("ww-canvas")
    await new Promise(resolve => setTimeout(resolve, 0))
    assert(!appendix.querySelector("[part=canvas-controls]") && !doc.documentElement.classList.contains("◆canvas-active"), "reader did not clean up after a mode change")
  }
  finally { frame.remove() }
})

for(const mode of ["canvas", "slides"] as const) await check(`paragraphs grow with content and retain explicit sizes in ${mode}`, async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = '<!doctype html><body><p>Short</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "paragraph fixture did not initialize")
    const doc = frame.contentDocument!, theme = doc.createElement("style"), paragraph = doc.querySelector("p")!
    theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    assert(view.editor!.setDocumentLayout(mode, "document"), "paragraph fixture did not convert")
    if(mode === "canvas") view.editor!.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
    await layoutFrame()
    const short = paragraph.getBoundingClientRect()
    paragraph.textContent = "A longer paragraph that grows as its content changes"
    await layoutFrame()
    const long = paragraph.getBoundingClientRect()
    assert(long.width > short.width * 2 && Math.abs(long.height - short.height) < 1, "unsized paragraph did not grow horizontally")
    paragraph.append(doc.createElement("br"), "Another line")
    await layoutFrame()
    assert(paragraph.getBoundingClientRect().height > long.height, "unsized paragraph did not grow vertically")
    doc.documentElement.style.fontSize = "32px"
    const padding = view.getComputedStyle(paragraph)
    assert([padding.paddingTop, padding.paddingRight, padding.paddingBottom, padding.paddingLeft].every(value => value === "2px"), "paragraph padding is not fixed at 2px")
    paragraph.style.width = "140px"
    await layoutFrame()
    assert(Math.abs(parseFloat(view.getComputedStyle(paragraph).width) - 140) < 1 && paragraph.getBoundingClientRect().height > long.height, "explicit paragraph width did not wrap content")
    paragraph.style.height = "90px"
    assert(Math.abs(parseFloat(view.getComputedStyle(paragraph).height) - 90) < 1, "explicit paragraph height was overridden")
    paragraph.style.width = ""; paragraph.style.height = ""; paragraph.style.inlineSize = "160px"
    assert(Math.abs(parseFloat(view.getComputedStyle(paragraph).width) - 160) < 1, "explicit logical paragraph size was overridden")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("Board columns and cards retain native editing and standalone layout", async () => {
  const checkOverflow = async (doc: Document) => {
    // Force classic scrollbars so macOS overlay scrollbars cannot mask the regression.
    const style = doc.createElement("style")
    style.textContent = "::-webkit-scrollbar { width: 16px; height: 16px; }"
    doc.head.append(style)
    try {
      await layoutFrame()
      const root = doc.documentElement
      assert(root.scrollWidth > root.clientWidth, "wide board lost horizontal scrolling")
      assert(root.scrollHeight === root.clientHeight, "horizontal scrollbar caused vertical board overflow")
      assert(root.getBoundingClientRect().width === doc.defaultView!.innerWidth, "unused scrollbar gutter clipped the right edge of the board")
      const card = doc.querySelector<HTMLElement>(".ww-board-card")!
      const content = doc.createElement("div")
      content.style.height = "1000px"
      card.append(content)
      await layoutFrame()
      assert(root.scrollHeight > root.clientHeight, "tall board content lost vertical scrolling")
      content.remove()
      await layoutFrame()
      assert(root.scrollHeight === root.clientHeight, "board retained vertical overflow after tall content was removed")
    }
    finally { style.remove() }
  }
  const {render, html} = await import("lit")
  const {documentLayoutPreviewStyles, renderDocumentLayoutPreview} = await import("../src/components/layout-preview")
  const hero = document.createElement("div")
  hero.style.width = "160px"
  const shadow = hero.attachShadow({mode: "open"})
  render(html`<style>${documentLayoutPreviewStyles.cssText}</style>${renderDocumentLayoutPreview("board")}`, shadow)
  fixture.append(hero)
  await layoutFrame()
  const heroColumns = Array.from(shadow.querySelectorAll<HTMLElement>(".board-column"))
  assert(heroColumns.length === 3 && heroColumns.every(column => column.getBoundingClientRect().width > 35), "Board hero columns shrank to thin strips")
  const heroHeights = new Set(Array.from(shadow.querySelectorAll<HTMLElement>(".board-card"), card => card.getBoundingClientRect().height))
  assert(heroHeights.size === 3 && shadow.querySelectorAll(".layout-preset-line").length > 15 && shadow.querySelector(".mock-image"), "Board hero lacks varied cards and skeleton content")
  for(const width of [120, 90, 160]) {
    hero.style.width = `${width}px`
    await layoutFrame()
    const visible = heroColumns.filter(column => getComputedStyle(column).display !== "none")
    assert(visible.length === (width < 160 ? 2 : 3), `Board hero did not adapt its column count at ${width}px: ${visible.length} columns, preview=${shadow.querySelector(".board")!.getBoundingClientRect().width}px, container=${getComputedStyle(shadow.querySelector(".board")!).container}`)
    assert(visible.every(column => column.getBoundingClientRect().width > 30), "compact Board hero columns shrank to thin strips")
    assert(visible.every(column => Math.abs(column.getBoundingClientRect().top - visible[0].getBoundingClientRect().top) < 1), "Board hero columns wrapped")
    assert(shadow.querySelector(".board")!.scrollWidth <= shadow.querySelector(".board")!.clientWidth, "Board hero overflowed")
  }
  hero.remove()
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = '<!doctype html><body><p>First card</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "board fixture did not initialize")
    const editor = view.editor!, board = editor.features.board, doc = frame.contentDocument!
    const theme = doc.createElement("style"); theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    assert(editor.setDocumentLayout("board", "document"), "board did not convert")
    await layoutFrame(); board.refresh()
    const initialColumn = board.columns()[0].getBoundingClientRect()
    const initialAddColumn = editor.appendix.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!.getBoundingClientRect()
    assert(Math.abs(initialAddColumn.left - initialColumn.right - parseFloat(view.getComputedStyle(doc.body).columnGap)) < .5, "add-column slot drifted to the viewport edge on a narrow board")
    for(const [intoColumn, offset] of [[false, 0], [false, 5], [true, 10]] as const) {
      const source = board.cards(board.columns()[0])[0], text = source.querySelector("p")!.firstChild!
      doc.getSelection()!.collapse(text, offset)
      source.dispatchEvent(new (view as Window & typeof globalThis).KeyboardEvent("keydown", {key: "Enter", ctrlKey: !intoColumn, metaKey: intoColumn, shiftKey: intoColumn, bubbles: true, cancelable: true}))
      await layoutFrame()
      const splitColumns = board.columns(), rightCard = intoColumn ? board.cards(splitColumns[1])[0] : board.cards(splitColumns[0])[1]
      assert(source.textContent === "First card".slice(0, offset) && rightCard.textContent === "First card".slice(offset), "board shortcut did not split content at the caret")
      assert(source.querySelector("p") && rightCard.querySelector("p"), "board split left a card without a paragraph")
      assert(splitColumns.length === (intoColumn ? 2 : 1), "board shortcut split into the wrong container")
      editor.doc.undo(); await layoutFrame()
      assert(board.columns().length === 1 && board.cards(board.columns()[0]).length === 1 && board.cards(board.columns()[0])[0].textContent === "First card", "board shortcut split did not undo in one step")
    }
    board.addColumn(); await layoutFrame(); board.refresh()
    const emptyColumn = board.columns().at(-1)!
    const emptyAdd = editor.appendix.querySelector<HTMLButtonElement>('[aria-label="Add card to column 2"]')!
    const emptyAddBox = emptyAdd.getBoundingClientRect()
    emptyAdd.click(); await layoutFrame()
    const newCard = board.cards(emptyColumn)[0], newCardBox = newCard.getBoundingClientRect()
    assert(Math.abs(emptyAddBox.top - newCardBox.top) < .5 && Math.abs(emptyAddBox.left - newCardBox.left) < .5 && Math.abs(emptyAddBox.width - newCardBox.width) < .5, "first-card slot did not match the inserted card in a minimum-height column")
    board.removeCard(newCard)
    board.addColumn(); board.addColumn()
    const columns = board.columns()
    columns.forEach((column, i) => {
      column.querySelector("h2")!.textContent = `Column ${i + 1}`
      board.addCard(column); board.addCard(column)
    })
    await layoutFrame()
    const rects = columns.map(column => column.getBoundingClientRect())
    assert(rects.every(rect => Math.abs(rect.width - 450) < .5), "default board columns were not 450px wide")
    editor.features.selection.selectElement(columns[0])
    const setColumnWidth = (width: string) => editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {width}})
    setColumnWidth("300px"); await layoutFrame()
    assert(Math.abs(columns[0].getBoundingClientRect().width - 300) < .5, "Element width did not resize the board column")
    columns[0].style.maxWidth = "300px" // The resize handle also writes a matching cap.
    setColumnWidth("520px"); await layoutFrame()
    assert(Math.abs(columns[0].getBoundingClientRect().width - 520) < .5, "Element width did not resize a previously dragged column")
    setColumnWidth(""); await layoutFrame()
    assert(Math.abs(columns[0].getBoundingClientRect().width - 450) < .5, "clearing Element width did not restore the board default")
    assert(rects.every((rect, i) => !i || rect.left > rects[i - 1].right), "columns did not grow horizontally")
    assert(doc.documentElement.scrollWidth > frame.clientWidth, "board did not overflow horizontally")
    await checkOverflow(doc)
    for(const column of columns.slice(1)) {
      const heading = column.querySelector("h2")!
      heading.scrollIntoView({block: "nearest", inline: "center"})
      await layoutFrame()
      const box = heading.getBoundingClientRect()
      const pointer = {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 266, clientX: box.left + 12, clientY: box.top + box.height / 2}
      heading.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerdown", {...pointer, ctrlKey: true, metaKey: true}))
      const selection = doc.getSelection()!
      assert(selection.anchorNode === column && column.childNodes[selection.anchorOffset] === heading
        && selection.focusNode === column && selection.focusOffset === selection.anchorOffset + 1,
      "selecting a later column heading as an element moved selection to another column")
      heading.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerdown", pointer))
      heading.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerup", pointer))
      await layoutFrame()
      assert(heading.contains(doc.getSelection()!.anchorNode), "clicking a later column heading moved selection to another column")
      const otherHeadings = columns.filter(other => other !== column).map(other => other.querySelector("h2")!.textContent)
      assert(doc.execCommand("insertText", false, "Edited "), "column heading did not accept typing")
      assert(heading.textContent!.includes("Edited "), "typing did not change the clicked column heading")
      assert(columns.filter(other => other !== column).every((other, i) => other.querySelector("h2")!.textContent === otherHeadings[i]), "typing changed another column heading")
    }
    for(const column of columns) {
      const cards = board.cards(column).map(card => card.getBoundingClientRect())
      assert(cards.every((rect, i) => !i || rect.top > cards[i - 1].bottom), "cards did not stack vertically")
      assert(cards.every(rect => rect.left >= column.getBoundingClientRect().left && rect.right <= column.getBoundingClientRect().right), "card escaped column")
    }
    view.scrollTo(0, 0); await layoutFrame()
    const first = columns[0], card = board.cards(first)[0], paragraph = card.querySelector("p")!
    assert(view.getComputedStyle(card).paddingTop === "12px", "board card padding was not reduced to 12px")
    const selection = doc.getSelection()!
    view.scrollTo(120, 0); await layoutFrame()
    const scrollBefore = {x: view.scrollX, y: view.scrollY}
    first.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    await layoutFrame()
    assert(first.classList.contains("◆element-selected") && board.transformOverlay(first), "column background click did not select the column")
    assert(view.scrollX === scrollBefore.x && view.scrollY === scrollBefore.y, "column background click scrolled the column into view")
    assert(view.getComputedStyle(first).cursor === "pointer" && view.getComputedStyle(paragraph).cursor !== "pointer", "column background cursor leaked into card contents")
    view.scrollTo(0, 0); await layoutFrame()
    editor.features.selection.selectElement(first)
    assert(first.classList.contains("◆element-selected") && selection.getRangeAt(0).startContainer === doc.body, "column selection did not select the container")
    assert(view.getComputedStyle(first).userSelect !== "none" && view.getComputedStyle(paragraph).userSelect !== "none", "column selection disabled authored text selection")
    assert(Array.from(editor.appendix.querySelectorAll('[part=board-actions] button')).every(button => view.getComputedStyle(button).userSelect === "none"), "board add-button labels remained selectable")
    assert(view.getComputedStyle(paragraph, "::selection").backgroundColor === "rgba(0, 0, 0, 0)", "column selection painted descendant text")
    selection.collapse(paragraph.firstChild!, 5)
    editor.features.selection.processSelection(false, {scrollIntoView: false})
    assert(!first.classList.contains("◆element-selected") && view.getComputedStyle(paragraph).userSelect !== "none", "column selection suppression leaked into card text editing")
    assert(doc.execCommand("insertText", false, " new"), "native card typing failed")
    assert(paragraph.textContent === "First new card", "native card typing changed structure")
    paragraph.dispatchEvent(new (view as Window & typeof globalThis).KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    assert(card.querySelectorAll("p").length === 2, "Enter did not stay inside the card")
    board.refresh(); await layoutFrame()
    const add = editor.appendix.querySelector<HTMLButtonElement>('[aria-label="Add card to column 1"]')!
    const addBox = add.getBoundingClientRect(), lastCardBox = board.cards(first).at(-1)!.getBoundingClientRect()
    const firstStyle = view.getComputedStyle(first), addStyle = view.getComputedStyle(add)
    assert(Math.abs(addBox.left - lastCardBox.left) < .5 && Math.abs(addBox.width - lastCardBox.width) < .5, `add-card slot did not match card edges: ${JSON.stringify({connected: add.isConnected, add: addBox.toJSON(), card: lastCardBox.toJSON()})}`)
    assert(Math.abs(addBox.top - lastCardBox.bottom - parseFloat(firstStyle.rowGap)) < .5, "add-card slot did not follow the last card")
    assert(addStyle.borderTopStyle === "dashed" && addStyle.backgroundColor === "rgba(0, 0, 0, 0)", "add-card slot lost transparent dashed styling")
    const lastColumn = columns.at(-1)!, lastColumnBox = lastColumn.getBoundingClientRect()
    view.scrollTo(doc.documentElement.scrollWidth, 0); await layoutFrame(); board.refresh(); await layoutFrame()
    const addColumn = editor.appendix.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!
    const addColumnBox = addColumn.getBoundingClientRect(), scrolledLastColumnBox = lastColumn.getBoundingClientRect()
    assert(!addColumn.hidden && Math.abs(addColumnBox.left - scrolledLastColumnBox.right - parseFloat(view.getComputedStyle(doc.body).columnGap)) < .5, `add-column slot was clipped or misplaced: ${JSON.stringify({connected: addColumn.isConnected, hidden: addColumn.hidden, add: addColumnBox.toJSON(), column: scrolledLastColumnBox.toJSON()})}`)
    assert(Math.abs(addColumnBox.width - lastColumnBox.width) < .5 && Math.abs(addColumnBox.top - scrolledLastColumnBox.top) < .5 && addColumnBox.height === 160, "add-column slot did not match a new empty column")
    view.scrollTo(0, 0); await layoutFrame(); board.refresh()
    add.click(); await layoutFrame()
    assert(board.cards(first).length === 4, "column add-card control failed")
    assert(Math.abs(board.cards(first).at(-1)!.getBoundingClientRect().height - addBox.height) < .5, `add-card slot did not match the new empty card height: card=${board.cards(first).at(-1)!.getBoundingClientRect().height}, slot=${addBox.height}`)
    assert(doc.querySelector("[part=board-actions], button") === null, "board UI leaked into authored content")
    const drag = async (label: string, x: number, y: number) => {
      const cardMatch = /^Drag card (\d+) in column (\d+)$/.exec(label), columnMatch = /^Drag column (\d+)$/.exec(label)
      const column = board.columns()[Number(cardMatch?.[2] ?? columnMatch?.[1]) - 1]
      const target = cardMatch ? board.cards(column)[Number(cardMatch[1]) - 1] : column
      if(!target.contains(selection.anchorNode)) selection.collapse(target.firstElementChild!, 0)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      board.refresh()
      const grip = board.transformOverlay(target)!.querySelector<HTMLButtonElement>('[part~="transform-overlay-mover"]')!
      assert(grip?.draggable && doc.querySelector("[draggable]") === null, "Board drag handle missing or leaked into authored DOM")
      const win = view as Window & typeof globalThis, data = new win.DataTransfer()
      const start = new win.DragEvent("dragstart", {bubbles: true, composed: true, cancelable: true, dataTransfer: data})
      grip.dispatchEvent(start)
      assert(!start.defaultPrevented && !!data.getData("application/x-webwriter-board") && !!doc.querySelector(".◆board-dragging"), `native Board drag failed to start: prevented=${start.defaultPrevented}, effect=${data.effectAllowed}, token=${data.getData("application/x-webwriter-board")}, marked=${!!doc.querySelector(".◆board-dragging")}, connected=${grip.isConnected}`)
      const over = new win.DragEvent("dragover", {bubbles: true, composed: true, cancelable: true, dataTransfer: data, clientX: x, clientY: y})
      doc.body.dispatchEvent(over)
      assert(over.defaultPrevented && !editor.appendix.querySelector<HTMLElement>("[part=board-drop-indicator]")!.hidden, "Board did not show an insertion target")
      doc.body.dispatchEvent(new win.DragEvent("drop", {bubbles: true, composed: true, cancelable: true, dataTransfer: data, clientX: x, clientY: y}))
      await layoutFrame()
      assert(doc.querySelector(".◆board-dragging") === null, "Board drag marker leaked after drop")
    }
    await drag("Drag card 1 in column 1", first.getBoundingClientRect().left + 60, first.getBoundingClientRect().bottom - 10)
    assert(board.cards(first).at(-1) === card, "native card drag did not reorder vertically")
    const second = columns[1], secondRect = second.getBoundingClientRect()
    await drag("Drag card 4 in column 1", secondRect.left + 60, secondRect.top + 70)
    assert(board.cards(second)[0] === card && board.cards(first).length === 3, "native card drag did not move between columns")
    await drag("Drag column 1", second.getBoundingClientRect().right - 1, secondRect.top + 20)
    assert(board.columns()[0] === second && board.columns()[1] === first, "native column drag did not reorder horizontally")
    selection.collapse(card.querySelector("p")!, 0)
    editor.features.selection.processSelection(false, {scrollIntoView: false})
    const cardOverlay = board.transformOverlay(card)!
    assert(cardOverlay && !board.transformOverlay(second), "Board card selection did not show only card controls")
    assert(!cardOverlay.part.contains("transform-overlay-board-selected"), "Board content selection retained element selection styling")
    const grey = view.getComputedStyle(cardOverlay).getPropertyValue("--sl-color-gray-400").trim() || "#94a3b8"
    assert(view.getComputedStyle(cardOverlay).getPropertyValue("--ww-transform-color").trim() === grey, "Board content controls did not use light grey")
    paragraph.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerover", {bubbles: true}))
    board.refresh()
    assert(view.getComputedStyle(cardOverlay).getPropertyValue("--ww-transform-color").trim() === grey, "Background hover changed board affordance colors")
    editor.features.selection.actions.hoverNode({type: "hoverNode", path: pathFromNode(doc.body, card)!})
    await layoutFrame(); board.refresh()
    assert(view.getComputedStyle(cardOverlay).getPropertyValue("--ww-transform-color") === view.getComputedStyle(editor.features.transformation.overlay).getPropertyValue("--ww-transform-color"), "Breadcrumb or outline card hover did not turn controls light blue")
    assert(view.getComputedStyle(editor.features.selection.hoverCaret!).display === "none", "Board card hover showed a duplicate smaller outline")
    editor.features.selection.actions.hoverNode({type: "hoverNode", path: null})
    await layoutFrame(); board.refresh()
    paragraph.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerout", {bubbles: true, relatedTarget: doc.body}))
    board.refresh()
    assert(view.getComputedStyle(cardOverlay).getPropertyValue("--ww-transform-color").trim() === grey, "Board card controls did not return to grey after hover")
    assert(!editor.appendix.querySelector('[aria-label^="Drag "], [aria-label^="Remove "], [aria-label="Move card up"]'), "Old Board controls remain")
    const mover = cardOverlay.querySelector('[part~="transform-overlay-mover"]')!
    assert([mover, cardOverlay.querySelector('[part~="transform-overlay-delete"]')!].every(control => view.getComputedStyle(control).borderTopStyle === "dotted"), "Board grey affordance borders were not dotted")
    assert(view.getComputedStyle(cardOverlay).outlineStyle === "dotted" && view.getComputedStyle(cardOverlay).outlineWidth === "2px", "Board card content selection lost its grey dotted outline")
    assert(view.getComputedStyle(cardOverlay.querySelector('[part~="transform-overlay-scale"]')!).getPropertyValue("--ww-transform-color") === view.getComputedStyle(mover).getPropertyValue("--ww-transform-color"), "Board resize did not match its move control")
    editor.features.selection.selectElement(card)
    assert(board.transformOverlay(card)!.part.contains("transform-overlay-board-selected"), "Board card element selection lost blue controls")
    assert([mover, cardOverlay.querySelector('[part~="transform-overlay-delete"]')!].every(control => view.getComputedStyle(control).borderTopStyle === "dotted"), "Board blue affordance borders were not dotted")
    assert(view.getComputedStyle(cardOverlay).getPropertyValue("--ww-transform-color") === view.getComputedStyle(editor.features.transformation.overlay).getPropertyValue("--ww-transform-color"), "Board element controls did not use the standard active blue")
    assert(view.getComputedStyle(cardOverlay).outlineStyle === "dotted" && view.getComputedStyle(cardOverlay).outlineWidth === "2px", "Board card element selection lost its dotted outline")
    editor.features.selection.selectElement(second)
    const columnOverlay = board.transformOverlay(second)!
    assert(view.getComputedStyle(columnOverlay).outlineStyle === "dotted" && view.getComputedStyle(columnOverlay).getPropertyValue("--ww-transform-color") === view.getComputedStyle(editor.features.transformation.overlay).getPropertyValue("--ww-transform-color"), "Board column element selection lost its blue dotted outline")
    selection.collapse(second.querySelector("h2")!, 0)
    editor.features.selection.processSelection(false, {scrollIntoView: false})
    assert(view.getComputedStyle(columnOverlay).outlineStyle === "dotted" && view.getComputedStyle(columnOverlay).getPropertyValue("--ww-transform-color").trim() === grey, "Board column content editing lost its grey dotted outline")
    editor.features.selection.selectElement(card)
    assert(!board.transformOverlay(second), "Board card element selection retained column controls")
    const resizeTarget = async (target: HTMLElement, dx: number, dy: number) => {
      editor.features.selection.selectElement(target)
      const overlay = board.transformOverlay(target)!, handle = overlay.querySelector<HTMLElement>('[data-transform-mode="scale"]')!
      const bounds = target.getBoundingClientRect(), dot = handle.getBoundingClientRect()
      const x = dot.left + dot.width / 2, y = dot.top + dot.height / 2
      const isCard = target.classList.contains("ww-board-card")
      const outlineStyle = view.getComputedStyle(overlay)
      const outlineCenter = parseFloat(outlineStyle.outlineOffset) + parseFloat(outlineStyle.outlineWidth) / 2
      assert(Math.abs(x - (isCard ? bounds.left + bounds.width / 2 : bounds.right + outlineCenter)) < .5
        && Math.abs(y - (isCard ? bounds.bottom + outlineCenter : bounds.top + bounds.height / 2)) < .5, "Board resize dot is not centered on the dotted outline edge")
      const win = view as Window & typeof globalThis
      // Synthetic pointers cannot acquire native capture; use the shared mouse
      // gesture methods against the board's real handle and rendered geometry.
      handle.addEventListener("mousedown", event => editor.features.transformation.startFlowScale(event, target), {once: true})
      handle.dispatchEvent(new win.MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: x, clientY: y}))
      editor.features.transformation.handleScaleDrag(new win.MouseEvent("mousemove", {buttons: 1, clientX: x + dx, clientY: y + dy}))
      editor.features.transformation.handleScaleEnd()
      const after = target.getBoundingClientRect()
      assert(isCard ? after.height > bounds.height && Math.abs(after.width - bounds.width) < .5
        : after.width > bounds.width && Math.abs(after.height - bounds.height) < .5, "Board resize did not grow on only its permitted axis")
      assert(isCard ? !target.style.width && !target.style.maxWidth : !target.style.height && !target.style.maxHeight, "Board resize wrote dimensions on the other axis")
      editor.doc.undo(); await layoutFrame()
    }
    await resizeTarget(card, 40, 30)
    await resizeTarget(board.columns()[0], 30, 40)
    card.style.height = "230px"
    card.innerHTML = '<p></p><p></p><p><br></p><custom-widget style="display:block;height:48px">Embedded content</custom-widget>'
    await layoutFrame()
    const editorWidgetTop = card.querySelector("custom-widget")!.getBoundingClientRect().top - card.getBoundingClientRect().top
    const saved = await editor.serializeHTML(true)
    const preview = doc.createElement("iframe")
    preview.setAttribute("sandbox", "allow-same-origin")
    preview.style.cssText = "width:900px;height:700px"
    const loaded = new Promise<void>(resolve => preview.addEventListener("load", () => resolve(), {once: true}))
    preview.srcdoc = saved; doc.body.append(preview); await loaded
    const exported = preview.contentDocument!, exportedColumns = Array.from(exported.querySelectorAll(".ww-board-column"))
    assert(exportedColumns.length === 4 && exported.querySelector("[part=board-actions]") === null, "export lost structure or included controls")
    const exportedCard = exported.querySelector<HTMLElement>(".ww-board-card:has(> custom-widget)")!
    assert(exportedCard.querySelectorAll("p").length === 3, "standalone Board lost blank paragraphs")
    const previewWidgetTop = exportedCard.querySelector("custom-widget")!.getBoundingClientRect().top - exportedCard.getBoundingClientRect().top
    assert(Math.abs(editorWidgetTop - previewWidgetTop) < 1, `blank Board lines shifted embedded content in preview: editor=${editorWidgetTop}, preview=${previewWidgetTop}`)
    exportedCard.style.height = ""
    const exportedRects = exportedColumns.map(column => column.getBoundingClientRect())
    assert(exportedRects.every((rect, i) => Math.abs(rect.width - exportedRects[0].width) < 1 && (!i || rect.left > exportedRects[i - 1].right)), "standalone Board layout needs editor code")
    await checkOverflow(exported)
    preview.remove()
    for(const column of board.columns()) assert(board.removeColumn(column), "last board column could not be removed")
    await layoutFrame(); board.refresh()
    assert(board.columns().length === 0, "empty board recreated a column")
    view.scrollTo(0, 0); await layoutFrame(); board.refresh()
    const emptyBoardAdd = editor.appendix.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!
    const emptyBoardBox = emptyBoardAdd.getBoundingClientRect(), bodyStyle = view.getComputedStyle(doc.body)
    assert(!emptyBoardAdd.hidden && Math.abs(emptyBoardBox.left - doc.body.getBoundingClientRect().left - parseFloat(bodyStyle.paddingLeft)) < .5 && emptyBoardBox.width === 450, "empty board lost or misplaced its Add column control")
    emptyBoardAdd.click(); await layoutFrame()
    assert(board.columns().length === 1, "empty board could not add a column")
    board.addCard(board.columns()[0])
    doc.getSelection()!.collapse(board.columns()[0].querySelector("h2")!, 0)
    editor.features.selection.processSelection(false, {scrollIntoView: false})
    const {DomEditor: LayoutHost} = await import("../src/components/dom-editor")
    const layoutHost = new LayoutHost() as unknown as {
      editorDocument: Document; authoredDocumentSnapshot(): string; pristineDocumentLayoutSnapshot(snapshot: string): string | null
    }
    layoutHost.editorDocument = doc
    const emptyBoardSnapshot = layoutHost.pristineDocumentLayoutSnapshot(layoutHost.authoredDocumentSnapshot())
    assert(emptyBoardSnapshot !== null, "empty board could not be recognized as pristine")
    assert(editor.setDocumentLayout("slides", "board"), "empty board could not convert to slides")
    await layoutFrame()
    const convertedSnapshot = layoutHost.authoredDocumentSnapshot(), pristineSlides = layoutHost.pristineDocumentLayoutSnapshot(convertedSnapshot)
    assert(pristineSlides === emptyBoardSnapshot, "empty board-to-slides conversion changed its pristine document snapshot")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("canvas and slide movement follows the dot grid and alignment guides", () => checkLayoutGrid())

await check("slide editing retains text and media selections after focus", checkSlideEditing)

let savedSlidesHTML = ""
await check("CSS Slides use native fragment links while editing", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = `<!doctype html><body><h1>First slide</h1><p>FirstSecond</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>`
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `slide editor did not initialize: ${view.editorError}`)
    const slideEditor = view.editor!, doc = frame.contentDocument!
    const documentGutter = getComputedStyle(doc.body).paddingLeft
    assert(slideEditor.setDocumentLayout("slides", "document"), "slide conversion failed")
    const first = doc.querySelector<HTMLElement>("section.ww-slide")!, text = first.querySelector("p")!.firstChild!
    doc.getSelection()!.setBaseAndExtent(text, 5, text, 5)
    slideEditor.features.manipulation.insert(undefined, 5)
    assert(first.querySelectorAll("p").length === 2 && doc.querySelectorAll("section.ww-slide").length === 1, "Enter split slide boundary")
    slideEditor.features.slides.actions.addSlide({type: "addSlide"})
    const second = doc.querySelectorAll<HTMLElement>("section.ww-slide")[1]
    assert(!second.querySelector("h1, p"), "new slide contains automatic text boxes")
    const heading = doc.createElement("h1"), paragraph = doc.createElement("p")
    heading.textContent = "Second slide"
    heading.style.cssText = "left:20px;top:20px;width:1200px;height:140px"
    paragraph.style.cssText = "left:20px;top:180px"
    second.prepend(heading, paragraph)
    const viewport = doc.querySelector<HTMLElement>(".ww-slides-viewport")!
    viewport.style.scrollBehavior = "auto"
    viewport.scrollLeft = 0
    await layoutFrame()
    const link = doc.querySelectorAll<HTMLAnchorElement>("nav.ww-slides-navigation a")[1]
    link.click()
    await layoutFrame()
    assert(frame.contentDocument === doc, `fragment link replaced the editor document: ${link.href}`)
    assert(viewport.scrollLeft > viewport.clientWidth / 2, `native editor link did not scroll: ${link.href}, scrollLeft=${viewport.scrollLeft}`)
    assert(doc.getSelection()?.isCollapsed && doc.getSelection()?.anchorNode === second.firstElementChild
      && doc.getSelection()?.anchorOffset === 0, "slide navigation did not place a caret at the first text block")
    assert(slideEditor.features.transformation.target === second.firstElementChild && !second.firstElementChild!.classList.contains("◆element-selected"), "slide caret does not show item controls independently of node selection")
    assert(getComputedStyle(slideEditor.features.transformation.overlay).outlineStyle === "dotted", "slide text selection lacks the dotted item outline")
    assert(getComputedStyle(second.firstElementChild!).caretColor !== "rgba(0, 0, 0, 0)", "slide item controls hide the text caret")
    assert(getComputedStyle(second).width === "1280px" && getComputedStyle(second).height === "720px", "slide dimensions depend on the viewport")
    slideEditor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
    assert(Math.abs(second.getBoundingClientRect().width - 1280) < 1, "actual-size slide zoom is incorrect")
    slideEditor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "zoom-in"})
    assert(Math.abs(second.getBoundingClientRect().width - 1536) < 1, "slide zoom does not scale fixed dimensions")
    slideEditor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "fit-content"})
    await layoutFrame()
    dragTextInside(slideEditor, second.firstElementChild as HTMLElement)
    viewport.scrollLeft = 0
    await layoutFrame()
    link.click()
    await layoutFrame()
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "repeated fragment activation did not return to its slide")
    const slideRect = second.getBoundingClientRect(), nav = doc.querySelector<HTMLElement>("nav.ww-slides-navigation")!
    assert(Math.abs(slideRect.width - frame.clientWidth) < 1 && Math.abs(slideRect.width / slideRect.height - 16 / 9) < .01,
      `slide does not fit at 16:9: ${slideRect.width} × ${slideRect.height}`)
    assert(Math.abs(slideRect.top - (frame.clientHeight - slideRect.height) / 2) < 1 && Math.abs(slideRect.left) < 1,
      `slide is not vertically centered: ${JSON.stringify({slide: slideRect.toJSON(), viewport: viewport.getBoundingClientRect().toJSON(), frame: [frame.clientWidth, frame.clientHeight], body: doc.body.getBoundingClientRect().toJSON(), grid: getComputedStyle(doc.body).gridTemplateRows, appendix: Array.from(slideEditor.appendix.children).map(e => [e.localName, getComputedStyle(e).display, getComputedStyle(e).position]), margin: getComputedStyle(second).margin, scroll: [viewport.scrollLeft, viewport.scrollTop]})}`)
    const headingRect = second.querySelector("h1")!.getBoundingClientRect(), paragraphRect = second.querySelector("p")!.getBoundingClientRect()
    for(const item of [second.querySelector("h1")!, second.querySelector("p")!]) {
      assert(getComputedStyle(item).position === "absolute" && (item as HTMLElement).offsetParent === second, "slide box is not positioned relative to the slide")
    }
    assert(Math.abs(headingRect.left - paragraphRect.left) < 1 && paragraphRect.width < headingRect.width
      && paragraphRect.top > headingRect.bottom && paragraphRect.bottom < slideRect.bottom - 20, "authored slide paragraph is not aligned or content sized")
    assert(getComputedStyle(nav).position === "absolute" && nav.getBoundingClientRect().bottom <= frame.clientHeight, "navigation is not overlaid at the bottom")
    assert(Math.abs(nav.getBoundingClientRect().left - 16) < 1, "slides pagination is not left aligned")
    assert(getComputedStyle(second).paddingTop === "20px" && getComputedStyle(second).paddingBottom === "20px"
      && getComputedStyle(second).paddingLeft === documentGutter, "slides do not use normal document spacing")
    doc.documentElement.style.setProperty("--ww-page-gutter", "24px")
    assert(getComputedStyle(second).paddingLeft === "24px" && getComputedStyle(second).paddingRight === "24px", "slides do not follow the document gutter")
    doc.documentElement.style.removeProperty("--ww-page-gutter")
    const actions = slideEditor.appendix.querySelector<HTMLElement>("[part=slide-navigation-actions]")!
    assert(!slideEditor.appendix.querySelector("[part=slide-editing-controls]"), "old editing bar remains")
    const add = actions.querySelector<HTMLButtonElement>('[name="add"]')!
    const close = actions.querySelector<HTMLButtonElement>('[aria-label="Remove slide 2"]')!
    for(const control of [link, second.querySelector<HTMLAnchorElement>(".ww-slide-previous")!, add, close]) {
      assert(getComputedStyle(control).cursor === "pointer", "slide control lacks a pointer cursor")
      assert(getComputedStyle(control).color === "rgb(47, 55, 66)" && getComputedStyle(control).borderTopColor === "rgb(47, 55, 66)", "slide control does not use the ribbon's dark grey")
      assert(!control.draggable, "slide control is draggable")
    }
    await new Promise(resolve => setTimeout(resolve, 250))
    assert(getComputedStyle(link).backgroundColor === "rgb(226, 229, 233)", `active slide bubble is not highlighted: ${getComputedStyle(link).backgroundColor}; ${link.className}; scroll=${viewport.scrollLeft}; native=${CSS.supports("scroll-target-group", "auto")}; animation=${getComputedStyle(link).animationName}; transition=${getComputedStyle(link).transitionDuration}`)
    assert(getComputedStyle(close).visibility === "visible", "active slide remove button is hidden")
    assert(getComputedStyle(actions.querySelector('[aria-label="Remove slide 1"]')!).visibility === "hidden", "inactive slide remove button is visible without hover")
    second.focus({preventScroll: true})
    assert(getComputedStyle(second).outlineStyle === "none", "focused slide still has a focus ring")
    const bubble = link.getBoundingClientRect(), closeRect = close.getBoundingClientRect()
    assert(actions.children.length === 3 && add.getBoundingClientRect().left >= nav.getBoundingClientRect().right, "appendix add affordance is not beside navigation")
    assert(bubble.width === 32 && add.getBoundingClientRect().width === 32 && closeRect.width === 16, "slide control circles are not compact")
    assert(Math.abs(closeRect.left + closeRect.width / 2 - (bubble.right - 4)) < 1 && Math.abs(closeRect.top + closeRect.height / 2 - (bubble.top + 4)) < 1, "remove affordance is not inset into bubble's top right")
    assert(slideEditor.appendix.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2) === close, "bubble remove affordance is not clickable")
    slideEditor.features.selection.actions.selectNode({type: "selectNode", path: [0, 1]})
    viewport.dispatchEvent(new Event("scrollend"))
    await layoutFrame()
    const slideSelection = doc.getSelection()!
    assert(!slideSelection.isCollapsed && slideSelection.anchorNode === viewport && slideSelection.anchorOffset === 1
      && slideSelection.focusNode === viewport && slideSelection.focusOffset === 2, "slide breadcrumb did not retain whole-slide selection")
    second.querySelector<HTMLAnchorElement>(".ww-slide-previous")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft < 1, "previous side arrow did not navigate")
    assert(doc.getSelection()?.anchorNode === first.firstElementChild, "previous arrow left selection in the other slide")
    first.querySelector<HTMLAnchorElement>(".ww-slide-next")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "next side arrow did not navigate")
    const firstContent = second.firstElementChild!, widget = doc.createElement("native-slide-widget")
    second.insertBefore(widget, firstContent)
    slideEditor.features.slides.selectStart(second)
    assert(doc.getSelection()?.anchorNode === second && doc.getSelection()?.anchorOffset === 0,
      "a slide starting with a widget did not receive a gap before the widget")
    widget.remove()
    slideEditor.features.slides.selectStart(second)
    actions.querySelector<HTMLButtonElement>('[name="add"]')!.click()
    await layoutFrame()
    assert(doc.querySelectorAll("section.ww-slide").length === 3, "navigation add affordance failed")
    const third = doc.querySelectorAll<HTMLElement>("section.ww-slide")[2]
    assert(!third.querySelector("h1, p"), "added slide contains automatic text boxes")
    const presetText = paragraph.cloneNode(false) as HTMLParagraphElement, presetHeading = heading.cloneNode(false) as HTMLHeadingElement
    third.prepend(presetHeading, presetText)
    const beforeMove = presetHeading.getBoundingClientRect()
    presetHeading.textContent = "Slide title"
    doc.getSelection()!.setBaseAndExtent(presetHeading.firstChild!, 0, presetHeading.firstChild!, 2)
    slideEditor.features.selection.processSelection()
    const slideFrame = slideEditor.features.transformation.overlay
    assert(slideFrame.part.contains("transform-overlay-content-selected"), "inner slide selection did not show the root frame")
    await new Promise(resolve => setTimeout(resolve, 200))
    const slideFrameColor = getComputedStyle(slideFrame).outlineColor
    const slideHandle = slideFrame.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    assert(getComputedStyle(slideHandle).backgroundColor === slideFrameColor, "slide content-selection handles do not match the grey frame")
    const slideRotation = slideFrame.querySelector<HTMLElement>("#◆transform-overlay-rotator")!
    for(const pseudo of ["::before", "::after"]) {
      assert(getComputedStyle(slideRotation, pseudo).backgroundColor === slideFrameColor, "slide rotation icon or stem does not match the grey frame")
    }
    const mover = slideEditor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    mover.addEventListener("mousedown", event => slideEditor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    slideEditor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 212, clientY: 208}))
    slideEditor.features.transformation.handleMoveEnd()
    const movedSelection = doc.getSelection()!
    assert(movedSelection.anchorNode === presetHeading.firstChild && movedSelection.anchorOffset === 0
      && movedSelection.focusNode === presetHeading.firstChild && movedSelection.focusOffset === 2,
    "moving did not restore the exact slide text range")
    assert(slideEditor.features.transformation.target === presetHeading
      && slideFrame.part.contains("transform-overlay-content-selected")
      && !presetHeading.classList.contains("◆element-selected"),
    "moving did not retain the slide content selection and root ownership")
    await new Promise(resolve => setTimeout(resolve, 200))
    assert(getComputedStyle(slideHandle).backgroundColor === getComputedStyle(slideFrame).outlineColor,
      "moved slide content selection does not retain grey content handles")
    const afterMove = presetHeading.getBoundingClientRect()
    assert(Math.abs(afterMove.left - beforeMove.left - 12) < 1 && Math.abs(afterMove.top - beforeMove.top - 8) < 1
      && Math.abs(afterMove.width - beforeMove.width) < 1 && Math.abs(afterMove.height - beforeMove.height) < 1, "moving a slide text box changes its size or uses the wrong origin")
    await checkFreeformCapture(slideEditor, third)
    presetText.textContent = "BeforeAfter"
    doc.getSelection()!.setBaseAndExtent(presetText.firstChild!, 6, presetText.firstChild!, 6)
    presetText.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    assert(presetText.innerHTML === "Before<br>After" && third.querySelectorAll("p").length === 1, "slide Enter split the root instead of inserting a line break")
    doc.getSelection()!.setBaseAndExtent(presetText.lastChild!, 2, presetText.lastChild!, 2)
    presetText.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true}))
    assert(presetText.innerHTML === "Before<br>Af<br>ter", "slide native paragraph input did not insert a line break")
    const snippetRange = doc.createRange(); snippetRange.selectNode(presetText)
    doc.getSelection()!.removeAllRanges(); doc.getSelection()!.addRange(snippetRange)
    slideEditor.features.selection.processSelection(false, {scrollIntoView: false})
    slideEditor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: true})
    assert(doc.querySelector(".◆snippet-hovered") === presetText && getComputedStyle(slideEditor.features.selection.hoverCaret!).display === "block",
      "selected slide root suppresses the future snippet outline")
    slideEditor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: false})
    const selection = doc.getSelection()!
    for(const container of [doc.body, viewport, doc.querySelector("nav.ww-slides-navigation")!]) {
      for(const offset of [0, container.childNodes.length]) {
        selection.setBaseAndExtent(container, offset, container, offset)
        slideEditor.features.selection.processSelection(false, {scrollIntoView: false})
        const selectedSlide = slideEditor.features.slides.containingSlide(selection.anchorNode)
        assert(selectedSlide && slideEditor.features.slides.containingSlide(selection.focusNode) === selectedSlide,
          "outer carousel gap escaped the slide selection boundary")
        assert(!doc.querySelector('.ww-slide.◆gap-before-selected, .ww-slide.◆gap-after-selected, .ww-slides-viewport.◆gap-before-selected, .ww-slides-viewport.◆gap-after-selected'),
          "outer slide gap still shows an editing caret")
      }
    }
    actions.querySelector<HTMLButtonElement>('[name="remove"]')!.click()
    await layoutFrame()
    assert(doc.querySelectorAll("section.ww-slide").length === 2, "navigation remove affordance failed")
    frame.style.width = "900px"; frame.style.height = "350px"
    await layoutFrame()
    assert(Math.abs(third.getBoundingClientRect().height - 350) < 1 && Math.abs(third.getBoundingClientRect().width - 350 * 16 / 9) < 1,
      "slides do not fit a wide viewport at 16:9")
    assert(Math.abs(third.getBoundingClientRect().left - (frame.clientWidth - 350 * 16 / 9) / 2) < 1, "wide viewport margins are unequal")
    const outside = doc.createElement("aside")
    outside.textContent = "Outside"
    outside.style.cssText = "position:absolute;left:-40px;top:80px;width:30px;height:30px;background:blue"
    third.append(outside)
    let outsideRect = outside.getBoundingClientRect()
    assert(doc.elementFromPoint(outsideRect.left + 5, outsideRect.top + 5) === outside, "slide content is cropped in the side margin")
    frame.style.width = "360px"; frame.style.height = "480px"
    await layoutFrame()
    assert(Math.abs(third.getBoundingClientRect().width - 360) < 1 && Math.abs(third.getBoundingClientRect().height - 360 * 9 / 16) < 1, "slides did not retain 16:9 on viewport resize")
    assert(actions.querySelector<HTMLButtonElement>('[name="add"]')!.getBoundingClientRect().right <= 360 && nav.getBoundingClientRect().left >= 0, "compact navigation does not fit narrow viewport")
    outside.style.left = "80px"; outside.style.top = "-40px"
    outsideRect = outside.getBoundingClientRect()
    assert(outsideRect.bottom < third.getBoundingClientRect().top && doc.elementFromPoint(outsideRect.left + 5, outsideRect.top + 5) === outside, "slide content is cropped in the top margin")
    const lock = {}
    slideEditor.lockEditing(lock)
    assert(getComputedStyle(third).overflowX === "clip" && getComputedStyle(third).overflowY === "clip", "non-editing slides expose overflow")
    slideEditor.unlockEditing(lock)
    assert(getComputedStyle(third).overflow === "visible", "resuming editing does not expose slide overflow")
    viewport.style.removeProperty("scroll-behavior")
    savedSlidesHTML = await slideEditor.serializeHTML(true)
    slideEditor.destroy()
    assert(getComputedStyle(third).overflow === "clip", "destroying the editor leaves slide overflow exposed")
  }
  finally { frame.remove() }
})

await check("saved Slides navigate with HTML and CSS and scripting disabled", async () => {
  assert(savedSlidesHTML, "slide fixture did not export")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.sandbox.add("allow-same-origin")
  const url = URL.createObjectURL(new Blob([savedSlidesHTML], {type: "text/html"}))
  frame.src = url
  const loaded = new Promise(resolve => frame.addEventListener("load", resolve, {once:true}))
  document.body.append(frame)
  try {
    await loaded
    const doc = frame.contentDocument!, viewport = doc.querySelector<HTMLElement>(".ww-slides-viewport")!
    assert(!doc.querySelector("script"), "saved carousel contains a runtime")
    assert(!doc.body.shadowRoot, "saved carousel depends on a shadow appendix")
    const readerSlide = viewport.querySelector<HTMLElement>("section.ww-slide")!
    assert(Math.abs(readerSlide.getBoundingClientRect().width - frame.clientWidth) < 1 && Math.abs(readerSlide.getBoundingClientRect().height - frame.clientWidth * 9 / 16) < 1, "exported slides do not fit the reader viewport at 16:9")
    const readerNav = doc.querySelector<HTMLElement>("nav.ww-slides-navigation")!
    assert(getComputedStyle(readerNav).position === "absolute" && readerNav.getBoundingClientRect().bottom <= frame.clientHeight, "reader navigation is not overlaid at the bottom")
    assert(Math.abs(readerNav.getBoundingClientRect().left - 16) < 1, "saved slides pagination is not left aligned")
    viewport.style.scrollBehavior = "auto"
    doc.querySelectorAll<HTMLAnchorElement>("nav.ww-slides-navigation a")[1].click()
    await layoutFrame()
    assert(frame.contentDocument === doc, "fragment navigation replaced the reader document")
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "reader link did not scroll with scripts disabled")
    const outside = doc.querySelector<HTMLElement>("aside")!, outsideRect = outside.getBoundingClientRect()
    assert(doc.elementFromPoint(outsideRect.left + 5, outsideRect.top + 5) !== outside, "saved slide content is visible outside the slide")
    assert(getComputedStyle(outside.parentElement!).overflow === "clip", "saved slides do not clip overflow")
    const readerLinks = readerNav.querySelectorAll<HTMLAnchorElement>("a")
    assert(getComputedStyle(readerLinks[1]).backgroundColor === "rgb(226, 229, 233)" && getComputedStyle(readerLinks[0]).backgroundColor !== "rgb(226, 229, 233)", "saved active highlight does not follow navigation")
    assert(Array.from(doc.querySelectorAll<HTMLAnchorElement>("nav a")).every(link => !link.draggable), "saved controls can be dragged")
    const focusedSlide = doc.querySelectorAll<HTMLElement>("section.ww-slide")[1]
    focusedSlide.focus({preventScroll: true})
    assert(getComputedStyle(focusedSlide).outlineStyle === "none", "saved slide still has a focus ring")
    assert(getComputedStyle(readerNav.querySelector("a")!).cursor === "pointer", "saved navigation lacks a pointer cursor")
    doc.querySelectorAll<HTMLElement>("section.ww-slide")[1].querySelector<HTMLAnchorElement>(".ww-slide-previous")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft < 1, "reader previous arrow requires scripting")
    doc.querySelector<HTMLAnchorElement>(".ww-slide-next")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "reader next arrow requires scripting")
    const preview = new DOMParser().parseFromString(savedSlidesHTML, "text/html")
    preview.querySelectorAll('nav.ww-slides-navigation a[href], nav.ww-slide-directions a[href]').forEach(link => link.setAttribute("href", `about:srcdoc${link.getAttribute("href")}`))
    const previewLoaded = new Promise(resolve => frame.addEventListener("load", resolve, {once:true}))
    frame.srcdoc = preview.documentElement.outerHTML
    await previewLoaded
    const previewDoc = frame.contentDocument!, previewViewport = previewDoc.querySelector<HTMLElement>(".ww-slides-viewport")!
    previewViewport.style.scrollBehavior = "auto"
    previewDoc.querySelectorAll<HTMLAnchorElement>("nav.ww-slides-navigation a")[1].click()
    await layoutFrame()
    assert(frame.contentDocument === previewDoc && previewViewport.scrollLeft > previewViewport.clientWidth / 2, "native preview links did not stay inside srcdoc")
  }
  finally { frame.remove(); URL.revokeObjectURL(url) }
})

await check("Placement arrows move elements in normal document flow", async () => {
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const frame = document.createElement("iframe"), toolbox = new DomEditorToolbox()
  frame.srcdoc = '<!doctype html><body><p>first</p><!--keep--><p id="selected">selected text</p><custom-card>last</custom-card><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  toolbox.style.width = "220px"
  fixture.append(frame, toolbox)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "normal-flow movement fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, selected = doc.querySelector("#selected")!, text = selected.firstChild!
    doc.querySelector('script[class~="◆editor-only"]')?.remove()
    const selection = view.getSelection()!
    selection.setBaseAndExtent(text, 5, text, 2)
    toolbox.activeTool = "Edit"
    toolbox.elementStyle = editor.features.manipulation.getStyleState([], selected, false)
    toolbox.addEventListener("layout-action", event => {
      const action = (event as CustomEvent<{type: "moveFloat", direction: "up" | "down"}>).detail
      if(action.type === "moveFloat") {
        assert(editor.features.layout.actions.moveFloat({...action, topLevel: true}), "normal-flow move failed")
        toolbox.elementStyle = editor.features.manipulation.getStyleState([], selected, false)
      }
    })
    await toolbox.updateComplete
    await layoutFrame()
    for(const direction of ["down", "up"] as const) {
      const button = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`button[aria-label="Move ${direction}"]`)!
      assert(!button.disabled, `${direction} arrow is disabled for normal flow`)
      button.click()
      await toolbox.updateComplete
      assert(direction === "down" ? selected.previousElementSibling?.localName === "custom-card" : selected.nextElementSibling?.localName === "custom-card", "arrow did not swap adjacent elements")
      assert(selection.anchorNode === text && selection.anchorOffset === 5 && selection.focusNode === text && selection.focusOffset === 2, "move changed the backward selection")
      assert(view.getComputedStyle(selected).float === "none", "moving introduced a float")
      assert(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Move down"]')!.disabled === (direction === "down"), "down arrow did not follow the last-element boundary")
    }
    assert(doc.body.childNodes[1].nodeType === Node.COMMENT_NODE, "moving removed an authored comment")
    const up = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Move up"]')!
    up.click()
    await toolbox.updateComplete
    assert(up.disabled, "up arrow is enabled at the first element")
    assert(getComputedStyle(up).opacity === "0.4" && getComputedStyle(up).cursor === "default", "disabled up arrow is not visibly greyed out")
    for(const sibling of Array.from(doc.body.children)) if(sibling !== selected) sibling.remove()
    toolbox.elementStyle = editor.features.manipulation.getStyleState([], selected, false)
    await toolbox.updateComplete
    assert(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".float-move")).every(button => button.disabled), "arrows are enabled for an only element surrounded by comments")
    assert(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".float-move")).every(button => getComputedStyle(button).opacity === "0.4"), "disabled arrows are not visibly greyed out")
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove(); toolbox.remove()
  }
})

await check("unfloated placements align within the content column", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1440px;height:700px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "content alignment fixture did not initialize")
    const editor = view.editor!
    const doc = frame.contentDocument!, theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    const content = '<p>Reading column</p><picture style="width:160px;height:60px"><img alt="Picture" width="160" height="60"></picture><native-alignment-widget style="display:block;width:240px;height:60px">Widget</native-alignment-widget>'
    doc.body.innerHTML = `${content}<main>${content}</main><article>${content}</article><section>${content}</section>`
    const targets = Array.from(doc.querySelectorAll<HTMLElement>("picture, native-alignment-widget"))
    const aligned = (document: Document, alignment: "left" | "center" | "right") => {
      for(const target of document.querySelectorAll<HTMLElement>("picture, native-alignment-widget")) {
        const box = target.getBoundingClientRect(), prose = target.parentElement!.querySelector(":scope > p")!.getBoundingClientRect()
        const edge = (box: DOMRect) => alignment === "left" ? box.left : alignment === "right" ? box.right : (box.left + box.right) / 2
        assert(Math.abs(edge(box) - edge(prose)) < 1, `${target.localName} ${alignment} escaped the content column at ${frame.style.width}`)
        assert(document.defaultView!.getComputedStyle(target).float === "none", "aligned content still floats")
      }
    }
    for(const [width, floated] of [[1440, false], [1440, true], [1000, true], [590, true], [360, true]] as const) {
      if(floated && !doc.querySelector("aside")) doc.body.insertAdjacentHTML("afterbegin", '<aside class="ww-float-left" style="width:80px;height:60px">Float lane</aside>')
      frame.style.width = `${width}px`
      for(const prose of ["45rem", "30rem"]) {
        doc.documentElement.style.setProperty("--ww-prose-max", prose)
        for(const alignment of ["left", "center", "right"] as const) {
          for(const target of targets) {
            editor.features.manipulation.setFloat(target, "far-right")
            assert(editor.features.manipulation.setFloat(target, "none", alignment), "alignment command failed")
            assert(editor.features.manipulation.getStyleState([], target, false).target?.alignment === alignment, "alignment state did not follow the live margins")
          }
          await layoutFrame()
          aligned(doc, alignment)
          const saved = document.createElement("iframe")
          saved.style.cssText = frame.style.cssText
          const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once:true}))
          saved.srcdoc = await editor.serializeHTML()
          document.body.append(saved)
          try { await loaded; await layoutFrame(); aligned(saved.contentDocument!, alignment) }
          finally { saved.remove() }
        }
      }
    }
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove()
  }
})

await check("media stays centered in editing and standalone documents", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1000px;height:700px;border:0;max-width:none"
  const media = '<picture style="width:160px"><img alt="Picture" width="160" height="60"></picture><img alt="Image" style="width:160px;height:60px"><audio controls style="width:240px"></audio><video controls style="width:240px;height:90px"></video><iframe title="Website" style="width:240px;height:90px"></iframe><embed style="width:240px;height:90px"><object style="width:240px;height:90px"></object>'
  const content = `${media}<main>${media}<p>Reading column</p></main><article>${media}<p>Reading column</p></article><section>${media}<p>Reading column</p></section><p>Inline <img id="inline" alt="inline" width="20" height="20"> image</p>`
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "media centering fixture did not initialize")
    const doc = frame.contentDocument!, theme = doc.createElement("style")
    // Exercise live DOM edits, including unwrapped images, rather than import aliases.
    doc.body.innerHTML = content
    doc.head.append(theme)
    const centered = (document: Document, context: string) => {
      for(const element of document.querySelectorAll<HTMLElement>("body > :is(picture,img,audio,video,iframe,embed,object), :is(main,article,section) > :is(picture,img,audio,video,iframe,embed,object)")) {
        const box = element.getBoundingClientRect(), parent = element.parentElement!
        const parentBox = parent.getBoundingClientRect(), style = document.defaultView!.getComputedStyle(parent)
        const left = parentBox.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
        const right = parentBox.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
        const prose = parent.querySelector(":scope > p")!.getBoundingClientRect()
        const mediaStyle = document.defaultView!.getComputedStyle(element)
        // Holiday deliberately offsets pictures after normal-flow placement.
        const offset = mediaStyle.position === "relative" ? parseFloat(mediaStyle.left) || 0 : 0
        // An embed without a resource has no rendered box in Chromium even
        // though CSS gives it a width. Verify the block centering contract
        // directly instead of comparing its empty (0px) client rect.
        if(element.localName === "embed" && box.width === 0) {
          assert(mediaStyle.display === "block" && mediaStyle.marginLeft === "auto" && mediaStyle.marginRight === "auto"
            && parseFloat(mediaStyle.width) <= right - left,
          `${context}: empty embed did not receive centered, bounded block styles`)
          continue
        }
        assert(Math.abs((box.left + box.right) / 2 - offset - (prose.left + prose.right) / 2) < 1, `${context}: ${element.localName} was not centered in ${parent.localName}`)
        assert(box.left - offset >= left - 1 && box.right - offset <= right + 1, `${context}: ${element.localName} overflowed its column`)
      }
    }
    for(const bundledTheme of documentThemes) {
      theme.setAttribute("data-ww-theme", bundledTheme.value)
      theme.textContent = bundledTheme.source
      frame.style.width = "1000px"
      await layoutFrame()
      centered(doc, `${bundledTheme.value} editing`)
      const saved = document.createElement("iframe")
      saved.style.cssText = frame.style.cssText
      saved.setAttribute("sandbox", "allow-same-origin")
      const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once:true}))
      saved.srcdoc = await view.editor!.serializeHTML()
      document.body.append(saved)
      try {
        await loaded
        for(const width of [1000, 590, 360]) {
          saved.style.width = `${width}px`
          await layoutFrame()
          centered(saved.contentDocument!, `${bundledTheme.value} saved ${width}`)
        }
        assert(saved.contentDocument!.querySelector("#inline")!.closest("p"), "export moved inline media out of prose")
        if(bundledTheme.value === "base") assert(saved.contentWindow!.getComputedStyle(saved.contentDocument!.querySelector("#inline")!).display === "inline", "inline prose image was blockified")
      }
      finally { saved.remove() }
    }
  }
  finally {
    (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
    frame.remove()
  }
})

await check("wrapped attribution keeps two text columns and moves contact to the opposite side", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1400px;height:900px;border:0;max-width:none"
  try {
    for(const editing of [false, true]) {
      const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.src = `/tests/attribution-floats.html?long${editing ? "&editing" : ""}`
      if(!frame.isConnected) document.body.append(frame)
      await loaded
      for(let attempt = 0; !frame.contentDocument?.body.shadowRoot && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      await layoutFrame()
      const doc = frame.contentDocument!, view = frame.contentWindow!
      const appendix = doc.body.shadowRoot!
      const elements = Array.from(doc.querySelectorAll<HTMLElement>("aside"))
      const labels = () => Array.from(appendix.querySelectorAll<HTMLElement>(".attribution-note:not(.attribution-contact-note)"))
      for(const width of [1400, 900, 360]) {
        frame.style.width = `${width}px`
        await layoutFrame()
        assert(labels().length === 2, "wrapped attribution lost an element's text")
        for(const [index, element] of elements.entries()) {
          const label = labels()[index], text = label.querySelector<HTMLElement>(".attribution-text")!
          const contact = appendix.querySelector<HTMLElement>(`[part="${label.getAttribute("part")}-contact"]`)!
          assert(label.parentElement === contact.parentElement && label.parentElement!.classList.contains("attribution-group"), "split attribution parts do not share their hover group")
          assert([label, contact].every(note => view.getComputedStyle(note).userSelect === "none"), "attribution text is selectable")
          assert(contact?.textContent === element.getAttribute("data-ww-attribution-contact")!.replace(/^mailto:/, ""), "wrapped attribution did not move its complete contact")
          assert(text.textContent!.includes(element.getAttribute("data-ww-attribution-name")!), "wrapped attribution shortened the author name")
          const box = element.getBoundingClientRect(), noteBox = label.getBoundingClientRect(), contactBox = contact.getBoundingClientRect()
          const textBox = text.getBoundingClientRect()
          assert(view.getComputedStyle(label).writingMode === "horizontal-tb" ? textBox.height <= 16.1 : textBox.width <= 16.1 && textBox.height <= box.height + .1, "metadata exceeds two lines or its element's height")
          assert(contactBox.width <= 16.1 && contactBox.height <= box.height + .1, "contact exceeds two lines or its element's height")
          const left = view.getComputedStyle(element).float === "left"
          const floating = view.getComputedStyle(element).float !== "none"
          if(floating) {
            assert(view.getComputedStyle(label).writingMode === "horizontal-tb" && view.getComputedStyle(label).textAlign === "right", "long float credit is not horizontal and right aligned")
            assert(Math.abs(noteBox.right - box.right) < 1 && Math.abs(noteBox.bottom + 2 - box.top) < 1, "uncaptioned float credit is not at the top right")
            assert(Math.abs(left ? contactBox.right - box.left : contactBox.left - box.right) < 1, "float URL is not flush with its outer edge")
          }
          else {
            assert(noteBox.width <= 16.1 && noteBox.width > 8, "non-URL fields did not wrap into two columns within the margin")
            assert(Math.abs(left ? noteBox.right - box.left : noteBox.left - box.right) < 1, "vertical attribution is not flush with the element")
            assert(Math.abs(left ? contactBox.left - box.right : contactBox.right - box.left) < 1, "opposite contact is not flush with the element")
            assert(Math.abs(noteBox.bottom - box.bottom) < 1, "vertical attribution lost bottom alignment")
          }
          assert(view.getComputedStyle(contact).writingMode === ((floating ? left : !left) ? "sideways-rl" : "sideways-lr"), "contact did not turn to match its side")
          assert(Math.abs(contactBox.bottom - box.bottom) < 1, "split contact lost bottom alignment")
          if(editing) assert(contact.getAttribute("role") === "button", "opposite contact cannot open the editing form")
          const licenseLink = text.querySelector<HTMLElement>(".attribution-link")!, contactLink = contact.querySelector<HTMLElement>(".attribution-link")!
          if(editing) assert(!label.querySelector("a") && !contact.querySelector("a"), "editing attribution contains a real link")
          else {
            assert((licenseLink as HTMLAnchorElement)?.href === `https://spdx.org/licenses/${element.getAttribute("data-ww-license")}.html`, "license does not link to its SPDX page")
            assert((contactLink as HTMLAnchorElement)?.href === element.getAttribute("data-ww-attribution-contact"), "contact lost its link")
          }
          assert(!contact.textContent!.includes("mailto:"), "email contact displays its mailto prefix")
          assert(view.getComputedStyle(label).color === "rgb(119, 119, 119)" && view.getComputedStyle(contact).color === "rgb(119, 119, 119)", "attribution is not gray by default")
          for(const link of [licenseLink, contactLink]) {
            assert(view.getComputedStyle(link).color === "rgb(119, 119, 119)" && view.getComputedStyle(link).textDecorationLine.includes("underline"), "attribution links are not gray and underlined")
            if(!editing) {
              const event = new MouseEvent("click", {bubbles: true, cancelable: true})
              assert(!link.dispatchEvent(event), "inline attribution link did not prevent navigation")
              const popup = appendix.querySelector<HTMLElement>(".popup")!
              assert(!popup.hidden, "inline attribution link did not open the reading popup")
              const popupLinks = popup.querySelectorAll<HTMLAnchorElement>(".details a")
              assert(popupLinks.length === 2, "reading popup lost its license or contact link")
              for(const popupLink of popupLinks) {
                let canceledBeforeTest = true
                popup.addEventListener("click", event => {
                  canceledBeforeTest = event.defaultPrevented
                  event.preventDefault()
                }, {once: true})
                popupLink.click()
                assert(!canceledBeforeTest, "popup attribution link prevented native navigation")
              }
              appendix.querySelector<HTMLButtonElement>(".close")!.click()
            }
          }
          if(editing) {
            assert(view.getComputedStyle(text).cursor === "pointer" && view.getComputedStyle(contact.firstElementChild!).cursor === "pointer", "editing attribution text does not show a pointer cursor")
          }
        }
        if(width === 900) {
          const gap = elements[1].getBoundingClientRect().top - elements[0].getBoundingClientRect().bottom
          assert(gap >= 18 - 1, "stacked side floats have less than the minimum page margin between them")
        }
      }
      // Both metadata and URLs must fit at most two lines; neither may spill
      // out of a short element. The compact trigger still exposes full details.
      frame.style.width = "900px"
      const originalName = elements[0].getAttribute("data-ww-attribution-name")!
      const originalContact = elements[0].getAttribute("data-ww-attribution-contact")!
      elements[0].setAttribute("data-ww-attribution-contact", `https://example.com/${"path/".repeat(14)}`)
      await layoutFrame(); await layoutFrame()
      const wrappedContact = appendix.querySelector<HTMLElement>(`[part="${labels()[0].getAttribute("part")}-contact"]`)!
      assert(wrappedContact.getBoundingClientRect().width > 8 && wrappedContact.getBoundingClientRect().width <= 16.1, "long URL did not fit two vertical lines")
      elements[0].style.minHeight = "0"
      await layoutFrame(); await layoutFrame()
      assert(labels()[0].classList.contains("compact-attribution"), "resizing a short element did not collapse its attribution")
      elements[0].style.removeProperty("min-height")
      await layoutFrame(); await layoutFrame()
      assert(!labels()[0].classList.contains("compact-attribution"), "resizing an element did not restore its attribution")
      elements[0].setAttribute("data-ww-attribution-contact", originalContact)
      for(const field of ["name", "contact"]) {
        const value = field === "name" ? "Full author and contributors ".repeat(30) : `https://example.com/${"long-contact/".repeat(60)}`
        elements[0].setAttribute(`data-ww-attribution-${field}`, value)
        await layoutFrame(); await layoutFrame()
        const label = labels()[0]
        assert(label.classList.contains("compact-attribution"), `overlong ${field} did not use compact attribution`)
        assert(label.innerText === "©", "compact attribution exposes more than the copyright symbol")
        assert(view.getComputedStyle(label).fontSize === "12px" && view.getComputedStyle(label).color === "rgb(119, 119, 119)", "compact attribution lost its larger gray type")
        assert(!appendix.querySelector(`[part="${label.getAttribute("part")}-contact"]`), "compact attribution left a URL outside its element")
        const box = elements[0].getBoundingClientRect(), noteBox = label.getBoundingClientRect()
        assert(Math.abs(noteBox.bottom - box.bottom) < 1 && Math.abs(noteBox.left - box.right) < 1, "compact attribution is not aligned to its element")
        label.click()
        const popup = appendix.querySelector<HTMLElement>(".popup")!
        assert(!popup.hidden, "attribution click did not open the popup")
        if(editing) assert((popup.querySelector(`[name="${field}"]`) as HTMLInputElement).value === value, "editing popup lost the full attribution")
        else {
          assert(!popup.querySelector<HTMLElement>(".details")!.hidden && popup.querySelector<HTMLElement>("form")!.hidden, "reading popup displays editing controls")
          assert(popup.querySelector(".details")!.textContent!.includes(value.trim()), "reading popup shortened the attribution")
        }
        popup.querySelector<HTMLButtonElement>(".close")!.click()
        elements[0].setAttribute(`data-ww-attribution-${field}`, field === "name" ? originalName : originalContact)
        await layoutFrame(); await layoutFrame()
        assert(!labels()[0].classList.contains("compact-attribution"), "attribution did not expand after it fit again")
      }
      if(!editing) {
        labels()[0].click()
        assert(!appendix.querySelector<HTMLElement>(".popup")!.hidden, "full reading attribution does not open its details popup")
        appendix.querySelector<HTMLButtonElement>(".close")!.click()
      }
      const column = doc.querySelector<HTMLElement>("body > p")!
      column.setAttribute("data-ww-attribution-name", "Content column author")
      column.setAttribute("data-ww-attribution-contact", "mailto:column@example.com")
      column.style.minHeight = "160px"
      for(const width of [1400, 900, 360, 900, 1400]) {
        frame.style.width = `${width}px`
        await layoutFrame()
        const label = labels().find(note => note.textContent!.includes("Content column author"))!
        const left = width === 900
        const box = column.getBoundingClientRect(), noteBox = label.getBoundingClientRect()
        assert(Math.abs(left ? noteBox.right - box.left : noteBox.left - box.right) < 1, "content-column attribution is not flush with the active edge")
        assert(view.getComputedStyle(label).writingMode === (left ? "sideways-rl" : "sideways-lr"), "flipped content-column attribution did not turn")
        assert(Math.abs(noteBox.bottom - box.bottom) < 1, "content-column attribution lost bottom alignment")
        assert(label.textContent!.includes("column@example.com"), "flipped content attribution lost its contact")
        for(const element of elements) {
          const floatLabel = labels().find(note => note.textContent!.includes(element.getAttribute("data-ww-license")!))!
          assert(floatLabel.classList.contains("left-attribution") === (view.getComputedStyle(element).float === "left"), "content-column flip changed a float's attribution side")
        }
      }
      frame.style.width = "900px"
      for(const element of elements) element.classList.remove("ww-float-left", "ww-float-right")
      await layoutFrame()
      assert(!labels().find(note => note.textContent!.includes("Content column author"))!.classList.contains("left-attribution"), "content attribution stayed flipped after the last float was cleared")
      elements[0].classList.add("ww-float-left")
      elements[1].classList.add("ww-float-right")
      column.removeAttribute("data-ww-attribution-name")
      column.removeAttribute("data-ww-attribution-contact")
      await layoutFrame()
      elements[0].setAttribute("data-ww-attribution-name", "Ada")
      await layoutFrame()
      assert(!appendix.querySelector(`[part="${labels()[0].getAttribute("part")}-contact"]`), "shortened attribution retained a separate contact label")
      assert(labels()[0].querySelector(".attribution-contact"), "shortened attribution did not bring contact back")
      // A stylesheet can resize a widget without mutating its authored DOM.
      const style = doc.createElement("style")
      style.textContent = "aside { min-height: 1000px !important }"
      doc.head.append(style)
      await layoutFrame(); await layoutFrame()
      assert(!appendix.querySelector(".attribution-contact-note"), "element resizing did not reunite attribution and contact")
      elements[1].remove()
      await layoutFrame()
      assert(labels().length === 1, "removing an element left its attribution behind")
      style.remove()
      const figure = doc.createElement("figure")
      figure.className = "ww-float-right"
      figure.setAttribute("data-ww-attribution-name", "A long figure attribution naming the original author and illustration team")
      figure.setAttribute("data-ww-attribution-contact", "https://example.com/figure")
      const content = doc.createElement("div"), caption = doc.createElement("figcaption")
      content.style.height = "160px"
      content.textContent = "Captioned figure"
      caption.textContent = "Keep this caption"
      figure.append(content, caption)
      doc.body.append(figure)
      const following = doc.createElement("aside")
      following.className = "ww-float-right"
      following.style.minHeight = "80px"
      following.textContent = "Following float"
      doc.body.append(following)
      for(const position of ["below", "above", "none", "below"]) {
        if(position === "above") figure.prepend(caption)
        else if(position === "below") figure.append(caption)
        else caption.remove()
        await layoutFrame(); await layoutFrame()
        const label = labels().find(note => note.textContent!.includes("A long figure attribution"))!
        const noteBox = label.getBoundingClientRect(), box = figure.getBoundingClientRect()
        assert(view.getComputedStyle(label).writingMode === "horizontal-tb" && view.getComputedStyle(label).textAlign === "right", "captioned credit is not right aligned horizontally")
        assert(Math.abs(noteBox.right - box.right) < 1, "captioned credit is not at the right edge")
        assert(position === "above" ? Math.abs(noteBox.top - box.bottom - 2) < 1 : Math.abs(noteBox.bottom + 2 - box.top) < 1, "float credit did not move opposite the current caption")
        const previous = elements[0].getBoundingClientRect()
        assert(box.top - previous.bottom >= 17, "captioned float lost its minimum vertical clearance")
        if(position !== "above") assert(noteBox.top >= previous.bottom, "horizontal attribution overlaps the preceding float")
        const visibleBottom = position === "above" ? noteBox.bottom : box.bottom
        assert(following.getBoundingClientRect().top - visibleBottom >= 17, "following float lacks the minimum margin after the attribution")
      }
      const captionLoaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
      frame.style.width = "1400px"
      frame.src = `/tests/attribution-floats.html?long&captions${editing ? "&editing" : ""}`
      await captionLoaded
      for(let attempt = 0; !frame.contentDocument?.body.shadowRoot && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      const captionDoc = frame.contentDocument!, figures = Array.from(captionDoc.querySelectorAll("figure"))
      for(const swap of [false, true, false]) {
        for(const [index, figure] of figures.entries()) {
          const caption = figure.querySelector("figcaption")!
          if((index === 0) === swap) figure.prepend(caption)
          else figure.append(caption)
        }
        await layoutFrame(); await layoutFrame()
        assert(Math.abs(figures[0].getBoundingClientRect().top - figures[1].getBoundingClientRect().top) < 1, "opposing floats lost their shared top when credits changed sides")
        for(const [index, figure] of figures.entries()) {
          const box = figure.getBoundingClientRect()
          const contact = captionDoc.body.shadowRoot!.querySelector<HTMLElement>(`[part="attribution-note-${index}-contact"]`)!
          const contactBox = contact.getBoundingClientRect()
          assert(Math.abs(index === 0 ? contactBox.right - box.left : contactBox.left - box.right) < 1, "captioned URL is not aligned to its float edge")
        }
      }
    }
  }
  finally { frame.remove() }
})

await check("far floats adapt to column margins and survive standalone export", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1400px;height:700px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><aside id="float" data-ww-attribution-name="Float author" data-ww-attribution-year="2026" data-ww-license="CC-BY-4.0" data-ww-attribution-contact="mailto:author@example.com">Float content</aside><p id="text">Following text remains in the reading column.</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "far float fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    const target = doc.querySelector<HTMLElement>("#float")!
    const contentBox = (document: Document) => {
      const body = document.body.getBoundingClientRect(), style = document.defaultView!.getComputedStyle(document.body)
      const left = body.left + parseFloat(style.paddingLeft), right = body.right - parseFloat(style.paddingRight)
      return {left, right, width: right - left}
    }
    const siblings = Array.from(doc.body.childNodes)
    for(const side of ["far-left", "far-right"] as const) {
      assert(editor.features.manipulation.setFloat(target, side), "far float command refused connected target")
      const physical = side.endsWith("left") ? "left" : "right"
      assert(target.classList.contains(physical === "left" ? "ww-float-left" : "ww-float-right"), "far float command did not use its authored side class")
      assert(!target.style.float && !target.style.width && !target.style.maxWidth && !target.style.margin
        && !target.style.getPropertyValue("--ww-float-size"), "default far float command injected inline layout styles")
      for(const width of [1400, 1000, 850, 700, 630, 590, 360]) {
        frame.style.width = `${width}px`
        await layoutFrame()
        const column = contentBox(doc), box = target.getBoundingClientRect()
        const style = view.getComputedStyle(target)
        // Container queries and cqw use the root content box, excluding both gutters.
        const viewportWidth = parseFloat(view.getComputedStyle(doc.documentElement).width)
        const stacked = viewportWidth < 600, singleLane = viewportWidth >= 600 && viewportWidth < 1200
        const effectiveSide = singleLane ? "right" : physical
        const gap = parseFloat(effectiveSide === "left" ? style.marginRight : style.marginLeft)
        assert(box.left >= -1 && box.right <= doc.documentElement.clientWidth + 1, "far float escaped the viewport")
        const gutter = Math.min(32, Math.max(16, viewportWidth * .02))
        const pageWidth = Math.min(2160, viewportWidth - 2 * gutter)
        if(!stacked) {
          assert(Math.abs(box.width - (singleLane ? Math.min(256, Math.max(0, pageWidth - 300 - gutter)) : Math.max(0, (pageWidth - 720) / 2 - gutter))) < 1, `default float did not fill its lane: ${JSON.stringify({viewport: width, viewportWidth, rootClientWidth: doc.documentElement.clientWidth, frameWidth: frame.getBoundingClientRect().width, gutter, pageWidth, box: box.width, column: column.width, padding: style.padding})}`)
          const actualGap = effectiveSide === "left" ? column.left - box.right : box.left - column.right
          assert(Math.abs(actualGap - gutter) < 1, "float-to-column gap differs from the outer page margin")
        }
        const note = editor.appendix.querySelector<HTMLElement>(".attribution-note")!
        const noteBox = note.getBoundingClientRect()
        const noteStyle = view.getComputedStyle(note)
        if(note.classList.contains("compact-attribution")) {
          assert(note.innerText === "©", "short float does not show only the copyright symbol")
          assert(Math.abs(noteBox.bottom - box.bottom) < 1, "compact float attribution lost bottom alignment")
          const left = !stacked && effectiveSide === "left"
          assert(Math.abs(left ? noteBox.right - box.left : noteBox.left - box.right) < 1, "compact float attribution left its outer edge")
        }
        else {
          if(!stacked) {
            assert(noteStyle.writingMode === "horizontal-tb" && noteStyle.textAlign === "right", "long float credit is not horizontal and right aligned")
            assert(Math.abs(noteBox.right - box.right) < 1 && Math.abs(noteBox.bottom + 2 - box.top) < 1, "float credit is not above its uncaptioned element")
          }
          else {
            assert(noteStyle.writingMode === "sideways-lr", "stacked attribution did not return to vertical text")
            assert(Math.abs(noteBox.bottom - box.bottom) < 1, "stacked attribution lost bottom alignment")
          }
          assert(note.textContent === "© 2026 Float author CC-BY-4.0", "floated attribution lost authored values")
          assert(editor.appendix.querySelector(".attribution-contact-note")?.textContent === "author@example.com", "wrapped attribution did not move contact to the opposite side")
        }
        if(!stacked && !singleLane) assert(Math.abs(column.width - 720) < 1, "side lanes squeezed the center column")
        if(singleLane) assert(column.width >= 300 - 1, "single lane squeezed the text below 300px")
        if(!stacked) assert(effectiveSide === "left" ? box.right <= column.left - gap + 1 : box.left >= column.right + gap - 1, "wide far float did not leave the column")
        assert(floatSideFromStyles(style.float, target.style, target.classList) === side, "responsive centering lost the authored float setting")
        if(stacked) {
          assert(style.float === "none", "mobile element remained floated")
          assert(Math.abs(box.width - column.width) < 1, "default mobile float did not fill the content column")
          assert(Math.abs((box.left + box.right) / 2 - (column.left + column.right) / 2) < 1, "mobile element was not centered in the column")
        }
        else assert(style.float === effectiveSide, "document did not use its responsive float placement")
        const paragraph = doc.querySelector<HTMLElement>("#text")!.getBoundingClientRect()
        assert(paragraph.width >= Math.min(300, column.width) - 1, "paragraph was squeezed below its minimum width")
        if(stacked) assert(paragraph.top >= box.bottom - 1, "mobile paragraph did not move below the centered element")
      }
      assert(Array.from(doc.body.childNodes).every((node, index) => node === siblings[index]), "far float rebuilt document structure")
    }
    frame.style.width = "280px"
    await layoutFrame()
    const narrowParagraph = doc.querySelector<HTMLElement>("#text")!.getBoundingClientRect()
    const narrowColumn = contentBox(doc)
    assert(narrowParagraph.width <= narrowColumn.width + 1 && narrowParagraph.left >= narrowColumn.left - 1 && narrowParagraph.right <= narrowColumn.right + 1, "paragraph minimum overflowed a column narrower than 300px")
    frame.style.width = "360px"
    const widget = doc.createElement("native-centered-widget"), image = doc.createElement("picture")
    widget.attachShadow({mode: "open"}).innerHTML = '<style>:host {display:inline-block;width:120px;height:80px}</style>Widget'
    image.append(doc.createElement("img"))
    image.style.width = "80px"; image.style.height = "60px"
    doc.querySelector("#text")!.before(widget, image)
    try {
      editor.features.manipulation.setFloat(widget, "left")
      editor.features.manipulation.setFloat(image, "right")
      await layoutFrame()
      const column = contentBox(doc)
      let previous = target.getBoundingClientRect()
      for(const element of [widget, image]) {
        const box = element.getBoundingClientRect()
        assert(view.getComputedStyle(element).float === "none" && !element.style.getPropertyPriority("float"), "mobile float command overrode CSS centering")
        assert(Math.abs((box.left + box.right) / 2 - (column.left + column.right) / 2) < 1, `mobile ${element.localName} was not centered: box=${box.left},${box.right} column=${column.left},${column.right} display=${view.getComputedStyle(element).display} width=${view.getComputedStyle(element).width} margins=${view.getComputedStyle(element).marginLeft},${view.getComputedStyle(element).marginRight}`)
        assert(box.top >= previous.bottom - 1, "opposing mobile floats did not stack in document order")
        previous = box
      }
    }
    finally { widget.remove(); image.remove() }
    frame.style.width = "1400px"
    doc.documentElement.style.setProperty("--ww-float-width", "12rem")
    doc.documentElement.style.setProperty("--ww-float-gap", "12px")
    await layoutFrame()
    assert(Math.abs(target.getBoundingClientRect().width - 192) < 1, "theme float width did not update live")
    const exported = editor.toHTML()
    const saved = document.createElement("iframe")
    saved.style.cssText = frame.style.cssText
    saved.setAttribute("sandbox", "allow-same-origin")
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once:true}))
    saved.srcdoc = exported
    document.body.append(saved)
    try {
      await loaded
      const box = saved.contentDocument!.querySelector("#float")!.getBoundingClientRect()
      const column = contentBox(saved.contentDocument!)
      assert(Math.abs(box.width - 192) < 1 && box.left >= column.right + 11, "standalone export lost float geometry")
      saved.style.width = "360px"
      await layoutFrame()
      const mobileBox = saved.contentDocument!.querySelector("#float")!.getBoundingClientRect()
      const mobileColumn = contentBox(saved.contentDocument!)
      assert(Math.abs((mobileBox.left + mobileBox.right) / 2 - (mobileColumn.left + mobileColumn.right) / 2) < 1, "standalone mobile export lost centering")
    }
    finally { saved.remove() }
    editor.features.manipulation.setFloat(target, "none")
    assert(!target.classList.contains("ww-float-left") && !target.classList.contains("ww-float-right")
      && !target.style.width && !target.style.margin && !target.style.float && !target.style.getPropertyValue("--ww-float-size"), "clearing far float retained float styling")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("float previews match projected media bounds", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1400px;height:1400px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p id="target">Content displaced by the float.</p></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "float preview fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const events = view as unknown as {MouseEvent: typeof MouseEvent, DragEvent: typeof DragEvent, DataTransfer: typeof DataTransfer}
    const target = doc.querySelector<HTMLElement>("#target")!
    const previewRect = () => editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!.getBoundingClientRect()
    const matches = (preview: DOMRect, actual: DOMRect, description: string) => {
      for(const key of ["left", "top", "width", "height"] as const) assert(Math.abs(preview[key] - actual[key]) < 2, `${description}: ${key} preview=${preview[key]} actual=${actual[key]}`)
    }
    for(const width of [1400, 750, 360]) {
      frame.style.width = `${width}px`
      for(const tag of ["picture", "video", "iframe"]) {
        const range = doc.createRange()
        range.setStart(target.firstChild!, target.firstChild!.textContent!.length); range.collapse(true)
        view.getSelection()!.removeAllRanges(); view.getSelection()!.addRange(range)
        editor.features.selection.processSelection()
        editor.features.manipulation.actions.hoverInsertion({type:"hoverInsertion", hovered:true, tag})
        await layoutFrame()
        assert(!editor.appendix.querySelector("#◆float-drop-preview"), "ribbon hover preview suggested automatic floating")
        assert(doc.body.classList.contains("◆insertion-gap-preview"), "ribbon insertion did not highlight its caret")
        editor.features.manipulation.actions.insertElement({type:"insertElement", tag})
        await layoutFrame()
        const inserted = doc.querySelector<HTMLElement>(tag)!
        assert(inserted && !inserted.style.float, `ribbon ${tag} was automatically floated`)
        const box = inserted.getBoundingClientRect(), column = target.getBoundingClientRect()
        assert(box.left >= column.left - 1 && box.right <= column.right + 1, `ribbon ${tag} escaped the content column`)
        inserted.remove()
        await layoutFrame()
      }
      for(const tag of ["table", "svg"]) {
        const source = tag === "table" ? doc.createElement("table") : doc.createElementNS("http://www.w3.org/2000/svg", "svg")
        if(tag === "table") source.innerHTML = "<tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody>"
        else { source.setAttribute("viewBox", "0 0 1600 900"); source.setAttribute("width", "100%") }
        editor.features.manipulation.showFloatDropPreview(target, "right", "insertion", source)
        const preview = previewRect()
        editor.features.manipulation.clearFloatDropPreview("insertion")
        editor.features.manipulation.placeFloat(source, target, "right")
        await layoutFrame()
        matches(preview, source.getBoundingClientRect(), `${tag} template at ${width}px`)
        source.remove()
        await layoutFrame()
      }
      const beforePreview = editor.toHTML(true)
      editor.features.manipulation.showFloatDropPreview(target, "right", "insertion")
      const fallback = previewRect(), content = target.getBoundingClientRect()
      assert(fallback.width > 100 && fallback.height > content.height && Math.abs(fallback.height / fallback.width - 9 / 16) < .01, "unknown insertion did not use a useful fallback footprint")
      if(width < 600) assert(fallback.left < content.right && fallback.right > content.left, "stacked preview did not overlay displaced reading content")
      assert(editor.toHTML(true) === beforePreview, "preview mutated authored content")
      editor.features.manipulation.clearFloatDropPreview("insertion")
      for(const [side, sourceWidth] of [["left", "120px"], ["right", "auto"]] as const) {
        const source = doc.createElement("video")
        source.controls = true
        source.style.cssText = `width:${sourceWidth};height:90px`
        doc.body.append(source)
        await layoutFrame()
        editor.features.selection.selectElement(source)
        const dataTransfer = new events.DataTransfer()
        editor.appendix.querySelector('[part~="node-drag-surface"]')!.dispatchEvent(new events.DragEvent("dragstart", {dataTransfer, bubbles:true, composed:true}))
        editor.features.manipulation.showFloatDropPreview(target, side, "transfer", source)
        const preview = previewRect()
        const x = preview.left + preview.width / 2, y = preview.top + preview.height / 2
        const hit = new events.MouseEvent("mousemove", {clientX:x, clientY:y})
        assert(editor.features.manipulation.floatDropTarget(hit, source) === target, "visible preview was not a drop target")
        assert(editor.features.manipulation.floatSide(target, x) === side, "preview drop changed its side")
        editor.features.manipulation.clearFloatDropPreview("transfer")
        assert(editor.features.manipulation.floatDropTarget(hit, source) === target, "projected float area was not discoverable without an overlay")
        editor.features.manipulation.showFloatDropPreview(target, side, "transfer", source)
        doc.body.dispatchEvent(new events.DragEvent("drop", {dataTransfer, clientX:x, clientY:y, bubbles:true, composed:true, cancelable:true}))
        await layoutFrame()
        assert(source.classList.contains(side === "left" ? "ww-float-left" : "ww-float-right") && !source.style.float, `native drop did not apply ${side} as a class at ${width}: ${source.outerHTML}; body=${doc.body.innerHTML}`)
        matches(preview, source.getBoundingClientRect(), `${side} moved video at ${width}px (float=${view.getComputedStyle(source).float}, margins=${view.getComputedStyle(source).marginLeft},${view.getComputedStyle(source).marginRight}, padding=${view.getComputedStyle(doc.body).paddingLeft},${view.getComputedStyle(doc.body).paddingRight})`)
        editor.features.manipulation.setElementStyles(source, {"--ww-float-size":"min(100%, var(--ww-float-width), 180px)", "max-width":"180px"})
        await layoutFrame()
        editor.features.manipulation.showFloatDropPreview(target, side, "transformation", source)
        const resizedPreview = previewRect()
        editor.features.manipulation.clearFloatDropPreview("transformation")
        editor.features.manipulation.placeFloat(source, target, side)
        await layoutFrame()
        matches(resizedPreview, source.getBoundingClientRect(), "moving a manually resized float")
        assert(Math.abs(source.getBoundingClientRect().width - 180) < 1, "moving a float lost its manual resize")
        source.remove()
        await layoutFrame()
      }
      for(const side of ["left", "right"] as const) {
        const template = doc.createElement("video")
        template.controls = true
        editor.features.manipulation.showFloatDropPreview(target, side, "transfer", template)
        const preview = previewRect(), dataTransfer = new events.DataTransfer()
        dataTransfer.setData("application/x-webwriter-element-tag", "video")
        dataTransfer.setData("application/x-webwriter-element-tag-video", "video")
        const init = {dataTransfer, clientX:preview.left + preview.width / 2, clientY:preview.top + preview.height / 2, bubbles:true, composed:true, cancelable:true}
        assert(editor.features.manipulation.floatDropTarget(new events.MouseEvent("mousemove", init), template) === target, `ribbon template area rejected; schema=${editor.schema.canInsert(target.parentElement!, template, 0)}`)
        doc.body.dispatchEvent(new events.DragEvent("dragover", init))
        doc.body.dispatchEvent(new events.DragEvent("drop", init))
        await layoutFrame()
        const inserted = target.previousElementSibling as HTMLVideoElement
        assert(inserted?.localName === "video" && inserted.classList.contains(side === "left" ? "ww-float-left" : "ww-float-right") && !inserted.style.float, `ribbon drop did not keep the ${side} preview placement at ${width}px: ${inserted?.outerHTML}; ${doc.body.innerHTML}`)
        matches(preview, inserted.getBoundingClientRect(), `ribbon ${side} drop at ${width}px`)
        inserted.remove()
        await layoutFrame()
      }
    }
    frame.style.width = "1400px"
    const fragment = doc.createDocumentFragment()
    for(let index = 0; index < 500; index++) {
      const paragraph = doc.createElement("p")
      paragraph.innerHTML = `<strong>Paragraph ${index}</strong> <em>with marked text</em>`
      fragment.append(paragraph)
    }
    doc.body.append(fragment)
    await layoutFrame()
    const template = doc.createElement("video")
    template.controls = true
    let measurements = 0
    const clone = template.cloneNode.bind(template)
    template.cloneNode = (deep?: boolean) => { measurements++; return clone(deep) }
    const started = performance.now(), rect = target.getBoundingClientRect()
    editor.features.manipulation.floatDropTarget(new events.MouseEvent("mousemove", {clientX:rect.left + rect.width / 2, clientY:rect.top}), template)
    assert(measurements <= 2, `drop targeting measured a sibling template ${measurements} times`)
    assert(performance.now() - started < 1000, "float targeting stalled on a long document")
    editor.features.manipulation.showFloatDropPreview(target, "left", "transfer", template)
    const lane = previewRect(), measuredBeforeHover = measurements
    const paragraphs = Array.from(doc.querySelectorAll("p")).slice(0, 200)
    const positions = paragraphs.map(paragraph => paragraph.getBoundingClientRect().top + 10)
    const hoverStarted = performance.now()
    for(const index of [...positions.keys(), ...Array.from(positions.keys()).reverse()]) {
      const y = positions[index]
      const container = editor.features.manipulation.floatDropTarget(new events.MouseEvent("mousemove", {clientX:lane.left + lane.width / 2, clientY:y}), template)
      assert(container === paragraphs[index], "cached hover skipped an intermediate paragraph anchor")
      if(container) editor.features.manipulation.showFloatDropPreview(container, editor.features.manipulation.floatSide(container, lane.left + lane.width / 2), "transfer", template)
    }
    assert(measurements === measuredBeforeHover, "rapid hover remeasured insertion geometry")
    assert(performance.now() - hoverStarted < 1000, "rapid hover stalled across cached drop locations")

  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("lane media fills available width and resizes with native handles", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:2400px;height:1000px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><video controls></video><picture><img alt="Placeholder"></picture><native-lane-widget style="display:block;height:80px"></native-lane-widget><p>Reading column</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "media resize fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    doc.querySelector("native-lane-widget")!.attachShadow({mode:"open"}).innerHTML = '<style>:host {width:100%;max-width:200px}</style>Widget'
    for(const target of doc.querySelectorAll<HTMLElement>("video, picture, native-lane-widget")) {
      frame.style.width = "360px"
      await layoutFrame()
      const body = doc.body.getBoundingClientRect(), bodyStyle = view.getComputedStyle(doc.body)
      const contentWidth = body.width - parseFloat(bodyStyle.paddingLeft) - parseFloat(bodyStyle.paddingRight)
      assert(Math.abs(target.getBoundingClientRect().width - contentWidth) < 1, `${target.localName} did not fill its default stacked column`)
      editor.features.manipulation.setFloat(target, "far-right")
      for(const viewport of [360, 700, 1000, 2400]) {
        frame.style.width = `${viewport}px`
        await layoutFrame()
        const body = doc.body.getBoundingClientRect(), bodyStyle = view.getComputedStyle(doc.body)
        const pageWidth = body.width - 2 * Math.min(32, Math.max(16, viewport * .02))
        const expectedWidth = viewport < 600 ? body.width - parseFloat(bodyStyle.paddingLeft) - parseFloat(bodyStyle.paddingRight)
          : viewport < 1200 ? Math.min(256, pageWidth - 300 - Math.min(32, Math.max(16, viewport * .02))) : 688
        assert(Math.abs(target.getBoundingClientRect().width - expectedWidth) < 1, `${target.localName} did not fill its column at ${viewport}px`)
      }
      editor.features.selection.selectElement(target)
      await layoutFrame()
      const transform = editor.features.transformation
      const resize = async (delta: number, cancel = false) => {
        const handle = transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
        const box = handle.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2
        handle.addEventListener("mousedown", event => transform.handleScaleStart(event), {once:true})
        handle.dispatchEvent(new MouseEvent("mousedown", {bubbles:true, composed:true, button:0, clientX:x, clientY:y}))
        transform.handleScaleDrag(new MouseEvent("mousemove", {buttons:1, clientX:x + delta, clientY:y}))
        if(cancel) doc.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}))
        else transform.handleScaleEnd()
        await layoutFrame()
      }
      await resize(-180)
      assert(Math.abs(target.getBoundingClientRect().width - 508) < 1, `${target.localName} did not shrink through its resize handle`)
      await resize(100)
      assert(Math.abs(target.getBoundingClientRect().width - 608) < 1, `${target.localName} did not grow through its resize handle`)
      editor.features.manipulation.setElementStyles(target, {width:"140px", "max-width":null})
      await layoutFrame()
      await resize(180)
      assert(Math.abs(target.getBoundingClientRect().width - 320) < 1, `${target.localName} remained capped at its previous authored width`)
      const initial = target.style.cssText
      await resize(60, true)
      assert(target.style.cssText === initial && Math.abs(target.getBoundingClientRect().width - 320) < 1, "cancelled float resize retained its preferred size")
    }
    const saved = document.createElement("iframe")
    saved.style.cssText = frame.style.cssText
    saved.setAttribute("sandbox", "allow-same-origin")
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once:true}))
    saved.srcdoc = editor.toHTML()
    document.body.append(saved)
    try {
      await loaded
      for(const target of saved.contentDocument!.querySelectorAll("video, picture, native-lane-widget")) {
        assert(Math.abs(target.getBoundingClientRect().width - 320) < 1, "standalone export lost a manual float resize")
      }
    }
    finally { saved.remove() }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("wide widgets remain centered between symmetric float lanes", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1400px;height:900px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><aside id="left" style="width:80px;height:100px">Left</aside><aside id="right" style="width:120px;height:100px">Right</aside><native-wide-widget id="default"></native-wide-widget><native-wide-widget id="wide" style="--ww-widget-max:none"></native-wide-widget><main><native-wide-widget id="nested" style="--ww-widget-max:none"></native-wide-widget></main><p>Reading column</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "wide widget fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    for(const widget of doc.querySelectorAll("native-wide-widget")) {
      widget.attachShadow({mode:"open"}).innerHTML = '<style>:host {display:block;width:100%;max-width:720px;container-type:inline-size;height:60px}</style>Widget'
    }
    const left = doc.querySelector<HTMLElement>("#left")!, right = doc.querySelector<HTMLElement>("#right")!
    const nodes = Array.from(doc.body.childNodes)
    const verify = (document: Document, lanes: boolean) => {
      const style = document.defaultView!.getComputedStyle(document.body), body = document.body.getBoundingClientRect()
      const start = body.left + parseFloat(style.paddingLeft), end = body.right - parseFloat(style.paddingRight)
      const width = end - start, center = (start + end) / 2
      const proseWidth = 45 * parseFloat(document.defaultView!.getComputedStyle(document.documentElement).fontSize)
      const singleLane = lanes && document.documentElement.clientWidth < 1200
      if(!singleLane) {
        assert(Math.abs(parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) < 1, "float lanes are asymmetric")
        const root = document.documentElement.getBoundingClientRect()
        assert(Math.abs(center - (root.left + root.right) / 2) < 1, `reserved column shifted away from the page center: ${JSON.stringify({center, rootRect: root.toJSON(), windowWidth: document.defaultView!.innerWidth, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight})}`)
      }
      else {
        assert(parseFloat(style.paddingRight) > parseFloat(style.paddingLeft) && width >= 300 - 1, "single right lane did not preserve readable text")
        const left = document.querySelector<HTMLElement>("#left")!, right = document.querySelector<HTMLElement>("#right")!
        assert(document.defaultView!.getComputedStyle(left).float === "right" && document.defaultView!.getComputedStyle(right).float === "right", "both floats did not use the right lane")
        assert(left.getBoundingClientRect().left >= end && right.getBoundingClientRect().left >= end, "a float intruded into the text column")
        assert(right.getBoundingClientRect().top >= left.getBoundingClientRect().bottom, "opposing floats overlapped in the shared lane")
      }
      assert((parseFloat(style.paddingRight) > 32) === lanes, "lane reservation did not follow float state")
      if(lanes && !singleLane) assert(Math.abs(width - proseWidth) < 1, "side lanes squeezed the center column")
      for(const id of ["default", "wide", "nested"]) {
        const box = document.querySelector<HTMLElement>(`#${id}`)!.getBoundingClientRect()
        const expectedWidth = id === "default" ? Math.min(proseWidth, width) : width
        assert(Math.abs(box.width - expectedWidth) < 1, `${id} widget width is ${box.width}, expected ${expectedWidth}`)
        assert(Math.abs((box.left + box.right) / 2 - center) < 1, `${id} widget shifted beside a float`)
      }
      const paragraph = document.querySelector("p")!.getBoundingClientRect()
      assert(Math.abs(paragraph.width - Math.min(proseWidth, width)) < 1, "prose lost its default column cap")
    }
    for(const sides of [[], [left], [right], [left, right]]) {
      editor.features.manipulation.setFloat(left, sides.includes(left) ? "far-left" : "none")
      editor.features.manipulation.setFloat(right, sides.includes(right) ? "far-right" : "none")
      await layoutFrame()
      verify(doc, sides.length > 0)
      for(const element of sides) {
        const box = element.getBoundingClientRect(), body = doc.body.getBoundingClientRect(), style = view.getComputedStyle(doc.body)
        assert(element === left ? box.right <= body.left + parseFloat(style.paddingLeft) - 16 : box.left >= body.right - parseFloat(style.paddingRight) + 16, "float intruded into the widget area")
      }
    }
    editor.features.manipulation.setElementStyles(left, {"max-width": "40px"})
    editor.features.manipulation.setElementStyles(right, {"max-width": "60px"})
    await layoutFrame()
    verify(doc, true)
    assert(Math.abs(left.getBoundingClientRect().width - 40) < 1 && Math.abs(right.getBoundingClientRect().width - 60) < 1, "manual resize did not narrow floated elements")
    editor.features.manipulation.setElementStyles(left, {width: "100px", "max-width": "160px"})
    editor.features.manipulation.setElementStyles(right, {"inline-size": "140px", "max-width": "160px"})
    await layoutFrame()
    verify(doc, true)
    assert(Math.abs(left.getBoundingClientRect().width - 100) < 1 && Math.abs(right.getBoundingClientRect().width - 140) < 1, "manual width controls did not resize floats")
    assert(Array.from(doc.body.childNodes).every((node, index) => node === nodes[index]), "lane reservation changed authored structure")
    for(const bundledTheme of documentThemes) {
      theme.textContent = bundledTheme.source
      for(const width of [1400, 1200, 1000, 930, 900, 750, 630, 590, 360]) {
        frame.style.width = `${width}px`
        await layoutFrame()
        verify(doc, doc.documentElement.clientWidth >= 600)
      }
    }
    theme.textContent = defaultDocumentTheme.source
    frame.style.width = "360px"
    await layoutFrame()
    verify(doc, false)
    frame.style.width = "2400px"
    await layoutFrame()
    verify(doc, true)
    const saved = document.createElement("iframe")
    saved.style.cssText = frame.style.cssText
    saved.setAttribute("sandbox", "allow-same-origin")
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once:true}))
    saved.srcdoc = editor.toHTML()
    document.body.append(saved)
    try {
      await loaded
      // Supply the widget runtime contract without running any document scripts.
      for(const widget of saved.contentDocument!.querySelectorAll("native-wide-widget")) {
        widget.attachShadow({mode:"open"}).innerHTML = '<style>:host {display:block;width:100%;max-width:720px;height:60px}</style>Widget'
      }
      verify(saved.contentDocument!, true)
      saved.style.width = "750px"
      await layoutFrame()
      verify(saved.contentDocument!, true)
      saved.style.width = "360px"
      await layoutFrame()
      verify(saved.contentDocument!, false)
    }
    finally { saved.remove() }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("empty document gutters prefer floats throughout the viewport", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1400px;height:700px;max-width:none;border:0"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>Ready</p></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "gutter fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, events = view as unknown as typeof globalThis
    editor.schema.extendWidgets([{tagName: "native-gutter-widget"}])
    for(const width of [418, 900, 1400]) for(const kind of ["ribbon", "shape", "widget", "sole-widget"]) for(const side of ["left", "right"] as const) for(const edge of ["top", "bottom"]) {
      frame.style.width = `${width}px`
      doc.body.innerHTML = kind === "sole-widget" ? "" : '<p id="anchor">Only paragraph</p>'
      const anchor = doc.querySelector("#anchor")
      let widget: HTMLElement | null = null
      const data = new events.DataTransfer()
      if(kind === "widget" || kind === "sole-widget") {
        widget = doc.createElement("native-gutter-widget")
        widget.style.cssText = "display:block;width:120px;height:60px"
        widget.innerHTML = "<!--keep--><span>Authored widget content</span>"
        doc.body.append(widget)
        editor.features.selection.selectElement(widget)
      }
      else data.setData(kind === "shape" ? "application/x-webwriter-ribbon-insertion" : "application/x-webwriter-element-tag", kind === "shape" ? "insert-graphic-shape:rectangle" : "video")
      await layoutFrame()
      if(widget) {
        editor.features.selection.selectElement(widget)
        const surface = editor.appendix.querySelector('[part~="node-drag-surface"]')
        assert(surface, `${width} ${kind} ${side} ${edge}: widget has no drag surface`)
        surface!.dispatchEvent(new events.DragEvent("dragstart", {dataTransfer:data, bubbles:true, composed:true, cancelable:true}))
      }
      const init = {dataTransfer:data, clientX:side === "left" ? 5 : width - 5, clientY:edge === "top" ? 5 : 695, bubbles:true, composed:true, cancelable:true}
      doc.body.dispatchEvent(new events.DragEvent("dragover", init))
      const preview = editor.appendix.querySelector("#◆float-drop-preview")
      assert(preview?.getAttribute("part")?.includes(`float-drop-preview-${side}`), `${width} ${kind} ${side} ${edge}: no matching gutter float preview`)
      const previewBox = preview!.getBoundingClientRect()
      assert(previewBox.width > 0 && previewBox.height > 0, "gutter preview has no visible footprint")
      doc.body.dispatchEvent(new events.DragEvent("drop", init))
      await layoutFrame()
      const inserted = doc.querySelector(kind === "shape" ? "svg" : widget ? "native-gutter-widget" : "video")!
      assert(inserted?.classList.contains(`ww-float-${side}`), `${width} ${kind} ${side} ${edge}: gutter drop entered ordinary flow`)
      if(anchor) assert(inserted.nextElementSibling === anchor, "gutter drop did not use the nearest document anchor")
      else assert(inserted.nextElementSibling?.localName === "p", "sole floated widget left no editable paragraph")
      assert(!(inserted as HTMLElement).style.position, "gutter drop added spatial positioning to the element")
      if(widget) assert(inserted === widget && widget.innerHTML.includes("<!--keep-->"), "gutter drop rebuilt the widget")
      assert(!editor.appendix.querySelector("#◆float-drop-preview") && !doc.body.classList.contains("◆drop-selection-active"), "gutter drop left editing artifacts")
      assert(!editor.toHTML(true).includes("◆"), "gutter drop serialized editor markers")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("empty graphics drag through their full capture outline into floats", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1400px;height:700px;max-width:none;border:0"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p></p></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "empty graphic fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, events = view as unknown as typeof globalThis
    for(const width of [418, 1400]) for(const edge of ["up", "right", "down", "left"]) for(const side of ["left", "right"] as const) {
      frame.style.width = `${width}px`
      doc.body.innerHTML = "<p></p>"
      doc.getSelection()!.setBaseAndExtent(doc.body.firstChild!, 0, doc.body.firstChild!, 0)
      editor.features.selection.processSelection()
      editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
      await layoutFrame()
      const graphic = doc.querySelector("svg")!, box = graphic.getBoundingClientRect()
      assert(editor.features.selection.captureSelectedElement === graphic, "new empty graphic did not enter capture editing")
      for(const inset of [-3, 2]) {
        const x = edge === "left" ? box.left + inset : edge === "right" ? box.right - inset : box.left + box.width / 3
        const y = edge === "up" ? box.top + inset : edge === "down" ? box.bottom - inset : box.top + box.height / 3
        // On compact pages, the outside strip can meet the native scrollbar.
        if(!doc.elementFromPoint(x, y)) continue
        const hit = editor.appendix.elementFromPoint(x, y) as HTMLElement | null
        assert(hit?.getAttribute("part")?.split(/\s+/).includes(`transform-overlay-edge-${edge}`) && hit.draggable,
          `${width} ${edge} inset ${inset}: capture outline blocks the native drag handle`)
      }
      const handle = editor.features.transformation.overlay.querySelector<HTMLElement>(`[part~="transform-overlay-edge-${edge}"]`)!
      const press = new events.PointerEvent("pointerdown", {bubbles:true, composed:true, cancelable:true, button:0})
      handle.dispatchEvent(press)
      assert(!press.defaultPrevented, "graphic border prevented native drag initiation")
      const data = new events.DataTransfer()
      handle.dispatchEvent(new events.DragEvent("dragstart", {dataTransfer:data, bubbles:true, composed:true, cancelable:true}))
      assert(editor.features.manipulation.draggedElement === graphic, "graphic border did not start a node drag")
      const init = {dataTransfer:data, clientX:side === "left" ? 5 : width - 5, clientY:695, bubbles:true, composed:true, cancelable:true}
      doc.body.dispatchEvent(new events.DragEvent("dragover", init))
      assert(editor.appendix.querySelector("#◆float-drop-preview"), "empty graphic has no float preview")
      doc.body.dispatchEvent(new events.DragEvent("drop", init))
      handle.dispatchEvent(new events.DragEvent("dragend", {dataTransfer:data, bubbles:true, composed:true}))
      await layoutFrame()
      assert(graphic.classList.contains(`ww-float-${side}`), `${width} ${edge} ${side}: empty graphic did not retain the pointer's float side`)
      assert(view.getComputedStyle(graphic).float === (width < 600 ? "none" : side), `${width} ${edge} ${side}: empty graphic did not use the responsive float layout`)
      assert(view.getComputedStyle(graphic).position === "static" && !graphic.style.left && !graphic.style.top, "empty graphic used spatial positioning")
      assert(graphic.children.length === 0 && graphic.getAttribute("viewBox") === "0 0 1600 900", "drag changed the drawing area")
      assert(!editor.features.manipulation.draggedElement && !editor.appendix.querySelector("#◆float-drop-preview"), "empty graphic drag left stale state")
      assert(!editor.toHTML(true).includes("◆"), "empty graphic serialized editor artifacts")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("shape keyboard drops stay in captured graphics and ribbon shapes use document flow", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1400px;min-width:1400px;max-width:none;height:700px;border:0"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>Ready</p></body>`
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "shape drop fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    for(const width of [1400, 1900]) for(const container of ["body", "main"]) for(const source of ["keyboard", "ribbon"]) for(const side of ["left", "right", "flow"] as const) {
      frame.style.width = `${width}px`
      const content = '<!--keep--><p id="anchor" style="height:160px">Before the shape. The document content remains in its column.</p><p id="after">Following paragraph</p>'
      doc.body.innerHTML = container === "main" ? `<main>${content}</main>` : content
      const main = container === "main" ? doc.querySelector("main")! : doc.body
      const anchor = doc.querySelector("#anchor")!, after = doc.querySelector("#after")!
      doc.getSelection()!.setBaseAndExtent(anchor.firstChild!, 0, anchor.firstChild!, 0)
      editor.features.selection.processSelection()
      await layoutFrame()
      const data: Record<string, string> = source === "keyboard"
        ? {"application/x-webwriter-graphic-shape": JSON.stringify({shape: "rectangle", paint: {fill: "#fbbf24", stroke: "#334155"}})}
        : {"application/x-webwriter-ribbon-insertion": "insert-graphic-shape:rectangle"}
      const box = anchor.getBoundingClientRect()
      if(source === "keyboard") {
        const before = main.innerHTML
        assert(replayHostDrag({event: "dragover", x: box.left + box.width / 2, y: box.bottom + 8, data}, doc), "keyboard dragover was not claimed")
        assert(!editor.appendix.querySelector("#◆float-drop-preview, #◆insertion-preview"), "keyboard shape showed a document placement preview")
        assert(replayHostDrag({event: "drop", x: box.left + box.width / 2, y: box.bottom + 8, data}, doc), "keyboard drop was not claimed")
        await layoutFrame()
        assert(!main.querySelector("svg") && main.innerHTML === before, "keyboard shape changed ordinary document content")
        assert(!doc.body.classList.contains("◆drop-selection-active") && !editor.appendix.querySelector("#◆float-drop-preview"), "rejected keyboard drop left a preview")
        continue
      }
      let x = box.left + box.width / 2, y = box.bottom + 8
      if(side !== "flow") {
        const graphic = editor.features.graphic.createGraphic("rectangle")
        editor.features.manipulation.showFloatDropPreview(anchor, side, "transfer", graphic)
        const preview = editor.appendix.querySelector("#◆float-drop-preview")!.getBoundingClientRect()
        x = preview.left + preview.width / 2; y = preview.top + preview.height / 2
        editor.features.manipulation.clearFloatDropPreview("transfer")
      }
      assert(replayHostDrag({event: "dragover", x, y, data}, doc), `${source} ${side}: dragover was rejected`)
      assert(Boolean(editor.appendix.querySelector("#◆float-drop-preview")) === (side !== "flow"), `${source} ${side}: incorrect placement preview`)
      assert(replayHostDrag({event: "drop", x, y, data}, doc), `${source} ${side}: drop was rejected`)
      await layoutFrame()
      const graphic = main.querySelector("svg")!
      assert(graphic && graphic.parentElement === main, `${source} ${side}: no shape in the document`)
      assert(view.getComputedStyle(graphic).position === "static", `${source} ${side}: shape is absolutely positioned`)
      assert(view.getComputedStyle(graphic).float === (side === "flow" ? "none" : side), `${source} ${side}: wrong float placement`)
      assert(main.firstChild?.nodeType === Node.COMMENT_NODE && anchor.isConnected && after.isConnected, `${source} ${side}: authored content changed`)
      if(side === "flow") {
        const shapeBox = graphic.getBoundingClientRect(), anchorBox = anchor.getBoundingClientRect()
        assert(shapeBox.top >= anchorBox.bottom, `${source}: flow shape overlaps the preceding paragraph`)
        assert(Math.abs(shapeBox.left + shapeBox.width / 2 - anchorBox.left - anchorBox.width / 2) < 1, `${source}: flow shape is outside the content column`)
      }
      else assert(graphic.nextElementSibling === anchor, `${source} ${side}: float is not beside its anchor`)
      assert(!doc.body.classList.contains("◆drop-selection-active") && !editor.appendix.querySelector("#◆float-drop-preview"), "shape drop left editing artifacts")
      assert(!editor.toHTML(true).includes("◆"), "serialized shape contains editing artifacts")
    }
    frame.style.minWidth = "0"
    for(const width of [418, 900, 1400]) for(const source of ["command", "ribbon", "keyboard"]) {
      frame.style.width = `${width}px`
      doc.body.innerHTML = '<p>Before</p><p id="insertion"></p><p id="after">After</p>'
      const insertion = doc.querySelector("#insertion")!, after = doc.querySelector("#after")!
      doc.getSelection()!.setBaseAndExtent(insertion, 0, insertion, 0)
      editor.features.selection.processSelection()
      await layoutFrame()
      if(source === "command") editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
      else {
        const rect = insertion.getBoundingClientRect()
        const data: Record<string, string> = source === "keyboard"
          ? {"application/x-webwriter-graphic-shape": JSON.stringify({shape: "rectangle"})}
          : {"application/x-webwriter-ribbon-insertion": "insert-graphic-shape:rectangle"}
        const point = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, data}
        replayHostDrag({event: "dragover", ...point}, doc)
        replayHostDrag({event: "drop", ...point}, doc)
      }
      await layoutFrame()
      const graphic = doc.querySelector("svg")!
      if(source === "keyboard") {
        assert(!graphic, `${width}: uncaptured keyboard drop inserted a graphic`)
        assert(insertion.isConnected && after.isConnected && after.textContent === "After", `${width}: rejected keyboard drop changed document flow`)
        assert(!doc.body.classList.contains("◆drop-selection-active") && !editor.appendix.querySelector("#◆float-drop-preview"), `${width}: rejected keyboard drop left insertion chrome`)
        continue
      }
      assert(graphic && view.getComputedStyle(graphic).position === "static", `${source} ${width}: new shape is spatially positioned`)
      assert(!graphic.style.left && !graphic.style.top && !graphic.style.right && !graphic.style.bottom, `${source} ${width}: new shape has position offsets`)
      if(source === "command") assert(after.getBoundingClientRect().top >= graphic.getBoundingClientRect().bottom, `${width}: shape command removed the shape from document flow`)
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("ribbon elements are rejected over captured graphics with native content and cleanup", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1200px;max-width:none;height:800px;border:0"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>Ready</p></body>`
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "ribbon graphic fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const events = view as unknown as {DragEvent: typeof DragEvent, DataTransfer: typeof DataTransfer}
    const actions = ["element:table", "element:video", "element:picture", "element:math", "insert-math:frac", "insert-graphic-shape:ellipse", "list-style:ol:lower-alpha", "package-member:demo"]
    for(const action of actions) {
      doc.body.innerHTML = '<svg viewBox="100 50 600 300" style="display:block;width:600px;height:300px;margin:60px auto"><!--keep--><rect x="130" y="80" width="100" height="80" fill="skyblue"/></svg><p>After</p>'
      const graphic = doc.querySelector("svg")!, original = graphic.innerHTML, rect = graphic.querySelector("rect")!, after = doc.body.lastElementChild!
      editor.features.selection.captureElement(graphic)
      await layoutFrame()
      const data = new events.DataTransfer()
      data.setData("application/x-webwriter-ribbon-insertion", action)
      if(action === "package-member:demo") data.setData("text/html", '<demo-widget><p>Nested content</p></demo-widget>')
      const box = graphic.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2
      const dispatch = (target: EventTarget, type: string) => {
        const event = new events.DragEvent(type, {bubbles:true, cancelable:true, composed:true, dataTransfer:data, clientX:x, clientY:y})
        target.dispatchEvent(event)
        return event
      }
      const hostMessages: MessageEvent[] = []
      const receive = (event: MessageEvent) => { if(event.source === view && event.data?.type === "editor-ribbon-drop") hostMessages.push(event) }
      window.addEventListener("message",receive)
      const rootOver = dispatch(graphic,"dragover")
      assert(rootOver.defaultPrevented && data.dropEffect === "none", `${action}: root dragover offered a drop`)
      const rootDrop = dispatch(graphic,"drop")
      assert(rootDrop.defaultPrevented, `${action}: root drop was not claimed`)
      const childOver = dispatch(rect,"dragover")
      assert(childOver.defaultPrevented && data.dropEffect === "none", `${action}: child dragover offered a drop`)
      const childDrop = dispatch(rect,"drop")
      assert(childDrop.defaultPrevented, `${action}: child drop was not claimed`)
      const overlay = editor.appendix.querySelector('[part~="transform-overlay"]') ?? editor.appendix.querySelector('[part~="node-drag-surface"]') ?? editor.appendix.querySelector("slot")
      assert(overlay, `${action}: no appendix overlay to test`)
      if(!overlay) throw new Error(`${action}: no appendix overlay to test`)
      const overlayOver = dispatch(overlay,"dragover")
      assert(overlayOver.defaultPrevented && data.dropEffect === "none", `${action}: appendix dragover offered a drop`)
      const overlayDrop = dispatch(overlay,"drop")
      assert(overlayDrop.defaultPrevented, `${action}: appendix drop was not claimed`)
      await layoutFrame()
      window.removeEventListener("message",receive)
      assert(hostMessages.length === 0, `${action}: rejected graphic drop emitted a host ribbon message`)
      assert(graphic.innerHTML === original && graphic.querySelector("rect") === rect && after.isConnected && after.textContent === "After", `${action}: source DOM changed`)
      assert(editor.features.selection.captureSelectedElement === graphic, `${action}: capture changed`)
      assert(!doc.body.classList.contains("◆drop-selection-active"), `${action}: drop selection marker remained`)
      const caret = editor.appendix.querySelector(".◆selection-caret")
      assert(!editor.appendix.querySelector("#◆float-drop-preview, #◆insertion-preview") && !caret?.getAttribute("part")?.includes("drop-caret"), `${action}: drop caret/preview remained`)
      assert(!graphic.querySelector('[class*="◆drop-caret"]'), `${action}: authored drop caret remained`)
      assert(!editor.toHTML(true).includes("◆"), `${action}: editor chrome leaked into serialization`)
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("shape keyboard drags retain capture through appendix surfaces", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1400px;min-width:1400px;max-width:none;height:850px;border:0"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>Ready</p></body>`
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "keyboard drag fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const events = view as unknown as {DragEvent: typeof DragEvent, DataTransfer: typeof DataTransfer}
    doc.body.innerHTML = '<svg viewBox="0 0 600 300" style="display:block;width:600px;height:300px"><!--keep--><rect x="100" y="80" width="160" height="120" fill="skyblue"/></svg><p id="anchor" style="height:140px">Document drop target</p>'
    const graphic = doc.querySelector("svg")!, original = graphic.querySelector("rect")!, paragraph = doc.querySelector("p")!
    editor.features.selection.captureElement(graphic)
    await layoutFrame()
    const data = new events.DataTransfer()
    data.setData("application/x-webwriter-graphic-shape", JSON.stringify({shape:"ellipse", paint:{fill:"#fbbf24"}}))
    const dispatch = (target: EventTarget, type: string, x: number, y: number) => {
      const event = new events.DragEvent(type, {bubbles:true, cancelable:true, composed:true, dataTransfer:data, clientX:x, clientY:y})
      target.dispatchEvent(event)
      return event
    }
    const box = graphic.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2
    const surface = editor.appendix.querySelector(".◆transform-overlay") ?? editor.appendix.querySelector("slot")!
    const foreign = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
    foreign.setAttribute("viewBox", "0 0 100 100")
    foreign.style.cssText = "display:block;width:100px;height:100px"
    doc.body.append(foreign)
    await layoutFrame()
    const paragraphBox = paragraph.getBoundingClientRect(), foreignBox = foreign.getBoundingClientRect()
    for(const [target, point] of [[paragraph, {x:paragraphBox.left + 10, y:paragraphBox.top + 10}], [foreign, {x:foreignBox.left + 10, y:foreignBox.top + 10}]] as const) {
      assert(dispatch(target, "dragover", point.x, point.y).defaultPrevented, "outside shape dragover was not claimed")
      assert(data.dropEffect === "none" && editor.features.selection.captureSelectedElement === graphic, "outside hover changed drop eligibility or capture")
      assert(dispatch(target, "drop", point.x, point.y).defaultPrevented, "outside shape drop was not claimed")
      assert(doc.querySelectorAll("svg").length === 2 && editor.features.selection.captureSelectedElement === graphic, "outside drop changed the graphic or capture")
    }
    assert(surface && dispatch(surface, "dragover", x, y).defaultPrevented, "shape hover was not accepted on the selected graphic surface")
    const outline = editor.appendix.querySelector(".◆selection-caret")
    for(let index = 0; index < 5; index++) {
      await layoutFrame()
      assert(editor.features.selection.captureSelectedElement === graphic && !editor.appendix.querySelector('[part~="node-drag-surface"]'), "graphic hover flickered back to element selection")
      assert(!editor.appendix.querySelector("#◆float-drop-preview"), "graphic hover showed a document placement preview")
      dispatch(doc.elementFromPoint(x, y) ?? graphic, "dragover", x, y)
    }
    assert(editor.appendix.querySelector(".◆selection-caret") === outline, "graphic hover replaced its selection chrome")
    assert(dispatch(doc.elementFromPoint(x, y) ?? graphic, "drop", x, y).defaultPrevented, "graphic shape drop was rejected")
    assert(doc.querySelectorAll("svg").length === 2 && graphic.querySelector("rect") === original && graphic.querySelector("ellipse"), "shape was not added to the existing graphic")
    // Native events in blank document space can originate on the appendix slot.
    for(const type of ["dragend", "drop"]) {
      const bounds = paragraph.getBoundingClientRect()
      const dropX = bounds.left + bounds.width / 2, dropY = bounds.top + bounds.height / 2
      const slot = editor.appendix.querySelector("slot")!
      assert(dispatch(slot, "dragover", dropX, dropY).defaultPrevented, "slot shape hover was not claimed")
      assert(data.dropEffect === "none" && !editor.appendix.querySelector("#◆float-drop-preview"), "slot hover offered a document drop")
      const ending = dispatch(slot, type, dropX, dropY)
      if(type === "drop") assert(ending.defaultPrevented, "slot drop was not claimed")
      await layoutFrame()
      assert(doc.querySelectorAll("svg").length === 2, `slot ${type} inserted another graphic`)
      assert(!doc.body.classList.contains("◆drop-selection-active") && !editor.appendix.querySelector("#◆float-drop-preview"), `slot ${type} left a float preview behind`)
    }
    assert(paragraph.textContent === "Document drop target" && !editor.toHTML(true).includes("◆"), "keyboard dragging altered document text or serialized editor chrome")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

await check("native drag floats in preview areas and preserves ordinary gap drops", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;inline-size:1400px;min-inline-size:1400px;max-inline-size:none;height:700px;border:0"
  const id = "native-float-halves"
  const result = new Promise<string | null>(resolve => {
    const receive = (event: MessageEvent) => {
      if(event.source !== frame.contentWindow || event.data?.id !== id) return
      window.removeEventListener("message", receive)
      resolve(event.data.error ?? null)
    }
    window.addEventListener("message", receive)
  })
  frame.srcdoc = `<!doctype html><body><main style="width:600px"><p id="peer" style="width:320px;height:80px;margin-left:200px;color:rebeccapurple">Peer</p><p id="source" style="width:120px;height:50px;margin:9px;color:teal">Source</p><p>Following sibling</p></main><script type="module">
    import {DOMEditor} from "/src/domeditor.ts";
    import {defaultDocumentTheme} from "/src/document-themes.ts";
    const assert = (condition, message) => {if(!condition) throw new Error(message)};
    let editor;
    try {
      editor = new DOMEditor({bridgeOrigin: parent.location.origin});
      const peer = document.querySelector("#peer"), source = document.querySelector("#source"), main = peer.parentElement;
      const siblings = Array.from(main.childNodes), originalStyle = source.style.cssText;
      const floatPoint = (element, side) => {
        editor.features.manipulation.showFloatDropPreview(peer, side, "transfer", element);
        const box = editor.appendix.querySelector("#◆float-drop-preview").getBoundingClientRect();
        editor.features.manipulation.clearFloatDropPreview("transfer");
        return {clientX:box.left + box.width / 2, clientY:box.top + box.height / 2};
      };
      const selfChild = source.appendChild(document.createElement("span"));
      selfChild.textContent = "nested";
      for(const mode of ["transfer", "transformation"]) for(const fraction of [0.25, 0.75]) {
        source.style.cssText = originalStyle;
        editor.features.selection.selectElement(source);
        const rect = source.getBoundingClientRect();
        const init = {clientX:rect.left + rect.width * fraction, clientY:rect.top + rect.height / 2, bubbles:true, cancelable:true, composed:true};
        if(mode === "transfer") {
          const dataTransfer = new DataTransfer();
          const dragSurface = editor.appendix.querySelector('[part~="node-drag-surface"]');
          dragSurface.dispatchEvent(new DragEvent("dragstart", {dataTransfer, bubbles:true, cancelable:true, composed:true}));
          selfChild.dispatchEvent(new DragEvent("dragover", {...init, dataTransfer}));
          assert(!editor.appendix.querySelector("#◆float-drop-preview"), "self transfer shows a float preview");
          selfChild.dispatchEvent(new DragEvent("drop", {...init, dataTransfer}));
        }
        else {
          const transform = editor.features.transformation;
          transform.handleMoveStart(new MouseEvent("mousedown", {...init, button:0, clientX:rect.left + rect.width / 2}));
          transform.handleMoveDrag(new MouseEvent("mousemove", {...init, button:0}));
          assert(!editor.appendix.querySelector("#◆float-drop-preview"), "self transformation shows a float preview");
          transform.handleMoveEnd();
        }
        assert(source.style.cssText === originalStyle && source.parentElement === main, "self drop changed authored float or styles");
      }
      selfChild.remove();
      for(const [fraction, side, placement] of [[0.35, "left", "before"], [0.5, "right", "before"], [0.65, "right", "before"]]) {
        source.style.cssText = originalStyle;
        editor.features.selection.selectElement(source);
        const dragSurface = editor.appendix.querySelector('[part~="node-drag-surface"]');
        assert(dragSurface, "source has no drag surface");
        const dataTransfer = new DataTransfer();
        dragSurface.dispatchEvent(new DragEvent("dragstart", {dataTransfer, bubbles:true, cancelable:true, composed:true}));
        const rect = peer.getBoundingClientRect();
        const init = {dataTransfer, ...floatPoint(source, side), bubbles:true, cancelable:true, composed:true};
        peer.dispatchEvent(new DragEvent("dragover", init));
        peer.dispatchEvent(new DragEvent("drop", init));
        assert(source.parentElement === main && source.classList.contains(side === "left" ? "ww-float-left" : "ww-float-right") && !source.style.float, "drop did not apply the expected preview float class: " + side);
        assert(source.style.width === "120px" && source.style.height === "50px" && source.style.color === "teal", "float changed unrelated source styles");
        assert(source.style.margin === "9px" && !source.style.maxWidth
          && source.style.getPropertyValue("--ww-float-size").includes("120px"), "float command lost the authored width or injected lane spacing: " + side);
        assert(siblings.length === main.childNodes.length && siblings.every(node => main.contains(node)), "drag removed authored siblings or added a wrapper");
        assert(placement === "before" ? source.compareDocumentPosition(peer) & Node.DOCUMENT_POSITION_FOLLOWING : source.compareDocumentPosition(peer) & Node.DOCUMENT_POSITION_PRECEDING, "drop ignored vertical before/after placement");
        assert(!main.querySelector(".ww-column-group, [class*=ww-column-]"), "drag created column markup");
      }
      const leading = document.createElement("p");
      leading.textContent = "Leading paragraph";
      main.prepend(leading);
      for(const placement of ["before", "after", "outside-left"]) {
        source.style.cssText = originalStyle;
        main.append(source);
        editor.features.manipulation.setFloat(source, "right");
        editor.features.selection.selectElement(source);
        await new Promise(requestAnimationFrame);
        const dragSurface = editor.appendix.querySelector('[part~="node-drag-surface"]');
        const dataTransfer = new DataTransfer();
        dragSurface.dispatchEvent(new DragEvent("dragstart", {dataTransfer, bubbles:true, cancelable:true, composed:true}));
        const rect = peer.getBoundingClientRect();
        const init = {dataTransfer, clientX:placement === "outside-left" ? rect.left - 5 : rect.left + rect.width / 2,
          clientY:placement === "before" ? rect.top - 5 : placement === "after" ? rect.bottom + 5 : rect.top + rect.height / 2,
          bubbles:true, cancelable:true, composed:true};
        main.dispatchEvent(new DragEvent("dragover", init));
        assert(!editor.appendix.querySelector("#◆float-drop-preview"), "gap incorrectly showed a float preview");
        main.dispatchEvent(new DragEvent("drop", init));
        assert(source.parentElement === main && getComputedStyle(source).float === "none"
          && !source.classList.contains("ww-float-left") && !source.classList.contains("ww-float-right")
          && source.style.margin === "9px" && !source.style.maxWidth, "ordinary gap drop retained float styling or lost authored margin");
        assert(source.style.width === "120px" && source.style.height === "50px" && source.style.color === "teal", "ordinary gap drop changed unrelated styles");
        if(placement === "before") assert(source.nextElementSibling === peer, "drop above peer did not insert before it");
        if(placement === "after") assert(source.previousElementSibling === peer, "drop below peer did not insert after it");
      }
      for(const overElement of [false, true]) {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/html", '<picture style="float:right;margin:5px;max-width:50%;color:red"><img alt="Dropped image"></picture>');
        const rect = peer.getBoundingClientRect();
        const template = document.createElement("picture");
        template.style.cssText = "float:right;margin:5px;max-width:50%;color:red";
        template.innerHTML = '<img alt="Dropped image">';
        const init = {dataTransfer, ...(overElement ? floatPoint(template, "left") : {clientX:rect.left + rect.width / 2, clientY:rect.bottom + 5}),
          bubbles:true, cancelable:true, composed:true};
        (overElement ? peer : main).dispatchEvent(new DragEvent("dragover", init));
        (overElement ? peer : main).dispatchEvent(new DragEvent("drop", init));
        const dropped = main.querySelector("picture");
        assert(dropped, "external image drop lost its content");
        assert(overElement ? dropped.classList.contains("ww-float-left") : !dropped.classList.contains("ww-float-left") && !dropped.classList.contains("ww-float-right"), "external image drop ignored element bounds");
        assert(!dropped.style.float && !dropped.style.margin && !dropped.style.getPropertyValue("--ww-float-size"), "external image drop injected inline float spacing: " + dropped.outerHTML);
        dropped.remove();
      }
      for(const fraction of [0.35, 0.5, 0.65, null]) {
        source.style.cssText = originalStyle;
        main.append(source);
        editor.features.manipulation.setFloat(source, "left");
        editor.features.selection.selectElement(source);
        editor.features.transformation.startTransform(source);
        const start = source.getBoundingClientRect(), rect = peer.getBoundingClientRect();
        editor.features.transformation.handleMoveStart(new MouseEvent("mousedown", {button:0, clientX:start.left, clientY:start.top}));
        editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", fraction === null ? {clientX:rect.left + rect.width / 2, clientY:rect.bottom + 5} : floatPoint(source, fraction < 0.5 ? "left" : "right")));
        const preview = editor.appendix.querySelector("#◆float-drop-preview");
        assert(fraction === null ? !preview || preview.hidden : preview && !preview.hidden, "drag handle preview ignored element bounds");
        editor.features.transformation.handleMoveEnd();
        assert(fraction === null ? !source.classList.contains("ww-float-left") && !source.classList.contains("ww-float-right")
          : source.classList.contains(fraction < 0.5 ? "ww-float-left" : "ww-float-right"), "drag handle did not use the preview areas");
        assert(source.style.margin === "9px" && (fraction === null ? !source.style.getPropertyValue("--ww-float-size") : source.style.getPropertyValue("--ww-float-size").includes("120px")), "handle drop lost its authored margin or retained incorrect float sizing");
        if(fraction === null) assert(source.previousElementSibling === peer, "handle gap drop did not place source after the paragraph");
      }
      const picture = document.createElement("picture"), image = document.createElement("img"), text = document.createElement("p");
      const theme = document.createElement("style");
      theme.textContent = defaultDocumentTheme.source;
      document.head.append(theme);
      picture.style.cssText = "display:block;width:100%;height:120px;background:#eee";
      image.alt = "Empty image placeholder";
      image.style.cssText = "display:block;width:100%;height:100%";
      picture.append(image);
      text.textContent = "A long paragraph wraps beside the empty image placeholder. ".repeat(8);
      text.style.cssText = "line-height:24px";
      main.replaceChildren(picture, text);
      editor.features.manipulation.setFloat(picture, "right");
      await new Promise(requestAnimationFrame);
      const pictureRect = picture.getBoundingClientRect(), parentRect = main.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(text);
      const firstLine = range.getClientRects()[0];
      assert(firstLine && Math.abs(firstLine.top - pictureRect.top) < 8, "first line is offset below the floated picture: " + JSON.stringify({picture:pictureRect.top, text:firstLine?.top, margin:getComputedStyle(text).marginTop}));
      // cqw uses the root content box, excluding both reserved scrollbar gutters.
      const pageContainerWidth = document.documentElement.getBoundingClientRect().width;
      const pageGutter = Math.min(32, Math.max(16, pageContainerWidth * .02));
      assert(pictureRect.width > 256 && Math.abs(pictureRect.width - Math.max(256, (pageContainerWidth - 2 * pageGutter - 720) / 2 - pageGutter)) < 1, "default picture did not fill its float lane: " + JSON.stringify({picture:pictureRect.width, pageContainerWidth, pageGutter, innerWidth, rootClientWidth:document.documentElement.clientWidth}));
      assert(picture.classList.contains("ww-float-right") && !picture.style.float && !picture.style.margin && !picture.style.maxWidth
        && picture.style.getPropertyValue("--ww-float-size").includes("100%"), "floated picture did not preserve its authored width through theme geometry");
      assert(firstLine && firstLine.bottom > pictureRect.top && firstLine.top < pictureRect.top + 24 && firstLine.right <= pictureRect.left - 5, "paragraph did not wrap beside the floated placeholder: " + JSON.stringify({picture:pictureRect, firstLine, parent:parentRect}));
      // Authored overrides can still put floats inside text; preserve contour coverage.
      const setOverlappingFloat = side => {
        editor.features.manipulation.setFloat(picture, side);
        picture.style.setProperty("margin-left", "5px", "important");
        picture.style.setProperty("margin-right", "5px", "important");
      };
      text.style.setProperty("display", "block", "important");
      setOverlappingFloat("right");
      await new Promise(requestAnimationFrame);
      text.dispatchEvent(new PointerEvent("pointerover", {bubbles:true}));
      const hover = editor.features.selection.hoverCaret;
      assert(hover.getAttribute("part").includes("hover-caret-floats") && getComputedStyle(hover).outlineStyle === "none", "paragraph hover outline still spans its floated sibling");
      const outline = hover.querySelector('[part="hover-float-outline"]');
      assert(outline?.querySelector("mask path"), "float hover outline did not exclude the image box");
      const hoverPath = [];
      for(let node = text; node !== document.body; node = node.parentNode) hoverPath.unshift(Array.from(node.parentNode.childNodes).indexOf(node));
      editor.features.selection.actions.hoverNode({type:"hoverNode", path:hoverPath});
      assert(getComputedStyle(hover).outlineStyle === "none", "breadcrumb hover restored an outline over the float");
      const hoveredHTML = new DOMParser().parseFromString(editor.toHTML(true), "text/html").querySelector("main").outerHTML;
      assert(!main.querySelector("svg") && !hoveredHTML.includes("hover-float-mask"), "float hover outline leaked into authored HTML");
      editor.features.selection.actions.hoverNode({type:"hoverNode", path:null});
      picture.dispatchEvent(new PointerEvent("pointerover", {bubbles:true}));
      assert(!hover.querySelector('[part="hover-float-outline"]'), "floated image lost its own ordinary outline");
      const paragraphText = text.textContent;
      for(const side of ["left", "right"]) for(const long of [false, true]) {
        setOverlappingFloat(side);
        text.textContent = long ? paragraphText : "Text flows beside the floated image.";
        editor.features.selection.selectElement(text);
        text.dispatchEvent(new PointerEvent("pointerover", {bubbles:true}));
        await new Promise(requestAnimationFrame);
        const selected = editor.features.selection.selectionCaret;
        assert(selected.getAttribute("part").includes("selection-caret-floats") && getComputedStyle(selected).outlineStyle === "none", "selection outline crosses the floated image");
        assert(selected.querySelector('[part~="selection-float-outline"] mask').id !== hover.querySelector("mask").id, "selection and hover contours share a mask ID");
        const imageBox = picture.getBoundingClientRect();
        const controls = editor.features.transformation.overlay.querySelectorAll(".◆transform-overlay-scale, #◆transform-overlay-mover, #◆transform-overlay-delete");
        for(const control of controls) {
          if(control.hidden) continue;
          const box = control.getBoundingClientRect();
          assert(!(box.left < imageBox.right && box.right > imageBox.left && box.top < imageBox.bottom && box.bottom > imageBox.top), "selection handle overlaps the floated image: " + control.id);
        }
        editor.features.selection.captureElement(text);
        assert(selected.querySelectorAll(".◆capture-edge").length === 4, "float contour replaced capture edges");
        assert(getComputedStyle(selected.querySelector('[part~="selection-float-outline"]')).strokeDasharray === "none", "captured contour is still dotted");
      }
      text.textContent = paragraphText;
      range.selectNodeContents(text);
      for(const side of ["left", "right"]) {
        setOverlappingFloat(side);
        const line = range.getClientRects()[0];
        const init = {bubbles:true, cancelable:true, button:0, buttons:1, pointerId:88, clientX:line.left + 10, clientY:line.top + line.height / 2};
        text.dispatchEvent(new PointerEvent("pointerover", init));
        text.dispatchEvent(new PointerEvent("pointerdown", init));
        // Pointer capture retargets boundary and move events to BODY.
        document.body.dispatchEvent(new PointerEvent("pointerover", init));
        document.body.dispatchEvent(new PointerEvent("pointermove", {...init, clientX:line.left + 30}));
        await new Promise(requestAnimationFrame);
        assert(hover.getAttribute("part").includes("hover-caret-floats") && getComputedStyle(hover).outlineStyle === "none", "held pointer restored the rectangular hover outline");
        assert(hover.querySelector('[part~="hover-float-outline"] mask path'), "held pointer lost the float contour");
        document.body.dispatchEvent(new PointerEvent("pointerup", {...init, buttons:0}));
      }
      setOverlappingFloat("right");
      editor.features.selection.selectElement(picture);
      assert(!editor.features.selection.selectionCaret.querySelector('[part~="selection-float-outline"]'), "floated image lost its own full selection outline");
      const preceding = document.createElement("p");
      preceding.textContent = "Preceding paragraph";
      main.prepend(preceding);
      await new Promise(requestAnimationFrame);
      assert(Math.abs(range.getClientRects()[0].top - picture.getBoundingClientRect().top) < 8, "text and image did not align after a preceding block");
      preceding.remove();
      const html = new DOMParser().parseFromString(editor.toHTML(true), "text/html").querySelector("main").outerHTML;
      assert(html.includes("ww-float-right") && !html.includes("◆") && !html.includes("ww-column"), "float serialization retained editing artifacts or lost its float class");
      editor.features.manipulation.setFloat(picture, "none");
      assert(!picture.classList.contains("ww-float-left") && !picture.classList.contains("ww-float-right") && !picture.style.margin, "clearing float retained float styling");
      await new Promise(requestAnimationFrame);
      assert(Math.abs(picture.getBoundingClientRect().width - parentRect.width) < 1, "clearing float did not restore the full-width image placeholder");
      const first = document.createElement("p"), second = document.createElement("p");
      first.textContent = "First paragraph";
      second.textContent = "Second paragraph";
      main.replaceChildren(first, second);
      const spacing = parseFloat(getComputedStyle(first).marginBottom);
      assert(spacing > 0 && Math.abs(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom - spacing) < 1, "ordinary paragraphs lost their block spacing");
      assert(getComputedStyle(second).marginBottom === "0px", "last paragraph retained an extra trailing gap");
      parent.postMessage({id:${JSON.stringify(id)}}, "*");
    } catch(error) {parent.postMessage({id:${JSON.stringify(id)}, error:String(error)}, "*")}
    finally {editor?.destroy()}
  <\/script>`
  document.body.append(frame)
  try { assert(await result === null, `native float drag check: ${await result}`) }
  finally { frame.remove() }
})

await check("version previews preserve editing mode and reject native and direct mutations", async () => {
  const section = document.createElement("section")
  section.id = "native-history-section"
  section.innerHTML = '<p>Hello</p><custom-history-widget state="ready"></custom-history-widget><template><b>Template</b></template><svg xmlns="http://www.w3.org/2000/svg"><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#shape"></use></svg>'
  fixture.append(section)
  const history = editor.features.history
  try {
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const saved = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId})
    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: saved.versions[0].id})
    assert(document.designMode === "on", "preview disabled editing mode")
    const previewSection = document.querySelector("#native-history-section")!
    const paragraph = previewSection.querySelector("p")!
    const source = editor.toHTML(false, false)
    const beforeInput = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "Blocked"})
    paragraph.dispatchEvent(beforeInput)
    assert(beforeInput.defaultPrevented, "native mutation event was allowed")
    const widget = previewSection.querySelector("custom-history-widget")!
    paragraph.textContent = "Blocked"
    widget.setAttribute("state", "changed")
    previewSection.querySelector("template")!.content.querySelector("b")!.textContent = "Blocked template"
    previewSection.querySelector("use")!.removeAttributeNS("http://www.w3.org/1999/xlink", "href")
    previewSection.append(document.createElement("aside"))
    await layoutFrame()
    assert(editor.toHTML(false, false) === source, "preview mutations survived their observer boundary")
    assert(previewSection.querySelector("p") === paragraph && previewSection.querySelector("custom-history-widget") === widget,
      "mutation rollback replaced existing preview nodes")
    history.clearPreview()
    assert(!editor.isEditingLocked, "preview lock survived closing")
    document.querySelector("#native-history-section p")!.textContent = "Editable again"
    await layoutFrame()
    assert(editor.doc.body.toString().includes("Editable again"), "closing preview did not resume editing")
  }
  finally {
    history.clearPreview()
    document.querySelector("#native-history-section")?.remove()
  }
})

editor.destroy()

await check("canvas and slide gestures relay pointer dismissal before feature capture", async () => {
  for(const mode of ["canvas", "slides"]) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:800px;height:600px"
    const nonce = crypto.randomUUID()
    const messages: MessageEvent[] = []
    const observe = (event: MessageEvent) => {
      if(event.source === frame.contentWindow && event.data?.bridgeNonce === nonce
        && event.data.type === "editor-frame-pointerdown") messages.push(event)
    }
    window.addEventListener("message", observe)
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    frame.srcdoc = `<!doctype html><body class="ww-${mode}"><div class="ww-slides-viewport"><section class="ww-slide" id="slide"><p>Item</p><nav class="ww-slide-directions"><a href="#slide">Next</a></nav></section></div><script type="module" src="/src/editor-entry.ts"><\/script>`
    document.body.append(frame)
    try {
      await loaded
      frame.contentWindow!.postMessage({type: initializeEditorMessage, syncUrl: "ws://127.0.0.1:65534", bridgeNonce: nonce}, location.origin)
      for(let attempt = 0; attempt < 200 && !(frame.contentWindow as any).editor; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert((frame.contentWindow as any).editor, `${mode} bridge did not initialize`)
      await layoutFrame()
      const doc = frame.contentDocument!, view = frame.contentWindow!
      let bubbled = false
      doc.addEventListener("pointerdown", () => { bubbled = true })
      const target = mode === "canvas" ? doc.body : doc.querySelector("a")!
      target.dispatchEvent(new (view as any).PointerEvent("pointerdown", {button: 0, pointerId: 1, bubbles: true, composed: true, cancelable: true, clientX: 700, clientY: 500}))
      assert(!bubbled, `${mode} feature did not claim the test gesture`)
      for(let attempt = 0; attempt < 100 && !messages.length; attempt++) await new Promise(resolve => setTimeout(resolve, 10))
      assert(messages.length === 1, `${mode} gesture did not reach the host exactly once`)
      assert(messages[0].data.widgetShadow === false, `${mode} gesture was mistaken for widget input`)
    }
    finally {
      ;(frame.contentWindow as any)?.editor?.destroy()
      window.removeEventListener("message", observe)
      frame.remove()
    }
  }
})

await check("graphic imports open host pickers synchronously and retry across the iframe bridge", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1280px;height:900px"
  frame.src = "/editor/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "graphic bridge editor did not initialize")
    await (app as any).waitForEditorWindow()
    await app!.execute({type: "insertGraphic"})
    const view = frame.contentWindow as Window & typeof globalThis
    const click = view.HTMLInputElement.prototype.click
    let opening = false
    let clicks = 0
    view.HTMLInputElement.prototype.click = function() {
      assert(opening, "picker opened after the initiating event returned")
      assert(this.ownerDocument === app!.ownerDocument, "picker opened in the document iframe")
      clicks++
    }
    try {
      const toolbox = app!.shadowRoot!.querySelector("dom-editor-toolbox")!
      for(let attempt = 0; attempt < 3; attempt++) {
        opening = true
        toolbox.dispatchEvent(new CustomEvent("ribbon-button-click", {
          detail: {label: "import-graphic"}, bubbles: true, composed: true,
        }))
        opening = false
        assert(clicks === attempt + 1, "import click did not open a host picker synchronously")
        const picker = app!.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
        assert(picker?.accept === ".svg,image/svg+xml", "graphic picker does not accept SVG files")
        if(attempt < 2) picker.dispatchEvent(new Event("cancel"))
        else {
          const data = new DataTransfer()
          data.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"><!--imported--><circle r="12"/></svg>'], "drawing.svg", {type: "image/svg+xml"}))
          picker.files = data.files
          picker.dispatchEvent(new Event("change"))
        }
        assert(!picker.isConnected, "host picker was not removed after completion")
        await layoutFrame()
      }
      let source = ""
      for(let attempt = 0; attempt < 100; attempt++) {
        source = await app!.execute({type: "serializeGraphic"}) as string
        if(source?.includes("<circle")) break
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      assert(source?.includes("<circle") && source.includes("<!--imported-->"), "host-picked file did not import across the bridge")
      assert(!source.includes("◆"), "graphic import serialized editor markers")
      await app!.execute({type: "undo"})
      assert(!(await app!.execute({type: "serializeDocument"}) as string).includes("<circle"), "import could not be undone")
      await app!.execute({type: "redo"})
      assert((await app!.execute({type: "serializeDocument"}) as string).includes("<circle"), "import could not be redone")
    }
    finally { view.HTMLInputElement.prototype.click = click }
  }
  finally { frame.remove() }
})

await check("table commands complete across the real iframe bridge", async () => {
  const liveTable = document.createElement("table")
  liveTable.innerHTML = '<tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr></tr></tbody>'
  fixture.append(liveTable)
  const tableEditor = new DOMEditor()
  try {
    const [spanning, second, third] = Array.from(liveTable.querySelectorAll("td"))
    tableEditor.features.table.selectCells(second)
    tableEditor.features.table.deleteSelection()
    assert(liveTable.querySelectorAll("td").length === 3 && second.textContent === "", "partial deletion removed a cell")
    tableEditor.features.table.selectCells(second, third)
    tableEditor.features.table.deleteSelection()
    assert(liveTable.rows.length === 2 && buildTableMap(liveTable).width === 1 && spanning.rowSpan === 2,
      "column deletion damaged merged row coverage")
    liveTable.rows[0].insertCell().textContent = "Added column"
    await nextFrame()
    const map = buildTableMap(liveTable)
    assert(map.width === 2 && map.matrix.every(row => Array.from({length: map.width}, (_, column) => row[column]).every(Boolean)),
      "direct table mutation left incomplete rows or columns")
  }
  finally {tableEditor.features.table.clearCellSelection(false); liveTable.remove(); tableEditor.destroy()}
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1280px;height:900px"
  frame.src = "/editor/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "table bridge editor did not initialize")
    await (app as any).waitForEditorWindow()
    const insert = await Promise.race([
      app!.execute({type: "insertTable", rows: 2, columns: 2}),
      new Promise((_, reject) => setTimeout(() => reject(new Error("table insertion did not complete")), 3000)),
    ])
    assert(insert === true, "table insertion did not return a bridge-safe result")
    assert(await app!.execute({type: "normalizeTable"}) === true, "table normalization did not complete")
    const source = await app!.execute({type: "serializeDocument"}) as string
    const doc = new DOMParser().parseFromString(source, "text/html")
    assert(doc.querySelectorAll("table tr").length === 2 && doc.querySelectorAll("table td").length === 4,
      "table bridge commands lost the inserted cells")
    assert(!doc.body.querySelector('[class*="◆"]'), "table bridge commands exported editor markers")
    const {DomEditorToolbox} = await import("../src/components/toolbox")
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.table = {active: true, cellSelection: true, rows: 2, columns: 2, selectedCells: 1,
      canMerge: false, canSplit: false, hasCaption: false, hasHeader: true, hasFooter: false}
    document.body.append(toolbox)
    try {
      await toolbox.updateComplete
      const controls = toolbox.shadowRoot!.querySelector<HTMLElement>(".table-structure-controls")!
      const buttons = Array.from(controls.querySelectorAll<RibbonButton>("ribbon-button"))
      await Promise.all(buttons.map(button => button.updateComplete))
      const header = buttons.find(button => button.action === "table-header")!
      const footer = buttons.find(button => button.action === "table-footer")!
      const merge = buttons.find(button => button.action === "table-merge-cells")!
      assert(header.parentElement === controls && footer.parentElement === controls, "section buttons are wrapped or spanning")
      const headerRect = header.getBoundingClientRect(), footerRect = footer.getBoundingClientRect(), mergeRect = merge.getBoundingClientRect()
      assert(headerRect.top === mergeRect.top && footerRect.top === mergeRect.top, "section buttons are not in the third row")
      assert(Math.abs(headerRect.width - mergeRect.width) < 1 && headerRect.height === mergeRect.height
        && Math.abs(footerRect.width - mergeRect.width) < 1 && footerRect.height === mergeRect.height,
        "section buttons do not occupy ordinary grid cells")
      assert(header.shadowRoot!.querySelector(".button-icon svg") && footer.shadowRoot!.querySelector(".button-icon svg"), "section buttons lack icons")
      assert(controls.scrollWidth === controls.clientWidth, "table controls overflow the drawer")
    }
    finally {toolbox.remove()}
    assert(await app!.execute({type: "toggleTableHeader"}) === true, "whole header row did not toggle")
    assert(await app!.execute({type: "toggleTableFooter"}) === true, "whole footer row did not toggle")
    const sectionSource = await app!.execute({type: "serializeDocument"}) as string
    const sections = new DOMParser().parseFromString(sectionSource, "text/html")
    assert(sections.querySelectorAll("thead > tr > th").length === 2, "header toggle did not cover the entire row")
    assert(sections.querySelectorAll("tfoot > tr > td").length === 2, "footer toggle did not cover the entire row")
    const preview = document.createElement("iframe")
    preview.srcdoc = `<!doctype html><style>${defaultDocumentTheme.source}</style><table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Body</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table>`
    const loaded = new Promise(resolve => preview.addEventListener("load", resolve, {once: true}))
    document.body.append(preview)
    try {
      await loaded
      const previewDoc = preview.contentDocument!, view = preview.contentWindow!
      const header = previewDoc.querySelector<HTMLElement>("thead th")!
      const footer = previewDoc.querySelector<HTMLElement>("tfoot td")!
      const body = previewDoc.querySelector<HTMLElement>("tbody td")!
      assert(view.getComputedStyle(header).backgroundColor === "rgb(222, 235, 247)", "default theme header rows are not light blue")
      assert(view.getComputedStyle(footer).backgroundColor === "rgb(242, 242, 242)", "default theme footer rows are not light gray")
      assert(view.getComputedStyle(header).backgroundColor !== view.getComputedStyle(body).backgroundColor,
        "default theme header background is indistinguishable from body cells")
      assert(view.getComputedStyle(footer).backgroundColor !== view.getComputedStyle(body).backgroundColor,
        "default theme footer background is indistinguishable from body cells")
      header.style.backgroundColor = "rgb(200, 100, 50)"
      assert(view.getComputedStyle(header).backgroundColor === "rgb(200, 100, 50)", "theme overwrote an authored cell background")
    }
    finally { preview.remove() }

  }
  finally { frame.remove() }
})

await check("iframe reactivation restores hit testing without changing the document or selection", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;background:white"
  frame.src = "/editor/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 600; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "app editor did not initialize")
    await (app as any).waitForEditorWindow()
    await app!.execute({type: "selectNode", path: [0]})
    const root = app!.shadowRoot!, iframe = root.querySelector<HTMLIFrameElement>(".editor-frame")!
    const doc = app!.ownerDocument, view = doc.defaultView!
    const before = await app!.execute({type: "serializeDocument"})
    const selection = JSON.stringify((app as any).selectionPath)
    if(!iframe.contentDocument) {
      const messages = new Set<string>()
      const observe = (event: MessageEvent) => {
        if(event.source === iframe.contentWindow && event.data?.type?.startsWith("editor-frame-window-")) messages.add(event.data.type)
      }
      const button = doc.createElement("button")
      doc.body.append(button)
      view.addEventListener("message", observe)
      try {
        button.focus()
        for(let attempt = 0; attempt < 100 && !messages.has("editor-frame-window-blur"); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
        assert(messages.has("editor-frame-window-blur"), "opaque frame did not relay its native Window blur")
        assert(view.getComputedStyle(iframe).pointerEvents !== "none", "moving focus to the host disabled iframe interaction")
        ;(app as any).focusEditor()
        for(let attempt = 0; attempt < 100 && !messages.has("editor-frame-window-focus"); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
        assert(messages.has("editor-frame-window-focus"), "opaque frame did not relay its native Window focus")
      }
      finally { view.removeEventListener("message", observe); button.remove() }
    }
    const rect = iframe.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + 40
    assert(root.elementFromPoint(x, y) === iframe, "active iframe was not a native hit-test target")
    // Model app deactivation without relying on a headless window manager.
    Object.defineProperty(doc, "hasFocus", {configurable: true, value: () => false})
    view.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    assert(view.getComputedStyle(iframe).pointerEvents === "none", "inactive iframe kept its pointer target")
    assert(root.elementFromPoint(x, y) !== iframe, "inactive iframe remained in native hit testing")
    await new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    assert(!doc.hasFocus(), "test unexpectedly restored window focus")
    assert(view.getComputedStyle(iframe).pointerEvents !== "none", "DevTools focus left the iframe disabled after the cursor refresh")
    assert(root.elementFromPoint(x, y) === iframe, "cursor refresh did not restore native iframe hit testing while inactive")
    view.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    Reflect.deleteProperty(doc, "hasFocus")
    view.dispatchEvent(new Event("focus"))
    assert(view.getComputedStyle(iframe).pointerEvents !== "none", "reactivated iframe remained disabled")
    assert(root.elementFromPoint(x, y) === iframe, "reactivation did not restore native iframe hit testing")
    assert(await app!.execute({type: "serializeDocument"}) === before, "reactivation changed authored content")
    assert(JSON.stringify((app as any).selectionPath) === selection, "reactivation changed selection")
  }
  finally {
    if(frame.contentDocument) Reflect.deleteProperty(frame.contentDocument, "hasFocus")
    frame.remove()
  }
})

await check("ribbon collapses when vertical space is constrained", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:400px;height:900px"
  frame.srcdoc = '<!doctype html><style>body{margin:0}</style><script type="module">import {AppRibbon} from "/src/components/ribbon.ts"; const ribbon = new AppRibbon(); ribbon.style.setProperty("--ww-ui-transition", "none"); document.body.append(ribbon);</script>'
  fixture.append(frame)
  try {
    let ribbon: import("../src/components/ribbon").AppRibbon | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      ribbon = frame.contentDocument?.querySelector("app-ribbon") ?? null
      if(ribbon?.shadowRoot?.querySelector("ribbon-drawer")) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(ribbon?.shadowRoot, "ribbon fixture did not initialize")
    for(const [width, height, expected] of [[400, 900, 90], [1200, 900, 140], [500, 900, 140], [380, 900, 90], [1200, 500, 40], [400, 500, 40], [400, 900, 90], [400, 500, 40]]) {
      frame.style.width = `${width}px`
      frame.style.height = `${height}px`
      await layoutFrame(); await layoutFrame()
      assert(Math.abs(ribbon!.getBoundingClientRect().height - expected) < 1, `ribbon height was not ${expected}px at ${width}x${height}`)
      assert(ribbon!.expanded === (expected !== 40), "ribbon state did not match its visible height")
      assert(ribbon!.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!.hidden === (expected === 40), "collapsed ribbon left its drawers visible")
      if(expected === 90) {
        const content = ribbon!.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!
        assert(Math.abs(content.getBoundingClientRect().height - 50) <= 1, "summary-only ribbon did not halve its drawer strip")
        for(const drawer of content.querySelectorAll<import("../src/components/ribbon-drawer").RibbonDrawer>(":scope > ribbon-drawer")) {
          assert(drawer.collapsed, "short ribbon retained an expanded drawer")
          const summary = drawer.shadowRoot!.querySelector<HTMLElement>(".summary")!
          const icon = summary.querySelector<HTMLElement>(".summary-icon")!.getBoundingClientRect()
          const label = summary.querySelector<HTMLElement>(".summary-label")!
          const bounds = label.getBoundingClientRect()
          assert(bounds.left >= icon.right && bounds.height + .1 >= parseFloat(frame.contentWindow!.getComputedStyle(label).lineHeight), "short summary clipped its icon or label")
          const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
          assert(toggle.getBoundingClientRect().top >= bounds.bottom, "short summary label overlaps its drawer button")
          toggle.click()
          await drawer.updateComplete; await layoutFrame()
          assert(drawer.hasAttribute("drawer-open") && drawer.shadowRoot!.querySelector(".controls")!.getBoundingClientRect().height > 0, "short summary did not open its drawer")
          drawer.closeDrawer()
          await drawer.updateComplete
        }
      }
    }
    ribbon!.logoUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M0 0h24v24H0z"/></svg>'
    await ribbon!.updateComplete; await layoutFrame()
    const brand = ribbon!.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
    const fileButton = ribbon!.shadowRoot!.querySelector('ribbon-tab[label="File"]')!.shadowRoot!.querySelector("button")!
    const stableElements = [brand, brand.querySelector("img")!, fileButton.querySelector("file-label")!]
    const closedBounds = stableElements.map(element => element.getBoundingClientRect())
    brand.click()
    await ribbon!.updateComplete; await layoutFrame()
    assert(!ribbon!.expanded && ribbon!.menuOpen && Math.abs(ribbon!.getBoundingClientRect().height - 40) < 1, "short-screen app icon did not open File without expanding the ribbon")
    assert(ribbon!.shadowRoot!.querySelector(".brand")!.getAttribute("aria-controls") === "ribbon-file-menu", "short-screen app icon did not identify the File menu")
    const view = frame.contentWindow!
    assert(view.getComputedStyle(brand, "::before").backgroundColor === view.getComputedStyle(fileButton).backgroundColor, "app icon did not share the open File tab background")
    assert(view.getComputedStyle(fileButton).borderLeftColor === "rgba(0, 0, 0, 0)", "app icon and File tab retained a border seam")
    stableElements.forEach((element, index) => {
      const before = closedBounds[index], after = element.getBoundingClientRect()
      assert((["x", "y", "width", "height"] as const).every(key => Math.abs(before[key] - after[key]) < 0.1), "opening File moved the app icon or label")
    })
    const menuBounds = ribbon!.shadowRoot!.querySelector("ribbon-menu")!.getBoundingClientRect()
    assert(Math.abs(menuBounds.left - brand.getBoundingClientRect().left) < 0.1, "short-screen File menu did not align with the app icon")
    brand.click()
    await ribbon!.updateComplete; await layoutFrame()
    assert(view.getComputedStyle(brand).backgroundColor === "rgba(0, 0, 0, 0)", "app icon retained its menu tab background after closing")

    ribbon!.expanded = false
    await ribbon!.updateComplete; await layoutFrame()
    assert(Math.abs(ribbon!.getBoundingClientRect().height - 40) < 1, "manual ribbon collapse did not retain its normal height")
  }
  finally {frame.remove()}
})

await check("narrow toolboxes collapse below bottom panels and restore on tab activation", async () => {
  const {DomEditor} = await import("../src/components/dom-editor")
  const app = new DomEditor()
  app.style.cssText = "position:fixed;inset:0;box-sizing:content-box;width:900px;height:800px;background:white"
  const host = app as any
  host.execute = async () => ({versions: [], checkpoints: [], comments: [], preview: null, currentCheckpointId: null, currentUserId: 0})
  host.settings = {...host.settings, showGuidedTour: false}
  host.documentLayoutsDismissed = true
  fixture.append(app)
  // Exercise host UI state without a live editing frame replacing the selections below.
  clearTimeout(host.frameStartTimer)
  host.frameStartTimer = undefined
  const settle = async () => {
    await app.updateComplete
    await layoutFrame()
    await app.updateComplete
    await app.shadowRoot!.querySelector<import("../src/components/toolbox").DomEditorToolbox>("dom-editor-toolbox")!.updateComplete
    await layoutFrame()
  }
  try {
    await settle()
    const toolbox = app.shadowRoot!.querySelector<import("../src/components/toolbox").DomEditorToolbox>("dom-editor-toolbox")!
    const pane = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!
    const tabs = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    for(const surface of ["console", "versions", "math", "shape", "link"]) {
      Object.assign(app, {consoleOpen: false, reviewOpen: false, mathSelection: null, graphicSelection: null, linkSelection: null,
        mathKeyboardHidden: false, shapeKeyboardHidden: false, linkKeyboardHidden: false})
      app.style.width = "900px"
      await settle()
      host.breadcrumbVisible = true
      toolbox.selectTool(surface === "versions" ? "Review" : "Edit")
      if(surface === "console") host.consoleOpen = true
      else if(surface === "versions") host.reviewOpen = true
      else if(surface === "math") host.mathSelection = {active: true, display: "inline"}
      else if(surface === "shape") host.graphicSelection = {active: true, capture: true}
      else host.linkSelection = {active: true, identity: "link-1", href: "https://example.com", text: "Example",
        attributes: {href: "https://example.com"}, targets: [], references: []}
      await settle()
      assert(!toolbox.collapsed && pane.getBoundingClientRect().height > 0, `${surface}: wide toolbox collapsed`)
      for(const width of [600, 599, 380]) {
        app.style.width = `${width}px`
        await settle()
        assert(toolbox.collapsed === (width < 600), `${surface}: collapse does not match container width ${width}`)
        if(width >= 600) continue
        const panel = app.shadowRoot!.querySelector<HTMLElement>(surface === "console" || surface === "versions"
          ? ".html-source-panel" : `.${surface}-keyboard-area`)!
        const bar = tabs.getBoundingClientRect(), bounds = panel.getBoundingClientRect(), editorBounds = app.getBoundingClientRect()
        assert(pane.hidden && pane.getBoundingClientRect().height === 0, `${surface}: toolbox pane is still visible`)
        assert(bar.top >= bounds.bottom - 1 && Math.abs(bar.bottom - editorBounds.bottom + .5) <= 1,
          `${surface}: tabs are not at the bottom below the open panel`)
        assert(Math.abs(toolbox.getBoundingClientRect().height - 30) < 1, `${surface}: toolbox reserves more than the tab row`)
        assert(tabs.scrollWidth <= tabs.clientWidth, `${surface}: tabs overflow horizontally`)
        assert(!toolbox.shadowRoot!.querySelector('[aria-selected="true"]'), `${surface}: hidden pane has a selected tab`)
      }
      toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`[data-tool="${toolbox.activeTool}"]`)!.click()
      await settle()
      assert(!toolbox.collapsed && !pane.hidden, `${surface}: selecting the remembered tab did not reopen its pane`)
    }
  }
  finally {app.remove()}
})

await check("AI toolbox adapts its width and short-screen controls", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:900px;height:900px;background:white"
  frame.src = "/editor/"
  fixture.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if(app?.shadowRoot?.querySelector("app-ribbon")?.shadowRoot?.querySelector(".ai-chat-brand-button")) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app?.shadowRoot, "AI app fixture did not initialize")
    const ribbon = app!.shadowRoot!.querySelector<import("../src/components/ribbon").AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!.click()
    const toolbox = app!.shadowRoot!.querySelector<import("../src/components/toolbox").DomEditorToolbox>("dom-editor-toolbox")!
    for(let attempt = 0; attempt < 100 && (toolbox.activeTool !== "AI" || !toolbox.shadowRoot?.querySelector(".ai-chat-panel[data-open]")); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(toolbox.activeTool === "AI", "sparkles did not open AI toolbox")
    const root = toolbox.shadowRoot!, view = frame.contentWindow!
    const composer = root.querySelector<HTMLElement>(".ai-chat-composer")!
    const tab = root.querySelector<HTMLElement>('[data-tool="AI"]')!
    const controls = [root.querySelector<HTMLElement>(".ai-chat-switcher")!, ...root.querySelectorAll<HTMLElement>(".ai-chat-header-button")]
    let normalWidth = 0
    for(const [width, height] of [[900, 900], [380, 900], [399, 500], [400, 500], [900, 500], [380, 900]]) {
      frame.style.width = `${width}px`
      frame.style.height = `${height}px`
      await new Promise(resolve => setTimeout(resolve, 250))
      await layoutFrame()
      const pane = toolbox.getBoundingClientRect(), page = app!.getBoundingClientRect()
      if(!normalWidth) normalWidth = parseFloat(view.getComputedStyle(toolbox).width)
      if(page.width < 600) assert(Math.abs(pane.left - page.left - 1) < 1 && Math.abs(pane.width - page.width + 2) < 1, "narrow AI toolbox did not fill the page width")
      else assert(Math.abs(pane.width - normalWidth) < 1, `AI toolbox did not restore its normal CSS width: ${JSON.stringify({pane: pane.width, normalWidth, page: page.width})}`)
      const prefix = root.querySelector<HTMLElement>(".ai-tab-label-prefix")!
      assert((view.getComputedStyle(prefix).display === "none") === (height <= 600), "AI tab label did not adapt to screen height")
      const expectedComposer = (height <= 600 ? 5.5 : 7) * parseFloat(view.getComputedStyle(frame.contentDocument!.documentElement).fontSize)
      assert(Math.abs(composer.getBoundingClientRect().height - expectedComposer) < 1, "AI message box did not adapt to screen height")
      if(height <= 600) {
        const label = tab.getBoundingClientRect()
        for(const control of controls) {
          const bounds = control.getBoundingClientRect()
          assert(Math.abs((bounds.top + bounds.bottom - label.top - label.bottom) / 2) < 1 && bounds.width === 24, "AI controls were not icon buttons beside the tab")
          assert(control.contains(root.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)), "compact AI control was not clickable")
        }
        const testRibbon = ribbon as unknown as {
          aiChats: {id: string, title: string, messages: unknown[]}[]
          activeAIChatId: string
        }
        testRibbon.aiChats = testRibbon.aiChats.map(chat => chat.id === testRibbon.activeAIChatId ? {...chat, title: "Test conversation"} : chat)
        await ribbon.updateComplete
        const previousChats = testRibbon.aiChats.length
        root.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!.click()
        await ribbon.updateComplete
        assert(testRibbon.aiChats.length === previousChats + 1, "compact new-chat button did not work")
      }
    }
  }
  finally {frame.remove()}
})

await check("narrow ribbons show only the AI sparkles button", async () => {
  const {AppRibbon} = await import("../src/components/ribbon")
  const ribbon = new AppRibbon()
  ribbon.style.display = "block"
  fixture.append(ribbon)
  try {
    await ribbon.updateComplete
    const prompt = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    prompt.value = "Keep this draft"
    prompt.dispatchEvent(new Event("input", {bubbles: true}))
    ribbon.fileName = "A long document filename.html"
    await ribbon.updateComplete
    const root = ribbon.shadowRoot!
    const panel = root.querySelector<HTMLElement>(".ai-chat-panel")!
    const composer = panel.querySelector<HTMLElement>(".ai-chat-composer")!
    const sparkles = panel.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
    const fileTab = root.querySelector<HTMLElement>('ribbon-tab[label="File"]')!
    const fileLabel = fileTab.shadowRoot!.querySelector<HTMLElement>("file-label")!
    const fileName = fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")!
    const compactLabel = fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-menu-label")!
    for(const width of [1000, 650, 500, 450, 400, 650, 1000]) {
      ribbon.style.width = `${width}px`
      await layoutFrame()
      assert(getComputedStyle(sparkles).transitionDuration.split(",").every(duration => parseFloat(duration) === 0), "AI sparkles still transitioned during resize")
      if(width <= 448) {
        assert(Math.abs(panel.getBoundingClientRect().width - 24) < 1, "narrow AI bar did not shrink to a button")
        assert(getComputedStyle(composer).display === "none", "narrow AI bar still showed the composer")
        assert(sparkles.getBoundingClientRect().width > 0 && getComputedStyle(sparkles).visibility === "visible", "sparkles button was hidden")
        const buttonBox = panel.getBoundingClientRect(), iconBox = sparkles.querySelector("svg")!.getBoundingClientRect()
        assert(Math.abs((buttonBox.left + buttonBox.right - iconBox.left - iconBox.right) / 2) < .5
          && Math.abs((buttonBox.top + buttonBox.bottom - iconBox.top - iconBox.bottom) / 2) < .5,
          "sparkles were not centered on the compact AI button")
      }
      else {
        assert(panel.getBoundingClientRect().width > 124, "wide AI bar did not expand")
        assert(getComputedStyle(composer).display !== "none" && getComputedStyle(composer).visibility === "visible", "wide AI composer did not return")
      }
      if(width <= 672) {
        assert(getComputedStyle(fileName).display === "none" && getComputedStyle(compactLabel).display !== "none", "narrow File menu still showed the filename")
        assert(compactLabel.textContent === "File" && fileTab.getBoundingClientRect().width < 100, "compact File label retained filename space")
      }
      else assert(getComputedStyle(fileName).display !== "none" && getComputedStyle(compactLabel).display === "none", "wide File menu did not restore the filename")
      assert(panel.querySelector<HTMLTextAreaElement>("textarea")!.value === "Keep this draft", "responsive AI bar lost its draft")
      assert(fileName.textContent === "A long document filename.html", "responsive File menu lost its filename")
    }
    ribbon.style.width = "400px"
    await layoutFrame()
    sparkles.click()
    await ribbon.updateComplete
    assert(ribbon.aiChatOpen && sparkles.getAttribute("aria-expanded") === "true", "compact sparkles button did not open AI chat")
  }
  finally {ribbon.remove()}
})

await check("recent documents fit one layout card when space is limited", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;background:white"
  frame.src = "/editor/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if(app?.shadowRoot?.querySelector(".document-layouts-documents")) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app?.shadowRoot, "app did not initialize")
    const host = app as any
    await host.recentDocumentsReady
    host.backendSession = {apiBaseUrl: "https://storage.example/api", user: {id: "ada"}}
    host.backendClient = {session: host.backendSession}
    host.savedDocuments = Array.from({length: 10}, (_, index) => ({id: `doc-${index}`, title: `Lesson ${index}`, format: "html", updatedAt: "2026-10-10T12:00:00Z"}))
    host.recentDocuments = host.savedDocuments.map((entry: {id: string; title: string}, index: number) => ({
      id: `recent-${index}`, title: entry.title, openedAt: 100 - index, kind: "backend",
      documentId: entry.id, apiBaseUrl: host.backendSession.apiBaseUrl, userId: "ada",
    }))
    await host.refreshRecentDocuments()
    await app!.updateComplete
    const root = app!.shadowRoot!, bar = root.querySelector<HTMLElement>(".document-layouts-bar")!
    const nav = root.querySelector<HTMLElement>(".document-layouts-documents")!
    const list = nav.querySelector<HTMLElement>("ul")!
    assert(list?.children.length === 10, "recent entries were lost")
    let singleRowHeight = 0
    for(const width of [1200, 1000, 950, 800, 680, 650, 600, 400, 800, 1200]) {
      bar.style.width = `${width}px`
      await layoutFrame()
      const card = root.querySelector<HTMLElement>(".layout-preset")!.getBoundingClientRect()
      const recent = nav.getBoundingClientRect()
      if(width === 680) singleRowHeight = bar.getBoundingClientRect().height
      const headingView = frame.contentWindow!
      assert((headingView.getComputedStyle(root.querySelector(".recent-documents-short-title")!).display !== "none") === (width <= 650), "recent heading did not shorten in the narrow layout")
      assert((headingView.getComputedStyle(root.querySelector(".recent-documents-full-title")!).display !== "none") === (width > 650), "recent heading did not restore at wider widths")
      assert(Math.abs(card.top - recent.top) < 1, `recent list wrapped at ${width}px`)
      if(width < 1000) {
        assert(Math.abs(card.width * 1.25 - recent.width) < 1,
          `recent list was not 25% wider than a layout card at ${width}px`)
        const cards = [...root.querySelectorAll<HTMLElement>(".document-layout-cards .layout-preset")].map(element => element.getBoundingClientRect())
        if(width <= 650) {
          assert(Math.abs(bar.getBoundingClientRect().height - singleRowHeight) < 1, "2x2 layout grid increased the pane height")
          assert(Math.abs(cards[0].top - cards[1].top) < 1 && Math.abs(cards[2].top - cards[3].top) < 1
            && cards[2].top > cards[0].bottom && Math.abs(cards[0].left - cards[2].left) < 1
            && Math.abs(cards[1].left - cards[3].left) < 1, "narrow layout cards did not form a 2x2 grid")
          assert(recent.left > cards[1].right && Math.abs(recent.bottom - cards[3].bottom) < 1,
            "recent list did not span both card rows")
          for(const element of root.querySelectorAll<HTMLElement>(".document-layout-cards .layout-preset")) {
            const box = element.getBoundingClientRect()
            const hero = element.querySelector(".document-layout-preview")!.getBoundingClientRect()
            const label = element.querySelector(".layout-preset-name")!.getBoundingClientRect()
            assert(Math.abs(hero.left - box.left - 1) < 1 && Math.abs(hero.top - box.top - 1) < 1
              && Math.abs(hero.width - box.width + 2) < 1 && Math.abs(hero.height - box.height + 2) < 1,
              "2x2 card hero did not fill the card")
            assert(Math.abs((label.left + label.right - box.left - box.right) / 2) < 1
              && Math.abs((label.top + label.bottom - box.top - box.bottom) / 2) < 1,
              "2x2 card label was not centered over its hero")
          }
        }
        else {
          assert(cards.every(box => Math.abs(box.top - card.top) < 1), "layout cards did not restore one row")
          assert(Math.abs(card.height - recent.height) < 1, "recent list did not match the card row height")
        }
        assert(list.scrollHeight > list.clientHeight, "compact list did not scroll")
        const last = list.querySelectorAll<HTMLButtonElement>("button")[9]
        last.focus()
        assert(list.scrollTop > 0, "keyboard focus did not reveal the last entry")
        assert(Math.abs(root.querySelector("#recent-documents-title")!.getBoundingClientRect().left - recent.left) < 1,
          "recent heading did not align with its card")
      }
      else {
        assert(recent.width > card.width * 1.9, "wide list did not restore two columns")
        const rem = parseFloat(frame.contentWindow!.getComputedStyle(frame.contentDocument!.documentElement).fontSize)
        assert(Math.abs(card.width - (10 * rem - 10)) < 1, "layout cards did not shrink by 10px")
      }
    }
    const recentDocuments = host.recentDocuments
    for(const height of [900, 500]) {
      frame.style.height = `${height}px`
      for(const width of [1200, 800, 400]) {
        bar.style.width = `${width}px`
        for(const count of [1, 2, 3]) {
          host.recentDocuments = recentDocuments.slice(0, count)
          await app!.updateComplete
          await layoutFrame()
          const entries = [...list.querySelectorAll<HTMLElement>("li")].map(entry => entry.getBoundingClientRect())
          const last = entries.at(-1)!
          const listBox = list.getBoundingClientRect()
          assert(Math.abs(last.right - listBox.right) <= 2, `last recent entry did not reach the right edge at ${width}x${height} with ${count} entries`)
          if(count % 2) assert(Math.abs(last.left - listBox.left) <= 2, "unpaired recent entry did not use the full row")
          if(count > 1) assert(entries[0].right <= entries[1].left || entries[0].bottom <= entries[1].top, "recent entries overlapped")
        }
      }
    }
    host.recentDocuments = recentDocuments
    await app!.updateComplete
    frame.style.height = "900px"
    bar.style.width = "1200px"
    await layoutFrame()
    const fullHeight = bar.getBoundingClientRect().height
    frame.style.height = "500px"
    for(const width of [1200, 800, 400]) {
      bar.style.width = `${width}px`
      await layoutFrame(); await layoutFrame()
      const height = bar.getBoundingClientRect().height
      const compactHeight = parseFloat(frame.contentWindow!.getComputedStyle(bar).minHeight)
      assert(Math.abs(height - compactHeight) < 1, `short layout panel did not fit its compact minimum height: ${height}px vs ${compactHeight}px`)
      const cards = [...root.querySelectorAll<HTMLElement>(".document-layout-cards .layout-preset")]
      assert(cards.every(card => Math.abs(card.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 1), "short layout cards did not form one row")
      const view = frame.contentWindow!
      assert(cards.every(card => view.getComputedStyle(card.querySelector(".document-layout-preview")!).display === "none"
        && view.getComputedStyle(card.querySelector(".layout-preset-icon")!).display !== "none"), "short layout cards did not show only icons and names")
      assert(view.getComputedStyle(root.querySelector(".document-layouts-combined-title")!).display !== "none"
        && view.getComputedStyle(root.querySelector("#recent-documents-title")!).display === "none", "short panel did not use its combined heading")
      list.scrollTop = 0
      const entries = [...list.querySelectorAll<HTMLElement>("li")].map(entry => entry.getBoundingClientRect())
      assert(Math.abs(entries[0].top - entries[1].top) < 1 && Math.abs(entries[2].top - entries[3].top) < 1
        && entries[2].top > entries[0].bottom && Math.abs(entries[0].left - entries[2].left) < 1,
        "short recent list did not form a 2x2 grid")
      assert(nav.getBoundingClientRect().top > cards[0].getBoundingClientRect().bottom, "recent documents were not below the layout row")
      list.querySelectorAll<HTMLButtonElement>("button")[0].focus()
      list.querySelectorAll<HTMLButtonElement>("button")[9].focus()
      assert(list.scrollTop > 0, "short recent list lost keyboard access to later entries")
    }
    frame.style.height = "900px"
    bar.style.width = "1200px"
    await layoutFrame(); await layoutFrame()
    assert(Math.abs(bar.getBoundingClientRect().height - fullHeight) < 1, "layout panel did not restore its full height")
    assert(frame.contentWindow!.getComputedStyle(root.querySelector(".document-layouts-combined-title")!).display === "none", "full layout panel kept its combined heading")
    const warning = root.querySelector<HTMLElement>(".size-warning")!
    assert(warning.textContent!.includes("WebWriter may not work correctly at this size."), "size warning text changed")
    for(const [width, height, visible] of [[300, 900, false], [299, 900, true], [900, 300, false], [900, 299, true], [900, 900, false]] as const) {
      frame.style.width = `${width}px`
      frame.style.height = `${height}px`
      await layoutFrame(); await layoutFrame()
      assert((frame.contentWindow!.getComputedStyle(warning).display !== "none") === visible, `size warning threshold failed at ${width}x${height}`)
      if(visible) {
        const banner = warning.getBoundingClientRect()
        const ribbon = root.querySelector("app-ribbon")!.getBoundingClientRect()
        assert(banner.height > 0 && banner.bottom <= ribbon.top + 1, "size warning obscured the ribbon")
      }
    }
    for(const [width, height] of [[99, 99], [75, 75], [50, 50], [50, 900], [900, 50]]) {
      frame.style.width = `${width}px`
      frame.style.height = `${height}px`
      await layoutFrame(); await layoutFrame()
      const view = frame.contentWindow!
      const banner = warning.getBoundingClientRect()
      const text = warning.querySelector<HTMLElement>("span")!
      const dismiss = warning.querySelector<HTMLButtonElement>("button")!.getBoundingClientRect()
      const fontSize = parseFloat(view.getComputedStyle(text).fontSize)
      assert(fontSize >= 6 && fontSize < 12, "tiny banner font did not scale within its readable range")
      assert(banner.right <= width && banner.bottom <= height, `size warning did not fit at ${width}x${height}`)
      const range = frame.contentDocument!.createRange()
      range.selectNodeContents(text)
      const lines = [...range.getClientRects()]
      assert(lines.every(line => line.left >= banner.left && line.right <= banner.right && line.bottom <= banner.bottom), "tiny warning text was clipped")
      assert(dismiss.right <= width && dismiss.bottom <= height && dismiss.width >= 6, "tiny warning dismiss button was clipped")
      assert(view.getComputedStyle(warning.querySelector("button")!).float === "right"
        && dismiss.height <= parseFloat(view.getComputedStyle(text).lineHeight) + .1, "tiny close button did not float within one text line")
      assert(lines[0].right <= dismiss.left + 1, "tiny warning text did not flow around the close button")
    }
    frame.style.width = "299px"
    frame.style.height = "900px"
    await layoutFrame()
    warning.querySelector<HTMLButtonElement>("button")!.click()
    await app!.updateComplete
    assert(!root.querySelector(".size-warning"), "size warning did not dismiss")
    frame.style.width = "900px"
    await layoutFrame()
    frame.style.width = "299px"
    await layoutFrame()
    assert(!root.querySelector(".size-warning"), "size warning returned after resizing")
  }
  finally { frame.remove() }
})

await check("toolbox Canvas to Document conversion retains the document selection", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;background:white"
  frame.src = "/editor/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if(app && (app as any).editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "app editor did not initialize")
    await (app as any).waitForEditorWindow()
    const toolbox = app!.shadowRoot!.querySelector<import("../src/components/toolbox").DomEditorToolbox>("dom-editor-toolbox")!
    assert(String(await app!.execute({type: "serializeDocument"})).includes("<p></p>"), "document did not start empty")
    assert(await app!.execute({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"}), "Canvas conversion failed")
    await app!.execute({type: "selectNode", path: []})
    await layoutFrame(); await app!.updateComplete
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const card = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('.document-layout-change[data-mode="document"]')!
    assert(card && !card.disabled, "Document toolbox layout card is unavailable")
    card.click()
    for(let attempt = 0; toolbox.documentLayout.mode !== "document" && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    await new Promise(resolve => setTimeout(resolve, 150))
    await app!.updateComplete; await toolbox.updateComplete
    assert(toolbox.documentLayout.mode === "document", "toolbox conversion did not finish")
    assert(toolbox.documentSelected && toolbox.activeTool === "Edit", "conversion lost the Document toolbox selection")
    assert((app as any).nodeSelection && (app as any).selectionPath.length === 1, "conversion lost the root node selection")
    assert(app!.shadowRoot!.activeElement === (app as any).editorIframe(), "conversion lost editor focus")
  }
  finally {frame.remove()}
})

await check("bottom layout cards retain native editing focus after rendering", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;background:white"
  frame.src = "/editor/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    let editingFrame: HTMLIFrameElement | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      editingFrame = app?.shadowRoot?.querySelector<HTMLIFrameElement>(".editor-frame") ?? null
      if(editingFrame && (app as any)?.editorWindow && (app as any)?.editorDocument) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, `app editor did not initialize: app=${!!app} frame=${!!editingFrame} window=${!!(app as any)?.editorWindow} opaque=${(app as any)?.editorOpaque} error=${(app as any)?.packageError}`)
    await (app as any).waitForEditorWindow()
    const initialHistory = await app!.execute({type: "getVersionHistory"}) as import("../src/editor-bridge").VersionHistoryState
    assert(initialHistory.checkpoints.length === 1 && initialHistory.checkpoints[0].label === "Document created",
      "automatic initialization was recorded as an edit")
    assert(Object.values(initialHistory.versions[0].changes).every(count => count === 0), "fresh document has authored changes")
    const initialSource = await app!.execute({type: "serializeDocument"}) as string
    assert(new DOMParser().parseFromString(initialSource, "text/html").documentElement.lang === (app as any).settings.language,
      "fresh document did not start with the preferred language")
    if(!editingFrame!.contentDocument) {
      assert(new URL(editingFrame!.src).origin !== frame.contentWindow!.location.origin, "editor frame stayed on the app origin")
      const expectedSandbox = "allow-scripts allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox"
      assert(editingFrame!.getAttribute("sandbox") === expectedSandbox, "editor frame permissions changed")
      const source = await app!.execute({type: "serializeDocument"}) as string
      assert(source.includes("<body"), "cross-origin editor did not answer a document command")
      await (app as any).enterPreview()
      const previewFrame = app!.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.preview-frame")
      assert(previewFrame && new URL(previewFrame.src).origin === new URL(editingFrame!.src).origin,
        "preview did not use the dedicated editor origin")
      assert(previewFrame!.getAttribute("sandbox") === expectedSandbox,
        "preview frame permissions changed")
      for(let attempt = 0; attempt < 200 && !(app as any).previewOpaque; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      assert((app as any).previewOpaque, "preview did not initialize on the dedicated origin")
      return
    }
    assert(app!.shadowRoot!.activeElement === editingFrame, "initial editor frame was not focused")
    assert(editingFrame!.contentDocument!.body.matches(":focus"), "initial editable body did not receive native focus")
    assert(frame.contentDocument!.activeElement === app, "iframe focus was not retargeted to the shadow host")
    ;(app as any).savedEditorSelection = null
    const previousDocument = editingFrame!.contentDocument
    await (app as any).reloadEditor([])
    editingFrame = app!.shadowRoot!.querySelector<HTMLIFrameElement>(".editor-frame")!
    assert(editingFrame!.contentDocument !== previousDocument, "package reload did not replace the document")
    assert(app!.shadowRoot!.activeElement === editingFrame && editingFrame!.contentDocument!.hasFocus(), "package reload did not restore iframe focus")
    assert(editingFrame!.contentDocument!.body.matches(":focus"), "package reload did not focus the native editable body")
    assert(editingFrame!.contentDocument!.getSelection()?.rangeCount, "package reload lost the initial selection")
    const root = app!.shadowRoot!, doc = editingFrame!.contentDocument!
    await new Promise(resolve => setTimeout(resolve, 750))
    doc.documentElement.setAttribute("lang", doc.documentElement.getAttribute("lang")!)
    const resource = doc.createElement("style")
    resource.className = "◆ ◆editor-only"
    doc.head.append(resource)
    await layoutFrame()
    resource.textContent = "/* initialized editor resource */"
    resource.setAttribute("media", "screen")
    await new Promise(resolve => setTimeout(resolve, 750))
    assert(root.querySelector(".document-layouts-panel:not([inert])"), "automatic startup changes dismissed Layouts")
    resource.remove()
    editingFrame!.focus()
    for(const mode of ["canvas", "slides", "board", "document", "board", "canvas", "document"]) {
      await app!.updateComplete
      const card = root.querySelector<HTMLButtonElement>(`.document-layouts-bar [data-mode="${mode}"]`)!
      assert(card && !card.disabled, `${mode} card is unavailable`)
      // Model the native pointer focus default explicitly: HTMLElement.click()
      // alone omits pointerdown/mousedown and would miss a toolbar focus loss.
      for(const type of ["pointerdown", "mousedown"]) {
        const event = new MouseEvent(type, {button: 0, bubbles: true, composed: true, cancelable: true})
        card.dispatchEvent(event)
        if(!event.defaultPrevented) card.focus()
        assert(root.activeElement === editingFrame, `${mode} card took pointer focus from the editor`)
      }
      const previousAnchor = doc.getSelection()?.anchorNode
      card.click()
      for(let attempt = 0; !card.disabled && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
      assert(card.disabled, `${mode} conversion did not finish`)
      // Check after asynchronous selection messages and rendering, without
      // using automation that might refocus the page before typing.
      await new Promise(resolve => setTimeout(resolve, 300))
      assert(root.activeElement === editingFrame && doc.hasFocus(), `${mode} lost editing focus after rendering`)
      const previousBlock = previousAnchor?.nodeType === Node.ELEMENT_NODE ? previousAnchor as Element : previousAnchor?.parentElement
      const retained = previousBlock?.isConnected && doc.body.contains(previousBlock) && previousBlock.matches("p, h1")
      const first = retained ? previousBlock! : doc.querySelector(mode === "slides" ? ".ww-slide > h1" : mode === "board" ? ".ww-board-card > p" : "body > p")!
      const selection = doc.getSelection()!
      assert(first && selection.isCollapsed && first.contains(selection.anchorNode), `${mode} lost its initial native caret: ${selection.anchorNode?.nodeName}:${selection.anchorOffset}; ${doc.body.innerHTML}`)
      if(!retained) assert(!first.childNodes.length, `${mode} inserted content to imitate a caret`)
      assert(root.querySelector(".document-layouts-panel:not([inert])"), `${mode} conversion dismissed Layouts`)
    }
    assert(doc.execCommand("insertText", false, "x"), "editor was not ready for typing")
    await new Promise(resolve => setTimeout(resolve, 250))
    const panel = root.querySelector<HTMLElement>(".document-layouts-panel")!
    assert(panel.inert && panel.getBoundingClientRect().height < 1, "first edit did not slide Layouts out of view")
    assert(doc.hasFocus(), "dismissing Layouts interrupted typing focus")
    doc.body.innerHTML = '<p>First</p><p id="retained-selection">Second</p>'
    let previousMode: "document" | "canvas" | "slides" | "board" = "document"
    for(const mode of ["canvas", "slides", "board", "document", "board", "canvas", "document"] as const) {
      const text = doc.querySelector("#retained-selection")!.firstChild!
      doc.getSelection()!.setBaseAndExtent(text, 5, text, 2)
      await layoutFrame()
      await app!.execute({type: "setDocumentLayout", mode, expectedMode: previousMode})
      previousMode = mode
      await new Promise(resolve => setTimeout(resolve, 300))
      const selection = doc.getSelection()!
      assert(doc.hasFocus() && selection.anchorNode === text && selection.anchorOffset === 5
        && selection.focusNode === text && selection.focusOffset === 2, `${mode} did not retain the backward text selection`)
      assert(doc.execCommand("insertText", false, "x") && text.textContent === "Sexd", `${mode} typing did not replace the retained selection`)
      text.textContent = "Second"
    }
    const ribbon = root.querySelector("app-ribbon")!, paragraph = doc.querySelector("#retained-selection")!
    const text = paragraph.firstChild!, snippetsBefore = (app as any).settings.userSnippets.length
    doc.getSelection()!.setBaseAndExtent(text, 1, text, 4)
    await layoutFrame()
    const snippets = ribbon.shadowRoot!.querySelector<any>('ribbon-button[label="Snippets"]')!
    assert(snippets, "Packages drawer has no permanent Snippets item")
    assert(!ribbon.shadowRoot!.querySelector('[aria-label="Pin snippet"]'), "separate pin snippet button was retained")
    const packagesDrawer = ribbon.shadowRoot!.querySelector<any>('ribbon-drawer[label="Packages"]')!
    const packageControls = packagesDrawer.shadowRoot.querySelector(".controls") as HTMLElement
    const search = packagesDrawer.querySelector("package-search")!
    if(packageControls.getBoundingClientRect().width > 0 && packagesDrawer.packageColumnCount > 1) {
      assert(search.getBoundingClientRect().width <= packageControls.getBoundingClientRect().width / packagesDrawer.packageColumnCount + 1,
        "package search spans the full drawer")
    }
    await snippets.updateComplete
    let chevron = snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]')!
    assert(chevron, "empty Snippets item has no dropdown chevron")
    if(!snippetsBefore) {
      chevron.click()
      await snippets.updateComplete
      assert(snippets.shadowRoot.textContent.includes("Select something and click to store it here as a snippet to use later"), "empty Snippets dropdown has no hint")
      const hint = snippets.shadowRoot.querySelector(".snippet-empty-hint")!
      assert(frame.contentWindow!.getComputedStyle(hint).color === "rgb(100, 116, 139)", "snippet hint is not the standard hint grey")
      assert(Math.abs(snippets.shadowRoot.querySelector("ribbon-menu").getBoundingClientRect().width - 200) < 1, "empty Snippets menu does not match widget dropdown width")
      chevron.click()
      await snippets.updateComplete
    }
    const pin = snippets.shadowRoot.querySelector('[aria-label="Add snippet"]')!
    assert(pin, "Snippets has no dedicated add icon")
    pin.dispatchEvent(new MouseEvent("mouseenter"))
    for(let attempt = 0; !paragraph.classList.contains("◆snippet-hovered") && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(paragraph.classList.contains("◆snippet-hovered"), "snippet icon hover did not outline its text container")
    pin.dispatchEvent(new MouseEvent("mouseleave"))
    for(let attempt = 0; paragraph.classList.contains("◆snippet-hovered") && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(!paragraph.classList.contains("◆snippet-hovered"), "snippet icon exit retained the preview outline")
    pin.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, cancelable: true}))
    pin.click()
    for(let attempt = 0; (app as any).settings.userSnippets.length === snippetsBefore && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    const saved = (app as any).settings.userSnippets[0]
    assert(saved?.html.includes('>Second</p>') && !saved.html.includes("◆"), "pinning partial text did not save its full authored container")
    await app!.updateComplete
    await ribbon.updateComplete
    assert(snippets && ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] > ribbon-button') === snippets,
      "Snippets is not the first package item")
    for(const item of packagesDrawer.querySelectorAll('ribbon-button:not([slot="more"])')) {
      assert(item.getBoundingClientRect().bottom <= packageControls.getBoundingClientRect().bottom + 1, "saved snippets create an extra package row")
    }
    await snippets.updateComplete
    assert(snippets.submenuOpen, "Snippets save icon did not open its dropdown")
    paragraph.textContent = "Replace me"
    const replacement = doc.createRange(); replacement.selectNode(paragraph)
    doc.getSelection()!.removeAllRanges(); doc.getSelection()!.addRange(replacement)
    await layoutFrame()
    chevron = snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]')!
    snippets.shadowRoot.querySelector(".main-button").click()
    await snippets.updateComplete
    assert(!snippets.submenuOpen, "Snippets label did not close the dropdown opened by saving")
    snippets.shadowRoot.querySelector(".main-button").click()
    await snippets.updateComplete
    const menu = snippets.shadowRoot.querySelector("ribbon-menu")!
    await menu.updateComplete
    assert(Math.abs(menu.getBoundingClientRect().width - 200) < 1, "Snippets menu does not match widget dropdown width")
    menu.shadowRoot.querySelector('[role="menuitem"]').click()
    for(let attempt = 0; doc.querySelector("#retained-selection")?.textContent !== "Second" && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(doc.querySelector("#retained-selection")?.textContent === "Second", "saved user snippet did not reinsert its HTML")
    await snippets.updateComplete
    if(!snippets.submenuOpen) chevron.click()
    await snippets.updateComplete
    const removalMenu = snippets.shadowRoot.querySelector("ribbon-menu")!
    await removalMenu.updateComplete
    const remove = removalMenu.shadowRoot.querySelector('.remove')!
    assert(remove, "saved snippet has no remove button")
    remove.click()
    for(let attempt = 0; (app as any).settings.userSnippets.length !== snippetsBefore && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert((app as any).settings.userSnippets.length === snippetsBefore, "removing a user snippet did not persist")
    await app!.updateComplete
    await ribbon.updateComplete
    await snippets.updateComplete
    assert(snippets.isConnected && snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]'),
      "removing the last snippet removed its item or chevron")
    if(!snippetsBefore) {
      if(!snippets.submenuOpen) snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]').click()
      await snippets.updateComplete
      assert(snippets.shadowRoot.textContent.includes("Select something and click to store it here as a snippet to use later"), "removing the last snippet did not restore the empty hint")
      snippets.closeSubmenu()
    }
    for(const mode of ["canvas", "slides", "board"] as const) {
      root.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
        detail: {...(app as any).settings, defaultLayout: mode}, bubbles: true, composed: true,
      }))
      ;(app as any).fileDirty = false
      await (app as any).newDocument()
      editingFrame = root.querySelector<HTMLIFrameElement>(".editor-frame")!
      assert(editingFrame.contentDocument!.body.classList.contains(`ww-${mode}`), `new document did not use the ${mode} default`)
      await new Promise(resolve => setTimeout(resolve, 100))
      assert(!(app as any).fileDirty && root.querySelector(".document-layouts-panel:not([inert])"), `new ${mode} document was not clean`)
    }
  }
  finally { frame.remove() }
})

await check("Harper checks English in a worker without authored DOM artifacts", async () => {
  const {editorFrameHTML} = await import("../src/frame-document")
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const toolbox = new DomEditorToolbox()
  toolbox.style.cssText = "width:320px;height:500px"
  // This fixture intentionally shares the host origin for direct DOM assertions.
  const source = new DOMParser().parseFromString(editorFrameHTML(null, {
    bridgeNonce: crypto.randomUUID(), revision: 0, language: "en-US", packages: [],
    hostOrigin: location.origin, entryURL: `${location.origin}/tests/native-browser-frame.ts`, executeScripts: true,
  }), "text/html")
  const policy = source.querySelector('meta[http-equiv="Content-Security-Policy"]')!.outerHTML
  const nonce = source.querySelector("script[nonce]")!.getAttribute("nonce")!
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:500px"
  frame.srcdoc = `<!doctype html><html lang="en-US"><head><title>Proofreading</title>${policy}<script class="◆editor-only" nonce="${nonce}" type="module" src="/tests/native-browser-frame.ts"></script></head><body><main><h1>Proofreading</h1><p>😀 This is te<!--keep--><em class="meaning">h</em> example.</p></main></body></html>`
  document.body.append(frame, toolbox)
  const update = (event: MessageEvent) => {
    if(event.source === frame.contentWindow && isProofreadingStateChangeMessage(event.data)) toolbox.proofreadingState = event.data.detail
  }
  window.addEventListener("message", update)
  try {
    for(let attempt = 0; !frame.contentWindow?.editor && !frame.contentWindow?.editorError && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert(!frame.contentWindow?.editorError, frame.contentWindow?.editorError ?? "editor failed")
    const child = frame.contentWindow!.editor!
    assert(child, "iframe editor did not start")
    const doc = frame.contentDocument!, feature = child.features.proofreading
    const before = child.toHTML(true), shared = child.doc.body.toString()
    for(let attempt = 0; (!feature.state().ready || feature.state().checking) && !feature.state().error && attempt < 1500; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const state = feature.state()
    assert(!state.error, state.error ?? "Harper failed")
    const issue = state.issues.find(issue => issue.text === "teh")
    assert(issue, `Harper missed the spelling error: ${JSON.stringify(state)}`)
    assert(issue!.start === "😀 This is ".length, "Harper span did not use DOM UTF-16 offsets")
    assert(child.toHTML(true) === before && child.doc.body.toString() === shared, "checking changed authored or shared content")
    assert(!doc.body.shadowRoot!.querySelector(".◆proofreading-panel"), "background loading opened review UI")
    const registry = (doc.defaultView as Window & typeof globalThis).CSS.highlights
    const highlight = registry.get("webwriter-spelling")!
    assert(highlight?.type === "spelling-error", "spelling ranges were not registered in the iframe")
    assert(Array.from(highlight).some(range => {
      const selected = doc.createRange()
      selected.setStart(range.startContainer, range.startOffset)
      selected.setEnd(range.endContainer, range.endOffset)
      return selected.toString() === "teh"
    }), `highlight did not cross inline formatting: ${JSON.stringify(Array.from(highlight).map(range => ({start: range.startOffset, end: range.endOffset, first: range.startContainer.textContent, last: range.endContainer.textContent})))}`)
    const childWindow = doc.defaultView as Window & typeof globalThis
    const issueRect = (Array.from(highlight)[0] as Range).getClientRects()[0]
    const hit = {clientX: issueRect.left + issueRect.width / 2, clientY: issueRect.top + issueRect.height / 2}
    const paragraph = doc.querySelector("p")!
    const selection = doc.getSelection()!
    const errorText = doc.querySelector("em.meaning")!.firstChild!
    selection.setBaseAndExtent(errorText, 0, errorText, 0)
    doc.dispatchEvent(new childWindow.Event("selectionchange"))
    assert(feature.state().hoveredIssueId === issue!.id, "caret inside the issue did not identify it")
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    const reviewIcon = toolbox.shadowRoot!.querySelector<HTMLElement>('[data-tool="Review"] .toolbox-tab-icon')!
    assert(getComputedStyle(reviewIcon).color === "rgb(198, 40, 40)", "selected issue did not color the closed Review icon")
    selection.removeAllRanges()
    doc.dispatchEvent(new childWindow.Event("selectionchange"))
    paragraph.dispatchEvent(new childWindow.PointerEvent("pointermove", {...hit, bubbles: true, composed: true}))
    assert(feature.state().hoveredIssueId === issue!.id, "hovering the underline did not identify its issue")
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(getComputedStyle(reviewIcon).color === "rgb(198, 40, 40)", "closed Review icon did not match the spelling underline")
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    assert(!toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Review"]'), "old Review buttons remain")
    const cards = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".proofreading-card"))
    const card = cards.find(card => card.querySelector(".proofreading-text")?.textContent === "teh")!
    const verifyCardFooter = (card: HTMLElement, view: Window) => {
      const footer = card.querySelector<HTMLElement>(".proofreading-actions")!
      const add = footer.querySelector<HTMLButtonElement>(".proofreading-add-word")!
      const ignore = footer.querySelector<HTMLButtonElement>(".proofreading-ignore")!
      assert(footer === card.lastElementChild && !footer.querySelector(".proofreading-suggestion"), "card actions are mixed with suggestions")
      const addRect = add.getBoundingClientRect(), ignoreRect = ignore.getBoundingClientRect()
      assert(Math.abs(addRect.top + addRect.height / 2 - ignoreRect.top - ignoreRect.height / 2) < 1
        && addRect.left < ignoreRect.left, `card actions do not share a left/right aligned footer: ${JSON.stringify({add: addRect.toJSON(), ignore: ignoreRect.toJSON()})}`)
      for(const button of [add, ignore]) {
        const style = view.getComputedStyle(button)
        assert(style.backgroundColor === "rgba(0, 0, 0, 0)" && style.borderTopWidth === "0px" && style.outlineStyle === "none", "card footer actions have resting outlines or backgrounds")
      }
    }
    verifyCardFooter(card, window)
    assert(card, "Review did not render Harper's issue card")
    assert(getComputedStyle(card).borderTopColor === "rgb(198, 40, 40)", "open Review did not highlight the hovered issue card")
    assert(getComputedStyle(reviewIcon).color !== "rgb(198, 40, 40)", "open Review still highlighted its icon")
    paragraph.dispatchEvent(new childWindow.PointerEvent("pointermove", {clientX: 0, clientY: 0, bubbles: true, composed: true}))
    selection.setBaseAndExtent(errorText, 0, errorText, 0)
    doc.dispatchEvent(new childWindow.Event("selectionchange"))
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(getComputedStyle(card).borderTopColor === "rgb(198, 40, 40)", "selected issue did not color its open Review card")
    selection.removeAllRanges()
    doc.dispatchEvent(new childWindow.Event("selectionchange"))
    paragraph.dispatchEvent(new childWindow.PointerEvent("pointermove", {...hit, bubbles: true, composed: true}))
    const rightClick = () => {
      const event = new childWindow.MouseEvent("contextmenu", {...hit, button: 2, bubbles: true, composed: true, cancelable: true})
      doc.elementFromPoint(hit.clientX, hit.clientY)!.dispatchEvent(event)
      return event
    }
    assert(rightClick().defaultPrevented, "right-clicking an issue did not open its suggestions")
    const popup = doc.body.shadowRoot!.querySelector<HTMLElement>(".◆proofreading-popup")!
    verifyCardFooter(popup.querySelector<HTMLElement>(".proofreading-card")!, childWindow)
    assert(childWindow.getComputedStyle(popup.querySelector(".proofreading-message")!).fontSize === getComputedStyle(card.querySelector(".proofreading-message")!).fontSize, "popup and sidebar cards do not share typography")
    assert(popup?.matches(":popover-open"), "suggestions popup did not use the appendix top layer")
    const popupRect = popup.getBoundingClientRect()
    assert(popupRect.width > 0 && popupRect.height > 0 && popupRect.right <= childWindow.innerWidth && popupRect.bottom <= childWindow.innerHeight, "suggestions popup overflowed the iframe")
    assert(Math.abs(popupRect.left - issueRect.left) < 1 && Math.abs(popupRect.top - (issueRect.bottom + 6)) < 1, "suggestions popup is not below the issue underline")
    assert(child.toHTML(true) === before && child.doc.body.toString() === shared, "suggestions popup added authored or shared artifacts")
    assert(rightClick().defaultPrevented, "repeated right-click did not reopen suggestions")
    const reopened = doc.body.shadowRoot!.querySelector<HTMLElement>(".◆proofreading-popup")!
    assert(reopened, "repeated right-click switched to the native menu")
    reopened.dispatchEvent(new childWindow.KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    toolbox.proofreadingState = {...state, checking: true}
    await toolbox.updateComplete
    assert(toolbox.shadowRoot!.querySelector(".proofreading-card") === card, "checking replaced an unchanged issue card")
    const heading = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-section h2")!
    const spinner = heading.querySelector<HTMLElement>(".proofreading-spinner")!
    assert(spinner?.getAttribute("aria-label") === "Checking for issues", "heading has no accessible checking spinner")
    const headingToggle = heading.querySelector<HTMLInputElement>(".proofreading-toggle input")!
    const headingCheck = heading.querySelector<HTMLButtonElement>(".proofreading-check")!
    assert(Math.abs(headingToggle.getBoundingClientRect().right - heading.getBoundingClientRect().right) < 1, "document proofreading checkbox is not aligned right")
    assert(spinner.getBoundingClientRect().right <= headingCheck.getBoundingClientRect().left, "heading spinner overlaps the check button")
    assert(headingToggle.parentElement!.textContent!.trim() === "", "document proofreading checkbox has a visible label")
    const commentsDrawer = toolbox.shadowRoot!.querySelector<import("../src/components/ribbon-drawer").RibbonDrawer>('ribbon-drawer[label="Comments"]')!
    await commentsDrawer.updateComplete
    assert(getComputedStyle(heading).fontSize === getComputedStyle(commentsDrawer.shadowRoot!.querySelector<HTMLElement>(".pane-label")!).fontSize, "Issues heading size differs from Comments")
    assert(getComputedStyle(heading.parentElement!).borderBottomWidth === "1px", "Issues and Comments have no divider")
    const recheck = feature.checkNow()
    assert(feature.state().issues.some(current => current.id === issue!.id), "rechecking removed the existing issue")
    assert(registry.get("webwriter-spelling") === highlight, "rechecking removed the existing underline")
    await recheck
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(toolbox.shadowRoot!.querySelector(".proofreading-card") === card, "rechecking replaced an unchanged issue card")
    assert(registry.get("webwriter-spelling") === highlight, "rechecking replaced unchanged highlights")
    assert(!heading.querySelector(".proofreading-spinner"), "checking spinner did not stop")
    const issueButton = card.querySelector<HTMLButtonElement>(".proofreading-issue")!
    const bridgeClick = async (button: HTMLButtonElement | HTMLInputElement) => {
      const requestId = `proofreading-${crypto.randomUUID()}`
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error("proofreading card command timed out")) }, 5000)
        const reply = (event: MessageEvent) => {
          if(event.source !== frame.contentWindow || event.data?.detail?.requestId !== requestId) return
          if(event.data.type !== executeCompleteEvent && event.data.type !== executeFailureEvent) return
          cleanup()
          if(event.data.type === executeFailureEvent || (event.data.detail.result !== true
            && !isProofreadingStateChangeMessage({type: proofreadingStateChangeEvent, detail: event.data.detail.result}))) reject(new Error("proofreading card command failed"))
          else resolve()
        }
        const action = (event: Event) => frame.contentWindow!.postMessage({
          ...(event as CustomEvent<ProofreadingAction>).detail, requestId, bridgeNonce: child.trustedScriptNonce,
        }, location.origin)
        const cleanup = () => {
          clearTimeout(timer)
          window.removeEventListener("message", reply)
          toolbox.removeEventListener("proofreading-action", action)
        }
        window.addEventListener("message", reply)
        toolbox.addEventListener("proofreading-action", action)
        button.click()
      })
    }
    await bridgeClick(issueButton)
    assert(doc.getSelection()!.toString() === "teh", "clicking the card did not select the document issue")
    assert(doc.defaultView!.getComputedStyle(doc.querySelector("p")!, "::highlight(webwriter-spelling)").textDecorationStyle === "wavy", "spelling underline has no wavy decoration")
    for(const element of [doc.documentElement, doc.body, doc.querySelector("p")!, doc.querySelector("em")!]) {
      for(const pseudo of ["::spelling-error", "::grammar-error"]) {
        assert(doc.defaultView!.getComputedStyle(element, pseudo).textDecorationLine === "none", "native proofreading added a second underline")
      }
    }
    const replacement = issue!.suggestions.findIndex(suggestion => suggestion.text === "the")
    assert(replacement >= 0, "Harper offered no correction")
    await bridgeClick(card.querySelectorAll<HTMLButtonElement>(".proofreading-suggestion")[replacement])
    await feature.checkNow()
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(!Array.from(toolbox.shadowRoot!.querySelectorAll(".proofreading-text")).some(element => element.textContent === "teh"), "accepted issue stayed in Review")
    assert(doc.querySelector("p")!.textContent === "😀 This is the example.", "correction changed unrelated text")
    assert(doc.querySelector("em.meaning") && doc.body.innerHTML.includes("<!--keep-->"), "correction removed formatting or comments")
    child.doc.undo()
    assert(child.toHTML(true) === before, "correction did not undo as one operation")
    await feature.checkNow()
    assert(rightClick().defaultPrevented, "right-click suggestions did not reopen after undo")
    const correction = Array.from(doc.body.shadowRoot!.querySelectorAll<HTMLButtonElement>(".◆proofreading-popup button")).find(button => button.textContent === "the")!
    assert(correction, "right-click popup offered no correction")
    correction.click()
    assert(doc.querySelector("p")!.textContent === "😀 This is the example.", "right-click correction did not apply")
    assert(!doc.body.shadowRoot!.querySelector(".◆proofreading-popup"), "right-click correction left its popup behind")
    child.doc.undo()
    assert(child.toHTML(true) === before, "right-click correction did not undo as one operation")
    await feature.checkNow()
    assert(rightClick().defaultPrevented, "right-click suggestions did not reopen before ignoring")
    const ignore = Array.from(doc.body.shadowRoot!.querySelectorAll<HTMLButtonElement>(".◆proofreading-popup button")).find(button => button.textContent === "Ignore")!
    ignore.click()
    assert(!rightClick().defaultPrevented, "ignoring the issue did not allow the native menu")
    await feature.checkNow()
    assert(!rightClick().defaultPrevented, "rechecking restored the ignored issue's popup")
    assert(child.toHTML(true) === before, "ignoring an issue changed the document")
    child.doc.redo()
    assert(doc.querySelector("p")!.textContent === "😀 This is the example.", "correction did not redo")
    // Copying the demo from another editor can turn every space into NBSP.
    // Check complete phrases without changing those authored spacing choices.
    const demo = [
      "There are some cases where the the standard grammar checkers don't cut it. That;s where Harper comes in handy.",
      "Harper is an language checker for developers. It can detect improper capitalization and misspellled words, as well as a number of other issues. Like if you break up words you shoul dn't. Harper can be an lifesaver when writing technical documents, emails or other formal forms of communication.",
      "Harper works everywhere, even when you're not online. Since your data never leaves your device, you don't ned too worry abuot us selling it or using it to train large language models.",
      "The best part: Harper can give you feedback instantly. For most documents, Harper can serve up suggestions in under 10 ms, faster that Grammarly.",
    ]
    feature.setChecking(false)
    doc.body.innerHTML = `<p><meta http-equiv="content-type" content="text/html; charset=utf-8"></p>${demo.map(text => `<p>${text.replaceAll(" ", "&nbsp;")}</p>`).join("")}`
    child.doc.syncFromDOM()
    const pasted = child.toHTML(true), pastedShared = child.doc.body.toString()
    feature.setChecking(true)
    await feature.checkNow()
    const pastedIssues = feature.state().issues.filter(issue => issue.kind !== "accessibility")
    assert(pastedIssues.length === 13, `NBSP demo lost findings: ${JSON.stringify(pastedIssues)}`)
    assert(pastedIssues.filter(issue => issue.kind === "grammar").length === 1, "NBSP demo lost grammar findings")
    assert(pastedIssues.filter(issue => issue.kind === "style").length === 7, "NBSP demo lost style findings")
    assert(pastedIssues.some(issue => issue.text === "shoul\u00a0dn't" && issue.kind === "style"), "split-word correction lost authored spacing")
    const repeated = pastedIssues.find(issue => issue.text === "the\u00a0the")!
    assert(repeated && feature.selectIssue(repeated.id) && doc.getSelection()!.toString() === "the\u00a0the", "normalized phrase offsets do not select the authored text")
    assert(registry.get("webwriter-grammar")?.size === 1, "NBSP grammar ranges are not painted")
    const styleHighlight = registry.get("webwriter-style")!
    assert(styleHighlight?.size === 7 && styleHighlight.type === "highlight", "style ranges are not painted")
    const styleDecoration = childWindow.getComputedStyle(doc.querySelectorAll("p")[2], "::highlight(webwriter-style)")
    assert(styleDecoration.textDecorationStyle === "wavy" && styleDecoration.textDecorationColor === "rgb(123, 63, 187)", "style underline is not purple and wavy")
    const styleRange = Array.from(styleHighlight).find(range => range.toString() === "an")! as Range
    const styleRect = styleRange.getBoundingClientRect()
    const styleEvent = new childWindow.MouseEvent("contextmenu", {clientX: styleRect.left + styleRect.width / 2,
      clientY: styleRect.top + styleRect.height / 2, button: 2, bubbles: true, composed: true, cancelable: true})
    doc.elementFromPoint(styleEvent.clientX, styleEvent.clientY)!.dispatchEvent(styleEvent)
    const stylePopup = doc.body.shadowRoot!.querySelector<HTMLElement>(".◆proofreading-popup")!
    assert(styleEvent.defaultPrevented && stylePopup.getAttribute("aria-label") === "Style suggestions", "style popup does not show the category")
    assert(!stylePopup.querySelector(".proofreading-add-word") && stylePopup.querySelector(".proofreading-actions") === stylePopup.querySelector(".proofreading-card")!.lastElementChild, "style popup has incorrect footer actions")
    stylePopup.dispatchEvent(new childWindow.KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    assert(child.toHTML(true) === pasted && child.doc.body.toString() === pastedShared, "checking normalized authored or shared HTML")
    child.doc.stopCapturing()
    assert(feature.applySuggestion(repeated.id, 0), "NBSP phrase correction failed")
    assert(doc.querySelectorAll("p")[1].textContent === demo[0].replace("the the", "the").replaceAll(" ", "\u00a0"), "correction changed unrelated NBSP characters")
    child.doc.undo()
    assert(child.toHTML(true) === pasted, "NBSP phrase correction did not undo")
    await feature.checkNow()
    const ignored = feature.state().issues.find(issue => issue.text === "an")!
    assert(feature.ignore(ignored.id), "could not ignore a style finding")
    const ignoredParagraph = doc.querySelectorAll("p")[2]
    const ignoredText = ignoredParagraph.firstChild as Text
    ignoredText.insertData(0, "For example, ")
    ignoredText.appendData(" More prose.")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 1, "surrounding DOM edits restored the ignored occurrence")
    ignoredText.insertData(ignoredText.data.indexOf("an"), "an language checker. ")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 2, `ignoring an occurrence suppressed newly inserted identical text: ${JSON.stringify(feature.state().issues)}`)
    const ignoredShared = (child.doc.body.toArray()[2] as Y.XmlElement).firstChild as Y.XmlText
    child.doc.doc.transact(() => { ignoredShared.insert(0, "Remote ") }, "remote-peer")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 2, "remote prose edits restored the ignored occurrence")
    assert(ignoredParagraph.textContent!.startsWith("Remote For example, "), "remote edit did not reach the ignored paragraph")
    child.doc.doc.transact(() => { ignoredShared.insert(ignoredText.data.indexOf("an\u00a0language"), "an language checker. ") }, "remote-peer")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 3, "ignoring an occurrence suppressed identical text inserted remotely")
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    const documentToggle = toolbox.shadowRoot!.querySelector<HTMLInputElement>(".proofreading-toggle input")!
    assert(documentToggle.checked && !documentToggle.disabled, "Review has no available document preference")
    await bridgeClick(documentToggle)
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(!documentToggle.checked && !feature.state().enabled, "Review did not disable document checking")
    assert(!toolbox.shadowRoot!.querySelector(".proofreading-card") && !toolbox.shadowRoot!.querySelector(".proofreading-spinner"), "disabled checking left suggestions or a loading spinner")
    const savedPreference = new DOMParser().parseFromString(child.toHTML(), "text/html")
    assert(savedPreference.documentElement.getAttribute("spellcheck") !== "false", "proofreading preference leaked into authored HTML")
    const {loadDocumentSettings, persistDocumentSettings} = await import("../src/app-settings")
    persistDocumentSettings("native-proofreading", {proofreadingEnabled: feature.state().documentEnabled})
    childWindow.reinitializeEditor!()
    const restored = childWindow.editor!, restoredFeature = restored.features.proofreading
    restoredFeature.setDocumentChecking(loadDocumentSettings("native-proofreading").proofreadingEnabled !== false)
    await restoredFeature.checkNow()
    assert(!restoredFeature.state().enabled && !restoredFeature.state().documentEnabled, "restoring local document settings lost the proofreading preference")
    restoredFeature.setDocumentChecking(true)
    assert(restoredFeature.state().enabled && restoredFeature.state().documentEnabled, "document override did not enable proofreading")
    localStorage.removeItem("webwriter_document_settings_v1:native-proofreading")
    await restoredFeature.checkNow()
    assert(restoredFeature.state().ready && restoredFeature.state().issues.length > 0, "re-enabling checking did not restore findings")
    restored.destroy()
    assert(!registry.has("webwriter-style"), "style underlines leaked on teardown")
    assert(!registry.has("webwriter-spelling") && !doc.body.shadowRoot!.querySelector(".◆proofreading-panel"), "proofreading leaked on teardown")
  }
  finally { window.removeEventListener("message", update); frame.contentWindow?.editor?.destroy(); frame.remove(); toolbox.remove() }
})

await check("Accessibility review shares Issues controls without loading while disabled", async () => {
  const {editorFrameHTML} = await import("../src/frame-document")
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const source = new DOMParser().parseFromString(editorFrameHTML(null, {
    bridgeNonce: crypto.randomUUID(), revision: 0, language: "en-US", packages: [],
    hostOrigin: location.origin, entryURL: `${location.origin}/tests/native-browser-frame.ts?proofreading-disabled`, executeScripts: true,
  }), "text/html")
  const policy = source.querySelector('meta[http-equiv="Content-Security-Policy"]')!.outerHTML
  const nonce = source.querySelector("script[nonce]")!.getAttribute("nonce")!
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:620px;border:0"
  frame.srcdoc = `<!doctype html><html lang="en-US" style="scrollbar-gutter:stable both-edges"><head>${policy}<script class="◆editor-only" nonce="${nonce}" type="module" src="/tests/native-browser-frame.ts?proofreading-disabled"></script></head><body><main><img id="missing-alt" style="width:100px;height:60px"><a id="empty-link" href="#" style="display:inline-block;width:100px;height:24px"></a><native-accessibility-private-widget></native-accessibility-private-widget><div style="height:800px"></div></main></body></html>`
  const toolbox = new DomEditorToolbox()
  toolbox.style.cssText = "width:320px;height:620px"
  document.body.append(frame, toolbox)
  let child: import("../src/domeditor").DOMEditor | undefined
  let childDestroyed = false
  try {
    for(let attempt = 0; !frame.contentWindow?.editor && !frame.contentWindow?.editorError && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert(!frame.contentWindow?.editorError, frame.contentWindow?.editorError ?? "editor failed")
    child = frame.contentWindow!.editor!
    const doc = frame.contentDocument!, feature = child.features.proofreading
    const childWindow = doc.defaultView as Window & typeof globalThis
    class PrivateWidget extends childWindow.HTMLElement {
      constructor() {
        super()
        this.attachShadow({mode: "open"}).innerHTML = '<button></button><img>'
      }
    }
    childWindow.customElements.define("native-accessibility-private-widget", PrivateWidget)
    assert(doc.querySelector("native-accessibility-private-widget")!.shadowRoot?.querySelector("button"), "private widget was not initialized")
    class ContentfulWidget extends childWindow.HTMLElement {
      constructor() {
        super()
        this.attachShadow({mode: "open"}).innerHTML = '<section><slot></slot><button></button></section>'
      }
    }
    childWindow.customElements.define("native-accessibility-content-widget", ContentfulWidget)
    child.schema.extendWidgets([{tagName: "native-accessibility-content-widget", editingConfig: {content: "p*"}}])
    const contentfulWidget = doc.createElement("native-accessibility-content-widget")
    contentfulWidget.innerHTML = '<p><input id="slotted-input"></p>'
    doc.querySelector("main")!.append(contentfulWidget)
    await new Promise(resolve => setTimeout(resolve, 100))
    const initiallyDisabled = feature.state()
    assert(!initiallyDisabled.enabled && !initiallyDisabled.ready && !initiallyDisabled.checking && initiallyDisabled.issues.length === 0,
      `disabled Issues unexpectedly checked: ${JSON.stringify(initiallyDisabled)}`)
    assert(!doc.defaultView!.performance.getEntriesByType("resource").some(entry => /axe-core/i.test(entry.name)),
      "disabled Issues loaded axe-core")

    const bootstrap = doc.createElement("script")
    bootstrap.type = "application/json"
    bootstrap.className = "◆ ◆editor-only"
    bootstrap.textContent = 'globalThis.litIssuedWarnings ??= new Set(); globalThis.litIssuedWarnings.add("dev-mode")'
    doc.head.prepend(bootstrap)

    const before = child.toHTML(true), shared = child.doc.body.toString()
    feature.setChecking(false)
    assert(feature.setDocumentChecking(true), "could not enable document preference")
    feature.actions.checkProofreading({type: "checkProofreading"})
    await feature.checkNow()
    assert(!feature.state().allowed && !feature.state().enabled && !feature.state().ready,
      "document preference or manual check bypassed globally disabled Issues")
    feature.setChecking(true)
    await feature.checkNow()
    assert(!feature.state().issues.some(issue => issue.kind === "accessibility"), "unsaved document ran automatic accessibility review")
    assert(!doc.defaultView!.performance.getEntriesByType("resource").some(entry => /axe-core/i.test(entry.name)),
      "unsaved document loaded axe-core automatically")
    feature.setAccessibilityReviewEnabled(true)
    await feature.checkNow()
    let issues = feature.state().issues
    const titleIssue = issues.find(issue => issue.kind === "accessibility" && issue.helpUrl?.includes("/document-title"))
    assert(titleIssue?.text === "Document", `page issue preview included unrelated document content: ${JSON.stringify(titleIssue)}`)
    assert(issues.every(issue => !issue.text.includes("litIssuedWarnings")), "accessibility preview exposed editor bootstrap code")
    const imageIssue = issues.find(issue => issue.kind === "accessibility" && issue.text === "<img>")!
    const linkIssue = issues.find(issue => issue.kind === "accessibility" && issue.text === "<a>")!
    assert(imageIssue && linkIssue, `axe did not report missing image alt and empty link names: ${JSON.stringify(issues)}`)
    assert(issues.some(issue => issue.kind === "accessibility" && issue.text === "<input>"), "axe missed authored content through a widget's nested slot")
    assert(!issues.some(issue => issue.kind === "accessibility" && issue.text === "<button>"), "axe reported a shadow widget's private button")
    assert(!issues.some(issue => issue.text === "Learn more" || issue.text === "Ignore"), "axe reported appendix interface controls")
    await new Promise(resolve => childWindow.requestAnimationFrame(() => resolve(undefined)))
    const image = doc.querySelector<HTMLImageElement>("#missing-alt")!
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete

    const appendix = doc.body.shadowRoot!
    const reviewButton = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Review"]')!
    const accessibilityBadge = reviewButton.querySelector<HTMLElement>(".toolbox-tab-accessibility-badge")!
    const accessibilityIssueCount = issues.filter(issue => issue.kind === "accessibility").length
    assert(accessibilityBadge && reviewButton.getAttribute("aria-description")?.includes(`${accessibilityIssueCount} accessibility ${accessibilityIssueCount === 1 ? "issue" : "issues"}`),
      "closed Review tab did not announce accessibility issues")
    assert(!appendix.querySelector('[part~="accessibility-issue-pill"]'), "accessibility findings rendered per-element pills")
    assert(!appendix.querySelector('[part="accessibility-issue-outline"]'), "accessibility issue was outlined before opening its context menu")
    const tabRect = reviewButton.getBoundingClientRect(), iconRect = accessibilityBadge.getBoundingClientRect()
    assert(iconRect.width > 0 && iconRect.height > 0 && iconRect.right <= tabRect.right && iconRect.top >= tabRect.top,
      `accessibility badge was not fully inside the Review tab: ${JSON.stringify({badge: iconRect.toJSON(), tab: tabRect.toJSON()})}`)
    assert(getComputedStyle(accessibilityBadge).backgroundColor === "rgb(8, 127, 91)", "Review badge did not use the accessibility green")
    assert(accessibilityBadge.textContent?.trim() === String(accessibilityIssueCount),
      `Review badge did not show the accessibility issue count (${accessibilityIssueCount})`)
    assert(iconRect.width >= 14 && iconRect.height >= 14, "Review accessibility count bubble was not large enough to read")

    toolbox.selectTool("Review")
    await toolbox.updateComplete
    assert(reviewButton.querySelector(".toolbox-tab-accessibility-badge"), "opening Review hid the accessibility badge")
    const card = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".proofreading-card"))
      .find(candidate => candidate.querySelector(".proofreading-text")?.textContent === "<img>")!
    assert(card, "Review did not render the accessibility issue card")

    const imageRect = image.getBoundingClientRect()
    const context = new childWindow.MouseEvent("contextmenu", {clientX: imageRect.left + imageRect.width / 2,
      clientY: imageRect.top + imageRect.height / 2, button: 2, bubbles: true, composed: true, cancelable: true})
    image.dispatchEvent(context)
    assert(context.defaultPrevented, "image context menu did not open the accessibility popup")
    const popup = appendix.querySelector<HTMLElement>('[part="proofreading-popup"]')!
    const outline = appendix.querySelector<HTMLElement>('[part="accessibility-issue-outline"]')!
    assert(popup && outline, "context menu did not show its popup and target outline")
    const popupCard = popup.querySelector<HTMLElement>(".proofreading-card")!
    assert(popupCard && popupCard.querySelector(".proofreading-text")?.textContent === card.querySelector(".proofreading-text")?.textContent,
      "context popup did not share the Review card content")
    const outlineRect = outline.getBoundingClientRect(), targetRect = image.getBoundingClientRect(), popupRect = popup.getBoundingClientRect()
    assert(Math.abs(outlineRect.left - targetRect.left) <= 1 && Math.abs(outlineRect.top - targetRect.top) <= 1
      && Math.abs(outlineRect.width - targetRect.width) <= 1 && Math.abs(outlineRect.height - targetRect.height) <= 1,
    `accessibility outline did not match its target: ${JSON.stringify({outline: outlineRect.toJSON(), target: targetRect.toJSON()})}`)
    assert(popupRect.width > 0 && popupRect.height > 0 && popupRect.left >= 0 && popupRect.right <= childWindow.innerWidth
      && popupRect.top >= 0 && popupRect.bottom <= childWindow.innerHeight,
    `accessibility popup was outside the viewport: ${JSON.stringify(popupRect.toJSON())}`)
    assert(popupCard.querySelector(".proofreading-kind")?.textContent === "Accessibility", "popup lost its accessibility category")
    assert(popupCard.querySelector<HTMLAnchorElement>(".proofreading-help")?.href.includes("dequeuniversity.com/rules/axe"), "popup did not show the axe rule help link")
    assert(getComputedStyle(popupCard).borderTopColor === "rgb(8, 127, 91)", "accessibility popup card did not use the green issue color")
    popup.dispatchEvent(new childWindow.KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    assert(!appendix.querySelector('[part="accessibility-issue-outline"]') && !appendix.querySelector('[part="proofreading-popup"]'),
      "Escape did not close the accessibility popup and outline")
    assert(doc.activeElement === doc.body, "Escape did not return focus to the document body")

    const reopen = new childWindow.MouseEvent("contextmenu", {clientX: imageRect.left + imageRect.width / 2,
      clientY: imageRect.top + imageRect.height / 2, button: 2, bubbles: true, composed: true, cancelable: true})
    image.dispatchEvent(reopen)
    assert(appendix.querySelector('[part="proofreading-popup"]') && appendix.querySelector('[part="accessibility-issue-outline"]'),
      "could not reopen accessibility popup before scroll check")
    childWindow.scrollTo(0, 30)
    await new Promise(resolve => childWindow.requestAnimationFrame(() => resolve(undefined)))
    assert(!appendix.querySelector('[part="proofreading-popup"]') && !appendix.querySelector('[part="accessibility-issue-outline"]'),
      "scrolling did not dismiss the accessibility popup and outline")

    await feature.checkNow()
    issues = feature.state().issues
    assert(issues.some(issue => issue.id === imageIssue.id) && issues.some(issue => issue.id === linkIssue.id), "appendix popup controls entered accessibility results")
    assert(child.toHTML(true) === before && child.doc.body.toString() === shared, "review UI changed authored or shared document content")

    const route = (event: Event) => {
      const action = (event as CustomEvent<ProofreadingAction>).detail
      if(action.type === "selectProofreadingIssue") feature.selectIssue(action.id)
      else if(action.type === "ignoreProofreadingIssue") feature.ignore(action.id)
    }
    toolbox.addEventListener("proofreading-action", route)
    try {
      card.querySelector<HTMLButtonElement>(".proofreading-issue")!.click()
      assert(doc.getSelection()?.getRangeAt(0).intersectsNode(image), "accessibility card did not select its image")
      card.querySelector<HTMLButtonElement>(".proofreading-ignore")!.click()
      await feature.checkNow()
      toolbox.proofreadingState = feature.state()
      await toolbox.updateComplete
      assert(!feature.state().issues.some(issue => issue.id === imageIssue.id), "ignored image issue returned on recheck")
      assert(feature.state().issues.some(issue => issue.id === linkIssue.id), "ignoring the image also removed the empty-link issue")
    }
    finally { toolbox.removeEventListener("proofreading-action", route) }

    image.setAttribute("alt", "Chart of results")
    child.doc.syncFromDOM()
    child.doc.stopCapturing()
    await feature.checkNow()
    assert(!feature.state().issues.some(issue => issue.kind === "accessibility" && issue.text === "<img>"), "adding alt text did not clear the image issue")
    child.doc.undo()
    await feature.checkNow()
    assert(feature.state().issues.some(issue => issue.kind === "accessibility" && issue.text === "<img>"), "undo did not restore the missing-alt issue")
    child.doc.redo()
    await feature.checkNow()
    assert(!feature.state().issues.some(issue => issue.kind === "accessibility" && issue.text === "<img>"), "redo did not restore the alt text")
    assert(child.toHTML(true).includes('alt="Chart of results"'), "alt text did not remain authored document content")

    feature.setDocumentChecking(false)
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(!toolbox.shadowRoot!.querySelector('[data-tool="Review"] .toolbox-tab-accessibility-badge'), "disabling Issues left the Review accessibility badge")
    assert(!appendix.querySelector('[part~="accessibility-issue-pill"]'), "disabling Issues left accessibility pills in the appendix")
    assert(!appendix.querySelector('[part="proofreading-popup"]'), "disabling Issues left the accessibility menu in the appendix")
    assert(!doc.body.shadowRoot!.querySelector('[part="accessibility-issue-outline"]'), "disabling Issues left accessibility outlines in the appendix")
    assert(child.toHTML(true).includes('alt="Chart of results"'), "disabling Issues changed the document")
    assert(feature.setDocumentChecking(true), "could not re-enable Issues for destroy cleanup")
    await feature.checkNow()
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(toolbox.shadowRoot!.querySelector('[data-tool="Review"] .toolbox-tab-accessibility-badge'), "re-enabling Issues did not restore the Review accessibility badge")
    assert(!appendix.querySelector('[part~="accessibility-issue-pill"]'), "re-enabling Issues restored per-element accessibility pills")
    const emptyLink = doc.querySelector<HTMLAnchorElement>("#empty-link")!
    const linkRect = emptyLink.getBoundingClientRect()
    const destroyContext = new childWindow.MouseEvent("contextmenu", {clientX: linkRect.left + linkRect.width / 2,
      clientY: linkRect.top + linkRect.height / 2, button: 2, bubbles: true, composed: true, cancelable: true})
    emptyLink.dispatchEvent(destroyContext)
    assert(appendix.querySelector('[part="proofreading-popup"]') && appendix.querySelector('[part="accessibility-issue-outline"]'),
      "could not open accessibility UI before editor destruction")
    child.destroy()
    childDestroyed = true
    assert(!appendix.querySelector('[part~="accessibility-issue-pill"]') && !appendix.querySelector('[part="proofreading-popup"]')
      && !appendix.querySelector('[part="accessibility-issue-outline"]'), "editor destruction left accessibility UI in the appendix")
  }
  finally {if(!childDestroyed) child?.destroy(); toolbox.remove(); frame.remove()}
})

await check("Review shares bounded scroll areas and lays out versions beside responsive changes", async () => {
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const {DeveloperConsole} = await import("../src/components/developer-console")
  const {emptyProofreadingState, emptyVersionHistoryState} = await import("../src/editor-bridge")
  const toolbox = new DomEditorToolbox()
  toolbox.style.cssText = "position:fixed;top:60px;right:10px;width:218px;height:480px"
  toolbox.selectTool("Review")
  fixture.append(toolbox)
  const console = new DeveloperConsole()
  console.review = true
  console.style.cssText = "position:fixed;top:60px;left:10px;width:800px"
  fixture.append(console)
  const scenario = async (comments: number, issues: number) => {
    toolbox.commentState = {canComment: false, active: false, text: "", activeCount: 0, count: comments,
      highlighting: true, activeThreadId: null, threads: Array.from({length: comments}, (_, index) => ({
        id: `thread-${index}`, target: "text", active: false, comments: [{id: `comment-${index}`, text: "Review this sentence and its supporting detail.", author: {id: "ada", name: "Ada"}, createdAt: 1, editedAt: 1}],
      }))}
    toolbox.proofreadingState = {...emptyProofreadingState(), ready: true, issues: Array.from({length: issues}, (_, index) => ({
      id: `issue-${index}`, start: 0, end: 3, text: "teh", kind: "spelling", message: "Check this spelling", suggestions: [{kind: "replace", text: "the"}],
    }))}
    await toolbox.updateComplete
    await Promise.all(Array.from(toolbox.shadowRoot!.querySelectorAll<import("../src/components/ribbon-drawer").RibbonDrawer>("ribbon-drawer"), drawer => drawer.updateComplete))
    await layoutFrame()
  }
  try {
    await scenario(20, 20)
    const content = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!
    const comments = content.querySelector<HTMLElement>(".review-comments")!, issues = content.querySelector<HTMLElement>(".review-issues")!
    assert(comments.getBoundingClientRect().top < issues.getBoundingClientRect().top, "Comments are not above Issues")
    assert(Math.abs(comments.offsetHeight - issues.offsetHeight) <= 1, "long Review sections do not share space equally")
    assert(content.scrollHeight <= content.clientHeight + 1 && getComputedStyle(content).overflowY === "hidden", "Review toolbox scrolls or overflows")
    const commentsDrawer = comments.querySelector<import("../src/components/ribbon-drawer").RibbonDrawer>("ribbon-drawer")!
    const commentList = commentsDrawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const commentHeading = commentsDrawer.shadowRoot!.querySelector<HTMLElement>(".pane-label")!
    const issueList = issues.querySelector<HTMLElement>(".proofreading-content")!
    const issueHeading = issues.querySelector<HTMLElement>("h2")!
    const headingTops = [commentHeading, issueHeading].map(heading => heading.getBoundingClientRect().top)
    for(const list of [commentList, issueList]) {
      assert(list.scrollHeight > list.clientHeight && getComputedStyle(list).scrollbarWidth === "thin", "long list has no independent thin scroll area")
      list.scrollTop = 100
    }
    await layoutFrame()
    for(const [index, heading] of [commentHeading, issueHeading].entries()) assert(Math.abs(heading.getBoundingClientRect().top - headingTops[index]) < 1, "Review heading moves while its list scrolls")
    assert(comments.scrollTop === 0 && issues.scrollTop === 0, "Review section scrolls instead of only its list")
    const half = comments.offsetHeight
    await scenario(20, 0)
    assert(comments.offsetHeight > half && issues.scrollHeight <= issues.clientHeight + 1, "short Issues do not release space to Comments")
    await scenario(0, 20)
    assert(issues.offsetHeight > half && comments.scrollHeight <= comments.clientHeight + 1, "short Comments do not release space to Issues")
    const user = {clientId: 1, name: "Ada", initials: "AD", color: "#64748b"}
    const checkpoint = (id: string) => ({id, timestamp: 1, label: "Change", user, changes: {added: 0, removed: 0, modified: 1}, commentCount: 0})
    const checkpoints = Array.from({length: 16}, (_, index) => checkpoint(`change-${index}`))
    console.historyState = {...emptyVersionHistoryState(), checkpoints, versions: Array.from({length: 8}, (_, index) => ({
      ...checkpoint(`version-${index}`), checkpointIds: checkpoints.map(checkpoint => checkpoint.id), isUnsaved: index === 0, isCurrent: index === 0,
    }))}
    await console.updateComplete
    await Promise.all(Array.from(console.shadowRoot!.querySelectorAll<import("../src/components/ribbon-drawer").RibbonDrawer>("ribbon-drawer"), drawer => drawer.updateComplete))
    await layoutFrame()
    const sidebar = console.shadowRoot!.querySelector<HTMLElement>(".version-list")!
    const main = console.shadowRoot!.querySelector<HTMLElement>("#console-panel-Review")!
    const changes = Array.from(main.querySelectorAll<HTMLElement>(".history-change-card"))
    assert(sidebar.scrollHeight > sidebar.clientHeight && getComputedStyle(sidebar).scrollbarWidth === "thin", "versions list does not scroll")
    assert(main.getBoundingClientRect().left >= sidebar.getBoundingClientRect().right, "changes are not beside versions")
    assert(changes.length === 14 && changes[1].getBoundingClientRect().top > changes[0].getBoundingClientRect().top, "changes are not a vertical list")
    const label = changes[0].querySelector<HTMLElement>(".history-checkpoint-label")!
    const meta = changes[0].querySelector<HTMLElement>(".history-checkpoint-meta")!
    assert(Math.abs(label.getBoundingClientRect().top - meta.getBoundingClientRect().top) < 3, "wide changes do not use a single row")
    assert(main.scrollHeight > main.clientHeight && getComputedStyle(main).scrollbarWidth === "thin", "long change list does not scroll")
    assert(getComputedStyle(changes[0]).backgroundColor === "rgba(0, 0, 0, 0)", "change cards are not transparent")
    const counts = changes[0].querySelector<HTMLElement>(".history-checkpoint-counts")!
    assert(counts.getBoundingClientRect().left - meta.getBoundingClientRect().right < 12, "wide change counts are not beside the text")
    assert(!changes[0].querySelector(".history-change-count"), "change cards still show a total badge")
    const versionCard = sidebar.querySelector<HTMLElement>(".history-version-card")!
    const versionBadge = versionCard.querySelector<HTMLElement>(".history-change-count")!
    assert(versionBadge.getBoundingClientRect().right > versionCard.getBoundingClientRect().right - 10, "version badge is not on the right edge")
    console.style.width = "424px"
    await layoutFrame()
    assert(main.getBoundingClientRect().width >= 195 && main.getBoundingClientRect().width <= 205, "narrow changes fixture is not about 200px")
    assert(Math.abs(counts.getBoundingClientRect().left - label.getBoundingClientRect().left) < 1, "narrow counts do not align with text")
    assert(meta.getBoundingClientRect().top > label.getBoundingClientRect().top, "narrow changes do not wrap into compact cards")
    assert(main.scrollWidth <= main.clientWidth && changes[0].scrollWidth <= changes[0].clientWidth, "narrow changes overflow horizontally")
    assert(!toolbox.shadowRoot!.querySelector(".version-list") && toolbox.shadowRoot!.querySelector("footer .versions-console-toggle"), "Versions remain in the Review toolbox")

  }
  finally {toolbox.remove(); console.remove()}
})

await check("Elements pullout reserves matching padding after its opening animation", async () => {
  const {RibbonDrawer} = await import("../src/components/ribbon-drawer")
  const {RibbonButton} = await import("../src/components/ribbon-button")
  for(const compact of [false, true]) {
    const drawer = new RibbonDrawer()
    drawer.layout = "elements"
    drawer.collapsed = true
    drawer.compact = compact
    drawer.style.cssText = "position:fixed;left:100px;top:100px;width:84px;height:90px;--ribbon-drawer-panel-padding-block:8px"
    for(const label of ["Paragraph", "Heading", "List", "Details", "Table", "Image", "Graphic", "Audio", "Website", "Video"]) {
      const button = new RibbonButton()
      button.label = label
      button.variant = "insertion"
      if(compact) button.slot = "compact"
      drawer.append(button)
    }
    document.body.append(drawer)
    try {
      await drawer.updateComplete
      drawer.openDrawer()
      await drawer.updateComplete
      await new Promise(resolve => setTimeout(resolve, 260))
      await layoutFrame()
      const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
      const primary = drawer.shadowRoot!.querySelector<HTMLElement>(".elements-primary-controls")!
      const panel = controls.getBoundingClientRect(), content = primary.getBoundingClientRect()
      assert(content.top - panel.top >= 8, `top padding missing (compact: ${compact})`)
      assert(panel.bottom - content.bottom >= 8, `bottom padding clipped: ${panel.bottom - content.bottom}px (compact: ${compact})`)
      assert(Math.abs((content.top - panel.top) - (panel.bottom - content.bottom)) <= 1, "top and bottom padding differ")
    }
    finally {drawer.remove()}
  }
})


await check("rotated figure captions flow upright and their transformation frames fit the content", async () => {
  const overlaps = (polygon: {x: number, y: number}[], rect: DOMRect) => {
    const text = [{x: rect.left, y: rect.top}, {x: rect.right, y: rect.top}, {x: rect.right, y: rect.bottom}, {x: rect.left, y: rect.bottom}]
    for(const points of [polygon, text]) for(let index = 0; index < points.length; index++) {
      const start = points[index], end = points[(index + 1) % points.length]
      const project = (point: {x: number, y: number}) => (end.y - start.y) * point.x - (end.x - start.x) * point.y
      const a = polygon.map(project), b = text.map(project)
      if(Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return false
    }
    return true
  }
  for(const standalone of [false, true]) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:480px;height:700px;max-width:none"
    frame.src = `/tests/figure-rotation.html${standalone ? "?standalone" : ""}`
    document.body.append(frame)
    try {
      for(let attempt = 0; !frame.contentDocument?.querySelector("figure[class*='◆figure-flow-']") && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      const doc = frame.contentDocument!, view = frame.contentWindow!
      const figure = doc.querySelector<HTMLElement>("figure")!, image = figure.querySelector("img")!, caption = figure.querySelector<HTMLElement>("figcaption")!
      assert(figure && image && caption, "figure fixture did not initialize")
      const editor = (view as Window & {editor?: DOMEditor}).editor
      const authored = image.getAttribute("style")
      for(const rotation of [-30, 30, 90, 150]) for(const alignment of ["left", "center", "right"] as const) for(const above of [false, true]) {
        image.style.rotate = `${rotation}deg`
        caption.style.textAlign = alignment
        above ? figure.prepend(caption) : figure.append(caption)
        await layoutFrame(); await layoutFrame()
        const style = view.getComputedStyle(image), box = image.getBoundingClientRect()
        const radians = rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians)
        const width = parseFloat(style.width), height = parseFloat(style.height)
        const polygon = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]].map(([x, y]) => ({x: box.left + box.width / 2 + c * x - s * y, y: box.top + box.height / 2 + s * x + c * y}))
        const context = `${standalone}/${rotation}/${alignment}/${above}`
        assert(!view.getComputedStyle(caption).rotate || ["none", "0deg"].includes(view.getComputedStyle(caption).rotate), `${context}: caption rotated`)
        const text = caption.firstChild!
        const range = doc.createRange()
        for(let index = 0; index < text.textContent!.length; index++) {
          range.setStart(text, index); range.setEnd(text, index + 1)
          assert(!Array.from(range.getClientRects()).some(rect => overlaps(polygon, rect)), `${context}: caption character ${index} overlaps the rotated content`)
        }
        for(const word of text.textContent!.matchAll(/\S+/g)) {
          range.setStart(text, word.index!); range.setEnd(text, word.index! + word[0].length)
          assert(range.getClientRects().length === 1, `${context}: a caption word broke into narrow fragments`)
        }
        assert(figure.getBoundingClientRect().bottom + 1 >= box.bottom, `${context}: rotated content escaped its flow allocation`)
        if(editor) {
          editor.features.selection.captureElement(figure)
          editor.features.transformation.updateInfo()
          const overlay = editor.features.transformation.overlay.getBoundingClientRect()
          assert(Math.abs(overlay.left - box.left) < 1 && Math.abs(overlay.top - box.top) < 1
            && Math.abs(overlay.width - box.width) < 1 && Math.abs(overlay.height - box.height) < 1, `${context}: frame is offset from the rotated content`)
        }
      }
      image.setAttribute("style", authored!)
      if(editor) {
        editor.doc.syncFromDOM()
        const html = editor.toHTML()
        assert(!new DOMParser().parseFromString(html, "text/html").body.innerHTML.includes("◆"), "layout markers leaked into saved content")
        assert(html.includes("createFigureLayout(document)"), "standalone save lost caption layout")
        assert(!html.includes('src="./figure-rotation.ts"'), "test fixture script leaked into the standalone save")
        editor.destroy()
        const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
        frame.srcdoc = html
        await loaded
        await layoutFrame(); await layoutFrame()
        const savedFigure = frame.contentDocument!.querySelector("figure")!
        assert(Array.from(savedFigure.classList).some(name => name.startsWith("◆figure-flow-")), "saved HTML did not activate its caption layout")
        assert(frame.contentWindow!.getComputedStyle(savedFigure, "::before").shapeOutside.startsWith("polygon("), "saved HTML did not restore shape-aware wrapping")
      }
    }
    finally { frame.remove() }
  }
})

const failed = checks.filter(item => item.error)
document.querySelector("#status")!.textContent = `${checks.length - failed.length} passed, ${failed.length} failed`
document.querySelector("#report")!.textContent = JSON.stringify(checks, null, 2)
document.documentElement.dataset.nativeStatus = failed.length ? "failed" : "passed"
if(new URLSearchParams(location.search).has("run")) {
  await fetch("/__native-result", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({checks})})
}
