import { DocumentListenerMap, EditorFeature } from "."
import { $, modifierKeyDown, getContainer, getSidesOfPoint, htmlToFragment, isElement } from "../utility"
import { SelectionFeature } from "./selection"

export class ManipulationFeature extends EditorFeature {

  actions = {
    insert: ({html, conformant}: {type: "insert", html: string, conformant?: boolean}) => {
      const frag = htmlToFragment(html)
      this.insert(frag, conformant)
    },
    delete: ({direction}: {type: "delete", direction?: "forward" | "backward"}) => {
      this.delete(direction)
    },
    split: ({insertee}: {type: "split", insertee?: string}) => {
      this.split(insertee? htmlToFragment(insertee): undefined)
    },
    join: ({direction}: {type: "split", direction?: "forward" | "backward"}) => {
      this.join(direction)
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
        $.selectRange(node, 0)
      }
    },
    "keydown": ev => {
      if(ev.key === "Enter" && modifierKeyDown(ev)) {
        // split parent
      }
      else if(ev.key === "Enter") {
        // lift empty
        // split
        ev.preventDefault()
        if($.isGapSelection) {
          const p = document.createElement("p")
          this.insert(p)
          $.selectRange(p, 0)
        }
        else {
          this.split()
        }
      }
      else if(ev.key === "Backspace" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "Backspace") {
        if(!$.isEmpty && $.isCrossNodeSelection) {
          ev.preventDefault()
          this.join()
        }
        else if($.selectedElement === document.body) {
          const p = document.createElement("p")
          document.body.replaceChildren(p)
          $.selectRange(p, 0)
        }
        else if(!$.isEmpty) {
          ev.preventDefault()
          $.delete()
        }
        if($.anchorOffset === 0) {
          ev.preventDefault()
          this.join("backward")
        }
        else {
          // this.editor.deleteBackward()
        }
      }
      else if(ev.key === "Delete" && modifierKeyDown(ev)) {
        this
      }
      else if(ev.key === "Delete") {
        if($.isElementSelection) {
          $.selectedElement!.remove()
          ev.preventDefault()
        }
      }
      else if(ev.key === "a" && modifierKeyDown(ev)) {

      }
    }
  }

  insert(node: Node, conformant=false) {
    $.delete()
    if(conformant) {
      this.#smartInsert(node)
    }
    else {
      $.range.insertNode(node)
    }
  }

  delete(direction?: "forward" | "backward", strict=false) {
    $.delete()
    if(direction === "forward") {

    }
    else {
      $.delete()
      const container = $.commonAncestor
      if($.startOffset && container instanceof Text) {
        const i = $.startOffset
        const t = container.textContent
        container.textContent = `${t.slice(0, i-1)}${t.slice(i)}`
        $.move(container, i-1)
        return 
      }
      else {
        const prev = container.previousSibling
        if(!prev || prev.nodeName === "BODY" || prev.nodeName === "HEAD" || prev.nodeName === "HTML") {
          return
        }
        $.range.setStartBefore(prev)
        prev.remove()
      }
    }
  }
  split(insertee?: Node) {
    $.delete()
    const node = $.commonAncestor
    const container = getContainer(node)
    if(container === document.body || container === document.documentElement) {
      return
    }
    node instanceof Text && node.splitText($.startOffset)
    const [_, rightNodes] = getSidesOfPoint($.range)
    const schema = this.editor.schema.get(container)
    const newNode = schema.inseperable? this.editor.schema.create() as HTMLElement: container.cloneNode() as Element
    newNode.append(...rightNodes)
    container.after(newNode)
    insertee && container.after(insertee)
    $.move(insertee ?? newNode, 0)
    newNode.normalize()
  }

  join(direction?: "forward" | "backward") {
    return direction === "forward"? this.#joinForward(): this.#joinBackward()
    const start = $.start
    const startOffset = $.startOffset
    const startContainer = getContainer($.start!)
    const endContainer = getContainer($.end!)
    $.delete()
    startContainer.append(...Array.from(endContainer.childNodes))
    endContainer.remove()
    startContainer.normalize()
    $.move(start!, startOffset)
  }

  wrap(wrapping: DocumentFragment | Element) {
    const wrapper = wrapping instanceof DocumentFragment? wrapping.firstElementChild!: wrapping
    wrapper.append($.slice)
    $.replace(wrapper)
    return wrapper
  }

  lift(depth=1) {
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

  #joinBackward() {
    const container = getContainer($.start!)
    if(!container.previousElementSibling || container.previousElementSibling === document.head) {
      return
    }
    const prevContainer = getContainer(container.previousElementSibling)
    const childNodes = Array.from(container.childNodes)
    prevContainer.append(...childNodes)
    container.remove()
    $.range.setStartBefore(childNodes[0])
    $.range.setEndBefore(childNodes[0])
    prevContainer.normalize()
  }

  #joinForward() {
    $.delete()
    const node = $.commonAncestor
    const parent = node.parentElement?.tagName === "BODY"? node: node.parentElement!
    const nextNode = parent.nextSibling
    if(!nextNode) {return}
    const childNodes = Array.from(parent.childNodes);
    (nextNode as Element).prepend(...childNodes);
    (parent as Element).remove()
    $.range.setStartBefore(childNodes[0])
  }

  #replaceParent(el: Element) {
    const parent = $.start?.parentElement
    if(parent?.tagName === "HTML" || parent?.tagName === "BODY") {
      throw TypeError("Cannot replace <html> or <body>")
    }
    el.append(...Array.from(parent?.childNodes ?? []))
    parent?.replaceWith(el)
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

    if($.isEmpty) {
      if(!isVoid && isValidContainer) {
        this.#replaceParent(node as Element)
      }
      else if(!isValidInPlace && !isValidContainer && isValidSplitter) {
        this.split(insertee)
      }
      else if(isValidInPlace) {
        this.insert(node) 
      }
    }
    else {
      if(isVoid && isValidInPlace) {
        this.insert(node)
      }
      else if(isVoid && !isValidInPlace && isValidSplitter) {
        this.split(insertee)
      }
      else if(!isValidInPlace && isValidSplitter) {
        this.split(insertee)
      }
      else if(isValidInPlace) {
        const wrapped = this.wrap(insertee)
        this.editor.schema.fixInvalidContent(wrapped)
      }
    }
  }
}