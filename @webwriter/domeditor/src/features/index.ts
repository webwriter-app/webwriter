import type { EditingMutation } from "../domdoc"
import { DOMEditor } from "../domeditor"

export type DocumentListenerMap = {[key in keyof DocumentEventMap]?: (event: DocumentEventMap[key]) => void}

type ConstraintMap = Record<string, (transaction: EditingMutation[]) => void>

export class EditorFeature {

  constructor(readonly editor: DOMEditor) {}
  protected isEnabled = false
  passiveListeners: DocumentListenerMap = {}
  activeListeners: DocumentListenerMap = {}
  constraints: ConstraintMap = {}
  actions?: Record<string, CallableFunction>
  
  enable() {
    Object.keys(this.activeListeners).forEach(k => document.addEventListener(k, (this.activeListeners as any)[k]))
    Object.keys(this.passiveListeners).forEach(k => document.addEventListener(k, (this.passiveListeners as any)[k], {passive: true}))
    this.isEnabled = true
  }
  
  disable() {
    Object.keys(this.activeListeners).forEach(k => document.removeEventListener(k, (this.activeListeners as any)[k]))
    Object.keys(this.passiveListeners).forEach(k => document.removeEventListener(k, (this.passiveListeners as any)[k]))
    this.isEnabled = false
  }
}