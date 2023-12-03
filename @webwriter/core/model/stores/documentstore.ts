import { EditorState, Plugin } from "prosemirror-state"
import { Schema, Node, NodeType, Attrs, DOMSerializer, DOMParser } from "prosemirror-model"
import { html_beautify as htmlBeautify } from "js-beautify"

import { createEditorState, EditorStateWithHead, Environment, getActiveMarks, Package, PackageStore } from ".."
import { filterObject, getFileExtension, groupBy, range } from "../../utility"
import * as marshal from "../marshal"
import * as connect from "../connect"
import { redoDepth, undoDepth } from "prosemirror-history"
import {undo as cmUndo, redo as cmRedo, undoDepth as cmUndoDepth, redoDepth as cmRedoDepth} from "@codemirror/commands"
import { EditorView } from "prosemirror-view"
import { serialize } from "../marshal/html"
import { EditorState as CmEditorState } from "@codemirror/state"
import { html as cmHTML } from "@codemirror/lang-html"
import { basicSetup } from "codemirror"

const BINARY_EXTENSIONS = Object.entries(marshal).flatMap(([k, v]) => v.isBinary? v.extensions: [])
const ALL_FILTER = {name: "Explorable", extensions: Object.values(marshal).flatMap(v => v.extensions)}
export const INDIVIDUAL_FILTERS = Object.entries(marshal).map(([k, v]) => ({name: v.label, extensions: v.extensions}))
const FILTERS = [ALL_FILTER, ...INDIVIDUAL_FILTERS]
export const CODEMIRROR_EXTENSIONS = [basicSetup, cmHTML()]

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

  static cdnUrlToPackage(url: string) {
    const id = this.cdnProviders.reduce((acc, x) => acc.replace(x, ""), url)
    return Package.fromID(id)
  }

  static cdnProviders = [
    "https://cdn.skypack.dev",
    "https://esm.run",
    "https://esm.sh",
    "https://ga.jspm.io"
  ] as const

  url: string
  editorState: EditorStateWithHead
  codeState: CmEditorState | null = null
  lastSavedState: EditorStateWithHead

  ioState: "idle" | "saving" | "loading" = "idle"

  bundle: Options["bundle"]

  constructor({bundle, schema, url, editorState}: Options) {
    this.bundle = bundle
    this.editorState = this.lastSavedState = editorState ?? createEditorState
    ({schema})
    this.url = url ?? "memory:0"
  }

  cdnProvider: (typeof DocumentStore.cdnProviders)[number]  = "https://esm.run"

  packageToCdnURL(pkg: Package) {
    return `${this.cdnProvider}/${pkg.name}@${pkg.version}`
  }

  get changed() {
    if(this.codeState) {
      const lengthChanged = this.lastSavedCodeState.doc.length !== this.codeState.doc.length
      return lengthChanged || !this.lastSavedCodeState.doc.eq(this.codeState.doc) || !this.lastSavedState.head$.doc.eq(this.editorState.head$.doc)
    }
    else {
      const lengthChanged = this.lastSavedState.doc.nodeSize !== this.editorState.doc.nodeSize
      const bodyChanged = !this.lastSavedState.doc.eq(this.editorState.doc)
      const headChanged = !this.lastSavedState.head$.doc.eq(this.editorState.head$.doc)
      if(lengthChanged || bodyChanged || headChanged ) {
        console.log(this.lastSavedState.toJSON())
        console.log(this.editorState.toJSON())
      }
      return lengthChanged || bodyChanged || headChanged 
    }
  }

  get lastSavedCodeState() {
    return DocumentStore.editorToCodeState(this.lastSavedState)
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
    return !this.codeState
      ? undoDepth(this.editorState)
      : cmUndoDepth(this.codeState)
  }

  get redoDepth() {
    return !this.codeState
      ? redoDepth(this.editorState)
      : cmRedoDepth(this.codeState)
  }

  
  /** Sets a new editor state for the given resource. */
  set(editorState: EditorStateWithHead) {
    console.trace("setting state", editorState)
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
      if(this.codeState) {
        this.deriveCodeState()
      }
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

  /** Return the text content of the first element, if any, limited to 50 characters and with trimmed whitespace. */
  get provisionalTitle() {
    let firstChildContent
    if(this.codeState) {
      const parser = new window.DOMParser()
      const doc = parser.parseFromString(this.codeState.doc.toString(), "text/html")
      firstChildContent = doc.body.children.item(0)?.textContent
    }
    else {
      firstChildContent = this.editorState.doc.firstChild?.textContent
    }
    return firstChildContent?.replaceAll(/\s+/g, " ").trim().slice(0, 50)
  }

  setCodeState(state: CmEditorState) {
    this.codeState = state
  }

  static editorToCodeState(state: EditorStateWithHead) {
    const serializer = DOMSerializer.fromSchema(state.schema)
    const dom = serializer.serializeNode(state.doc) as HTMLElement
    const html = htmlBeautify(dom.outerHTML, {indent_size: 2, wrap_attributes: "force-aligned", inline_custom_elements: false})
    return CmEditorState.create({doc: html, extensions: CODEMIRROR_EXTENSIONS})
  }

  static codeToEditorState(codeState: CmEditorState, editorState: EditorStateWithHead) {
    const {schema, plugins, head$} = editorState
    const value = codeState.doc.toString()
    const dom = new window.DOMParser().parseFromString(value, "text/html")
    const doc = DOMParser.fromSchema(editorState.schema).parse(dom)
    return createEditorState({schema, doc, plugins}, head$.doc)    
  }

  deriveEditorState() {
    this.editorState = this.codeState && this.undoDepth > 0
      ? DocumentStore.codeToEditorState(this.codeState, this.editorState)
      : this.editorState
    this.codeState = null
  }

  deriveCodeState() {
    this.codeState = DocumentStore.editorToCodeState(this.editorState)
  }

  private get imports() {
    let imports: Record<string, string> = {}
    this.editorState.head$.doc.descendants(node => {
      if(node.attrs.type === "importmap") {
        imports = JSON.parse(node.textContent).imports
      }
    })
    return imports
  }

  get packages() {
    return Object.fromEntries(Object.entries(this.imports)
      .filter(([k]) => k.startsWith("~webwriter-widget~"))
      .map(([k, v]) => [k, DocumentStore.cdnUrlToPackage(v)])
    )
  }

  set packages(pkgs: Record<string, Package>) {
    const imports = Object.fromEntries([
      ...Object.entries(this.imports).filter(([k]) => !k.startsWith("_webwriter-widget_")),
      ...Object.entries(pkgs).map(([name, pkg]) => [
        `_webwriter-widget_${name}`,
        this.packageToCdnURL(pkg)
      ])
    ])
    const text = JSON.stringify(imports)
    const headState = this.editorState.head$
    let existingPos: number, existingNode: Node | undefined
    headState.doc.descendants((node, pos, parent, index) => {
      if(node.attrs.type === "importmap") {
        existingPos = pos
        existingNode = node
        return false
      }
    })
    if(existingPos! !== undefined && existingNode !== undefined) {
      let node = headState.schema.node(
        "script",
        {...(existingNode as any), type: "importmap"},
        headState.schema.text(text)
      )
      const resolved = headState.doc.resolve(existingPos)
      const tr = headState.tr.replaceWith(resolved.pos, resolved.pos + existingNode.nodeSize, node)
      this.setHead(headState.apply(tr))
    }
    else {
      let node = headState.schema.node("script", {type: "importmap"}, headState.schema.text(text))
      const lastPos = headState.doc.nodeSize - 2
      const tr = headState.tr.insert(lastPos, node)
      this.setHead(headState.apply(tr))
    }
  }

  addPackage(pkg: Package) {
    this.packages = {...this.packages, [pkg.name]: pkg}
  }

}