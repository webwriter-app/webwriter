import {createAnchorPositioner} from "../src/anchor-positioning.js"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layout = async (view: Window) => {
  await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
}
const near = (actual: number, expected: number, label: string) => assert(Math.abs(actual - expected) < 2, `${label}: ${actual} vs ${expected}`)

export async function checkElementAnchors(inspect = false) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = '<!doctype html><body><p>Initial document</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow!
    for(let attempt = 0; !view.editor && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, "anchor fixture editor did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, appendix = editor.appendix
    const positioner = createAnchorPositioner(doc)
    const target = doc.createElement("article")
    target.style.cssText = "position:relative;anchor-name:--authored-target;width:240px;height:120px;margin:180px 0 0 240px;background:#eef"
    target.innerHTML = "<p>Authored target</p>"
    doc.body.append(target)
    const shadowHost = doc.createElement("div"), outerRoot = shadowHost.attachShadow({mode:"open"})
    const innerHost = doc.createElement("div"), innerRoot = innerHost.attachShadow({mode:"open"})
    const control = doc.createElement("button")
    control.textContent = "Anchored control"
    control.style.cssText = "position:fixed;width:100px;height:32px;background:#acf"
    innerRoot.append(control); outerRoot.append(innerHost); appendix.append(shadowHost)
    positioner.bind(control, target, "left:anchor(right);top:anchor(bottom);width:anchor-size(width);height:32px")
    positioner.refresh(); await layout(view)
    const checkPosition = (label: string) => {
      const targetRect = target.getBoundingClientRect(), controlRect = control.getBoundingClientRect()
      near(controlRect.left, targetRect.right, `${label} left`)
      near(controlRect.top, targetRect.bottom, `${label} top`)
      near(controlRect.width, targetRect.width, `${label} width`)
    }
    checkPosition("initial anchor")
    assert(target.style.getPropertyValue("anchor-name") === "--authored-target", "binding overwrote the authored anchor-name")
    assert(innerHost.getAttribute("exportparts")?.includes("anchor-control"), "nested control part was not exported through the shadow chain")

    const root = doc.documentElement
    doc.body.style.minWidth = "1500px"; doc.body.style.minHeight = "1500px"
    await layout(view)
    assert(root.scrollWidth > root.clientWidth && root.scrollHeight > root.clientHeight, "fixture did not overflow both scroll axes")
    doc.defaultView!.scrollTo(120, 140); await layout(view)
    checkPosition("after native two-axis scroll")

    const duplicate = doc.createElement("button")
    duplicate.textContent = "Second control"; duplicate.style.cssText = control.style.cssText
    appendix.append(duplicate)
    positioner.bind(duplicate, target, "left:anchor(left);top:anchor(top);width:80px;height:24px")
    positioner.refresh(); await layout(view)
    near(duplicate.getBoundingClientRect().left, target.getBoundingClientRect().left, "second binding left")
    near(duplicate.getBoundingClientRect().top, target.getBoundingClientRect().top, "second binding top")
    assert(target.style.getPropertyValue("anchor-name") === "--authored-target", "simultaneous binding overwrote the authored anchor-name")

    const beforeGrowth = target.getBoundingClientRect().bottom
    target.style.height = "220px"; await layout(view)
    near(control.getBoundingClientRect().top, target.getBoundingClientRect().bottom, "anchor after target resize")
    assert(target.getBoundingClientRect().bottom > beforeGrowth + 80, "target resize did not change anchored control position")

    const widget = doc.createElement("anchor-fixture-widget")
    const widgetRoot = widget.attachShadow({mode:"open"}), widgetTarget = doc.createElement("span")
    widgetTarget.textContent = "Nested shadow target"; widgetRoot.append(widgetTarget); doc.body.append(widget)
    const widgetPopup = doc.createElement("button"); appendix.append(widgetPopup)
    positioner.bind(widgetPopup, widgetTarget, "left:anchor(right);top:anchor(bottom);width:90px;height:24px")
    positioner.refresh(); await layout(view)
    assert(widgetTarget.getAttribute("part")?.includes("anchor-target"), "shadow target part was not retained")
    const popupRect = widgetPopup.getBoundingClientRect(), nestedTargetRect = widgetTarget.getBoundingClientRect()
    const popupStyle = view.getComputedStyle(widgetPopup), nestedTargetStyle = view.getComputedStyle(widgetTarget)
    near(popupRect.left, nestedTargetRect.right,
      `cross-shadow anchor left (popup=${JSON.stringify(popupRect.toJSON())}, target=${JSON.stringify(nestedTargetRect.toJSON())}, position-anchor=${popupStyle.getPropertyValue("position-anchor")}, anchor-name=${nestedTargetStyle.getPropertyValue("anchor-name")}, target-part=${widgetTarget.getAttribute("part")}, host-exportparts=${widget.getAttribute("exportparts")})`)

    const img = doc.createElement("img"); img.alt = "atomic"; img.width = 48; img.height = 32; target.append(img)
    editor.features.selection.selectElement(img)
    assert(img.classList.contains("◆element-selected"), "native editor selection did not mark the atomic image")
    await layout(view)
    const assertOverlayMatchesImage = (label: string) => {
      const selectionOverlay = appendix.querySelector<HTMLElement>('[part~="atomic-selection-overlay"]')
      assert(selectionOverlay, "atomic image selection did not create its appendix overlay")
      assert(selectionOverlay!.style.left === "" && selectionOverlay!.style.top === "", "ordinary atomic highlight still uses JS coordinates")
      const imageRect = img.getBoundingClientRect(), overlayRect = selectionOverlay!.getBoundingClientRect()
      near(overlayRect.left, imageRect.left, `${label} overlay left`)
      near(overlayRect.top, imageRect.top, `${label} overlay top`)
      near(overlayRect.width, imageRect.width, `${label} overlay width`)
      near(overlayRect.height, imageRect.height, `${label} overlay height`)
    }
    assertOverlayMatchesImage("atomic image selection")
    editor.features.selection.processSelection(false, {scrollIntoView:false})
    doc.defaultView!.scrollTo(220, 240); await layout(view)
    assertOverlayMatchesImage("atomic image selection after scroll")
    img.width = 72; await layout(view)
    assertOverlayMatchesImage("atomic image selection after reflow")

    const paragraph = target.querySelector("p")!
    const paragraphRange = doc.createRange(); paragraphRange.selectNode(paragraph)
    doc.getSelection()!.removeAllRanges(); doc.getSelection()!.addRange(paragraphRange)
    assert(editor.features.comment.addComment("Native anchor comment"), "comment feature rejected a selected paragraph")
    const commentBubble = appendix.querySelector<HTMLButtonElement>('[part~="comment-bubble"]')
    assert(commentBubble, "comment feature did not create its appendix bubble")
    const assertCommentBubbleAnchored = (label: string) => {
      const paragraphRect = paragraph.getBoundingClientRect(), bubbleRect = commentBubble!.getBoundingClientRect()
      near(bubbleRect.left, paragraphRect.right, `${label} comment bubble left`)
      near(bubbleRect.top, paragraphRect.top, `${label} comment bubble top`)
    }
    assertCommentBubbleAnchored("comment bubble")
    doc.defaultView!.scrollTo(280, 300); await layout(view)
    assertCommentBubbleAnchored("comment bubble after native scroll")
    paragraph.append(doc.createTextNode(" grows")); await layout(view)
    assertCommentBubbleAnchored("comment bubble after text reflow")

    assert(editor.setDocumentLayout("slides", editor.getDocumentLayoutState().mode), "slide conversion failed")
    for(let index = 0; index < 7; index++) editor.features.slides.actions.addSlide({type:"addSlide"})
    await layout(view)
    const nav = doc.querySelector<HTMLElement>("nav.ww-slides-navigation")!
    nav.style.width = "220px"
    const slideActions = appendix.querySelector<HTMLElement>('[part="slide-navigation-actions"]')!
    const addSlideButton = slideActions.querySelector<HTMLButtonElement>('[name="add"]')!
    const selectedSlideLink = nav.querySelector<HTMLAnchorElement>("a.◆slide-current")!
    const removeSlideButton = slideActions.querySelector<HTMLButtonElement>('[name="remove"].shown')!
    const assertSlideControlsAnchored = (label: string) => {
      const navRect = nav.getBoundingClientRect(), addRect = addSlideButton.getBoundingClientRect()
      near(addRect.left, navRect.right + 8, `${label} add-slide right offset`)
      near(addRect.top + addRect.height / 2, navRect.top + navRect.height / 2, `${label} add-slide vertical center`)
      const linkRect = selectedSlideLink.getBoundingClientRect(), removeRect = removeSlideButton.getBoundingClientRect()
      near(removeRect.left + removeRect.width / 2, linkRect.right - 4, `${label} remove-slide corner x`)
      near(removeRect.top + removeRect.height / 2, linkRect.top + 4, `${label} remove-slide corner y`)
    }
    nav.scrollLeft = nav.scrollWidth; await layout(view)
    assertSlideControlsAnchored("slide controls after horizontal navigation scroll")
    nav.style.width = "280px"; await layout(view)
    assertSlideControlsAnchored("slide controls after navigation reflow")
    assert(paragraph.textContent === "Authored target grows", "comment selection changed paragraph text")

    assert(editor.setDocumentLayout("document", editor.getDocumentLayoutState().mode), "fixture did not return to document layout")
    doc.defaultView!.scrollTo(0, 0); await layout(view)
    const figureCases = [
      {name:"picture", create:() => {
        const picture = doc.createElement("picture"), image = doc.createElement("img")
        image.alt = "Captioned picture"; image.width = 96; image.height = 60; picture.append(image)
        return picture
      }},
      {name:"widget", create:() => {
        const widget = doc.createElement("anchor-caption-widget") as HTMLElement
        widget.style.cssText = "display:inline-block;width:180px;height:48px;background:#def"
        return widget
      }},
      {name:"SVG", create:() => {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
        svg.setAttribute("width", "180"); svg.setAttribute("height", "48"); svg.setAttribute("viewBox", "0 0 180 48")
        const rect = doc.createElementNS(svg.namespaceURI, "rect")
        rect.setAttribute("width", "180"); rect.setAttribute("height", "48"); rect.setAttribute("fill", "#def"); svg.append(rect)
        return svg
      }}
    ] as const
    for(const fixture of figureCases) {
      doc.defaultView!.scrollTo(0, 0); await layout(view)
      const figure = doc.createElement("figure"), content = fixture.create(), caption = doc.createElement("figcaption")
      figure.style.cssText = "width:280px;margin:24px 40px;border:1px solid #789;padding:8px"
      caption.textContent = `Captioned ${fixture.name} with enough text to wrap at this width.`
      figure.append(content, caption); doc.body.append(figure)
      doc.defaultView!.scrollTo(0, Math.max(0, figure.offsetTop - 100)); await layout(view)
      editor.features.selection.captureElement(content)
      await layout(view)
      assert(editor.features.selection.captureSelectedElement === content, `${fixture.name}: capture ownership moved from content`)
      const assertCaretMatches = (expected: Element, label: string) => {
        const caret = editor.features.selection.selectionCaret!.getBoundingClientRect(), expectedRect = expected.getBoundingClientRect()
        for(const key of ["left", "top", "width", "height"] as const) {
          near(caret[key], expectedRect[key], `${fixture.name} ${label} caret ${key}`)
        }
      }
      const assertTransformMatchesContent = (label: string) => {
        const frameRect = editor.features.transformation.overlay.getBoundingClientRect(), contentRect = content.getBoundingClientRect()
        for(const key of ["left", "top", "width", "height"] as const) near(frameRect[key], contentRect[key], `${fixture.name} ${label} transformation frame ${key}`)
      }
      assertCaretMatches(figure, "captioned figure")
      assertTransformMatchesContent("initial")
      const originalFigureHeight = figure.getBoundingClientRect().height
      figure.prepend(caption)
      const extra = doc.createElement("p"); extra.textContent = `Additional ${fixture.name} content before the captured item.`
      extra.style.cssText = "height:84px;margin:12px 0"
      figure.insertBefore(extra, content)
      await layout(view)
      assert(figure.getBoundingClientRect().height > originalFigureHeight + 60, `${fixture.name}: fixture reflow did not grow the figure`)
      assertCaretMatches(figure, "reflowed figure")
      assertTransformMatchesContent("reflowed")
      doc.defaultView!.scrollTo(360, 520); await layout(view)
      assertCaretMatches(figure, "scrolled figure")
      assertTransformMatchesContent("scrolled")
      if(inspect) {
        view.scrollTo(0, Math.max(0, figure.offsetTop - 100))
        await layout(view)
        return
      }
      figure.before(content); editor.features.selection.captureElement(content); await layout(view)
      assertCaretMatches(content, "content after leaving figure")
      assertTransformMatchesContent("content after leaving figure")
      assert(editor.features.selection.captureSelectedElement === content, `${fixture.name}: moving content changed capture ownership`)
      figure.remove(); content.remove()
    }

    if(!inspect) {
      positioner.release(control); positioner.release(duplicate); positioner.release(widgetPopup); positioner.destroy()
      await layout(view)
      assert(!target.className.includes("◆anchor-") && !control.className.includes("◆anchor-"), "releasing anchors left editor markers")
      assert(target.style.getPropertyValue("anchor-name") === "--authored-target", "cleanup removed the authored anchor-name")
      widget.remove(); shadowHost.remove(); editor.destroy(); frame.remove()
    }
    else doc.defaultView!.scrollTo(120, 140)
  }
  finally { if(!inspect) { frame.contentWindow?.editor?.destroy(); frame.remove() } }
}
