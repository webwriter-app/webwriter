import { EditorFeature } from "."
import { Schema } from "../schema"
import { $, getSelectionAnchorBlock } from "../utility"

export class MarkFeature extends EditorFeature {
  addMark(key: string) {
    const block = new MarkBlock(getSelectionAnchorBlock(this.editor.schema)!, this.editor.schema)
    block.addMark(key)
    block.renderMarks()
  }

  removeMark(key: string) {
    const block = new MarkBlock(getSelectionAnchorBlock(this.editor.schema)!, this.editor.schema)
    block.removeMark(key)
    block.renderMarks()
  }

  toggleMark(key: string) {
    const block = new MarkBlock(getSelectionAnchorBlock(this.editor.schema)!, this.editor.schema)
    block.toggleMark(key)
    block.renderMarks()
  }
}

type Mark = {start: number, end: number, key: string, attributes?: Record<string, string>}


export class MarkBlock {

  #marks: Mark[] = []
  #text: string

  constructor(readonly node: Node, readonly schema: Schema) {
    this.#parseMarks()
  }

  #markEq(a: Mark, b: Mark) {
    return a.key === b.key && JSON.stringify(a.attributes) === JSON.stringify(b.attributes)
  }

  #getPos(node: Node, offset=0): number {
    const walker = document.createTreeWalker(this.node)
    let i = 0
    do {
      const currentNode = walker.currentNode
      if(currentNode instanceof Text) {
        i += currentNode.textContent.length
      }
      else if(currentNode instanceof Element) {
        if(currentNode === node) {
          return i
        }
      }
    } while(walker.nextNode())
    return -1
  }

  get #anchorPos() {
    return $.anchor? this.#getPos($.anchor, $.anchorOffset): null
  }

  get #focusPos() {
    return $.focus? this.#getPos($.focus, $.focusOffset): null
  }

  getMarksInSelection(allowPartial=true): Mark[] {
    if(this.#anchorPos === null || this.#focusPos === null) {
      return []
    }
    return this.findMarksAt(this.#anchorPos, this.#focusPos, allowPartial)
  }

  findMarksAt(start=this.#anchorPos, end=this.#focusPos, allowPartial=true) {
    if(start === null || end === null) {
      return []
    }
    const filter = allowPartial
      ? (m: Mark) => m.start <= start && m.end <= end
      : (m: Mark) => (m.start <= start && start <= m.end) || (m.start <= end && end <= m.end)
    return this.#marks.filter(filter)
  }

  hasMarkAt(key: string, start=this.#anchorPos, end=this.#focusPos) {
    return this.findMarksAt(start, end).some(m => m.key === key)
  }

  addMark(key: string, start=this.#anchorPos, end=this.#focusPos): boolean {
    if(start === null || end === null) {
      return false
    }
    const i = this.#marks.findIndex(m => (m.start <= start && start <= m.end) || (m.start <= end && end <= m.end))
    if(i !== -1) {
      const m = this.#marks[i]
      if(m.start <= start && m.end <= end) {
        return false
      }
      else {
        this.#marks[i] = {
          key,
          start: Math.min(m.start, start),
          end: Math.max(m.end, end)
        }
        return true
      }
    }
    else {
      const insertPos = this.#marks.findIndex(m => m.start > start)
      this.#marks.splice(insertPos, 0, {key, start, end})
      return true
    }
  }

  removeMark(key: string, start=this.#anchorPos, end=this.#focusPos): boolean {
    if(start === null || end === null) {
      return false
    }
    const i = this.#marks.findIndex(m => (m.start <= start && start <= m.end) || (m.start <= end && end <= m.end))
    if(i !== -1) {
      const m = this.#marks[i]
      const left = {...m, start: m.start, end: start - 1}
      const right = {...m, start: end, end: m.end}
      const leftValid = left.start <= left.end
      const rightValid = right.start <= right.end
      let hasChanged = false
      if(!leftValid && !rightValid) {
        this.#marks.splice(i, 1)
        hasChanged = true
      }
      else if(leftValid && !rightValid) {
        this.#marks.splice(i, 1, left)
        hasChanged = true
      }
      else if(!leftValid && rightValid) {
        this.#marks.splice(i, 1, right)
        hasChanged = true
      }
      else if(leftValid && rightValid) {
        this.#marks.splice(i, 1, left, right)
        hasChanged = true
      }
      return this.removeMark(key, start, end) || hasChanged
    }
    else {
      return false
    }
  }

  toggleMark(key: string, start=this.#anchorPos, end=this.#focusPos) {
    return this.hasMarkAt(key, start, end)? this.removeMark(key, start, end): this.addMark(key, start, end)
  }

  #parseMarks() {
    this.#marks = []
    this.#text = this.node.textContent!
    const walker = document.createTreeWalker(this.node)
    let i = 0
    while(walker.nextNode()) {
      const node = walker.currentNode
      if(node instanceof Text) {
        i += node.textContent.length
      }
      else if(node instanceof Element) {
        const mark: Mark = {
          key: node.tagName.toLowerCase(),
          start: i,
          end: i + node.textContent.length
        }
        this.#marks.push(mark)
      }
    }

    // merge identical neighbors or children
    for(let i = 0; i < this.#marks.length; i++) {
      const a = this.#marks.at(i)!
      for(let j = i; j < this.#marks.length; j++) {
        const b = this.#marks.at(j)!
        if(b.start <= a.end + 1 && this.#markEq(a, b)) {
          (this.#marks as any)[i] = {...a, end: b.end};
          (this.#marks as any)[j] = undefined
        }
      }
    }
    this.#marks = this.#marks.filter(m => m)

  }

  #renderMarks(offset=0, marks=structuredClone(this.#marks)) {
    // build and apply snabbdom template
    for(const mark of marks) {
      
    }
  }

  renderMarks() {
    return this.#renderMarks()
  }
}