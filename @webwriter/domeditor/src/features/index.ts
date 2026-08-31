import type { EditingMutation } from "../domdoc"
import { DOMEditor } from "../domeditor"
import {isFormControlInteraction, isWidgetShadowInteraction} from "../utility"

export type DocumentListenerMap = {[key in keyof DocumentEventMap]?: (event: DocumentEventMap[key]) => void}

type ConstraintMap = Record<string, (transaction: EditingMutation[]) => void>
type ListenerRegistration = {
  owner: DocumentListenerMap
  type: string
  wrapped: EventListener
  capture: boolean
}

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
  private listenerRegistrations: ListenerRegistration[] = []

  private addListeners(listeners: DocumentListenerMap, options?: AddEventListenerOptions) {
    if(this.listenerRegistrations.some(registration => registration.owner === listeners)) return
    Object.entries(listeners).forEach(([type, listener]) => {
      const wrapped: EventListener = event => {
        if(!isWidgetShadowInteraction(event)
          && (this.handlesFormControlInteractions || !isFormControlInteraction(event))) {
          listener(event as never)
        }
      }
      this.listenerRegistrations.push({owner: listeners, type, wrapped, capture: Boolean(options?.capture)})
      document.addEventListener(type, wrapped, options)
    })
  }

  private removeListeners(listeners: DocumentListenerMap) {
    this.listenerRegistrations
      .filter(registration => registration.owner === listeners)
      .forEach(({type, wrapped, capture}) => document.removeEventListener(type, wrapped, {capture}))
    this.listenerRegistrations = this.listenerRegistrations
      .filter(registration => registration.owner !== listeners)
  }
  
  enable() {
    if(this.isEnabled) return
    this.addListeners(this.activeListeners)
    this.addListeners(this.passiveListeners, {passive: true})
    this.isEnabled = true
  }
  
  disable() {
    if(!this.isEnabled) return
    this.removeListeners(this.activeListeners)
    this.removeListeners(this.passiveListeners)
    this.isEnabled = false
  }
}
