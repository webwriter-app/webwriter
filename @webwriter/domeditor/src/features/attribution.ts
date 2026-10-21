import {EditorFeature, type DocumentListenerMap} from "."
import {attributionAttributes, createAttributionController, type AttributionController, type AttributionValues} from "../attribution.js"
import {creativeCommonsLicenses} from "../document-head"
import {$, atomicEditingContainer, figureSelectionTarget} from "../utility"
import {getDocumentRoot} from "../document-template"
import {AttributionLicensePicker} from "../components/attribution-license-picker"

/** Per-element licensing edits the current DOM; all controls stay in the appendix. */
export class AttributionFeature extends EditorFeature {
  private controller: AttributionController | null = null
  protected handlesAppendixInteractions = true
  protected handlesFormControlInteractions = true

  activeListeners: DocumentListenerMap = {
    selectionchange: event => this.controller?.handleEvent(event),
    pointerdown: event => this.controller?.handleEvent(event),
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.controller = createAttributionController(document, {
      licenses: creativeCommonsLicenses,
      createLicensePicker: input => {
        const picker = new AttributionLicensePicker()
        picker.addEventListener("combobox-change", event => {
          input.value = (event as CustomEvent<{value: string}>).detail.value
        })
        return picker
      },
      canAttribute: element => element.parentElement === getDocumentRoot(),
      editable: () => !this.editor.isEditingLocked,
      resolveElement: element => figureSelectionTarget(atomicEditingContainer(element, this.editor.schema) ?? element),
      selectedElement: () => {
        const target = this.editor.features.selection.captureSelectedElement
          ?? this.editor.features.selection.selectedSectionElement ?? $.selectedElement
        return target ? atomicEditingContainer(target, this.editor.schema) ?? target : null
      },
      append: element => this.editor.addAppendix(element),
      save: (element, values) => this.save(element, values),
    })
    this.controller.refresh()
  }

  disable() {
    this.controller?.destroy()
    this.controller = null
    super.disable()
  }

  /** Nested attributions belong to their current top-level ancestor as a unit. */
  normalize() {
    const root = getDocumentRoot()
    const names = Object.values(attributionAttributes)
    const hasAttribution = (element: Element) => names.some(name => element.getAttribute(name)?.trim())
    for(const element of root.querySelectorAll(names.map(name => `[${name}]`).join(","))) {
      if(!root.contains(element)) continue
      let top = element
      while(top.parentElement && top.parentElement !== root) top = top.parentElement
      if(top === element || top.parentElement !== root) continue
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

  private save(element: Element, values: Partial<AttributionValues>) {
    if(this.editor.isEditingLocked || element.parentElement !== getDocumentRoot()) return false
    const end = this.editor.doc.beginUndoGroup()
    try {
      for(const [key, value] of Object.entries(values)) {
        const name = attributionAttributes[key as keyof AttributionValues]
        if(value) element.setAttribute(name, value)
        else element.removeAttribute(name)
      }
    }
    finally { end() }
    return true
  }
}
