import {Machine, MachineConfig, MachineOptions, ExtractEvent, EventObject, StateSchema} from "xstate"
import {assign} from '@xstate/immer'

import {Document} from "../model"
import * as marshal from "../marshal"
import * as connect from "../connect"

interface Context {
  documents: Record<Document["id"], Document>
  documentsOrder: Array<Document["id"]>
  activeDocument: Document["id"]
  pendingChanges: boolean
}


type Event = 
  | {type: "SELECT", id?: Context["activeDocument"]}
  | {type: "CREATE"}
  | {type: "UPDATE", id?: Context["activeDocument"], change: Partial<Omit<Document, "id">>}
  | {type: "ARRANGE", order: Context["documentsOrder"]}
  | {type: "DISCARD", id?: Context["activeDocument"]}
  | {type: "SAVE", id?: Context["activeDocument"], url: string, format: "plaintext"}
  | {type: "LOAD", url: string}
  | {type: "CANCEL"}

const config: MachineConfig<Context, StateSchema, Event> = {
  
  context: {
    documents: {},
    documentsOrder: [],
    activeDocument: null,
    pendingChanges: false
  },

  initial: "idle",
  
  states: {
    idle: {
      on: {
        SELECT: {actions: "select", cond: "isValidSelection"},
        CREATE: {actions: ["create", "select"]},
        UPDATE: {actions: "update"},
        ARRANGE: {actions: "arrange"},
        DISCARD: {target: "discarding"},
        SAVE: {target: "saving"},
        LOAD: {target: "loading"}
      }
    },
    discarding: {
      invoke: {
        src: "confirm",
        data: {pendingChanges: (ctx: Context) => ctx.pendingChanges},
        onDone: {
          target: "idle",
          actions: ["discard", "select"]
        }
      }
    },
    saving: {
      // TODO: if no/temp url, select location
      invoke: {
        src: "saveDocument"
      }
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
    const id = ev.id ?? ctx.activeDocument
    const protocol: keyof typeof connect = new URL(ev.url).protocol as any
    const serialize = marshal[ev.format].serialize
    const save = connect[protocol].save

    const data = serialize(ctx.documents[id])

    return save(data, ev.url)
  },
  
  loadDocument: async (ctx, ev: ExtractEvent<Event, "LOAD">) => {
    const protocol: keyof typeof connect = new URL(ev.url).protocol as any
    const load = connect[protocol].load
    const parse = marshal["plaintext"].parse

    const data = await load(ev.url)
    
    return parse(data)
  }
}


const guards: MachineOptions<Context, Event>["guards"] = {

  isValidSelection: (ctx, ev: Event & {id: Document["id"]}) => {
    return ctx.documentsOrder.includes(ev.id)
  },

  hasActiveDocument: ctx => ctx.activeDocument != null,
  
  noRemainingDocument: ctx => Object.keys(ctx.documents).length == 1,
  
  noPendingChanges: ctx => !ctx.pendingChanges

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
    ctx.documents[id] = undefined
    ctx.documentsOrder.splice(ctx.documentsOrder.indexOf(id), 1)
  }),
  
  create: assign(ctx => {
    const newDocument = new Document()
    ctx.documents[newDocument.id] = newDocument
    ctx.documentsOrder.push(newDocument.id)
  })


}


export const documentsMachine = Machine<Context, Event>(config, {services, guards, actions})