import { DocumentListenerMap, EditorFeature } from "."
import { $, modifierKeyDown, getContainer, getSidesOfPoint, htmlToFragment, isElement } from "../utility"
import { SelectionFeature } from "./selection"

type Granularity = "character" | "word" | "line" | "block"

export class ManipulationFeature extends EditorFeature {

  actions = {
    insert: ({html, strict}: {type: "insert", html: string, strict?: boolean}) => {
      const frag = htmlToFragment(html)
      this.insert(frag, 0, strict)
    },
    delete: ({direction}: {type: "delete", direction?: "forward" | "backward"}) => {
      this.delete(direction)
    },
    wrap: ({wrapper}: {type: "wrap", wrapper: string}) => {
      this.wrap(htmlToFragment(wrapper))
    },
    lift: ({}: {type: "lift"}) => {
      this.lift()
    },
    copy: ({}: {type: "copy"}) => {
      this.copy()
    },
    cut: ({}: {type: "cut"}) => {
      this.cut()
    },
    paste: ({}: {type: "paste"}) => {
      this.paste()
    },
    setAttributes: ({attrs}: {type: "setAttributes", attrs: Record<string, string>}) => {
      this.setAttributes(attrs)
    },
    setStyle: ({styles}: {type: "setStyle", styles: Record<string, string>}) => {
      this.setStyle(styles)
    },

  } as const

  activeListeners: DocumentListenerMap = {
    "beforeinput": ev => {
      if($.isGapSelection && SelectionFeature.gapAnchor) {
        const node = SelectionFeature.gapAnchor.cloneNode()
        this.insert(node)
        $.move(node)
      }
      else if($.commonAncestor.nodeName === "BODY" && $.isEmptyDocumentSelection) {
        const el = this.editor.schema.create()
        document.body.prepend(el)
        $.move(el)
      }
    },
    "keydown": ev => {
      if(ev.key === "Enter") {
        ev.preventDefault()
        if($.isGapSelection && SelectionFeature.gapAnchor) {
          const el = this.editor.schema.create()
          document.body.prepend(el)
          $.move(el)
        }
        else if(ev.shiftKey && ev.altKey) {
          this.insert(document.createElement("wbr"))
        }
        else if(ev.shiftKey) {
          this.insert(document.createElement("br"))
        }
        else if(modifierKeyDown(ev)) {
          this.insert(undefined, 1)
        }
        else {
          this.insert(undefined, 0)
        }
      }

      else if(ev.key === "Backspace") {
        ev.preventDefault()
        if(ev.altKey && modifierKeyDown(ev)) {
          this.delete("backward", "line")
        }
        else if(ev.altKey) {
          this.delete("backward", "word")
        }
        else if(modifierKeyDown(ev)) {
          this.delete("backward", "block")
        }
        else {
          this.delete("backward", "character")
        }
      }

      else if(ev.key === "Delete") {
        ev.preventDefault()
        if(ev.altKey && modifierKeyDown(ev)) {
          this.delete("forward", "line")
        }
        else if(ev.altKey) {
          this.delete("forward", "word")
        }
        else if(modifierKeyDown(ev)) {
          this.delete("forward", "block")
        }
        else {
          this.delete("forward", "character")
        }
      }

      else if(ev.key === "Tab") {
        ev.preventDefault()
        if(ev.shiftKey) {
          this.lift(1)
        }
        else {
          this.wrap()
        }
      }
    }
  }

  insert(node?: Node, splitDepth=0, strict=false) {
    if(true) {
      node? $.replace(node): $.delete()
      let locus = $.commonAncestor
      for(let i = 0; i <= splitDepth; i++) {
        $.isTextSelection && ($.start! as Text).splitText($.startOffset)
        let container = getContainer(locus)
        if(container.nodeName === "BODY" || container.nodeName === "HTML") {continue}
        const [,right] = getSidesOfPoint($.range)
        const schema = this.editor.schema.get(container)
        const next = (strict && schema.inseperable? this.editor.schema.create(): container.cloneNode()) as Element
        container.after(next)
        next.append(...right)
        node? $.move(node, -1): $.move(next, 0)
      }
      return
    }
    else if(node) {
      this.#smartInsert(node)
    }
  }

