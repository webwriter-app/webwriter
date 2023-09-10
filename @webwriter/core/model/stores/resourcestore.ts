import { EditorState, Transaction } from "prosemirror-state"
import { Schema, Mark, Node, NodeType, Attrs } from "prosemirror-model"

import { createEditorState, Environment, themes } from ".."
import { getFileExtension, groupBy, range } from "../../utility"
import * as marshal from "../marshal"
import * as connect from "../connect"
import { redoDepth, undoDepth } from "prosemirror-history"
import { EditorView } from "prosemirror-view"
import { toJS } from "mobx"

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
export class ResourceStore {

  private _resources = {} as Record<Resource["url"], Resource>
  private _active = null as Resource["url"] | null
  order = [] as Array<Resource["url"]>
  schema: Schema
  previewing: Record<Resource["url"], boolean> = {}
  lastSavedState: Record<Resource["url"], EditorState> = {}

  themes = themes

  bundle: Options["bundle"]

  constructor(options: Options) {
    Object.assign(this, options)
  }

  /** All resources, ordered. */
  get resources() {
    return this.order.map(url => this._resources[url])
  }

  get empty() {
    return Object.keys(this._resources).length === 0
  }

  get changed() {
    const entries = Object.entries(this.lastSavedState)
      .filter(([url]) => this._resources[url])
      .map(([url, lastState]) => [
        url,
        !lastState.doc.eq(this._resources[url].editorState.doc) || !(lastState as any).head$.doc.eq((this._resources[url].editorState as any).head$.doc)
      ])
    return Object.fromEntries(entries)
  }

  /** Sets resources and their order. */
  set resources(value: Resource[]) {
    this._resources = Object.fromEntries(value.map(x => [x.url, x]))
    this.order = value.map(x => x.url)
  }

  /** The currently active resource. */
  get active() {
    return this._active? this._resources[this._active]: null
  }

  /** Update all document schemas with the store's schema. */
  updateSchemas() {
    this.resources = this.resources.map(({url, editorState}) => ({
      url,
      editorState: createEditorState({...editorState, schema: this.schema})
    }))
  }

  /** Gets a new, unused resource URL. */
  getNewURL() {
    const memoryNumberIDs = Object.keys(this._resources)
      .map(url => new URL(url))
      .filter(url => url.protocol="memory")
      .map(url => parseInt(url.pathname))
      .filter(num => !Number.isNaN(num))
    return `memory:${Math.max(-1, ...memoryNumberIDs) + 1}`
  }

  /** Creates a new resource. */
  create(url: Resource["url"] = this.getNewURL(), schema: Schema = this.schema) {
    const editorState = createEditorState({schema})
    const resource = {url, editorState} as Resource
    this._resources[url] = resource
    this.order = [...this.order, url]
    this._active = url
    this.lastSavedState = {...this.lastSavedState, [url]: editorState}
    return resource
  }

  getUndoDepth(url = this._active) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    return undoDepth(this._resources[url].editorState)
  }

  getRedoDepth(url = this._active) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    return redoDepth(this._resources[url].editorState)
  }

  /** Sets a new editor state for the given resource. */
  set(url = this._active, editorState: EditorState) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    this._resources = {...this._resources, [url]: {url, editorState}}
  }

  /** Sets a new editor state for the given resource. */
  setHead(url = this._active, head$: EditorState) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    const state = this._resources[url].editorState.apply(this._resources[url].editorState.tr)
    this.set(url, Object.assign(state, {head$}))
  }

  /** Remove a resource from the list of resources. */
  discard(url = this._active) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    this.activateNext(url, true)
    delete this._resources[url]
    delete this.previewing[url]
    delete this.changed[url]
    delete this.lastSavedState[url]
    this.order = this.order.filter(x => x !== url)
  }

  /** Toggles the preview flag for the given resource. */
  togglePreview(url = this._active) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    this.previewing = {...this.previewing, [url]: !this.previewing[url]}
  }

  /** Assigns the resource to a new URL, for example when saving. */
  relocate(url = this._active, newURL: Resource["url"]) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    if(url === newURL) {return}
    this.order.splice(this.order.indexOf(url), 1, newURL)
    const editorState = this._resources[url].editorState
    delete this._resources[url]
    this._resources = {...this._resources, [newURL]: {url: newURL, editorState}}
    this.lastSavedState = {...this.lastSavedState, [newURL]: this.lastSavedState[url]}
    delete this.lastSavedState[url]
    this._active = this._active === url? newURL: this._active
  }

  /** Set the given resource to be active. */
  activate(url: Resource["url"]) {
    this._active = url
  }

  /** Activates the next (or previous) resource in order. */
  activateNext(url = this._active, backward=false) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    const order = this.order
    const i = order.indexOf(url)
    const n = order.length
    this._active = backward? order[(i + 1) % n]: order[i === 0? n - 1: i - 1]
  }

  /** Saves a resource on an external file system. */
  async save(url = this._active, saveAs=false) {
    if(!url) {
      throw new TypeError("Needs a 'url' since no url is active")
    }
    const resource = this._resources[url]
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
    let data = await serialize(resource.editorState.doc, (resource.editorState as any).head$.doc, this.bundle)
    await save(data, urlObj.href, isBinary)
    this.relocate(url, urlObj.href)
    this.lastSavedState = {...this.lastSavedState, [urlObj.href]: resource.editorState}
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
    const resource: Resource = {url: urlObj.href, editorState}
    this._resources[resource.url] = resource
    this.order = [...this.order, resource.url]
    this._active = resource.url
    this.lastSavedState = {...this.lastSavedState, [resource.url]: resource.editorState}
  }

  get activeMarks() {
    const {editorState: s} = this.active!
    const stored = s.storedMarks ?? []
    const marks = new Set(stored)
    s.doc.nodesBetween(s.selection.from, s.selection.to, (node, pos, parent, index) => {
      node.marks.forEach(mark => marks.add(mark))
    })
    return Array.from(marks)
  }

  get activeNodes() {
    const {editorState: s} = this.active!
    const nodes = [] as Node[]
    s.doc.nodesBetween(s.selection.from, s.selection.to, node => {
      nodes.push(node)
    })
    return nodes
  }

  get activePos() {
    const {editorState: s} = this.active!
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
    return this.activeNodes.filter(node => node.type.name)
  }

  get docAttributes() {
    const {editorState: s} = this.active!
    return s.doc.attrs
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
    const {editorState: s} = this.active!
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

  getActiveComputedStyles(view: EditorView) {
    const {getComputedStyle} = view.dom.ownerDocument.defaultView!
    return this.activePos
      .map(pos => view.nodeDOM(pos) as Element)
      .map(element => getComputedStyle(element))
  }

}