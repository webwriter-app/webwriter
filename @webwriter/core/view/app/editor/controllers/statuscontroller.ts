import { GapCursor } from "prosemirror-gapcursor"
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { EditorController } from "."
import { PropertyValues } from "lit"

export class StatusController extends EditorController {

  	decorations = (state: EditorState) => {
    const {from, to, $from} = state.selection
    const decorations = [] as Decoration[]
    state.doc.descendants((node, pos, parent, index) => {
      const name = node.type.name
      const selectionEndsInNode = pos <= to && to < pos + node.nodeSize
      const selectionStartsInNode = pos < from && from <= pos + node.nodeSize
      const selectionWrapsNode = from <= pos && pos + node.nodeSize <= to
      const deletingPos = this.host.deletingWidget? this.host.pmEditor.posAtDOM(this.host.deletingWidget, 0) - 1: -1
      const isSelectedInner = selectionWrapsNode && this.host.selection.isTextSelected
      const isSelectedNode = state.selection instanceof NodeSelection && state.selection.node === node
      const textLikeSelectionInside = (state.selection instanceof TextSelection || state.selection instanceof GapCursor) && selectionStartsInNode && selectionEndsInNode
      if(isSelectedNode || isSelectedInner && node.type.spec.selectable || textLikeSelectionInside) {
        const classes = [
          textLikeSelectionInside && "ww-selected-text-within",
          isSelectedInner && "ww-selected-inner",
          isSelectedNode && "ww-selected"
        ].filter(cls => cls)
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: classes.join(" ")}))
        this.host.editingStatus && decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: `ww-${this.host.editingStatus}`}))
      }
      if(node.isInline || name === "_phrase") {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: "ww-inline"}))
      }
      if(this.host.printing) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: "ww-beforeprint"}))
      }
      if(["picture", "audio", "video", "iframe"].includes(node.type.name)) {
        decorations.push(Decoration.widget(pos, (view, getPos) => {
          let el: HTMLElement | undefined = undefined
          // Fix this crutch
          try {
            el = view.nodeDOM(pos) as HTMLElement
          }
          catch(err) {}
          const extraDiv = view.dom.ownerDocument.createElement("div")
          extraDiv.classList.add("ww-nodeview")
          if(isSelectedNode || isSelectedInner) {
            this.host.editingStatus && extraDiv.classList.add(`ww-${this.host.editingStatus}`)
            isSelectedInner && extraDiv.classList.add("ww-selected-inner")
          }
          extraDiv.style.display = "block"
          extraDiv.style.position = "fixed"
          extraDiv.style.zIndex = "2147483647"
          extraDiv.style.pointerEvents = view.state.selection instanceof NodeSelection && view.state.selection.from === pos? "none": "auto"
          extraDiv.addEventListener("mousedown", (e) => {
            const nodeSelection = view.state.selection instanceof NodeSelection
            if((view.state.selection.from !== pos) || !nodeSelection) {
              const sel = new NodeSelection(view.state.doc.resolve(pos))
              const tr = view.state.tr.setSelection(sel)
              view.dispatch(tr)
              e.preventDefault()
            }
          })
          el && new ResizeObserver(() => {
            const {top, left, width, height} = (el ?? extraDiv).getBoundingClientRect()
            const htmlNode = view.dom.ownerDocument.getRootNode() as HTMLElement
            let scrollbarWidth = htmlNode.offsetWidth - htmlNode.clientWidth;
            extraDiv.style.top = `${top}px`
            extraDiv.style.left = `${scrollbarWidth + left}px`
            extraDiv.style.width = `${width}px`
            extraDiv.style.height = `${height}px`
          }).observe(el)
          this.host.pmEditor.document?.addEventListener("scroll", () => {
            const {top, left, width, height} = (el ?? extraDiv).getBoundingClientRect()
            extraDiv.style.top = `${top}px`
            extraDiv.style.left = `${left}px`
            extraDiv.style.width = `${width}px`
            extraDiv.style.height = `${height}px`
          }, {passive: true})
          return extraDiv
        }))
      }
      if(node.type.spec.group?.split(" ").includes("heading")) {
        const cmd = this.host.app.commands.containerCommands.find(cmd => cmd.id === name)
        decorations.push(Decoration.node(
          pos,
          pos + node.nodeSize,
          {
            "data-placeholder": cmd?.label,
            ...(node.textContent.trim() === ""? {"data-empty": ""}: {})
          }
        ))
      }
    })
    return DecorationSet.create(state.doc, decorations)
	}

  updateDocumentElementClasses = (e?: KeyboardEvent | MouseEvent, removeOnly = false, ignoreKbd = true) => {
    if (this.host.mode === "preview" || this.host.mode === "source" || !this.pmEditor?.documentElement) {
      return
    }
    const toRemove = [
      !e?.ctrlKey && !ignoreKbd && "ww-key-ctrl",
      !e?.altKey && !ignoreKbd && "ww-key-alt",
      !e?.shiftKey && !ignoreKbd && "ww-key-shift",
      !e?.metaKey && !ignoreKbd && "ww-key-meta",
      !this.host.selection.isAllSelected && "ww-all-selected",
      !this.app.store.document.empty && "ww-empty",
      this.host.editingStatus !== "copying" && `ww-copying`,
      this.host.editingStatus !== "cutting" && `ww-cutting`,
      this.host.editingStatus !== "deleting" && `ww-deleting`,
      this.host.editingStatus !== "inserting" && `ww-inserting`,
      this.host.editingStatus !== "pinning" && `ww-pinning`,
      this.host.editingStatus !== "commenting" && `ww-commenting`
    ].filter(k => k) as string[]
    const toAdd = [
      e?.ctrlKey && "ww-key-ctrl",
      e?.altKey && "ww-key-alt",
      e?.shiftKey && "ww-key-shift",
      e?.metaKey && "ww-key-meta",
      this.host.selection.isAllSelected && "ww-all-selected",
      this.app.store.document.empty && "ww-empty",
      this.host.editingStatus && `ww-${this.host.editingStatus}`
    ].filter(k => k) as string[]
    toRemove.length && this.pmEditor?.documentElement.classList.remove(...toRemove)
    !removeOnly && toAdd.length && this.pmEditor?.documentElement.classList.add(...toAdd)
  }

  globalListeners = {
    "keydown": (e: any) => this.updateDocumentElementClasses(e, undefined, false),
    "keyup": (e: any) => this.updateDocumentElementClasses(e, true, false),
    "mouseup": (e: any) => this.updateDocumentElementClasses(e),
    "mousedown": (e: any) => this.updateDocumentElementClasses(e),
    "focus": (e: any) => this.updateDocumentElementClasses(e, true)
  }

  windowListeners: Partial<Record<keyof WindowEventMap | "test-update", any>> = {
    "beforeprint": () => this.host.printing = true,
    "afterprint": () => this.host.printing = false,
    "test-update": (e: any) => this.app.store.packages.processTestUpdate(e.detail)
  }

  editorListeners = {
    "keydown": (view: EditorView, e: KeyboardEvent) => {e.key === "Escape" && (this.host.forceToolboxPopup = false)}
  }

  protected hostUpdated(changed: PropertyValues): void {
    this.updateDocumentElementClasses()
  }

}