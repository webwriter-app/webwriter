import { configureStore, createListenerMiddleware, ListenerMiddlewareInstance } from "@reduxjs/toolkit"
import { ReactiveController, ReactiveControllerHost } from "lit"
import createSagaMiddleware from "redux-saga"
import type { IPackageJson } from "package-json-type"

import * as marshal from "../marshal"
import * as connect from "../connect"
import * as sagas from "./sagas"
import * as slices from "./slices"
import * as resources from "./resources"

export {bundle, npm, search} from "./sagas/bundle"
export type {Resource} from "./resources"

export type PackageJson = IPackageJson & {installed: boolean, outdated: boolean, root: string}
export type Format = keyof typeof marshal
export type Protocol = keyof typeof connect 

export function createStoreController(host: ReactiveControllerHost) {
  const sagaMiddleware = createSagaMiddleware()
  const listenerMiddleware = createListenerMiddleware()
  const store = configureStore({
    reducer: {
      resources: resources.reducer,
      packages: slices.packages.slice.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["saveResource_REQUESTED", "loadResource_REQUESTED", "resources/set", "resources/put"],
        ignoredPaths: ["resources"]
      },
      immutableCheck: {
        ignoredPaths: ["resources"]
      }
    })
    .concat(sagaMiddleware)
    .prepend(listenerMiddleware.middleware)
  })
  store["host"] = host
  store["listenerMiddleware"] = listenerMiddleware
  window["getState"] = store.getState
  listenerMiddleware.startListening({effect: (action) => /*console.log(action)*/null, predicate: () => true})
  store["hostConnected"] = () => {
    store.subscribe(() => store["host"].requestUpdate())
    Object.values(sagas).forEach(saga => sagaMiddleware.run(saga.rootSaga))
  }
  host.addController(store as ReactiveController)
  return store as typeof store & ReactiveController & {listenerMiddleware: ListenerMiddlewareInstance}
}

export const actions = {
  packages: slices.packages.slice.actions,
  resources: resources.actions,
  bundle: sagas.bundle.actions,
  persist: sagas.persist.actions
}

export const selectors = {
  packages: slices.packages.selectors,
  resources: resources.selectors
}
