import {defaultDocumentTheme} from "../src/document-themes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layoutFrame = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

export async function checkBoardMedia(inspect = false) {
  const frame = document.createElement("iframe"), saved = document.createElement("iframe")
  frame.style.cssText = saved.style.cssText = "width:900px;height:700px"
  frame.srcdoc = '<!doctype html><body><p></p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    for(let attempt = 0; !frame.contentWindow?.editor && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    const view = frame.contentWindow!, editor = view.editor!, doc = frame.contentDocument!
    assert(editor, "board media fixture did not initialize")
    const theme = doc.createElement("style"); theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    assert(editor.setDocumentLayout("board", "document"), "board media fixture did not convert")
    const column = editor.features.board.columns()[0]
    const source = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#3977c7"/><circle cx="400" cy="300" r="180" fill="#f4cf65"/></svg>')
    const image = `<img alt="Landscape" src="${source}">`
    const fixtures = [image, `<picture><source srcset="${source}">${image}</picture>`,
      `<video poster="${source}" controls></video>`, '<iframe title="Embedded page" srcdoc="<p>Embedded page</p>"></iframe>',
      `<figure>${image}<figcaption>Caption stays readable</figcaption></figure>`,
      `<p>Text stays readable</p><figure><picture>${image}</picture><figcaption>Nested picture caption</figcaption></figure>`,
      `${image}${image}`, `<figure><figcaption>Caption above</figcaption>${image}</figure>`,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><circle cx="400" cy="300" r="200"/></svg>',
      `<embed type="image/svg+xml" src="${source}" width="800" height="600">`,
      `<object type="image/svg+xml" data="${source}" width="800" height="600"></object>`,
      `<img alt="Explicit dimensions" src="${source}" width="800" height="600" style="width: 360px; height: 270px">`]
    const cards = fixtures.map((html, index) => {
      const card = doc.createElement("article")
      card.className = "ww-board-card"; card.id = `media-${index}`; card.innerHTML = html
      column.append(card)
      return card
    })
    editor.features.board.cards(column)[0].remove()
    await Promise.all(Array.from(doc.images, image => image.decode()))
    await layoutFrame()
    const originalHeights = cards.map(card => card.getBoundingClientRect().height)
    for(const card of cards.slice(0, 2)) {
      const bounds = card.querySelector("img")!.getBoundingClientRect()
      assert(Math.abs(bounds.height / bounds.width - .75) < .01, "auto-height card lost the natural image proportions")
    }
    const children = cards.map(card => Array.from(card.childNodes))
    const mediaStyles = Array.from(column.querySelectorAll("img, picture, video, iframe, embed, object, figure, svg"), element => element.getAttribute("style"))
    const fits = (card: HTMLElement, context: string, height = 160) => {
      const bounds = card.getBoundingClientRect(), style = view.getComputedStyle(card)
      assert(Math.abs(bounds.height - height) < 1, `${context}: card height is ${bounds.height}, expected ${height} (${card.getAttribute("style")})`)
      const bottom = bounds.bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth)
      const top = bounds.top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth)
      for(const element of card.querySelectorAll("img, picture, video, iframe, embed, object, figure, figcaption, p, svg")) {
        const rect = element.getBoundingClientRect()
        assert(rect.height > 0 && rect.top >= top - 1 && rect.bottom <= bottom + 1, `${context}: ${element.localName} escapes card (${rect.top}, ${rect.bottom}; available ${top}, ${bottom})`)
        assert(rect.left >= bounds.left && rect.right <= bounds.right, `${context}: ${element.localName} overflows horizontally`)
      }
      assert(card.scrollHeight <= card.clientHeight + 1, `${context}: media needs scrolling instead of shrinking`)
    }
    for(const [index, card] of cards.entries()) {
      editor.features.selection.selectElement(card); editor.features.board.refresh()
      const handle = editor.features.board.transformOverlay(card)!.querySelector<HTMLElement>('[data-transform-mode="scale"]')!
      const bounds = handle.getBoundingClientRect(), y = bounds.top + bounds.height / 2, x = bounds.left + bounds.width / 2
      const win = view as Window & typeof globalThis
      handle.addEventListener("mousedown", event => editor.features.transformation.startFlowScale(event, card), {once: true})
      handle.dispatchEvent(new win.MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: x, clientY: y}))
      editor.features.transformation.handleScaleDrag(new win.MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: x, clientY: y + 160 - originalHeights[index]}))
      editor.features.transformation.handleScaleEnd()
      await layoutFrame()
      fits(card, `resized ${index}`)
      assert(children[index].every((node, childIndex) => card.childNodes[childIndex] === node), "resizing rebuilt authored content")
    }
    assert(Array.from(column.querySelectorAll("img, picture, video, iframe, embed, object, figure, svg"), element => element.getAttribute("style")).every((style, index) => style === mediaStyles[index]), "card resizing rewrote descendant styles")

    // Direct DOM updates must use the same layout without a resize gesture.
    for(const card of cards) card.style.height = card.style.maxHeight = "240px"
    await layoutFrame()
    cards.forEach((card, index) => fits(card, `grown ${index}`, 240))
    for(const card of cards) card.style.height = card.style.maxHeight = "160px"
    await layoutFrame()

    // Non-shrinkable content stays reachable; widget internals keep their own layout.
    const irregular = doc.createElement("article")
    irregular.className = "ww-board-card"; irregular.style.height = "120px"
    irregular.innerHTML = `<section><!--keep-->${image}</section><board-media-widget><span>Widget content</span></board-media-widget><img is="custom-image" alt="Custom" src="${source}" style="height:200px">`
    column.append(irregular)
    const widget = irregular.querySelector("board-media-widget")!
    const shadow = widget.attachShadow({mode: "open"}); shadow.innerHTML = '<style>:host {display:block;height:200px}</style><div style="height:200px">Private</div>'
    const irregularHTML = irregular.innerHTML
    await layoutFrame()
    assert(irregular.scrollHeight > irregular.clientHeight && view.getComputedStyle(irregular).overflowY === "auto", "unfamiliar content cannot be scrolled")
    assert(view.getComputedStyle(widget).height === "200px" && shadow.firstElementChild?.localName === "style", "widget layout changed")
    assert(irregular.innerHTML === irregularHTML, "unfamiliar content was normalized")

    const hiddenCard = doc.createElement("article")
    hiddenCard.className = "ww-board-card"; hiddenCard.hidden = true; hiddenCard.innerHTML = image
    column.append(hiddenCard)
    const hiddenMedia = doc.createElement("article")
    hiddenMedia.className = "ww-board-card"
    hiddenMedia.innerHTML = `<picture hidden>${image}</picture><figure hidden>${image}<figcaption>Hidden</figcaption></figure><figure><picture hidden>${image}</picture><figcaption>Visible caption</figcaption></figure>`
    column.append(hiddenMedia)
    await layoutFrame()
    for(const element of [hiddenCard, ...hiddenMedia.querySelectorAll<HTMLElement>("figure[hidden]")]) {
      assert(view.getComputedStyle(element).display === "none", `media fitting revealed hidden ${element.localName}: ${view.getComputedStyle(element).display}`)
    }
    assert(Array.from(hiddenMedia.querySelectorAll("picture[hidden]")).every(element => view.getComputedStyle(element).display !== "flex"), "media fitting changed hidden picture layout")

    saved.setAttribute("sandbox", "allow-same-origin")
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once: true}))
    saved.srcdoc = await editor.serializeHTML(); document.body.append(saved); await loaded
    await Promise.all(Array.from(saved.contentDocument!.images, image => image.decode()))
    await layoutFrame()
    cards.forEach((card, index) => {
      fits(doc.getElementById(card.id)!, `editing after export ${index}`)
      fits(saved.contentDocument!.getElementById(card.id)!, `exported ${index}`)
    })
    assert(!saved.contentDocument!.body.innerHTML.includes("◆"), "export contains editing markers")
  }
  finally {
    // Leave the real editing and standalone frames available for manual visual inspection.
    if(inspect) {
      frame.style.display = saved.style.display = "block"
      frame.contentWindow?.scrollTo(0, 0)
    }
    else {
      frame.contentWindow?.editor?.destroy(); frame.remove(); saved.remove()
    }
  }
}
