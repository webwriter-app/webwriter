import type { EditingMutation } from "../domdoc"
import { DOMEditor } from "../domeditor"
import {isFormControlInteraction, isWidgetShadowInteraction} from "../utility"

export type DocumentListenerMap = {[key in keyof DocumentEventMap]?: (event: DocumentEventMap[key]) => void}

type ConstraintMap = Record<string, (transaction: EditingMutation[]) => void>

export class EditorFeature {

  constructor(readonly editor: DOMEditor) {}
  protected isEnabled = false
  passiveListeners: DocumentListenerMap = {}
  activeListeners: DocumentListenerMap = {}
  constraints: ConstraintMap = {}
  actions?: Record<string, CallableFunction>
  /** FormFeature opts in so all other editor features leave captured native
   * control events to the browser and the form-state synchronizer. */
  protected handlesFormControlInteractions = false
  private listenerWrappers = new Map<EventListener, EventListener>()

  private addListeners(listeners: DocumentListenerMap, options?: AddEventListenerOptions) {
    Object.entries(listeners).forEach(([type, listener]) => {
      const wrapped: EventListener = event => {
        if(!isWidgetShadowInteraction(event)
          && (this.handlesFormControlInteractions || !isFormControlInteraction(event))) {
          listener(event as never)
        }
      }
      this.listenerWrappers.set(listener as EventListener, wrapped)
      document.addEventListener(type, wrapped, options)
    })
  }

  private removeListeners(listeners: DocumentListenerMap, options?: EventListenerOptions) {
    Object.entries(listeners).forEach(([type, listener]) => {
      const wrapped = this.listenerWrappers.get(listener as EventListener)
      if(wrapped) document.removeEventListener(type, wrapped, options)
      this.listenerWrappers.delete(listener as EventListener)
    })
  }
  
  enable() {
    this.addListeners(this.activeListeners)
    this.addListeners(this.passiveListeners, {passive: true})
    this.isEnabled = true
  }
  
  disable() {
    this.removeListeners(this.activeListeners)
    this.removeListeners(this.passiveListeners)
    this.isEnabled = false
  }
}
