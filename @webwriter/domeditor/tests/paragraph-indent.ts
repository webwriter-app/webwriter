import {defaultDocumentTheme} from "../src/document-themes"

/** #318: indentation must preserve the automatic margins of centered prose. */
export async function checkParagraphIndent() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1400px;height:500px;max-width:none"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style></head><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts?proofreading-disabled"></script></body>`
  document.body.append(frame)
  try {
    for(let attempt = 0; !frame.contentWindow?.editor && !frame.contentWindow?.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const view = frame.contentWindow as Window & typeof globalThis, doc = frame.contentDocument!, editor = view.editor!
    assert(editor, `paragraph indent fixture failed: ${view.editorError}`)
    const selection = doc.getSelection()!
    const layout = () => new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    for(const width of [1400, 900, 420]) for(const dir of ["ltr", "rtl"]) for(const nested of [false, true]) {
      frame.style.width = `${width}px`
      doc.documentElement.dir = dir
      const textContent = dir === "rtl"
        ? '<b>نص الفقرة</b> يحتوي على كلمات كافية لتظهر في عدة أسطر في نافذة ضيقة. المزيد من النص يملأ المساحة المتاحة في الفقرة.'
        : '<b>Paragraph text</b> followed by enough words to wrap onto several lines in a narrow window. More paragraph text fills the available width.'
      const content = `<p id="target">${textContent}</p><!--keep--><p id="peer">Unchanged paragraph</p>`
      doc.body.innerHTML = nested ? `<section>${content}</section>` : content
      const paragraph = doc.querySelector<HTMLElement>("#target")!, peer = doc.querySelector<HTMLElement>("#peer")!
      const text = paragraph.querySelector("b")!.firstChild!
      selection.setPosition(text, 0)
      await layout()
      const before = paragraph.getBoundingClientRect(), peerBefore = peer.getBoundingClientRect()
      const range = doc.createRange()
      range.selectNodeContents(text)
      const textBefore = range.getBoundingClientRect()
      const style = view.getComputedStyle(paragraph)
      const fontSize = parseFloat(style.fontSize), initialPadding = parseFloat(style.paddingInlineStart)
      const context = `${width}px ${dir} ${nested ? "section" : "body"}`
      for(const [shiftKey, indent] of [[false, 2], [false, 4], [true, 2], [true, 0]] as const) {
        const event = new view.KeyboardEvent("keydown", {key: "Tab", shiftKey, bubbles: true, cancelable: true})
        doc.dispatchEvent(event)
        assert(event.defaultPrevented, `${context}: Tab was not handled`)
        await layout()
        const box = paragraph.getBoundingClientRect(), peerBox = peer.getBoundingClientRect(), textBox = range.getBoundingClientRect()
        assert(Math.abs(box.left - before.left) < 1 && Math.abs(box.right - before.right) < 1, `${context}: indentation moved the paragraph out of its column`)
        const distance = dir === "ltr" ? textBox.left - textBefore.left : textBefore.right - textBox.right
        const expected = indent ? indent * fontSize - initialPadding : 0
        assert(Math.abs(distance - expected) < 1, `${context}: expected ${expected}px text indentation, got ${distance}px`)
        assert(Math.abs(peerBox.left - peerBefore.left) < 1 && Math.abs(peerBox.width - peerBefore.width) < 1, `${context}: indentation moved the adjacent paragraph`)
        assert(paragraph.scrollWidth <= paragraph.clientWidth + 1, `${context}: indentation overflowed the paragraph`)
        assert(selection.anchorNode === text && selection.anchorOffset === 0, `${context}: indentation lost the caret`)
      }
      assert(!paragraph.style.marginInlineStart && !peer.hasAttribute("style"), `${context}: indentation changed margins or unrelated styles`)
      assert(!editor.toHTML(true).includes("◆"), `${context}: indentation exported editing markers`)
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
