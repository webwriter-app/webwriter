import type {DOMEditor} from "../src/domeditor"
import {defaultDocumentTheme} from "../src/document-themes"

type HostEditor = Pick<DOMEditor, "addAppendix">
type Assert = (condition: unknown, message: string) => void

/** Native coverage for float preview geometry, transfer behavior, and cleanup. */
export async function checkNativeFloatDrag(nativeRootEditor: HostEditor, assert: Assert, layoutFrame: () => Promise<void>) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;inline-size:1400px;min-inline-size:1400px;max-inline-size:none;height:700px;border:0"
  const id = "native-float-halves"
  const result = new Promise<string | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", receive)
      reject(new Error("native float drag result timed out"))
    }, 10000)
    const receive = (event: MessageEvent) => {
      if(event.source !== frame.contentWindow || event.data?.id !== id) return
      clearTimeout(timer)
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
        const preview = editor.appendix.querySelector("#◆float-drop-preview");
        assert(preview, "no " + side + " float preview (active column: " + editor.features.manipulation.floatColumnSide()
          + "; authored floats: " + Array.from(document.body.querySelectorAll(".ww-float-left, .ww-float-right")).map(item => item.outerHTML).join(" | ") + ")");
        const box = preview.getBoundingClientRect();
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
        source.classList.remove("ww-float-left", "ww-float-right");
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
      const imageHTML = '<picture style="float:right;margin:5px;max-width:50%;color:red"><img alt="Dropped image"></picture>'
      const previewSource = editor.parseHTMLFragment(imageHTML, true).fragment.firstElementChild
      assert(previewSource, "external image drop preview source could not be parsed")
      source.style.cssText = originalStyle
      editor.features.manipulation.setFloat(source, "none")
      const lanePoints = {left:floatPoint(previewSource, "left"), right:floatPoint(previewSource, "right")}
      for(const side of ["left", "right"]) {
        source.style.cssText = originalStyle
        editor.features.manipulation.setFloat(source, "none")
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/html", imageHTML);
        const init = {dataTransfer, ...lanePoints[side], bubbles:true, cancelable:true, composed:true};
        peer.dispatchEvent(new DragEvent("dragover", init));
        peer.dispatchEvent(new DragEvent("drop", init));
        const dropped = main.querySelector("picture");
        assert(dropped, "external image drop lost its content");
        assert(dropped.classList.contains("ww-float-" + side), "external image drop did not follow its " + side + " lane: " + dropped.outerHTML);
        assert(!dropped.style.float && !dropped.style.margin && !dropped.style.getPropertyValue("--ww-float-size"), "external image drop injected inline float spacing: " + dropped.outerHTML);
        dropped.remove();
      }
      source.style.cssText = originalStyle
      editor.features.manipulation.setFloat(source, "none")
      const originalBodyStyle = document.body.getAttribute("style"), mainHidden = main.hidden
      const gapAnchor = document.createElement("p"), gapNext = document.createElement("p")
      gapAnchor.textContent = "Flow anchor"
      gapNext.textContent = "Flow continuation"
      gapAnchor.style.cssText = gapNext.style.cssText = "width:720px;height:80px;margin:0"
      gapNext.style.marginTop = "40px"
      main.hidden = true
      document.body.style.cssText = "--ww-float-width:280px;padding-left:340px;padding-right:340px"
      document.body.append(gapAnchor, gapNext)
      const gapPoint = {clientX:700, clientY:gapAnchor.getBoundingClientRect().bottom + 20}
      assert(!editor.features.manipulation.floatDropTarget(new MouseEvent("mousemove", gapPoint), previewSource),
        "external image flow point overlaps a projected float lane")
      const flowData = new DataTransfer()
      flowData.setData("text/html", imageHTML)
      const flowInit = {dataTransfer:flowData, ...gapPoint, bubbles:true, cancelable:true, composed:true}
      document.body.dispatchEvent(new DragEvent("dragover", flowInit))
      document.body.dispatchEvent(new DragEvent("drop", flowInit))
      const flowImage = document.body.querySelector("picture")
      assert(flowImage && !flowImage.classList.contains("ww-float-left") && !flowImage.classList.contains("ww-float-right"),
        "external image flow drop acquired a float class: " + flowImage?.outerHTML)
      assert(!flowImage?.style.float && !flowImage?.style.margin && !flowImage?.style.getPropertyValue("--ww-float-size"),
        "external image flow drop injected float spacing: " + flowImage?.outerHTML)
      flowImage?.remove()
      gapAnchor.remove(); gapNext.remove(); main.hidden = mainHidden
      if(originalBodyStyle === null) document.body.removeAttribute("style")
      else document.body.setAttribute("style", originalBodyStyle)
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
      parent.postMessage({id:${JSON.stringify(id)}}, "*");
    } catch(error) {parent.postMessage({id:${JSON.stringify(id)}, error:String(error)}, "*")}
    finally {editor?.destroy()}
  <\/script>`
  nativeRootEditor.addAppendix(frame)
  try { assert(await result === null, `native float drag check: ${await result}`) }
  finally { frame.remove() }
  await checkNativeFloatContours(nativeRootEditor, assert, layoutFrame)
}

/** Keep text-wrap and selection-contour geometry independent of prior drag state. */
async function checkNativeFloatContours(nativeRootEditor: HostEditor, assert: Assert, layoutFrame: () => Promise<void>) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;inline-size:1400px;min-inline-size:1400px;max-inline-size:none;height:700px;border:0"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><main style="width:1100px"><p>Ready</p></main></body>`
  nativeRootEditor.addAppendix(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "float contour fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, main = doc.querySelector("main")!
    const picture = doc.createElement("picture"), image = doc.createElement("img"), text = doc.createElement("p")
    picture.style.cssText = "display:block;width:100%;height:120px;background:#eee"
    image.alt = "Empty image placeholder"
    image.style.cssText = "display:block;width:100%;height:100%"
    picture.append(image)
    text.textContent = "A long paragraph wraps beside the empty image placeholder. ".repeat(8)
    text.style.cssText = "line-height:24px"
    main.replaceChildren(picture, text)
    editor.features.manipulation.showFloatDropPreview(text, "right", "transfer", picture)
    const preview = editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")
    assert(preview, "float contour fixture could not measure its right lane")
    const expectedFloatWidth = preview!.getBoundingClientRect().width
    editor.features.manipulation.clearFloatDropPreview("transfer")
    editor.features.manipulation.setFloat(picture, "right")
    await layoutFrame()
    const pictureRect = picture.getBoundingClientRect(), parentRect = main.getBoundingClientRect()
    const range = doc.createRange()
    range.selectNodeContents(text)
    const firstLine = range.getClientRects()[0]
    assert(firstLine && Math.abs(firstLine.top - pictureRect.top) < 8, "first line is offset below the floated picture: " + JSON.stringify({picture:pictureRect.top, text:firstLine?.top, margin:view.getComputedStyle(text).marginTop}))
    assert(expectedFloatWidth > 256 && Math.abs(pictureRect.width - expectedFloatWidth) < 1,
      "picture did not fill its measured float lane: " + JSON.stringify({picture:pictureRect.width, expectedFloatWidth, main:parentRect.toJSON()}))
    assert(picture.classList.contains("ww-float-right") && !picture.style.float && !picture.style.margin && !picture.style.maxWidth
      && picture.style.getPropertyValue("--ww-float-size").includes("100%"), "floated picture did not preserve its authored width through theme geometry")
    assert(firstLine && firstLine.bottom > pictureRect.top && firstLine.top < pictureRect.top + 24 && firstLine.right <= pictureRect.left - 5,
      "paragraph did not wrap beside the floated placeholder: " + JSON.stringify({picture:pictureRect, firstLine, parent:parentRect}))
    const setOverlappingFloat = (side: "left" | "right") => {
      editor.features.manipulation.setFloat(picture, side)
      picture.style.setProperty("margin-left", "5px", "important")
      picture.style.setProperty("margin-right", "5px", "important")
    }
    text.style.setProperty("display", "block", "important")
    setOverlappingFloat("right")
    await layoutFrame()
    text.dispatchEvent(new view.PointerEvent("pointerover", {bubbles:true}))
    const hover = editor.features.selection.hoverCaret!
    assert(hover.getAttribute("part")?.includes("hover-caret-floats") && view.getComputedStyle(hover).outlineStyle === "none", "paragraph hover outline still spans its floated sibling")
    const outline = hover.querySelector('[part="hover-float-outline"]')
    assert(outline?.querySelector("mask path"), "float hover outline did not exclude the image box")
    const hoverPath: number[] = []
    for(let node: Node = text; node !== doc.body; node = node.parentNode!) hoverPath.unshift(Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode))
    editor.features.selection.actions.hoverNode({type:"hoverNode", path:hoverPath})
    assert(view.getComputedStyle(hover).outlineStyle === "none", "breadcrumb hover restored an outline over the float")
    const hoveredHTML = new view.DOMParser().parseFromString(editor.toHTML(true), "text/html").querySelector("main")!.outerHTML
    assert(!main.querySelector("svg") && !hoveredHTML.includes("hover-float-mask"), "float hover outline leaked into authored HTML")
    editor.features.selection.actions.hoverNode({type:"hoverNode", path:null})
    picture.dispatchEvent(new view.PointerEvent("pointerover", {bubbles:true}))
    assert(!hover.querySelector('[part="hover-float-outline"]'), "floated image lost its own ordinary outline")
    const paragraphText = text.textContent!
    for(const side of ["left", "right"] as const) for(const long of [false, true]) {
      setOverlappingFloat(side)
      text.textContent = long ? paragraphText : "Text flows beside the floated image."
      editor.features.selection.selectElement(text)
      text.dispatchEvent(new view.PointerEvent("pointerover", {bubbles:true}))
      await layoutFrame()
      const selected = editor.features.selection.selectionCaret!
      assert(selected.getAttribute("part")?.includes("selection-caret-floats") && view.getComputedStyle(selected).outlineStyle === "none", "selection outline crosses the floated image")
      assert(selected.querySelector('[part~="selection-float-outline"] mask')?.id !== hover.querySelector("mask")?.id, "selection and hover contours share a mask ID")
      const imageBox = picture.getBoundingClientRect()
      const controls = editor.features.transformation.overlay.querySelectorAll(".◆transform-overlay-scale, #◆transform-overlay-mover, #◆transform-overlay-delete")
      for(const control of controls) {
        if((control as HTMLElement).hidden) continue
        const box = control.getBoundingClientRect()
        assert(!(box.left < imageBox.right && box.right > imageBox.left && box.top < imageBox.bottom && box.bottom > imageBox.top),
          "selection handle overlaps the floated image: " + JSON.stringify({control:(control as HTMLElement).id, box:box.toJSON(), imageBox:imageBox.toJSON()}))
      }
      editor.features.selection.captureElement(text)
      assert(selected.querySelectorAll(".◆capture-edge").length === 4, "float contour replaced capture edges")
      assert(view.getComputedStyle(selected.querySelector('[part~="selection-float-outline"]')!).strokeDasharray === "none", "captured contour is still dotted")
    }
    text.textContent = paragraphText
    editor.features.selection.selectElement(text)
    range.selectNodeContents(text)
    for(const side of ["left", "right"] as const) {
      setOverlappingFloat(side)
      const line = range.getClientRects()[0]
      const init = {bubbles:true, cancelable:true, button:0, buttons:1, pointerId:88, clientX:line.left + 10, clientY:line.top + line.height / 2}
      text.dispatchEvent(new view.PointerEvent("pointerover", init))
      text.dispatchEvent(new view.PointerEvent("pointerdown", init))
      doc.body.dispatchEvent(new view.PointerEvent("pointerover", init))
      doc.body.dispatchEvent(new view.PointerEvent("pointermove", {...init, clientX:line.left + 3}))
      await layoutFrame()
      assert(hover.getAttribute("part")?.includes("hover-caret-floats") && view.getComputedStyle(hover).outlineStyle === "none",
        `held ${side} float pointer restored the rectangular hover outline`)
      assert(hover.querySelector('[part~="hover-float-outline"] mask path'), `held ${side} float pointer lost the contour`)
      doc.body.dispatchEvent(new view.PointerEvent("pointerup", {...init, buttons:0}))
    }
    setOverlappingFloat("right")
    editor.features.selection.selectElement(picture)
    assert(!editor.features.selection.selectionCaret!.querySelector('[part~="selection-float-outline"]'), "floated image lost its own full selection outline")
    const preceding = doc.createElement("p")
    preceding.textContent = "Preceding paragraph"
    main.prepend(preceding)
    await layoutFrame()
    assert(Math.abs(range.getClientRects()[0].top - picture.getBoundingClientRect().top) < 8, "text and image did not align after a preceding block")
    preceding.remove()
    const html = new view.DOMParser().parseFromString(editor.toHTML(true), "text/html").querySelector("main")!.outerHTML
    assert(html.includes("ww-float-right") && !html.includes("◆") && !html.includes("ww-column"), "float serialization retained editing artifacts or lost its float class")
    picture.style.removeProperty("margin-left")
    picture.style.removeProperty("margin-right")
    editor.features.manipulation.setFloat(picture, "none")
    assert(!picture.classList.contains("ww-float-left") && !picture.classList.contains("ww-float-right") && !picture.style.margin, "clearing float retained float styling")
    await layoutFrame()
    assert(Math.abs(picture.getBoundingClientRect().width - text.getBoundingClientRect().width) < 1,
      "clearing float did not restore the image to the live prose width: " + JSON.stringify({picture:picture.getBoundingClientRect().toJSON(), text:text.getBoundingClientRect().toJSON()}))
    const first = doc.createElement("p"), second = doc.createElement("p")
    first.textContent = "First paragraph"
    second.textContent = "Second paragraph"
    main.replaceChildren(first, second)
    const spacing = parseFloat(view.getComputedStyle(first).marginBottom)
    assert(spacing > 0 && Math.abs(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom - spacing) < 1, "ordinary paragraphs lost their block spacing")
    assert(view.getComputedStyle(second).marginBottom === "0px", "last paragraph retained an extra trailing gap")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
