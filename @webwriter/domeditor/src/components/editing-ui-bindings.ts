import {noChange} from "lit"
import {AsyncDirective} from "lit/async-directive.js"
import {directive, PartType, type ElementPart, type PartInfo} from "lit/directive.js"
import {EditingControls} from "./editing-controls"

/** Presentation state already mirrored by the editor bridge. */
export type EditingUIProperties = Pick<EditingControls,
  | "canMark"
  | "canSection"
  | "sectionType"
  | "sectionActive"
  | "sectionSelected"
  | "marks"
  | "markStyles"
  | "markAttributes"
  | "ruby"
  | "commentState"
  | "listType"
  | "listStyle"
  | "orderedList"
  | "headingGroup"
  | "figure"
  | "media"
  | "dialog"
  | "graphic"
  | "layout"
  | "layoutError"
  | "elementAttributes"
  | "elementStyle"
  | "historyState"
  | "historyLoading"
  | "historyError"
>
export type EditingUIListeners = Readonly<Record<string, EventListener>>

/** Shares property and event bindings across editing surfaces. Lit owns this
 * directive's lifecycle, including temporary disconnection and reconnection. */
class EditingUIBindings extends AsyncDirective {
  private element: EditingControls | undefined
  private listeners: EditingUIListeners | undefined

  constructor(info: PartInfo) {
    super(info)
    if(info.type !== PartType.ELEMENT) throw new TypeError("Editing UI bindings require an element part")
  }

  render(_properties: EditingUIProperties, _listeners: EditingUIListeners) { return noChange }

  update(part: ElementPart, [properties, listeners]: [EditingUIProperties, EditingUIListeners]) {
    if(!(part.element instanceof EditingControls)) throw new TypeError("Expected an editing controls element")
    if(this.element !== part.element || this.listeners !== listeners) {
      this.removeListeners()
      this.element = part.element
      this.listeners = listeners
      if(this.isConnected) this.addListeners()
    }
    Object.assign(this.element, properties)
    return noChange
  }

  private addListeners() {
    Object.entries(this.listeners ?? {}).forEach(([name, listener]) => this.element?.addEventListener(name, listener))
  }

  private removeListeners() {
    Object.entries(this.listeners ?? {}).forEach(([name, listener]) => this.element?.removeEventListener(name, listener))
  }

  protected disconnected() { this.removeListeners() }
  protected reconnected() { this.addListeners() }
}

export const bindEditingUI = directive(EditingUIBindings)
