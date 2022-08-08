import {Machine, MachineConfig, MachineOptions, ExtractEvent, EventObject, StateSchema, createMachine} from "xstate"
import {assign} from '@xstate/immer'

import {Attributes, Block, Document, WWURL, WWURLString} from "webwriter-model"
import * as marshal from "../marshal"
import * as connect from "../connect"
import { DocumentEditor } from "../view/components"
import { MachineController } from "../utility"
import { ReactiveControllerHost } from "lit"

export type Format = keyof typeof marshal
export type Protocol = keyof typeof connect

const FILTERS = Object.entries(marshal).map(([k, v]) => ({name: v.label, extensions: v.extensions}))

interface Context {
  documents: Record<Document["id"], Document>
  documentsOrder: Array<Document["id"]>
  documentsPendingChanges: Record<Document["id"], boolean>
  activeDocument: Document["id"]
  lastLoadedDocument: Document["id"]
  defaultBlockType: string
  defaultFormat: Format
  defaultProtocol: Protocol
}

type Event = 
  | {type: "SELECT", id?: Context["activeDocument"]}
  | {type: "SELECT_NEXT", backward?: boolean}
  | {type: "CREATE"}
  | {type: "UPDATE", id?: Context["activeDocument"], change: Partial<Omit<Document, "id">>}
  | {type: "ARRANGE", order: Context["documentsOrder"]}
  | {type: "DISCARD", id?: Context["activeDocument"]}
  | {type: "SAVE", documentEditor: DocumentEditor, id?: Context["activeDocument"], url?: WWURLString}
  | {type: "LOAD", overwriteID?: Context["activeDocument"], url: WWURLString}
  | {type: "SET_ATTRIBUTE", id?: Context["activeDocument"], key: keyof Attributes, value: Attributes[keyof Attributes], i?: number}
  | {type: "APPEND_BLOCK", id?: Context["activeDocument"], block?: Block | string}
  | {type: "DELETE_BLOCK", id?: Context["activeDocument"], i: number}
  | {type: "UPDATE_BLOCK", id?: Context["activeDocument"], i: number,  attributes?: Block["attributes"], content?: Block["content"]}
  | {type: "CANCEL"}

class MarshalError extends Error {}
class ConnectError extends Error {}

const config: MachineConfig<Context, StateSchema, Event> = {

  id: "manager",

  predictableActionArguments: true,

  schema: {
    context: {} as Context,
    events: {} as Event,
  },
  
  context: {
    documents: {},
    documentsOrder: [],
    documentsPendingChanges: {},
    activeDocument: null,
    lastLoadedDocument: null,
    defaultBlockType: "ww-plaintext",
    defaultFormat: "html",
    defaultProtocol: "file"
  },

  initial: "idle",
  
  states: {
    idle: {
      on: {
        SELECT: {actions: "select", cond: "isValidSelection"},
        SELECT_NEXT: {actions: "selectNext"},
        CREATE: {actions: "create"},
        UPDATE: {actions: "update"},
        SET_ATTRIBUTE: {actions: "setAttribute"},
        ARRANGE: {actions: "arrange"},
        APPEND_BLOCK: {actions: "appendBlock"},
        DELETE_BLOCK: {actions: "deleteBlock"},
        UPDATE_BLOCK: {actions: "updateBlock"},
        DISCARD: {target: "discarding"},
        SAVE: {target: "saving", cond: "hasDocuments"},
        LOAD: {target: "loading"},
      }
    },
    discarding: {
      initial: "idle",
      states: {
        idle: {
          always: [
            {target: "confirming", cond: "hasPendingChanges"},
            {target: "#manager.idle", actions: "discard"}
          ]
        },
        confirming: {
          on: {
            DISCARD: {
              target: "idle",
              actions: "discard"
            }
          }
        },
      }
    },
    saving: {
      initial: "active",
      states: {
        configuring: {
          on: {
            SAVE: {target: "active"}
          }
        },
        active: {
          always: [
            {cond: "isNotProvidingWWURL", target: "configuring"}
          ],
          invoke: {
            src: "saveDocument",
            onError: "failure",
            onDone: "success"
          },
        },
        failure: {
          after: {
            100: "#manager.idle"
          }
        },
        success: {
          after: {
            100: "#manager.idle"
          }
        }
      },
    },
    loading: {
      initial: "idle",
      states: {
        idle: {
          always: "active"
        },
        active: {
          invoke: {
            src: "loadDocument",
            onError: "failure",
            onDone: "success"
          },
        },
        failure: {
          after: {
            100: "#manager.idle"
          }
        },
        success: {
          after: {
            100: "#manager.idle"
          }
        }
      }
    }
  },
  on: {
    CANCEL: "idle"
  }
}

