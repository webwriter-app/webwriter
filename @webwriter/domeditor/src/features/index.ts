import type { EditingMutation } from "../domdoc"
import { DOMEditor } from "../domeditor"
import {isAppendixInteraction, isFormControlInteraction, isWidgetShadowInteraction} from "../utility"

export type DocumentListenerMap = {[key in keyof DocumentEventMap]?: (event: DocumentEventMap[key]) => void}
type FeatureActionHandler = (action: never) => unknown

/** Collects the fixed feature command surface once, rejecting ambiguous names. */
export function collectFeatureActions(features: Iterable<{actions?: Record<string, FeatureActionHandler>}>) {
  const handlers = new Map<string, FeatureActionHandler>()
  for(const feature of features) {
    for(const [type, handler] of Object.entries(feature.actions ?? {})) {
      if(handlers.has(type)) throw new TypeError(`Duplicate editor action '${type}'`)
      handlers.set(type, handler)
    }
  }
  return handlers as ReadonlyMap<string, FeatureActionHandler>
}

type ConstraintMap = Record<string, (transaction: EditingMutation[]) => void>
type ListenerRegistration = {
  owner: DocumentListenerMap
  type: string
  wrapped: EventListener
  capture: boolean
}

const capturedInteractionEvents = new Set([
  "beforeinput",
  "compositionstart",
  "input",
  "keydown",
  "keyup",
  "paste",
])

export class EditorFeature {

  constructor(readonly editor: DOMEditor) {}
  protected isEnabled = false
  /** Boundary listeners inspect composed origins themselves before feature routing. */
  captureListeners: DocumentListenerMap = {}
  passiveListeners: DocumentListenerMap = {}
  activeListeners: DocumentListenerMap = {}
  constraints: ConstraintMap = {}
  actions?: Record<string, FeatureActionHandler>
  /** Native form controls remain browser-managed while captured. */
  protected handlesFormControlInteractions = false
  /** Interactive authored elements own editing input while capture-selected,
   * just as widget shadow trees own their native keyboard and text events. */
  protected handlesCapturedElementInteractions = false
  /** Direct-manipulation features may opt in when their own controls live in
   * the shadow appendix. Ordinary document features must ignore that UI. */
  protected handlesAppendixInteractions = false
  private listenerRegistrations: ListenerRegistration[] = []

  private addListeners(listeners: DocumentListenerMap, options?: AddEventListenerOptions) {
    if(this.listenerRegistrations.some(registration => registration.owner === listeners)) return
    Object.entries(listeners).forEach(([type, listener]) => {
      const wrapped: EventListener = event => {
        if(listeners === this.captureListeners) {
          listener(event as never)
          return
        }
        const captureOwnsInteraction = capturedInteractionEvents.has(type)
          && Boolean(this.editor.features?.selection?.isCaptureSelection)
        if((!captureOwnsInteraction || this.handlesCapturedElementInteractions)
          && (this.handlesAppendixInteractions || !isAppendixInteraction(event))
          && !isWidgetShadowInteraction(event, this.editor.schema)
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
    this.addListeners(this.captureListeners, {capture: true, passive: false})
    this.addListeners(this.activeListeners)
    this.addListeners(this.passiveListeners, {passive: true})
    this.isEnabled = true
  }
  
  disable() {
    if(!this.isEnabled) return
    this.removeListeners(this.captureListeners)
    this.removeListeners(this.activeListeners)
    this.removeListeners(this.passiveListeners)
    this.isEnabled = false
  }
}
