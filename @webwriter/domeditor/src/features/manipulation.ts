import { DocumentListenerMap, EditorFeature } from "."
import { $, modifierKeyDown, getContainer, getSidesOfPoint, htmlToFragment, isElement } from "../utility"
import { SelectionFeature } from "./selection"

/** Unit by which a collapsed selection is extended before deleting. */
type Granularity = "character" | "word" | "line" | "block"

function isCaretAtBoundary(element: Element, boundary: "start" | "end") {
  const selection = document.getSelection()
  if(!selection?.isCollapsed || !selection.anchorNode) {
    return false
  }
  let node: Node | null = selection.anchorNode
  let offset = selection.anchorOffset
  while(node && node !== element) {
    if(!element.contains(node)) {
      return false
    }
    const parent = node.parentNode
    if(!parent) {
      return false
    }
    const index = Array.from(parent.childNodes).indexOf(node)
    if(boundary === "start") {
      if(offset !== 0 || Array.from(parent.childNodes).slice(0, index).some(sibling => sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent)) {
        return false
      }
    }
    else {
      const length = node instanceof Text? node.length: node.childNodes.length
      if(offset !== length || Array.from(parent.childNodes).slice(index + 1).some(sibling => sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent)) {
        return false
      }
    }
    node = parent
    offset = boundary === "start"? index: index + 1
  }
  return node === element && offset === (boundary === "start"? 0: element.childNodes.length)
}

/** Editing feature implementing content manipulation: inserting, deleting,
 * wrapping and lifting nodes, clipboard interaction (copy/cut/paste), and
 * setting attributes or styles on the selected elements. All operations work
 * on the current selection (see `EditingSelection`/`$`). */
export class ManipulationFeature extends EditorFeature {

  /** Runs a command and normalizes both the command's original surroundings
   * and the surroundings of the resulting selection. */
  private withNormalization<T>(command: () => T) {
    const selection = document.getSelection()
    const originalNodes = [selection?.anchorNode, selection?.focusNode]
    try {
      return command()
    }
    finally {
      this.editor.normalizeSurroundingElements(...originalNodes)
    }
  }

