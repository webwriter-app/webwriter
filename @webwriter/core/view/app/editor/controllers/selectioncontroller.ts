import { EditorController } from "."
import { EditorView } from "prosemirror-view"
import { EditorState, NodeSelection, TextSelection, AllSelection, Selection } from "prosemirror-state"
import { Node, DOMSerializer } from "prosemirror-model"
import { GapCursor } from "prosemirror-gapcursor"
import { CellSelection } from "@massifrg/prosemirror-tables-sections"
import { findParentNode } from "prosemirror-utils"

export class SelectionController extends EditorController {

  get selection() {
    return this.host.state?.selection
  }

  get isTextSelected() {
    return this.selection instanceof TextSelection || this.selection instanceof AllSelection
  }

  get isNodeSelected() {
    return this.selection instanceof NodeSelection
  }

  get isWidgetSelected() {
    return this.selection instanceof NodeSelection && this.selection.node.type.spec["widget"]
  }

  get isAllSelected() {
    return this.selection instanceof AllSelection
  }

  get isGapSelected() {
    return this.selection instanceof GapCursor
  }

  get selectionY() {
    return this.host.pmEditor.coordsAtPos(this.host.state.selection.anchor).top
  }

  get topLevelElementsInSelection() {
    if(this.selection instanceof NodeSelection) {
      return [this.activeElement!]
    }
    const result = [] as HTMLElement[]
    this.selection.content().content.descendants((node, pos) => {
      const el = this.host.pmEditor.nodeDOM(pos) as HTMLElement
      result.push(el)
      return false
    })
    return result
  }

  handleEditorFocus = () => {
    this.host.editingStatus = undefined
  }

  handleSelectionChange = () => {
    this.host.toolbox && this.host.toolbox.activeLayoutCommand?.id !== "_comment" && (this.host.toolbox.activeLayoutCommand = undefined)
    this.host.toolbox && (this.host.toolbox.childrenDropdownActiveElement = null)
    this.host.toolbox && (this.host.toolbox.activeEmojiInput = false)
    this.host.palette && (this.host.palette.managing = false)
    this.host.editingStatus = undefined
  }

  handleDoubleClick = (view: EditorView, pos: number, e: MouseEvent) => {
    if(this.selection instanceof GapCursor) {
      e.preventDefault()
    }
  }

  handleTripleClick = (view: EditorView, pos: number, e: MouseEvent) => {
    e.preventDefault()
    return true
  }

  get firstEditorElement() {
    return this.host.pmEditor.body.firstElementChild
  }

  get lastEditorElement() {
    return Array.from(this.host.pmEditor.body.children).filter(el => !el.matches(".ProseMirror-widget")).at(-1)
  } 

  coordsToSelection(top: number, left: number): Selection | null {
    // If in margin between nodes, make a GapCursor
    // Else if at edge of inline node, cycle inside/outside of node
    // Else use default behavior
    if(!this.host.state.doc.content.size) {
      return new AllSelection(this.host.state.doc)
    }
    const {pos, inside} = this.host.pmEditor?.posAtCoords({top, left}) ?? {}
    if(pos === undefined) {
      return null
    }
    const $pos = this.host.state.doc.resolve(pos)
    const nodeBefore = $pos.nodeBefore? this.host.pmEditor.nodeDOM(pos - $pos.nodeBefore.nodeSize): null
    const nodeAfter = this.host.pmEditor.nodeDOM(pos)
    const parent = $pos.node()
    const beforeNotElement = !(nodeBefore instanceof this.host.pmEditor.window.Element) && nodeBefore !== null
    const afterNotElement = !(nodeAfter instanceof this.host.pmEditor.window.Element) && nodeAfter !== null
    const betweenEmpty = (!nodeBefore || nodeBefore?.nodeName === "P" && !nodeBefore.textContent) && (!nodeAfter || nodeAfter?.nodeName === "P" && !nodeAfter.textContent)
    if(parent.isTextblock || beforeNotElement || afterNotElement || betweenEmpty) {
      return parent.isTextblock? TextSelection.near($pos): null
    }
    const beforeBottom = nodeBefore? nodeBefore.getBoundingClientRect().bottom: 0
    const afterTop = nodeAfter? nodeAfter.getBoundingClientRect().top: Infinity
    const {top: lastTop} = this.host.pmEditor.coordsAtPos(this.host.state.doc.nodeSize - 2)
    if(top > lastTop) {
      return new GapCursor(this.host.state.doc.resolve(this.host.state.doc.nodeSize - 2))
    }
    else if(beforeBottom < top && top < afterTop) {
      return new GapCursor($pos)
    }
    else {
      return TextSelection.near($pos)
    }
  }

