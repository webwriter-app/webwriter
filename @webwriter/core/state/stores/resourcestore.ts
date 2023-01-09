import { EditorState } from "prosemirror-state"

import { getFileExtension } from "../../utility"
import { createEditorState } from "../editorstate"
import { Schema } from "prosemirror-model"
import * as marshal from "../../marshal"
import * as connect from "../../connect"
import { Environment } from "../../environment"

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
  private _active = null as Resource["url"]
  order = [] as Array<Resource["url"]>
  schema: Schema
  previewing: Record<Resource["url"], boolean> = {}
  lastSavedState: Record<Resource["url"], EditorState> = {}

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
        !lastState.doc.eq(this._resources[url].editorState.doc)
      ])
    return Object.fromEntries(entries)
  }

  /** Sets resources and their order. */
  set resources(value: Resource[]) {
    console.log(value)
    this._resources = Object.fromEntries(value.map(x => [x.url, x]))
    this.order = value.map(x => x.url)
  }

  /** The currently active resource. */
  get active() {
    return this._resources[this._active]
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

  /** Sets a new editor state for the given resource. */
  set(url: Resource["url"] = this._active, editorState: EditorState) {
    this._resources = {...this._resources, [url]: {url, editorState}}
  }

  /** Remove a resource from the list of resources. */
  discard(url: Resource["url"] = this._active) {
    this.activateNext(url, true)
    delete this._resources[url]
    delete this.previewing[url]
    delete this.changed[url]
    delete this.lastSavedState[url]
    this.order = this.order.filter(x => x !== url)
  }

  /** Toggles the preview flag for the given resource. */
  togglePreview(url: Resource["url"] = this._active) {
    this.previewing = {...this.previewing, [url]: !this.previewing[url]}
  }

  /** Assigns the resource to a new URL, for example when saving. */
  relocate(url: Resource["url"] = this._active, newURL: Resource["url"]) {
    if(url === newURL) {return}
    this.order.splice(this.order.indexOf(url), 1, newURL)
    const editorState = this._resources[url].editorState
    delete this.resources[url]
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
  activateNext(url: Resource["url"] = this._active, backward=false) {
    const order = this.order
    const i = order.indexOf(url)
    const n = order.length
    this._active = backward? order[(i + 1) % n]: order[i === 0? n - 1: i - 1]
  }

  /** Saves a resource on an external file system. */
  async save(url: Resource["url"] = this._active, saveAs=false) {
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
    const save = connect[protocol].save
    const serialize = marshal[format].serialize
    const isBinary = marshal[format].isBinary
  
    let data = await serialize(resource.editorState.doc, this.bundle)
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
    const load = connect[protocol].load
    const parse = marshal[format].parse
    
    let data = await load(urlObj.href, BINARY_EXTENSIONS)
    let editorState = await parse(data, this.schema)
    const resource: Resource = {url: urlObj.href, editorState}
    this._resources[resource.url] = resource
    this.order = [...this.order, resource.url]
    this._active = resource.url
    this.lastSavedState = {...this.lastSavedState, [resource.url]: resource.editorState}
  }

}