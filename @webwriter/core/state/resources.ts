import { createAction, createSlice, PayloadAction } from "@reduxjs/toolkit"
import { Node, Schema } from "prosemirror-model"
import { EditorState, EditorStateConfig } from "prosemirror-state"

import { WWURL } from "../utility"
import { baseSchema, createEditorState, createSchemaSpec, defaultConfig } from "./editorstate"


export type Resource = {
  url: string
  editorState: EditorState
}

type ExplorableNode = Node

type State = typeof initialState
const initialState = {
  resources: {} as Record<Resource["url"], Resource>,
  resourcesOrder: [] as Array<Resource["url"]>,
  resourcesPendingChanges: {} as Record<Resource["url"], boolean>,
  resourcesPreviewing: {} as Record<Resource["url"], boolean>,
  activeResource: null as Resource["url"],
  importedPackages: [] as string[],
  schema: baseSchema
}

export function getNewResourceURL(resources: State["resources"]) {
  const memoryNumberIDs = Object.keys(resources)
    .map(url => new WWURL(url))
    .filter(url => url.protocol="memory")
    .map(url => parseInt(url.pathname))
    .filter(num => !Number.isNaN(num))
  return `memory:${Math.max(-1, ...memoryNumberIDs) + 1}`
}

export function createResource(url: Resource["url"], packages: string[] = []) {
  return {url, editorState: createEditorState({packages})} as Resource
}

export type ResourceAction = ReturnType<(typeof actions)[keyof typeof actions]>
export const actions = {
  create: createAction<undefined, "resources/create">("resources/create"),
  put: createAction<{resource: Resource}, "resources/put">("resources/put"),
  discard: createAction<{url: Resource["url"]}, "resources/discard">("resources/discard"),
  set: createAction<{url?: Resource["url"], editorState: EditorState}, "resources/set">("resources/set"),
  select: createAction<{url: Resource["url"]}, "resources/select">("resources/select"),
  selectNext: createAction<{backward: boolean}, "resources/selectNext">("resources/selectNext"),
  togglePreview: createAction<{url: string} | undefined, "resources/togglePreview">("resources/togglePreview"), 
  relocate: createAction<{url?: string, newURL: string}, "resources/relocate">("resources/relocate"),
  setImportedPackages: createAction<{importedPackages: string[]}, "resources/setImportedPackages">("resources/setImportedPackages")
}
export const reducer = (state: State = initialState, action: ResourceAction) => {
  switch(action.type) {
    
    case "resources/create": {
      const url = getNewResourceURL(state.resources)
      const newResource = createResource(url, state.importedPackages)
      return {
        ...state,
        resources: {
          ...state.resources,
          [url]: newResource
        },
        resourcesOrder: [...state.resourcesOrder, url],
        activeResource: url
      }
    }
    
    case "resources/put": {
      const resources = state.resources
      const url  = action.payload.resource.url ?? getNewResourceURL(resources)
      const isExistingURL = url in state.resources
      return {
        ...state,
        resources: {
          ...state.resources,
          [url]: {...action.payload.resource, url}
        },
        activeResource: url,
        resourcesOrder: !isExistingURL
          ? [...state.resourcesOrder, url]
          : state.resourcesOrder
      }
    }
    
    case "resources/discard": {
      const url  = action.payload.url ?? state.activeResource
      const i = state.resourcesOrder.indexOf(url)
      let resources = {...state.resources}
      delete resources[url]
      let resourcesPendingChanges = {...state.resourcesPendingChanges}
      delete resourcesPendingChanges[url]
      return {
        ...state,
        activeResource: url === state.activeResource
          ? state.resourcesOrder[i+1] ?? state.resourcesOrder[i-1]
          : state.activeResource,
        resourcesOrder: state.resourcesOrder.filter(u => u !== url),
        resources,
        resourcesPendingChanges
      }
    }

    case "resources/set": {
      const url = action.payload.url ?? state.activeResource
      const editorState = action.payload.editorState
      const prevEditorState = state.resources[state.activeResource].editorState

      let pendingChangesUpdate = {}

      if(!state.resourcesPendingChanges[url]) {
        pendingChangesUpdate = {
          resourcesPendingChanges: {
            ...state.resourcesPendingChanges,
            [url]: !editorState.doc.eq(prevEditorState.doc)
          }
        }
      }
      
      if(url.startsWith("memory:") && editorState.doc.childCount === 1 && editorState.doc.child(0).type.name === "paragraph" && !editorState.doc.child(0).childCount) {
        pendingChangesUpdate = {
          resourcesPendingChanges: {
            ...state.resourcesPendingChanges,
            [url]: false
          }
        }
      }

      return {
        ...state,
        resources: {
          ...state.resources,
          [url]: {url, editorState: action.payload.editorState}
        },
        ...pendingChangesUpdate
      }
    }

    case "resources/togglePreview": {
      const url = action?.payload?.url ?? state.activeResource
      return {
        ...state,
        resourcesPreviewing: {
          ...state.resourcesPreviewing,
          [url]: !state.resourcesPreviewing[url]
        }
      }
    }

    case "resources/relocate": {
      const url = action.payload.url ?? state.activeResource
      const newURL = action.payload.newURL

      const resourcesPendingChanges = {...state.resourcesPendingChanges}
      delete resourcesPendingChanges[url]
      resourcesPendingChanges[newURL] = false
      
      if(url === newURL) {
        return {...state, resourcesPendingChanges}
      }
      
      const activeResource =  url === state.activeResource? newURL: state.activeResource
      const resourcesOrder = [...state.resourcesOrder]
      resourcesOrder.splice(resourcesOrder.indexOf(url), 1, action.payload.newURL)
      const resources = {...state.resources}
      const editorState = resources[url].editorState
      delete resources[url]
      resources[action.payload.newURL] = {url: action.payload.newURL, editorState}
      
      return {...state, resources, activeResource, resourcesOrder, resourcesPendingChanges}
    }

    case "resources/select": {
      return {
        ...state,
        activeResource: action.payload.url
      }
    }

    case "resources/selectNext": {
      const url = state.activeResource
      const order = state.resourcesOrder
      return {
        ...state,
        activeResource: !action.payload.backward
          ? order[(order.indexOf(url) + 1) % order.length]
          : order[order.indexOf(url) === 0? order.length - 1: order.indexOf(url) - 1]
      }
    }

    case "resources/setImportedPackages": {
      const {importedPackages} = action.payload
      const schema = new Schema(createSchemaSpec(importedPackages))
      return {
        ...state,
        importedPackages,
        schema,
        resources: Object.fromEntries(Object.entries(state.resources)
          .map(([key, {url, editorState}]) => [
            key, 
            {url, editorState: createEditorState({baseConfig: editorState, schema})}
          ])
        )
      }
    }

    default: return state
  }
}

export const selectors = {
  getActiveResource: (state: State) => state.resources[state.activeResource]
}