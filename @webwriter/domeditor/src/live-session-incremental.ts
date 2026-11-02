import * as Y from "yjs"

/** An experimental encoding of serialized preview snapshots. The preview DOM
 * remains authoritative; this text exists only to record its changes. */
export class IncrementalPreviewRecorder {
  private readonly doc = new Y.Doc()
  private readonly text = this.doc.getText("preview")

  constructor(initialHTML: string) {
    this.text.insert(0, initialHTML)
  }

  /** A checkpoint can initialize a player without any preceding updates. */
  checkpoint() {
    return Y.encodeStateAsUpdate(this.doc)
  }

  /** Encode one change as a binary Yjs update, or nothing for an unchanged preview. */
  capture(html: string): Uint8Array | null {
    const previous = this.text.toString()
    if(previous === html) return null
    let start = 0
    while(start < previous.length && start < html.length && previous[start] === html[start]) start++
    // Y.Text offsets count UTF-16 code units, but edits must not split a surrogate pair.
    if(start > 0 && start < previous.length && /[\uDC00-\uDFFF]/.test(previous[start])) start--
    let end = 0
    while(end < previous.length - start && end < html.length - start
      && previous[previous.length - 1 - end] === html[html.length - 1 - end]) end++
    if(end > 0 && /[\uDC00-\uDFFF]/.test(previous[previous.length - end])) end--
    let update: Uint8Array | null = null
    const capture = (value: Uint8Array) => { update = value }
    this.doc.on("update", capture)
    try {
      this.doc.transact(() => {
        const removed = previous.length - start - end
        if(removed) this.text.delete(start, removed)
        const inserted = html.slice(start, html.length - end)
        if(inserted) this.text.insert(start, inserted)
      })
    }
    finally { this.doc.off("update", capture) }
    return update
  }

  destroy() { this.doc.destroy() }
}

/** Reconstruct a preview from a checkpoint and the subsequent ordered updates. */
export function reconstructIncrementalPreview(checkpoint: Uint8Array, updates: readonly Uint8Array[]) {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, checkpoint)
    updates.forEach(update => Y.applyUpdate(doc, update))
    if(doc.store.pendingStructs || doc.store.pendingDs) throw new Error("Incomplete preview updates")
    return doc.getText("preview").toString()
  }
  finally { doc.destroy() }
}
