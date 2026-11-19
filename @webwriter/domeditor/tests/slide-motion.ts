import {slidesStyles} from "../src/document-layout"
import type {DOMEditor} from "../src/domeditor"

/** Native fragments stay immediate; only the destination has a brief arrival. */
export async function checkSlideMotion() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const slides = Array.from({length: 10}, (_, index) => `<section class="ww-slide" id="motion-${index}" tabindex="-1"><h1 style="left:80px;top:80px">Slide ${index + 1}</h1></section>`).join("")
  const links = Array.from({length: 10}, (_, index) => `<a href="#motion-${index}">${index + 1}</a>`).join("")
  for(const editing of [false, true]) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:700px;max-width:none;border:0"
    const content = `<!doctype html><style>${slidesStyles}</style><body class="ww-slides"><div class="ww-slides-viewport">${slides}</div><nav class="ww-slides-navigation" contenteditable="false">${links}</nav>${editing ? '<script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script>' : ""}</body>`
    const url = editing ? null : URL.createObjectURL(new Blob([content], {type: "text/html"}))
    if(url) { frame.sandbox.add("allow-same-origin"); frame.src = url }
    else frame.srcdoc = content
    const loaded = new Promise(resolve => frame.addEventListener("load", resolve, {once: true}))
    document.body.append(frame)
    let editor: DOMEditor | undefined
    try {
      await loaded
      const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
      if(editing) {
        for(let attempt = 0; !view.editor && attempt < 100; attempt++) await nextFrame()
        assert(view.editor && !view.editorError, `slide editor failed to initialize: ${view.editorError}`)
        editor = view.editor
      }
      await nextFrame(); await nextFrame()
      const doc = frame.contentDocument!, viewport = doc.querySelector<HTMLElement>(".ww-slides-viewport")!
      const navigation = doc.querySelector<HTMLElement>(".ww-slides-navigation")!
      assert(view.getComputedStyle(viewport).scrollBehavior === "auto", "slide changes still use distance-dependent smooth scrolling")
      const source = editor?.toHTML(true)
      const visit = async (index: number, disabled: boolean) => {
        navigation.querySelectorAll<HTMLAnchorElement>(":scope > a")[index].click()
        await nextFrame()
        const target = doc.getElementById(`motion-${index}`)!
        assert(frame.contentDocument === doc && doc.querySelector(":target") === target, "native slide fragment lost its destination")
        const box = viewport.getBoundingClientRect(), arrived = target.getBoundingClientRect()
        assert(Math.abs((arrived.left + arrived.right - box.left - box.right) / 2) < 1, "distant slide did not arrive immediately")
        const arrivedScroll = viewport.scrollLeft
        const animations = target.getAnimations().filter(animation => (animation as CSSAnimation).animationName === "ww-slide-arrive")
        const reduced = view.matchMedia("(prefers-reduced-motion: reduce)").matches
        assert(disabled || reduced ? animations.length === 0 : animations.length === 1, "arrival ignored the motion preference")
        assert(animations.every(animation => Number(animation.effect?.getTiming().duration) <= 150), "slide arrival is too slow")
        await Promise.allSettled(animations.map(animation => animation.finished))
        await nextFrame()
        const settled = target.getBoundingClientRect()
        assert(Math.abs((settled.left + settled.right - box.left - box.right) / 2) < 1, "arrival left the slide off-center")
        assert(Math.abs(viewport.scrollLeft - arrivedScroll) < 1, "arrival moved the slide's snap position")
        if(editor) assert(editor.features.slides.containingSlide(doc.getSelection()?.anchorNode ?? null) === target, "navigation lost the destination caret")
      }
      await visit(9, false)
      await visit(1, false)
      // A second native fragment replaces an arrival still in progress.
      navigation.querySelectorAll<HTMLAnchorElement>(":scope > a")[6].click()
      await visit(8, false)
      const motion = new view.CSSStyleSheet()
      motion.replaceSync(":root { --ww-ui-transition: none; --ww-ui-animation: none; }")
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, motion]
      await visit(0, true)
      await visit(9, true)
      if(editor) {
        const originalStyle = navigation.getAttribute("style")
        navigation.style.width = "100px"
        await nextFrame(); await nextFrame()
        const calls: ScrollToOptions[] = []
        const scroll = navigation.scrollBy
        navigation.scrollBy = ((options: ScrollToOptions) => { calls.push(options) }) as typeof scroll
        editor.appendix.querySelector<HTMLButtonElement>('[part=slide-navigation-actions] [name="scroll-forward"]')!.click()
        assert(calls.length === 1 && calls[0].behavior === "instant", "tab scrolling ignored inherited disabled motion")
        navigation.scrollBy = scroll
        if(originalStyle === null) navigation.removeAttribute("style")
        else navigation.setAttribute("style", originalStyle)
      }
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(sheet => sheet !== motion)
      await visit(4, false)
      if(editor) assert(editor.toHTML(true) === source, "slide motion changed the authored document")
    }
    finally { editor?.destroy(); frame.remove(); if(url) URL.revokeObjectURL(url) }
  }
}
