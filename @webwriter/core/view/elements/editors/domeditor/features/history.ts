import { DocumentListenerMap, EditorFeature } from "."
import { modifierKeyDown, isOnApple } from "../utility"

export class HistoryFeature extends EditorFeature {

  actions = {
    undo: ({}: {type: "undo"}) => {
      this.editor.doc.undo()
    },
    redo: ({}: {type: "redo"}) => {
      this.editor.doc.redo()
    },
  } as const

  activeListeners: DocumentListenerMap = {
      "keydown": ev => {
        const isUndo = ev.key === "z" && modifierKeyDown(ev)
        const isMacRedo = isOnApple() && ev.key === "z" && modifierKeyDown(ev) && ev.shiftKey
        const isWinLinuxRedo = !isOnApple() && ev.key === "y" && modifierKeyDown(ev)
        if(isUndo) {
          ev.preventDefault()
          this.editor.doc.undo()
        }
        else if(isMacRedo || isWinLinuxRedo) {
          ev.preventDefault()
          this.editor.doc.redo()
        }
      }
    }
}