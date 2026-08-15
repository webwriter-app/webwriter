import {EditorFeature} from "."

/** Realm-independent state transfer used when package changes reload the
 * iframe and, with it, the custom-element registry. */
export class StateFeature extends EditorFeature {
  actions = {
    snapshotState: ({}: {type: "snapshotState"}) => this.editor.doc.snapshot(),
    serializeDocument: ({offline = false}: {type: "serializeDocument", offline?: boolean}) =>
      this.editor.serializeHTML(offline),
  } as const
}
