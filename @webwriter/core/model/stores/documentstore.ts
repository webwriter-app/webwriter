import { EditorState } from "prosemirror-state"
import { Schema } from "prosemirror-model"

import { createEditorState, Environment } from ".."
import { getFileExtension } from "../../utility"
import * as marshal from "../marshal"
import * as connect from "../connect"
import { redoDepth, undoDepth } from "prosemirror-history"

const BINARY_EXTENSIONS = Object.entries(marshal).flatMap(([k, v]) => v.isBinary? v.extensions: [])
const ALL_FILTER = {name: "Explorable", extensions: Object.values(marshal).flatMap(v => v.extensions)}
const INDIVIDUAL_FILTERS = Object.entries(marshal).map(([k, v]) => ({name: v.label, extensions: v.extensions}))
const FILTERS = [ALL_FILTER, ...INDIVIDUAL_FILTERS]

type Resource = {
  url: string
  editorState: EditorState
}

type Options = {
  bundle: Environment["bundle"],
  schema?: Schema
}

/** Manages all resources. A resource is the app's internal document format. Resources have `editorState`, storing all the document's data in the ProseMirror format. They are referred to with URLs, indicating whether the resources are in memory (not saved yet) or external such as on the user's hard drive (saved before at `url`). */
export class DocumentStore implements Resource {

  url: string
  editorState: EditorState
  isPreviewing: boolean = false
  schema: Schema
  lastSavedState: EditorState

  bundle: Options["bundle"]

  constructor(options: Options) {
    Object.assign(this, options)
    this.create()
  }

  get changed() {
    return !this.lastSavedState.doc.eq(this.editorState.doc)
  }

  /** Updates the document schema with the store's schema. */
  updateSchema() {
    this.editorState = createEditorState({...this.editorState, schema: this.schema})
  }

  /** Gets a new, unused resource URL. */
  getNewURL() {
    return `memory:0`
    /*
    const memoryNumberIDs = Object.keys(this._resources)
      .map(url => new URL(url))
      .filter(url => url.protocol="memory")
      .map(url => parseInt(url.pathname))
      .filter(num => !Number.isNaN(num))
    return `memory:${Math.max(-1, ...memoryNumberIDs) + 1}`
    */
  }

  /** Creates a new resource. */
  create(url: Resource["url"] = this.getNewURL(), schema: Schema = this.schema) {
    this.editorState = this.lastSavedState = createEditorState({schema})
    this.url = url
  }

  get undoDepth() {
    return undoDepth(this.editorState)
  }

  get redoDepth() {
    return redoDepth(this.editorState)
  }

  /** Saves a resource on an external file system. */
  async save(saveAs=false) {
    const resource = this
    let urlObj = new URL(resource?.url ?? "memory:/")
    if(urlObj.protocol === "memory:" || saveAs) {
      const path = await connect["file"].pickSave(INDIVIDUAL_FILTERS)
      if(path === null) {
        return
      }
      urlObj = new URL("file:/")
      urlObj.pathname = path
    }

    const protocol = urlObj.protocol.slice(0, -1)
    const format = getFileExtension(urlObj.href)
    const save = (connect as any)[protocol].save
    const serialize = (marshal as any)[format].serialize
    const isBinary = (marshal as any)[format].isBinary
  
    let data = await serialize(resource.editorState.doc, this.bundle)
    await save(data, urlObj.href, isBinary)
    this.lastSavedState = this.editorState
  }

  /** Loads a resource from an external file system. */
  async load(url?: Resource["url"]) {
    let urlObj = new URL("memory:/")
    if(!url) {
      urlObj.protocol = "file:"
      const path = await connect["file"].pickLoad(INDIVIDUAL_FILTERS)
      if(path === null) {return}
      urlObj.pathname = path as string
    }
    else {
      urlObj = new URL(url)
    }

    const protocol = urlObj.protocol.slice(0, -1)
    const format = getFileExtension(urlObj.href)
    const load = (connect as any)[protocol].load
    const parse = (marshal as any)[format].parse
    
    let data = await load(urlObj.href, BINARY_EXTENSIONS)
    let editorState = await parse(data, this.schema)
    this.url = urlObj.href
    this.editorState = this.lastSavedState = editorState
  }

}