import {EditorFeature, type DocumentListenerMap} from "."
import {attributionAttributes, createAttributionController, type AttributionController, type AttributionValues} from "../attribution.js"
import {creativeCommonsLicenses} from "../document-head"
import {$, atomicEditingContainer, createAnchorPositioner, figureSelectionTarget} from "../utility"
import {getDocumentRoot} from "../document-template"
import {AttributionLicensePicker} from "../components/attribution-license-picker"
import {isBoardCard, isBoardColumn} from "../document-layout"

/** Per-element licensing edits the current DOM; all controls stay in the appendix. */
export class AttributionFeature extends EditorFeature {
  private controller: AttributionController | null = null
  protected handlesAppendixInteractions = true
  protected handlesFormControlInteractions = true

  private root(element: Element) {
    return this.editor.features.slides.active && this.editor.features.slides.containingSlide(element.parentElement) || getDocumentRoot()
  }

  private canAttribute(element: Element) {
    return isBoardCard(element) || isBoardColumn(element) || element.parentElement === this.root(element)
  }

  activeListeners: DocumentListenerMap = {
    selectionchange: event => this.controller?.handleEvent(event),
    pointerdown: event => this.controller?.handleEvent(event),
    pointerup: () => this.controller?.refresh(),
    pointercancel: () => this.controller?.refresh(),
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.controller = createAttributionController(document, {
      licenses: creativeCommonsLicenses,
      anchorFactory: createAnchorPositioner,
      createLicensePicker: input => {
        const picker = new AttributionLicensePicker()
        picker.addEventListener("combobox-change", event => {
          input.value = (event as CustomEvent<{value: string}>).detail.value
        })
        return picker
      },
      canAttribute: element => this.canAttribute(element),
      affordanceContainer: element => this.editor.features.board.transformOverlay(element as HTMLElement)
        ?? this.editor.features.transformation.freeformControlContainer(element),
      editable: () => !this.editor.isEditingLocked,
      resolveElement: element => figureSelectionTarget(atomicEditingContainer(element, this.editor.schema) ?? element),
      selectedElement: () => {
        if(this.editor.features.selection.isInDragSelection) return null
        const target = this.editor.features.selection.captureSelectedElement
          ?? this.editor.features.selection.selectedSectionElement ?? $.selectedElement
        return target ? atomicEditingContainer(target, this.editor.schema) ?? target : null
      },
      append: element => this.editor.addAppendix(element),
      save: (elements, values) => this.save(elements, values),
    })
    this.controller.refresh()
  }

  disable() {
    this.controller?.destroy()
    this.controller = null
    super.disable()
  }

  refresh() { this.controller?.refresh() }

  /** Nested attributions belong to their top-level document or slide item as a unit. */
  normalize() {
    const documentRoot = getDocumentRoot()
    const names = Object.values(attributionAttributes)
    const hasAttribution = (element: Element) => names.some(name => element.getAttribute(name)?.trim())
    for(const element of documentRoot.querySelectorAll(names.map(name => `[${name}]`).join(","))) {
      const root = this.root(element)
      if(!root.contains(element)) continue
      let top = element
      while(top.parentElement && top.parentElement !== root && !isBoardCard(top) && !isBoardColumn(top)) top = top.parentElement
      if(top === element || !this.canAttribute(top)) continue
      if(!hasAttribution(top) && hasAttribution(element)) {
        for(const name of names) {
          const value = element.getAttribute(name)
          if(value === null) top.removeAttribute(name)
          else top.setAttribute(name, value)
        }
      }
      for(const name of names) element.removeAttribute(name)
    }
  }

  actions = {
    openAttribution: (_action: {type: "openAttribution"}) => {
      if(this.editor.isEditingLocked) return false
      const elements = this.editor.features.manipulation.selectedEditingElements()
        .filter(element => this.canAttribute(element))
      return this.controller?.open(elements) ?? false
    },
  }

  private save(elements: Element[], values: Partial<AttributionValues>) {
    if(this.editor.isEditingLocked || elements.some(element => !element.isConnected || !this.canAttribute(element))) return false
    const end = this.editor.doc.beginUndoGroup()
    try {
      for(const element of elements) for(const [key, value] of Object.entries(values)) {
        const name = attributionAttributes[key as keyof AttributionValues]
        if(value) element.setAttribute(name, value)
        else element.removeAttribute(name)
      }
    }
    finally { end() }
    return true
  }
}
