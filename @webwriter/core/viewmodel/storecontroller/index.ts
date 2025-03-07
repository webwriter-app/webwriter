import {ReactiveController, ReactiveControllerHost} from "lit"
import { configure, makeAutoObservable, observe } from "mobx"
import {RootStore} from "#model"
import {signal, Signal, Computed, SignalWatcher, State, watch} from "@lit-labs/signals"

function makeAutoSignal<T extends object>(store: T, subStoreKeys: (keyof T)[]=[], onUpdate?: (signal: Signal.State<unknown> | Signal.Computed<unknown>) => void) {
  const allPropertyDescriptors = Object.getOwnPropertyDescriptors(store)
  const allMethodDescriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(store))

  for(const key of subStoreKeys) {
    (store as any)[key] = makeAutoSignal((store as any)[key], undefined, onUpdate)
  }

  const proxy = new Proxy(store, {
    get(target: any, prop: any) {
      /*
      if(prop in allMethodDescriptors && allMethodDescriptors[prop].get) {
        return allMethodDescriptors[prop].get.bind(proxy)
      }
      else if(prop in allMethodDescriptors && allMethodDescriptors[prop].set) {
        return allMethodDescriptors[prop].set.bind(proxy)
      }*/
      if(prop === "signal") {
        return <K extends keyof T>(key: K) => store[key]
      }
      else if(prop in allMethodDescriptors && !allMethodDescriptors[prop].get && !allMethodDescriptors[prop].set) {
        return allMethodDescriptors[prop].value.bind(proxy)
      }
      else if((target[prop] instanceof Signal.Computed || target[prop] instanceof Signal.State)) {
        return (target as any)[prop].get()
      }
      else {
        return (target as any)[prop]
      }
    },
    set(target, prop: any, newValue) {
      if(target[prop] instanceof Signal.State) {
        ((target as any)[prop] as ReturnType<typeof signal>).set(newValue)
        return true
      }
      else {
        target[prop] = newValue
        return true
      }
    }
  })

    // make properties into signals
    for(const [key, descriptor] of Object.entries(allPropertyDescriptors) as [keyof T, PropertyDescriptor][]) {
      if(!subStoreKeys.includes(key)) {
        const value = signal((store as any)[key])
        const watcher = onUpdate? new Signal.subtle.Watcher(async () => {
          await 0;
          onUpdate(value)
          watcher?.watch(value)
        }): undefined
        watcher && watcher.watch(value)
        Object.defineProperty(store, key, {value}) 
      }
    }
  
    // make getters into computeds
    
    for(const [key, descriptor] of Object.entries(allMethodDescriptors).filter(([_, desc]) => desc.get)) {
      // const value = new Signal.Computed(descriptor.get!.bind(proxy))
      Object.defineProperty(store, key, {get: descriptor.get?.bind(proxy), set: descriptor.set?.bind(proxy)})
    }

  return proxy as T & {signal: <K extends keyof T>(key: K) => T[K]}
}

export type StoreController = RootStore & {[P in (typeof RootStore.storeKeys)[number]]: RootStore[P] & {signal: <K extends keyof RootStore[P]>(key: K) => Signal.State<RootStore[P][K]>}} & ReactiveController
export function StoreController(store: RootStore, host: ReactiveControllerHost) {
	const signalStore = makeAutoSignal(store, RootStore.storeKeys as any, () => host.requestUpdate())
  Object.defineProperty(signalStore, "host", {value: host});
  Object.defineProperty(signalStore, "hostConnected", {value: () => {}});
	host.addController(store as StoreController)
  return signalStore as unknown as RootStore & {[P in (typeof RootStore.storeKeys)[number]]: RootStore[P] & {signal: <K extends keyof RootStore[P]>(key: K) => Signal.State<RootStore[P][K]>}} & ReactiveController
}