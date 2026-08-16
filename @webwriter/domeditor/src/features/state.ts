import {EditorFeature} from "."

const maximumAIHTMLLength = 1_000_000
const dangerousElements = "script, iframe, object, embed, base, meta[http-equiv='refresh'], link[rel='import']"
const urlAttributes = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"])

const safeURL = (value: string) => {
  const normalized = value.trim().toLowerCase().replaceAll(/[\u0000-\u0020]+/g, "")
  return !normalized.startsWith("javascript:")
    && !normalized.startsWith("vbscript:")
    && !normalized.startsWith("data:text/html")
    && !normalized.startsWith("data:image/svg+xml")
}

/** Removes active content from model-authored HTML before it enters the live
 * document. Existing document code remains untouched unless the user approves
 * a full replacement, whose replacement body is sanitized here as well. */
const sanitizeAIContent = (root: ParentNode) => {
  let removed = 0
  root.querySelectorAll(dangerousElements).forEach(element => {
    element.remove()
    removed++
  })
  root.querySelectorAll<HTMLElement>("*").forEach(element => {
    for(const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const editorClass = name === "class"
        ? attribute.value.split(/\s+/).filter(className => !className.startsWith("◆"))
        : null
      if(name.startsWith("on")
        || name === "srcdoc"
        || name === "contenteditable"
        || name === "spellcheck"
        || name === "data-webwriter-editor-only"
        || urlAttributes.has(name) && !safeURL(attribute.value)
        || name === "style" && /(?:expression\s*\(|javascript\s*:|data\s*:\s*text\/html)/i.test(attribute.value)) {
        element.removeAttribute(attribute.name)
        removed++
      }
      else if(editorClass) {
        if(editorClass.length) element.setAttribute("class", editorClass.join(" "))
        else element.removeAttribute("class")
      }
    }
    if(element instanceof HTMLTemplateElement) removed += sanitizeAIContent(element.content)
  })
  return removed
}

const checkedAIHTML = (html: unknown) => {
  if(typeof html !== "string") throw new TypeError("The replacement HTML must be a string")
  if(html.length > maximumAIHTMLLength) throw new RangeError("The proposed HTML is too large to apply safely")
  return html
}

const serializeFragment = (fragment: DocumentFragment) => {
  const container = document.createElement("div")
  container.append(fragment)
  return container.innerHTML
}

/** Realm-independent state transfer used when package changes reload the
 * iframe and, with it, the custom-element registry. */
export class StateFeature extends EditorFeature {
  actions = {
    snapshotState: ({}: {type: "snapshotState"}) => this.editor.doc.snapshot(),
    serializeDocument: ({offline = false}: {type: "serializeDocument", offline?: boolean}) =>
      this.editor.serializeHTML(offline),
    readAIDocument: ({}: {type: "readAIDocument"}) => {
      const html = this.editor.toHTML(true)
      const maximumLength = 200_000
      return {
        html: html.slice(0, maximumLength),
        text: document.body.innerText.slice(0, maximumLength),
        truncated: html.length > maximumLength,
      }
    },
    readAISelection: ({}: {type: "readAISelection"}) => {
      const selection = document.getSelection()
      if(!selection?.rangeCount || !selection.anchorNode || !document.body.contains(selection.anchorNode)) {
        return {html: "", text: "", collapsed: true}
      }
      const range = selection.getRangeAt(0)
      const fragment = range.cloneContents()
      sanitizeAIContent(fragment)
      const html = serializeFragment(fragment)
      return {
        html: html.slice(0, 100_000),
        text: range.toString().slice(0, 100_000),
        collapsed: range.collapsed,
        truncated: html.length > 100_000,
      }
    },
    replaceAIDocument: ({html}: {type: "replaceAIDocument", html: string}) => {
      const parsed = new DOMParser().parseFromString(checkedAIHTML(html), "text/html")
      const removed = sanitizeAIContent(parsed.body)
      const nodes = Array.from(parsed.body.childNodes, node => document.importNode(node, true))
      document.body.replaceChildren(...nodes)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(document.body)
      range.collapse(false)
      selection?.addRange(range)
      return {status: "applied", scope: "document", removedUnsafeItems: removed}
    },
    replaceAISelection: ({html}: {type: "replaceAISelection", html: string}) => {
      const selection = document.getSelection()
      if(!selection?.rangeCount || !selection.anchorNode || !document.body.contains(selection.anchorNode)) {
        throw new Error("There is no document selection to replace")
      }
      const template = document.createElement("template")
      template.innerHTML = checkedAIHTML(html)
      const removed = sanitizeAIContent(template.content)
      const range = selection.getRangeAt(0)
      const fragment = template.content
      const last = fragment.lastChild
      range.deleteContents()
      range.insertNode(fragment)
      selection.removeAllRanges()
      const caret = document.createRange()
      if(last?.parentNode) caret.setStartAfter(last)
      else caret.setStart(range.startContainer, Math.min(range.startOffset, range.startContainer.childNodes.length))
      caret.collapse(true)
      selection.addRange(caret)
      return {status: "applied", scope: "selection", removedUnsafeItems: removed}
    },
  } as const
}
