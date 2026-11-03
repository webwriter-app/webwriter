import type {DOMEditor} from "../src/domeditor"
import {documentThemes} from "../src/document-themes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layout = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

export async function checkMediaCentering(nativeRootEditor: DOMEditor) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1000px;height:700px;border:0;max-width:none"
  const media = '<picture style="width:160px"><img alt="Picture" width="160" height="60"></picture><img alt="Image" style="width:160px;height:60px"><audio controls style="width:240px"></audio><video controls style="width:240px;height:90px"></video><iframe title="Website" style="width:240px;height:90px"></iframe><embed style="width:240px;height:90px"><object style="width:240px;height:90px"></object>'
  const content = `${media}<main>${media}<p>Reading column</p></main><article>${media}<p>Reading column</p></article><section>${media}<p>Reading column</p></section><p>Inline <img id="inline" alt="inline" width="20" height="20"> image</p>`
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  nativeRootEditor.addAppendix(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "media centering fixture did not initialize")
    const doc = frame.contentDocument!, theme = doc.createElement("style")
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
        if(element.localName === "embed" && box.width === 0) {
          assert(mediaStyle.display === "block" && mediaStyle.marginLeft === "auto" && mediaStyle.marginRight === "auto"
            && parseFloat(mediaStyle.width) <= right - left,
          `${context}: empty embed did not receive centered, bounded block styles`)
          continue
        }
        const centerDelta = (box.left + box.right) / 2 - offset - (prose.left + prose.right) / 2
        assert(Math.abs(centerDelta) < 1,
          `${context}: ${element.localName} was not centered in ${parent.localName}: ${JSON.stringify({centerDelta, box:box.toJSON(), parent:parentBox.toJSON(), prose:prose.toJSON(), style:{position:mediaStyle.position,left:mediaStyle.left,width:mediaStyle.width,inlineSize:mediaStyle.inlineSize,marginLeft:mediaStyle.marginLeft,marginRight:mediaStyle.marginRight,transform:mediaStyle.transform}, authoredStyle:element.getAttribute("style")})}`)
        assert(box.left - offset >= left - 1 && box.right - offset <= right + 1,
          `${context}: ${element.localName} overflowed its column: ${JSON.stringify({box:box.toJSON(),left,right,offset})}`)
      }
    }
    for(const bundledTheme of documentThemes) {
      theme.setAttribute("data-ww-theme", bundledTheme.value)
      theme.textContent = bundledTheme.source
      frame.style.width = "1000px"
      await layout()
      centered(doc, `${bundledTheme.value} editing`)
      const saved = document.createElement("iframe")
      saved.style.cssText = frame.style.cssText
      saved.setAttribute("sandbox", "allow-same-origin")
      const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once:true}))
      saved.srcdoc = await view.editor!.serializeHTML()
      nativeRootEditor.addAppendix(saved)
      try {
        await loaded
        for(const width of [1000, 590, 360]) {
          saved.style.width = `${width}px`
          await layout()
          centered(saved.contentDocument!, `${bundledTheme.value} saved ${width}`)
        }
        assert(saved.contentDocument!.querySelector("#inline")!.closest("p"), "export moved inline media out of prose")
        if(bundledTheme.value === "base") assert(saved.contentWindow!.getComputedStyle(saved.contentDocument!.querySelector("#inline")!).display === "inline", "inline prose image was blockified")
      }
      finally { saved.remove() }
    }
  }
  finally {
    viewCleanup(frame)
  }
}

function viewCleanup(frame: HTMLIFrameElement) {
  (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
  frame.remove()
}