  nextSelection(backwards=false): Selection | null {
    const $pos = backwards? this.host.state.selection.$from: this.host.state.selection.$to
    if($pos.parentOffset === (backwards? 0: $pos.node().nodeSize - 2) && !(this.host.state.selection instanceof GapCursor)) {
      const $nextPos = this.host.state.doc.resolve(backwards? Math.max($pos.pos - 1, 0): Math.min($pos.pos + 1, this.host.state.doc.nodeSize - 2))
      return new GapCursor($nextPos)
    }
    else {
      return null
    }
  }

  	get activeElement(): HTMLElement | null {
			const {selection} = this
      if(!this.host.pmEditor || this.host.pmEditor.isDestroyed) {
        return null
      }
      if(selection instanceof GapCursor) {
        return this.host.pmEditor?.body?.querySelector(".ProseMirror-gapcursor") ?? null
      }
      else if(selection instanceof AllSelection) {
        return this.host.pmEditor.body
      }
      else if(selection instanceof CellSelection) {
        return this.host.pmEditor.domAtPos(selection.$anchorCell.pos, 0)?.node as HTMLElement
      }
			else if(selection instanceof TextSelection) {
        const node = this.host.pmEditor.domAtPos(this.selection.anchor, 0)?.node
        return node?.nodeType === window.Node.TEXT_NODE? node.parentElement: node as HTMLElement

			}
			else if(selection instanceof NodeSelection) {
				const node = this.host.pmEditor?.nodeDOM(selection.anchor)
				return node as HTMLElement
			}
			else {
				return null
			}
	}

	get activeNode(): Node | null {
		return this.getActiveNodeInState(this.host.state)
	}

	getActiveNodeInState(state: EditorState): Node | null {
		if(state && state.selection instanceof TextSelection) {
			return state.selection.$anchor.node()
		}
		else if(state && state.selection instanceof NodeSelection) {
			return state.selection.node
		}
		else {
			return null
		}
	}

	get hasNonEmptySelection() {
		const selectionContent = (this.host.pmEditor?.state?.selection.content().content.toJSON() ?? []) as any[]
		const textSelection = this.selection instanceof TextSelection
		const empty = this?.host.pmEditor?.state?.selection.empty
		const textOnly = selectionContent.every(entry => entry.type === "paragraph")
		return !empty
	}

  gapDragSelectionAnchor?: number

  get selectionAsHTML() {
    const fragment = this.selection.content().content
    const serializer = DOMSerializer.fromSchema(this.host.state.schema)
    const dom = serializer.serializeFragment(fragment, {document: this.host.pmEditor.document}) as DocumentFragment
    return Array.from(dom.children).map(child => child.outerHTML).join("\n")
  }

  selectElementInEditor(el: HTMLElement) {
    let selection
    if(el.tagName === "BODY" || el.tagName === "HTML") {
      selection = new AllSelection(this.host.pmEditor.state.doc)
    }
    else {
      const pos = Math.max(this.host.pmEditor.posAtDOM(el, 0) - (el.tagName.includes("-") && !el.children.length? 0: 1), 0)
      selection = NodeSelection.create(this.host.pmEditor.state.doc, pos)
    }
    this.host.pmEditor.dispatch(this.host.pmEditor.state.tr.setSelection(selection))
    this.host.pmEditor.focus()
    el.focus()
  }