  delete(direction?: "forward" | "backward", granularity:Granularity="character", strict=false) {
    if(!$.commonAncestor.textContent && !["HTML", "BODY"].includes($.commonAncestor.nodeName)) {
      $.delete()
      const prev = $.commonAncestor.previousSibling as Node
      ($.commonAncestor as Element | Text).remove()
      prev && $.move(prev, -1)
      return
    }
    else if($.isEmpty && !$.isGapSelection) {
      granularity === "block"? $.extend($.commonAncestor, 0): $.extendBy(granularity, direction)
      $.delete()
    } 
    $.delete()
    if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "backward") {
      const {elementBefore, elementAfter} = $
      elementBefore.append(...elementAfter.childNodes)
      $.move(elementBefore.lastChild!)
      elementBefore.normalize()
      elementAfter.remove()
    }
    else if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "forward") {
      const {elementBefore, elementAfter} = $
      elementAfter.prepend(...elementBefore.childNodes)
      $.move(elementAfter.lastChild!)
      elementAfter.normalize()
      elementBefore.remove()
    }
  }

  wrap(wrapping?: DocumentFragment | Element, strict=false) {
    if(wrapping) {
      const wrapper = wrapping instanceof DocumentFragment? wrapping.firstElementChild!: wrapping
      wrapper.append($.slice)
      $.replace(wrapper)
      return wrapper
    }
    else {
      const wrapper = $.elementBefore ?? $.elementAfter
      if(!wrapper) {
        return
      }
      wrapper.append($.anchorContainer)
      return wrapper
    }
  }

  lift(depth=1, strict=false) {
    let parent: HTMLElement = $.commonAncestor as HTMLElement
    const fragment = $.cut()
    for(let i = 0; i < depth; i++) {
      if(parent.parentElement) {
        parent = parent.parentElement
      }
    }
    parent
  }

  async copy() {
    const item = this.#fragmentToClipboardItem($.copy())
    navigator.clipboard.write([item])
  }

  async cut() {
    const item = this.#fragmentToClipboardItem($.cut())
    navigator.clipboard.write([item])
  }

  async paste() {
    const fragment = await this.#clipboardToFragment()
    this.insert(fragment)
  }

  setAttributes(attrs: Record<string, string | null>) {
    $.nodesBetween.filter(isElement).forEach(n => Object.keys(attrs).forEach(k => attrs[k]? n.setAttribute(k, attrs[k]): n.removeAttribute(k)))
  }

  setStyle(style: Record<string, string>) {
    $.nodesBetween.filter(isElement).forEach(n => Object.assign((n as HTMLElement).style, style))
  }

  #replaceParent(el: Element) {
    const parent = getContainer($.commonAncestor)
    if(parent?.tagName === "HTML" || parent?.tagName === "BODY") {
      throw TypeError("Cannot replace <html> or <body>")
    }
    el.append(...Array.from(parent?.childNodes ?? []))
    parent?.replaceWith(el)
    $.selectElement(el)
  }

  #fragmentToClipboardItem(fragment: DocumentFragment) {
    return new ClipboardItem({
      "text/plain": (fragment.firstElementChild as HTMLElement).innerText,
      "text/html": fragment.firstElementChild!.outerHTML
    })
  }

  async #clipboardToFragment() {
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    return document.createRange().createContextualFragment(html!)
  }

  #smartInsert(node: Node) {
    console.log("smartInsert")
    const container = $.commonAncestor instanceof Element? $.commonAncestor: $.commonAncestor.parentElement
    const siblings = Array.from(container?.childNodes ?? [])
    const insertee = node instanceof DocumentFragment
      ? node.firstElementChild
      : node as Element
    if(!insertee) {
      throw TypeError("Invalid fragment: Must have a root element")
    }
    if(!container) {
      throw Error("Invalid selection")
    }
    const inserteeType = this.editor.schema.get(insertee)
    const index = 0
    
    const isVoid = !inserteeType.content
    const isValidContainer = this.editor.schema.canWrap(insertee, siblings) && this.editor.schema.canReplace(container, insertee)
    const isValidInPlace = this.editor.schema.canInsert(container, insertee, index, index + 1)
    const isValidSplitter = this.editor.schema.canSplit(container, insertee)
    console.log(isVoid, isValidContainer, isValidInPlace, isValidSplitter)
    if($.isEmpty) {
      if(!isVoid && isValidContainer) {
        this.#replaceParent(insertee)
      }
      else if(!isValidInPlace && !isValidContainer && isValidSplitter) {
        this.insert(insertee, 1)
      }
      else if(isValidInPlace) {
        this.insert(node) 
      }
    }
    else {
      if(isVoid && isValidInPlace) {
        this.insert(node)
      }
      else if(!isValidInPlace && isValidSplitter) {
        this.insert(insertee, 1)
      }
      else if(isValidInPlace) {
        const wrapped = this.wrap(insertee)
        this.editor.schema.fixInvalidContent(wrapped!)
      }
    }
  }
}