import {Machine, MachineConfig, MachineOptions, ExtractEvent, EventObject, StateSchema, createMachine} from "xstate"
import {assign} from '@xstate/immer'

import {Block, Document} from "../model"
import * as marshal from "../marshal"
import * as connect from "../connect"
import { WWURL, WWURLString } from "../utility"
import { DocumentEditor } from "../view"

export type Format = keyof typeof marshal
export type Protocol = keyof typeof connect

interface Context {
  documents: Record<Document["id"], Document>
  documentsOrder: Array<Document["id"]>
  activeDocument: Document["id"]
  pendingChanges: boolean
  defaultBlockType: string
  defaultFormat: Format
  defaultProtocol: Protocol
}

type Event = 
  | {type: "SELECT", id?: Context["activeDocument"]}
  | {type: "CREATE"}
  | {type: "UPDATE", id?: Context["activeDocument"], change: Partial<Omit<Document, "id">>}
  | {type: "ARRANGE", order: Context["documentsOrder"]}
  | {type: "DISCARD", id?: Context["activeDocument"]}
  | {type: "SAVE", documentEditor: DocumentEditor, id?: Context["activeDocument"], url?: WWURLString}
  | {type: "LOAD", overwriteID?: Context["activeDocument"], url: WWURLString}
  | {type: "RELABEL", id?: Context["activeDocument"], label: string}
  | {type: "APPEND_BLOCK", id?: Context["activeDocument"], block?: Block | string}
  | {type: "DELETE_BLOCK", id?: Context["activeDocument"], i: number}
  | {type: "CANCEL"}

class MarshalError extends Error {}
class ConnectError extends Error {}

const config: MachineConfig<Context, StateSchema, Event> = {

  schema: {
    context: {} as Context,
    events: {} as Event,
  },
  
  context: {
    documents: {},
    documentsOrder: [],
    activeDocument: null,
    pendingChanges: false,
    defaultBlockType: "plaintext",
    defaultFormat: "html",
    defaultProtocol: "file"
  },

  initial: "idle",
  
  states: {
    idle: {
      on: {
        SELECT: {actions: "select", cond: "isValidSelection"},
        CREATE: {actions: "create"},
        UPDATE: {actions: "update"},
        RELABEL: {actions: "relabel"},
        ARRANGE: {actions: "arrange"},
        APPEND_BLOCK: {actions: "appendBlock"},
        DELETE_BLOCK: {actions: "deleteBlock"},
        DISCARD: {target: "discarding"},
        SAVE: {target: "saving", cond: "hasDocuments"},
        LOAD: {target: "loading", cond: "hasDocuments"},
      }
    },
    discarding: {
      invoke: {
        src: "confirm",
        data: {pendingChanges: (ctx: Context) => ctx.pendingChanges},
        onDone: {
          target: "idle",
          actions: "discard"
        }
      }
    },
    saving: {
      initial: "idle",
      states: {
        idle: {
          always: [
            {cond: "isProvidingWWURL", target: "active"},
            {target: "configuring"}
          ]
        },
        configuring: {
          on: {
            SAVE: {target: "active"}
          }
        },
        active: {
          invoke: {
            src: "saveDocument"
          }
        },
      },
    },
    loading: {
      // TODO: if no/temp url select location
      invoke: {
        src: "loadDocument",
        onDone: "idle"
      }
    }
  },
  on: {
    CANCEL: "idle"
  }
}

