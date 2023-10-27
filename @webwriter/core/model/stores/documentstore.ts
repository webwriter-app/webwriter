import { EditorState } from "prosemirror-state"
import { Schema, Node, NodeType, Attrs } from "prosemirror-model"

import { createEditorState, EditorStateWithHead, Environment, getActiveMarks } from ".."
import { getFileExtension, groupBy, range } from "../../utility"
import * as marshal from "../marshal"
import * as connect from "../connect"
import { redoDepth, undoDepth } from "prosemirror-history"
import { EditorView } from "prosemirror-view"
import { serialize } from "../marshal/html"

const BINARY_EXTENSIONS = Object.entries(marshal).flatMap(([k, v]) => v.isBinary? v.extensions: [])
const ALL_FILTER = {name: "Explorable", extensions: Object.values(marshal).flatMap(v => v.extensions)}
export const INDIVIDUAL_FILTERS = Object.entries(marshal).map(([k, v]) => ({name: v.label, extensions: v.extensions}))
const FILTERS = [ALL_FILTER, ...INDIVIDUAL_FILTERS]

type Resource = {
  url: string
  editorState: EditorStateWithHead
}

type Options = {
  bundle: Environment["bundle"],
  schema?: Schema,
  url?: string,
  editorState?: EditorStateWithHead
}

/** Manages the document. A document is the app's central data format. The document has an `editorState`, storing all the document's data in the ProseMirror format. It is referred to with an URL, indicating whether the document is only in memory (not saved yet) or external such as on the user's hard drive (saved before at `url`). */
export class DocumentStore implements Resource {

  url: string
  editorState: EditorStateWithHead
  isPreviewing: boolean = false
  lastSavedState: EditorStateWithHead

  ioState: "idle" | "saving" | "loading" = "idle"

  bundle: Options["bundle"]

  constructor({bundle, schema, url, editorState}: Options) {
    this.bundle = bundle
    this.editorState = this.lastSavedState = editorState ?? createEditorState
    ({schema})
    this.url = url ?? "memory:0"
  }

  get changed() {
    return !this.lastSavedState.doc.eq(this.editorState.doc) || !this.lastSavedState.head$.doc.eq(this.editorState.head$.doc)
  }

  /** Updates the document schema with the store's schema. */
  updateSchema(schema: Schema) {
    const newState = createEditorState({...this.editorState, schema})
    const defaultState = createEditorState({schema: this.editorState.schema})
    if(this.editorState.doc.eq(defaultState.doc)) {
      this.lastSavedState = newState
    }
    this.editorState = newState
  }

  get undoDepth() {
    return undoDepth(this.editorState)
  }

  get redoDepth() {
    return redoDepth(this.editorState)
  }

  
  /** Sets a new editor state for the given resource. */
  set(editorState: EditorStateWithHead) {
    this.editorState = editorState
  }

  /** Sets a new editor state for the given resource. */
  setHead(head$: EditorState) {
    const state = this.editorState.apply(this.editorState.tr)
    this.set(Object.assign(state, {head$}))
  }

  /** Saves a resource on an external file system. */
  async save(saveAs=false) {
    this.ioState = "saving"
    try {
      const resource = this
      let urlObj = new URL(resource?.url ?? "memory:/")
      if(urlObj.protocol === "memory:" || saveAs) {
        const path = await connect["file"].pickSave(INDIVIDUAL_FILTERS, this.inMemory? this.provisionalTitle: this.url)
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
    
      let data = await serialize(resource.editorState.doc, resource.editorState.head$.doc, this.bundle)
      await save(data, urlObj.href, isBinary)
      this.lastSavedState = this.editorState
      this.url = urlObj.href
    }
    finally {
      this.ioState = "idle"
    }
  }

  /** Loads a resource from an external file system. */
  async load(url?: Resource["url"]) {
    this.ioState = "loading"
    try {
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
      let editorState = await parse(data, this.editorState.schema)
      this.url = urlObj.href
      this.editorState = this.lastSavedState = editorState
    }
    finally {
      this.ioState = "idle"
    }
  }

  /** Open a preview for this document. */
  async preview() {
    const htmlString = await serialize(
      this.editorState.doc,
      this.editorState.head$.doc,
      this.bundle
    )
    const blob = new Blob([htmlString], {type: "text/html"})
    const blobURL = URL.createObjectURL(blob)
    open(blobURL, "_blank")
  }

  get empty() {
    const defaultState = createEditorState({schema: this.editorState.schema})
    return this.editorState.doc.eq(defaultState.doc)
  }

  get inMemory() {
    return this.url.startsWith("memory:")
  }

  get activeMarks() {
    return getActiveMarks(this.editorState)
  }

  get activeNodes() {
    const {editorState: s} = this
    const nodes = [] as Node[]
    s.doc.nodesBetween(s.selection.from, s.selection.to, node => {
      nodes.push(node)
    })
    return nodes
  }

  get activePos() {
    const {editorState: s} = this
    const posList = [] as number[]
    s.doc.nodesBetween(s.selection.from, s.selection.to, (node, pos) => {
      posList.push(pos)
    })
    return posList
  }

  get activeAttributes() {
    return this.activeNodes.flatMap(node => {
      return Object.entries(node.attrs).map(([key, value]) => {
        return {node, key, value}
      })
    })
  }

  get activeAttributesByKey() {
    return groupBy(this.activeAttributes, "key")
  }

  get activeNodeNames() {
    return this.activeNodes.map(node => node.type.name)
  }

  get activeMarkNames() {
    return this.activeMarks.map(mark => mark.type.name)
  }

  get docAttributes() {
    return this.editorState.doc.attrs
  }

  getActiveDocAttributeValue(key: string) {
    return this.docAttributes[key]
  }

  isMarkActive(markName: string) {
    return this.activeMarks.some(mark => mark.type.name === markName)
  }

  getActiveAttributeValue(key: string) {
    const all = (this.activeAttributesByKey[key] ?? []).map(({value}) => value)
    const unique = new Set(all.filter(v => v))
    if(unique.size === 0) {
      return undefined
    }
    else if(unique.size === 1) {
      return [...unique][0]
    }
    else {
      return null
    }
  }

  hasActiveNode(type: string | NodeType, attrs?: Attrs, includeAncestors=false) {
    const {editorState: s} = this
    let matchFound = false
    this.activeNodes.filter(node => {
      const typeMatches = typeof type === "string"? node.type.name === type: node.type === type
      const attrsMatches = !attrs || Object.keys(attrs).every(k => attrs[k] === node.attrs[k])
      if(typeMatches && attrsMatches) {
        matchFound = true
      }
    })
    if(includeAncestors) {
      const resolvedPos = s.selection.$anchor
      const ancestors = range(0, resolvedPos.depth).map(i => resolvedPos.node(i))
    }
    return matchFound
  }

  get activeNodeMap() {
    return Object.fromEntries(this.activeNodes.map(n => [n.type.name, n]))
  }

  get activeMarkMap() {
    return Object.fromEntries(this.activeMarks.map(m => [m.type.name, m]))
  }

  getActiveComputedStyles(view: EditorView) {
    const {getComputedStyle} = view.dom.ownerDocument.defaultView!
    return this.activePos
      .map(pos => view.nodeDOM(pos) as Element)
      .map(element => getComputedStyle(element))
  }

  /** Return the text content of the first element, if any, limited to 50 characters. */
  get provisionalTitle() {
    return this.editorState.doc.firstChild?.textContent.slice(0, 50)
  }

}