const services: MachineOptions<Context, Event>["services"] = {

  saveDocument: async (ctx, ev: ExtractEvent<Event, "SAVE">) => {

    console.log(ev)

    const id = ev.id ?? ctx.activeDocument
    const urlString = ev.url ?? ctx.documents[id].url
    const url = new WWURL(urlString)

    const save = connect[url.protocol.slice(0, -1)].save
    console.log(url.wwformat)
    const serialize = marshal[url.wwformat].serialize
    const urlHasNoLocation = url.hash.includes("nolocation")

    let data: string
      data = await serialize(ev.documentEditor, ctx.documents[id])
      const {url: newUrl} = await save(data, urlHasNoLocation? undefined: url.href, FILTERS)
      ctx.documentsPendingChanges = {...ctx.documentsPendingChanges, [id]: false}
      ctx.documents[id].url = newUrl
  },
  
  loadDocument: async (ctx, ev: ExtractEvent<Event, "LOAD">) => {
    
    // if(!ev.url) {
    //   throw TypeError("No 'url' provided")
    // }

    const url = new WWURL(ev.url ?? "file://localhost/doc.html#nolocation")

    const load = connect[url.protocol.slice(0, -1)].load
    const parse = marshal[url.wwformat].parse
    const urlHasNoLocation = url.hash.includes("nolocation")

    let data: string
    let newUrl: string
    try {
      let loadResult = await load(urlHasNoLocation? undefined: url.href, FILTERS)
      if(loadResult === null) {
        return null
      }
      else {
        data = loadResult.data
        newUrl = loadResult.url
      }
      
    }
    catch(err) {
      console.log(err)
      throw AggregateError([new ConnectError("Error loading data"), err])
    }
    const documentWithSameUrlID = Object.values(ctx.documents).find(doc => doc.url === newUrl)?.id
    const overwriteID = ev.overwriteID ?? documentWithSameUrlID

    let doc: Document
    try {
      doc = await parse(data)
    }
    catch(err) {
      console.log(err)
      throw AggregateError([new MarshalError("Error parsing data"), err])
    }
    
    // Append to existing documents
    try {
      const id = overwriteID ?? Math.max(-1, ...Object.keys(ctx.documents).map(k => parseInt(k))) + 1
      doc.id = id
      doc.url = newUrl
      ctx.documents = {...ctx.documents, [id]: doc}
      ctx.documentsOrder = overwriteID == null? [...ctx.documentsOrder, id]: ctx.documentsOrder
      ctx.activeDocument = id
      ctx.lastLoadedDocument = id
      console.log(ctx.documents)
      console.log(ctx.documentsOrder)
    }
    catch(err) {
      console.error(err)
    }
  }
}


const guards: MachineOptions<Context, Event>["guards"] = {

  isValidSelection: (ctx, ev: Event & {id: Document["id"]}) => {
    return ctx.documentsOrder.includes(ev.id)
  },

  isProvidingWWURL: (ctx, ev: Event & {url: Document["url"]}, meta) => {
    try {
      new WWURL(ev.url ?? meta.state.event["url"])
      return true
    }
    catch(err) {
      return false
    }
  },

  isNotProvidingWWURL: (ctx, ev: Event & {url: Document["url"]}, meta) => !guards.isProvidingWWURL(ctx, ev, meta),

  // hasActiveDocument: ctx => ctx.activeDocument != null,

  hasDocuments: ctx => ctx.documentsOrder.length > 0,
  
  hasPendingChanges: ctx => ctx.documentsPendingChanges[ctx.activeDocument]

}