const services: MachineOptions<Context, Event>["services"] = {

  confirm: Machine<Context, {type: "CONFIRM"}>({
    initial: "initial",
    states: {
      initial: {
        always: [
          {target: "done"},
          "confirming"
        ]
      },
      confirming: {
        on: {CONFIRM: "done"}
      },
      done: {
        type: "final"
      },
    }
  }),

  saveDocument: async (ctx, ev: ExtractEvent<Event, "SAVE">) => {

    console.log(ev)

    const id = ev.id ?? ctx.activeDocument
    if(!ev.url) {
      throw TypeError("No 'url' provided")
    }

    const url = new WWURL(ev.url)

    const save = connect[url.protocol.slice(0, -1)].save
    const serialize = marshal[url.wwformat].serialize
    const urlHasNoLocation = url.hash.includes("nolocation")

    let data: string
      data = serialize(ev.documentEditor, ctx.documents[id])

    try {
      return save(data, urlHasNoLocation? undefined: url.href)
    }
    catch(err) {
      throw AggregateError([new ConnectError("Error saving data"), err])
    }
  },
  
  loadDocument: async (ctx, ev: ExtractEvent<Event, "LOAD">) => {
    
    if(!ev.url) {
      throw TypeError("No 'url' provided")
    }

    const url = new WWURL(ev.url)

    const load = connect[url.protocol.slice(0, -1)].load
    const parse = marshal[url.wwformat].parse
    const urlHasNoLocation = url.hash.includes("nolocation")

    let data: string
    try {
      data = await load(urlHasNoLocation? undefined: url.href)
    }
    catch(err) {
      throw AggregateError([new ConnectError("Error loading data"), err])
    }

    let doc: Document
    try {
      doc = await parse(data)
    }
    catch(err) {
      throw AggregateError([new MarshalError("Error parsing data"), err])
    }
    
    if(ev.overwriteID) {
      ctx.documents[ev.overwriteID] = doc
      doc.id = ev.overwriteID
    }
    else {
      // Append to existing documents
    }
  }
}


const guards: MachineOptions<Context, Event>["guards"] = {

  isValidSelection: (ctx, ev: Event & {id: Document["id"]}) => {
    return ctx.documentsOrder.includes(ev.id)
  },

  isProvidingWWURL: (ctx, ev: Event & {url: Document["url"]}) => {
    try {
      new WWURL(ev.url)
      return true
    }
    catch(err) {
      return false
    }
  },

  // hasActiveDocument: ctx => ctx.activeDocument != null,

  hasDocuments: ctx => ctx.documentsOrder.length > 0,
  
  // noPendingChanges: ctx => !ctx.pendingChanges

}

const actions: MachineOptions<Context, EventObject>["actions"] = {

  update: assign((ctx, ev: ExtractEvent<Event, "UPDATE">) => {
    const id  = ev.id ?? ctx.activeDocument
    ctx.documents[id] = {
      ...ctx.documents[id],
      ...ev.change
    }
  }),
  
  arrange: assign((ctx, ev: ExtractEvent<Event, "ARRANGE">) => {
    ctx.documentsOrder = ev.order
  }),
  
  select: assign((ctx, ev: ExtractEvent<Event, "SELECT">) => {
    const id = ev.id ?? ctx.documentsOrder[ctx.documentsOrder.length - 1]
    ctx.activeDocument = id
  }),

  discard: assign((ctx, ev: ExtractEvent<Event, "DISCARD">) => {
    const id  = ev.id ?? ctx.activeDocument
    const i = ctx.documentsOrder.indexOf(id)
    if(id === ctx.activeDocument) {
      ctx.activeDocument = ctx.documentsOrder[i+1] ?? ctx.documentsOrder[i-1]
    }
    ctx.documents[id] = undefined
    ctx.documentsOrder.splice(ctx.documentsOrder.indexOf(id), 1)
  }),
  
  create: assign(ctx => {
    const id = Math.max(-1, ...Object.keys(ctx.documents).map(k => parseInt(k))) + 1
    const newDocument = new Document(id)
    ctx.documents[newDocument.id] = newDocument
    ctx.documentsOrder.unshift(newDocument.id)
    ctx.activeDocument = newDocument.id
  }),

  relabel: assign((ctx, ev: ExtractEvent<Event, "RELABEL">) => {
    const id = ev.id ?? ctx.activeDocument
    ctx.documents[id].attributes.label = ev.label
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
  }),

  deleteBlock: assign((ctx, ev: ExtractEvent<Event, "DELETE_BLOCK">) => {
    const id = ev.id ?? ctx.activeDocument
    const doc = ctx.documents[id]
    doc.content.splice(ev.i, 1)
    doc.content = [...doc.content]
  }),

}


export const documentsMachine = createMachine(config, {services, guards, actions})