  editorEvents = {
    "keydown": (_: any, ev: KeyboardEvent) => {
      this.host.dispatchEvent(new KeyboardEvent(ev.type, ev))
      if (ev.key === "Escape") {
        this.pmEditor.document.exitFullscreen()
      }
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key) && !ev.shiftKey && !this.activeElement?.closest("table")) {
        const sel = this.nextSelection(["ArrowLeft", "ArrowUp"].includes(ev.key))
        if (sel && !sel.eq(this.state.selection)) {
          const tr = this.state.tr.setSelection(sel).scrollIntoView()
          this.pmEditor.dispatch(tr)
          ev.preventDefault()
          return false
        }
        else {
          return false
        }
      }
      else if (this.selection instanceof NodeSelection && this.selection.node.type.spec.widget && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault()
        return true
      }
    },
    "keyup": (_: any, ev: KeyboardEvent) => {
      this.host.dispatchEvent(new KeyboardEvent(ev.type, ev))
    },
    "drag": (_: any, ev: Event) => {

    },
    "selectstart": (_: any, ev: Event) => {
      return false
    },
    "mouseup": (_: any, ev: MouseEvent) => {
      this.gapDragSelectionAnchor = undefined
    },
    "mousemove": (_: any, ev: MouseEvent) => {
      if (this.gapDragSelectionAnchor !== undefined) {
        const { pos } = this.pmEditor.posAtCoords({ left: ev.x, top: ev.y }) ?? {}
        const isAtEnd = this.gapDragSelectionAnchor >= this.state.doc.nodeSize - 2
        const { top: lastTop } = this.pmEditor.coordsAtPos(this.state.doc.nodeSize - 2)
        if (pos !== undefined && pos !== this.gapDragSelectionAnchor) {
          try {
            const endPos = TextSelection.create(this.state.doc, pos)
            const { node: tableNode } = findParentNode(node => node.type.name === "table")(TextSelection.create(this.state.doc, Math.min(this.gapDragSelectionAnchor, this.state.doc.nodeSize - 2))) ?? {}
            if (tableNode) {
              return false
            }
            else if (ev.y > lastTop && isAtEnd) {
              const sel = new GapCursor(this.state.doc.resolve(this.state.doc.nodeSize - 2))
              const tr = this.state.tr.setSelection(sel)
              this.pmEditor.dispatch(tr)
            }
            else if (!findParentNode(node => ["math", "math_inline"].includes(node.type.name))(endPos) && !(["math", "math_inline"].includes(endPos.$anchor.nodeAfter?.type.name as any))) {
              const sel = TextSelection.create(this.state.doc, Math.min(this.gapDragSelectionAnchor, this.state.doc.nodeSize - 2), pos)
              const tr = this.state.tr.setSelection(sel)
              this.pmEditor.dispatch(tr)
            }
          }
          catch (err) {
            console.error(err)
          }
        }
      }
    },
    "mousedown": (_: any, ev: MouseEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) {
        return false
      }
      else if (ev.button !== 0) {
        return true
      }
      else if (ev.detail === 1) {
        const sel = this.coordsToSelection(ev.y, ev.x)
        if (!sel) {
          return true
        }
        const { node: maybeNewTableNode } = sel ? findParentNode(node => node.type.name === "table")(sel) ?? {} : {}
        const { node: maybeMathNode } = sel ? findParentNode(node => node.type.name === "math_inline" || node.type.name === "math")(sel) ?? {} : {}
        if (maybeMathNode) {
          return false
        }
        if (maybeNewTableNode && !(this.selection instanceof CellSelection) && !(this.selection instanceof GapCursor) && !(this.selection instanceof NodeSelection)) {
          return false
        }
        else if (sel instanceof AllSelection) {
          const tr = this.state.tr.setSelection(sel)
          this.pmEditor.dispatch(tr)
          this.pmEditor.focus()
          ev.preventDefault()
          return true
        }
        else if (sel) {
          if (!(sel instanceof GapCursor) && (findParentNode(node => ["math", "math_inline"].includes(node.type.name))(sel) || (["math", "math_inline"].includes(sel.$anchor.nodeAfter?.type.name as any)))) {
            for (let i = 1; i < sel.$anchor.depth; i++) {
              if (["math", "math_inline"].includes(sel.$anchor.node(i).type.name)) {
                const newSel = NodeSelection.create(this.state.doc, sel.$anchor.before(i))
                const tr = this.state.tr.setSelection(newSel)
                this.pmEditor.dispatch(tr)
              }
            }
            ev.preventDefault()
            return true
          }
          this.gapDragSelectionAnchor = sel.anchor
          const tr = this.state.tr.setSelection(sel)
          this.pmEditor.dispatch(tr)
          this.pmEditor.focus()
          ev.preventDefault()
          return true
        }
      }
      else if (ev.detail === 2 && !this.isGapSelected) {
        return false
      }
      else if (ev.detail === 3 && !this.isGapSelected) {
        return false
      }
      else {
        return true
      }
    },
    "ww-widget-click": (_: any, ev: CustomEvent) => {
    },
    "ww-widget-interact": (_: any, ev: CustomEvent) => {
      this.host.status.updateDocumentElementClasses(ev.detail.relatedEvent, true, ev.detail.relatedEvent?.metaKey)
    },
    "ww-test-update": (_: any, ev: CustomEvent) => {

    },
    "focus": (_: any, ev: FocusEvent) => {
      ev.preventDefault()
      return true
    },
    "contextmenu": (_: any, ev: Event) => {
      ev.preventDefault()
      this.host.forceToolboxPopup = !(this.host.layout.toolboxMode === "popup")
      this.host.layout.updatePosition()
      this.host.requestUpdate()
    },
    "scroll": (_: any, ev: Event) => {
    },
    "drop": (_: any, ev: DragEvent) => this.host.editing.handleDropOrPaste(ev),
    "paste": (_: any, ev: ClipboardEvent) => this.host.editing.handleDropOrPaste(ev)
  }

  windowListeners = {
    "mouseup": () => this.gapDragSelectionAnchor = undefined
  }
}