const actions: MachineOptions<Context, EventObject>["actions"] = {

  update: assign((ctx, ev: ExtractEvent<Event, "UPDATE">) => {
    const id  = ev.id ?? ctx.activeDocument
    ctx.documents[id] = {
      ...ctx.documents[id],
      ...ev.change
    }
    ctx.documentsPendingChanges = {...ctx.documentsPendingChanges, [id]: true}
  }),
  
  arrange: assign((ctx, ev: ExtractEvent<Event, "ARRANGE">) => {
    ctx.documentsOrder = ev.order
  }),
  
  select: assign((ctx, ev: ExtractEvent<Event, "SELECT">) => {
    const id = ev.id ?? ctx.documentsOrder[ctx.documentsOrder.length - 1]
    ctx.activeDocument = id
  }),

  selectNext: assign((ctx, ev: ExtractEvent<Event, "SELECT_NEXT">) => {
    const id = ctx.activeDocument
    const order = ctx.documentsOrder
    ctx.activeDocument = !ev.backward
      ? order[(order.indexOf(id) + 1) % order.length]
      : order[id === 0? order.length - 1: order.indexOf(id) - 1]
  }),

  discard: assign((ctx, ev: ExtractEvent<Event, "DISCARD">) => {
    const id  = ev.id ?? ctx.activeDocument
    const i = ctx.documentsOrder.indexOf(id)
    if(id === ctx.activeDocument) {
      ctx.activeDocument = ctx.documentsOrder[i+1] ?? ctx.documentsOrder[i-1]
    }
    delete ctx.documents[id]
    ctx.documentsOrder.splice(ctx.documentsOrder.indexOf(id), 1)
    delete ctx.documentsPendingChanges[id]
  }),
  
  create: assign(ctx => {
    const id = Math.max(-1, ...Object.keys(ctx.documents).map(k => parseInt(k))) + 1
    const newDocument = new Document(id)
    ctx.documents[newDocument.id] = newDocument
    ctx.documentsOrder.push(newDocument.id)
    ctx.activeDocument = newDocument.id
  }),

  setAttribute: assign((ctx, ev: ExtractEvent<Event, "SET_ATTRIBUTE">) => {
    const id = ev.id ?? ctx.activeDocument
    const attrs = ctx.documents[id].attributes
    if(ev.i == null) {
      attrs[ev.key] = ev.value
    }
    else {
      if(Array.isArray(attrs[ev.key]) && ev.i < attrs[ev.key].length) {
        attrs[ev.key][ev.i] = ev.value
      }
      else if(attrs[ev.key] != null) {
        attrs[ev.key] = [attrs[ev.key]]
        attrs[ev.key][ev.i] = ev.value
      }
      else if((attrs[ev.key] == null) && ev.i === 0) {
        attrs[ev.key] = [ev.value]
      }
      else {
        throw TypeError(`Invalid parameter i=${ev.i} when trying to add '${ev.value}' to ${attrs[ev.key]}`)
      }
    }
    ctx.documentsPendingChanges = {...ctx.documentsPendingChanges, [id]: true}
  }),

  appendBlock: assign((ctx, ev: ExtractEvent<Event, "APPEND_BLOCK">) => {
    const id = ev.id ?? ctx.activeDocument
    let block: Block
    if(ev.block) {
      block = typeof ev.block === "string"? new Block({type: ev.block}): ev.block 
    }
    else {
      block = new Block({type: ctx.defaultBlockType})
    }
    ctx.documents[id].content = [...ctx.documents[id].content, block]
    ctx.documentsPendingChanges = {...ctx.documentsPendingChanges, [id]: true}
  }),

  deleteBlock: assign((ctx, ev: ExtractEvent<Event, "DELETE_BLOCK">) => {
    const id = ev.id ?? ctx.activeDocument
    const doc = ctx.documents[id]
    doc.content.splice(ev.i, 1)
    doc.content = [...doc.content]
    ctx.documentsPendingChanges = {...ctx.documentsPendingChanges, [id]: true}
  }),

  updateBlock: assign((ctx, ev: ExtractEvent<Event, "UPDATE_BLOCK">) => {
    const id = ev.id ?? ctx.activeDocument
    const doc = ctx.documents[id]
    doc.content[ev.i] = {
      attributes: {...doc.content[ev.i].attributes, ...ev.attributes ?? {}},
      content: [...doc.content[ev.i].content ?? [], ...ev.content ?? []]
    }
    ctx.documentsPendingChanges = {...ctx.documentsPendingChanges, [id]: true}
  }),

}


export const documentsMachine = createMachine(config, {services, guards, actions})

export const createManagerController = (host: ReactiveControllerHost) => new MachineController(documentsMachine, host)