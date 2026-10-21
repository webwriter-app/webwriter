/** Import-free print support, also embedded verbatim in exported HTML. */
export const boardPrintContentStyles = `
body.ww-board { display: block; width: auto; min-width: 0; max-width: none; min-height: 0; margin: 0; padding: 0; background: none; }
body.ww-board > section.ww-board-column:not([is]) {
  width: 450px; inline-size: 450px; min-width: 0; max-width: none; max-inline-size: none; min-height: 0;
  margin: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none;
  break-inside: avoid; break-after: page;
}
body.ww-board > section.ww-board-column:not([is]):last-child { break-after: auto; }
body.ww-board > section.ww-board-column:not([is]) > :not(article.ww-board-card) { display: none; }
`

/** Measure the current DOM, never a saved camera or a second document model.
 * All temporary rules live in constructed sheets; authored nodes stay intact. */
export function createLayoutPrint(root) {
  const body = root.body, view = root.defaultView
  body.dispatchEvent(new Event("webwriter-layout-print-dispose"))
  const sheet = new CSSStyleSheet(), shadowSheet = new CSSStyleSheet()
  let appendix = null
  const clear = () => {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter(item => item !== sheet)
    if(appendix) appendix.adoptedStyleSheets = appendix.adoptedStyleSheets.filter(item => item !== shadowSheet)
    sheet.replaceSync(""); shadowSheet.replaceSync("")
  }
  const prepare = () => {
    clear()
    if(root.body !== body) return
    const modes = ["ww-canvas", "ww-slides", "ww-board"].filter(mode => body.classList.contains(mode))
    if(modes.length !== 1) return
    const template = body.children.length === 1 ? body.firstElementChild : null
    if(template && (template.localName.includes("-") || template.hasAttribute("is"))
      && template.getAttribute("role")?.toLowerCase().split(/\s+/).includes("document")) return
    const scale = (width, height, limit = "") => `min(${limit}calc(100vw / ${Math.max(1, width)}px), calc(100vh / ${Math.max(1, height)}px))`
    const hideAppendix = "@media print { :host > :not(slot) { display: none !important; } }"
    try {
      appendix = body.shadowRoot ?? body.attachShadow({mode: "open"})
      let slot = appendix.querySelector("slot:not([name])")
      // A shadow root cannot be detached. Retain its default slot on cleanup.
      if(!slot) { slot = root.createElement("slot"); appendix.prepend(slot) }
      shadowSheet.replaceSync(hideAppendix)
      appendix.adoptedStyleSheets = [...appendix.adoptedStyleSheets, shadowSheet]
      if(modes[0] === "ww-canvas") {
        shadowSheet.replaceSync("slot:not([name]) { transform: none !important; zoom: 1 !important; }")
        const origin = slot.getBoundingClientRect()
        const rects = Array.from(body.children).filter(item => !item.matches("style, script, link, meta, template")
          && view.getComputedStyle(item).visibility !== "hidden").map(item => item.getBoundingClientRect())
          .filter(rect => rect.width || rect.height)
        const left = rects.length ? Math.min(...rects.map(rect => rect.left)) - origin.left : 0
        const top = rects.length ? Math.min(...rects.map(rect => rect.top)) - origin.top : 0
        const width = rects.length ? Math.max(...rects.map(rect => rect.right)) - origin.left - left : 1
        const height = rects.length ? Math.max(...rects.map(rect => rect.bottom)) - origin.top - top : 1
        shadowSheet.replaceSync(`${hideAppendix}\n@media print {
          slot:not([name]) { display: block !important; position: absolute !important; left: 0; top: 0;
            transform-origin: 0 0 !important; transform: scale(${scale(width, height, "1, ")}) translate(${-left}px, ${-top}px) !important;
            zoom: 1 !important; }
          [part=canvas-background] { display: none !important; }
        }`)
      }
      else if(modes[0] === "ww-board") {
        // Use the same card widths and hidden headings as the final print layout.
        sheet.replaceSync(boardPrintContentStyles)
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
        const rules = Array.from(body.children).flatMap((column, index) => {
          if(!column.matches("section.ww-board-column:not([is])")) return []
          const rect = column.getBoundingClientRect()
          const selector = `body.ww-board > section.ww-board-column:not([is]):nth-child(${index + 1})`
          // Scale each intact card without reflowing its text at tiny zooms.
          // A page-sized column prevents fragmentation of very long columns.
          return [`${selector} { --ww-print-scale: ${scale(rect.width, Math.max(rect.height, column.scrollHeight))};
            position: relative; display: block; width: 100vw; inline-size: 100vw; height: calc(100vh - 1px); overflow: clip; }`,
            ...Array.from(column.children).flatMap((card, cardIndex) => {
              if(!card.matches("article.ww-board-card")) return []
              const bounds = card.getBoundingClientRect()
              return [`${selector} > :nth-child(${cardIndex + 1}) { position: absolute; margin: 0;
                left: calc(${bounds.left - rect.left}px * var(--ww-print-scale)); top: calc(${bounds.top - rect.top}px * var(--ww-print-scale));
                width: ${bounds.width}px; inline-size: ${bounds.width}px; height: ${bounds.height}px;
                transform: scale(var(--ww-print-scale)); transform-origin: 0 0; }`]
            })]
        })
        sheet.replaceSync(`@media print { ${rules.join("\n")} }`)
      }
    }
    catch(error) { clear(); throw error }
  }
  const destroy = () => {
    clear()
    view.removeEventListener("beforeprint", prepare)
    view.removeEventListener("afterprint", clear)
    view.removeEventListener("pagehide", destroy)
    body.removeEventListener("webwriter-layout-print-dispose", destroy)
  }
  view.addEventListener("beforeprint", prepare)
  view.addEventListener("afterprint", clear)
  view.addEventListener("pagehide", destroy)
  body.addEventListener("webwriter-layout-print-dispose", destroy)
  return {destroy}
}