  /** Action handlers, addressable by action type through the editor. */
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
      return this.copy()
    },
    cut: ({}: {type: "cut"}) => {
      return this.cut()
    },
    paste: ({}: {type: "paste"}) => {
      return this.paste()
    },
    setAttributes: ({attrs}: {type: "setAttributes", attrs: Record<string, string>}) => {
      this.setAttributes(attrs)
    },
    setStyle: ({styles}: {type: "setStyle", styles: Record<string, string>}) => {
      this.setStyle(styles)
    },

  } as const

  /** Keyboard and input behavior: Enter splits the containing block
   * (Shift: <br>, Shift+Alt: <wbr>, modifier: split two levels), Backspace and
   * Delete remove by granularity (plain: character, Alt: word, modifier:
   * block, Alt+modifier: line), Tab wraps into the previous element and
   * Shift+Tab lifts. */
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
      if(this.editor.features.transformation.target) {
        return
      }
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

  /** Inserts `node` at the selection, replacing the selected content. Without
   * `node`, splits the containing block at the caret (Enter behavior).
   * `splitDepth` is the number of additional ancestor levels to split (0 means
   * one split); <body> and <html> are never split. Splitting continues the
   * container as a clone — with `strict`, inseperable containers (e.g.
   * headings) continue as a new default node (<p>) instead. */
  insert(node?: Node, splitDepth=0, strict=false) {
    return this.withNormalization(() => {
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
    }/*
      else if(node) {
        this.#smartInsert(node)
      }*/)
  }

  /** Deletes content at the selection. A selection in an empty container
   * removes that container (the caret moves to the previous node). A collapsed
   * selection is first extended by `granularity` in `direction` ("block"
   * extends to the container start; the others use `Selection.modify`). A
   * caret in the gap between two elements merges them: backward moves the
   * following element's content into the preceding element, forward the
   * reverse. At the document boundaries, Backspace/Delete move the caret to
   * the end/start of the adjacent block. */
  delete(direction?: "forward" | "backward", granularity:Granularity="character", strict=false) {
    return this.withNormalization(() => {
      if($.isGapSelection && direction === "backward" && !$.elementAfter && $.elementBefore) {
        $.move($.elementBefore, -1)
        return
      }
      if($.isGapSelection && direction === "forward" && !$.elementBefore && $.elementAfter) {
        $.move($.elementAfter)
        return
      }
      const container = $.anchorContainer
      if(direction === "backward" && container?.textContent && isCaretAtBoundary(container, "start") && container.previousElementSibling && !container.previousElementSibling.textContent) {
        container.previousElementSibling.remove()
        return
      }
      if(direction === "forward" && container?.textContent && isCaretAtBoundary(container, "end") && container.nextElementSibling && !container.nextElementSibling.textContent) {
        container.nextElementSibling.remove()
        return
      }
      if(!$.commonAncestor.textContent && !["HTML", "BODY"].includes($.commonAncestor.nodeName)) {
        const emptyContainer = $.commonAncestor
        const previous = emptyContainer.previousSibling
        const next = emptyContainer.nextSibling
        $.delete()
        emptyContainer.remove()
        if(direction === "forward" && next) {
          $.move(next)
        }
        else if(previous) {
          $.move(previous, -1)
        }
        else if(next) {
          $.move(next)
        }
        else {
          $.move(document.body)
        }
        return
      }
      else if($.isEmpty && !$.isGapSelection) {
        granularity === "block"? $.extend($.commonAncestor, 0): $.extendBy(granularity, direction)
        $.delete()
      }
      else {
        $.delete()
      }
      if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "backward") {
        const {elementBefore, elementAfter} = $
        if(!elementBefore.textContent) {
          elementBefore.remove()
          $.selectGap(elementAfter, "before")
        }
        else {
          elementBefore.append(...elementAfter.childNodes)
          $.move(elementBefore.lastChild!)
          elementBefore.normalize()
          elementAfter.remove()
        }
      }
      else if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "forward") {
        const {elementBefore, elementAfter} = $
        if(!elementAfter.textContent) {
          elementAfter.remove()
          $.selectGap(elementBefore)
        }
        else {
          elementAfter.prepend(...elementBefore.childNodes)
          $.move(elementAfter.lastChild!)
          elementAfter.normalize()
          elementBefore.remove()
        }
      }
    })
  }

  /** Wraps the selection. Given a `wrapping` element (or a fragment, whose
   * first element is used), it wraps a copy of the selected content, replaces
   * the selection and is returned. Without an argument (Tab behavior), the
   * anchor's container element is moved into the adjacent element (preferring
   * the previous one), which is returned — or undefined if there is none.
   * No schema validation is performed. */
  wrap(wrapping?: DocumentFragment | Element, strict=false) {
    return this.withNormalization(() => {
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
    })
  }

  /** Lifts the selected element (or the element containing the caret) out of
   * its container, `depth` levels up, splitting the container around it when
   * it has siblings. Schema-validated: does nothing when no valid lift target
   * exists (see Schema.getLiftTarget). */
  lift(depth=1, strict=false) {
    return this.withNormalization(() => {
      const node = $.selectedElement ?? $.anchorContainer
      if(!node) {
        return
      }
      for(let i = 0; i < depth; i++) {
        const target = this.editor.schema.getLiftTarget(node)
        if(!target) {
          return
        }
        const [liftDepth, replacement] = target
        let toReplace = node.parentElement!
        for(let j = 1; j < liftDepth && toReplace.parentElement; j++) {
          toReplace = toReplace.parentElement
        }
        toReplace.replaceWith(...replacement)
      }
      $.selectElement(node)
    })
  }

  /** Writes the selected content to the clipboard as text/html and text/plain.
   * Currently requires the selection to contain an element — plain text
   * selections throw. */
  async copy() {
    const item = this.#fragmentToClipboardItem($.copy())
    navigator.clipboard.write([item])
  }

  /** Like copy(), but also removes the selected content from the document.
   * Currently the content is removed even if writing to the clipboard fails
   * (e.g. for plain text selections). */
  async cut() {
    return this.withNormalization(() => {
      const item = this.#fragmentToClipboardItem($.cut())
      return navigator.clipboard.write([item])
    })
  }

  /** Inserts the clipboard's text/html content at the selection. Currently a
   * clipboard without a text/html flavor inserts the literal string
   * "undefined". */
  async paste() {
    const fragment = await this.#clipboardToFragment()
    this.insert(fragment)
  }

  /** Sets the given attributes on every element in the selection (see
   * `EditingSelection.nodesBetween`); a null value removes the attribute. */
  setAttributes(attrs: Record<string, string | null>) {
    return this.withNormalization(() => {
      $.nodesBetween.filter(isElement).forEach(n => Object.keys(attrs).forEach(k => attrs[k]? n.setAttribute(k, attrs[k]): n.removeAttribute(k)))
    })
  }

  /** Assigns the given inline style properties on every element in the
   * selection, merging with existing styles; an empty string clears a
   * property. */
  setStyle(style: Record<string, string>) {
    return this.withNormalization(() => {
      $.nodesBetween.filter(isElement).forEach(n => Object.assign((n as HTMLElement).style, style))
    })
  }

  /** Replaces the selection's container with `el`, moving the children over
   * and selecting `el`. Refuses to replace <html> or <body>. */
  #replaceParent(el: Element) {
    const parent = getContainer($.commonAncestor)
    if(parent?.tagName === "HTML" || parent?.tagName === "BODY") {
      throw TypeError("Cannot replace <html> or <body>")
    }
    el.append(...Array.from(parent?.childNodes ?? []))
    parent?.replaceWith(el)
    $.selectElement(el)
  }

  /** Converts a fragment into a ClipboardItem with a text/html (outer HTML) and a text/plain (inner text) flavor. Expects the fragment to contain an element. */
  #fragmentToClipboardItem(fragment: DocumentFragment) {
    return new ClipboardItem({
      "text/plain": fragment.textContent,
      "text/html": fragment.firstElementChild? fragment.firstElementChild!.outerHTML: fragment.textContent
    })
  }

  /** Reads the first clipboard item with a text/html flavor and parses it into  a fragment. */
  async #clipboardToFragment() {
    const htmlItem = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    let html = await (await htmlItem?.getType("text/html"))?.text()
    if(!html) {
      const textItem = (await navigator.clipboard.read()).find(item => item.types.includes("text/plain"))
      html = await (await textItem?.getType("text/plain"))?.text()
    }
    return document.createRange().createContextualFragment(html!)
  }

  /** Schema-aware insertion (currently unused by insert()): depending on what the schema allows, replaces the parent, splits the container, inserts in place or wraps the insertee. */
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
