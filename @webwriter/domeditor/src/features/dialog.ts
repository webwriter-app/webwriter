import {EditorFeature, type DocumentListenerMap} from "."
import {
  dialogDefaultHTML,
  isDialogClosedBy,
  nextDialogIds,
  type DialogSelectionState,
} from "../dialog"
import {$, getContainer, isElement} from "../utility"

const editingMarker = "◆dialog-editing"
const dialogCommands = new Set(["show-modal", "close", "request-close"])
const editableAttributes = new Set(["id", "open", "closedby", "aria-label", "aria-labelledby", "title"])

/** Declarative dialog authoring. Closed dialogs are exposed for editing with
 * a collaboration-filtered marker; native modal/close commands remain
 * authored but do not execute until the document is previewed. */
export class DialogFeature extends EditorFeature {
  protected handlesFormControlInteractions = true
  private markedDialog: WeakRef<HTMLDialogElement> | null = null

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.refresh()
  }

  disable() {
    if(!this.isEnabled) return
    this.clearEditingMarkers()
    super.disable()
  }

  actions = {
    insertDialog: ({}: {type: "insertDialog"}) => this.insertDialog(),
    setDialogAttribute: ({name, value}: {
      type: "setDialogAttribute"
      name: string
      value: string | null
    }) => this.setDialogAttribute(name, value),
    addDialogInvoker: ({}: {type: "addDialogInvoker"}) => this.addDialogInvoker(),
    addDialogCloseButton: ({}: {type: "addDialogCloseButton"}) => this.addDialogCloseButton(),
  } as const

  activeListeners: DocumentListenerMap = {
    selectionchange: () => queueMicrotask(() => this.refresh()),
    click: event => this.preventDialogCommand(event),
    cancel: event => {
      if(isElement(event.target) && event.target.matches("dialog")) event.preventDefault()
    },
  }

  /** Re-resolves the active dialog from the live DOM. No retained selection
   * endpoint or previously selected dialog is assumed to remain connected. */
  get activeDialog(): HTMLDialogElement | null {
    const captured = this.editor.features.selection.captureSelectedElement
    const selected = $.selectedElement
    const anchor = $.anchor
    const target = captured ?? selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(target) || !target.isConnected || !document.body.contains(target)) return null
    return (target.matches("dialog") ? target : target.closest("dialog")) as HTMLDialogElement | null
  }

  refresh() {
    const active = this.activeDialog
    const previous = this.markedDialog?.deref()
    if(previous && previous !== active) this.removeEditingMarker(previous)
    document.querySelectorAll<HTMLDialogElement>(`dialog.${editingMarker}`).forEach(dialog => {
      if(dialog !== active) this.removeEditingMarker(dialog)
    })
    if(active) {
      active.classList.add("◆", editingMarker)
      this.markedDialog = new WeakRef(active)
    }
    else this.markedDialog = null
    return active
  }

  getState(): DialogSelectionState | undefined {
    const dialog = this.refresh()
    if(!dialog) return
    const attributes = Object.fromEntries(Array.from(dialog.attributes).flatMap(attribute => {
      if(attribute.name !== "class") return [[attribute.name, attribute.value]]
      const authored = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
      return authored ? [["class", authored]] : []
    }))
    const id = dialog.id
    const invokers = id ? Array.from(document.querySelectorAll<HTMLButtonElement>("button[commandfor]"))
      .filter(button => button.getAttribute("commandfor") === id) : []
    const closedBy = dialog.getAttribute("closedby")
    return {
      attributes,
      initiallyOpen: dialog.hasAttribute("open"),
      closedBy: isDialogClosedBy(closedBy) ? closedBy : "",
      openerCount: invokers.filter(button => button.getAttribute("command") === "show-modal").length,
      closeControlCount: invokers.filter(button => ["close", "request-close"].includes(button.getAttribute("command") ?? "")).length,
      hasDialogForm: Boolean(dialog.querySelector('form[method="dialog"]')),
    }
  }

  insertDialog() {
    const {html, dialogId} = dialogDefaultHTML(document)
    this.editor.features.manipulation.insertHTML(html)
    const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog"))
      .find(candidate => candidate.id === dialogId)
    if(!dialog?.isConnected) return false
    $.selectElement(dialog)
    this.refresh()
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath(true)
    return true
  }

  private setDialogAttribute(name: string, value: string | null) {
    const dialog = this.activeDialog
    if(!dialog || !editableAttributes.has(name)) {
      throw new TypeError(`Attribute '${name}' is not editable for the selected dialog`)
    }
    if(name === "open" && value !== null && value !== "") {
      throw new TypeError("The dialog open attribute is boolean")
    }
    if(name === "closedby" && value !== null && !isDialogClosedBy(value)) {
      throw new TypeError(`Unsupported dialog close behavior '${value}'`)
    }
    if(name === "id" && value !== null && (!value || /\s/.test(value))) {
      throw new TypeError("A dialog ID must be non-empty and contain no whitespace")
    }

    const oldId = dialog.id
    const oldIdIsUnique = Boolean(oldId) && Array.from(document.querySelectorAll("[id]"))
      .filter(element => element.id === oldId).length === 1
    value === null ? dialog.removeAttribute(name) : dialog.setAttribute(name, value)
    if(name === "id" && oldIdIsUnique) {
      document.querySelectorAll<HTMLButtonElement>("button[commandfor]").forEach(button => {
        if(button.getAttribute("commandfor") === oldId) {
          value === null ? button.removeAttribute("commandfor") : button.setAttribute("commandfor", value)
        }
      })
    }
    this.refresh()
    this.editor.postSelectionPath()
    return true
  }

  private ensureDialogId(dialog: HTMLDialogElement) {
    if(dialog.id) return dialog.id
    const {dialogId} = nextDialogIds(document)
    dialog.id = dialogId
    return dialogId
  }

  private addDialogInvoker() {
    const dialog = this.activeDialog
    const parent = dialog?.parentElement
    if(!dialog || !parent) return false
    const button = document.createElement("button")
    button.type = "button"
    button.setAttribute("commandfor", this.ensureDialogId(dialog))
    button.setAttribute("command", "show-modal")
    button.textContent = "Open dialog"
    const proposed = Array.from(parent.childNodes)
    proposed.splice(Array.from(parent.childNodes).indexOf(dialog), 0, button)
    if(!this.editor.schema.isContentValid(parent, proposed)) return false
    dialog.before(button)
    $.selectElement(dialog)
    this.refresh()
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
    return true
  }

  private addDialogCloseButton() {
    const dialog = this.activeDialog
    if(!dialog) return false
    const button = document.createElement("button")
    button.type = "button"
    button.setAttribute("commandfor", this.ensureDialogId(dialog))
    button.setAttribute("command", "close")
    button.textContent = "Close"
    const proposed = [...Array.from(dialog.childNodes), button]
    if(!this.editor.schema.isContentValid(dialog, proposed)) return false
    dialog.append(button)
    $.selectElement(dialog)
    this.refresh()
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
    return true
  }

  private preventDialogCommand(event: MouseEvent) {
    if(!isElement(event.target)) return
    const button = event.target.closest<HTMLButtonElement>("button[commandfor][command]")
    const command = button?.getAttribute("command") ?? ""
    const targetId = button?.getAttribute("commandfor") ?? ""
    if(!button || !dialogCommands.has(command) || !targetId) return
    const target = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[id]"))
      .find(dialog => dialog.id === targetId)
    if(target) event.preventDefault()
  }

  private clearEditingMarkers() {
    const marked = this.markedDialog?.deref()
    if(marked) this.removeEditingMarker(marked)
    this.markedDialog = null
    document.querySelectorAll<HTMLDialogElement>(`dialog.${editingMarker}`).forEach(dialog => {
      this.removeEditingMarker(dialog)
    })
  }

  private removeEditingMarker(dialog: HTMLDialogElement) {
    dialog.classList.remove(editingMarker)
    if(!Array.from(dialog.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
      dialog.classList.remove("◆")
    }
    if(!dialog.classList.length) dialog.removeAttribute("class")
  }
}
